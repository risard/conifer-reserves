
function oilsRptFetchTemplate(id) {
	var t = oilsRptGetCache('rt', id);
	if(!t) {
		var r = new Request(OILS_RPT_FETCH_TEMPLATE, SESSION, id);
		r.send(true);
		t = r.result();
		oilsRptCacheObject('rt', t, id);
	}
	return t;
}


/* generic folder window class */
oilsRptSetSubClass('oilsRptFolderWindow', 'oilsRptObject');
function oilsRptFolderWindow(type, folderId) { 
	var node = oilsRptCurrentFolderManager.findNode(type, folderId);
	this.init2(node, type);
	this.selector = DOM.oils_rpt_folder_contents_selector;
}


oilsRptFolderWindow.prototype.init2 = function(node, type) {
	this.folderNode = node;
	this.type = type;
	this.init();
}


oilsRptFolderWindow.prototype.draw = function() {
	unHideMe(DOM.oils_rpt_folder_window_contents_div);
	hideMe(DOM.oils_rpt_folder_manager_div);

	DOM.oils_rpt_folder_window_manage_tab.onclick = function() {
		unHideMe(DOM.oils_rpt_folder_window_contents_div);
		hideMe(DOM.oils_rpt_folder_manager_div);
	}
	DOM.oils_rpt_folder_window_edit_tab.onclick = function() {
		hideMe(DOM.oils_rpt_folder_window_contents_div);
		unHideMe(DOM.oils_rpt_folder_manager_div);
	}

	this.setFolderEditActions();

	hideMe(DOM.oils_rpt_template_folder_new_report);
	unHideMe(DOM.oils_rpt_folder_table_right_td);
	hideMe(DOM.oils_rpt_folder_table_alt_td);
	this.drawFolderDetails();

	var obj = this;
	DOM.oils_rpt_folder_content_action_go.onclick = 
		function() {obj.doFolderAction()}

	this.fetchFolderData();

	var sel = DOM.oils_rpt_folder_contents_action_selector;
	for( var i = 0; i < sel.options.length; i++ ) {
		var opt = sel.options[i];
		if( opt.getAttribute('type') == this.type )
			unHideMe(opt);
		else hideMe(opt);
	}

	this.drawEditActions();

}

oilsRptFolderWindow.prototype.drawEditActions = function() {
	if( this.folderNode.folder.owner().id() != USER.id() )
		hideMe(DOM.oils_rpt_folder_manager_tab_table);
	else
		unHideMe(DOM.oils_rpt_folder_manager_tab_table);

	if( isTrue(this.folderNode.folder.shared())) {
		DOM.oils_rpt_folder_manager_share_opt.disabled = true;
		DOM.oils_rpt_folder_manager_unshare_opt.disabled = false;
	} else {
		DOM.oils_rpt_folder_manager_share_opt.disabled = false;
		DOM.oils_rpt_folder_manager_unshare_opt.disabled = true;
	}

	this.hideFolderActions();
	var obj = this;

	DOM.oils_rpt_folder_manager_actions_submit.onclick = function() {
		var act = getSelectorVal(DOM.oils_rpt_folder_manager_actions);
		_debug("doing folder action: " + act);
		obj.hideFolderActions();
		switch(act) {
			case 'change_name':
				unHideMe(DOM.oils_rpt_folder_manager_change_name_div);
				break;
			case 'create_sub_folder':
				unHideMe(DOM.oils_rpt_folder_manager_create_sub);
				obj.myOrgSelector = new oilsRptMyOrgsWidget(
					DOM.oils_rpt_folder_manager_sub_lib_picker, USER.ws_ou());
				obj.myOrgSelector.draw();
				break;
		}
	}

}


oilsRptFolderWindow.prototype.hideFolderActions = function() {
	hideMe(DOM.oils_rpt_folder_manager_change_name_div);
	hideMe(DOM.oils_rpt_folder_manager_create_sub);
}


oilsRptFolderWindow.prototype.doFolderAction = function() {
	var objs = this.fmTable.getSelected();
	if( objs.length == 0 ) 
		return alert('Please select an item from the list');
	var action = getSelectorVal(DOM.oils_rpt_folder_contents_action_selector);

	switch(action) {
		case 'create_report' :
			hideMe(DOM.oils_rpt_folder_table_right_td);
			unHideMe(DOM.oils_rpt_folder_table_alt_td);
			new oilsRptReportEditor(new oilsReport(objs[0]), this);
			break;
	}
}


oilsRptFolderWindow.prototype.drawFolderDetails = function() {
	appendClear(DOM.oils_rpt_folder_creator_label, 
		text(this.folderNode.folder.owner().usrname()));
	appendClear(DOM.oils_rpt_folder_name_label, 
		text(this.folderNode.folder.name()));
}


oilsRptFolderWindow.prototype.fetchFolderData = function(callback) {
	removeChildren(this.selector);
	var req = new Request(OILS_RPT_FETCH_FOLDER_DATA, 
		SESSION, this.type, this.folderNode.folder.id());
	var obj = this;
	req.callback(
		function(r) {
			obj.fmTable = drawFMObjectTable( 
				{ 
					dest : obj.selector, 
					obj : r.getResultObject(),
					selectCol : true,
					selectColName : 'Select Row'	
				}
			);
			//sortables_init();
			if(callback) callback();
		}
	);
	req.send();
}


oilsRptFolderWindow.prototype.setSelected = function(folderNode) {
	this.selectedFolder = folderNode;
}

oilsRptFolderWindow.prototype.setFolderEditActions = function() {
	var folder = this.folderNode.folder;

	var obj = this;
	DOM.oils_rpt_folder_manager_name_input.value = folder.name();
	DOM.oils_rpt_folder_manager_change_name_submit.onclick = function() {
		var name = DOM.oils_rpt_folder_manager_name_input.value;
		if(name) {
			folder.name( name );
			if(confirmId('oils_rpt_folder_manager_change_name_confirm')) {
				oilsRptUpdateFolder(folder, obj.type,
					function(success) {
						if(success) oilsRptAlertSuccess();
					}
				);
			}
		}
	}

	DOM.oils_rpt_folder_manager_sub_lib_create.onclick = function() {
		var folder;

		if( obj.type == 'report' ) folder = new rrf();
		if( obj.type == 'template' ) folder = new rtf();
		if( obj.type == 'output' ) folder = new rof();

		folder.owner(USER.id());
		folder.parent(obj.folderNode.folder.id());
		folder.name(DOM.oils_rpt_folder_manager_sub_name.value);
		var shared = getSelectorVal(DOM.oils_rpt_folder_manager_sub_shared);
		folder.shared( (shared == 'yes') ? 't' : 'f');
		if( folder.shared() == 't' )
			folder.share_with( obj.myOrgSelector.getValue() );

		_debug("Creating new folder: " + js2JSON(folder));

		if(confirm(DOM.oils_rpt_folder_manager_new_confirm.innerHTML + ' "'+folder.name()+'"')) {
			oilsRptCreateFolder(folder, obj.type,
				function(success) {
					if(success) oilsRptAlertSuccess();
				}
			);
		}
	}

}




