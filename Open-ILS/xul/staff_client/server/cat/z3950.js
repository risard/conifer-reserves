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

	'creds_version' : 2,

    'number_of_result_sets' : 0,

    'result_set' : [],

    'limit' : 10,

	'init' : function( params ) {

		try {
			netscape.security.PrivilegeManager.enablePrivilege("UniversalXPConnect");
			JSAN.use('util.widgets');

			var obj = this;

            JSAN.use('OpenILS.data'); obj.data = new OpenILS.data(); obj.data.init({'via':'stash'});

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
					'service' : { 'hidden' : false }
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
								obj.list.dump_csv_to_clipboard();
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
                                setTimeout( function() { obj.focus(); }, 0 );
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
										var f = get_contentWindow(document.getElementById('marc_frame'));
                                        var retrieve_id = n.getAttribute('retrieve_id');
                                        var result_idx = retrieve_id.split('-')[0];
                                        var record_idx = retrieve_id.split('-')[1];
										f.xulG = { 'marcxml' : obj.result_set[result_idx].records[ record_idx ].marcxml };
										f.my_init();
										f.document.body.firstChild.focus();
									}
								} catch(E) {
			                        obj.error.standard_unexpected_error_alert('Failure during marc view.',E);
								}
							},
						],
						'marc_import' : [
							['command'],
							function() {
                                try {
                                    var retrieve_id = obj.controller.view.marc_import.getAttribute('retrieve_id');
                                    var result_idx = retrieve_id.split('-')[0];
                                    var record_idx = retrieve_id.split('-')[1];
                                    obj.spawn_marc_editor( 
                                        obj.result_set[ result_idx ].records[ record_idx ].marcxml,
                                        obj.result_set[ result_idx ].records[ record_idx ].service /* FIXME: we want biblio_source here */
                                    );
                                } catch(E) {
			                        obj.error.standard_unexpected_error_alert('Failure during marc import.',E);
                                }
							},
						],
						'marc_import_overlay' : [ 
							['command'],
							function() {
								try {
                                    var retrieve_id = obj.controller.view.marc_import_overlay.getAttribute('retrieve_id');
                                    var result_idx = retrieve_id.split('-')[0];
                                    var record_idx = retrieve_id.split('-')[1];
                                    obj.spawn_marc_editor_for_overlay( 
                                        obj.result_set[ result_idx ].records[ record_idx ].marcxml,
                                        obj.result_set[ result_idx ].records[ record_idx ].service /* FIXME: we want biblio_source here */
                                    );
								} catch(E) {
			                        obj.error.standard_unexpected_error_alert('Failure during marc import overlay.',E);
								}
							},
						],
                        'z3950_deck' : [ ['render'], function(e) { return function() { e.selectedIndex = 0; }; } ],
						'search' : [
							['command'],
							function() {
                                obj.controller.view.z3950_deck.selectedIndex = 1;
								obj.initial_search();
							},
						],
						'search_form' : [
							['command'],
							function() {
                                obj.controller.view.z3950_deck.selectedIndex = 0;
							},
						],
						'results_page' : [
							['command'],
							function() {
                                obj.controller.view.z3950_deck.selectedIndex = 1;
							},
						],
						'page_next' : [
							['command'],
							function() {
								obj.page_next();
							},
						],
						'service_rows' : [
							['render'],
							function(e) {
								return function() {
									try {

										function handle_switch(node) {
                                            try {
                                                obj.active_services = [];
                                                var snl = document.getElementsByAttribute('mytype','service_class');
                                                for (var i = 0; i < snl.length; i++) {
                                                    var n = snl[i];
                                                    if (n.nodeName == 'checkbox') {
                                                        if (n.checked) obj.active_services.push( n.getAttribute('service') );
                                                    }
                                                }
                                                var nl = document.getElementsByAttribute('mytype','search_class');
                                                for (var i = 0; i < nl.length; i++) { nl[i].disabled = true; }
                                                var attrs = {};
                                                for (var j = 0; j < obj.active_services.length; j++) {
                                                    if (obj.services[obj.active_services[j]]) for (var i in obj.services[obj.active_services[j]].attrs) {
                                                        var attr = obj.services[obj.active_services[j]].attrs[i];
                                                        if (! attrs[i]) {
                                                            attrs[i] = { 'labels' : {} };
                                                        }
                                                        if (attr.label) {
                                                            attrs[i].labels[ attr.label ] = true;
                                                        } else if (document.getElementById('commonStrings').testString('staff.z39_50.search_class.' + i)) {
                                                            attrs[i].labels[ document.getElementById('commonStrings').getString('staff.z39_50.search_class.' + i) ] = true;
                                                        } else if (attr.name) {
                                                            attrs[i].labels[ attr.name ] = true;
                                                        } else {
                                                            attrs[i].labels[ i ] = true;
                                                        }

                                                    }
                                                    
                                                }

                                                function set_label(x,attr) {
                                                    var labels = [];
                                                    for (var j in attrs[attr].labels) {
                                                        labels.push(j);
                                                    }
                                                    if (labels.length > 0) {
                                                        x.setAttribute('value',labels[0]);
                                                        x.setAttribute('tooltiptext',labels.join(','));
                                                        if (labels.length > 1) x.setAttribute('class','multiple_labels');
                                                    }
                                                }

                                                for (var i in attrs) {
                                                    var x = document.getElementById(i + '_input');
                                                    if (x) {
                                                        x.disabled = false;
                                                        var y = document.getElementById(i + '_label',i);
                                                        if (y) set_label(y,i);
                                                    } else {
                                                        var rows = document.getElementById('query_inputs');
                                                        var row = document.createElement('row'); rows.appendChild(row);
                                                        var label = document.createElement('label');
                                                        label.setAttribute('id',i+'_label');
                                                        label.setAttribute('control',i+'_input');
                                                        label.setAttribute('search_class',i);
                                                        label.setAttribute('style','-moz-user-focus: ignore');
                                                        row.appendChild(label);
                                                        set_label(label,i);
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
                                                        tb.addEventListener('keypress',function(ev) { return obj.handle_enter(ev); },false);
                                                    }
                                                }
                                            } catch(E) {
										        obj.error.standard_unexpected_error_alert('Error setting up search fields.',E);
                                            }
										}

                                        document.getElementById('native-evergreen-catalog_service').addEventListener('command',handle_switch,false);

										var robj = obj.network.simple_request(
											'RETRIEVE_Z3950_SERVICES',
											[ ses() ]
										);
										if (typeof robj.ilsevent != 'undefined') throw(robj);
										obj.services = robj;
                                        var x = document.getElementById('service_rows');
										for (var i in robj) {
                                            var r = document.createElement('row'); x.appendChild(r);
                                            var cb = document.createElement('checkbox'); 
                                                if (robj[i].label) {
                                                    cb.setAttribute('label',robj[i].label);
                                                } else if (robj[i].name) {
                                                    cb.setAttribute('label',robj[i].name);
                                                } else {
                                                    cb.setAttribute('label',i);
                                                }
                                                cb.setAttribute('tooltiptext',i + ' : ' + robj[i].db + '@' + robj[i].host + ':' + robj[i].port); 
                                                cb.setAttribute('mytype','service_class'); cb.setAttribute('service',i);
                                                cb.setAttribute('id',i+'_service'); r.appendChild(cb);
                                                cb.addEventListener('command',handle_switch,false);
                                            var username = document.createElement('textbox'); username.setAttribute('id',i+'_username'); 
                                            if (obj.creds.hosts[ obj.data.server_unadorned ] && obj.creds.hosts[ obj.data.server_unadorned ].services[i]) username.setAttribute('value',obj.creds.hosts[ obj.data.server_unadorned ].services[i].username);
                                            r.appendChild(username);
                                            if (typeof robj[i].auth != 'undefined') username.hidden = ! get_bool( robj[i].auth );
                                            var password = document.createElement('textbox'); password.setAttribute('id',i+'_password'); 
                                            if (obj.creds.hosts[ obj.data.server_unadorned ] && obj.creds.hosts[ obj.data.server_unadorned ].services[i]) password.setAttribute('value',obj.creds.hosts[ obj.data.server_unadorned ].services[i].password);
                                            password.setAttribute('type','password'); r.appendChild(password);
                                            if (typeof robj[i].auth != 'undefined') password.hidden = ! get_bool( robj[i].auth );
                                        }
                                        obj.services[ 'native-evergreen-catalog' ] = { 'attrs' : { 'author' : {}, 'title' : {} } };
                                        setTimeout(
											function() { 
                                                if (obj.creds.hosts[ obj.data.server_unadorned ]) {
                                                    for (var i = 0; i < obj.creds.hosts[ obj.data.server_unadorned ].default_services.length; i++) {
                                                        var x = document.getElementById(obj.creds.hosts[ obj.data.server_unadorned ].default_services[i]+'_service');
                                                        if (x) x.checked = true;
                                                    }
                                                } else if (obj.creds.default_service) {
                                                    var x = document.getElementById(obj.creds.default_service+'_service');
                                                    if (x) x.checked = true;
                                                }
                                                handle_switch();
											},0
										);
									} catch(E) {
										obj.error.standard_unexpected_error_alert('Z39.50 services not likely retrieved.',E);
									}
								}
							}
						],
					}
				}
			);

			obj.controller.render();

            setTimeout( function() { obj.focus(); }, 0 );

		} catch(E) {
			this.error.sdump('D_ERROR','cat.z3950.init: ' + E + '\n');
		}
	},

	'focus' : function() {
		var obj = this;
        var focus_me; var or_focus_me;
        for (var i = 0; i < obj.active_services.length; i++) {
            if (obj.creds.hosts[ obj.data.server_unadorned ] && obj.creds.hosts[ obj.data.server_unadorned ].services[ obj.active_services[i] ]) {
		        var x = obj.creds.hosts[ obj.data.server_unadorned ].services[ obj.active_services[i] ].default_attr;
                if (x) { focus_me = x; break; }
            }
            if (ob.services[ obj.active_services[i] ]) for (var i in obj.services[ obj.active_services[i] ].attr) { or_focus_me = i; }
        }
        if (! focus_me) focus_me = or_focus_me;
		var xx = document.getElementById(focus_me+'_input'); if (xx) xx.focus();
	},

	'clear' : function() {
		var obj = this;
		var nl = document.getElementsByAttribute('mytype','search_class');
		for (var i = 0; i < nl.length; i++) { nl[i].value = ''; nl[i].setAttribute('value',''); }
		//obj.focus(obj.controller.view.service_menu.value);
	},

	'search_params' : {},

	'initial_search' : function() {
		try {
			var obj = this;
            obj.result_set = []; obj.number_of_result_sets = 0;
			JSAN.use('util.widgets');
			util.widgets.remove_children( obj.controller.view.result_message );
			var x = document.createElement('description'); obj.controller.view.result_message.appendChild(x);
            if (obj.active_services.length < 1) {
			    x.appendChild( document.createTextNode( 'No services selected to search.' ));
                return;
            }
			x.appendChild( document.createTextNode( 'Searching...' ));
			obj.search_params = {}; obj.list.clear();
			obj.controller.view.page_next.disabled = true;

			obj.search_params.service = []; 
			obj.search_params.username = [];
			obj.search_params.password = [];
            for (var i = 0; i < obj.active_services.length; i++) {
                obj.search_params.service.push( obj.active_services[i] );
                obj.search_params.username.push( document.getElementById( obj.active_services[i]+'_username' ).value );
                obj.search_params.password.push( document.getElementById( obj.active_services[i]+'_password' ).value );
            }
			obj.search_params.limit = Math.ceil( obj.limit / obj.active_services.length );
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
            if (typeof results.length == 'undefined') results = [ results ];
            for (var i = 0; i < results.length; i++) {
                if (results[i].query) {
                    x = document.createElement('description'); obj.controller.view.result_message.appendChild(x);
                    x.appendChild( document.createTextNode( 'Raw query: ' + results[i].query ));
                }
                if (results[i].count) {
                    if (results[i].records) {
                        x = document.createElement('description'); obj.controller.view.result_message.appendChild(x);
                        var showing = obj.search_params.offset + results[i].records.length; 
                        x.appendChild(
                            document.createTextNode( 'Showing ' + (showing > results[i].count ? results[i].count : showing) + ' of ' + results[i].count + ' for ' + results[i].service )
                        );
                    }
                    if (obj.search_params.offset + obj.search_params.limit <= results[i].count) {
                        obj.controller.view.page_next.disabled = false;
                    }
                } else {
                        x = document.createElement('description'); obj.controller.view.result_message.appendChild(x);
                        x.appendChild(
                            document.createTextNode( (results[i].count ? results[i].count : 0) + ' records found')
                        );
                }
                if (results[i].records) {
                    obj.result_set[ ++obj.number_of_result_sets ] = results[i];
                    obj.controller.view.marc_import.disabled = true;
                    obj.controller.view.marc_import_overlay.disabled = true;
                    var x = obj.controller.view.marc_view;
                    if (x.getAttribute('toggle') == '0') x.disabled = true;
                    for (var j = 0; j < obj.result_set[ obj.number_of_result_sets ].records.length; j++) {
                        var f;
                        var n = obj.list.append(
                            {
                                'retrieve_id' : String( obj.number_of_result_sets ) + '-' + String( j ),
                                'row' : {
                                    'my' : {
                                        'mvr' : function(a){return a;}(obj.result_set[ obj.number_of_result_sets ].records[j].mvr),
                                        'service' : results[i].service
                                    }
                                }
                            }
                        );
                        if (!f) { n.my_node.parentNode.focus(); f = n; } 
                    }
                } else {
                    x = document.createElement('description'); obj.controller.view.result_message.appendChild(x);
                    x.appendChild(
                        document.createTextNode( 'Error retrieving results.')
                    );
                }
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

	'spawn_marc_editor' : function(my_marcxml,biblio_source) {
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
							var r = obj.network.simple_request('MARC_XML_RECORD_IMPORT', [ ses(), new_marcxml, biblio_source ]);
							if (typeof r.ilsevent != 'undefined') {
								switch(Number(r.ilsevent)) {
									case 1704 /* TCN_EXISTS */ :
										var msg = 'A record with TCN ' + r.payload.tcn + ' already exists.\nFIXME: add record summary here';
										var title = 'Import Collision';
										var btn1 = 'Overlay';
										var btn2 = typeof r.payload.new_tcn == 'undefined' ? null : 'Import with alternate TCN ' + r.payload.new_tcn;
										if (btn2) {
											obj.data.init({'via':'stash'});
											var robj = obj.network.simple_request(
												'PERM_CHECK',[
													ses(),
													obj.data.list.au[0].id(),
													obj.data.list.au[0].ws_ou(),
													[ 'ALLOW_ALT_TCN' ]
												]
											);
											if (typeof robj.ilsevent != 'undefined') {
												obj.error.standard_unexpected_error_alert('check permission',E);
											}
											if (robj.length != 0) btn2 = null;
										}
										var btn3 = 'Cancel Import';
										var p = obj.error.yns_alert(msg,title,btn1,btn2,btn3,'Check here to confirm this action');
										obj.error.sdump('D_ERROR','option ' + p + 'chosen');
										switch(p) {
											case 0:
												var r3 = obj.network.simple_request('MARC_XML_RECORD_UPDATE', [ ses(), r.payload.dup_record, new_marcxml, biblio_source ]);
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
													[ ses(), new_marcxml, biblio_source ]
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
		var obj = this; // JSAN.use('OpenILS.data'); var data = new OpenILS.data(); data.init({'via':'stash'});
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
		// data.temp_merge_top = top_xml; data.stash('temp_merge_top');
		// data.temp_merge_mid = xml; data.stash('temp_merge_mid');
		JSAN.use('util.window'); var win = new util.window();
		var fancy_prompt_data = win.open(
			urls.XUL_FANCY_PROMPT,
			// + '?xml_in_stash=temp_merge_mid'
			// + '&top_xml_in_stash=temp_merge_top'
			// + '&title=' + window.escape('Record Overlay'),
			'fancy_prompt', 'chrome,resizable,modal,width=700,height=500',
			{ 'top_xml' : top_xml, 'xml' : xml, 'title' : 'Record Overlay' }
		);
		//data.stash_retrieve();
		if (fancy_prompt_data.fancy_status == 'incomplete') { alert('Overlay Aborted'); return false; }
		return true;
	},

	'spawn_marc_editor_for_overlay' : function(my_marcxml,biblio_source) {
		var obj = this;
		obj.data.init({'via':'stash'});
		if (!obj.data.marked_record) {
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
							if (! obj.confirm_overlay( [ obj.data.marked_record ] ) ) { return; }
							var r = obj.network.simple_request('MARC_XML_RECORD_REPLACE', [ ses(), obj.data.marked_record, new_marcxml, biblio_source ]);
							if (typeof r.ilsevent != 'undefined') {
								switch(Number(r.ilsevent)) {
									case 1704 /* TCN_EXISTS */ :
										var msg = 'A record with TCN ' + r.payload.tcn + ' already exists.\nFIXME: add record summary here';
										var title = 'Import Collision';
										var btn1 = typeof r.payload.new_tcn == 'undefined' ? null : 'Overlay with alternate TCN ' + r.payload.new_tcn;
										if (btn1) {
											var robj = obj.network.simple_request(
												'PERM_CHECK',[
													ses(),
													obj.data.list.au[0].id(),
													obj.data.list.au[0].ws_ou(),
													[ 'ALLOW_ALT_TCN' ]
												]
											);
											if (typeof robj.ilsevent != 'undefined') {
												obj.error.standard_unexpected_error_alert('check permission',E);
											}
											if (robj.length != 0) btn1 = null;
										}
										var btn2 = 'Cancel Import';
										var p = obj.error.yns_alert(msg,title,btn1,btn2,null,'Check here to confirm this action');
										obj.error.sdump('D_ERROR','option ' + p + 'chosen');
										switch(p) {
											case 0:
												var r2 = obj.network.request(
													api.MARC_XML_RECORD_REPLACE.app,
													api.MARC_XML_RECORD_REPLACE.method + '.override',
													[ ses(), obj.data.marked_record, new_marcxml, biblio_source ]
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
			obj.creds = { 'version' : g.save_version, 'services' : {}, 'hosts' : {} };
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
                    // new in version 2
                    'hosts' : {
                        'xxxx' : {
                            'default_services' : [ xx, ... ],
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
                    }
				}
			*/
			netscape.security.PrivilegeManager.enablePrivilege('UniversalXPConnect');
			JSAN.use('util.file'); var file = new util.file('z3950_store');
			if (file._file.exists()) {
				var creds = file.get_object(); file.close();
				if (typeof creds.version != 'undefined') {
					if (creds.version >= obj.creds_version) {  /* so apparently, this guy is assuming that future versions will be backwards compatible */
                        if (typeof creds.hosts == 'undefined') creds.hosts = {};
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
            if (typeof obj.creds.hosts == 'undefined') obj.creds.hosts = {};
            if (typeof obj.creds.hosts[ obj.data.server_unadorned ] == 'undefined') obj.creds.hosts[ obj.data.server_unadorned ] = { 'services' : {} };
            obj.creds.hosts[ obj.data.server_unadorned ].default_services = obj.active_services;
            for (var i = 0; i < obj.creds.hosts[ obj.data.server_unadorned ].default_services.length; i++) {
			    var service = obj.creds.hosts[ obj.data.server_unadorned ].default_services[i];
    			if (typeof obj.creds.hosts[ obj.data.server_unadorned ].services[ service ] == 'undefined') {
                    obj.creds.hosts[ obj.data.server_unadorned ].services[ service ] = {}
    			}
    			obj.creds.hosts[ obj.data.server_unadorned ].services[service].username = document.getElementById(service + '_username').value;
    			obj.creds.hosts[ obj.data.server_unadorned ].services[service].password = document.getElementById(service + '_password').value;
    			if (obj.default_attr) {
    				obj.creds.hosts[ obj.data.server_unadorned ].services[service].default_attr = obj.default_attr;
    			}
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
		if (ev.keyCode == 13 /* enter */ || ev.keyCode == 77 /* enter on a mac */) setTimeout( function() { obj.controller.view.z3950_deck.selectedIndex = 1; obj.initial_search(); }, 0);
	},
}

dump('exiting cat.z3950.js\n');
