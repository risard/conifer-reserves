dump('entering cat/util.js\n');

if (typeof cat == 'undefined') var cat = {};
cat.util = {};

cat.util.EXPORT_OK	= [ 
	'spawn_copy_editor', 'add_copies_to_bucket', 'show_in_opac', 'spawn_spine_editor', 'transfer_copies',
];
cat.util.EXPORT_TAGS	= { ':all' : cat.util.EXPORT_OK };

cat.util.transfer_copies = function(params) {
	JSAN.use('util.error'); var error = new util.error();
	JSAN.use('OpenILS.data'); var data = new OpenILS.data();
	JSAN.use('util.network'); var network = new util.network();
	try {
		data.stash_retrieve();
		if (!data.marked_volume) {
			alert('Please mark a volume as the destination from within holdings maintenance and then try this again.');
			return;
		}
		netscape.security.PrivilegeManager.enablePrivilege('UniversalXPConnect UniversalBrowserWrite');
		var xml = '<vbox xmlns="http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul" flex="1" style="overflow: auto">';
		if (!params.message) {
			params.message = 'Transfer items from their original volumes to ';
			params.message += data.hash.aou[ params.owning_lib ].shortname() + "'s volume labelled ";
			params.message += '"' + params.volume_label + '" on the following record?';
		}

		xml += '<description>' + params.message + '</description>';
		xml += '<hbox><button label="Transfer" name="fancy_submit"/>';
		xml += '<button label="Cancel" accesskey="C" name="fancy_cancel"/></hbox>';
		xml += '<iframe style="overflow: scroll" flex="1" src="' + urls.XUL_BIB_BRIEF + '?docid=' + params.docid + '"/>';
		xml += '</vbox>';
		data.temp_transfer = xml; data.stash('temp_transfer');
		window.open(
			urls.XUL_FANCY_PROMPT
			+ '?xml_in_stash=temp_transfer'
			+ '&title=' + window.escape('Item Transfer'),
			'fancy_prompt', 'chrome,resizable,modal,width=500,height=300'
		);
		data.stash_retrieve();
		if (data.fancy_prompt_data == '') { alert('Transfer Aborted'); return; }

		JSAN.use('util.functional');

		var copies = network.simple_request('FM_ACP_FLESHED_BATCH_RETRIEVE', [ params.copy_ids ]);

		for (var i = 0; i < copies.length; i++) {
			copies[i].call_number( data.marked_volume );
			copies[i].ischanged( 1 );
		}

		var robj = network.simple_request('FM_ACP_FLESHED_BATCH_UPDATE', [ ses(), copies, true ]);
		
		if (typeof robj.ilsevent != 'undefined') {
			throw(robj);
		} else {
			alert('Items transferred.');
		}

	} catch(E) {
		error.standard_unexpected_error_alert('All items not likely transferred.',E);
	}
}

cat.util.spawn_spine_editor = function(selection_list) {
	JSAN.use('util.error'); var error = new util.error();
	try {
		JSAN.use('util.functional');
		xulG.new_tab(
			xulG.url_prefix( urls.XUL_SPINE_LABEL ) + '?barcodes=' 
			+ js2JSON( util.functional.map_list(selection_list,function(o){return o.barcode;}) ),
			{ 'tab_name' : 'Spine Labels' },
			{}
		);
	} catch(E) {
		error.standard_unexpected_error_alert('Spine Labels',E);
	}
}

cat.util.show_in_opac = function(selection_list) {
	JSAN.use('util.error'); var error = new util.error();
	var doc_id; var seen = {};
	try {
		for (var i = 0; i < selection_list.length; i++) {
			doc_id = selection_list[i].doc_id;
			if (!doc_id) {
				alert(selection_list[i].barcode + ' is not cataloged');
				continue;
			}
			if (typeof seen[doc_id] != 'undefined') {
				continue;
			}
			seen[doc_id] = true;
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
		error.standard_unexpected_error_alert('Error opening catalog for document id = ' + doc_id,E);
	}
}

cat.util.add_copies_to_bucket = function(selection_list) {
	JSAN.use('util.functional');
	JSAN.use('util.window'); var win = new util.window();
	JSAN.use('OpenILS.data'); var data = new OpenILS.data(); data.init({'via':'stash'});
	data.cb_temp_copy_ids = js2JSON(
		util.functional.map_list(
			selection_list,
			function (o) {
				if (typeof o.copy_id != 'undefined' && o.copy_id != null) {
					return o.copy_id;
				} else {
					return o;
				}
			}
		)
	);
	data.stash('cb_temp_copy_ids');
	win.open( 
		xulG.url_prefix(urls.XUL_COPY_BUCKETS_QUICK),
		'sel_bucket_win' + win.window_name_increment(),
		'chrome,resizable,modal,center'
	);
}

cat.util.spawn_copy_editor = function(list,edit) {
	try {
	var obj = {};
	JSAN.use('OpenILS.data'); obj.data = new OpenILS.data(); obj.data.init({'via':'stash'});
	JSAN.use('util.network'); obj.network = new util.network();
	JSAN.use('util.error'); obj.error = new util.error();

	var title = list.length == 1 ? '' : 'Batch '; 
	title += edit == 1 ? 'Edit' : 'View';
	title += ' Copy Attributes';

	JSAN.use('util.window'); var win = new util.window();
	obj.data.temp_copies = undefined; obj.data.stash('temp_copies');
	obj.data.temp_callnumbers = undefined; obj.data.stash('temp_callnumbers');
	obj.data.temp_copy_ids = js2JSON(list);
	obj.data.stash('temp_copy_ids');
	var w = win.open(
		window.xulG.url_prefix(urls.XUL_COPY_EDITOR)
			+'?edit='+edit,
		title,
		'chrome,modal,resizable'
	);
	/* FIXME -- need to unique the temp space, and not rely on modalness of window */
	obj.data.stash_retrieve();
	if (!obj.data.temp_copies) return;
	var copies = JSON2js( obj.data.temp_copies );
	obj.data.temp_copies = undefined; obj.data.stash('temp_copies');
	obj.data.temp_callnumbers = undefined; obj.data.stash('temp_callnumbers');
	obj.data.temp_copy_ids = undefined; obj.data.stash('temp_copy_ids');
	obj.error.sdump('D_CAT','in cat/copy_status, copy editor, copies =\n<<' + copies + '>>');
	if (edit=='1' && copies!='' && typeof copies != 'undefined') {
		try {
			var r = obj.network.request(
				api.FM_ACP_FLESHED_BATCH_UPDATE.app,
				api.FM_ACP_FLESHED_BATCH_UPDATE.method,
				[ ses(), copies, true ]
			);
			/* FIXME -- revisit the return value here */
		} catch(E) {
			obj.error.standard_unexpected_error_alert('copy update error',E);
		}
	} else {
		//alert('not updating');
	}
	} catch(E) {
		alert(E);
	}
}

dump('exiting cat/util.js\n');
