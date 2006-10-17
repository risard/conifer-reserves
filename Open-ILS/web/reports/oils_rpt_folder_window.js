



/* generic folder window class */
oilsRptSetSubClass('oilsRptFolderWindow', 'oilsRptObject');
function oilsRptFolderWindow(type, folderId) { 
	this.init();
	var node = oilsRptCurrentFolderManager.findNode(type, folderId);
	this.selector = DOM.oils_rpt_folder_contents_selector;
	this.folderNode = node;
	this.type = type;
}


oilsRptFolderWindow.prototype.draw = function() {

	_debug('drawing folder window for ' + this.folderNode.folder.name() );

	var obj = this;
	setSelector(DOM.oils_rpt_output_limit_selector, oilsRptOutputLimit);

	DOM.oils_rpt_output_limit_selector.onchange = function() {
		oilsRptOutputLimit = getSelectorVal(DOM.oils_rpt_output_limit_selector);
		obj.draw();
	}


	if( this.folderNode.folder.owner().id() == USER.id() && this.type == 'template') 
		unHideMe(DOM.oils_rpt_folder_window_contents_new_template.parentNode);
	else hideMe(DOM.oils_rpt_folder_window_contents_new_template.parentNode);

	unHideMe(DOM.oils_rpt_folder_window_contents_div);
	hideMe(DOM.oils_rpt_folder_manager_div);
	hideMe(DOM.oils_rpt_top_folder);

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

	DOM.oils_rpt_folder_content_action_go.onclick = 
		function() {obj.doFolderAction()}

	this.fetchFolderData();

	var sel = DOM.oils_rpt_folder_contents_action_selector;
	var x = true;
	for( var i = 0; i < sel.options.length; i++ ) {
		var opt = sel.options[i];
		if( opt.getAttribute('type') == this.type ) {
			if(x && !opt.disabled) {
				opt.selected = true;
				x = false;
			}
			unHideMe(opt);
		} else hideMe(opt);
	}

	this.drawEditActions();

	var porg = PERMS.SHARE_REPORT_FOLDER;
	if( porg < 1 ) 
		DOM.oils_rpt_folder_manager_share_opt.disabled = true;
}

oilsRptFolderWindow.prototype.drawEditActions = function() {

	DOM.oils_rpt_folder_window_contents_new_template.onclick = function() {
		var s = location.search+'';
		s = s.replace(/\&folder=\d+/,'');
		goTo( 'oils_rpt_builder.xhtml'+s+'&folder='+obj.folderNode.folder.id());
	}


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
				var porg = PERMS.SHARE_REPORT_FOLDER;
				if( porg < 1 ) 
					DOM.oils_rpt_folder_manager_sub_shared.disabled = true;
				removeChildren(DOM.oils_rpt_folder_manager_sub_lib_picker);
				unHideMe(DOM.oils_rpt_folder_manager_create_sub);
				obj.myOrgSelector = new oilsRptMyOrgsWidget(
					DOM.oils_rpt_folder_manager_sub_lib_picker, USER.ws_ou(), porg)
				obj.myOrgSelector.draw();
				break;
			case 'delete':
				obj.doFolderDelete();
				break;
			case 'share':
				obj.shareFolder();
				break;
			case 'unshare':
				obj.unShareFolder();
				break;
		}
	}

}


oilsRptFolderWindow.prototype.shareFolder = function() {
	var folder = this.folderNode.folder;
	if(isTrue(folder.shared()))
		return alertId('oils_rpt_folder_already_shared');
	unHideMe(DOM.oils_rpt_folder_manager_share_div);


	var orgsel = new oilsRptMyOrgsWidget(
		DOM.oils_rpt_folder_manager_share_lib_picker, 
		USER.ws_ou(), PERMS.SHARE_REPORT_FOLDER);
	orgsel.draw();

	var type = this.type;
	DOM.oils_rpt_folder_manager_share_submit.onclick = function() {
		folder.shared('t');
		folder.share_with(orgsel.getValue());
		oilsRptUpdateFolder( folder, type, 
			function(success) {
				if(success) {
					oilsRptAlertSuccess();
					oilsRptCurrentFolderManager.draw();
				}
			}
		);
	}
}

