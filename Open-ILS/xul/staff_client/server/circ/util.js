dump('entering circ/util.js\n');

if (typeof circ == 'undefined') var circ = {};
circ.util = {};

circ.util.EXPORT_OK	= [ 
	'offline_checkout_columns', 'offline_checkin_columns', 'offline_renew_columns', 'offline_inhouse_use_columns', 
	'columns', 'hold_columns', 'checkin_via_barcode', 'std_map_row_to_column', 'hold_capture_via_copy_barcode',
	'show_last_few_circs', 'abort_transits'
];
circ.util.EXPORT_TAGS	= { ':all' : circ.util.EXPORT_OK };

circ.util.abort_transits = function(selection_list) {
	var obj = {};
	JSAN.use('util.error'); obj.error = new util.error();
	JSAN.use('util.network'); obj.network = new util.network();
	JSAN.use('OpenILS.data'); obj.data = new OpenILS.data(); obj.data.init({'via':'stash'});
	JSAN.use('util.functional');
	var msg = 'Are you sure you would like to abort transits for copies:' + util.functional.map_list( selection_list, function(o){return o.copy_id;}).join(', ') + '?';
	var r = obj.error.yns_alert(msg,'Aborting Transits','Yes','No',null,'Check here to confirm this action');
	if (r == 0) {
		try {
			for (var i = 0; i < selection_list.length; i++) {
				var copy_id = selection_list[i].copy_id;
				var robj = obj.network.simple_request('FM_ATC_VOID',[ ses(), { 'copyid' : copy_id } ]);
				if (typeof robj.ilsevent != 'undefined') {
					switch(robj.ilsevent) {
						case 1225 /* TRANSIT_ABORT_NOT_ALLOWED */ :
							alert('This transit for copy ' + copy_id + ' may not be aborted due to a problem status.  It needs to be returned to its circulating library.');
						break;
						case 5000 /* PERM_FAILURE */ :
						break;
						default:
							throw(robj);
						break;
					}
				}
			}
		} catch(E) {
			obj.error.standard_unexpected_error_alert('Transit not likely aborted.',E);
		}
	}
}

circ.util.show_copy_details = function(copy_id) {
	var obj = {};
	JSAN.use('util.error'); obj.error = new util.error();
	JSAN.use('util.window'); obj.win = new util.window();
	JSAN.use('util.network'); obj.network = new util.network();
	JSAN.use('OpenILS.data'); obj.data = new OpenILS.data(); obj.data.init({'via':'stash'});

	try {
		obj.data.fancy_prompt_data = null; obj.data.stash('fancy_prompt_data');
		var url = xulG.url_prefix( urls.XUL_COPY_DETAILS ) + '?copy_id=' + copy_id;
		obj.win.open( url, 'show_copy_details', 'chrome,resizable,modal' );
		obj.data.stash_retrieve();

		if (! obj.data.fancy_prompt_data) return;
		var patrons = JSON2js( obj.data.fancy_prompt_data );
		for (var j = 0; j < patrons.length; j++) {
			if (typeof window.xulG == 'object' && typeof window.xulG.new_tab == 'function') {
				try {
					var url = urls.XUL_PATRON_DISPLAY + '?id=' + window.escape( patrons[j] );
					window.xulG.new_tab( url );
				} catch(E) {
					obj.error.standard_unexpected_error_alert('Problem retrieving patron.',E);
				}
			}
		}

	} catch(E) {
		obj.error.standard_unexpected_error_alert('Problem retrieving copy details.',E);
	}
}


circ.util.show_last_few_circs = function(selection_list,count) {
	var obj = {};
	JSAN.use('util.error'); obj.error = new util.error();
	JSAN.use('util.window'); obj.win = new util.window();
	JSAN.use('util.network'); obj.network = new util.network();
	JSAN.use('OpenILS.data'); obj.data = new OpenILS.data(); obj.data.init({'via':'stash'});

	if (!count) count = 4;

	for (var i = 0; i < selection_list.length; i++) {
		try {
			if (typeof selection_list[i].copy_id == 'undefined' || selection_list[i].copy_id == null) continue;
			obj.data.fancy_prompt_data = null; obj.data.stash('fancy_prompt_data');
			var url = xulG.url_prefix( urls.XUL_CIRC_SUMMARY ) + '?copy_id=' + selection_list[i].copy_id + '&count=' + count;
			obj.win.open( url, 'show_last_few_circs', 'chrome,resizable,modal' );
			obj.data.stash_retrieve();

			if (! obj.data.fancy_prompt_data) continue;
			var patrons = JSON2js( obj.data.fancy_prompt_data );
			for (var j = 0; j < patrons.length; j++) {
				if (typeof window.xulG == 'object' && typeof window.xulG.new_tab == 'function') {
					try {
						var url = urls.XUL_PATRON_DISPLAY + '?id=' + window.escape( patrons[j] );
						window.xulG.new_tab( url );
					} catch(E) {
						obj.error.standard_unexpected_error_alert('Problem retrieving patron.',E);
					}
				}
			}

		} catch(E) {
			obj.error.standard_unexpected_error_alert('Problem retrieving circulations.',E);
		}
	}
}

