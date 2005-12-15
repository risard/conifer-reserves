dump('entering circ/util.js\n');

if (typeof circ == 'undefined') var circ = {};
circ.util = {};

circ.util.EXPORT_OK	= [ 
	'columns', 'checkin_via_barcode', 'std_map_row_to_column', 'hold_capture_by_copy_barcode'
];
circ.util.EXPORT_TAGS	= { ':all' : circ.util.EXPORT_OK };

circ.util.columns = function(modify) {
	
	JSAN.use('OpenILS.data'); var data = new OpenILS.data(); data.init({'via':'stash'});

	function getString(s) { return data.entities[s]; }

	var c = [
		{
			'id' : 'acp_id', 'label' : getString('staff.acp_label_id'), 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'my.acp.id()'
		},
		{
			'id' : 'circ_id', 'label' : getString('staff.circ_label_id'), 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'my.circ.id()'
		},
		{
			'id' : 'mvr_doc_id', 'label' : getString('staff.mvr_label_doc_id'), 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'my.mvr.doc_id()'
		},
		{
			'id' : 'barcode', 'label' : getString('staff.acp_label_barcode'), 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'my.acp.barcode()'
		},
		{
			'id' : 'call_number', 'label' : getString('staff.acp_label_call_number'), 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'my.acp.call_number()'
		},
		{
			'id' : 'copy_number', 'label' : getString('staff.acp_label_copy_number'), 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'my.acp.copy_number()'
		},
		{
			'id' : 'location', 'label' : getString('staff.acp_label_location'), 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'my.acp.location()'
		},
		{
			'id' : 'loan_duration', 'label' : getString('staff.acp_label_loan_duration'), 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'my.acp.loan_duration()'
		},
		{
			'id' : 'circ_lib', 'label' : getString('staff.acp_label_circ_lib'), 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'my.acp.circ_lib()'
		},
		{
			'id' : 'fine_level', 'label' : getString('staff.acp_label_fine_level'), 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'my.acp.fine_level()'
		},
		{
			'id' : 'deposit', 'label' : getString('staff.acp_label_deposit'), 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'my.acp.deposit()'
		},
		{
			'id' : 'deposit_amount', 'label' : getString('staff.acp_label_deposit_amount'), 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'my.acp.deposit_amount()'
		},
		{
			'id' : 'price', 'label' : getString('staff.acp_label_price'), 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'my.acp.price()'
		},
		{
			'id' : 'circ_as_type', 'label' : getString('staff.acp_label_circ_as_type'), 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'my.acp.circ_as_type()'
		},
		{
			'id' : 'circ_modifier', 'label' : getString('staff.acp_label_circ_modifier'), 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'my.acp.circ_modifier()'
		},
		{
			'id' : 'xact_start', 'label' : getString('staff.circ_label_xact_start'), 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'my.circ.xact_start()'
		},
		{
			'id' : 'xact_finish', 'label' : getString('staff.circ_label_xact_finish'), 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'my.circ.xact_finish()'
		},
		{
			'id' : 'due_date', 'label' : getString('staff.circ_label_due_date'), 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'my.circ.due_date().substr(0,10)'
		},
		{
			'id' : 'title', 'label' : getString('staff.mvr_label_title'), 'flex' : 2,
			'primary' : false, 'hidden' : true, 'render' : 'my.mvr.title()'
		},
		{
			'id' : 'author', 'label' : getString('staff.mvr_label_author'), 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'my.mvr.author()'
		},
		{
			'id' : 'renewal_remaining', 'label' : getString('staff.circ_label_renewal_remaining'), 'flex' : 0,
			'primary' : false, 'hidden' : true, 'render' : 'my.circ.renewal_remaining()'
		},
		{
			'id' : 'status', 'label' : getString('staff.acp_label_status'), 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'obj.OpenILS.data.hash.ccs[ my.acp.status() ].name()'
		},
		{
			'id' : 'checkin_status', 'label' : getString('staff.checkin_label_status'), 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'my.status.toString()'
		},
		{
			'id' : 'checkin_route_to', 'label' : getString('staff.checkin_label_route_to'), 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'my.route_to.toString()'
		},
		{
			'id' : 'checkin_text', 'label' : getString('staff.checkin_label_text'), 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'my.text.toString()'
		}

	];
	for (var i = 0; i < c.length; i++) {
		if (modify[ c[i].id ]) {
			for (var j in modify[ c[i].id ]) {
				c[i][j] = modify[ c[i].id ][j];
			}
		}
	}
	return c;
}

