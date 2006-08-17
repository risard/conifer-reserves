dump('entering patron/util.js\n');

if (typeof patron == 'undefined') var patron = {};
patron.util = {};

patron.util.EXPORT_OK	= [ 
	'columns', 'mbts_columns', 'mb_columns', 'mp_columns', 'std_map_row_to_column', 'retrieve_au_via_id', 'retrieve_fleshed_au_via_id', 'retrieve_fleshed_au_via_barcode', 'set_penalty_css'
];
patron.util.EXPORT_TAGS	= { ':all' : patron.util.EXPORT_OK };

patron.util.mbts_columns = function(modify,params) {

	JSAN.use('OpenILS.data'); var data = new OpenILS.data(); data.init({'via':'stash'});

	function getString(s) { return data.entities[s]; }


	var c = [
		{
			'persist' : 'hidden width ordinal', 'id' : 'id', 'label' : 'Id', 'flex' : 1,
			'primary' : false, 'hidden' : false, 'render' : 'my.mbts.id()'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'usr', 'label' : 'User', 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'my.mbts.usr() ? "Id = " + my.mbts.usr() : ""'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'xact_type', 'label' : 'Type', 'flex' : 1,
			'primary' : false, 'hidden' : false, 'render' : 'my.mbts.xact_type()'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'balance_owed', 'label' : 'Balance Owed', 'flex' : 1,
			'primary' : false, 'hidden' : false, 'render' : 'util.money.sanitize( my.mbts.balance_owed() )',
			'sort_type' : 'money',
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'total_owed', 'label' : 'Total Billed', 'flex' : 1,
			'primary' : false, 'hidden' : false, 'render' : 'util.money.sanitize( my.mbts.total_owed() )',
			'sort_type' : 'money',
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'total_paid', 'label' : 'Total Paid', 'flex' : 1,
			'primary' : false, 'hidden' : false, 'render' : 'util.money.sanitize( my.mbts.total_paid() )',
			'sort_type' : 'money',
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'last_billing_note', 'label' : 'Last Billing Note', 'flex' : 2,
			'primary' : false, 'hidden' : true, 'render' : 'my.mbts.last_billing_note()'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'last_billing_type', 'label' : 'Last Billing Type', 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'my.mbts.last_billing_type()'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'last_billing_ts', 'label' : 'Last Billed', 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'util.date.formatted_date( my.mbts.last_billing_ts(), "" )'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'last_payment_note', 'label' : 'Last Payment Note', 'flex' : 2,
			'primary' : false, 'hidden' : true, 'render' : 'my.mbts.last_payment_note()'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'last_payment_type', 'label' : 'Last Payment Type', 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'my.mbts.last_payment_type()'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'last_payment_ts', 'label' : 'Last Payment', 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'util.date.formatted_date( my.mbts.last_payment_ts(), "" )'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'xact_start', 'label' : 'Created', 'flex' : 1,
			'primary' : false, 'hidden' : false, 'render' : 'my.mbts.xact_start() ? my.mbts.xact_start().toString().substr(0,10) : ""'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'xact_finish', 'label' : 'Closed', 'flex' : 1,
			'primary' : false, 'hidden' : false, 'render' : 'my.mbts.xact_finish() ? my.mbts.xact_finish().toString().substr(0,10) : ""'
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
	return c;
}

patron.util.mb_columns = function(modify,params) {

	JSAN.use('OpenILS.data'); var data = new OpenILS.data(); data.init({'via':'stash'});

	function getString(s) { return data.entities[s]; }


	var c = [
		{
			'persist' : 'hidden width ordinal', 'id' : 'id', 'label' : 'Id', 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'my.mb.id()'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'voided', 'label' : 'Voided', 'flex' : 1,
			'primary' : false, 'hidden' : false, 'render' : 'get_bool( my.mb.voided() ) ? "Yes" : "No"'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'voider', 'label' : 'Voider', 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'my.mb.voider() ? "Id = " + my.mb.voider() : ""'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'void_time', 'label' : 'Void Time', 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'my.mb.void_time()'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'amount', 'label' : 'Amount', 'flex' : 1,
			'primary' : false, 'hidden' : false, 'render' : 'util.money.sanitize( my.mb.amount() )',
			'sort_type' : 'money',
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'billing_type', 'label' : 'Type', 'flex' : 1,
			'primary' : false, 'hidden' : false, 'render' : 'my.mb.billing_type()'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'billing_ts', 'label' : 'When', 'flex' : 1,
			'primary' : false, 'hidden' : false, 'render' : 'util.date.formatted_date( my.mb.billing_ts(), "" )'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'note', 'label' : 'Note', 'flex' : 2,
			'primary' : false, 'hidden' : false, 'render' : 'my.mb.note()'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'xact', 'label' : 'Transaction ID', 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'my.mb.xact()'
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
	return c;
}

patron.util.mp_columns = function(modify,params) {

	JSAN.use('OpenILS.data'); var data = new OpenILS.data(); data.init({'via':'stash'});

	function getString(s) { return data.entities[s]; }


	var c = [
		{
			'persist' : 'hidden width ordinal', 'id' : 'id', 'label' : 'ID', 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'my.mp.id()'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'amount', 'label' : 'Amount', 'flex' : 1,
			'primary' : false, 'hidden' : false, 'render' : 'util.money.sanitize( my.mp.amount() )',
			'sort_type' : 'money',
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'payment_type', 'label' : 'Type', 'flex' : 1,
			'primary' : false, 'hidden' : false, 'render' : 'try { my.mp.payment_type(); } catch(E) { alert(E + "\n" + js2JSON(my.mp)); }'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'payment_ts', 'label' : 'When', 'flex' : 1,
			'primary' : false, 'hidden' : false, 'render' : 'util.date.formatted_date( my.mp.payment_ts(), "" )'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'note', 'label' : 'Note', 'flex' : 2,
			'primary' : false, 'hidden' : false, 'render' : 'my.mp.note()'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'note', 'label' : 'Workstation', 'flex' : 1,
			'primary' : false, 'hidden' : false, 'render' : 'my.mp.cash_drawer().name()'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'note', 'label' : 'Staff', 'flex' : 1,
			'primary' : false, 'hidden' : false, 'render' : 'JSAN.use("patron.util"); var s = my.mp.accepting_usr(); if (s && typeof s != "object") s = patron.util.retrieve_fleshed_au_via_id(ses(),s); s.card().barcode() + " @ " + obj.OpenILS.data.hash.aou[ s.home_ou() ].shortname();'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'xact', 'label' : 'Transaction ID', 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'my.mp.xact()'
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
	return c;
}

patron.util.columns = function(modify,params) {
	
	JSAN.use('OpenILS.data'); var data = new OpenILS.data(); data.init({'via':'stash'});

	function getString(s) { return data.entities[s]; }

	var c = [
		{
			'persist' : 'hidden width ordinal', 'id' : 'barcode', 'label' : 'Barcode', 'flex' : 1, 
			'primary' : false, 'hidden' : true, 'render' : 'my.au.card().barcode()'
		},
		{ 
			'persist' : 'hidden width ordinal', 'id' : 'usrname', 'label' : 'Login Name', 'flex' : 1, 
			'primary' : false, 'hidden' : true, 'render' : 'my.au.usrname()'
		},
		{ 
			'persist' : 'hidden width ordinal', 'id' : 'profile', 'label' : 'Group', 'flex' : 1, 
			'primary' : false, 'hidden' : true, 'render' : 'obj.OpenILS.data.hash.pgt[ my.au.profile() ].name()'
		},
		{ 
			'persist' : 'hidden width ordinal', 'id' : 'active', 'label' : getString('staff.au_label_active'), 'flex' : 1, 
			'primary' : false, 'hidden' : true, 'render' : 'get_bool( my.au.active() ) ? "Yes" : "No"'
		},
		{
			'persist' : 'hidden width ordinal', 'id' : 'barred', 'label' : 'Barred', 'flex' : 1,
			'primary' : false, 'hidden' : true, 'render' : 'get_bool( my.au.barred() ) ? "Yes" : "No"'
		},
		{ 
			'persist' : 'hidden width ordinal', 'id' : 'id', 'label' : getString('staff.au_label_id'), 'flex' : 1, 
			'primary' : false, 'hidden' : true, 'render' : 'my.au.id()'
		},
		{ 
			'persist' : 'hidden width ordinal', 'id' : 'prefix', 'label' : getString('staff.au_label_prefix'), 'flex' : 1, 
			'primary' : false, 'hidden' : true, 'render' : 'my.au.prefix()'
		},
		{ 
			'persist' : 'hidden width ordinal', 'id' : 'family_name', 'label' : getString('staff.au_label_family_name'), 'flex' : 1, 
			'primary' : false, 'hidden' : true, 'render' : 'my.au.family_name()'
		},
		{ 
			'persist' : 'hidden width ordinal', 'id' : 'first_given_name', 'label' : getString('staff.au_label_first_given_name'), 'flex' : 1, 
			'primary' : false, 'hidden' : true, 'render' : 'my.au.first_given_name()'
		},
		{ 
			'persist' : 'hidden width ordinal', 'id' : 'second_given_name', 'label' : getString('staff.au_label_second_given_name'), 'flex' : 1, 
			'primary' : false, 'hidden' : true, 'render' : 'my.au.second_given_name()'
		},
		{ 
			'persist' : 'hidden width ordinal', 'id' : 'suffix', 'label' : getString('staff.au_label_suffix'), 'flex' : 1, 
			'primary' : false, 'hidden' : true, 'render' : 'my.au.suffix()'
		},
		{ 
			'persist' : 'hidden width ordinal', 'id' : 'alert_message', 'label' : 'Alert', 'flex' : 1, 
			'primary' : false, 'hidden' : true, 'render' : 'my.au.alert_message()'
		},
		{ 
			'persist' : 'hidden width ordinal', 'id' : 'claims_returned_count', 'label' : 'Returns Claimed', 'flex' : 1, 
			'primary' : false, 'hidden' : true, 'render' : 'my.au.claims_returned_count()',
			'sort_type' : 'number',
		},
		{ 
			'persist' : 'hidden width ordinal', 'id' : 'create_date', 'label' : 'Created On', 'flex' : 1, 
			'primary' : false, 'hidden' : true, 'render' : 'my.au.create_date()'
		},
		{ 
			'persist' : 'hidden width ordinal', 'id' : 'expire_date', 'label' : 'Expires On', 'flex' : 1, 
			'primary' : false, 'hidden' : true, 'render' : 'my.au.expire_date().substr(0,10)'
		},
		{ 
			'persist' : 'hidden width ordinal', 'id' : 'home_ou', 'label' : 'Home Lib', 'flex' : 1, 
			'primary' : false, 'hidden' : true, 'render' : 'obj.OpenILS.data.hash.aou[ my.au.home_ou() ].shortname()'
		},
		{ 
			'persist' : 'hidden width ordinal', 'id' : 'credit_forward_balance', 'label' : 'Credit', 'flex' : 1, 
			'primary' : false, 'hidden' : true, 'render' : 'my.au.credit_forward_balance()',
			'sort_type' : 'money',
		},
		{ 
			'persist' : 'hidden width ordinal', 'id' : 'day_phone', 'label' : 'Day Phone', 'flex' : 1, 
			'primary' : false, 'hidden' : true, 'render' : 'my.au.day_phone()'
		},
		{ 
			'persist' : 'hidden width ordinal', 'id' : 'evening_phone', 'label' : 'Evening Phone', 'flex' : 1, 
			'primary' : false, 'hidden' : true, 'render' : 'my.au.evening_phone()'
		},
		{ 
			'persist' : 'hidden width ordinal', 'id' : 'other_phone', 'label' : 'Other Phone', 'flex' : 1, 
			'primary' : false, 'hidden' : true, 'render' : 'my.au.other_phone()'
		},
		{ 
			'persist' : 'hidden width ordinal', 'id' : 'email', 'label' : 'Email', 'flex' : 1, 
			'primary' : false, 'hidden' : true, 'render' : 'my.au.email()'
		},
		{ 
			'persist' : 'hidden width ordinal', 'id' : 'dob', 'label' : 'Birth Date', 'flex' : 1, 
			'primary' : false, 'hidden' : true, 'render' : 'my.au.dob().substr(0,10)'
		},
		{ 
			'persist' : 'hidden width ordinal', 'id' : 'ident_type', 'label' : 'Ident Type', 'flex' : 1, 
			'primary' : false, 'hidden' : true, 'render' : 'obj.OpenILS.data.hash.cit[ my.au.ident_type() ].name()'
		},
		{ 
			'persist' : 'hidden width ordinal', 'id' : 'ident_value', 'label' : 'Ident Value', 'flex' : 1, 
			'primary' : false, 'hidden' : true, 'render' : 'my.au.ident_value()'
		},
		{ 
			'persist' : 'hidden width ordinal', 'id' : 'ident_type2', 'label' : 'Ident Type 2', 'flex' : 1, 
			'primary' : false, 'hidden' : true, 'render' : 'obj.OpenILS.data.hash.cit[ my.au.ident_type2() ].name()'
		},
		{ 
			'persist' : 'hidden width ordinal', 'id' : 'ident_value2', 'label' : 'Ident Value 2', 'flex' : 1, 
			'primary' : false, 'hidden' : true, 'render' : 'my.au.ident_value2()'
		},
		{ 
			'persist' : 'hidden width ordinal', 'id' : 'net_access_level', 'label' : 'Net Access', 'flex' : 1, 
			'primary' : false, 'hidden' : true, 'render' : 'my.au.net_access_level()'
		},
		{ 
			'persist' : 'hidden width ordinal', 'id' : 'master_account', 'label' : 'Group Lead', 'flex' : 1, 
			'primary' : false, 'hidden' : true, 'render' : 'get_bool( my.au.master_account() ) ? "Yes" : "No"'
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
	return c;
}

patron.util.std_map_row_to_column = function(error_value) {
	return function(row,col) {
		// row contains { 'my' : { 'au' : {} } }
		// col contains one of the objects listed above in columns
		
		var obj = {}; obj.OpenILS = {}; 
		JSAN.use('util.error'); obj.error = new util.error();
		JSAN.use('OpenILS.data'); obj.OpenILS.data = new OpenILS.data(); obj.OpenILS.data.init({'via':'stash'});
		JSAN.use('util.date'); JSAN.use('util.money');

		var my = row.my;
		var value;
		try { 
			value = eval( col.render );
		} catch(E) {
			obj.error.sdump('D_WARN','map_row_to_column: ' + E);
			if (error_value) { value = error_value; } else { value = '   ' };
		}
		return value;
	}
}

patron.util.retrieve_au_via_id = function(session, id, f) {
	JSAN.use('util.network');
	var network = new util.network();
	var patron_obj = network.request(
		api.FM_AU_RETRIEVE_VIA_ID.app,
		api.FM_AU_RETRIEVE_VIA_ID.method,
		[ session, id ],
		f
	);
	return patron_obj;
}

patron.util.retrieve_fleshed_au_via_id = function(session, id) {
	JSAN.use('util.network');
	var network = new util.network();
	var patron_obj = network.simple_request(
		'FM_AU_FLESHED_RETRIEVE_VIA_ID',
		[ session, id ]
	);
	patron.util.set_penalty_css(patron_obj);
	return patron_obj;
}

patron.util.retrieve_fleshed_au_via_barcode = function(session, id) {
	JSAN.use('util.network');
	var network = new util.network();
	var patron_obj = network.simple_request(
		'FM_AU_RETRIEVE_VIA_BARCODE',
		[ session, id ]
	);
	patron.util.set_penalty_css(patron_obj);
	return patron_obj;
}

var TIME = { minute : 60, hour : 60*60, day : 60*60*24, year : 60*60*24*365 };

patron.util.set_penalty_css = function(patron) {
	try {

		JSAN.use('util.network'); var net = new util.network();
		net.simple_request('FM_MOBTS_TOTAL_HAVING_BALANCE',[ ses(), patron.id() ], function(req) {
			if (req.getResultObject() > 0) addCSSClass(document.documentElement,'PATRON_HAS_BILLS');
		});
		net.simple_request('FM_CIRC_COUNT_RETRIEVE_VIA_USER',[ ses(), patron.id() ], function(req) {
			var co = req.getResultObject();
			if (co.overdue > 0 || co.long_overdue > 0) addCSSClass(document.documentElement,'PATRON_HAS_OVERDUES');
		});
		net.simple_request('FM_AUN_RETRIEVE_ALL',[ ses(), { 'patronid' : patron.id() } ], function(req) {
			var notes = req.getResultObject();
			if (notes.length > 0) addCSSClass(document.documentElement,'PATRON_HAS_NOTES');
		});

		JSAN.use('OpenILS.data'); var data = new OpenILS.data(); data.init({'via':'stash'});
		data.last_patron = patron.id(); data.stash('last_patron');

		var penalties = patron.standing_penalties();
		for (var i = 0; i < penalties.length; i++) {
			/* this comes from /opac/common/js/utils.js */
			addCSSClass(document.documentElement,penalties[i].penalty_type());
		}

		switch(penalties.length) {
			case 0: addCSSClass(document.documentElement,'NO_PENALTIES'); break;
			case 1: addCSSClass(document.documentElement,'ONE_PENALTY'); break;
			default: addCSSClass(document.documentElement,'MULTIPLE_PENALTIES'); break;
		}

		if (patron.alert_message()) {
			addCSSClass(document.documentElement,'PATRON_HAS_ALERT');
		}

		if (get_bool( patron.barred() )) {
			addCSSClass(document.documentElement,'PATRON_BARRED');
		}

		if (!get_bool( patron.active() )) {
			addCSSClass(document.documentElement,'PATRON_INACTIVE');
		}

		var now = new Date();
		now = now.getTime()/1000;

		var expire_parts = patron.expire_date().substr(0,10).split('-');
		expire_parts[1] = expire_parts[1] - 1;

		var expire = new Date();
		expire.setFullYear(expire_parts[0], expire_parts[1], expire_parts[2]);
		expire = expire.getTime()/1000

		if (expire < now) addCSSClass(document.documentElement,'PATRON_EXPIRED');

		if (patron.dob()) {
			var age_parts = patron.dob().substr(0,10).split('-');
			age_parts[1] = age_parts[1] - 1;

			var born = new Date();
			born.setFullYear(age_parts[0], age_parts[1], age_parts[2]);
			born = born.getTime()/1000

			var patron_age = now - born;
			var years_old = Number(patron_age / TIME.year);

			addCSSClass(document.documentElement,'PATRON_AGE_IS_' + years_old);

			if ( years_old >= 65 ) addCSSClass(document.documentElement,'PATRON_AGE_GE_65');
			if ( years_old < 65 )  addCSSClass(document.documentElement,'PATRON_AGE_LT_65');
		
			if ( years_old >= 24 ) addCSSClass(document.documentElement,'PATRON_AGE_GE_24');
			if ( years_old < 24 )  addCSSClass(document.documentElement,'PATRON_AGE_LT_24');
			
			if ( years_old >= 21 ) addCSSClass(document.documentElement,'PATRON_AGE_GE_21');
			if ( years_old < 21 )  addCSSClass(document.documentElement,'PATRON_AGE_LT_21');
		
			if ( years_old >= 18 ) addCSSClass(document.documentElement,'PATRON_AGE_GE_18');
			if ( years_old < 18 )  addCSSClass(document.documentElement,'PATRON_AGE_LT_18');
		
			if ( years_old >= 13 ) addCSSClass(document.documentElement,'PATRON_AGE_GE_13');
			if ( years_old < 13 )  addCSSClass(document.documentElement,'PATRON_AGE_LT_13');
		} else {
			addCSSClass(document.documentElement,'PATRON_HAS_INVALID_DOB');
		}

		if (patron.mailing_address()) {
			if (!get_bool(patron.mailing_address().valid())) {
				addCSSClass(document.documentElement,'PATRON_HAS_INVALID_ADDRESS');
			}
		}
		if (patron.billing_address()) {
			if (!get_bool(patron.billing_address().valid())) {
				addCSSClass(document.documentElement,'PATRON_HAS_INVALID_ADDRESS');
			}
		}

	} catch(E) {
		dump('patron.util.set_penalty_css: ' + E + '\n');
		alert('patron.util.set_penalty_css: ' + E + '\n');
	}
}


dump('exiting patron/util.js\n');
