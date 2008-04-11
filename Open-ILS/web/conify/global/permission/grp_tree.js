/*
# ---------------------------------------------------------------------------
# Copyright (C) 2008  Georgia Public Library Service / Equinox Software, Inc
# Mike Rylander <miker@esilibrary.com>
# 
# This program is free software; you can redistribute it and/or
# modify it under the terms of the GNU General Public License
# as published by the Free Software Foundation; either version 2
# of the License, or (at your option) any later version.
# 
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
# ---------------------------------------------------------------------------
*/

dojo.require('fieldmapper.dojoData');
dojo.require('dojo.parser');
dojo.require('dojo.data.ItemFileWriteStore');
dojo.require('dojo.date.stamp');
dojo.require('dijit.form.NumberSpinner');
dojo.require('dijit.form.TextBox');
dojo.require('dijit.form.TimeTextBox');
dojo.require('dijit.form.ValidationTextBox');
dojo.require('dijit.form.CheckBox');
dojo.require('dijit.form.FilteringSelect');
dojo.require('dijit.form.Textarea');
dojo.require('dijit.form.Button');
dojo.require('dijit.Dialog');
dojo.require('dijit.Tree');
dojo.require('dijit.layout.ContentPane');
dojo.require('dijit.layout.TabContainer');
dojo.require('dijit.layout.LayoutContainer');
dojo.require('dijit.layout.SplitContainer');
dojo.require('dojox.widget.Toaster');
dojo.require('dojox.fx');
dojo.require('dojox.grid.Grid');
dojo.require('dojox.grid._data.model');
dojo.require("dojox.grid.editors");

// some handy globals
var cgi = new CGI();
var cookieManager = new HTTP.Cookies();
var ses = cookieManager.read('ses') || cgi.param('ses');
var server = {};
server.pCRUD = new OpenSRF.ClientSession('open-ils.permacrud');
server.actor = new OpenSRF.ClientSession('open-ils.actor');

var current_group;
var virgin_out_id = -1;

var highlighter = {};

function status_update (markup) {
	if (parent !== window && parent.status_update) parent.status_update( markup );
}

function save_group () {

	var modified_pgt = new pgt().fromStoreItem( current_group );
	modified_pgt.ischanged( 1 );

	new_kid_button.disabled = false;
	save_out_button.disabled = false;
	delete_out_button.disabled = false;

	server.pCRUD.request({
		method : 'open-ils.permacrud.update.pgt',
		timeout : 10,
		params : [ ses, modified_pgt ],
		onerror : function (r) {
			highlighter.editor_pane.red.play();
			status_update( 'Problem saving data for ' + group_store.getValue( current_group, 'name' ) );
		},
		oncomplete : function (r) {
			var res = r.recv();
			if ( res && res.content() ) {
				group_store.setValue( current_group, 'ischanged', 0 );
				highlighter.editor_pane.green.play();
				status_update( 'Saved changes to ' + group_store.getValue( current_group, 'name' ) );
			} else {
				highlighter.editor_pane.red.play();
				status_update( 'Problem saving data for ' + group_store.getValue( current_group, 'name' ) );
			}
		},
	}).send();
}

function save_perm_map (storeItem) {

	var modified_pgpm = new pgpm().fromStoreItem( storeItem );
	modified_pgpm.ischanged( 1 );

	server.pCRUD.request({
		method : 'open-ils.permacrud.update.pgpm',
		timeout : 10,
		params : [ ses, modified_pgpm ],
		onerror : function (r) {
			highlighter.editor_pane.red.play();
			status_update( 'Problem saving permission data for ' + group_store.getValue( current_group, 'name' ) );
		},
		oncomplete : function (r) {
			var res = r.recv();
			if ( res && res.content() ) {
				perm_map_store.setValue( storeItem, 'ischanged', 0 );
				highlighter.editor_pane.green.play();
				status_update( 'Saved permission changes to ' + group_store.getValue( current_group, 'name' ) );
			} else {
				highlighter.editor_pane.red.play();
				status_update( 'Problem saving permission data for ' + group_store.getValue( current_group, 'name' ) );
			}
		},
	}).send();
}

function save_them_all (event) {

	var dirtyMaps = [];

    perm_map_store.fetch({
        query : { ischanged : 1 },
        onItem : function (item, req) { try { if (this.isItem( item )) dirtyMaps.push( item ); } catch (e) { /* meh */ } },
        scope : perm_map_store
    });

    var confirmation = true;


    if (event && dirtyMaps.length > 0) {
        confirmation = confirm(
            'There are unsaved modified Permission Maps!  '+
            'OK to save these changes, Cancel to abandon them.'
        );
    }

    if (confirmation) {
        for (var i in dirtyMaps) {
            save_perm_map(dirtyMaps[i]);
        }
    }
}

dojo.addOnUnload( save_them_all );