circ.util.std_map_row_to_column = function() {
	return function(row,col) {
		// row contains { 'my' : { 'acp' : {}, 'circ' : {}, 'mvr' : {} } }
		// col contains one of the objects listed above in columns
		
		// mimicking some of the obj in circ.checkin and circ.checkout where map_row_to_column is usually defined
		var obj = {}; obj.OpenILS = {};  // One of our circ columns uses OpenILS.data
		JSAN.use('util.error'); obj.error = new util.error();
		JSAN.use('OpenILS.data'); obj.OpenILS.data = new OpenILS.data(); obj.OpenILS.data.init({'via':'stash'});

		var my = row.my;
		var value;
		try { 
			value = eval( col.render );
		} catch(E) {
			obj.error.sdump('D_ERROR','map_row_to_column: ' + E);
			value = '???';
		}
		return value;
	}
}

circ.util.checkin_via_barcode = function(session,barcode,backdate) {
	try {
		JSAN.use('util.error'); var error = new util.error();
		JSAN.use('util.network'); var network = new util.network();
		JSAN.use('OpenILS.data'); var data = new OpenILS.data(); data.init({'via':'stash'});
		JSAN.use('util.date');
		if (backdate && (backdate == util.date.formatted_date(new Date(),'%Y-%m-%d')) ) backdate = null;

		var check = network.request(
			api.checkin_via_barcode.app,
			api.checkin_via_barcode.method,
			[ session, barcode, null, backdate ]
		);

		/*
		{ // REMOVE_ME, forcing a condition for testing
			check.status = 1;
			check.text = 'This copy is the first that could fulfill a hold.  Do it?';
		}
		*/

		if (check.status != 0) {
			switch(check.status) {
				case '1': case 1: /* possible hold capture */
					var rv = error.yns_alert(
						check.text,
						'Alert',
						"Capture",
						"Don't Capture",
						null,
						"Check here to confirm this message"
					);
					switch(rv) {
						case 0: /* capture */
						try {
							var check2 = this.hold_capture_by_copy_barcode( session, barcode );
							if (check2) {
								check.copy = check2.copy;
								check.text = check2.text;
								check.route_to = check2.route_to;
								JSAN.use('patron.util');
								var patron = patron.util.retrieve_au_by_id( check.hold.usr() );
								alert('To Printer\n' + check.text + '\r\n' + 'Barcode: ' + barcode + '  Title: ' + 
									check.record.title() + '  Author: ' + check.record.author() + 
									'\r\n' + 'Route To: ' + check.route_to + '  Patron: ' + 
									patron.card().barcode() + ' ' + patron.family_name() + ', ' + 
									patron.first_given_name() + '\r\n'); //FIXME

								/*
								sPrint(check.text + '<br />\r\n' + 'Barcode: ' + barcode + '  Title: ' + 
									check.record.title() + '  Author: ' + check.record.author() + 
									'<br />\r\n' + 'Route To: ' + check.route_to + '  Patron: ' + 
									patron.card().barcode() + ' ' + patron.family_name() + ', ' + 
									patron.first_given_name() + '<br />\r\n'
								);
								*/

							}

						} catch(E) { 
							error.sdump('D_ERROR',E + '\n'); 
							/* 
							// demo testing 
							check.text = 'Captured for Hold';
							check.route_to = 'ARL-ATH';
							*/
						}
						break;
						case 1: /* don't capture */

							check.text = 'Not Captured for Hold';
						break;
					}
				break;
				case '2': case 2: /* LOST??? */
					JSAN.use('patron.util');
					var patron = patron.util.retrieve_au_by_id( check.circ.usr() );
					var msg = check.text + '\r\n' + 'Barcode: ' + barcode + '  Title: ' + 
							check.record.title() + '  Author: ' + check.record.author() + '\r\n' +
							'Patron: ' + patron.card().barcode() + ' ' + patron.family_name() + ', ' +
							patron.first_given_name();
					var pcheck = error.yns_alert(
						msg,
						'Lost Item',
						'Edit Copy & Patron',
						"Just Continue",
						null,
						"Check here to confirm this message"
					); 
					if (pcheck == 0) {
						//FIXME//Re-implement
						/*
						var w = mw.spawn_main();
						setTimeout(
							function() {
								mw.spawn_patron_display(w.document,'new_tab','main_tabbox',{'patron':patron});
								mw.spawn_batch_copy_editor(w.document,'new_tab','main_tabbox',
									{'copy_ids':[ check.copy.id() ]});
							}, 0
						);
						*/
					}
				break;
				case '3': case 3: /* TRANSIT ELSEWHERE */
					if (parseInt(check.route_to)) check.route_to = data.hash.aou[ check.route_to ].shortname();
					var msg = check.text + '\r\n' + 'Barcode: ' + barcode + '  Title: ' + 
							check.record.title() + '  Author: ' + check.record.author() + 
							'\r\n' + 'Route To: ' + check.route_to + '\r\n';
					var pcheck = error.yns_alert(
						msg,
						'Alert',
						'Print Receipt',
						"Don't Print",
						null,
						"Check here to confirm this message"
					); 
					if (pcheck == 0) {
						alert('To Printer\n' + msg); //FIXME//
						//sPrint( msg.match( /\n/g, '<br />\r\n'), true );
					}

				break;
				case '4': case 4: /* transit for hold is complete */
					if (parseInt(check.route_to)) check.route_to = data.hash.aou[ check.route_to ].shortname();
					var msg = check.text + '\r\n' + 'Barcode: ' + barcode + '  Title: ' + 
							check.record.title() + '  Author: ' + check.record.author() + 
							'\r\n' + 'Route To: ' + check.route_to +
							'\r\n';
					var pcheck = error.yns_alert(
						msg,
						'Alert',
						'Print Receipt',
						"Don't Print",
						null,
						"Check here to confirm this message"
					); 
					if (pcheck == 0) {
						alert('To Printer\n' + msg); //FIXME//
						//sPrint( msg.match( /\n/g, '<br />\r\n'), true );
					}

				break;

				default: 
					if (parseInt(check.route_to)) check.route_to = data.hash.aou[ check.route_to ].shortname();
					var msg = check.text + '\r\nBarcode: ' + barcode + '  Route To: ' + check.route_to;
					var pcheck = error.yns_alert(
						msg,
						'Alert',
						'Print Receipt',
						"Don't Print",
						null,
						"Check here to confirm this message"
					); 
					if (pcheck == 0) {
						alert('To Printer\n' + msg); //FIXME//
						//sPrint( msg.match( /\n/g, '<br />\r\n'), true );
					}
				break;
			}
		} else {  // status == 0
		}
		if (parseInt(check.route_to)) {
			if (check.route_to != data.list.au[0].home_ou()) {
				check.route_to = data.hash.aou[ check.route_to ].shortname();
			} else {
				check.route_to = data.hash.acpl[ check.copy.location() ].name();
			}
		}
		return check;
	} catch(E) {
		JSAN.use('util.error'); var error = new util.error();
		var msg = E + '\n---\n' + js2JSON(E);
		error.sdump('D_ERROR',msg);
		alert(msg);
		return null;
	}
}

circ.util.hold_capture_by_copy_barcode = function ( session, barcode, retrieve_flag ) {
	try {
		JSAN.use('util.network'); var network = new util.network();
		JSAN.use('OpenILS.data'); var data = new OpenILS.data(); data.init({'via':'stash'});
		var check = network.request(
			api.capture_copy_for_hold_via_barcode.app,
			api.capture_copy_for_hold_via_barcode.method,
			[ session, barcode, retrieve_flag ]
		)[0];
		check.text = 'Captured for Hold';
		if (parseInt(check.route_to)) check.route_to = data.hash.aou[ check.route_to ].shortname();
		return check;
	} catch(E) {
		JSAN.use('util.error'); var error = new util.error();
		var msg = E + '\n---\n' + js2JSON(E);
		error.sdump('D_ERROR',msg);
		alert(msg);
		return null;
	}
}


dump('exiting circ/util.js\n');
