var g = {};

var xulG = {};

function my_init() {
	try {
		/******************************************************************************************************/
		/* setup JSAN and some initial libraries */

		netscape.security.PrivilegeManager.enablePrivilege("UniversalXPConnect");
		if (typeof JSAN == 'undefined') { throw( "The JSAN library object is missing."); }
		JSAN.errorLevel = "die"; // none, warn, or die
		JSAN.addRepository('/xul/server/');
		JSAN.use('util.error'); g.error = new util.error();
		g.error.sdump('D_TRACE','my_init() for cat/copy_editor.xul');

		JSAN.use('util.functional');
		JSAN.use('OpenILS.data'); g.data = new OpenILS.data(); g.data.init({'via':'stash'});
		JSAN.use('util.network'); g.network = new util.network();

		g.docid = xul_param('docid',{'modal_xulG':true});
		g.handle_update = xul_param('handle_update',{'modal_xulG':true});

		/******************************************************************************************************/
		/* Get the copy ids from various sources and flesh them */

		var copy_ids = xul_param('copy_ids',{'concat':true,'JSON2js_if_cgi':true,'JSON2js_if_xulG':true,'JSON2js_if_xpcom':true,'stash_name':'temp_copy_ids','clear_xpcom':true,'modal_xulG':true});
		if (!copy_ids) copy_ids = [];

		if (copy_ids.length > 0) g.copies = g.network.simple_request(
			'FM_ACP_FLESHED_BATCH_RETRIEVE',
			[ copy_ids ]
		);

		/******************************************************************************************************/
		/* And other fleshed copies if any */

		if (!g.copies) g.copies = [];
		var c = xul_param('copies',{'concat':true,'JSON2js_if_cgi':true,'JSON2js_if_xpcom':true,'stash_name':'temp_copies','clear_xpcom':true,'modal_xulG':true})
		if (c) g.copies = g.copies.concat(c);

		/******************************************************************************************************/
		/* We try to retrieve callnumbers for existing copies, but for new copies, we rely on this */

		g.callnumbers = xul_param('callnumbers',{'concat':true,'JSON2js_if_cgi':true,'JSON2js_if_xpcom':true,'stash_name':'temp_callnumbers','clear_xpcom':true,'modal_xulG':true});


		/******************************************************************************************************/
		/* Quick fix, this was defined inline in the global scope but now needs g.error and g.copies from my_init */

        init_panes();

		/******************************************************************************************************/
		/* Is the interface an editor or a viewer, single or multi copy, existing copies or new copies? */

		if (xul_param('edit',{'modal_xulG':true}) == '1') { 
			g.edit = true;
			document.getElementById('caption').setAttribute('label','Copy Editor'); 
			document.getElementById('save').setAttribute('hidden','false'); 
			g.retrieve_templates();
		} else {
			$('top_nav').setAttribute('hidden','true');
		}

		if (g.copies.length > 0 && g.copies[0].id() < 0) {
			document.getElementById('copy_notes').setAttribute('hidden','true');
			g.apply("status",5 /* In Process */);
			$('save').setAttribute('label','Create Copies');
		} else {
			g.panes_and_field_names.left_pane = 
				[
					[
						"Status",
						{ 
							render: 'typeof fm.status() == "object" ? fm.status().name() : g.data.hash.ccs[ fm.status() ].name()', 
							input: g.safe_to_edit_copy_status() ? 'c = function(v){ g.apply("status",v); if (typeof post_c == "function") post_c(v); }; x = util.widgets.make_menulist( util.functional.map_list( g.data.list.ccs, function(obj) { return [ obj.name(), obj.id(), typeof my_constants.magical_statuses[obj.id()] != "undefined" ? true : false ]; } ).sort() ); x.addEventListener("apply",function(f){ return function(ev) { f(ev.target.value); } }(c), false);' : undefined,
							//input: 'c = function(v){ g.apply("status",v); if (typeof post_c == "function") post_c(v); }; x = util.widgets.make_menulist( util.functional.map_list( util.functional.filter_list( g.data.list.ccs, function(obj) { return typeof my_constants.magical_statuses[obj.id()] == "undefined"; } ), function(obj) { return [ obj.name(), obj.id() ]; } ).sort() ); x.addEventListener("apply",function(f){ return function(ev) { f(ev.target.value); } }(c), false);',
						}
					]
				].concat(g.panes_and_field_names.left_pane);
		}

		if (g.copies.length != 1) {
			document.getElementById('copy_notes').setAttribute('hidden','true');
		}

		/******************************************************************************************************/
		/* Show the Record Details? */

		if (g.docid) {
			document.getElementById('brief_display').setAttribute(
				'src',
				urls.XUL_BIB_BRIEF + '?docid=' + g.docid
			);
		} else {
			document.getElementById('brief_display').setAttribute('hidden','true');
		}

		/******************************************************************************************************/
		/* Add stat cats to the panes_and_field_names.right_pane4 */

		g.stat_cat_seen = {};

		function add_stat_cat(sc) {

			if (typeof g.data.hash.asc == 'undefined') { g.data.hash.asc = {}; g.data.stash('hash'); }

			var sc_id = sc;

			if (typeof sc == 'object') {

				sc_id = sc.id();
			}

			if (typeof g.stat_cat_seen[sc_id] != 'undefined') { return; }

			g.stat_cat_seen[ sc_id ] = 1;

			if (typeof sc != 'object') {

				sc = g.network.simple_request(
					'FM_ASC_BATCH_RETRIEVE',
					[ ses(), [ sc_id ] ]
				)[0];

			}

			g.data.hash.asc[ sc.id() ] = sc; g.data.stash('hash');

			var label_name = g.data.hash.aou[ sc.owner() ].shortname() + " : " + sc.name();

			var temp_array = [
				label_name,
				{
					render: 'var l = util.functional.find_list( fm.stat_cat_entries(), function(e){ return e.stat_cat() == ' 
						+ sc.id() + '; } ); l ? l.value() : "<Unset>";',
					input: 'c = function(v){ g.apply_stat_cat(' + sc.id() + ',v); if (typeof post_c == "function") post_c(v); }; x = util.widgets.make_menulist( [ [ "<Remove Stat Cat>", -1 ] ].concat( util.functional.map_list( g.data.hash.asc[' + sc.id() 
						+ '].entries(), function(obj){ return [ obj.value(), obj.id() ]; } ) ).sort() ); '
					//input: 'c = function(v){ g.apply_stat_cat(' + sc.id() + ',v); if (typeof post_c == "function") post_c(v); }; x = util.widgets.make_menulist( [ [ "<Remove Stat Cat>", null ] ].concat( util.functional.map_list( g.data.hash.asc[' + sc.id() 
					//	+ '].entries(), function(obj){ return [ obj.value(), obj.id() ]; } ).sort() ) ); '
						+ 'x.addEventListener("apply",function(f){ return function(ev) { f(ev.target.value); } }(c),false);',
				}
			];

			dump('temp_array = ' + js2JSON(temp_array) + '\n');

			g.panes_and_field_names.right_pane4.push( temp_array );
		}

		/* The stat cats for the pertinent library */
		for (var i = 0; i < g.data.list.my_asc.length; i++) {
			add_stat_cat( g.data.list.my_asc[i] );	
		}

		/* Other stat cats present on these copies */
		for (var i = 0; i < g.copies.length; i++) {
			var entries = g.copies[i].stat_cat_entries();
			if (!entries) entries = [];
			for (var j = 0; j < entries.length; j++) {
				var sc_id = entries[j].stat_cat();
				add_stat_cat( sc_id );
			}
		}

		/******************************************************************************************************/
		/* Backup copies :) */

		g.original_copies = js2JSON( g.copies );

		/******************************************************************************************************/
		/* Do it */

		g.summarize( g.copies );
		g.render();

	} catch(E) {
		var err_msg = "!! This software has encountered an error.  Please tell your friendly " +
			"system administrator or software developer the following:\ncat/copy_editor.xul\n" + E + '\n';
		try { g.error.sdump('D_ERROR',err_msg); } catch(E) { dump(err_msg); dump(js2JSON(E)); }
		alert(err_msg);
	}
}

