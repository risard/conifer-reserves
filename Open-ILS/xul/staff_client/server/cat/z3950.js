dump('entering cat.z3950.js\n');

if (typeof cat == 'undefined') cat = {};
cat.z3950 = function (params) {
	try {
		netscape.security.PrivilegeManager.enablePrivilege("UniversalXPConnect");
		JSAN.use('util.error'); this.error = new util.error();
		JSAN.use('util.network'); this.network = new util.network();
	} catch(E) {
		dump('cat.z3950: ' + E + '\n');
	}
}

cat.z3950.prototype = {

	'creds_version' : 1,

	'init' : function( params ) {

		try {
			netscape.security.PrivilegeManager.enablePrivilege("UniversalXPConnect");
			JSAN.use('util.widgets');

			var obj = this;

			obj.load_creds();

			JSAN.use('circ.util');
			var columns = circ.util.columns(
				{
					'tcn' : { 'hidden' : false },
					'isbn' : { 'hidden' : false },
					'title' : { 'hidden' : false, 'flex' : '1' },
					'author' : { 'hidden' : false },
					'edition' : { 'hidden' : false },
					'pubdate' : { 'hidden' : false },
					'publisher' : { 'hidden' : false },
				}
			);

			JSAN.use('util.list'); obj.list = new util.list('results');
			obj.list.init(
				{
					'columns' : columns,
					'map_row_to_columns' : circ.util.std_map_row_to_columns(),
					'on_select' : function(ev) {
						try {
							JSAN.use('util.functional');
							var sel = obj.list.retrieve_selection();
							document.getElementById('clip_button').disabled = sel.length < 1;
							var list = util.functional.map_list(
								sel,
								function(o) { return o.getAttribute('retrieve_id'); }
							);
							obj.error.sdump('D_TRACE','cat/z3950: selection list = ' + js2JSON(list) );
							obj.controller.view.marc_import.disabled = false;
							obj.controller.view.marc_import.setAttribute('retrieve_id',list[0]);
							obj.controller.view.marc_import_overlay.disabled = false;
							obj.controller.view.marc_import_overlay.setAttribute('retrieve_id',list[0]);
							obj.controller.view.marc_view.disabled = false;
							obj.controller.view.marc_view.setAttribute('retrieve_id',list[0]);
						} catch(E) {
							obj.error.standard_unexpected_error_alert('Failure during list construction.',E);
						}
					},
				}
			);

			JSAN.use('util.controller'); obj.controller = new util.controller();
			obj.controller.init(
				{
					control_map : {
						'save_columns' : [ [ 'command' ], function() { obj.list.save_columns(); } ],
						'sel_clip' : [
							['command'],
							function() { obj.list.clipboard(); }
						],
						'cmd_export' : [
							['command'],
							function() {
								obj.list.on_all_fleshed = function() {
									try {
										dump(obj.list.dump_csv() + '\n');
										copy_to_clipboard(obj.list.dump_csv());
										setTimeout(function(){obj.list.on_all_fleshed = null;},0);
									} catch(E) {
										alert(E); 
									}
								}
								obj.list.full_retrieve();
							}
						],
						'cmd_broken' : [
							['command'],
							function() { alert('Not Yet Implemented'); }
						],
						'result_message' : [['render'],function(e){return function(){};}],
						'clear' : [
							['command'],
							function() {
								obj.clear();
							}
						],
						'save_creds' : [
							['command'],
							function() {
								obj.save_creds();
							}
						],
						'marc_view' : [
							['command'],
							function(ev) {
								try {
									var n = obj.controller.view.marc_view;
									if (n.getAttribute('toggle') == '1') {
										document.getElementById('deck').selectedIndex = 0;
										n.setAttribute('toggle','0');
										n.setAttribute('label','MARC View');
										document.getElementById('results').focus();
									} else {
										document.getElementById('deck').selectedIndex = 1;
										n.setAttribute('toggle','1');
										n.setAttribute('label','Results View');
										netscape.security.PrivilegeManager.enablePrivilege('UniversalXPConnect');
										var f = document.getElementById('marc_frame').contentWindow;
										f.xulG = { 'marcxml' : obj.results.records[ n.getAttribute('retrieve_id') ].marcxml };
										f.my_init();
										f.document.body.firstChild.focus();
									}
								} catch(E) {
									alert(E);
								}
							},
						],
						'marc_import' : [
							['command'],
							function() {
								obj.spawn_marc_editor(
									obj.results.records[
										obj.controller.view.marc_import.getAttribute('retrieve_id')
									].marcxml
								);
							},
						],
						'marc_import_overlay' : [ 
							['command'],
							function() {
								try {
								obj.spawn_marc_editor_for_overlay(
									obj.results.records[
										obj.controller.view.marc_import_overlay.getAttribute('retrieve_id')
									].marcxml
								);
								} catch(E) {
									alert(E);
								}
							},
						],
						'search' : [
							['command'],
							function() {
								obj.initial_search();
							},
						],
						'page_next' : [
							['command'],
							function() {
								obj.page_next();
							},
						],
						'raw_search' : [
							['command'],
							function() {
								var raw = window.prompt('WARNING: This is not a simple keyword search.  Enter raw z39.50 PQN search string: ','','Raw Z39.50 PQN Search');
								if (raw) obj.initial_raw_search(raw);
							},
						],
						'menu_placeholder' : [
							['render'],
							function(e) {
								return function() {
									try {

										function handle_switch(node) {
											var service = obj.controller.view.service_menu.value;
											obj.current_service = service;
											var nl = document.getElementsByAttribute('mytype','search_class');
											for (var i = 0; i < nl.length; i++) { nl[i].disabled = true; }
											for (var i in obj.services[service].attrs) {
												var x = document.getElementById(i + '_input');
												if (x) {
													x.disabled = false;
												} else {
													var rows = document.getElementById('query_inputs');
													var row = document.createElement('row'); rows.appendChild(row);
													var label = document.createElement('label');
													label.setAttribute('control',i+'_input');
													label.setAttribute('search_class',i);
													label.setAttribute('style','-moz-user-focus: ignore');
													if (entities['staff.z39_50.search_class.'+i]) {
														label.setAttribute('value',entities['staff.z39_50.search_class.'+i]);
													} else {
														label.setAttribute('value',i);
													}
													row.appendChild(label);
													label.addEventListener('click',function(ev){
															var a = ev.target.getAttribute('search_class');
															if (a) obj.default_attr = a;
														},false
													);
													var tb = document.createElement('textbox');
													tb.setAttribute('id',i+'_input');
													tb.setAttribute('mytype','search_class');
													tb.setAttribute('search_class',i);
													row.appendChild(tb);
													tb.addEventListener('keypress',obj.handle_enter,false);
												}
											}
											if (obj.creds.services[ service ]) {
												document.getElementById('username').setAttribute('value',
													obj.creds.services[service].username
												);
												document.getElementById('password').setAttribute('value',
													obj.creds.services[service].password
												);
												try { g.service = service; } catch(E) {}
												obj.focus(service);
											} else {
												document.getElementById('username').focus();
											}
										}

										var robj = obj.network.simple_request(
											'RETRIEVE_Z3950_SERVICES',
											[ ses() ]
										);
										if (typeof robj.ilsevent != 'undefined') throw(robj);
										obj.services = robj;
										var list = [];
										for (var i in robj) {
											list.push(
												[
													i + ' : ' + robj[i].db + '@' + robj[i].host + ':' + robj[i].port,
													i
												]
											);
										}
										util.widgets.remove_children(e);
										var ml = util.widgets.make_menulist( list );
										ml.setAttribute('flex','1');
										e.appendChild(ml);
										ml.addEventListener(
											'command',
											function(ev) { handle_switch(ev.target); },
											false
										);
										obj.controller.view.service_menu = ml;
										setTimeout(
											function() { 
												if (obj.creds.default_service) ml.value = obj.creds.default_service;
												handle_switch(ml); 
											},0
										);
									} catch(E) {
										alert(E);
										obj.error.standard_unexpected_error_alert('Z39.50 services not likely retrieved.',E);
									}
								}
							}
						],
					}
				}
			);

			obj.controller.render();

			obj.controller.view.username = document.getElementById('username');
			obj.controller.view.password = document.getElementById('password');

		} catch(E) {
			this.error.sdump('D_ERROR','cat.z3950.init: ' + E + '\n');
		}
	},

	'focus' : function(service) {
		var obj = this;
		var x = obj.creds.services[service].default_attr;
		if (x) {
			document.getElementById(x+'_input').focus();
		} else {
			var y;
			for (var i in obj.services[service].attr) { y = i; }
			document.getElementById(y+'_input').focus();
		}
	},

	'clear' : function() {
		var obj = this;
		var nl = document.getElementsByAttribute('mytype','search_class');
		for (var i = 0; i < nl.length; i++) { nl[i].value = ''; nl[i].setAttribute('value',''); }
		obj.focus(obj.controller.view.service_menu.value);
	},

	'search_params' : {},

	'initial_search' : function() {
		try {
			var obj = this;
			JSAN.use('util.widgets');
			util.widgets.remove_children( obj.controller.view.result_message );
			var x = document.createElement('description'); obj.controller.view.result_message.appendChild(x);
			x.appendChild( document.createTextNode( 'Searching...' ));
			obj.search_params = {}; obj.list.clear();
			obj.controller.view.page_next.disabled = true;

			obj.search_params.service = obj.controller.view.service_menu.value;
			obj.search_params.username = obj.controller.view.username.value;
			obj.search_params.password = obj.controller.view.password.value;
			obj.search_params.limit = 10;
			obj.search_params.offset = 0;

			obj.search_params.search = {};
			var nl = document.getElementsByAttribute('mytype','search_class');
			var count = 0;
			for (var i = 0; i < nl.length; i++) {
				if (nl[i].disabled) continue;
				if (nl[i].value == '') continue;
				count++;
				obj.search_params.search[ nl[i].getAttribute('search_class') ] = nl[i].value;
			}
			if (count>0) {
				obj.search();
			} else {
				util.widgets.remove_children( obj.controller.view.result_message );
			}
		} catch(E) {
			this.error.standard_unexpected_error_alert('Failure during initial search.',E);
		}
	},

	'initial_raw_search' : function(raw) {
		try {
			var obj = this;
			JSAN.use('util.widgets');
			util.widgets.remove_children( obj.controller.view.result_message );
			var x = document.createElement('description'); obj.controller.view.result_message.appendChild(x);
			x.appendChild( document.createTextNode( 'Searching...' ) );
			obj.search_params = {}; obj.result_count = 0; obj.list.clear();
			obj.controller.view.page_next.disabled = true;

			obj.search_params.service = obj.controller.view.service_menu.value;
			obj.search_params.username = obj.controller.view.username.value;
			obj.search_params.password = obj.controller.view.password.value;
			obj.search_params.limit = 10;
			obj.search_params.offset = 0;

			obj.search_params.query = raw;

			obj.search();
		} catch(E) {
			this.error.standard_unexpected_error_alert('Failure during initial raw search.',E);
		}
	},

	'page_next' : function() {
		try {
			var obj = this;
			JSAN.use('util.widgets');
			util.widgets.remove_children( obj.controller.view.result_message );
			var x = document.createElement('description'); obj.controller.view.result_message.appendChild(x);
			x.appendChild( document.createTextNode( 'Retrieving more results...' ));
			obj.search_params.offset += obj.search_params.limit;
			obj.search();
		} catch(E) {
			this.error.standard_unexpected_error_alert('Failure during subsequent search.',E);
		}
	},

	'search' : function() {
		try {
			var obj = this;
			var method;
			if (typeof obj.search_params.query == 'undefined') {
				method = 'FM_BLOB_RETRIEVE_VIA_Z3950_SEARCH';
			} else {
				method = 'FM_BLOB_RETRIEVE_VIA_Z3950_RAW_SEARCH';
			}
			obj.network.simple_request(
				method,
				[ ses(), obj.search_params ],
				function(req) {
					obj.handle_results(req.getResultObject())
				}
			);
			document.getElementById('deck').selectedIndex = 0;
		} catch(E) {
			this.error.standard_unexpected_error_alert('Failure during actual search.',E);
		}
	},

	'handle_results' : function(results) {
		var obj = this;
		try {
			JSAN.use('util.widgets');
			util.widgets.remove_children( obj.controller.view.result_message ); var x;
			if (results == null) {
				x = document.createElement('description'); obj.controller.view.result_message.appendChild(x);
				x.appendChild( document.createTextNode( 'Server Error: request returned null' ));
				return;
			}
			if (typeof results.ilsevent != 'undefined') {
				x = document.createElement('description'); obj.controller.view.result_message.appendChild(x);
				x.appendChild( document.createTextNode( 'Server Error: ' + results.textcode + ' : ' + results.desc ));
				return;
			}
			if (results.query) {
				x = document.createElement('description'); obj.controller.view.result_message.appendChild(x);
				x.appendChild( document.createTextNode( 'Raw query: ' + results.query ));
			}
			if (results.count) {
				if (results.records) {
					x = document.createElement('description'); obj.controller.view.result_message.appendChild(x);
					x.appendChild(
						document.createTextNode( 'Showing ' + (obj.search_params.offset + results.records.length) + ' of ' + results.count)
					);
				}
				if (obj.search_params.offset + obj.search_params.limit <= results.count) {
					obj.controller.view.page_next.disabled = false;
				}
			} else {
					x = document.createElement('description'); obj.controller.view.result_message.appendChild(x);
					x.appendChild(
						document.createTextNode( results.count + ' records found')
					);
			}
			if (results.records) {
				obj.results = results;
				obj.controller.view.marc_import.disabled = true;
				obj.controller.view.marc_import_overlay.disabled = true;
				var x = obj.controller.view.marc_view;
				if (x.getAttribute('toggle') == '0') x.disabled = true;
				for (var i = 0; i < obj.results.records.length; i++) {
					obj.list.append(
						{
							'retrieve_id' : i,
							'row' : {
								'my' : {
									'mvr' : function(a){return a;}(obj.results.records[i].mvr),
								}
							}
						}
					);
				}
			} else {
				x = document.createElement('description'); obj.controller.view.result_message.appendChild(x);
				x.appendChild(
					document.createTextNode( 'Error retrieving results.')
				);
			}
		} catch(E) {
			this.error.standard_unexpected_error_alert('Failure during search result handling.',E);
		}
	},

	'replace_tab_with_opac' : function(doc_id) {
		var opac_url = xulG.url_prefix( urls.opac_rdetail ) + '?r=' + doc_id;
		var content_params = { 
			'session' : ses(),
			'authtime' : ses('authtime'),
			'opac_url' : opac_url,
		};
		xulG.set_tab(
			xulG.url_prefix(urls.XUL_OPAC_WRAPPER), 
			{'tab_name':'Retrieving title...'}, 
			content_params
		);
	},

	'spawn_marc_editor' : function(my_marcxml) {
		var obj = this;
		xulG.new_tab(
			xulG.url_prefix(urls.XUL_MARC_EDIT), 
			{ 'tab_name' : 'MARC Editor' }, 
			{ 
				'record' : { 'marc' : my_marcxml },
				'save' : {
					'label' : 'Import Record',
					'func' : function (new_marcxml) {
						try {
							var r = obj.network.simple_request('MARC_XML_RECORD_IMPORT', [ ses(), new_marcxml, obj.current_service ]);
							if (typeof r.ilsevent != 'undefined') {
								switch(r.ilsevent) {
									case 1704 /* TCN_EXISTS */ :
										var msg = 'A record with TCN ' + r.payload.tcn + ' already exists.\nFIXME: add record summary here';
										var title = 'Import Collision';
										var btn1 = 'Overlay';
										var btn2 = typeof r.payload.new_tcn == 'undefined' ? null : 'Import with alternate TCN ' + r.payload.new_tcn;
										var btn3 = 'Cancel Import';
										var p = obj.error.yns_alert(msg,title,btn1,btn2,btn3,'Check here to confirm this action');
										obj.error.sdump('D_ERROR','option ' + p + 'chosen');
										switch(p) {
											case 0:
												var r3 = obj.network.simple_request('MARC_XML_RECORD_UPDATE', [ ses(), r.payload.dup_record, new_marcxml, obj.current_service ]);
												if (typeof r3.ilsevent != 'undefined') {
													throw(r3);
												} else {
													alert('Record successfully overlayed.');
													obj.replace_tab_with_opac(r3.id());
												}
											break;
											case 1:
												var r2 = obj.network.request(
													api.MARC_XML_RECORD_IMPORT.app,
													api.MARC_XML_RECORD_IMPORT.method + '.override',
													[ ses(), new_marcxml, obj.current_service ]
												);
												if (typeof r2.ilsevent != 'undefined') {
													throw(r2);
												} else {
													alert('Record successfully imported with alternate TCN.');
													obj.replace_tab_with_opac(r2.id());
												}
											break;
											case 2:
											default:
												alert('Record import cancelled');
											break;
										}
									break;
									default:
										throw(r);
									break;
								}
							} else {
								alert('Record successfully imported.');
								obj.replace_tab_with_opac(r.id());
							}
						} catch(E) {
							obj.error.standard_unexpected_error_alert('Record not likely imported.',E);
						}
					}
				}
			} 
		);
	},

	'confirm_overlay' : function(record_ids) {
		var obj = this; JSAN.use('OpenILS.data'); var data = new OpenILS.data(); data.init({'via':'stash'});
		netscape.security.PrivilegeManager.enablePrivilege('UniversalXPConnect UniversalBrowserWrite');
		var top_xml = '<vbox xmlns="http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul" flex="1" >';
		top_xml += '<description>Overlay this record?</description>';
		top_xml += '<hbox><button id="lead" disabled="false" label="Overlay" name="fancy_submit" accesskey="O"/><button label="Cancel" accesskey="C" name="fancy_cancel"/></hbox></vbox>';

		var xml = '<form xmlns="http://www.w3.org/1999/xhtml">';
		xml += '<table width="100%"><tr valign="top">';
		for (var i = 0; i < record_ids.length; i++) {
			xml += '<td nowrap="nowrap"><iframe src="' + urls.XUL_BIB_BRIEF; 
			xml += '?docid=' + record_ids[i] + '"/></td>';
		}
		xml += '</tr><tr valign="top">';
		for (var i = 0; i < record_ids.length; i++) {
			html = obj.network.simple_request('MARC_HTML_RETRIEVE',[ record_ids[i] ]);
			xml += '<td nowrap="nowrap"><iframe style="min-height: 1000px; min-width: 300px;" flex="1" src="data:text/html,' + window.escape(html) + '"/></td>';
		}
		xml += '</tr></table></form>';
		data.temp_merge_top = top_xml; data.stash('temp_merge_top');
		data.temp_merge_mid = xml; data.stash('temp_merge_mid');
		window.open(
			urls.XUL_FANCY_PROMPT
			+ '?xml_in_stash=temp_merge_mid'
			+ '&top_xml_in_stash=temp_merge_top'
			+ '&title=' + window.escape('Record Overlay'),
			'fancy_prompt', 'chrome,resizable,modal,width=700,height=500'
		);
		data.stash_retrieve();
		if (data.fancy_prompt_data == '') { alert('Overlay Aborted'); return false; }
		return true;
	},

	'spawn_marc_editor_for_overlay' : function(my_marcxml) {
		var obj = this;
		JSAN.use('OpenILS.data'); var data = new OpenILS.data(); data.init({'via':'stash'});
		if (!data.marked_record) {
			alert('Please mark a record for overlay from within the catalog and try this again.');
			return;
		}

		xulG.new_tab(
			xulG.url_prefix(urls.XUL_MARC_EDIT), 
			{ 'tab_name' : 'MARC Editor' }, 
			{ 
				'record' : { 'marc' : my_marcxml },
				'save' : {
					'label' : 'Overlay Record',
					'func' : function (new_marcxml) {
						try {
							if (! obj.confirm_overlay( [ data.marked_record ] ) ) { return; }
							var r = obj.network.simple_request('MARC_XML_RECORD_REPLACE', [ ses(), data.marked_record, new_marcxml, obj.current_service ]);
							if (typeof r.ilsevent != 'undefined') {
								switch(r.ilsevent) {
									case 1704 /* TCN_EXISTS */ :
										var msg = 'A record with TCN ' + r.payload.tcn + ' already exists.\nFIXME: add record summary here';
										var title = 'Import Collision';
										var btn1 = typeof r.payload.new_tcn == 'undefined' ? null : 'Overlay with alternate TCN ' + r.payload.new_tcn;
										var btn2 = 'Cancel Import';
										var p = obj.error.yns_alert(msg,title,btn1,btn2,null,'Check here to confirm this action');
										obj.error.sdump('D_ERROR','option ' + p + 'chosen');
										switch(p) {
											case 0:
												var r2 = obj.network.request(
													api.MARC_XML_RECORD_REPLACE.app,
													api.MARC_XML_RECORD_REPLACE.method + '.override',
													[ ses(), data.marked_record, new_marcxml, obj.current_service ]
												);
												if (typeof r2.ilsevent != 'undefined') {
													throw(r2);
												} else {
													alert('Record successfully overlayed with alternate TCN.');
													obj.replace_tab_with_opac(r2.id());
												}
											break;
											case 1:
											default:
												alert('Record overlay cancelled');
											break;
										}
									break;
									default:
										throw(r);
									break;
								}
							} else {
								alert('Record successfully overlayed.');
								obj.replace_tab_with_opac(r.id());
							}
						} catch(E) {
							obj.error.standard_unexpected_error_alert('Record not likely overlayed.',E);
						}
					}
				}
			} 
		);
	},


	'load_creds' : function() {
		var obj = this;
		try {
			obj.creds = { 'version' : g.save_version, 'services' : {} };
			/*
				{
					'version' : xx,
					'default_service' : xx,
					'services' : {

						'xx' : {
							'username' : xx,
							'password' : xx,
							'default_attr' : xx,
						},

						'xx' : {
							'username' : xx,
							'password' : xx,
							'default_attr' : xx,
						},
					},
				}
			*/
			netscape.security.PrivilegeManager.enablePrivilege('UniversalXPConnect');
			JSAN.use('util.file'); var file = new util.file('z3950_store');
			if (file._file.exists()) {
				var creds = file.get_object(); file.close();
				if (typeof creds.version != 'undefined') {
					if (creds.version >= obj.creds_version) {
						obj.creds = creds;
					}
				}
			}
		} catch(E) {
			obj.error.standard_unexpected_error_alert('Error retrieving stored z39.50 credentials',E);
		}
	},

	'save_creds' : function () {
		try {
			var obj = this;
			obj.creds.default_service = obj.controller.view.service_menu.value;
			if (typeof obj.creds.services[ obj.creds.default_service ] == 'undefined') {
				obj.creds.services[ obj.creds.default_service ] = {}
			}
			obj.creds.services[obj.creds.default_service].username = document.getElementById('username').value;
			obj.creds.services[obj.creds.default_service].password = document.getElementById('password').value;
			if (obj.default_attr) {
				obj.creds.services[obj.creds.default_service].default_attr = obj.default_attr;
			}
			obj.creds.version = obj.creds_version;
			netscape.security.PrivilegeManager.enablePrivilege('UniversalXPConnect');
			JSAN.use('util.file'); var file = new util.file('z3950_store');
			file.set_object(obj.creds);
			file.close();
		} catch(E) {
			obj.error.standard_unexpected_error_alert('Problem storing z39.50 credentials.',E);
		}
	},

	'handle_enter' : function(ev) {
		var obj = this;
		if (ev.target.tagName != 'textbox') return;
		if (ev.keyCode == 13 /* enter */ || ev.keyCode == 77 /* enter on a mac */) setTimeout( function() { obj.initial_search(); }, 0);
	},
}

dump('exiting cat.z3950.js\n');