circ.util.offline_checkout_columns = function(modify,params) {
	
	var c = [
		{ 
			'id' : 'timestamp', 
			'label' : 'Timestamp', 
			'flex' : 1, 'primary' : false, 'hidden' : true, 
			'render' : 'my.timestamp' 
		},
		{ 
			'id' : 'checkout_time', 
			'label' : 'Check Out Time', 
			'flex' : 1, 'primary' : false, 'hidden' : true, 
			'render' : 'my.checkout_time' 
		},
		{ 
			'id' : 'type', 
			'label' : 'Transaction Type', 
			'flex' : 1, 'primary' : false, 'hidden' : true, 
			'render' : 'my.type' 
		},
		{
			'id' : 'noncat',
			'label' : 'Non-Cataloged?',
			'flex' : 1, 'primary' : false, 'hidden' : true, 
			'render' : 'my.noncat'
		},
		{
			'id' : 'noncat_type',
			'label' : 'Non-Cat Type ID',
			'flex' : 1, 'primary' : false, 'hidden' : true,
			'render' : 'my.noncat_type'
		},
		{
			'id' : 'noncat_count',
			'label' : 'Count', 'sort_type' : 'number',
			'flex' : 1, 'primary' : false, 'hidden' : false,
			'render' : 'my.noncat_count'
		},
		{ 
			'id' : 'patron_barcode', 
			'label' : 'Patron Barcode', 
			'flex' : 1, 'primary' : false, 'hidden' : true, 
			'render' : 'my.patron_barcode' 
		},
		{ 
			'id' : 'barcode', 
			'label' : 'Item Barcode', 
			'flex' : 2, 'primary' : true, 'hidden' : false, 
			'render' : 'my.barcode' 
		},
		{ 
			'id' : 'due_date', 
			'label' : 'Due Date', 
			'flex' : 1, 'primary' : false, 'hidden' : false, 
			'render' : 'my.due_date' 
		},
	];
	if (modify) for (var i = 0; i < c.length; i++) {
		if (modify[ c[i].id ]) {
			for (var j in modify[ c[i].id ]) {
				c[i][j] = modify[ c[i].id ][j];
			}
		}
	}
	if (params) {
		if (params.just_these) {
			JSAN.use('util.functional');
			var new_c = [];
			for (var i = 0; i < params.just_these.length; i++) {
				var x = util.functional.find_list(c,function(d){return(d.id==params.just_these[i]);});
				new_c.push( function(y){ return y; }( x ) );
			}
			return new_c;
		}
	}
	return c.sort( function(a,b) { if (a.label < b.label) return -1; if (a.label > b.label) return 1; return 0; } );
}

circ.util.offline_checkin_columns = function(modify,params) {
	
	var c = [
		{ 
			'id' : 'timestamp', 
			'label' : 'Timestamp', 
			'flex' : 1, 'primary' : false, 'hidden' : true, 
			'render' : 'my.timestamp' 
		},
		{ 
			'id' : 'backdate', 
			'label' : 'Back Date', 
			'flex' : 1, 'primary' : false, 'hidden' : true, 
			'render' : 'my.backdate' 
		},
		{ 
			'id' : 'type', 
			'label' : 'Transaction Type', 
			'flex' : 1, 'primary' : false, 'hidden' : true, 
			'render' : 'my.type' 
		},
		{ 
			'id' : 'barcode', 
			'label' : 'Item Barcode', 
			'flex' : 2, 'primary' : true, 'hidden' : false, 
			'render' : 'my.barcode' 
		},
	];
	if (modify) for (var i = 0; i < c.length; i++) {
		if (modify[ c[i].id ]) {
			for (var j in modify[ c[i].id ]) {
				c[i][j] = modify[ c[i].id ][j];
			}
		}
	}
	if (params) {
		if (params.just_these) {
			JSAN.use('util.functional');
			var new_c = [];
			for (var i = 0; i < params.just_these.length; i++) {
				var x = util.functional.find_list(c,function(d){return(d.id==params.just_these[i]);});
				new_c.push( function(y){ return y; }( x ) );
			}
			return new_c;
		}
	}
	return c.sort( function(a,b) { if (a.label < b.label) return -1; if (a.label > b.label) return 1; return 0; } );
}

circ.util.offline_renew_columns = function(modify,params) {
	
	var c = [
		{ 
			'id' : 'timestamp', 
			'label' : 'Timestamp', 
			'flex' : 1, 'primary' : false, 'hidden' : true, 
			'render' : 'my.timestamp' 
		},
		{ 
			'id' : 'checkout_time', 
			'label' : 'Check Out Time', 
			'flex' : 1, 'primary' : false, 'hidden' : true, 
			'render' : 'my.checkout_time' 
		},
		{ 
			'id' : 'type', 
			'label' : 'Transaction Type', 
			'flex' : 1, 'primary' : false, 'hidden' : true, 
			'render' : 'my.type' 
		},
		{ 
			'id' : 'patron_barcode', 
			'label' : 'Patron Barcode', 
			'flex' : 1, 'primary' : false, 'hidden' : true, 
			'render' : 'my.patron_barcode' 
		},
		{ 
			'id' : 'barcode', 
			'label' : 'Item Barcode', 
			'flex' : 2, 'primary' : true, 'hidden' : false, 
			'render' : 'my.barcode' 
		},
		{ 
			'id' : 'due_date', 
			'label' : 'Due Date', 
			'flex' : 1, 'primary' : false, 'hidden' : false, 
			'render' : 'my.due_date' 
		},
	];
	if (modify) for (var i = 0; i < c.length; i++) {
		if (modify[ c[i].id ]) {
			for (var j in modify[ c[i].id ]) {
				c[i][j] = modify[ c[i].id ][j];
			}
		}
	}
	if (params) {
		if (params.just_these) {
			JSAN.use('util.functional');
			var new_c = [];
			for (var i = 0; i < params.just_these.length; i++) {
				var x = util.functional.find_list(c,function(d){return(d.id==params.just_these[i]);});
				new_c.push( function(y){ return y; }( x ) );
			}
			return new_c;
		}
	}
	return c.sort( function(a,b) { if (a.label < b.label) return -1; if (a.label > b.label) return 1; return 0; } );
}