/******************************************************************************************************/
/* File picker for template export/import */

function pick_file(mode) {
	netscape.security.PrivilegeManager.enablePrivilege("UniversalXPConnect");
	var nsIFilePicker = Components.interfaces.nsIFilePicker;
	var fp = Components.classes["@mozilla.org/filepicker;1"].createInstance( nsIFilePicker );
	fp.init( 
		window, 
		mode == 'open' ? "Import Templates File" : "Save Templates File As", 
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

/******************************************************************************************************/
/* Retrieve Templates */

g.retrieve_templates = function() {
	try {
		JSAN.use('util.widgets'); JSAN.use('util.functional');
		g.templates = {};
		var robj = g.network.simple_request('FM_AUS_RETRIEVE',[ses(),g.data.list.au[0].id()]);
		if (typeof robj['staff_client.copy_editor.templates'] != 'undefined') {
			g.templates = robj['staff_client.copy_editor.templates'];
		}
		util.widgets.remove_children('template_placeholder');
		var list = util.functional.map_object_to_list( g.templates, function(obj,i) { return [i, i]; } );

		g.template_menu = util.widgets.make_menulist( list );
		$('template_placeholder').appendChild(g.template_menu);
	} catch(E) {
		g.error.standard_unexpected_error_alert('Error retrieving templates',E);
	}
}

/******************************************************************************************************/
/* Apply Template */

g.apply_template = function() {
	try {
		var name = g.template_menu.value;
		if (g.templates[ name ] != 'undefined') {
			var template = g.templates[ name ];
			for (var i in template) {
				g.changed[ i ] = template[ i ];
				switch( template[i].type ) {
					case 'attribute' :
						g.apply(template[i].field,template[i].value);
					break;
					case 'stat_cat' :
						if (g.stat_cat_seen[ template[i].field ]) g.apply_stat_cat(template[i].field,template[i].value);
					break;
					case 'owning_lib' :
						g.apply_owning_lib(template[i].value);
					break;
				}
			}
			g.summarize( g.copies );
			g.render();
		}
	} catch(E) {
		g.error.standard_unexpected_error_alert('Error applying template',E);
	}
}

/******************************************************************************************************/
/* Save as Template */

g.save_template = function() {
	try {
		var name = window.prompt('Enter template name:','','Save As Template');
		if (!name) return;
		g.templates[name] = g.changed;
		var robj = g.network.simple_request(
			'FM_AUS_UPDATE',[ses(),g.data.list.au[0].id(), { 'staff_client.copy_editor.templates' : g.templates }]
		);
		if (typeof robj.ilsevent != 'undefined') {
			throw(robj);
		} else {
			alert('Template "' + name + '" saved.');
			setTimeout(
				function() {
					try {
						g.retrieve_templates();
					} catch(E) {
						g.error.standard_unexpected_error_alert('Error saving template',E);
					}
				},0
			);
		}
	} catch(E) {
		g.error.standard_unexpected_error_alert('Error saving template',E);
	}
}

/******************************************************************************************************/
/* Delete Template */

g.delete_template = function() {
	try {
		var name = g.template_menu.value;
		if (!name) return;
		if (! window.confirm('Delete template "' + name + '"?') ) return;
		delete(g.templates[name]);
		var robj = g.network.simple_request(
			'FM_AUS_UPDATE',[ses(),g.data.list.au[0].id(), { 'staff_client.copy_editor.templates' : g.templates }]
		);
		if (typeof robj.ilsevent != 'undefined') {
			throw(robj);
		} else {
			alert('Template "' + name + '" deleted.');
			setTimeout(
				function() {
					try {
						g.retrieve_templates();
					} catch(E) {
						g.error.standard_unexpected_error_alert('Error deleting template',E);
					}
				},0
			);
		}
	} catch(E) {
		g.error.standard_unexpected_error_alert('Error deleting template',E);
	}
}

/******************************************************************************************************/
/* Export Templates */

g.export_templates = function() {
	try {
		netscape.security.PrivilegeManager.enablePrivilege("UniversalXPConnect");
		JSAN.use('util.file');
		var f = pick_file('save');
		if (f) {
			if (f.exists()) {
				var r = G.error.yns_alert(
					'Would you like to overwrite the existing file ' + f.leafName + '?',
					'Templates Export Warning',
					'Yes',
					'No',
					null,
					'Check here to confirm this message'
				);
				if (r != 0) { file.close(); alert('Not overwriting file.'); return; }
			}
			var e_file = new util.file(''); e_file._file = f;
			e_file.write_content( 'truncate', js2JSON( g.templates ) );
			e_file.close();
			alert('Templates exported as file ' + f.leafName);
		} else {
			alert('File not chosen for export.');
		}

	} catch(E) {
		g.error.standard_unexpected_error_alert('Error exporting templates',E);
	}
}

/******************************************************************************************************/
/* Import Templates */

g.import_templates = function() {
	try {
		netscape.security.PrivilegeManager.enablePrivilege("UniversalXPConnect");
		JSAN.use('util.file');
		var f = pick_file('open');
		if (f && f.exists()) {
			var i_file = new util.file(''); i_file._file = f;
			var temp = JSON2js( i_file.get_content() );
			i_file.close();
			for (var i in temp) {

				if (g.templates[i]) {

					var r = g.error.yns_alert(
						'Replace the existing template with the imported template?\n' + g.error.pretty_print( js2JSON( temp[i] ) ),
						'Template ' + i + ' already exists.','Yes','No',null,'Click here'
					);

					if (r == 0 /* Yes */) g.templates[i] = temp[i];

				} else {

					g.templates[i] = temp[i];

				}

			}

			var r = g.error.yns_alert(
				'Save all of these imported templates permanently to this account?',
				'Final Warning', 'Yes', 'No', null, 'Click here'
			);

			if (r == 0 /* Yes */) {
				var robj = g.network.simple_request(
					'FM_AUS_UPDATE',[ses(),g.data.list.au[0].id(), { 'staff_client.copy_editor.templates' : g.templates }]
				);
				if (typeof robj.ilsevent != 'undefined') {
					throw(robj);
				} else {
					alert('All templates saved.');
					setTimeout(
						function() {
							try {
								g.retrieve_templates();
							} catch(E) {
								g.error.standard_unexpected_error_alert('Error saving templates',E);
							}
						},0
					);
				}
			} else {
				util.widgets.remove_children('template_placeholder');
				var list = util.functional.map_object_to_list( g.templates, function(obj,i) { return [i, i]; } );
				g.template_menu = util.widgets.make_menulist( list );
				$('template_placeholder').appendChild(g.template_menu);
				alert("Note: These imported templates will get saved along with any new template you try to create, but if that doesn't happen, then these templates will dissappear with the next invocation of the item attribute editor.");
			}

		} else {
			alert('File not chosen for import.');
		}
	} catch(E) {
		g.error.standard_unexpected_error_alert('Error importing templates',E);
	}
}


/******************************************************************************************************/
/* Restore backup copies */

g.reset = function() {
	g.changed = {};
	g.copies = JSON2js( g.original_copies );
	g.summarize( g.copies );
	g.render();
}

/******************************************************************************************************/
/* Apply a value to a specific field on all the copies being edited */

g.apply = function(field,value) {
	g.error.sdump('D_TRACE','applying field = <' + field + '>  value = <' + value + '>\n');
	if (value == '<HACK:KLUDGE:NULL>') value = null;
	if (field == 'alert_message') { value = value.replace(/^\W+$/g,''); }
	if (field == 'price' || field == 'deposit_amount') {
		if (value == '') { value = null; } else { JSAN.use('util.money'); value = util.money.sanitize( value ); }
	}
	for (var i = 0; i < g.copies.length; i++) {
		var copy = g.copies[i];
		try {
			copy[field]( value ); copy.ischanged('1');
		} catch(E) {
			alert(E);
		}
	}
}

/******************************************************************************************************/
/* Apply a stat cat entry to all the copies being edited.  An entry_id of < 0 signifies the stat cat is being removed. */

g.apply_stat_cat = function(sc_id,entry_id) {
	g.error.sdump('D_TRACE','sc_id = ' + sc_id + '  entry_id = ' + entry_id + '\n');
	for (var i = 0; i < g.copies.length; i++) {
		var copy = g.copies[i];
		try {
			copy.ischanged('1');
			var temp = copy.stat_cat_entries();
			if (!temp) temp = [];
			temp = util.functional.filter_list(
				temp,
				function (obj) {
					return (obj.stat_cat() != sc_id);
				}
			);
			if (entry_id > -1) temp.push( 
				util.functional.find_id_object_in_list( 
					g.data.hash.asc[sc_id].entries(), 
					entry_id
				)
			);
			copy.stat_cat_entries( temp );

		} catch(E) {
			g.error.standard_unexpected_error_alert('apply_stat_cat',E);
		}
	}
}

/******************************************************************************************************/
/* Apply an "owning lib" to all the copies being edited.  That is, change and auto-vivicating volumes */

g.apply_owning_lib = function(ou_id) {
	g.error.sdump('D_TRACE','ou_id = ' + ou_id + '\n');
	var map_acn = {};
	for (var i = 0; i < g.copies.length; i++) {
		var copy = g.copies[i];
		try {
			if (!map_acn[copy.call_number()]) {
				var volume = g.network.simple_request('FM_ACN_RETRIEVE',[ copy.call_number() ]);
				if (typeof volume.ilsevent != 'undefined') {
					g.error.standard_unexpected_error_alert('Error retrieving Volume information for copy ' + copy.barcode() + ".  The owning library for this copy won't be changed.",volume);
					continue;
				}
				map_acn[copy.call_number()] = volume;
			}
			var old_volume = map_acn[copy.call_number()];
			var acn_id = g.network.simple_request(
				'FM_ACN_FIND_OR_CREATE',
				[ses(),old_volume.label(),old_volume.record(),ou_id]
			);
			if (typeof acn_id.ilsevent != 'undefined') {
				g.error.standard_unexpected_error_alert('Error changing owning lib for copy ' + copy.barcode() + ".  The owning library for this copy won't be changed.",acn_id);
				continue;
			}
			copy.call_number(acn_id);
			copy.ischanged('1');
		} catch(E) {
			g.error.standard_unexpected_error_alert('apply_stat_cat',E);
		}
	}
}

/******************************************************************************************************/
/* This returns true if none of the copies being edited are pre-cats */

g.safe_to_change_owning_lib = function() {
	try {
		var safe = true;
		for (var i = 0; i < g.copies.length; i++) {
			var cn = g.copies[i].call_number();
			if (typeof cn == 'object') { cn = cn.id(); }
			if (cn == -1) { safe = false; }
		}
		return safe;
	} catch(E) {
        g.error.standard_unexpected_error_alert('safe_to_change_owning_lib?',E);
		return false;
	}
}

/******************************************************************************************************/
/* This returns true if none of the copies being edited have a magical status found in my_constants.magical_statuses */

g.safe_to_edit_copy_status = function() {
	try {
		var safe = true;
		for (var i = 0; i < g.copies.length; i++) {
			var status = g.copies[i].status(); if (typeof status == 'object') status = status.id();
			if (typeof my_constants.magical_statuses[ status ] != 'undefined') safe = false;
		}
		return safe;
	} catch(E) {
		g.error.standard_unexpected_error_alert('safe_to_edit_copy_status?',E);
		return false;
	}
}

/******************************************************************************************************/
/* This concats and uniques all the alert messages for use as the default value for a new alert message */

g.populate_alert_message_input = function(tb) {
	try {
		var seen = {}; var s = '';
		for (var i = 0; i < g.copies.length; i++) {
			var msg = g.copies[i].alert_message(); 
			if (msg) {
				if (typeof seen[msg] == 'undefined') {
					s += msg + '\n';
					seen[msg] = true;
				}
			}
		}
		tb.setAttribute('value',s);
	} catch(E) {
		g.error.standard_unexpected_error_alert('populate_alert_message_input',E);
	}
}

/******************************************************************************************************/
/* This returns a list of acpl's appropriate for the copies being edited */

g.get_acpl_list = function() {
	try {

		JSAN.use('util.functional');

		function get(lib_id,only_these) {
            g.data.stash_retrieve();
			var label = 'acpl_list_for_lib_'+lib_id;
			if (typeof g.data[label] == 'undefined') {
				var robj = g.network.simple_request('FM_ACPL_RETRIEVE', [ lib_id ]);
				if (typeof robj.ilsevent != 'undefined') throw(robj);
				var temp_list = [];
				for (var j = 0; j < robj.length; j++) {
					var my_acpl = robj[j];
					if (typeof g.data.hash.acpl[ my_acpl.id() ] == 'undefined') {
						g.data.hash.acpl[ my_acpl.id() ] = my_acpl;
						g.data.list.acpl.push( my_acpl );
					}
                    var only_this_lib = my_acpl.owning_lib(); if (typeof only_this_lib == 'object') only_this_lib = only_this_lib.id();
					if (only_these.indexOf( String( only_this_lib ) ) != -1) {
						temp_list.push( my_acpl );
					}
				}
				g.data[label] = temp_list; g.data.stash(label,'hash','list');
			}
			return g.data[label];
		}

        var temp_acpl_list = [];

        /* find acpl's based on owning_lib */

		var libs = []; var map_acn = {};
		for (var i = 0; i < g.copies.length; i++) {
			var cn_id = g.copies[i].call_number();
			if (cn_id > 0) {
				if (! map_acn[ cn_id ]) {
					map_acn[ cn_id ] = g.network.simple_request('FM_ACN_RETRIEVE',[ cn_id ]);
                    var consider_lib = map_acn[ cn_id ].owning_lib();
				    if ( libs.indexOf( String( consider_lib ) ) > -1 ) { /* already in list */ } else { libs.push( consider_lib ); }
				}
			}
		}
		if (g.callnumbers) {
			for (var i in g.callnumbers) {
                var consider_lib = g.callnumbers[i].owning_lib;
                if (typeof consider_lib == 'object') consider_lib = consider_lib.id();
				if ( libs.indexOf( String( consider_lib ) ) > -1 ) { /* already in list */ } else { libs.push( consider_lib ); }
			}
		}
		JSAN.use('util.fm_utils');
		var ancestor = util.fm_utils.find_common_aou_ancestor( libs );
		if (typeof ancestor == 'object' && ancestor != null) ancestor = ancestor.id();

		var ancestors = util.fm_utils.find_common_aou_ancestors( libs );

		if (ancestor) {
			var acpl_list = get(ancestor, ancestors);
            if (acpl_list) for (var i = 0; i < acpl_list.length; i++) {
                if (acpl_list[i] != null) {
                    temp_acpl_list.push(acpl_list[i]);
                }
            }
		}
        
        /* find acpl's based on circ_lib */

        var circ_libs = [];

        for (var i = 0; i < g.copies.length; i++) {
            var consider_lib = g.copies[i].circ_lib();
            if (typeof consider_lib == 'object') consider_lib = consider_lib.id();
			if ( circ_libs.indexOf( String( consider_lib ) ) > -1 ) { /* already in list */ } else { circ_libs.push( consider_lib ); }
        }

        if (circ_libs.length > 0) {
    		var circ_ancestor = util.fm_utils.find_common_aou_ancestor( circ_libs );
    		if (typeof circ_ancestor == 'object' && circ_ancestor != null) circ_ancestor = circ_ancestor.id();

    		circ_ancestors = util.fm_utils.find_common_aou_ancestors( circ_libs );

    		if (circ_ancestor) {
    			var circ_acpl_list = get(circ_ancestor, circ_ancestors);
                var flat_acpl_list = util.functional.map_list( temp_acpl_list, function(o){return o.id();} );
                for (var i = 0; i < circ_acpl_list.length; i++) {
                    var consider_acpl = circ_acpl_list[i].id();
                    if ( flat_acpl_list.indexOf( String( consider_acpl ) ) > -1 ) { 
                        /* already in list */ 
                    } else { 
                        if (circ_acpl_list[i] != null) temp_acpl_list.push( circ_acpl_list[i] ); 
                    }
                }
            }
        }

        return temp_acpl_list;
	
	} catch(E) {
		g.error.standard_unexpected_error_alert('get_acpl_list',E);
		return [];
	}
}


/******************************************************************************************************/
/* This keeps track of what fields have been edited for styling purposes */

g.changed = {};

/******************************************************************************************************/
/* These need data from the middle layer to render */

g.special_exception = {
	'Owning Lib : Call Number' : function(label,value) {
		JSAN.use('util.widgets');
		if (value>0) { /* an existing call number */
			g.network.request(
				api.FM_ACN_RETRIEVE.app,
				api.FM_ACN_RETRIEVE.method,
				[ value ],
				function(req) {
					var cn = '??? id = ' + value;
					try {
						cn = req.getResultObject();
					} catch(E) {
						g.error.sdump('D_ERROR','callnumber retrieve: ' + E);
					}
					util.widgets.set_text(label,g.data.hash.aou[ cn.owning_lib() ].shortname() + ' : ' + cn.label());
				}
			);
		} else { /* a yet to be created call number */
			if (g.callnumbers) {
				util.widgets.set_text(label,g.data.hash.aou[ g.callnumbers[value].owning_lib ].shortname() + ' : ' + g.callnumbers[value].label);
			}
		}
	},
	'Creator' : function(label,value) {
		if (value == null || value == '' || value == 'null') return;
		g.network.simple_request(
			'FM_AU_RETRIEVE_VIA_ID',
			[ ses(), value ],
			function(req) {
				var p = '??? id = ' + value;
				try {
					p = req.getResultObject();
					p = p.usrname();

				} catch(E) {
					g.error.sdump('D_ERROR','patron retrieve: ' + E);
				}
				JSAN.use('util.widgets');
				util.widgets.set_text(label,p);
			}
		);
	},
	'Last Editor' : function(label,value) {
		if (value == null || value == '' || value == 'null') return;
		g.network.simple_request(
			'FM_AU_RETRIEVE_VIA_ID',
			[ ses(), value ],
			function(req) {
				var p = '??? id = ' + value;
				try {
					p = req.getResultObject();
					p = p.usrname();

				} catch(E) {
					g.error.sdump('D_ERROR','patron retrieve: ' + E);
				}
				util.widgets.set_text(label,p);
			}
		);
	}

}

/******************************************************************************************************/
g.readonly_stat_cat_names = [];
g.editable_stat_cat_names = [];

/******************************************************************************************************/
/* These get show in the left panel */

function init_panes() {
g.panes_and_field_names = {

	'left_pane' :
[
	[
		"Barcode",		 
		{
			render: 'fm.barcode();',
		}
	], 
	[
		"Creation Date",
		{ 
			render: 'util.date.formatted_date( fm.create_date(), "%F");',
		}
	],
	[
		"Creator",
		{ 
			render: 'fm.creator();',
		}
	],
	[
		"Last Edit Date",
		{ 
			render: 'util.date.formatted_date( fm.edit_date(), "%F");',
		}
	],
	[
		"Last Editor",
		{
			render: 'fm.editor();',
		}
	],

],

'right_pane' :
[
	[
		"Shelving Location",
		{ 
			render: 'typeof fm.location() == "object" ? fm.location().name() : g.data.lookup("acpl",fm.location()).name()', 
			input: 'c = function(v){ g.apply("location",v); if (typeof post_c == "function") post_c(v); }; x = util.widgets.make_menulist( util.functional.map_list( g.get_acpl_list(), function(obj) { return [ g.data.hash.aou[ obj.owning_lib() ].shortname() + " : " + obj.name(), obj.id() ]; }).sort()); x.addEventListener("apply",function(f){ return function(ev) { f(ev.target.value); } }(c), false);',

		}
	],
	[
		"Circulation Library",		
		{ 	
			render: 'typeof fm.circ_lib() == "object" ? fm.circ_lib().shortname() : g.data.hash.aou[ fm.circ_lib() ].shortname()',
			//input: 'c = function(v){ g.apply("circ_lib",v); if (typeof post_c == "function") post_c(v); }; x = util.widgets.make_menulist( util.functional.map_list( util.functional.filter_list(g.data.list.my_aou, function(obj) { return g.data.hash.aout[ obj.ou_type() ].can_have_vols(); }), function(obj) { return [ obj.shortname(), obj.id() ]; }).sort() ); x.addEventListener("apply",function(f){ return function(ev) { f(ev.target.value); } }(c), false);',
			input: 'c = function(v){ g.apply("circ_lib",v); if (typeof post_c == "function") post_c(v); }; x = util.widgets.make_menulist( util.functional.map_list( g.data.list.aou, function(obj) { var sname = obj.shortname(); for (i = sname.length; i < 20; i++) sname += " "; return [ obj.name() ? sname + " " + obj.name() : obj.shortname(), obj.id(), ( ! get_bool( g.data.hash.aout[ obj.ou_type() ].can_have_vols() ) ), ( g.data.hash.aout[ obj.ou_type() ].depth() * 2), ]; }), g.data.list.au[0].ws_ou()); x.addEventListener("apply",function(f){ return function(ev) { f(ev.target.value); } }(c), false);',
		} 
	],
	[
		"Owning Lib : Call Number", 	
		{
			render: 'fm.call_number();',
			input: g.safe_to_change_owning_lib() ? 'c = function(v){ g.apply_owning_lib(v); if (typeof post_c == "function") post_c(v); }; x = util.widgets.make_menulist( util.functional.map_list( g.data.list.aou, function(obj) { var sname = obj.shortname(); for (i = sname.length; i < 20; i++) sname += " "; return [ obj.name() ? sname + " " + obj.name() : obj.shortname(), obj.id(), ( ! get_bool( g.data.hash.aout[ obj.ou_type() ].can_have_vols() ) ), ( g.data.hash.aout[ obj.ou_type() ].depth() * 2), ]; }), g.data.list.au[0].ws_ou()); x.addEventListener("apply",function(f){ return function(ev) { f(ev.target.value); } }(c), false);' : undefined,
		}
	],
	[
		"Copy Number",
		{ 
			render: 'fm.copy_number() == null ? "<Unset>" : fm.copy_number()',
			input: 'c = function(v){ g.apply("copy_number",v); if (typeof post_c == "function") post_c(v); }; x = document.createElement("textbox"); x.addEventListener("apply",function(f){ return function(ev) { f(ev.target.value); } }(c), false);',
		}
	],


],

'right_pane2' :
[
	[
		"Circulate?",
		{ 	
			render: 'fm.circulate() == null ? "<Unset>" : ( get_bool( fm.circulate() ) ? "Yes" : "No" )',
			input: 'c = function(v){ g.apply("circulate",v); if (typeof post_c == "function") post_c(v); }; x = util.widgets.make_menulist( [ [ "Yes", get_db_true() ], [ "No", get_db_false() ] ] ); x.addEventListener("apply",function(f){ return function(ev) { f(ev.target.value); } }(c), false);',
		}
	],
	[
		"Holdable?",
		{ 
			render: 'fm.holdable() == null ? "<Unset>" : ( get_bool( fm.holdable() ) ? "Yes" : "No" )', 
			input: 'c = function(v){ g.apply("holdable",v); if (typeof post_c == "function") post_c(v); }; x = util.widgets.make_menulist( [ [ "Yes", get_db_true() ], [ "No", get_db_false() ] ] ); x.addEventListener("apply",function(f){ return function(ev) { f(ev.target.value); } }(c), false);',
		}
	],
	[
		"Age Protection",
		{
			render: 'fm.age_protect() == null ? "<Unset>" : ( typeof fm.age_protect() == "object" ? fm.age_protect().name() : g.data.hash.crahp[ fm.age_protect() ].name() )', 
			input: 'c = function(v){ g.apply("age_protect",v); if (typeof post_c == "function") post_c(v); }; x = util.widgets.make_menulist( [ [ "<Remove Protection>", "<HACK:KLUDGE:NULL>" ] ].concat( util.functional.map_list( g.data.list.crahp, function(obj) { return [ obj.name(), obj.id() ]; }).sort() ) ); x.addEventListener("apply",function(f){ return function(ev) { f(ev.target.value); } }(c), false);',
		}

	],
	[
		"Loan Duration",
		{ 
			render: 'switch(fm.loan_duration()){ case 1: case "1": "Short"; break; case 2: case "2": "Normal"; break; case 3:case "3": "Long"; break; }',
			input: 'c = function(v){ g.apply("loan_duration",v); if (typeof post_c == "function") post_c(v); }; x = util.widgets.make_menulist( [ [ "Short", "1" ], [ "Normal", "2" ], [ "Long", "3" ] ] ); x.addEventListener("apply",function(f){ return function(ev) { f(ev.target.value); } }(c), false);',

		}
	],
	[
		"Fine Level",
		{
			render: 'switch(fm.fine_level()){ case 1: case "1": "Low"; break; case 2: case "2": "Normal"; break; case 3: case "3": "High"; break; }',
			input: 'c = function(v){ g.apply("fine_level",v); if (typeof post_c == "function") post_c(v); }; x = util.widgets.make_menulist( [ [ "Low", "1" ], [ "Normal", "2" ], [ "High", "3" ] ] ); x.addEventListener("apply",function(f){ return function(ev) { f(ev.target.value); } }(c), false);',
		}
	],

	 [
		"Circulate as Type",	
		{ 	
			render: 'fm.circ_as_type() == null ? "<Unset>" : g.data.hash.citm[ fm.circ_as_type() ].value()',
			input: 'c = function(v){ g.apply("circ_as_type",v); if (typeof post_c == "function") post_c(v); }; x = util.widgets.make_menulist( util.functional.map_list( g.data.list.citm, function(n){return [ n.code() + " - " + n.value(), n.code()];} ).sort() ); x.addEventListener("apply",function(f){ return function(ev) { f(ev.target.value); } }(c), false);',
		} 
	],
	[
		"Circulation Modifier",
		{	
			render: 'fm.circ_modifier() == null ? "<Unset>" : fm.circ_modifier()',
			/*input: 'c = function(v){ g.apply("circ_modifier",v); if (typeof post_c == "function") post_c(v); }; x = document.createElement("textbox"); x.addEventListener("apply",function(f){ return function(ev) { f(ev.target.value); } }(c), false);',*/
			input: 'c = function(v){ g.apply("circ_modifier",v); if (typeof post_c == "function") post_c(v); }; x = util.widgets.make_menulist( util.functional.map_list( g.data.list.circ_modifier, function(obj) { return [ obj, obj ]; } ).sort() ); x.setAttribute("editable","true"); x.addEventListener("apply",function(f){ return function(ev) { f(ev.target.value); } }(c), false);',
		}
	],
],

'right_pane3' :
[	[
		"Alert Message",
		{
			render: 'fm.alert_message() == null ? "<Unset>" : fm.alert_message()',
			input: 'c = function(v){ g.apply("alert_message",v); if (typeof post_c == "function") post_c(v); }; x = document.createElement("textbox"); x.setAttribute("multiline",true); g.populate_alert_message_input(x); x.addEventListener("apply",function(f){ return function(ev) { f( ev.target.value ); } }(c), false);',
		}
	],

	[
		"Deposit?",
		{ 
			render: 'fm.deposit() == null ? "<Unset>" : ( get_bool( fm.deposit() ) ? "Yes" : "No" )',
			input: 'c = function(v){ g.apply("deposit",v); if (typeof post_c == "function") post_c(v); }; x = util.widgets.make_menulist( [ [ "Yes", get_db_true() ], [ "No", get_db_false() ] ] ); x.addEventListener("apply",function(f){ return function(ev) { f(ev.target.value); } }(c), false);',
		}
	],
	[
		"Deposit Amount",
		{ 
			render: 'if (fm.deposit_amount() == null) { "<Unset>"; } else { util.money.sanitize( fm.deposit_amount() ); }',
			input: 'c = function(v){ g.apply("deposit_amount",v); if (typeof post_c == "function") post_c(v); }; x = document.createElement("textbox"); x.addEventListener("apply",function(f){ return function(ev) { f(ev.target.value); } }(c), false);',
		}
	],
	[
		"Price",
		{ 
			render: 'if (fm.price() == null) { "<Unset>"; } else { util.money.sanitize( fm.price() ); }', 
			input: 'c = function(v){ g.apply("price",v); if (typeof post_c == "function") post_c(v); }; x = document.createElement("textbox"); x.addEventListener("apply",function(f){ return function(ev) { f(ev.target.value); } }(c), false);',
		}
	],

	[
		"OPAC Visible?",
		{ 
			render: 'fm.opac_visible() == null ? "<Unset>" : ( get_bool( fm.opac_visible() ) ? "Yes" : "No" )', 
			input: 'c = function(v){ g.apply("opac_visible",v); if (typeof post_c == "function") post_c(v); }; x = util.widgets.make_menulist( [ [ "Yes", get_db_true() ], [ "No", get_db_false() ] ] ); x.addEventListener("apply",function(f){ return function(ev) { f(ev.target.value); } }(c), false);',
		}
	],
	[
		"Reference?",
		{ 
			render: 'fm.ref() == null ? "<Unset>" : ( get_bool( fm.ref() ) ? "Yes" : "No" )', 
			input: 'c = function(v){ g.apply("ref",v); if (typeof post_c == "function") post_c(v); }; x = util.widgets.make_menulist( [ [ "Yes", get_db_true() ], [ "No", get_db_false() ] ] ); x.addEventListener("apply",function(f){ return function(ev) { f(ev.target.value); } }(c), false);',
		}
	],
],

'right_pane4' : 
[
]

};
}

/******************************************************************************************************/
/* This loops through all our fieldnames and all the copies, tallying up counts for the different values */

g.summarize = function( copies ) {
	/******************************************************************************************************/
	/* Setup */

	JSAN.use('util.date'); JSAN.use('util.money');
	g.summary = {};
	g.field_names = [];
	for (var i in g.panes_and_field_names) {
		g.field_names = g.field_names.concat( g.panes_and_field_names[i] );
	}
	g.field_names = g.field_names.concat( g.editable_stat_cat_names );
	g.field_names = g.field_names.concat( g.readonly_stat_cat_names );

	/******************************************************************************************************/
	/* Loop through the field names */

	for (var i = 0; i < g.field_names.length; i++) {

		var field_name = g.field_names[i][0];
		var render = g.field_names[i][1].render;
		g.summary[ field_name ] = {};

		/******************************************************************************************************/
		/* Loop through the copies */

		for (var j = 0; j < copies.length; j++) {

			var fm = copies[j];
			var cmd = render || ('fm.' + field_name + '();');
			var value = '???';

			/**********************************************************************************************/
			/* Try to retrieve the value for this field for this copy */

			try { 
				value = eval( cmd ); 
			} catch(E) { 
				g.error.sdump('D_ERROR','Attempted ' + cmd + '\n' +  E + '\n'); 
			}
			if (typeof value == 'object' && value != null) {
				alert('FIXME: field_name = <' + field_name + '>  value = <' + js2JSON(value) + '>\n');
			}

			/**********************************************************************************************/
			/* Tally the count */

			if (g.summary[ field_name ][ value ]) {
				g.summary[ field_name ][ value ]++;
			} else {
				g.summary[ field_name ][ value ] = 1;
			}
		}
	}
	g.error.sdump('D_TRACE','summary = ' + js2JSON(g.summary) + '\n');
}

/******************************************************************************************************/
/* Display the summarized data and inputs for editing */

g.render = function() {

	/******************************************************************************************************/
	/* Library setup and clear any existing interface */

	JSAN.use('util.widgets'); JSAN.use('util.date'); JSAN.use('util.money'); JSAN.use('util.functional');

	for (var i in g.panes_and_field_names) {
		var p = document.getElementById(i);
		if (p) util.widgets.remove_children(p);
	}

	/******************************************************************************************************/
	/* Prepare the panes */

	var groupbox; var caption; var vbox; var grid; var rows;
	
	/******************************************************************************************************/
	/* Loop through the field names */

	for (h in g.panes_and_field_names) {
		if (!document.getElementById(h)) continue;
		for (var i = 0; i < g.panes_and_field_names[h].length; i++) {
			try {
				var f = g.panes_and_field_names[h][i]; var fn = f[0];
				groupbox = document.createElement('groupbox'); document.getElementById(h).appendChild(groupbox);
				if (typeof g.changed[fn] != 'undefined') groupbox.setAttribute('class','copy_editor_field_changed');
				caption = document.createElement('caption'); groupbox.appendChild(caption);
				caption.setAttribute('label',fn); caption.setAttribute('id','caption_'+fn);
				vbox = document.createElement('vbox'); groupbox.appendChild(vbox);
				grid = util.widgets.make_grid( [ { 'flex' : 1 }, {}, {} ] ); vbox.appendChild(grid);
				grid.setAttribute('flex','1');
				rows = grid.lastChild;
				var row;
				
				/**************************************************************************************/
				/* Loop through each value for the field */

				for (var j in g.summary[fn]) {
					var value = j; var count = g.summary[fn][j];
					row = document.createElement('row'); rows.appendChild(row);
					var label1 = document.createElement('description'); row.appendChild(label1);
					if (g.special_exception[ fn ]) {
						g.special_exception[ fn ]( label1, value );
					} else {
						label1.appendChild( document.createTextNode(value) );
					}
					var label2 = document.createElement('description'); row.appendChild(label2);
					var unit = count == 1 ? 'copy' : 'copies';
					label2.appendChild( document.createTextNode(count + ' ' + unit) );
				}
				var hbox = document.createElement('hbox'); 
				hbox.setAttribute('id',fn);
				groupbox.appendChild(hbox);
				var hbox2 = document.createElement('hbox');
				groupbox.appendChild(hbox2);

				/**************************************************************************************/
				/* Render the input widget */

				if (f[1].input && g.edit) {
					g.render_input(hbox,f[1]);
				}

			} catch(E) {
				g.error.sdump('D_ERROR','copy editor: ' + E + '\n');
			}
		}
	}
}

/******************************************************************************************************/
/* This actually draws the change button and input widget for a given field */
g.render_input = function(node,blob) {
	try {
		// node = hbox ;    groupbox ->  hbox, hbox

		var groupbox = node.parentNode;
		var caption = groupbox.firstChild;
		var vbox = node.previousSibling;
		var hbox = node;
		var hbox2 = node.nextSibling;

		var input_cmd = blob.input;
		var render_cmd = blob.render;

		var block = false; var first = true;

		function on_mouseover(ev) {
			groupbox.setAttribute('style','background: white');
		}

		function on_mouseout(ev) {
			groupbox.setAttribute('style','');
		}

		vbox.addEventListener('mouseover',on_mouseover,false);
		vbox.addEventListener('mouseout',on_mouseout,false);
		groupbox.addEventListener('mouseover',on_mouseover,false);
		groupbox.addEventListener('mouseout',on_mouseout,false);
		groupbox.firstChild.addEventListener('mouseover',on_mouseover,false);
		groupbox.firstChild.addEventListener('mouseout',on_mouseout,false);

		function on_click(ev){
			try {
				if (block) return; block = true;

				function post_c(v) {
					try {
						/* FIXME - kludgy */
						var t = input_cmd.match('apply_stat_cat') ? 'stat_cat' : ( input_cmd.match('apply_owning_lib') ? 'owning_lib' : 'attribute' );
						var f;
						switch(t) {
							case 'attribute' :
								f = input_cmd.match(/apply\("(.+?)",/)[1];
							break;
							case 'stat_cat' :
								f = input_cmd.match(/apply_stat_cat\((.+?),/)[1];
							break;
							case 'owning_lib' :
								f = null;
							break;
						}
						g.changed[ hbox.id ] = { 'type' : t, 'field' : f, 'value' : v };
						block = false;
						setTimeout(
							function() {
								g.summarize( g.copies );
								g.render();
								document.getElementById(caption.id).focus();
							}, 0
						);
					} catch(E) {
						g.error.standard_unexpected_error_alert('post_c',E);
					}
				}
				var x; var c; eval( input_cmd );
				if (x) {
					util.widgets.remove_children(vbox);
					util.widgets.remove_children(hbox);
					util.widgets.remove_children(hbox2);
					hbox.appendChild(x);
					var apply = document.createElement('button');
					apply.setAttribute('label','Apply');
					apply.setAttribute('accesskey','A');
					hbox2.appendChild(apply);
					apply.addEventListener('command',function() { c(x.value); },false);
					var cancel = document.createElement('button');
					cancel.setAttribute('label','Cancel');
					cancel.addEventListener('command',function() { setTimeout( function() { g.summarize( g.copies ); g.render(); document.getElementById(caption.id).focus(); }, 0); }, false);
					hbox2.appendChild(cancel);
					setTimeout( function() { x.focus(); }, 0 );
				}
			} catch(E) {
				g.error.standard_unexpected_error_alert('render_input',E);
			}
		}
		vbox.addEventListener('click',on_click, false);
		hbox.addEventListener('click',on_click, false);
		caption.addEventListener('click',on_click, false);
		caption.addEventListener('keypress',function(ev) {
			if (ev.keyCode == 13 /* enter */ || ev.keyCode == 77 /* mac enter */) on_click();
		}, false);
		caption.setAttribute('style','-moz-user-focus: normal');
		caption.setAttribute('onfocus','this.setAttribute("class","outline_me")');
		caption.setAttribute('onblur','this.setAttribute("class","")');

	} catch(E) {
		g.error.sdump('D_ERROR',E + '\n');
	}
}

/******************************************************************************************************/
/* store the copies in the global xpcom stash */

g.stash_and_close = function() {
	try {
		if (g.handle_update) {
			try {
				var r = g.network.request(
					api.FM_ACP_FLESHED_BATCH_UPDATE.app,
					api.FM_ACP_FLESHED_BATCH_UPDATE.method,
					[ ses(), g.copies, true ]
				);
				if (typeof r.ilsevent != 'undefined') {
					g.error.standard_unexpected_error_alert('copy update',r);
				} else {
					alert('Items added/modified.');
				}
				/* FIXME -- revisit the return value here */
			} catch(E) {
				alert('copy update error: ' + js2JSON(E));
			}
		}
		//g.data.temp_copies = js2JSON( g.copies );
		//g.data.stash('temp_copies');
		xulG.copies = g.copies;
		update_modal_xulG(xulG);
		window.close();
	} catch(E) {
		g.error.standard_unexpected_error_alert('stash and close',E);
	}
}

/******************************************************************************************************/
/* spawn copy notes interface */

g.copy_notes = function() {
	JSAN.use('util.window'); var win = new util.window();
	win.open(
		urls.XUL_COPY_NOTES, 
		//+ '?copy_id=' + window.escape(g.copies[0].id()),
		'Copy Notes','chrome,resizable,modal',
		{ 'copy_id' : g.copies[0].id() }
	);
}

