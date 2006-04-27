dump('entering patron.holds.js\n');

if (typeof patron == 'undefined') patron = {};
patron.holds = function (params) {

	JSAN.use('util.error'); this.error = new util.error();
	JSAN.use('util.network'); this.network = new util.network();
	this.OpenILS = {}; JSAN.use('OpenILS.data'); this.OpenILS.data = new OpenILS.data(); this.OpenILS.data.init({'via':'stash'});
}

patron.holds.prototype = {

	'retrieve_ids' : [],

	'init' : function( params ) {

		var obj = this;

		obj.patron_id = params['patron_id'];

		JSAN.use('circ.util');
		var columns = circ.util.hold_columns( 
			{ 
				'title' : { 'hidden' : false, 'flex' : '3' },
				'request_time' : { 'hidden' : false },
				'pickup_lib_shortname' : { 'hidden' : false },
				'hold_type' : { 'hidden' : false },
				'current_copy' : { 'hidden' : false },
				'capture_time' : { 'hidden' : false },
			} 
		);

		JSAN.use('util.list'); obj.list = new util.list('holds_list');
		obj.list.init(
			{
				'columns' : columns,
				'map_row_to_column' : circ.util.std_map_row_to_column(),
				'retrieve_row' : function(params) {
					var row = params.row;
					try {
						switch(row.my.ahr.hold_type()) {
							case 'M' :
								row.my.mvr = obj.network.request(
									api.MODS_SLIM_METARECORD_RETRIEVE.app,
									api.MODS_SLIM_METARECORD_RETRIEVE.method,
									[ row.my.ahr.target() ]
								);
							break;
							default:
								row.my.mvr = obj.network.request(
									api.MODS_SLIM_RECORD_RETRIEVE.app,
									api.MODS_SLIM_RECORD_RETRIEVE.method,
									[ row.my.ahr.target() ]
								);
								if (row.my.ahr.current_copy()) {
									row.my.acp = obj.network.simple_request( 'FM_ACP_RETRIEVE', [ row.my.ahr.current_copy() ]);
								}
							break;
						}
					} catch(E) {
						obj.error.sdump('D_ERROR','retrieve_row: ' + E );
					}
					if (typeof params.on_retrieve == 'function') {
						params.on_retrieve(row);
					}
					return row;
				},
				'on_select' : function(ev) {
					JSAN.use('util.functional');
					var sel = obj.list.retrieve_selection();
					obj.retrieve_ids = util.functional.map_list(
						sel,
						function(o) { return JSON2js( o.getAttribute('retrieve_id') ); }
					);
					if (obj.retrieve_ids.length > 0) {
						obj.controller.view.cmd_holds_edit.setAttribute('disabled','false');
						obj.controller.view.cmd_holds_cancel.setAttribute('disabled','false');
						obj.controller.view.cmd_show_catalog.setAttribute('disabled','false');
					} else {
						obj.controller.view.cmd_holds_edit.setAttribute('disabled','true');
						obj.controller.view.cmd_holds_cancel.setAttribute('disabled','true');
						obj.controller.view.cmd_show_catalog.setAttribute('disabled','true');
					}
				},

			}
		);
		
		JSAN.use('util.controller'); obj.controller = new util.controller();
		obj.controller.init(
			{
				'control_map' : {
					'cmd_broken' : [
						['command'],
						function() { alert('Not Yet Implemented'); }
					],
					'cmd_holds_print' : [
						['command'],
						function() {
							dump(js2JSON(obj.list.dump()) + '\n');
							try {
								JSAN.use('patron.util');
								var params = { 
									'patron' : patron.util.retrieve_au_via_id(ses(),obj.patron_id), 
									'lib' : obj.OpenILS.data.hash.aou[ obj.OpenILS.data.list.au[0].ws_ou() ],
									'staff' : obj.OpenILS.data.list.au[0],
									'header' : obj.OpenILS.data.print_list_templates.holds.header,
									'line_item' : obj.OpenILS.data.print_list_templates.holds.line_item,
									'footer' : obj.OpenILS.data.print_list_templates.holds.footer,
									'type' : obj.OpenILS.data.print_list_templates.holds.type,
									'list' : obj.list.dump(),
								};
								JSAN.use('util.print'); var print = new util.print();
								print.tree_list( params );
							} catch(E) {
								this.error.sdump('D_ERROR','preview: ' + E);
								alert('preview: ' + E);
							}


						}
					],
					'cmd_holds_edit' : [
						['command'],
						function() {
						}
					],
					'cmd_holds_cancel' : [
						['command'],
						function() {
							try {
								JSAN.use('util.functional');
								var msg = 'Are you sure you would like to cancel hold' + ( obj.retrieve_ids.length > 1 ? 's ' : ' ') + util.functional.map_list( obj.retrieve_ids, function(o){return o.id;}).join(', ') + '?';
								var r = obj.error.yns_alert(msg,'Cancelling Holds','Yes','No',null,'Check here to confirm this message');
								if (r == 0) {
									for (var i = 0; i < obj.retrieve_ids.length; i++) {
										var robj = obj.network.simple_request('FM_AHR_CANCEL',[ ses(), obj.retrieve_ids[i].id]);
										if (typeof robj.ilsevent != 'undefined') throw(robj);
									}
								}
							} catch(E) {
								obj.error.standard_unexpected_error_alert('Holds not likely cancelled.',E);
							}
						}
					],
					'cmd_show_catalog' : [
						['command'],
						function() {
							try {
								for (var i = 0; i < obj.retrieve_ids.length; i++) {
									var doc_id = obj.retrieve_ids[i].target;
									if (!doc_id) {
										alert(obj.retrieve_ids[i].barcode + ' is not cataloged');
										continue;
									}
									var opac_url = xulG.url_prefix( urls.opac_rdetail ) + '?r=' + doc_id;
									var content_params = { 
										'session' : ses(),
										'authtime' : ses('authtime'),
										'opac_url' : opac_url,
									};
									xulG.new_tab(
										xulG.url_prefix(urls.XUL_OPAC_WRAPPER), 
										{'tab_name':'Retrieving title...'}, 
										content_params
									);
								}
							} catch(E) {
								obj.error.standard_unexpected_error_alert('',E);
							}
						}
					],
				}
			}
		);
		obj.controller.render();

		obj.retrieve();

		obj.controller.view.cmd_holds_edit.setAttribute('disabled','true');
		obj.controller.view.cmd_holds_cancel.setAttribute('disabled','true');
		obj.controller.view.cmd_show_catalog.setAttribute('disabled','true');
	},

	'retrieve' : function(dont_show_me_the_list_change) {
		var obj = this;
		if (window.xulG && window.xulG.holds) {
			obj.holds = window.xulG.holds;
		} else {
			var method; var id;
			if (obj.patron_id) {
				method = 'FM_AHR_RETRIEVE'; 
				id = obj.patron_id; 
			} else {
				method = 'FM_AHR_RETRIEVE_VIA_PICKUP_AOU'; 
				id = obj.OpenILS.data.list.au[0].ws_ou(); 
			}
			obj.holds = obj.network.simple_request( method, [ ses(), id ]);
		}

		function gen_list_append(hold) {
			return function() {
				obj.list.append(
					{
						'retrieve_id' : js2JSON({'id':hold.id(),'target':hold.target(),}),
						'row' : {
							'my' : {
								'ahr' : hold,
							}
						}
					}
				);
			};
		}

		obj.list.clear();

		JSAN.use('util.exec'); var exec = new util.exec(2);
		var rows = [];
		for (var i in obj.holds) {
			rows.push( gen_list_append(obj.holds[i]) );
		}
		exec.chain( rows );
	
		if (!dont_show_me_the_list_change) {
			if (window.xulG && typeof window.xulG.on_list_change == 'function') {
				try { window.xulG.on_list_change(obj.holds); } catch(E) { this.error.sdump('D_ERROR',E); }
			}
		}
	},
}

dump('exiting patron.holds.js\n');