oilsRptFolderWindow.prototype.unShareFolder = function() {
	var folder = this.folderNode.folder;
	if(!isTrue(folder.shared()))
		return alertId('oils_rpt_folder_already_unshared');
	if(!confirmId('oils_rpt_folder_unshare_confirm')) return;
	folder.shared('f');
	var type = this.type;
	oilsRptUpdateFolder( folder, type, 
		function(success) {
			if(success) {
				oilsRptAlertSuccess();
				oilsRptCurrentFolderManager.draw();
			}
		}
	);
}


oilsRptFolderWindow.prototype.hideFolderActions = function() {
	hideMe(DOM.oils_rpt_folder_manager_change_name_div);
	hideMe(DOM.oils_rpt_folder_manager_create_sub);
	hideMe(DOM.oils_rpt_folder_manager_share_div);
}


oilsRptFolderWindow.prototype.doFolderAction = function() {
	var objs = this.fmTable.getSelected();
	if( objs.length == 0 ) 
		return alert('Please select an item from the list');
	var action = getSelectorVal(DOM.oils_rpt_folder_contents_action_selector);

	var obj = this;
	var successCallback = function(errid) {
		if(errid) alertId(errid)
		else oilsRptAlertSuccess();
		obj.draw();
	};

	var obj = this;
	switch(action) {
		case 'create_report' :
			hideMe(DOM.oils_rpt_folder_table_right_td);
			unHideMe(DOM.oils_rpt_folder_table_alt_td);
			unHideMe(DOM.oils_rpt_editor_div);
			new oilsRptReportEditor(new oilsReport(objs[0]), this);
			break;
		case 'delete_report' :
			if(!confirmId('oils_rpt_folder_contents_confirm_delete')) return;
			this.deleteReports(objs, 0, successCallback);
			break;

		case 'delete_template' :
			if(!confirmId('oils_rpt_folder_contents_confirm_delete')) return;
			this.deleteTemplates(objs, 0, successCallback);
			break;

		case 'show_output':
			this.showOutput(objs[0]);
			break;

		case 'delete_output':
			if(!confirmId('oils_rpt_folder_contents_confirm_delete')) return;
			this.deleteOutputs(objs,0, successCallback);
			break;

	}
}


oilsRptFolderWindow.prototype.deleteOutputs = function(list, idx, callback, errid) {
	if( idx >= list.length ) return callback(errid);
	var output = list[idx];

	if( output.runner().id()  != USER.id() ) {
		this.deleteOutputs(list, ++idx, 
			callback, 'oils_rpt_folder_contents_no_delete');

	} else {
		_debug('deleting output ' + output.id());
		var req = new Request(OILS_RPT_DELETE_SCHEDULE,SESSION,output.id());
		var obj = this;
		req.callback(function(){obj.deleteOutputs(list, ++idx, callback, errid);});
		req.send();
	}
}

oilsRptFolderWindow.prototype.showOutput = function(sched) {
	oilsRptFetchReport(sched.report(), 
		function(r) {
			var url = oilsRptBuildOutputLink(r.template(), r.id(), sched.id());
			goTo(url);
		}
	);
}


oilsRptFolderWindow.prototype.deleteReports = function(list, idx, callback, errid) {
	if( idx >= list.length ) return callback(errid);
	var report = list[idx];

	if( report.owner().id() != USER.id() ) {
		this.deleteReports(list, ++idx, 
			callback, 'oils_rpt_folder_contents_no_delete');

	} else {

		var obj = this;
		var req0 = new Request(OILS_RPT_REPORT_HAS_OUTS, SESSION, report.id());
		req0.callback(
			function(r0) {
				var r0es = r0.getResultObject();
				if( r0es != '0' ) {
					obj.deleteReports(list, ++idx, 
						callback, 'oils_rpt_folder_contents_report_no_delete');
				} else {
					_debug('deleting report ' + report.id());
					var req = new Request(OILS_RPT_DELETE_REPORT, SESSION, report.id());
					req.callback(function(r) { 
						var res = r.getResultObject();
						if( res != 1 ) return oilsRptAlertFailure();
						obj.deleteReports(list, ++idx, callback, errid)
					});
					req.send();
				}
			}
		);

		req0.send();
	}
}

