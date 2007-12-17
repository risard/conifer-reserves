dump('entering circ.checkin.js\n');

if (typeof circ == 'undefined') circ = {};
circ.checkin = function (params) {

	JSAN.use('util.error'); this.error = new util.error();
	JSAN.use('util.network'); this.network = new util.network();
	JSAN.use('util.barcode');
	JSAN.use('util.date');
	this.OpenILS = {}; JSAN.use('OpenILS.data'); this.OpenILS.data = new OpenILS.data(); this.OpenILS.data.init({'via':'stash'});
	this.data = this.OpenILS.data;
}

circ.checkin.prototype = {

	'selection_list' : [],

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
				'route_to' : { 'hidden' : false },
				'alert_message' : { 'hidden' : false },
				'checkin_time' : { 'hidden' : false },
			},
			{
				'except_these' : [ 'uses', 'checkin_time_full' ],
			}
		);

		JSAN.use('util.list'); obj.list = new util.list('checkin_list');
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
						obj.error.sdump('D_TRACE', 'circ/copy_status: selection list = ' + js2JSON(obj.selection_list) );
						if (obj.selection_list.length == 0) {
							obj.controller.view.sel_edit.setAttribute('disabled','true');
							obj.controller.view.sel_opac.setAttribute('disabled','true');
							obj.controller.view.sel_patron.setAttribute('disabled','true');
							obj.controller.view.sel_last_patron.setAttribute('disabled','true');
							obj.controller.view.sel_copy_details.setAttribute('disabled','true');
							obj.controller.view.sel_bucket.setAttribute('disabled','true');
							obj.controller.view.sel_spine.setAttribute('disabled','true');
							obj.controller.view.sel_transit_abort.setAttribute('disabled','true');
							obj.controller.view.sel_clip.setAttribute('disabled','true');
							obj.controller.view.sel_mark_items_damaged.setAttribute('disabled','true');
						} else {
							obj.controller.view.sel_edit.setAttribute('disabled','false');
							obj.controller.view.sel_opac.setAttribute('disabled','false');
							obj.controller.view.sel_patron.setAttribute('disabled','false');
							obj.controller.view.sel_last_patron.setAttribute('disabled','false');
							obj.controller.view.sel_copy_details.setAttribute('disabled','false');
							obj.controller.view.sel_bucket.setAttribute('disabled','false');
							obj.controller.view.sel_spine.setAttribute('disabled','false');
							obj.controller.view.sel_transit_abort.setAttribute('disabled','false');
							obj.controller.view.sel_clip.setAttribute('disabled','false');
							obj.controller.view.sel_mark_items_damaged.setAttribute('disabled','false');
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
					'sel_edit' : [
						['command'],
						function() {
							try {
								obj.spawn_copy_editor();
							} catch(E) {
								alert(E);
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
							JSAN.use('circ.util');
							circ.util.abort_transits(obj.selection_list);
						}
					],
					'sel_patron' : [
						['command'],
						function() {
							JSAN.use('circ.util');
							circ.util.show_last_few_circs(obj.selection_list);
						}
					],
					'sel_last_patron' : [
						['command'],
						function() {
							var patrons = {};
							for (var i = 0; i < obj.selection_list.length; i++) {
								var circs = obj.network.simple_request('FM_CIRC_RETRIEVE_VIA_COPY',[ses(),obj.selection_list[i].copy_id,1]);
								if (circs.length > 0) {
									patrons[circs[0].usr()] = 1;
								} else {
									alert('Item ' + obj.selection_list[i].barcode + ' has never circulated');
								}
							}
							for (var i in patrons) {
								xulG.new_tab(urls.XUL_PATRON_DISPLAY,{},{'id' : i});
							}
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
					'sel_mark_items_damaged' : [
						['command'],
						function() {
							var funcs = [];
							JSAN.use('cat.util'); JSAN.use('util.functional');
							cat.util.mark_item_damaged( util.functional.map_list( obj.selection_list, function(o) { return o.copy_id; } ) );
						}
					],
					'sel_bucket' : [
						['command'],
						function() {
							JSAN.use('cat.util');
							cat.util.add_copies_to_bucket(obj.selection_list);
						}
					],
					'checkin_barcode_entry_textbox' : [
						['keypress'],
						function(ev) {
							if (ev.keyCode && ev.keyCode == 13) {
								obj.checkin();
							}
						}
					],
					'checkin_effective_date_label' : [
						['render'],
						function(e) {
							return function() {
								obj.controller.view.checkin_effective_date_textbox.value =
									util.date.formatted_date(new Date(),'%F');
							};
						}
					],
					'checkin_effective_date_textbox' : [
						['change'],
						function(ev) {
							if (ev.target.nodeName == 'textbox') {
								try {
									var flag = false;
									var darray = ev.target.value.split('-');
									var year = darray[0]; var month = darray[1]; var day = darray[2]; 
									if ( (!year) || (year.length != 4) || (!Number(year)) ) flag = true;
									if ( (!month) || (month.length !=2) || (!Number(month)) ) flag = true;
									if ( (!day) || (day.length !=2) || (!Number(day)) ) flag = true;
									if (flag) {
										throw('invalid date format');
									}
									var d = new Date( year, month - 1, day );
									if (d.toString() == 'Invalid Date') throw('Invalid Date');
									if ( d > new Date() ) throw('Future Date');
									ev.target.value = util.date.formatted_date(d,'%F');
									var x = document.getElementById('background');
									if (x) {
										if ( ev.target.value == util.date.formatted_date(new Date(),'%F') ) {
											x.setAttribute('style','background-color: green');
											document.getElementById('background-text').setAttribute('value','Check In / Process Item');
										} else {
											x.setAttribute('style','background-color: red');
											document.getElementById('background-text').setAttribute('value','Backdated ' + ev.target.value + ' Check In');
										}
									}

								} catch(E) {
									dump('checkin:effective_date: ' + E + '\n');
									alert('Problem setting backdate: ' + E);
									ev.target.value = util.date.formatted_date(new Date(),'%F');
								}
							}
						}
					],
					'cmd_broken' : [
						['command'],
						function() { alert('Not Yet Implemented'); }
					],
					'cmd_checkin_submit_barcode' : [
						['command'],
						function() {
							obj.checkin();
						}
					],
					'cmd_checkin_print' : [
						['command'],
						function() {
							var p = { 
								'template' : 'checkin'
							};
							obj.list.print(p);
						}
					],
					'cmd_checkin_export' : [
						['command'],
						function() {
							obj.list.dump_csv_to_clipboard();
						}
					],

					'cmd_checkin_reprint' : [
						['command'],
						function() {
							JSAN.use('util.print'); var print = new util.print();
							print.reprint_last();
						}
					],
					'cmd_checkin_done' : [
						['command'],
						function() {
						}
					],
				}
			}
		);
		this.controller.render();
		this.controller.view.checkin_barcode_entry_textbox.focus();

	},

	'test_barcode' : function(bc) {
		var obj = this;
		var x = document.getElementById('strict_barcode');
		if (x && x.checked != true) return true;
		var good = util.barcode.check(bc);
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

	'checkin' : function() {
		var obj = this;
		try {
			var barcode = obj.controller.view.checkin_barcode_entry_textbox.value;
			if (!barcode) return;
			if (barcode) {
				if ( obj.test_barcode(barcode) ) { /* good */ } else { /* bad */ return; }
			}
			var backdate = obj.controller.view.checkin_effective_date_textbox.value;
			var auto_print = document.getElementById('checkin_auto');
			if (auto_print) auto_print = auto_print.checked;
			JSAN.use('circ.util');
			circ.util.checkin_via_barcode(
				ses(), { 'barcode' : barcode }, backdate, auto_print, {
					'disable_textbox' : function() { 
						obj.controller.view.checkin_barcode_entry_textbox.disabled = true; 
						obj.controller.view.cmd_checkin_submit_barcode.setAttribute('disabled', 'true'); 
					},
					'enable_textbox' : function() { 
						obj.controller.view.checkin_barcode_entry_textbox.disabled = false; 
						obj.controller.view.cmd_checkin_submit_barcode.setAttribute('disabled', 'false'); 
					},
					'checkin_result' : function(checkin) {
						obj.controller.view.checkin_barcode_entry_textbox.disabled = false;
						obj.controller.view.cmd_checkin_submit_barcode.setAttribute('disabled', 'false'); 
						obj.checkin2(checkin,backdate);
					}
				}
			);
		} catch(E) {
			obj.error.standard_unexpected_error_alert('Something went wrong in circ.util.checkin: ',E);
			if (typeof obj.on_failure == 'function') {
				obj.on_failure(E);
			}
			if (typeof window.xulG == 'object' && typeof window.xulG.on_failure == 'function') {
				obj.error.sdump('D_CIRC','circ.util.checkin: Calling external .on_failure()\n');
				window.xulG.on_failure(E);
			} else {
				obj.error.sdump('D_CIRC','circ.util.checkin: No external .on_failure()\n');
			}
		}

	},

	'checkin2' : function(checkin,backdate) {
		var obj = this;
		try {
			if (!checkin) return obj.on_failure(); /* circ.util.checkin handles errors and returns null currently */
			if (checkin.ilsevent == 7010 /* COPY_ALERT_MESSAGE */
				|| checkin.ilsevent == 1203 /* COPY_BAD_STATUS */
				|| checkin.ilsevent == -1 /* offline */
				|| checkin.ilsevent == 1502 /* ASSET_COPY_NOT_FOUND */
				|| checkin.ilsevent == 1203 /* COPY_BAD_STATUS */
				|| checkin.ilsevent == 7009 /* CIRC_CLAIMS_RETURNED */ 
				|| checkin.ilsevent == 7011 /* COPY_STATUS_LOST */ 
				|| checkin.ilsevent == 7012 /* COPY_STATUS_MISSING */) return obj.on_failure();
			var retrieve_id = js2JSON( { 'copy_id' : checkin.copy.id(), 'barcode' : checkin.copy.barcode(), 'doc_id' : (typeof checkin.record != 'undefined' ? ( typeof checkin.record.ilsevent == 'undefined' ? checkin.record.doc_id() : null ) : null ) } );
			if (checkin.circ && checkin.circ.checkin_time() == 'now') checkin.circ.checkin_time(backdate);
			if (document.getElementById('trim_list')) {
				var x = document.getElementById('trim_list');
				if (x.checked) { obj.list.trim_list = 20; } else { obj.list.trim_list = null; }
			}
			obj.list.append(
				{
					'retrieve_id' : retrieve_id,
					'row' : {
						'my' : {
							'circ' : checkin.circ,
							'mvr' : checkin.record,
							'acp' : checkin.copy,
							'status' : checkin.status,
							'route_to' : checkin.route_to,
							'message' : checkin.message,
						}
					},
					'to_top' : true,
				//I could override map_row_to_column here
				}
			);
			obj.list.node.view.selection.select(0);

			JSAN.use('util.sound'); var sound = new util.sound(); sound.circ_good();

			if (typeof obj.on_checkin == 'function') {
				obj.on_checkin(checkin);
			}
			if (typeof window.xulG == 'object' && typeof window.xulG.on_checkin == 'function') {
				obj.error.sdump('D_CIRC','circ.checkin: Calling external .on_checkin()\n');
				window.xulG.on_checkin(checkin);
			} else {
				obj.error.sdump('D_CIRC','circ.checkin: No external .on_checkin()\n');
			}

			return true;

		} catch(E) {
			obj.error.standard_unexpected_error_alert('Something went wrong in circ.util.checkin2: ',E);
			if (typeof obj.on_failure == 'function') {
				obj.on_failure(E);
			}
			if (typeof window.xulG == 'object' && typeof window.xulG.on_failure == 'function') {
				obj.error.sdump('D_CIRC','circ.util.checkin2: Calling external .on_failure()\n');
				window.xulG.on_failure(E);
			} else {
				obj.error.sdump('D_CIRC','circ.util.checkin2: No external .on_failure()\n');
			}
		}

	},

	'on_checkin' : function() {
		this.controller.view.checkin_barcode_entry_textbox.disabled = false;
		this.controller.view.checkin_barcode_entry_textbox.select();
		this.controller.view.checkin_barcode_entry_textbox.value = '';
		this.controller.view.checkin_barcode_entry_textbox.focus();
	},

	'on_failure' : function() {
		this.controller.view.checkin_barcode_entry_textbox.disabled = false;
		this.controller.view.checkin_barcode_entry_textbox.select();
		this.controller.view.checkin_barcode_entry_textbox.focus();
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

dump('exiting circ.checkin.js\n');
