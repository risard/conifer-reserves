dump('entering circ.copy_status.js\n');

if (typeof circ == 'undefined') circ = {};
circ.copy_status = function (params) {

	JSAN.use('util.error'); this.error = new util.error();
	JSAN.use('util.network'); this.network = new util.network();
	JSAN.use('util.barcode');
	JSAN.use('util.date');
	JSAN.use('OpenILS.data'); this.data = new OpenILS.data(); this.data.init({'via':'stash'});
	JSAN.use('util.sound'); this.sound = new util.sound();
}

circ.copy_status.prototype = {
	'selection_list' : [],
	'list_copyid_map' : {},

	'init' : function( params ) {

		var obj = this;

		JSAN.use('circ.util');
		var columns = circ.util.columns( 
			{ 
				'barcode' : { 'hidden' : false },
				'title' : { 'hidden' : false },
				'location' : { 'hidden' : false },
				'call_number' : { 'hidden' : false },
				'status' : { 'hidden' : false },
				'alert_message' : { 'hidden' : false },
				'due_date' : { 'hidden' : false },
			},
			{
				'except_these' : [
					'checkin_time', 'checkin_time_full', 'route_to', 'message', 'uses', 'xact_finish',
				],
			}
		);

		JSAN.use('util.list'); obj.list = new util.list('copy_status_list');
		obj.list.init(
			{
				'columns' : columns,
				'map_row_to_columns' : circ.util.std_map_row_to_columns(),
				'on_select' : function(ev) {
					try {
						JSAN.use('util.functional');
						var sel = obj.list.retrieve_selection();
						obj.selection_list = util.functional.map_list(
							sel,
							function(o) { return JSON2js(o.getAttribute('retrieve_id')); }
						);
						obj.error.sdump('D_TRACE','circ/copy_status: selection list = ' + js2JSON(obj.selection_list) );
						if (obj.selection_list.length == 0) {
							obj.controller.view.sel_checkin.setAttribute('disabled','true');
							obj.controller.view.cmd_replace_barcode.setAttribute('disabled','true');
							obj.controller.view.sel_edit.setAttribute('disabled','true');
							obj.controller.view.sel_opac.setAttribute('disabled','true');
							obj.controller.view.sel_bucket.setAttribute('disabled','true');
							obj.controller.view.sel_copy_details.setAttribute('disabled','true');
							obj.controller.view.sel_mark_items_damaged.setAttribute('disabled','true');
							obj.controller.view.sel_mark_items_missing.setAttribute('disabled','true');
							obj.controller.view.sel_patron.setAttribute('disabled','true');
							obj.controller.view.sel_spine.setAttribute('disabled','true');
							obj.controller.view.sel_transit_abort.setAttribute('disabled','true');
							obj.controller.view.sel_clip.setAttribute('disabled','true');
							obj.controller.view.sel_renew.setAttribute('disabled','true');
							obj.controller.view.cmd_add_items.setAttribute('disabled','true');
							obj.controller.view.cmd_delete_items.setAttribute('disabled','true');
							obj.controller.view.cmd_transfer_items.setAttribute('disabled','true');
							obj.controller.view.cmd_add_volumes.setAttribute('disabled','true');
							obj.controller.view.cmd_edit_volumes.setAttribute('disabled','true');
							obj.controller.view.cmd_delete_volumes.setAttribute('disabled','true');
							obj.controller.view.cmd_mark_volume.setAttribute('disabled','true');
							obj.controller.view.cmd_mark_library.setAttribute('disabled','true');
							obj.controller.view.cmd_transfer_volume.setAttribute('disabled','true');
						} else {
							obj.controller.view.sel_checkin.setAttribute('disabled','false');
							obj.controller.view.cmd_replace_barcode.setAttribute('disabled','false');
							obj.controller.view.sel_edit.setAttribute('disabled','false');
							obj.controller.view.sel_opac.setAttribute('disabled','false');
							obj.controller.view.sel_patron.setAttribute('disabled','false');
							obj.controller.view.sel_bucket.setAttribute('disabled','false');
							obj.controller.view.sel_copy_details.setAttribute('disabled','false');
							obj.controller.view.sel_mark_items_damaged.setAttribute('disabled','false');
							obj.controller.view.sel_mark_items_missing.setAttribute('disabled','false');
							obj.controller.view.sel_spine.setAttribute('disabled','false');
							obj.controller.view.sel_transit_abort.setAttribute('disabled','false');
							obj.controller.view.sel_clip.setAttribute('disabled','false');
							obj.controller.view.sel_renew.setAttribute('disabled','false');
							obj.controller.view.cmd_add_items.setAttribute('disabled','false');
							obj.controller.view.cmd_delete_items.setAttribute('disabled','false');
							obj.controller.view.cmd_transfer_items.setAttribute('disabled','false');
							obj.controller.view.cmd_add_volumes.setAttribute('disabled','false');
							obj.controller.view.cmd_edit_volumes.setAttribute('disabled','false');
							obj.controller.view.cmd_delete_volumes.setAttribute('disabled','false');
							obj.controller.view.cmd_mark_volume.setAttribute('disabled','false');
							obj.controller.view.cmd_mark_library.setAttribute('disabled','false');
							obj.controller.view.cmd_transfer_volume.setAttribute('disabled','false');
						}
					} catch(E) {
						alert('FIXME: ' + E);
					}
				},
			}
		);
		
		JSAN.use('util.controller'); obj.controller = new util.controller();
		obj.controller.init(
			{
				'control_map' : {
					'save_columns' : [ [ 'command' ], function() { obj.list.save_columns(); } ],
					'sel_clip' : [
						['command'],
						function() { obj.list.clipboard(); }
					],
					'sel_checkin' : [
						['command'],
						function() {
							try {
								var funcs = [];
								JSAN.use('circ.util');
								for (var i = 0; i < obj.selection_list.length; i++) {
									var barcode = obj.selection_list[i].barcode;
									var checkin = circ.util.checkin_via_barcode( ses(), { 'barcode' : barcode } );
									funcs.push( function(a) { return function() { obj.copy_status( a, true ); }; }(barcode) );
								}
								for (var i = 0; i < funcs.length; i++) { funcs[i](); }
								alert('Action complete.');
							} catch(E) {
								obj.error.standard_unexpected_error_alert('Checkin did not likely happen.',E);
							}
						}
					],
					'cmd_replace_barcode' : [
						['command'],
						function() {
							try {
								var funcs = [];
								JSAN.use('cat.util');
								for (var i = 0; i < obj.selection_list.length; i++) {
									try { 
										var barcode = obj.selection_list[i].barcode;
										var new_bc = cat.util.replace_barcode( barcode );
										funcs.push( function(a) { return function() { obj.copy_status( a, true ); }; }(new_bc) );
									} catch(E) {
										obj.error.standard_unexpected_error_alert('Barcode ' + barcode + ' was not likely replaced.',E);
									}
								}
								for (var i = 0; i < funcs.length; i++) { funcs[i](); }
								alert('Action complete.');
							} catch(E) {
								obj.error.standard_unexpected_error_alert('Barcode replacements did not likely happen.',E);
							}
						}
					],
					'sel_edit' : [
						['command'],
						function() {
							try {
								var funcs = [];
								obj.spawn_copy_editor();
								for (var i = 0; i < obj.selection_list.length; i++) {
										var barcode = obj.selection_list[i].barcode;
										funcs.push( function(a) { return function() { obj.copy_status( a, true ); }; }(barcode) );
								}
								for (var i = 0; i < funcs.length; i++) { funcs[i](); }
							} catch(E) {
								obj.error.standard_unexpected_error_alert('with copy editor',E);
							}
						}
					],
					'sel_spine' : [
						['command'],
						function() {
							JSAN.use('cat.util');
							cat.util.spawn_spine_editor(obj.selection_list);
						}
					],
					'sel_opac' : [
						['command'],
						function() {
							JSAN.use('cat.util');
							cat.util.show_in_opac(obj.selection_list);
						}
					],
					'sel_transit_abort' : [
						['command'],
						function() {
							var funcs = [];
							JSAN.use('circ.util');
							circ.util.abort_transits(obj.selection_list);
							for (var i = 0; i < obj.selection_list.length; i++) {
								var barcode = obj.selection_list[i].barcode;
								funcs.push( function(a) { return function() { obj.copy_status( a, true ); }; }(barcode) );
							}
							for (var i = 0; i < funcs.length; i++) { funcs[i](); }
							alert('Action complete.');
						}
					],
					'sel_patron' : [
						['command'],
						function() {
							JSAN.use('circ.util');
							circ.util.show_last_few_circs(obj.selection_list);
						}
					],
					'sel_copy_details' : [
						['command'],
						function() {
							JSAN.use('circ.util');
							for (var i = 0; i < obj.selection_list.length; i++) {
								circ.util.show_copy_details( obj.selection_list[i].copy_id );
							}
						}
					],
					'sel_renew' : [
						['command'],
						function() {
							var funcs = [];
							JSAN.use('circ.util');
							for (var i = 0; i < obj.selection_list.length; i++) {
								var test = obj.selection_list[i].renewable;
								var barcode = obj.selection_list[i].barcode;
								if (test == 't') {
									circ.util.renew_via_barcode( barcode );
									funcs.push( function(a) { return function() { obj.copy_status( a, true ); }; }(barcode) );
								} else {
									alert('Item with barcode ' + barcode + ' is not circulating.');
								}
							}
							for (var i = 0; i < funcs.length; i++) { funcs[i](); }
							alert('Action complete.');
						}
					],

					'sel_mark_items_damaged' : [
						['command'],
						function() {
							var funcs = [];
							JSAN.use('cat.util'); JSAN.use('util.functional');
							cat.util.mark_item_damaged( util.functional.map_list( obj.selection_list, function(o) { return o.copy_id; } ) );
							for (var i = 0; i < obj.selection_list.length; i++) {
								var barcode = obj.selection_list[i].barcode;
								funcs.push( function(a) { return function() { obj.copy_status( a, true ); }; }(barcode) );
							}
							for (var i = 0; i < funcs.length; i++) { funcs[i](); }
						}
					],
					'sel_mark_items_missing' : [
						['command'],
						function() {
							var funcs = [];
							JSAN.use('cat.util'); JSAN.use('util.functional');
							cat.util.mark_item_missing( util.functional.map_list( obj.selection_list, function(o) { return o.copy_id; } ) );
							for (var i = 0; i < obj.selection_list.length; i++) {
								var barcode = obj.selection_list[i].barcode;
								funcs.push( function(a) { return function() { obj.copy_status( a, true ); }; }(barcode) );
							}
							for (var i = 0; i < funcs.length; i++) { funcs[i](); }
						}
					],
					'sel_bucket' : [
						['command'],
						function() {
							JSAN.use('cat.util');
							cat.util.add_copies_to_bucket(obj.selection_list);
						}
					],
					'copy_status_barcode_entry_textbox' : [
						['keypress'],
						function(ev) {
							if (ev.keyCode && ev.keyCode == 13) {
								obj.copy_status();
							}
						}
					],
					'cmd_broken' : [
						['command'],
						function() { alert('Not Yet Implemented'); }
					],
					'cmd_copy_status_submit_barcode' : [
						['command'],
						function() {
							obj.copy_status();
						}
					],
					'cmd_copy_status_upload_file' : [
						['command'],
						function() {
							function pick_file(mode) {
								netscape.security.PrivilegeManager.enablePrivilege('UniversalXPConnect UniversalBrowserWrite');
								var nsIFilePicker = Components.interfaces.nsIFilePicker;
								var fp = Components.classes["@mozilla.org/filepicker;1"].createInstance( nsIFilePicker );
								fp.init( 
									window, 
									mode == 'open' ? "Import Barcode File" : "Save Barcode File As", 
									mode == 'open' ? nsIFilePicker.modeOpen : nsIFilePicker.modeSave
								);
								fp.appendFilters( nsIFilePicker.filterAll );
								var fp_result = fp.show();
								if ( ( fp_result == nsIFilePicker.returnOK || fp_result == nsIFilePicker.returnReplace ) && fp.file ) {
									return fp.file;
								} else {
									return null;
								}
							}
							netscape.security.PrivilegeManager.enablePrivilege('UniversalXPConnect UniversalBrowserWrite');
							JSAN.use('util.file');
							var f = pick_file('open');
							var i_file = new util.file(''); i_file._file = f;
							var content = i_file.get_content();
							i_file.close();
							var barcodes = content.split(/\s+/);
                			if (barcodes.length > 0) {
			                    JSAN.use('util.exec'); var exec = new util.exec();
			                    var funcs = [];
			                    for (var i = 0; i < barcodes.length; i++) {
			                        funcs.push(
			                            function(b){
			                                return function() {
			                                    obj.copy_status(b);
			                                }
			                            }(barcodes[i])
			                        );
			                    }
								funcs.push( function() { alert('File uploaded.'); } );
			                    exec.chain( funcs );
			                } else {
								alert('No barcodes found in file.');
							}

						}
					],
					'cmd_copy_status_print' : [
						['command'],
						function() {
							try {
								obj.list.on_all_fleshed =
									function() {
										try {
											dump( js2JSON( obj.list.dump_with_keys() ) + '\n' );
											obj.data.stash_retrieve();
											var lib = obj.data.hash.aou[ obj.data.list.au[0].ws_ou() ];
											lib.children(null);
											var p = { 
												'lib' : lib,
												'staff' : obj.data.list.au[0],
												'header' : obj.data.print_list_templates.item_status.header,
												'line_item' : obj.data.print_list_templates.item_status.line_item,
												'footer' : obj.data.print_list_templates.item_status.footer,
												'type' : obj.data.print_list_templates.item_status.type,
												'list' : obj.list.dump_with_keys(),
											};
											JSAN.use('util.print'); var print = new util.print();
											print.tree_list( p );
											setTimeout(function(){ obj.list.on_all_fleshed = null; },0);
										} catch(E) {
											obj.error.standard_unexpected_error_alert('print',E); 
										}
									}
								obj.list.full_retrieve();
							} catch(E) {
								obj.error.standard_unexpected_error_alert('print',E); 
							}
						}
					],
					'cmd_copy_status_export' : [
						['command'],
						function() {
							try {
								obj.list.on_all_fleshed =
									function() {
										try {
											dump( obj.list.dump_csv() + '\n' );
											copy_to_clipboard(obj.list.dump_csv());
											setTimeout(function(){ obj.list.on_all_fleshed = null; },0);
										} catch(E) {
											obj.error.standard_unexpected_error_alert('export',E); 
										}
									}
								obj.list.full_retrieve();
							} catch(E) {
								obj.error.standard_unexpected_error_alert('export',E); 
							}
						}
					],
					'cmd_copy_status_print_export' : [
						['command'],
						function() {
							try {
								obj.list.on_all_fleshed =
									function() {
										try {
											dump( obj.list.dump_csv() + '\n' );
											//copy_to_clipboard(obj.list.dump_csv());
											JSAN.use('util.print'); var print = new util.print();
											print.simple(obj.list.dump_csv(),{'content_type':'text/plain'});
											setTimeout(function(){ obj.list.on_all_fleshed = null; },0);
										} catch(E) {
											obj.error.standard_unexpected_error_alert('export',E); 
										}
									}
								obj.list.full_retrieve();
							} catch(E) {
								obj.error.standard_unexpected_error_alert('export',E); 
							}
						}
					],

					'cmd_add_items' : [
						['command'],
						function() {
							try {

								JSAN.use('util.functional');
								var list = util.functional.map_list( obj.selection_list, function(o) { return o.acn_id; } );
								if (list.length == 0) return;

								var copy_shortcut = {}; var map_acn = {};

								for (var i = 0; i < list.length; i++) {
									var volume_id = list[i];
									if (volume_id == -1) continue; /* ignore magic pre-cat volume */
									if (! map_acn[volume_id]) {
										map_acn[ volume_id ] = obj.network.simple_request('FM_ACN_RETRIEVE',[ volume_id ]);
									}
									var record_id = map_acn[ volume_id ].record();
									var ou_id = map_acn[ volume_id ].owning_lib();
									var label = map_acn[ volume_id ].label();
									if (!copy_shortcut[record_id]) copy_shortcut[record_id] = {};
									if (!copy_shortcut[record_id][ou_id]) copy_shortcut[record_id][ou_id] = {};
									copy_shortcut[record_id][ou_id][ label ] = volume_id;

								}

								for (var r in copy_shortcut) {

									/* quick fix */  /* what was this fixing? */
									list = []; for (var i in copy_shortcut[r]) { list.push( i ); }

									var edit = 0;
									try {
										edit = obj.network.request(
											api.PERM_MULTI_ORG_CHECK.app,
											api.PERM_MULTI_ORG_CHECK.method,
											[ 
												ses(), 
												obj.data.list.au[0].id(), 
												list,
												[ 'CREATE_COPY' ]
											]
										).length == 0 ? 1 : 0;
									} catch(E) {
										obj.error.sdump('D_ERROR','batch permission check: ' + E);
									}
	
									if (edit==0) return; // no read-only view for this interface
	
									var title = 'Add Item for record #' + r;
	
									JSAN.use('util.window'); var win = new util.window();
									var w = win.open(
										window.xulG.url_prefix(urls.XUL_VOLUME_COPY_CREATOR),
											//+'?doc_id=' + window.escape(r)
											//+'&ou_ids=' + window.escape( js2JSON(list) )
											//+'&copy_shortcut=' + window.escape( js2JSON(copy_shortcut[r]) ),
										title,
										'chrome,resizable',
										{ 'doc_id' : r, 'ou_ids' : list, 'copy_shortcut' : copy_shortcut[r] }
									);
								}

							} catch(E) {
								obj.error.standard_unexpected_error_alert('copy status -> add copies',E);
							}
						}

					],
					'cmd_delete_items' : [
						['command'],
						function() {
							try {

                                JSAN.use('util.functional');

								var list = util.functional.map_list( obj.selection_list, function(o) { return o.copy_id; } );

                                var copies = util.functional.map_list(
                                    list,
                                    function (acp_id) {
                                        return obj.network.simple_request('FM_ACP_RETRIEVE',[acp_id]);
                                    }
                                );

                                for (var i = 0; i < copies.length; i++) {
                                    copies[i].ischanged(1);
                                    copies[i].isdeleted(1);
                                }

								if (! window.confirm('Are you sure sure you want to delete these items? ' + util.functional.map_list( copies, function(o) { return o.barcode(); }).join(", ")) ) return;

                                var robj = obj.network.simple_request('FM_ACP_FLESHED_BATCH_UPDATE',[ ses(), copies, true]);
								var robj = obj.network.simple_request(
									'FM_ACP_FLESHED_BATCH_UPDATE', 
									[ ses(), copies, true ], 
									null,
									{
										'title' : 'Override Delete Failure?',
										'overridable_events' : [
											1208 /* TITLE_LAST_COPY */,
											1227 /* COPY_DELETE_WARNING */,
										]
									}
								);
	
                                if (typeof robj.ilsevent != 'undefined') {
									switch(robj.ilsevent) {
										case 1208 /* TITLE_LAST_COPY */:
										case 1227 /* COPY_DELETE_WARNING */:
										break;
										default:
											obj.error.standard_unexpected_error_alert('Batch Item Deletion',robj);
										break;
									}
								} else { alert('Items Deleted'); }

							} catch(E) {
								obj.error.standard_unexpected_error_alert('copy status -> delete items',E);
							}
						}
					],
					'cmd_transfer_items' : [
						['command'],
						function() {
								try {
									obj.data.stash_retrieve();
									if (!obj.data.marked_volume) {
										alert('Please mark a volume as the destination and then try this again.');
										return;
									}
									
									JSAN.use('util.functional');

									var list = util.functional.map_list( obj.selection_list, function(o) { return o.copy_id; } );

									var volume = obj.network.simple_request('FM_ACN_RETRIEVE',[ obj.data.marked_volume ]);

									JSAN.use('cat.util'); cat.util.transfer_copies( { 
										'copy_ids' : list, 
										'docid' : volume.record(),
										'volume_label' : volume.label(),
										'owning_lib' : volume.owning_lib(),
									} );

								} catch(E) {
									obj.error.standard_unexpected_error_alert('All copies not likely transferred.',E);
								}
							}

					],
					'cmd_add_volumes' : [
						['command'],
						function() {
							try {
								JSAN.use('util.functional');
								var list = util.functional.map_list( obj.selection_list, function(o) { return o.acn_id; } );
								if (list.length == 0) return;

								var aou_hash = {}; var map_acn = {};

								for (var i = 0; i < list.length; i++) {
									var volume_id = list[i];
									if (volume_id == -1) continue; /* ignore magic pre-cat volume */
									if (! map_acn[volume_id]) {
										map_acn[ volume_id ] = obj.network.simple_request('FM_ACN_RETRIEVE',[ volume_id ]);
									}
									var record_id = map_acn[ volume_id ].record();
									var ou_id = map_acn[ volume_id ].owning_lib();
									var label = map_acn[ volume_id ].label();
									if (!aou_hash[record_id]) aou_hash[record_id] = {};
									aou_hash[record_id][ou_id] = 1;

								}

								for (var r in aou_hash) {

									list = []; for (var org in aou_hash[r]) list.push(org);

									var edit = 0;
									try {
										edit = obj.network.request(
											api.PERM_MULTI_ORG_CHECK.app,
											api.PERM_MULTI_ORG_CHECK.method,
											[ 
												ses(), 
												obj.data.list.au[0].id(), 
												list,
												[ 'CREATE_VOLUME', 'CREATE_COPY' ]
											]
										).length == 0 ? 1 : 0;
									} catch(E) {
										obj.error.sdump('D_ERROR','batch permission check: ' + E);
									}

									if (edit==0) {
										alert("You don't have permission to add volumes to that library.");
										return; // no read-only view for this interface
									}

									var title = 'Add Volume/Item for Record # ' + r;

									JSAN.use('util.window'); var win = new util.window();
									var w = win.open(
										window.xulG.url_prefix(urls.XUL_VOLUME_COPY_CREATOR),
											//+'?doc_id=' + window.escape(r)
											//+'&ou_ids=' + window.escape( js2JSON(list) ),
										title,
										'chrome,resizable',
										{ 'doc_id' : r, 'ou_ids' : list }
									);

								}

							} catch(E) {
								obj.error.standard_unexpected_error_alert('copy status -> add volumes',E);
							}
						}

					],
					'cmd_edit_volumes' : [
						['command'],
						function() {
							try {
								JSAN.use('util.functional');
								var list = util.functional.map_list( obj.selection_list, function(o) { return o.acn_id; } );
								if (list.length == 0) return;

								var volume_hash = {}; var map_acn = {};

								for (var i = 0; i < list.length; i++) {
									var volume_id = list[i];
									if (volume_id == -1) continue; /* ignore magic pre-cat volume */
									if (! map_acn[volume_id]) {
										map_acn[ volume_id ] = obj.network.simple_request('FM_ACN_RETRIEVE',[ volume_id ]);
										map_acn[ volume_id ].copies( [] );
									}
									var record_id = map_acn[ volume_id ].record();
									if (!volume_hash[record_id]) volume_hash[record_id] = {};
									volume_hash[record_id][volume_id] = 1;
								}

								for (var rec in volume_hash) {

									list = []; for (var v in volume_hash[rec]) list.push( map_acn[v] );

									var edit = 0;
									try {
										edit = obj.network.request(
											api.PERM_MULTI_ORG_CHECK.app,
											api.PERM_MULTI_ORG_CHECK.method,
											[ 
												ses(), 
												obj.data.list.au[0].id(), 
												util.functional.map_list(
													list,
													function (o) {
														return o.owning_lib();
													}
												),
												[ 'UPDATE_VOLUME' ]
											]
										).length == 0 ? 1 : 0;
									} catch(E) {
										obj.error.sdump('D_ERROR','batch permission check: ' + E);
									}

									if (edit==0) {
										alert("You don't have permission to edit this volume.");
										return; // no read-only view for this interface
									}

									var title = (list.length == 1 ? 'Volume' : 'Volumes') + ' for record # ' + rec;

									JSAN.use('util.window'); var win = new util.window();
									//obj.data.volumes_temp = js2JSON( list );
									//obj.data.stash('volumes_temp');
									var my_xulG = win.open(
										window.xulG.url_prefix(urls.XUL_VOLUME_EDITOR),
										title,
										'chrome,modal,resizable',
										{ 'volumes' : list }
									);

									/* FIXME -- need to unique the temp space, and not rely on modalness of window */
									//obj.data.stash_retrieve();
									//var volumes = JSON2js( obj.data.volumes_temp );
									var volumes = my_xulG.volumes;
									if (!volumes) return;
								
									volumes = util.functional.filter_list(
										volumes,
										function (o) {
											return o.ischanged() == '1';
										}
									);

									volumes = util.functional.map_list(
										volumes,
										function (o) {
											o.record( rec ); // staff client 2 did not do this.  Does it matter?
											return o;
										}
									);

									if (volumes.length == 0) return;

									try {
										var r = obj.network.request(
											api.FM_ACN_TREE_UPDATE.app,
											api.FM_ACN_TREE_UPDATE.method,
											[ ses(), volumes, false ]
										);
                                        if (typeof r.ilsevent != 'undefined') {
                                            switch(r.ilsevent) {
                                                case 1705 /* VOLUME_LABEL_EXISTS */ :
                                                    alert("Edit failed:  You tried to change a volume's callnumber to one that is already in use for the given library.  You should transfer the items to the desired callnumber instead.");
                                                    break;
                                                default: throw(r);
                                            }
                                        } else {
    										alert('Volumes modified.');
                                        }
									} catch(E) {
										obj.error.standard_unexpected_error_alert('volume update error: ',E);
									}

								}
							} catch(E) {
								obj.error.standard_unexpected_error_alert('Copy Status -> Volume Edit',E);
							}
						}

					],
					'cmd_delete_volumes' : [
						['command'],
						function() {
							try {
								JSAN.use('util.functional');
								var list = util.functional.map_list( obj.selection_list, function(o) { return o.acn_id; } );
								if (list.length == 0) return;

								var map_acn = {};

								for (var i = 0; i < list.length; i++) {
									var volume_id = list[i];
									if (volume_id == -1) continue; /* ignore magic pre-cat volume */
									if (! map_acn[volume_id]) {
										map_acn[ volume_id ] = obj.network.simple_request('FM_ACN_RETRIEVE',[ volume_id ]);
									}
								}

								list = []; for (var v in map_acn) list.push( map_acn[v] );

								var r = obj.error.yns_alert('Are you sure you would like to delete ' + (list.length != 1 ? 'these ' + list.length + ' volumes' : 'this one volume') + '?', 'Delete Volumes?', 'Delete', 'Cancel', null, 'Check here to confirm this action');

								if (r == 0) {
									for (var i = 0; i < list.length; i++) {
										list[i].isdeleted('1');
									}
									var robj = obj.network.simple_request(
										'FM_ACN_TREE_UPDATE', 
										[ ses(), list, true ],
										null,
										{
											'title' : 'Override Delete Failure?',
											'overridable_events' : [
											]
										}
									);
									if (robj == null) throw(robj);
									if (typeof robj.ilsevent != 'undefined') {
										if (robj.ilsevent == 1206 /* VOLUME_NOT_EMPTY */) {
											alert('You must delete all the copies on the volume before you may delete the volume itself.');
											return;
										}
										if (robj.ilsevent != 0) throw(robj);
									}
									alert('Volumes deleted.');
								}
							} catch(E) {
								obj.error.standard_unexpected_error_alert('copy status -> delete volumes',E);
							}

						}

					],
					'cmd_mark_volume' : [
						['command'],
						function() {
							try {
								JSAN.use('util.functional');
								var list = util.functional.map_list( obj.selection_list, function(o) { return o.acn_id; } );

								if (list.length == 1) {
									obj.data.marked_volume = list[0];
									obj.data.stash('marked_volume');
									alert('Volume marked as Item Transfer Destination');
								} else {
									obj.error.yns_alert('Choose just one Volume to mark as Item Transfer Destination','Limit Selection','OK',null,null,'Check here to confirm this dialog');
								}
							} catch(E) {
								obj.error.standard_unexpected_error_alert('copy status -> mark volume',E);
							}
						}
					],
					'cmd_mark_library' : [
						['command'],
						function() {
							try {
								JSAN.use('util.functional');
								var list = util.functional.map_list( obj.selection_list, function(o) { return o.acn_id; } );

								if (list.length == 1) {
									var v = obj.network.simple_request('FM_ACN_RETRIEVE',[list[0]]);
									var owning_lib = v.owning_lib(); if (typeof owning_lib == 'object') owning_lib = owning_lib.id();

									obj.data.marked_library = { 'lib' : owning_lib, 'docid' : v.record() };
									obj.data.stash('marked_library');
									alert('Library + Record marked as Volume Transfer Destination');
								} else {
									obj.error.yns_alert('Choose just one Library to mark as Volume Transfer Destination','Limit Selection','OK',null,null,'Check here to confirm this dialog');
								}
							} catch(E) {
								obj.error.standard_unexpected_error_alert('copy status -> mark library',E);
							}
						}
					],
					'cmd_transfer_volume' : [
						['command'],
						function() {
							try {
									obj.data.stash_retrieve();
									if (!obj.data.marked_library) {
										alert('Please mark a library as the destination from within holdings maintenance and then try this again.');
										return;
									}
									
									JSAN.use('util.functional');

									var list = util.functional.map_list( obj.selection_list, function(o) { return o.acn_id; } );
									if (list.length == 0) return;

									var map_acn = {};

									for (var i = 0; i < list.length; i++) {
										var volume_id = list[i];
										if (volume_id == -1) continue; /* ignore magic pre-cat volume */
										if (! map_acn[volume_id]) {
											map_acn[ volume_id ] = obj.network.simple_request('FM_ACN_RETRIEVE',[ volume_id ]);
										}
									}

									list = []; for (v in map_acn) list.push(map_acn[v]);

									netscape.security.PrivilegeManager.enablePrivilege('UniversalXPConnect UniversalBrowserWrite');
									var xml = '<vbox xmlns="http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul" flex="1" style="overflow: auto">';
									xml += '<description>Transfer volumes ';

									xml += util.functional.map_list(
										list,
										function (o) {
											return o.label();
										}
									).join(", ");

									xml += ' to library ' + obj.data.hash.aou[ obj.data.marked_library.lib ].shortname();
									xml += ' on the following record?</description>';
									xml += '<hbox><button label="Transfer" name="fancy_submit"/>';
									xml += '<button label="Cancel" accesskey="C" name="fancy_cancel"/></hbox>';
									xml += '<iframe style="overflow: scroll" flex="1" src="' + urls.XUL_BIB_BRIEF + '?docid=' + obj.data.marked_library.docid + '"/>';
									xml += '</vbox>';
									JSAN.use('OpenILS.data');
									//var data = new OpenILS.data(); data.init({'via':'stash'});
									//data.temp_transfer = xml; data.stash('temp_transfer');
									JSAN.use('util.window'); var win = new util.window();
									var fancy_prompt_data = win.open(
										urls.XUL_FANCY_PROMPT,
										//+ '?xml_in_stash=temp_transfer'
										//+ '&title=' + window.escape('Volume Transfer'),
										'fancy_prompt', 'chrome,resizable,modal,width=500,height=300',
										{ 'xml' : xml, 'title' : 'Volume Transfer' }
									);
								
									if (fancy_prompt_data.fancy_status == 'incomplete') { alert('Transfer Aborted'); return; }

									var robj = obj.network.simple_request(
										'FM_ACN_TRANSFER', 
										[ ses(), { 'docid' : obj.data.marked_library.docid, 'lib' : obj.data.marked_library.lib, 'volumes' : util.functional.map_list( list, function(o) { return o.id(); }) } ],
										null,
										{
											'title' : 'Override Volume Transfer Failure?',
											'overridable_events' : [
												1208 /* TITLE_LAST_COPY */,
												1219 /* COPY_REMOTE_CIRC_LIB */,
											],
										}
									);

									if (typeof robj.ilsevent != 'undefined') {
										if (robj.ilsevent == 1221 /* ORG_CANNOT_HAVE_VOLS */) {
											alert('That destination cannot have volumes.');
										} else {
											throw(robj);
										}
									} else {
										alert('Volumes transferred.');
									}

							} catch(E) {
								obj.error.standard_unexpected_error_alert('All volumes not likely transferred.',E);
							}
						}

					],
				}
			}
		);
		this.controller.render();
		this.controller.view.copy_status_barcode_entry_textbox.focus();

	},

	'test_barcode' : function(bc) {
		var obj = this;
		var good = util.barcode.check(bc);
		var x = document.getElementById('strict_barcode');
		if (x && x.checked != true) return true;
		if (good) {
			return true;
		} else {
			if ( 1 == obj.error.yns_alert(
						'Bad checkdigit; possible mis-scan.  Use this barcode ("' + bc + '") anyway?',
						'Bad Barcode',
						'Cancel',
						'Accept Barcode',
						null,
						'Check here to confirm this action',
						'/xul/server/skin/media/images/bad_barcode.png'
			) ) {
				return true;
			} else {
				return false;
			}
		}
	},

	'copy_status' : function(barcode,refresh) {
		var obj = this;
		try {
			try { document.getElementById('last_scanned').setAttribute('value',''); } catch(E) {}
			if (!barcode) barcode = obj.controller.view.copy_status_barcode_entry_textbox.value;
			if (!barcode) return;
			if (barcode) {
				if ( obj.test_barcode(barcode) ) { /* good */ } else { /* bad */ return; }
			}
			JSAN.use('circ.util');
			function handle_req(req) {
				try {
					var details = req.getResultObject();
					if (details == null) {
						throw('Something weird happened.  null result');
					} else if (details.ilsevent) {
						switch(details.ilsevent) {
							case -1: 
								obj.error.standard_network_error_alert(); 
								obj.controller.view.copy_status_barcode_entry_textbox.select();
								obj.controller.view.copy_status_barcode_entry_textbox.focus();
								return;
							break;
							case 1502 /* ASSET_COPY_NOT_FOUND */ :
								try { document.getElementById('last_scanned').setAttribute('value',barcode + ' was either mis-scanned or is not cataloged.'); } catch(E) {}
								obj.error.yns_alert(barcode + ' was either mis-scanned or is not cataloged.','Not Cataloged','OK',null,null,'Check here to confirm this message');
								obj.controller.view.copy_status_barcode_entry_textbox.select();
								obj.controller.view.copy_status_barcode_entry_textbox.focus();
								return;
							break;
							default: 
								throw(details); 
							break;
						}
					}
					var msg = details.copy.barcode() + ' -- ';
					if (details.copy.call_number() == -1) msg += 'Item is a Pre-Cat.  ';
					if (details.hold) msg += 'Item is captured for a Hold.  ';
					if (details.transit) msg += 'Item is in Transit.  ';
					if (details.circ && ! details.circ.checkin_time()) msg += 'Item is circulating.  ';
					try { document.getElementById('last_scanned').setAttribute('value',msg); } catch(E) {}
					if (document.getElementById('trim_list')) {
						var x = document.getElementById('trim_list');
						if (x.checked) { obj.list.trim_list = 20; } else { obj.list.trim_list = null; }
					}
					var params = {
						'retrieve_id' : js2JSON( 
							{ 
								'renewable' : details.circ ? 't' : 'f', 
								'copy_id' : details.copy.id(), 
								'acn_id' : details.volume ? details.volume.id() : -1, 
								'barcode' : barcode, 
								'doc_id' : details.mvr ? details.mvr.doc_id() : null  
							} 
						),
						'row' : {
							'my' : {
								'mvr' : details.mvr,
								'acp' : details.copy,
								'acn' : details.volume,
								'atc' : details.transit,
								'circ' : details.circ,
								'ahr' : details.hold,
							}
						},
						'to_top' : true,
					};
					if (!refresh) {
						var nparams = obj.list.append(params);
						if (!document.getElementById('trim_list').checked) {
							if (typeof obj.list_copyid_map[details.copy.id()] == 'undefined') obj.list_copyid_map[details.copy.id()] =[];
							obj.list_copyid_map[details.copy.id()].push(nparams);
						}
					} else {
						if (!document.getElementById('trim_list').checked) {
                            if (typeof obj.list_copyid_map[details.copy.id()] != 'undefined') {
                                for (var i = 0; i < obj.list_copyid_map[details.copy.id()].length; i++) {
                                    if (typeof obj.list_copyid_map[details.copy.id()][i] == 'undefined') {
                                        obj.list.append(params);
                                    } else {
                                        params.my_node = obj.list_copyid_map[details.copy.id()][i].my_node;
                                        obj.list.refresh_row(params);
                                    }
                                }
                            } else {
							    obj.list.append(params);
                            }
						} else {
							obj.list.append(params);
						}
					}
				} catch(E) {
					obj.error.standard_unexpected_error_alert('barcode = ' + barcode,E);
				}
			}
			var result = obj.network.simple_request('FM_ACP_DETAILS_VIA_BARCODE', [ ses(), barcode ]);
			handle_req({'getResultObject':function(){return result;}}); // used to be async
			obj.controller.view.copy_status_barcode_entry_textbox.value = '';
			obj.controller.view.copy_status_barcode_entry_textbox.focus();
			
		} catch(E) {
			obj.error.standard_unexpected_error_alert('barcode = ' + barcode,E);
			obj.controller.view.copy_status_barcode_entry_textbox.select();
			obj.controller.view.copy_status_barcode_entry_textbox.focus();
		}

	},
	
	'spawn_copy_editor' : function() {

		/* FIXME -  a lot of redundant calls here */

		var obj = this;

		JSAN.use('util.widgets'); JSAN.use('util.functional');

		var list = obj.selection_list;

		list = util.functional.map_list(
			list,
			function (o) {
				return o.copy_id;
			}
		);

		var copies = util.functional.map_list(
			list,
			function (acp_id) {
				return obj.network.simple_request('FM_ACP_RETRIEVE',[acp_id]);
			}
		);

		var edit = 0;
		try {
			edit = obj.network.request(
				api.PERM_MULTI_ORG_CHECK.app,
				api.PERM_MULTI_ORG_CHECK.method,
				[ 
					ses(), 
					obj.data.list.au[0].id(), 
					util.functional.map_list(
						copies,
						function (o) {
							return o.call_number() == -1 ? o.circ_lib() : obj.network.simple_request('FM_ACN_RETRIEVE',[o.call_number()]).owning_lib();
						}
					),
					copies.length == 1 ? [ 'UPDATE_COPY' ] : [ 'UPDATE_COPY', 'UPDATE_BATCH_COPY' ]
				]
			).length == 0 ? 1 : 0;
		} catch(E) {
			obj.error.sdump('D_ERROR','batch permission check: ' + E);
		}

		JSAN.use('cat.util'); cat.util.spawn_copy_editor(list,edit);

	},

}

dump('exiting circ.copy_status.js\n');
