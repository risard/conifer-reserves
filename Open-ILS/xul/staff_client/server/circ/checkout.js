dump('entering circ.checkout.js\n');

if (typeof circ == 'undefined') circ = {};
circ.checkout = function (params) {

	JSAN.use('util.error'); this.error = new util.error();
	JSAN.use('util.network'); this.network = new util.network();
	JSAN.use('OpenILS.data'); this.data = new OpenILS.data(); this.data.init({'via':'stash'});
}

circ.checkout.prototype = {

	'init' : function( params ) {

		var obj = this;

		obj.patron_id = params['patron_id'];
		obj.patron = obj.network.simple_request('FM_AU_RETRIEVE_VIA_ID',[ses(),obj.patron_id]);

		JSAN.use('circ.util');
		var columns = circ.util.columns( 
			{ 
				'barcode' : { 'hidden' : false },
				'title' : { 'hidden' : false },
				'due_date' : { 'hidden' : false },
			} 
		);

		JSAN.use('util.list'); obj.list = new util.list('checkout_list');
		obj.list.init(
			{
				'columns' : columns,
				'map_row_to_column' : circ.util.std_map_row_to_column(),
				'on_select' : function() {
					var sel = obj.list.retrieve_selection();
					document.getElementById('clip_button').disabled = sel.length < 1;
				}
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
					'checkout_menu_placeholder' : [
						['render'],
						function(e) {
							return function() {
								JSAN.use('util.widgets'); JSAN.use('util.functional'); JSAN.use('util.fm_utils');
								var items = [ [ 'Barcode:' , 'barcode' ] ].concat(
									util.functional.map_list(
										util.functional.filter_list(
											obj.data.list.cnct,
											function(o) {
												return util.fm_utils.compare_aou_a_is_b_or_ancestor(o.owning_lib(), obj.data.list.au[0].ws_ou());
											}
										),
										function(o) {
											return [ o.name(), o.id() ];
										}
									)
								);
								g.error.sdump('D_TRACE','items = ' + js2JSON(items));
								util.widgets.remove_children( e );
								var ml = util.widgets.make_menulist(
									items
								);
								e.appendChild( ml );
								ml.setAttribute('id','checkout_menulist');
								ml.setAttribute('accesskey','');
								ml.addEventListener(
									'command',
									function(ev) {
										var tb = obj.controller.view.checkout_barcode_entry_textbox;
										var db = document.getElementById('duedate_hbox');
										if (ev.target.value == 'barcode') {
											db.hidden = false;
											tb.disabled = false;
											tb.value = '';
											tb.focus();
										} else {
											db.hidden = true;
											tb.disabled = true;
											tb.value = 'Non-Cataloged';
										}
									}, false
								);
								obj.controller.view.checkout_menu = ml;
							};
						},
					],
					'checkout_barcode_entry_textbox' : [
						['keypress'],
						function(ev) {
							if (ev.keyCode && ev.keyCode == 13) {
								obj.checkout( { barcode: ev.target.value } );
							}
						}
					],
					'checkout_duedate_menu' : [
						['change'],
						function(ev) { 
							try {
								obj.check_date(ev.target);
								ev.target.parentNode.setAttribute('style','');
							} catch(E) {
								ev.target.parentNode.setAttribute('style','background-color: red');
								alert(E + '\nUse this format: YYYY-MM-DD');
								try {
									ev.target.inputField.select();
									ev.target.inputField.focus();
								} catch(E) { /* this should work, let me try on other platforms */ 
									obj.error.sdump('D_ERROR','menulist.inputField: ' + E);
								}
							}
						}
					],
					'cmd_broken' : [
						['command'],
						function() { alert('Not Yet Implemented'); }
					],
					'cmd_checkout_submit' : [
						['command'],
						function() {
							var params = {}; var count = 1;

							if (obj.controller.view.checkout_menu.value == 'barcode' ||
								obj.controller.view.checkout_menu.value == '') {
								params.barcode = obj.controller.view.checkout_barcode_entry_textbox.value;
							} else {
								params.noncat = 1;
								params.noncat_type = obj.controller.view.checkout_menu.value;
								netscape.security.PrivilegeManager.enablePrivilege('UniversalXPConnect UniversalBrowserWrite');
								var r = window.prompt('Enter the number of ' + obj.data.hash.cnct[ params.noncat_type].name() + ' circulating:','1','Non-cataloged Items');
								if (r) {
									count = Number(r);
									if (count > 0) {
										if (count > 99) {
											obj.error.yns_alert('You tried to circulate ' + count + ' ' + obj.data.hash.cnct[ params.noncat_type].name() + '.  The maximum is 99 per action.','Non-cataloged Circulation','OK',null,null,'Check here to confirm this message.');
											return;
										} else if (count > 20) {
											r = obj.error.yns_alert('Are you sure you want to circulate ' + count + ' ' + obj.data.hash.cnct[ params.noncat_type].name() + '?','Non-cataloged Circulation','Yes','No',null,'Check here to confirm this message.');
											if (r != 0) return;
										}
									} else {
										r = obj.error.yns_alert('Error with non-cataloged checkout.  ' + r + ' is not a valid number.','Non-cataloged Circulation','Ok',null,null,'Check here to confirm this message.');
										return;
									}
								} else {
									return;
								}
							}
							for (var i = 0; i < count; i++) {
								obj.checkout( params );
							}
						}
					],
					'cmd_checkout_print' : [
						['command'],
						function() {
							try {
								obj.print();
							} catch(E) {
								obj.error.standard_unexpected_error_alert('cmd_checkout_print',E);
							}

						}
					],
					'cmd_checkout_reprint' : [
						['command'],
						function() {
							JSAN.use('util.print'); var print = new util.print();
							print.reprint_last();
						}
					],
					'cmd_checkout_done' : [
						['command'],
						function() {
							try {
								if (document.getElementById('checkout_auto').checked) {
									obj.print(true,function() { 
										obj.list.clear();
										xulG.set_tab(urls.XUL_PATRON_BARCODE_ENTRY,{},{}); 
									});
								} else {
									obj.print(false,function() {
										obj.list.clear();
										xulG.set_tab(urls.XUL_PATRON_BARCODE_ENTRY,{},{});
									});
								}
							} catch(E) {
								obj.error.standard_unexpected_error_alert('cmd_checkout_done',E);
							}
						}
					],
				}
			}
		);
		this.controller.render();
		//this.controller.view.checkout_barcode_entry_textbox.focus();
		default_focus();

		this.check_disable();

	},

	'check_disable' : function() {
		var obj = this;
		try {
			if (typeof xulG.check_stop_checkouts == 'function') {
				var disable = xulG.check_stop_checkouts();
				if (disable) {
					document.getElementById('checkout_submit_barcode_button').disabled = true;
					document.getElementById('checkout_done').disabled = true;
					obj.controller.view.checkout_menu.disabled = true;
					obj.controller.view.checkout_barcode_entry_textbox.disabled = true;
				} else {
					document.getElementById('checkout_submit_barcode_button').disabled = false;
					document.getElementById('checkout_done').disabled = false;
					obj.controller.view.checkout_menu.disabled = false;
					obj.controller.view.checkout_barcode_entry_textbox.disabled = false;
				}
			}
		} catch(E) {
			obj.error.standard_unexpected_error_alert('Error determining whether to disable checkout.',E);
		}
	},

	'print' : function(silent,f) {
		var obj = this;
		try {
			dump( js2JSON( obj.list.dump_with_keys() ) + '\n' );
			obj.list.on_all_fleshed = function() {
				try {
					var params = { 
						'patron' : obj.patron, 
						'lib' : obj.data.hash.aou[ obj.data.list.au[0].ws_ou() ],
						'staff' : obj.data.list.au[0],
						'header' : obj.data.print_list_templates.checkout.header,
						'line_item' : obj.data.print_list_templates.checkout.line_item,
						'footer' : obj.data.print_list_templates.checkout.footer,
						'type' : obj.data.print_list_templates.checkout.type,
						'list' : obj.list.dump_with_keys(),
					};
					if (silent) params.no_prompt = true;
					JSAN.use('util.print'); var print = new util.print();
					print.tree_list( params );
					setTimeout(function(){obj.list.on_all_fleshed = null;if (typeof f == 'function') f();},0);
				} catch(E) {
					obj.error.standard_unexpected_error_alert('print',E);
				}
			}
			obj.list.full_retrieve();
		} catch(E) {
			obj.error.standard_unexpected_error_alert('print',E);
		}
	},

	'check_date' : function(node) {
		JSAN.use('util.date');
		try {
			if (node.value == 'Normal') return true;
			var pattern = node.value.match(/Today \+ (\d+) days/);
			if (pattern) {
				var today = new Date();
				var todayPlus = new Date(); todayPlus.setTime( today.getTime() + 24*60*60*1000*pattern[1] );
				node.value = util.date.formatted_date(todayPlus,"%F");
			}
			if (! util.date.check('YYYY-MM-DD',node.value) ) { throw('Invalid Date'); }
			if (util.date.check_past('YYYY-MM-DD',node.value) ) { throw('Due date needs to be after today.'); }
			if ( util.date.formatted_date(new Date(),'%F') == node.value) { throw('Due date needs to be after today.'); }
			return true;
		} catch(E) {
			throw(E);
		}
	},

	'checkout' : function(params) {
		var obj = this;

		try { obj.check_date(obj.controller.view.checkout_duedate_menu); } catch(E) { return; }
		if (obj.controller.view.checkout_duedate_menu.value != 'Normal') {
			params.due_date = obj.controller.view.checkout_duedate_menu.value;
		}

		if (! (params.barcode||params.noncat)) return;

		/**********************************************************************************************************************/
		/* This does the actual checkout/renewal, but is called after a permit test further below */
		function check_out(params) {

			var checkout = obj.network.request(
				api.CHECKOUT.app,
				api.CHECKOUT.method,
				[ ses(), params ]
			);

			if (checkout.ilsevent == 0) {

				if (!checkout.payload) checkout.payload = {};

				if (!checkout.payload.circ) {
					checkout.payload.circ = new aoc();
					/*********************************************************************************************/
					/* Non Cat */
					if (checkout.payload.noncat_circ) {
						checkout.payload.circ.circ_lib( checkout.payload.noncat_circ.circ_lib() );
						checkout.payload.circ.circ_staff( checkout.payload.noncat_circ.staff() );
						checkout.payload.circ.usr( checkout.payload.noncat_circ.patron() );
						
						JSAN.use('util.date');
						var c = checkout.payload.noncat_circ.circ_time();
						var d = c == "now" ? new Date() : util.date.db_date2Date( c );
						var t =obj.data.hash.cnct[ checkout.payload.noncat_circ.item_type() ];
						var cd = t.circ_duration() || "14 days";
						var i = util.date.interval_to_seconds( cd ) * 1000;
						d.setTime( Date.parse(d) + i );
						checkout.payload.circ.due_date( util.date.formatted_date(d,'%F') );

					}
				}

				if (!checkout.payload.record) {
					checkout.payload.record = new mvr();
					/*********************************************************************************************/
					/* Non Cat */
					if (checkout.payload.noncat_circ) {
						checkout.payload.record.title(
							obj.data.hash.cnct[ checkout.payload.noncat_circ.item_type() ].name()
						);
					}
				}

				if (!checkout.payload.copy) {
					checkout.payload.copy = new acp();
					checkout.payload.copy.barcode( '' );
				}

				/*********************************************************************************************/
				/* Override mvr title/author with dummy title/author for Pre cat */
				if (checkout.payload.copy.dummy_title())  checkout.payload.record.title( checkout.payload.copy.dummy_title() );
				if (checkout.payload.copy.dummy_author())  checkout.payload.record.author( checkout.payload.copy.dummy_author() );

				obj.list.append(
					{
						'row' : {
							'my' : {
							'circ' : checkout.payload.circ,
							'mvr' : checkout.payload.record,
							'acp' : checkout.payload.copy
							}
						}
					//I could override map_row_to_column here
					}
				);
				if (typeof obj.on_checkout == 'function') {
					obj.on_checkout(checkout.payload);
				}
				if (typeof window.xulG == 'object' && typeof window.xulG.on_list_change == 'function') {
					window.xulG.on_list_change(checkout.payload);
				} else {
					obj.error.sdump('D_CIRC','circ.checkout: No external .on_checkout()\n');
				}

			} else {
				throw(checkout);
			}
		}

		/**********************************************************************************************************************/
		/* Permissibility test before checkout */
		try {

			params.patron = obj.patron_id;

			var permit = obj.network.request(
				api.CHECKOUT_PERMIT.app,
				api.CHECKOUT_PERMIT.method,
				[ ses(), params ],
				null,
				{
					'title' : 'Override Checkout Failure?',
					'overridable_events' : [ 
						1212 /* PATRON_EXCEEDS_OVERDUE_COUNT */,
						1213 /* PATRON_BARRED */,
						1215 /* CIRC_EXCEEDS_COPY_RANGE */,
						7002 /* PATRON_EXCEEDS_CHECKOUT_COUNT */,
						7003 /* COPY_CIRC_NOT_ALLOWED */,
						7004 /* COPY_NOT_AVAILABLE */, 
						7006 /* COPY_IS_REFERENCE */, 
						7010 /* COPY_ALERT_MESSAGE */,
						7013 /* PATRON_EXCEEDS_FINES */,
					],
					'text' : {
						'7004' : function(r) {
							//return obj.data.hash.ccs[ r.payload ].name();
							return r.payload.status().name();
							//return r.payload.name();
							//return r.payload;
						},
						'7010' : function(r) {
							return r.payload;
						},
					}
				}
			);

			if (!permit) throw(permit);

			function test_event(list,ev) {
				if (typeof list.ilsevent != 'undefined' ) {
					if (list.ilsevent == ev) {
						return list;
					} else {
						return false;
					}
				} else {
					for (var i = 0; i < list.length; i++) {
						if (typeof list[i].ilsevent != 'undefined') {
							if (list[i].ilsevent == ev) return list[i];
						}
					}
					return false;
				}
			}

			/**********************************************************************************************************************/
			/* Normal case, proceed with checkout */
			if (permit.ilsevent == 0) {

				JSAN.use('util.sound'); var sound = new util.sound(); sound.circ_good();
				params.permit_key = permit.payload;
				check_out( params );

			/**********************************************************************************************************************/
			/* Item not cataloged or barcode mis-scan.  Prompt for pre-cat option */
			} else {
			
				var found_handled = false; var found_not_handled = false; var msg = '';	

				if (test_event(permit,1202 /* ITEM_NOT_CATALOGED */)) {

					if ( 1 == obj.error.yns_alert(
						'Mis-scan or non-cataloged item.  Checkout as a pre-cataloged item?',
						'Alert',
						'Cancel',
						'Pre-Cat',
						null,
						'Check here to confirm this action'
					) ) {

						obj.data.dummy_title = ''; obj.data.dummy_author = ''; obj.data.stash('dummy_title','dummy_author');
						JSAN.use('util.window'); var win = new util.window();
						win.open(urls.XUL_PRE_CAT, 'dummy_fields', 'chrome,resizable,modal');
						obj.data.stash_retrieve();

						params.permit_key = permit.payload;
						params.dummy_title = obj.data.dummy_title;
						params.dummy_author = obj.data.dummy_author;
						params.precat = 1;

						if (params.dummy_title != '') { check_out( params ); } else { throw('Checkout cancelled'); }
					} 
				};

				var test_permit;
				if (typeof permit.ilsevent != 'undefined') { test_permit = [ permit ]; } else { test_permit = permit; }

				var stop_checkout = false;
				for (var i = 0; i < test_permit.length; i++) {
					switch(test_permit[i].ilsevent) {
						case 1217 /* PATRON_INACTIVE */ :
						case 1224 /* PATRON_ACCOUNT_EXPIRED */ :
							stop_checkout = true;
						break;
					}
				}

				for (var i = 0; i < test_permit.length; i++) {
					dump('found [' + test_permit[i].ilsevent + ']\n');
					switch(test_permit[i].ilsevent) {
						case 1212 /* PATRON_EXCEEDS_OVERDUE_COUNT */ :
							found_handled = true;
						break;
						case 1213 /* PATRON_BARRED */ :
							found_handled = true;
						break;
						case 1215 /* CIRC_EXCEEDS_COPY_RANGE */ :
							found_handled = true;
						break;
						case 1217 /* PATRON_INACTIVE */ :
							found_handled = true;
							msg += 'This account is inactive and may not circulate items.\n';
							obj.error.yns_alert(msg,'Check Out Failed','OK',null,null,'Check here to confirm this message');
						break;
						case 1224 /* PATRON_ACCOUNT_EXPIRED */ :
							found_handled = true;
							msg += 'This account has expired  and may not circulate items.\n';
							obj.error.yns_alert(msg,'Check Out Failed','OK',null,null,'Check here to confirm this message');
						break;
						case 7013 /* PATRON_EXCEEDS_FINES */ :
							found_handled = true;
						break;
						case 7002 /* PATRON_EXCEEDS_CHECKOUT_COUNT */ :
							found_handled = true;
						break;
						case 7003 /* COPY_CIRC_NOT_ALLOWED */ :
							found_handled = true;
						break;
						case 7004 /* COPY_NOT_AVAILABLE */ :
							msg += test_permit[i].desc + '\n' + 'Copy status = ' + ( test_permit[i].payload.status().name() ) + '\n';
							found_handled = true;
						break;
						case 7006 /* COPY_IS_REFERENCE */ :
							msg += test_permit[i].desc + '\n';
							found_handled = true;
						break;
						case 7010 /* COPY_ALERT_MESSAGE */ :
							msg += test_permit[i].desc + '\n' + 'Alert Message = ' + test_permit[i].payload + '\n';
							found_handled = true;
						break;
						case 1202 /* ITEM_NOT_CATALOGED */ :
							found_handled = true;
						break;
						case 5000 /* PERM_FAILURE */ :
							msg += test_permit[i].desc + '\n' + 'Permission Denied = ' + test_permit[i].ilsperm + '\n';
							found_handled = true;
						break;
						case 1702 /* OPEN_CIRCULATION_EXISTS */ :
							msg += test_permit[i].desc + '\n';
							found_handled = true;

							var my_copy = obj.network.simple_request('FM_ACP_RETRIEVE_VIA_BARCODE',[params.barcode]);
							if (typeof my_copy.ilsevent != 'undefined') throw(my_copy);
							var my_circ = obj.network.simple_request('FM_CIRC_RETRIEVE_VIA_COPY',[ses(),my_copy.id(),1]);
							if (typeof my_circ.ilsevent != 'undefined') throw(my_copy);
							my_circ = my_circ[0];
							var due_date = my_circ.due_date() ? my_circ.due_date().substr(0,10) : null;
							JSAN.use('util.date'); var today = util.date.formatted_date(new Date(),'%F');
							if (due_date) if (today > due_date) msg += '\nThis item was due on ' + due_date + '.\n';
							if (! stop_checkout ) {
								var r = obj.error.yns_alert(msg,'Check Out Failed','Cancel','Checkin then Checkout', due_date ? (today > due_date ? 'Forgiving Checkin then Checkout' : null) : null,'Check here to confirm this message');
								JSAN.use('circ.util');
								switch(r) {
									case 1:
										circ.util.checkin_via_barcode( ses(), params.barcode );
										obj.checkout(params);
									break;
									case 2:
										circ.util.checkin_via_barcode( ses(), params.barcode, due_date );
										obj.checkout(params);
									break;
								}
							} else {
								obj.error.yns_alert(msg,'Check Out Failed','OK',null,null,'Check here to confirm this message');
							}
						break;
						case 7014 /* COPY_IN_TRANSIT */ :
							msg += test_permit[i].desc + '\n';
							found_handled = true;
							if (! stop_checkout ) {
								var r = obj.error.yns_alert(msg,'Check Out Failed','Cancel','Abort Transit then Checkout',null,'Check here to confirm this message');
								switch(r) {
									case 1:
										var robj = obj.network.simple_request('FM_ATC_VOID',[ ses(), { 'barcode' : params.barcode } ]);
										if (typeof robj.ilsevent == 'undefined') {
											obj.checkout(params);
										} else {
											if (robj.ilsevent != 5000 /* PERM_FAILURE */) throw(robj);
										}
									break;
								}
							} else {
								obj.error.yns_alert(msg,'Check Out Failed','OK',null,null,'Check here to confirm this message');
							}
						break;
						case -1 /* NETWORK_FAILURE */ :
							msg += 'There was a network failure.\n';
							found_handled = true;
							obj.error.yns_alert(msg,'Check Out Failed','OK',null,null,'Check here to confirm this message');
						break;
						default:
							msg += 'FIXME: ' + js2JSON(test_permit[i]) + '\n';
							found_not_handled = true;
						break;
					}
				}
				
				if (found_not_handled) {
					obj.error.standard_unexpected_error_alert(msg,permit);
				}

				obj.controller.view.checkout_barcode_entry_textbox.select();
				obj.controller.view.checkout_barcode_entry_textbox.focus();
			}

		} catch(E) {
			if (typeof E.ilsevent != 'undefined' && E.ilsevent == -1) {
				obj.error.standard_network_error_alert('Check Out Failed.  If you wish to use the offline interface, in the top menubar select Circulation -> Offline Interface');
			} else {
				obj.error.standard_unexpected_error_alert('Check Out Failed',E);
			}
			if (typeof obj.on_failure == 'function') {
				obj.on_failure(E);
			}
			if (typeof window.xulG == 'object' && typeof window.xulG.on_failure == 'function') {
				obj.error.sdump('D_CIRC','circ.checkout: Calling external .on_failure()\n');
				window.xulG.on_failure(E);
			} else {
				obj.error.sdump('D_CIRC','circ.checkout: No external .on_failure()\n');
			}
		}

	},

	'on_checkout' : function() {
		this.controller.view.checkout_menu.selectedIndex = 0;
		this.controller.view.checkout_barcode_entry_textbox.disabled = false;
		this.controller.view.checkout_barcode_entry_textbox.value = '';
		this.controller.view.checkout_barcode_entry_textbox.focus();
		document.getElementById('duedate_hbox').hidden = false;
	},

	'on_failure' : function() {
		this.controller.view.checkout_barcode_entry_textbox.select();
		this.controller.view.checkout_barcode_entry_textbox.focus();
	}
}

dump('exiting circ.checkout.js\n');
