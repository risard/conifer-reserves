
var currentHoldRecord;
var currentHoldRecordObj;
var holdsOrgSelectorBuilt = false;
var holdRecipient;
var holdRequestor
var holdEmail;
var holdPhone;


function holdsHandleStaff() {
	swapCanvas($('xulholds_box'));
	$('xul_recipient_barcode').focus();
	$('xul_recipient_barcode').onkeypress = function(evt) 
		{if(userPressedEnter(evt)) { _holdsHandleStaff(); } };
	$('xul_recipient_barcode_submit').onclick = _holdsHandleStaff;
}

function _holdsHandleStaff() {
	var barcode = $('xul_recipient_barcode').value;
	var user = grabUserByBarcode( G.user.session, barcode );
	var code = checkILSEvent(user);
	if(code || !user) {
		alertILSEvent(code, barcode);
		showCanvas();
		return;
	}
	holdRecipient = user;
	holdsDrawWindow( currentHoldRecord, null );
}

function holdsDrawWindow(recid, type) {

	if(recid == null) {
		recid = currentHoldRecord;
		if(recid == null) return;
	}	
	currentHoldRecord = recid;
	
	if(isXUL() && holdRecipient == null ) { 
		holdsHandleStaff();
		return;
	}

	if( holdRecipient == null ) holdRecipient = G.user;
	if( holdRequestor == null ) holdRequestor = G.user;

	if(!(holdRequestor && holdRequestor.session)) {

		detachAllEvt('common','locationChanged');
		attachEvt('common','loggedIn', holdsDrawWindow)
		initLogin();
		return;
	}


	swapCanvas($('check_holds_box'));
	setTimeout( function() { holdsCheckPossibility(recid, type); }, 10 );
}

function _holdsDrawWindow(recid, type) {

	swapCanvas($('holds_box'));

	var rec = findRecord( recid, type );
	currentHoldsRecordObj = rec;

	if(!holdsOrgSelectorBuilt) {
		holdsBuildOrgSelector(null,0);
		holdsOrgSelectorBuilt = true;
	}

	appendClear($('holds_recipient'), text(
		holdRecipient.family_name() + ', ' +  
			holdRecipient.first_given_name()));
	appendClear($('holds_title'), text(rec.title()));
	appendClear($('holds_author'), text(rec.author()));

	removeChildren($('holds_format'));
	for( var i in rec.types_of_resource() ) {
		var res = rec.types_of_resource()[i];
		var img = elem("img");
		setResourcePic(img, res);
		$('holds_format').appendChild(text(' '+res+' '));
		$('holds_format').appendChild(img);
		$('holds_format').appendChild(text(' '));
	}

	appendClear( $('holds_phone'), text(holdRecipient.day_phone()));
	appendClear( $('holds_email'), text(holdRecipient.email()));
	$('holds_cancel').onclick = showCanvas;
	$('holds_submit').onclick = holdsPlaceHold; 
}


function holdsCheckPossibility(recid, type) {
	var req = new Request(CHECK_HOLD_POSSIBLE, G.user.session, 
			{ titleid : recid, patronid : G.user.id(), depth : 0 } );
	req.send(true);
	var res = req.result();

	if(res) _holdsDrawWindow(recid, type);
	else drawCanvas();
}


function holdsBuildOrgSelector(node) {

	if(!node) node = globalOrgTree;

	var selector = $('holds_org_selector');
	var index = selector.options.length;

	var indent = findOrgType(node.ou_type()).depth() - 1;
	setSelectorVal( selector, index, node.name(), node.id(), null, indent );
	
	if( node.id() == holdRecipient.home_ou() ) {
		selector.selectedIndex = index;
		selector.options[index].selected = true;	
	}

	for( var i in node.children() ) {
		var child = node.children()[i];
		if(child) holdsBuildOrgSelector(child);
	}
}

function holdsPlaceHold() {

	var org = $('holds_org_selector').options[
		$('holds_org_selector').selectedIndex].value;

	var hold = new ahr();
	hold.pickup_lib(org); 
	hold.request_lib(org); 
	hold.requestor(holdRequestor.id());
	hold.usr(holdRecipient.id());
	hold.hold_type('T');
	hold.email_notify(holdRecipient.email());
	hold.phone_notify(holdRecipient.day_phone());
	hold.target(currentHoldRecord);
	
	var req = new Request( CREATE_HOLD, holdRequestor.session, hold );
	req.send(true);
	var res = req.result();

	if( res == '1' ) alert($('holds_success').innerHTML);
	else alert($('holds_failure').innerHTML);
	
	showCanvas();
	holdRecipient = null;
	holdRequestor = null;
}

function holdsCancel(holdid, user) {
	if(!user) user = G.user;
	var req = new Request(CANCEL_HOLD, user.session, holdid);
	req.send(true);
	return req.result();
}