circ.util.offline_inhouse_use_columns = function(modify,params) {
	
	var c = [
		{ 
			'id' : 'timestamp', 
			'label' : 'Timestamp', 
			'flex' : 1, 'primary' : false, 'hidden' : true, 
			'render' : 'my.timestamp' 
		},
		{ 
			'id' : 'use_time', 
			'label' : 'Use Time', 
			'flex' : 1, 'primary' : false, 'hidden' : true, 
			'render' : 'my.use_time' 
		},
		{ 
			'id' : 'type', 
			'label' : 'Transaction Type', 
			'flex' : 1, 'primary' : false, 'hidden' : true, 
			'render' : 'my.type' 
		},
		{
			'id' : 'count',
			'label' : 'Count', 'sort_type' : 'number',
			'flex' : 1, 'primary' : false, 'hidden' : false,
			'render' : 'my.count'
		},
		{ 
			'id' : 'barcode', 
			'label' : 'Item Barcode', 
			'flex' : 2, 'primary' : true, 'hidden' : false, 
			'render' : 'my.barcode' 
		},
	];
	if (modify) for (var i = 0; i < c.length; i++) {
		if (modify[ c[i].id ]) {
			for (var j in modify[ c[i].id ]) {
				c[i][j] = modify[ c[i].id ][j];
			}
		}
	}
	if (params) {
		if (params.just_these) {
			JSAN.use('util.functional');
			var new_c = [];
			for (var i = 0; i < params.just_these.length; i++) {
				var x = util.functional.find_list(c,function(d){return(d.id==params.just_these[i]);});
				new_c.push( function(y){ return y; }( x ) );
			}
			return new_c;
		}
	}
	return c.sort( function(a,b) { if (a.label < b.label) return -1; if (a.label > b.label) return 1; return 0; } );
}



