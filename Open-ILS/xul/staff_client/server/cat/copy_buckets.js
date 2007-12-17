dump('entering cat.copy_buckets.js\n');

if (typeof cat == 'undefined') cat = {};
cat.copy_buckets = function (params) {

	JSAN.use('util.error'); this.error = new util.error();
	JSAN.use('util.network'); this.network = new util.network();
	JSAN.use('util.date');
	JSAN.use('OpenILS.data'); this.data = new OpenILS.data(); this.data.init({'via':'stash'});
	this.first_pause = true;
}

cat.copy_buckets.prototype = {
	'selection_list1' : [],
	'selection_list2' : [],
	'bucket_id_name_map' : {},

	'render_pending_copies' : function() {
		if (this.first_pause) {
			this.first_pause = false;
		} else {
			alert("Action completed.");
		}
		var obj = this;
		obj.list1.clear();
		for (var i = 0; i < obj.copy_ids.length; i++) {
			var item = obj.flesh_item_for_list( obj.copy_ids[i] );
			if (item) obj.list1.append( item );
		}
	},

	'init' : function( params ) {

		var obj = this;

		obj.copy_ids = params['copy_ids'] || [];

		JSAN.use('circ.util');
		var columns = circ.util.columns( 
			{ 
				'barcode' : { 'hidden' : false },
				'title' : { 'hidden' : false },
				'location' : { 'hidden' : false },
				'call_number' : { 'hidden' : false },
				'status' : { 'hidden' : false },
				'deleted' : { 'hidden' : false },
			} 
		);

		JSAN.use('util.list'); 

		obj.list1 = new util.list('pending_copies_list');
		obj.list1.init(
			{
				'columns' : columns,
				'map_row_to_columns' : circ.util.std_map_row_to_columns(),
				'on_select' : function(ev) {
					try {
						JSAN.use('util.functional');
						var sel = obj.list1.retrieve_selection();
						document.getElementById('clip_button1').disabled = sel.length < 1;
						obj.selection_list1 = util.functional.map_list(
							sel,
							function(o) { return JSON2js(o.getAttribute('retrieve_id')); }
						);
						obj.error.sdump('D_TRACE','circ/copy_buckets: selection list 1 = ' + js2JSON(obj.selection_list1) );
						if (obj.selection_list1.length == 0) {
							obj.controller.view.copy_buckets_sel_add.disabled = true;
						} else {
							obj.controller.view.copy_buckets_sel_add.disabled = false;
						}
					} catch(E) {
						alert('FIXME: ' + E);
					}
				},

			}
		);

		obj.render_pending_copies();
	
		obj.list2 = new util.list('copies_in_bucket_list');
		obj.list2.init(
			{
				'columns' : columns,
				'map_row_to_columns' : circ.util.std_map_row_to_columns(),
				'on_select' : function(ev) {
					try {
						JSAN.use('util.functional');
						var sel = obj.list2.retrieve_selection();
						document.getElementById('clip_button2').disabled = sel.length < 1;
						obj.selection_list2 = util.functional.map_list(
							sel,
							function(o) { return JSON2js(o.getAttribute('retrieve_id')); }
						);
						obj.error.sdump('D_TRACE','circ/copy_buckets: selection list 2 = ' + js2JSON(obj.selection_list2) );
						if (obj.selection_list2.length == 0) {
							obj.controller.view.copy_buckets_delete_item.disabled = true;
							obj.controller.view.copy_buckets_delete_item.setAttribute('disabled','true');
							obj.controller.view.copy_buckets_export.disabled = true;
							obj.controller.view.copy_buckets_export.setAttribute('disabled','true');
						} else {
							obj.controller.view.copy_buckets_delete_item.disabled = false;
							obj.controller.view.copy_buckets_delete_item.setAttribute('disabled','false');
							obj.controller.view.copy_buckets_export.disabled = false;
							obj.controller.view.copy_buckets_export.setAttribute('disabled','false');
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
					'save_columns2' : [
						['command'],
						function() { obj.list2.save_columns(); }
					],
					'save_columns1' : [
						['command'],
						function() { obj.list1.save_columns(); }
					],
					'sel_clip2' : [
						['command'],
						function() { obj.list2.clipboard(); }
					],
					'sel_clip1' : [
						['command'],
						function() { obj.list1.clipboard(); }
					],
					'copy_buckets_menulist_placeholder' : [
						['render'],
						function(e) {
							return function() {
								JSAN.use('util.widgets'); JSAN.use('util.functional');
								var items = [ ['Choose a bucket...',''], ['Retrieve shared bucket...',-1] ].concat(
									util.functional.map_list(
										obj.network.simple_request(
											'BUCKET_RETRIEVE_VIA_USER',
											[ ses(), obj.data.list.au[0].id() ]
										).copy,
										function(o) {
											obj.bucket_id_name_map[ o.id() ] = o.name();
											return [ o.name(), o.id() ];
										}
									).sort( 
				                        function( a, b ) {
				                            if (a[0] < b[0]) return -1;
				                            if (a[0] > b[0]) return 1;
				                            return 0;
				                        }
									)
								);
								obj.error.sdump('D_TRACE','items = ' + js2JSON(items));
								util.widgets.remove_children( e );
								var ml = util.widgets.make_menulist(
									items
								);
								e.appendChild( ml );
								ml.setAttribute('id','bucket_menulist');
								ml.setAttribute('accesskey','');

								function change_bucket(ev) {
									var bucket_id = ev.target.value;
									if (bucket_id < 0 ) {
										bucket_id = window.prompt('Enter bucket number:');
										ev.target.value = bucket_id;
										ev.target.setAttribute('value',bucket_id);
									}
									if (!bucket_id) return;
									var bucket = obj.network.simple_request(
										'BUCKET_FLESH',
										[ ses(), 'copy', bucket_id ]
									);
									if (typeof bucket.ilsevent != 'undefined') {
										if (bucket.ilsevent == 1506 /* CONTAINER_NOT_FOUND */) {
											alert('Could not find a bucket with ID = ' + bucket_id);
										} else {
											obj.error.standard_unexpected_error_alert('Error retrieving bucket.  Did you use a valid bucket id?',bucket);
										}
										return;
									}
									try {
										var x = document.getElementById('info_box');
										x.setAttribute('hidden','false');
										x = document.getElementById('bucket_number');
										x.setAttribute('value',bucket.id());
										x = document.getElementById('bucket_name');
										x.setAttribute('value',bucket.name());
										x = document.getElementById('bucket_owner');
										var s = bucket.owner(); JSAN.use('patron.util');
										if (s && typeof s != "object") s = patron.util.retrieve_fleshed_au_via_id(ses(),s); 
										x.setAttribute('value',s.card().barcode() + " @ " + obj.data.hash.aou[ s.home_ou() ].shortname());

									} catch(E) {
										alert(E);
									}
									var items = bucket.items() || [];
									obj.list2.clear();
									for (var i = 0; i < items.length; i++) {
										var item = obj.flesh_item_for_list( 
											items[i].target_copy(),
											items[i].id()
										);
										if (item) obj.list2.append( item );
									}
								}

								ml.addEventListener( 'change_bucket', change_bucket , false);
								ml.addEventListener( 'command', function() {
									JSAN.use('util.widgets'); util.widgets.dispatch('change_bucket',ml);
								}, false);
								obj.controller.view.bucket_menulist = ml;
								JSAN.use('util.widgets'); util.widgets.dispatch('change_bucket',ml);
								document.getElementById('refresh').addEventListener( 'command', function() {
									JSAN.use('util.widgets'); util.widgets.dispatch('change_bucket',ml);
								}, false);
							};
						},
					],

					'copy_buckets_add' : [
						['command'],
						function() {
							var bucket_id = obj.controller.view.bucket_menulist.value;
							if (!bucket_id) return;
							for (var i = 0; i < obj.copy_ids.length; i++) {
								var bucket_item = new ccbi();
								bucket_item.isnew('1');
								bucket_item.bucket(bucket_id);
								bucket_item.target_copy( obj.copy_ids[i] );
								try {
									var robj = obj.network.simple_request('BUCKET_ITEM_CREATE',
										[ ses(), 'copy', bucket_item ]);

									if (typeof robj == 'object') throw robj;

									var item = obj.flesh_item_for_list( obj.copy_ids[i], robj );
									if (!item) continue;

									obj.list2.append( item );
								} catch(E) {
									obj.error.standard_unexpected_error_alert('Addition likely failed.',E);
								}
							}
						}
					],
					'copy_buckets_sel_add' : [
						['command'],
						function() {                                                        
							var bucket_id = obj.controller.view.bucket_menulist.value;
							if (!bucket_id) return;
							for (var i = 0; i < obj.selection_list1.length; i++) {
	                                                        var acp_id = obj.selection_list1[i][0];
								//var barcode = obj.selection_list1[i][1];
								var bucket_item = new ccbi();
								bucket_item.isnew('1');
								bucket_item.bucket(bucket_id);
								bucket_item.target_copy( acp_id );
								try {
									var robj = obj.network.simple_request('BUCKET_ITEM_CREATE',
										[ ses(), 'copy', bucket_item ]);

									if (typeof robj == 'object') throw robj;

									var item = obj.flesh_item_for_list( acp_id, robj );
									if (!item) continue;

									obj.list2.append( item );
								} catch(E) {
									obj.error.standard_unexpected_error_alert('Deletion likely failed.',E);
								}
							}

						}
					],
					'copy_buckets_export' : [
						['command'],
						function() {                                                        
							for (var i = 0; i < obj.selection_list2.length; i++) {
								var acp_id = obj.selection_list2[i][0];
								//var barcode = obj.selection_list1[i][1];
								//var bucket_item_id = obj.selection_list1[i][2];
								var item = obj.flesh_item_for_list( acp_id );
								if (item) {
									obj.list1.append( item );
									obj.copy_ids.push( acp_id );
								}
							}
						}
					],

					'copy_buckets_delete_item' : [
						['command'],
						function() {
							for (var i = 0; i < obj.selection_list2.length; i++) {
								try {
									//var acp_id = obj.selection_list2[i][0];
									//var barcode = obj.selection_list2[i][1];
									var bucket_item_id = obj.selection_list2[i][2];
									var robj = obj.network.simple_request('BUCKET_ITEM_DELETE',
										[ ses(), 'copy', bucket_item_id ]);
									if (typeof robj == 'object') throw robj;
								} catch(E) {
									obj.error.standard_unexpected_error_alert('Deletion likely failed.',E);
								}
                                                        }
							alert("Action completed.");
							setTimeout(
								function() {
									JSAN.use('util.widgets'); 
									util.widgets.dispatch('change_bucket',obj.controller.view.bucket_menulist);
								}, 0
							);
						}
					],
					'copy_buckets_delete_bucket' : [
						['command'],
						function() {
							try {
								var bucket = obj.controller.view.bucket_menulist.value;
								var name = obj.bucket_id_name_map[ bucket ];
								var conf = window.confirm('Delete the bucket named ' + name + '?');
								if (!conf) return;
								obj.list2.clear();
								var robj = obj.network.simple_request('BUCKET_DELETE',[ses(),'copy',bucket]);
								if (typeof robj == 'object') throw robj;
								alert("Action completed.");
								obj.controller.render('copy_buckets_menulist_placeholder');
							} catch(E) {
								obj.error.standard_unexpected_error_alert('Bucket deletion likely failed.',E);
							}
						}
					],
					'copy_buckets_new_bucket' : [
						['command'],
						function() {
							try {
								var name = prompt('What would you like to name the bucket?','','Bucket Creation');

								if (name) {
									var bucket = new ccb();
									bucket.btype('staff_client');
									bucket.owner( obj.data.list.au[0].id() );
									bucket.name( name );

									var robj = obj.network.simple_request('BUCKET_CREATE',[ses(),'copy',bucket]);

									if (typeof robj == 'object') {
										if (robj.ilsevent == 1710 /* CONTAINER_EXISTS */) {
											alert('You already have a bucket with that name.');
											return;
										}
										throw robj;
									}

									alert('Bucket "' + name + '" created.');

									obj.controller.render('copy_buckets_menulist_placeholder');
									obj.controller.view.bucket_menulist.value = robj;
									setTimeout(
										function() {
											JSAN.use('util.widgets'); 
											util.widgets.dispatch('change_bucket',obj.controller.view.bucket_menulist);
										}, 0
									);
								}
							} catch(E) {
								obj.error.standard_unexpected_error_alert('Bucket creation failed.',E);
							}
						}
					],
					'copy_buckets_batch_copy_edit' : [
						['command'],
						function() {
							try {

								obj.list2.select_all();
							
								JSAN.use('util.widgets'); JSAN.use('util.functional');

								var list = util.functional.map_list(
									obj.list2.dump_retrieve_ids(),
									function (o) {
										return JSON2js(o)[0]; // acp_id
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

								obj.render_pending_copies(); // FIXME -- need a generic refresh for lists
								setTimeout(
									function() {
										JSAN.use('util.widgets'); 
										util.widgets.dispatch('change_bucket',obj.controller.view.bucket_menulist);
									}, 0
								);
							} catch(E) {
								alert( js2JSON(E) );
							}
						}
					],
					'copy_buckets_batch_copy_delete' : [
						['command'],
						function() {
							try {
							
								obj.list2.select_all();

								JSAN.use('util.widgets'); JSAN.use('util.functional');

								var list = util.functional.map_list(
									obj.list2.dump_retrieve_ids(),
									function (o) {
										return JSON2js(o)[0]; // acp_id
									}
								);

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

								var robj = obj.network.simple_request('FM_ACP_FLESHED_BATCH_UPDATE',[ ses(), copies, true]);
								if (typeof robj.ilsevent != 'undefined') {
									switch(robj.ilsevent) {
										case 1227 /* COPY_DELETE_WARNING */ : 
											var copy;
											for (var i = 0; i < copies.length; i++) { if (copies[i].id()==robj.payload) copy = function(a){return a;}(copies[i]); }
											/* The copy in question is not in an ideal status for deleting */
											var err = '*** ' + robj.desc + ' ***\n';
											/* The barcode for the item is {1} */
											err += $('catStrings').getFormattedString('cat.barcode_for_item',[ copy.barcode() ]) + '\n';
											/* The whole batch operation failed */
											err += $('catStrings').getString('cat.batch_operation_failed') + '\n';
											alert(err);
										break;
										default: obj.error.standard_unexpected_error_alert('Batch Item Deletion',robj);
									}
								}

								obj.render_pending_copies(); // FIXME -- need a generic refresh for lists
								setTimeout(
									function() {
										JSAN.use('util.widgets'); 
										util.widgets.dispatch('change_bucket',obj.controller.view.bucket_menulist);
									}, 0
								);
							} catch(E) {
								alert( js2JSON(E) );
							}
						}
					],

					'copy_buckets_transfer_to_volume' : [
						['command'],
						function() {
							try {
								obj.list2.select_all();

								obj.data.stash_retrieve();
								if (!obj.data.marked_volume) {
									alert('Please mark a volume as the destination from within the copy browser and then try this again.');
									return;
								}

								var copy_ids = util.functional.map_list(
									obj.list2.dump_retrieve_ids(),
									function (o) {
										return JSON2js(o)[0]; // acp_id
									}
								)

								var volume = obj.network.simple_request('FM_ACN_RETRIEVE',[ obj.data.marked_volume ]);

								var msg = 'Transfer the items in bucket "';
								msg += obj.controller.view.bucket_menulist.getAttribute('label') + '" ';
								msg += 'from their original volumes to ';
								msg += obj.data.hash.aou[ volume.owning_lib() ].shortname() + "'s volume labelled ";
								msg += '"' + volume.label() + '" on the following record?';

								JSAN.use('cat.util'); cat.util.transfer_copies( { 
									'copy_ids' : copy_ids, 
									'message' : msg, 
									'docid' : volume.record(),
									'volume_label' : volume.label(),
									'owning_lib' : volume.owning_lib(),
								} );

								obj.render_pending_copies(); // FIXME -- need a generic refresh for lists
								setTimeout(
									function() {
										JSAN.use('util.widgets'); 
										util.widgets.dispatch('change_bucket',obj.controller.view.bucket_menulist);
									}, 0
								);
								
							} catch(E) {
								obj.error.standard_unexpected_error_alert('Items not likely transferred.',E);
							}
						}
					],
					'cmd_broken' : [
						['command'],
						function() { alert('Not Yet Implemented'); }
					],
					'cmd_copy_buckets_print' : [
						['command'],
						function() {
							JSAN.use('OpenILS.data'); var data = new OpenILS.data(); data.init({'via':'stash'});
							obj.list2.on_all_fleshed = function() {
								try {
									dump( js2JSON( obj.list2.dump_with_keys() ) + '\n' );
									data.stash_retrieve();
									var lib = data.hash.aou[ data.list.au[0].ws_ou() ];
									lib.children(null);
									var p = { 
										'lib' : lib,
										'staff' : data.list.au[0],
										'header' : data.print_list_templates.item_status.header,
										'line_item' : data.print_list_templates.item_status.line_item,
										'footer' : data.print_list_templates.item_status.footer,
										'type' : data.print_list_templates.item_status.type,
										'list' : obj.list2.dump_with_keys(),
									};
									JSAN.use('util.print'); var print = new util.print();
									print.tree_list( p );
									setTimeout(function(){obj.list2.on_all_fleshed = null;},0);
								} catch(E) {
									alert(E); 
								}
							}
							obj.list2.full_retrieve();
						}
					],
					'cmd_copy_buckets_export' : [
						['command'],
						function() {
							obj.list2.dump_csv_to_clipboard();
						}
					],
					'cmd_export1' : [
						['command'],
						function() {
							obj.list1.dump_csv_to_clipboard();
						}
					],

                    'cmd_print_export1' : [
                        ['command'],
                        function() {
                            try {
                                obj.list1.on_all_fleshed =
                                    function() {
                                        try {
                                            dump( obj.list1.dump_csv() + '\n' );
                                            //copy_to_clipboard(obj.list.dump_csv());
                                            JSAN.use('util.print'); var print = new util.print();
                                            print.simple(obj.list1.dump_csv(),{'content_type':'text/plain'});
                                            setTimeout(function(){ obj.list1.on_all_fleshed = null; },0);
                                        } catch(E) {
                                            obj.error.standard_unexpected_error_alert('print export',E);
                                        }
                                    }
                                obj.list1.full_retrieve();
                            } catch(E) {
                                obj.error.standard_unexpected_error_alert('print export',E);
                            }
                        }
                    ],


                    'cmd_print_export2' : [
                        ['command'],
                        function() {
                            try {
                                obj.list2.on_all_fleshed =
                                    function() {
                                        try {
                                            dump( obj.list2.dump_csv() + '\n' );
                                            //copy_to_clipboard(obj.list.dump_csv());
                                            JSAN.use('util.print'); var print = new util.print();
                                            print.simple(obj.list2.dump_csv(),{'content_type':'text/plain'});
                                            setTimeout(function(){ obj.list2.on_all_fleshed = null; },0);
                                        } catch(E) {
                                            obj.error.standard_unexpected_error_alert('print export',E);
                                        }
                                    }
                                obj.list2.full_retrieve();
                            } catch(E) {
                                obj.error.standard_unexpected_error_alert('print export',E);
                            }
                        }
                    ],

					'cmd_copy_buckets_reprint' : [
						['command'],
						function() {
						}
					],
					'cmd_copy_buckets_done' : [
						['command'],
						function() {
							window.close();
						}
					],
					'cmd_export_to_copy_status' : [
						['command'],
						function() {
							try {
								obj.list2.select_all();
								JSAN.use('util.functional');
								var barcodes = util.functional.map_list(
									obj.list2.dump_retrieve_ids(),
									function(o) { return JSON2js(o)[1]; }
								);
								var url = urls.XUL_COPY_STATUS; // + '?barcodes=' + window.escape( js2JSON(barcodes) );
								//JSAN.use('OpenILS.data'); var data = new OpenILS.data(); data.stash_retrieve();
								//data.temp_barcodes_for_copy_status = barcodes;
								//data.stash('temp_barcodes_for_copy_status');
								xulG.new_tab( url, {}, { 'barcodes' : barcodes });
							} catch(E) {
								obj.error.standard_unexpected_error_alert('Copy Status from Copy Buckets',E);
							}
						}
					],
				}
			}
		);
		this.controller.render();

		if (typeof xulG == 'undefined') {
			obj.controller.view.cmd_export_to_copy_status.disabled = true;
			obj.controller.view.cmd_export_to_copy_status.setAttribute('disabled',true);
		} else {
			obj.controller.view.cmd_copy_buckets_done.disabled = true;
			obj.controller.view.cmd_copy_buckets_done.setAttribute('disabled',true);
		}
	
	},

	'flesh_item_for_list' : function(acp_id,bucket_item_id) {
		var obj = this;
		try {
			var copy = obj.network.simple_request( 'FM_ACP_RETRIEVE', [ acp_id ]);
			if (copy == null || typeof copy.ilsevent != 'undefined') {
				throw(copy);
			} else {
				var item = {
					'retrieve_id' : js2JSON( [ copy.id(), copy.barcode(), bucket_item_id ] ),
					'row' : {
						'my' : {
							'mvr' : obj.network.simple_request('MODS_SLIM_RECORD_RETRIEVE_VIA_COPY', [ copy.id() ]),
							'acp' : copy,
						}
					}
				};
				return item;
			}
		} catch(E) {
			obj.error.standard_unexpected_error_alert('List building failed.',E);
			return null;
		}

	},
	
}

dump('exiting cat.copy_buckets.js\n');