oilsRptFolderWindow.prototype.deleteTemplates = function(list, idx, callback, errid) {
	if( idx >= list.length ) return callback(errid);
	var tmpl = list[idx];

	var obj = this;
	if( tmpl.owner().id() != USER.id() ) {
		this.deleteTemplates(list, ++idx, 
			callback, 'oils_rpt_folder_contents_no_delete');

	} else {

		var req0 = new Request(	OILS_RPT_TEMPLATE_HAS_RPTS, SESSION, tmpl.id() );
		req0.callback(
			function(r0) {
				var resp = r0.getResultObject();

				if( resp != '0' ) {
					obj.deleteTemplates(list, ++idx, 
						callback, 'oils_rpt_folder_contents_template_no_delete');

				} else {
					_debug('deleting template ' + tmpl.id());
					var req = new Request(OILS_RPT_DELETE_TEMPLATE, SESSION, tmpl.id());
					req.callback(function(r) {
						var res = r.getResultObject();
						if( res != 1 ) return oilsRptAlertFailure();
						obj.deleteTemplates(list, ++idx, callback, errid)
					});
					req.send();
				}
			}
		);
		req0.send();
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
		SESSION, this.type, this.folderNode.folder.id(), oilsRptOutputLimit);

	if(this.type == 'output') {
		req = new Request(OILS_RPT_FETCH_OUTPUT, 
			SESSION, this.folderNode.folder.id(), oilsRptOutputLimit);
	}

	var obj = this;
	removeChildren(obj.selector);
	req.callback(
		function(r) {
			var res = r.getResultObject();
			if( obj.type == 'output' ) {
				obj.fleshSchedules(res, 0);
			} else {
				obj.fmTable = drawFMObjectTable( 
					{ 
						dest : obj.selector, 
						obj : res,
						selectCol : true,
						selectColName : 'Select',
						selectAllName : 'All',
						selectNoneName : 'None'
					}
				);
			}
		}
	);
	req.send();
}


oilsRptFolderWindow.prototype.fleshSchedules = function(list, idx, table) {

	if( idx >= list.length ) return;

	var sched = list[idx];
	var obj = this;

	oilsRptFetchUser(sched.runner(),

		function(user) {
			sched.runner(user);
			oilsRptFetchTemplate(sched.report().template(),

				function(template) {
					sched.report().template(template);
					if( idx == 0 ) {
						obj.fmTable = drawFMObjectTable( 
							{ 
								dest : obj.selector, 
								obj : [sched],
								selectCol : true,
								selectColName : 'Select',
								selectAllName : 'All',
								selectNoneName : 'None'
							}
						);
					} else {
						obj.fmTable.add(sched);
					}
					obj.fleshSchedules(list, ++idx);
				}
			);
		}
	);
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
						if(success) {
							oilsRptAlertSuccess();
							oilsRptCurrentFolderManager.draw();
						}
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

		oilsRptCreateFolder(folder, obj.type,
			function(success) {
				if(success) {
					oilsRptAlertSuccess();
					oilsRptCurrentFolderManager.draw();
				}
			}
		);
	}
}


oilsRptFolderWindow.prototype.doFolderDelete = function() {
	
	var cache = oilsRptFolderNodeCache[this.type];
	/* let's see if this folder has any children */
	for( var c in cache ) 
		if( cache[c].folder.parent() == this.folderNode.folder.id() )
			return alertId('oils_rpt_folder_cannot_delete');

	/* lets see if the folder has contents */
	var req = new Request(OILS_RPT_FETCH_FOLDER_DATA, 
		SESSION, this.type, this.folderNode.folder.id(), 1);

	if(this.type == 'output') {
		req = new Request(OILS_RPT_FETCH_OUTPUT, 
			SESSION, this.folderNode.folder.id(), 1);
	}

	var obj = this;
	req.send();

	req.callback( 
		function(r) {

			var contents = r.getResultObject();
			if( contents.length > 0 ) 
				return alertId('oils_rpt_folder_cannot_delete');

			if( confirmId('oils_rpt_folder_manager_delete_confirm') ) {
				var req2 = new Request(OILS_RPT_DELETE_FOLDER, 
					SESSION, obj.type, obj.folderNode.folder.id());
	
				req2.callback( 
					function(r2) {
						var res = r2.getResultObject();
						if( res == 1 ) {
							oilsRptAlertSuccess();
							oilsRptCurrentFolderManager.draw();
						}
						else alert('error: '+js2JSON(res));
					}
				);

				req2.send();
			}
		}
	);
}