circ.util.columns = function(modify,params) {
	
	JSAN.use('OpenILS.data'); var data = new OpenILS.data(); data.init({'via':'stash'});

	function getString(s) { return data.entities[s]; }

	var c = [
		{
			'id' : 'acp_id', 'label' : getString('staff.acp_label_id'), 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'my.acp.id()', 'persist' : 'hidden width ordinal',
		},
		{
			'id' : 'circ_id', 'label' : getString('staff.circ_label_id'), 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'my.circ ? my.circ.id() : ( my.acp.circulations() ? my.acp.circulations()[0].id() : "")', 'persist' : 'hidden width ordinal',
		},
		{
			'id' : 'mvr_doc_id', 'label' : getString('staff.mvr_label_doc_id'), 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'my.mvr.doc_id()', 'persist' : 'hidden width ordinal',
		},
		{
			'id' : 'barcode', 'label' : getString('staff.acp_label_barcode'), 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'my.acp.barcode()', 'persist' : 'hidden width ordinal',
		},
		{
			'id' : 'call_number', 'label' : getString('staff.acp_label_call_number'), 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : ' if (my.acp && my.acp.call_number() == -1) { "Not Cataloged"; } else { if (!my.acn) { var x = obj.network.simple_request("FM_ACN_RETRIEVE",[ my.acp.call_number() ]); if (x.ilsevent) { "Not Cataloged"; } else { my.acn = x; x.label(); } } else { my.acn.label(); } } ' , 'persist' : 'hidden width ordinal',
		},
		{
			'id' : 'owning_lib', 'label' : 'Owning Lib', 'flex' : 1,
			'primary' : false, 'hidden' : true,
			'render' : 'if (Number(my.acn.owning_lib())>=0) obj.data.hash.aou[ my.acn.owning_lib() ].shortname(); else my.acn.owning_lib().shortname();', 'persist' : 'hidden width ordinal',
		},
		{
			'id' : 'copy_number', 'label' : getString('staff.acp_label_copy_number'), 'flex' : 1, 'sort_type' : 'number',
			'primary' : false, 'hidden' : true, 'render' : 'my.acp.copy_number()', 'persist' : 'hidden width ordinal',
		},
		{
			'id' : 'location', 'label' : getString('staff.acp_label_location'), 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'if (Number(my.acp.location())>=0) obj.data.lookup("acpl", my.acp.location() ).name(); else my.acp.location().name();', 'persist' : 'hidden width ordinal',
		},
		{
			'id' : 'loan_duration', 'label' : getString('staff.acp_label_loan_duration'), 'flex' : 1,
			'primary' : false, 'hidden' : true, 
			'render' : 'switch(my.acp.loan_duration()){ case 1: "Short"; break; case 2: "Normal"; break; case 3: "Long"; break; }', 'persist' : 'hidden width ordinal',
		},
		{
			'id' : 'circ_lib', 'label' : getString('staff.acp_label_circ_lib'), 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'if (Number(my.acp.circ_lib())>=0) obj.data.hash.aou[ my.acp.circ_lib() ].shortname(); else my.acp.circ_lib().shortname();', 'persist' : 'hidden width ordinal',
		},
		{
			'id' : 'fine_level', 'label' : getString('staff.acp_label_fine_level'), 'flex' : 1,
			'primary' : false, 'hidden' : true,
			'render' : 'switch(my.acp.fine_level()){ case 1: "Low"; break; case 2: "Normal"; break; case 3: "High"; break; }', 'persist' : 'hidden width ordinal',
		},
		{
			'id' : 'circulate', 'label' : 'Circulate?', 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'get_bool( my.acp.circulate() ) ? "Yes" : "No"', 'persist' : 'hidden width ordinal',
		},
		{
			'id' : 'holdable', 'label' : 'Holdable?', 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'get_bool( my.acp.holdable() ) ? "Yes" : "No"', 'persist' : 'hidden width ordinal',
		},
		{
			'id' : 'opac_visible', 'label' : 'OPAC Visible?', 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'get_bool( my.acp.opac_visible() ) ? "Yes" : "No"', 'persist' : 'hidden width ordinal',
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'ref', 'label' : 'Reference?', 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'get_bool( my.acp.ref() ) ? "Yes" : "No"'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'deposit', 'label' : 'Deposit?', 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'get_bool( my.acp.deposit() ) ? "Yes" : "No"'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'deposit_amount', 'label' : getString('staff.acp_label_deposit_amount'), 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'util.money.sanitize(my.acp.deposit_amount())', 'sort_type' : 'money',
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'price', 'label' : getString('staff.acp_label_price'), 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'util.money.sanitize(my.acp.price())', 'sort_type' : 'money',
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'circ_as_type', 'label' : getString('staff.acp_label_circ_as_type'), 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'my.acp.circ_as_type()'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'circ_modifier', 'label' : getString('staff.acp_label_circ_modifier'), 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'my.acp.circ_modifier()'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'xact_start_full', 'label' : 'Checkout Timestamp', 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'my.circ ? my.circ.xact_start() : (my.acp.circulations() ? my.acp.circulations()[0].xact_start() : "")'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'checkin_time_full', 'label' : 'Checkin Timestamp', 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'my.circ.checkin_time()'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'xact_start', 'label' : 'Checkout Date', 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'my.circ ? my.circ.xact_start().substr(0,10) : (my.acp.circulations() ? my.acp.circulations()[0].xact_start().substr(0,10) : "")'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'checkin_time', 'label' : 'Checkin Date', 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'my.circ.checkin_time().substr(0,10)'
		},

		{
			'persist' : 'hidden width ordinal', 'id' : 'xact_finish', 'label' : 'Transaction Finished', 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'my.circ.xact_finish()'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'due_date', 'label' : getString('staff.circ_label_due_date'), 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'my.circ ? my.circ.due_date().substr(0,10) : (my.acp.circulations() ? my.acp.circulations()[0].due_date().substr(0,10) : "")'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'create_date', 'label' : 'Date Created', 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'my.acp.create_date().substr(0,10)'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'edit_date', 'label' : 'Date Last Edited', 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'my.acp.edit_date().substr(0,10)'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'title', 'label' : getString('staff.mvr_label_title'), 'flex' : 2, 'sort_type' : 'title',
			'primary' : false, 'hidden' : true, 'render' : 'try { my.mvr.title(); } catch(E) { my.acp.dummy_title(); }'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'author', 'label' : getString('staff.mvr_label_author'), 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'try { my.mvr.author(); } catch(E) { my.acp.dummy_author(); }'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'edition', 'label' : 'Edition', 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'my.mvr.edition();'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'isbn', 'label' : 'ISBN', 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'my.mvr.isbn();'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'pubdate', 'label' : 'PubDate', 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'my.mvr.pubdate();'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'publisher', 'label' : 'Publisher', 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'my.mvr.publisher();'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'tcn', 'label' : 'TCN', 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'my.mvr.tcn();'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'renewal_remaining', 'label' : getString('staff.circ_label_renewal_remaining'), 'flex' : 0,
			'primary' : false, 'hidden' : true, 'render' : 'my.circ ? my.circ.renewal_remaining() : (my.acp.circulations() ? my.acp.circulations()[0].renewal_remaining() : "")', 'sort_type' : 'number',
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'stop_fines', 'label' : 'Fines Stopped', 'flex' : 0,
			'primary' : false, 'hidden' : true, 'render' : 'my.circ ? my.circ.stop_fines() : (my.acp.circulations() ? my.acp.circulations()[0].stop_fines() : "")'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'stop_fines_time', 'label' : 'Fines Stopped Time', 'flex' : 0,
			'primary' : false, 'hidden' : true, 'render' : 'my.circ ? my.circ.stop_fines_time() : (my.acp.circulations() ? my.acp.circulations()[0].stop_fines_time() : "")'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'status', 'label' : getString('staff.acp_label_status'), 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'if (Number(my.acp.status())>=0) obj.data.hash.ccs[ my.acp.status() ].name(); else my.acp.status().name();'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'route_to', 'label' : 'Route To', 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'my.route_to.toString()'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'message', 'label' : 'Message', 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'my.message.toString()'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'uses', 'label' : '# of Uses', 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'my.uses', 'sort_type' : 'number',
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'alert_message', 'label' : 'Alert Message', 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'my.acp.alert_message()'
		},
	];
	for (var i = 0; i < c.length; i++) {
		if (modify[ c[i].id ]) {
			for (var j in modify[ c[i].id ]) {
				c[i][j] = modify[ c[i].id ][j];
			}
		}
	}
	if (params) {
		if (params.just_these) {
			JSAN.use('util.functional');
			var new_c = [];
			for (var i = 0; i < params.just_these.length; i++) {
				var x = util.functional.find_list(c,function(d){return(d.id==params.just_these[i]);});
				new_c.push( function(y){ return y; }( x ) );
			}
			return new_c;
		}
	}
	return c.sort( function(a,b) { if (a.label < b.label) return -1; if (a.label > b.label) return 1; return 0; } );
}

circ.util.transit_columns = function(modify,params) {
	
	JSAN.use('OpenILS.data'); var data = new OpenILS.data(); data.init({'via':'stash'});

	function getString(s) { return data.entities[s]; }

	var c = [
		{
			'persist' : 'hidden width ordinal', 'id' : 'id', 'label' : 'Transit ID', 'flex' : 1,
			'primary' : false, 'hidden' : true,  'render' : 'my.atc.id()'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'transit_source', 'label' : 'Transit Source', 'flex' : 1,
			'primary' : false, 'hidden' : false, 'render' : 'typeof my.atc.source() == "object" ? my.atc.source().shortname() : obj.data.hash.aou[ my.atc.source() ].shortname()'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'transit_source_send_time', 'label' : 'Transitted On', 'flex' : 1,
			'primary' : false, 'hidden' : false, 'render' : 'my.atc.source_send_time()'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'transit_dest_lib', 'label' : 'Transit Destination', 'flex' : 1,
			'primary' : false, 'hidden' : false, 'render' : 'typeof my.atc.dest() == "object" ? my.atc.dest().shortname() : obj.data.hash.aou[ my.atc.dest() ].shortname()'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'transit_dest_recv_time', 'label' : 'Transit Completed On', 'flex' : 1,
			'primary' : false, 'hidden' : false, 'render' : 'my.atc.dest_recv_time()'
		},
	];
	for (var i = 0; i < c.length; i++) {
		if (modify[ c[i].id ]) {
			for (var j in modify[ c[i].id ]) {
				c[i][j] = modify[ c[i].id ][j];
			}
		}
	}
	if (params) {
		if (params.just_these) {
			JSAN.use('util.functional');
			var new_c = [];
			for (var i = 0; i < params.just_these.length; i++) {
				var x = util.functional.find_list(c,function(d){return(d.id==params.just_these[i]);});
				new_c.push( function(y){ return y; }( x ) );
			}
			return new_c;
		}
	}
	return c.sort( function(a,b) { if (a.label < b.label) return -1; if (a.label > b.label) return 1; return 0; } );
}


circ.util.hold_columns = function(modify,params) {
	
	JSAN.use('OpenILS.data'); var data = new OpenILS.data(); data.init({'via':'stash'});

	function getString(s) { return data.entities[s]; }

	var c = [
		{
			'persist' : 'hidden width ordinal', 'id' : 'request_timestamp', 'label' : 'Request Timestamp', 'flex' : 0,
			'primary' : false, 'hidden' : true,  
			'render' : 'my.ahr.request_time().toString().substr(0,10)'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'request_time', 'label' : 'Request Date', 'flex' : 0,
			'primary' : false, 'hidden' : true,  
			'render' : 'my.ahr.request_time().toString().substr(0,10)'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'available_timestamp', 'label' : 'Available On (Timestamp)', 'flex' : 1,
			'primary' : false, 'hidden' : true,  'render' : 'my.ahr.transit() ? ( my.ahr.transit().dest_recv_time() ? my.ahr.transit().dest_recv_time().toString() : "") : ( my.ahr.capture_time() ? my.ahr.capture_time().toString() : "" )',
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'available_time', 'label' : 'Available On', 'flex' : 1,
			'primary' : false, 'hidden' : false,  'render' : 'my.ahr.transit() ? ( my.ahr.transit().dest_recv_time() ? my.ahr.transit().dest_recv_time().toString().substr(0,10) : "") : ( my.ahr.capture_time() ? my.ahr.capture_time().toString().substr(0,10) : "" )',
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'capture_timestamp', 'label' : 'Capture Timestamp', 'flex' : 1,
			'primary' : false, 'hidden' : true,  'render' : 'my.ahr.capture_time() ? my.ahr.capture_time().toString() : ""'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'capture_time', 'label' : 'Capture Date', 'flex' : 1,
			'primary' : false, 'hidden' : true,  'render' : 'my.ahr.capture_time() ? my.ahr.capture_time().toString().substr(0,10) : ""'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'status', 'label' : getString('staff.ahr_status_label'), 'flex' : 1,
			'primary' : false, 'hidden' : false,  'render' : 'switch(my.status) { case 1: case "1": "Waiting for copy"; break; case 2: case "2": "Waiting for capture"; break; case 3: case "3": "In-Transit"; break; case 4: case "4" : "Ready for pickup"; break; default: my.status; break;}'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'hold_type', 'label' : getString('staff.ahr_hold_type_label'), 'flex' : 0,
			'primary' : false, 'hidden' : true,  'render' : 'my.ahr.hold_type()'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'pickup_lib', 'label' : 'Pickup Lib (Full Name)', 'flex' : 1,
			'primary' : false, 'hidden' : true,  
			'render' : 'if (Number(my.ahr.pickup_lib())>=0) obj.data.hash.aou[ my.ahr.pickup_lib() ].name(); else my.ahr.pickup_lib().name();'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'pickup_lib_shortname', 'label' : getString('staff.ahr_pickup_lib_label'), 'flex' : 0,
			'primary' : false, 'hidden' : true,  
			'render' : 'if (Number(my.ahr.pickup_lib())>=0) obj.data.hash.aou[ my.ahr.pickup_lib() ].shortname(); else my.ahr.pickup_lib().shortname();'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'current_copy', 'label' : getString('staff.ahr_current_copy_label'), 'flex' : 1,
			'primary' : false, 'hidden' : true,  'render' : 'my.acp ? my.acp.barcode() : "No Copy"'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'email_notify', 'label' : getString('staff.ahr_email_notify_label'), 'flex' : 1,
			'primary' : false, 'hidden' : true,  'render' : 'my.ahr.email_notify() == 1 ? "Yes" : "No"'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'expire_time', 'label' : getString('staff.ahr_expire_time_label'), 'flex' : 1,
			'primary' : false, 'hidden' : true,  'render' : 'my.ahr.expire_time()'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'fulfillment_time', 'label' : getString('staff.ahr_fulfillment_time_label'), 'flex' : 1,
			'primary' : false, 'hidden' : true,  'render' : 'my.ahr.fulfillment_time()'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'holdable_formats', 'label' : getString('staff.ahr_holdable_formats_label'), 'flex' : 1,
			'primary' : false, 'hidden' : true,  'render' : 'my.ahr.holdable_formats()'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'id', 'label' : getString('staff.ahr_id_label'), 'flex' : 1,
			'primary' : false, 'hidden' : true,  'render' : 'my.ahr.id()'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'phone_notify', 'label' : getString('staff.ahr_phone_notify_label'), 'flex' : 1,
			'primary' : false, 'hidden' : true,  'render' : 'my.ahr.phone_notify()'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'prev_check_time', 'label' : getString('staff.ahr_prev_check_time_label'), 'flex' : 1,
			'primary' : false, 'hidden' : true,  'render' : 'my.ahr.prev_check_time()'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'requestor', 'label' : getString('staff.ahr_requestor_label'), 'flex' : 1,
			'primary' : false, 'hidden' : true,  'render' : 'my.ahr.requestor()'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'selection_depth', 'label' : getString('staff.ahr_selection_depth_label'), 'flex' : 1,
			'primary' : false, 'hidden' : true,  'render' : 'my.ahr.selection_depth()'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'target', 'label' : getString('staff.ahr_target_label'), 'flex' : 1,
			'primary' : false, 'hidden' : true,  'render' : 'my.ahr.target()'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'usr', 'label' : getString('staff.ahr_usr_label'), 'flex' : 1,
			'primary' : false, 'hidden' : true,  'render' : 'my.ahr.usr()'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'title', 'label' : getString('staff.mvr_label_title'), 'flex' : 1, 'sort_type' : 'title',
			'primary' : false, 'hidden' : true, 'render' : 'my.mvr ? my.mvr.title() : "No Title?"'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'author', 'label' : getString('staff.mvr_label_author'), 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'my.mvr ? my.mvr.author() : "No Author?"'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'edition', 'label' : 'Edition', 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'my.mvr.edition();'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'isbn', 'label' : 'ISBN', 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'my.mvr.isbn();'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'pubdate', 'label' : 'PubDate', 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'my.mvr.pubdate();'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'publisher', 'label' : 'Publisher', 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'my.mvr.publisher();'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'tcn', 'label' : 'TCN', 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'my.mvr.tcn();'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'transit_source', 'label' : 'Transit Source', 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'my.ahr.transit() ?  obj.data.hash.aou[ my.ahr.transit().source() ].shortname() : ""'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'transit_source_send_time', 'label' : 'Transitted On', 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'my.ahr.transit() ?  my.ahr.transit().source_send_time() : ""'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'transit_dest_lib', 'label' : 'Transit Destination', 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'my.ahr.transit() ?  obj.data.hash.aou[ my.ahr.transit().dest() ].shortname() : ""'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'transit_dest_recv_time', 'label' : 'Transit Completed On', 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'my.ahr.transit() ?  my.ahr.transit().dest_recv_time() : ""'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'patron_name', 'label' : 'Patron Name', 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'JSAN.use("patron.util"); var temp1 = patron.util.retrieve_name_via_id( ses(), my.ahr.usr() ); temp1[0] + ", " + temp1[1] + " " + temp1[2];',
		}
	];
	for (var i = 0; i < c.length; i++) {
		if (modify[ c[i].id ]) {
			for (var j in modify[ c[i].id ]) {
				c[i][j] = modify[ c[i].id ][j];
			}
		}
	}
	if (params) {
		if (params.just_these) {
			JSAN.use('util.functional');
			var new_c = [];
			for (var i = 0; i < params.just_these.length; i++) {
				var x = util.functional.find_list(c,function(d){return(d.id==params.just_these[i]);});
				new_c.push( function(y){ return y; }( x ) );
			}
			return new_c;
		}
	}
	return c.sort( function(a,b) { if (a.label < b.label) return -1; if (a.label > b.label) return 1; return 0; } );
}

circ.util.std_map_row_to_column = function(error_value) {
	return function(row,col) {
		// row contains { 'my' : { 'acp' : {}, 'circ' : {}, 'mvr' : {} } }
		// col contains one of the objects listed above in columns
		
		// mimicking some of the obj in circ.checkin and circ.checkout where map_row_to_column is usually defined
		var obj = {}; 
		JSAN.use('util.error'); obj.error = new util.error();
		JSAN.use('OpenILS.data'); obj.data = new OpenILS.data(); obj.data.init({'via':'stash'});
		JSAN.use('util.network'); obj.network = new util.network();
		JSAN.use('util.money');

		var my = row.my;
		var value;
		try { 
			value = eval( col.render );
		} catch(E) {
			obj.error.sdump('D_WARN','map_row_to_column: ' + E);
			if (error_value) value = error_value; else value = '   ';
		}
		return value;
	}
}

circ.util.checkin_via_barcode = function(session,barcode,backdate,auto_print) {
	try {
		JSAN.use('util.error'); var error = new util.error();
		JSAN.use('util.network'); var network = new util.network();
		JSAN.use('OpenILS.data'); var data = new OpenILS.data(); data.init({'via':'stash'});
		JSAN.use('util.date');
		if (backdate && (backdate == util.date.formatted_date(new Date(),'%Y-%m-%d')) ) backdate = null;

		var params = { 'barcode' : barcode };
		if (backdate) params.backdate = backdate;

		var check = network.request(
			api.CHECKIN_VIA_BARCODE.app,
			api.CHECKIN_VIA_BARCODE.method,
			[ session, params ],
			null,
			{
				'title' : 'Override Checkin Failure?',
				'overridable_events' : [ 
					1203 /* COPY_BAD_STATUS */, 
					1213 /* PATRON_BARRED */,
					1217 /* PATRON_INACTIVE */,
					1224 /* PATRON_ACCOUNT_EXPIRED */,
					7009 /* CIRC_CLAIMS_RETURNED */,
					7010 /* COPY_ALERT_MESSAGE */, 
					7011 /* COPY_STATUS_LOST */, 
					7012 /* COPY_STATUS_MISSING */, 
					7013 /* PATRON_EXCEEDS_FINES */,
				],
				'text' : {
					'1203' : function(r) {
						//return data.hash.ccs[ r.payload.status() ].name();
						return r.payload.status().name();
					},
					'7010' : function(r) {
						return r.payload;
					},
				}
			}
		);

		error.sdump('D_DEBUG','check = ' + error.pretty_print( js2JSON( check ) ) );

		check.message = check.textcode;

		if (check.payload && check.payload.copy) check.copy = check.payload.copy;
		if (check.payload && check.payload.record) check.record = check.payload.record;
		if (check.payload && check.payload.circ) check.circ = check.payload.circ;

		if (!check.route_to) check.route_to = '   ';

		/* SUCCESS  /  NO_CHANGE  /  ITEM_NOT_CATALOGED */
		if (check.ilsevent == 0 || check.ilsevent == 3 || check.ilsevent == 1202) {
			try { check.route_to = data.lookup('acpl', check.copy.location() ).name(); } catch(E) { msg += 'Please inform your helpdesk/developers of this error:\nFIXME: ' + E + '\n'; }
			var msg = '';
			if (check.ilsevent == 3) msg = 'This item is already checked in.\n';
			if (check.ilsevent == 1202 && check.copy.status() != 11) {
				msg = 'Please inform your helpdesk/developers of this error:\nFIXME -- ITEM_NOT_CATALOGED event but copy status is '
					+ (data.hash.ccs[ check.copy.status() ] ? data.hash.ccs[ check.copy.status() ].name() : check.copy.status().name() ) + '\n';
			}
			switch(check.copy.status()) {
				case 0: /* AVAILABLE */
				case 7: /* RESHELVING */
					if (msg) msg += 'This item needs to be routed to ' + check.route_to + '.';
				break;
				case 8: /* ON HOLDS SHELF */
					check.route_to = 'HOLDS SHELF';
					if (check.payload.hold) {
						if (check.payload.hold.pickup_lib() != data.list.au[0].ws_ou()) {
							msg += 'Please inform your helpdesk/developers of this error:\nFIXME:  We should have received a ROUTE_ITEM\n';
						} else {
							msg += 'This item needs to be routed to ' + check.route_to + '.\n';
						}
					} else { 
						msg += 'Please inform your helpdesk/developers of this error:\nFIXME: status of Holds Shelf, but no actual hold found.\n';
					}
					JSAN.use('util.date'); 
					if (check.payload.hold) {
						JSAN.use('patron.util');
						msg += '\nBarcode: ' + check.payload.copy.barcode() + '\n';
						msg += 'Title: ' + (check.payload.record ? check.payload.record.title() : check.payload.copy.dummy_title() ) + '\n';
						var au_obj = patron.util.retrieve_fleshed_au_via_id( session, check.payload.hold.usr() );
						msg += '\nHold for patron ' + au_obj.family_name() + ', ' + au_obj.first_given_name() + '\n';
						msg += 'Barcode: ' + au_obj.card().barcode() + '\n';
						if (check.payload.hold.phone_notify()) msg += 'Notify by phone: ' + check.payload.hold.phone_notify() + '\n';
						if (check.payload.hold.email_notify()) msg += 'Notify by email: ' + (au_obj.email() ? au_obj.email() : '') + '\n';
						msg += '\nRequest Date: ' + util.date.formatted_date(check.payload.hold.request_time(),'%F') + '\n';
					}
					var rv = 0;
					msg += 'Slip Date: ' + util.date.formatted_date(new Date(),'%F') + '\n';
					if (!auto_print) rv = error.yns_alert(
						msg,
						'Hold Slip',
						"Print",
						"Don't Print",
						null,
						"Check here to confirm this message"
					);
					if (rv == 0) {
						try {
							JSAN.use('util.print'); var print = new util.print();
							print.simple( msg, { 'no_prompt' : true, 'content_type' : 'text/plain' } );
						} catch(E) {
							dump('Please inform your helpdesk/developers of this error:\nFIXME: ' + E + '\n');
							alert('Please inform your helpdesk/developers of this error:\nFIXME: ' + E + '\n');
						}
					}
					msg = '';
				break;
				case 6: /* IN TRANSIT */
					check.route_to = 'TRANSIT SHELF??';
					msg += ("Please inform your helpdesk/developers of this error:\nFIXME -- I didn't think we could get here.\n");
				break;
				case 11: /* CATALOGING */
					check.route_to = 'CATALOGING';
					msg += 'This item needs to be routed to ' + check.route_to + '.';
				break;
				default:
					msg += ('Please inform your helpdesk/developers of this error:\nFIXME -- this case "' + (data.hash.ccs[check.copy.status()] ? data.hash.ccs[check.copy.status()].name() : check.copy.status().name()) + '" is unhandled.\n');
					msg += 'This item needs to be routed to ' + check.route_to + '.';
				break;
			}
			if (msg) error.yns_alert(msg,'Alert',null,'OK',null,"Check here to confirm this message");

		} else /* ROUTE_ITEM */ if (check.ilsevent == 7000) {

			var lib = data.hash.aou[ check.org ];
			check.route_to = lib.shortname();
			var msg = 'This item is in transit to ' + check.route_to + '.\n';
			msg += '\n' + lib.name() + '\n';
			try {
				if (lib.holds_address() ) {
					var a = network.simple_request('FM_AOA_RETRIEVE',[ lib.holds_address() ]);
					if (typeof a.ilsevent != 'undefined') throw(a);
					if (a.street1()) msg += a.street1() + '\n';
					if (a.street2()) msg += a.street2() + '\n';
					msg += (a.city() ? a.city() + ', ' : '') + (a.state() ? a.state() + ' ' : '') + (a.post_code() ? a.post_code() : '') + '\n';
				} else {
					msg += "We do not have a holds address for this library.\n";
				}
			} catch(E) {
				msg += 'Unable to retrieve mailing address.\n';
				error.standard_unexpected_error_alert('Unable to retrieve mailing address.',E);
			}
			msg += '\nBarcode: ' + check.payload.copy.barcode() + '\n';
			msg += 'Title: ' + (check.payload.record ? check.payload.record.title() : check.payload.copy.dummy_title() ) + '\n';
			msg += 'Author: ' + (check.payload.record ? check.payload.record.author() :check.payload.copy.dummy_author()  ) + '\n';
			JSAN.use('util.date');
			if (check.payload.hold) {
				JSAN.use('patron.util');
				var au_obj = patron.util.retrieve_fleshed_au_via_id( session, check.payload.hold.usr() );
				msg += '\nHold for patron ' + au_obj.family_name() + ', ' + au_obj.first_given_name() + '\n';
				msg += 'Barcode: ' + au_obj.card().barcode() + '\n';
				if (check.payload.hold.phone_notify()) msg += 'Notify by phone: ' + check.payload.hold.phone_notify() + '\n';
				if (check.payload.hold.email_notify()) msg += 'Notify by email: ' + (au_obj.email() ? au_obj.email() : '') + '\n';
				msg += '\nRequest Date: ' + util.date.formatted_date(check.payload.hold.request_time(),'%F');
			}
			var rv = 0;
			msg += '\nSlip Date: ' + util.date.formatted_date(new Date(),'%F') + '\n';
			if (!auto_print) rv = error.yns_alert(
				msg,
				'Transit Slip',
				"Print",
				"Don't Print",
				null,
				"Check here to confirm this message"
			);
			if (rv == 0) {
				try {
					JSAN.use('util.print'); var print = new util.print();
					print.simple( msg, { 'no_prompt' : true, 'content_type' : 'text/plain' } );
				} catch(E) {
					dump('Please inform your helpdesk/developers of this error:\nFIXME: ' + E + '\n');
					alert('Please inform your helpdesk/developers of this error:\nFIXME: ' + E + '\n');
				}
			}

		} else /* ASSET_COPY_NOT_FOUND */ if (check.ilsevent == 1502) {

			check.route_to = 'CATALOGING';
			error.yns_alert(
				'The barcode was either mis-scanned or the item needs to be cataloged.',
				'Alert',
				null,
				'OK',
				null,
				"Check here to confirm this message"
			);

		} else /* NETWORK TIMEOUT */ if (check.ilsevent == -1) {
			error.standard_network_error_alert('Check In Failed.  If you wish to use the offline interface, in the top menubar select Circulation -> Offline Interface');
		} else {

			switch (check.ilsevent) {
				case 1203 /* COPY_BAD_STATUS */ : 
				case 1213 /* PATRON_BARRED */ :
				case 1217 /* PATRON_INACTIVE */ :
				case 1224 /* PATRON_ACCOUNT_EXPIRED */ :
				case 7009 /* CIRC_CLAIMS_RETURNED */ :
				case 7010 /* COPY_ALERT_MESSAGE */ : 
				case 7011 /* COPY_STATUS_LOST */ : 
				case 7012 /* COPY_STATUS_MISSING */ : 
				case 7013 /* PATRON_EXCEEDS_FINES */ :
					return null; /* handled */
				break;
			}

			throw(check);

		}

//				case '2': case 2: /* LOST??? */
//					JSAN.use('patron.util');
//					var au_obj = patron.util.retrieve_au_via_id( session, check.circ.usr() );
//					var msg = check.text + '\r\n' + 'Barcode: ' + barcode + '  Title: ' + 
//							check.record.title() + '  Author: ' + check.record.author() + '\r\n' +
//							'Patron: ' + au_obj.card().barcode() + ' ' + au_obj.family_name() + ', ' +
//							au_obj.first_given_name();
//					var pcheck = error.yns_alert(
//						msg,
//						'Lost Item',
//						'Edit Copy & Patron',
//						"Just Continue",
//						null,
//						"Check here to confirm this message"
//					); 
//					if (pcheck == 0) {
//						//FIXME//Re-implement
//						/*
//						var w = mw.spawn_main();
//						setTimeout(
//							function() {
//								mw.spawn_patron_display(w.document,'new_tab','main_tabbox',{'patron':au_obj});
//								mw.spawn_batch_copy_editor(w.document,'new_tab','main_tabbox',
//									{'copy_ids':[ check.copy.id() ]});
//							}, 0
//						);
//						*/
//					}
//				break;
		return check;
	} catch(E) {
		JSAN.use('util.error'); var error = new util.error();
		error.standard_unexpected_error_alert('Check In Failed (in circ.util.checkin): ',E);
		return null;
	}
}

circ.util.hold_capture_via_copy_barcode = function ( session, barcode, retrieve_flag ) {
	try {
		JSAN.use('util.network'); var network = new util.network();
		JSAN.use('OpenILS.data'); var data = new OpenILS.data(); data.init({'via':'stash'});
		var params = { barcode: barcode }
		if (retrieve_flag) { params.flesh_record = retrieve_flag; params.flesh_copy = retrieve_flag; }
		var robj = network.request(
			api.CAPTURE_COPY_FOR_HOLD_VIA_BARCODE.app,
			api.CAPTURE_COPY_FOR_HOLD_VIA_BARCODE.method,
			[ session, params ]
		);
		var check = robj.payload;
		if (!check) {
			check = {};
			check.status = robj.ilsevent;
			check.copy = new acp(); check.copy.barcode( barcode );
		}
		check.text = robj.textcode;
		check.route_to = robj.route_to;
		//check.text = 'Captured for Hold';
		if (Number(check.route_to)) check.route_to = data.hash.aou[ check.route_to ].shortname();
		return check;
	} catch(E) {
		JSAN.use('util.error'); var error = new util.error();
		error.standard_unexpected_error_alert('Hold Capture Failed',E);
		return null;
	}
}


dump('exiting circ/util.js\n');
