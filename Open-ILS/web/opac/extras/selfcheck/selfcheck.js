/* -----------------------------------------------------------------
* Copyright (C) 2008  Equinox Software, Inc.
* Bill Erickson <erickson@esilibrary.com>
* 
* This program is free software; you can redistribute it and/or
* modify it under the terms of the GNU General Public License
* as published by the Free Software Foundation; either version 2
* of the License, or (at your option) any later version.
* 
* This program is distributed in the hope that it will be useful,
* but WITHOUT ANY WARRANTY; without even the implied warranty of
* MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
* GNU General Public License for more details.
* 
* You should have received a copy of the GNU General Public License
* along with this program; if not, write to the Free Software
* Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  
* 02110-1301, USA
----------------------------------------------------------------- */

var STAFF_SES_PARAM = 'ses';
var PATRON_BARCODE_COOKIE = 'pbcc';
var patron = null
var itemBarcode = null;
var itemsOutTemplate = null;
var isRenewal = false;
var pendingXact = false;
var patronTimeout = 600000; /* 10 minutes */
var timerId = null;
var printWrapper;
var printTemplate;
var successfulItems = {};
var scanTimeout = 800;
var scanTimeoutId;
var patronBarcodeRegex;
var orgUnit;
var orgUnitAddress;
var orgUnitHours;


function selfckInit() {
    var cgi = new CGI();
    var staff = grabUser(cookieManager.read(STAFF_SES_PARAM) || cgi.param(STAFF_SES_PARAM));

    selfckSetupPrinter();

    orgUnit = findOrgUnitSN(cgi.param('l')) || globalOrgTree;
    selfckFetchOrgDetails();

    var t = fetchOrgSettingDefault(orgUnit.id(), 'circ.selfcheck.patron_login_timeout');
    patronTimeout = (t) ? parseInt(t) * 1000 : patronTimeout;

    var reg = fetchOrgSettingDefault(orgUnit.id(), 'opac.barcode_regex');
    if(reg) patronBarcodeRegex = new RegExp(reg);

    if(!staff) {
        // should not happen when behind the proxy
        return alert('Staff must login');
    }

    unHideMe($('selfck-patron-login-container'));
    $('selfck-patron-login-input').focus();

    $('selfck-patron-login-input').onkeypress = function(evt) {
        if(userPressedEnter(evt)) 
            selfckPatronLogin();
    };

    $('selfck-item-barcode-input').onkeypress = selfckItemBarcodeKeypress;

    // for debugging, allow passing the user barcode via param
    var urlbc = new CGI().param('patron');
    if(urlbc)
        selfckPatronLogin(urlbc);

    selfckStartTimer();

    printWrapper = $('selfck-print-items-list');
    printTemplate = printWrapper.removeChild($n(printWrapper, 'selfck-print-items-template'));
    itemsOutTemplate = $('selfck-items-out-tbody').removeChild($('selfck-items-out-row'));

    selfckTryPatronCookie();

//    selfckMkDummyCirc(); // testing only
    
}

function selfckFetchOrgDetails() {
    var hreq = new Request('open-ils.actor:open-ils.actor.org_unit.hours_of_operation.retrieve', G.user.session, orgUnit.id());
    hreq.callback(function(r) { orgUnitHours = r.getResultObject(); });
    hreq.send();

    var areq = new Request('open-ils.actor:open-ils.actor.org_unit.address.retrieve', orgUnit.mailing_address());
    areq.callback(function(r) { orgUnitAddress = r.getResultObject(); });
    areq.send();
}

function selfckSetupPrinter() {
    try { // Mozilla only
		netscape.security.PrivilegeManager.enablePrivilege("UniversalBrowserRead");
        netscape.security.PrivilegeManager.enablePrivilege('UniversalXPConnect');
        netscape.security.PrivilegeManager.enablePrivilege('UniversalPreferencesRead');
        netscape.security.PrivilegeManager.enablePrivilege('UniversalPreferencesWrite');
        var pref = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch);
        if (pref)
            pref.setBoolPref('print.always_print_silent', true);
    } catch(E) {
        
    }
}

function selfckTryPatronCookie() {
    var pb = cookieManager.read(PATRON_BARCODE_COOKIE);
    if(pb) {
        cookieManager.write(PATRON_BARCODE_COOKIE, '');
        $('selfck-patron-login-input').value = pb;
        selfckPatronLogin();
    }
}


function selfckItemBarcodeKeypress(evt) {
    if(userPressedEnter(evt)) {
        clearTimeout(scanTimeoutId);
        selfckCheckout();
    } else {
        /*  If scanTimeout milliseconds have passed and there is
            still data in the input box, it's a likely indication
            of a partial scan. Select the text so the next scan
            will replace the value */
        clearTimeout(scanTimeoutId);
        scanTimeoutId = setTimeout(
            function() {
                if($('selfck-item-barcode-input').value) {
                    $('selfck-item-barcode-input').select();
                }
            },
            scanTimeout
        );
    }
}

/*
 * Start the logout timer
 */
function selfckStartTimer() {
    timerId = setTimeout(
        function() {
            selfckLogoutPatron();
        },
        patronTimeout
    );

}

/*
 * Reset the logout timer
 */
function selfckResetTimer() {
    clearTimeout(timerId);
    selfckStartTimer();
}

/*
 * Clears fields and "logs out" the patron by reloading the page
 */
function selfckLogoutPatron() {
    $('selfck-item-barcode-input').value = ''; // prevent browser caching
    $('selfck-patron-login-input').value = '';
    if(patron) {
        selfckPrint();
        setTimeout(
            function() { location.href = location.href; },
            800
        );
    }
}

/*
 * Fetches the user by barcode and displays the item barcode input
 */

function selfckPatronLogin(barcode) {
    barcode = barcode || $('selfck-patron-login-input').value;
    if(!barcode) return;

    var bcReq = new Request(
        'open-ils.actor:open-ils.actor.user.fleshed.retrieve_by_barcode',
        G.user.session, barcode);

	bcReq.request.alertEvent = false;

    bcReq.callback(function(r) {
        patron = r.getResultObject();
        if(checkILSEvent(patron)) {
            if(patron.textcode == 'ACTOR_USER_NOT_FOUND') {
                unHideMe($('selfck-patron-not-found'));
                $('selfck-patron-login-input').select();
                return;
            }

            if(patron.textcode == 'NO_SESSION') 
                return selfckLogoutStaff();

            return alert(patron.textcode);
        }
        $('selfck-patron-login-input').value = ''; // reset the input
        hideMe($('selfck-patron-login-container'));
        unHideMe($('selfck-patron-checkout-container'));
        $('selfck-patron-name-span').appendChild(text(patron.usrname()));
        $('selfck-item-barcode-input').focus();
    });

    bcReq.send();
}

function selfckLogoutStaff() {
    cookieManager.remove(STAFF_SES_PARAM);
    location.reload(true);
}

/**
  * If a user barcode was scanned into the item barcode
  * input, log out the current user and log in the new user
  */
function selfckCheckPatronBarcode(itemBc) {
    if(patronBarcodeRegex) {
        if(itemBc.match(patronBarcodeRegex)) {
            cookieManager.write(PATRON_BARCODE_COOKIE, itemBc, -1);
            selfckLogoutPatron();
            return true;
        }
    }
    return false;
}

/**
  * Sends the checkout request
  */
function selfckCheckout() {
    if(pendingXact) return;
    selfckResetTimer();
    pendingXact = true;
    isRenewal = false;

    removeChildren($('selfck-event-time'));
    removeChildren($('selfck-event-span'));

    itemBarcode = $('selfck-item-barcode-input').value;
    if(!itemBarcode) return;

    if(selfckCheckPatronBarcode(itemBarcode))
        return;

    if (itemBarcode in successfulItems) {
        selfckShowMsgNode({textcode:'dupe-barcode'});
        $('selfck-item-barcode-input').select();
        pendingXact = false;
        return;
    }

    var coReq = new Request(
        'open-ils.circ:open-ils.circ.checkout.full',
        G.user.session, {patron_id:patron.id(), copy_barcode:itemBarcode});

	coReq.request.alertEvent = false;
    coReq.callback(selfckHandleCoResult);
    coReq.send();
}

/**
  * Handles the resulting event.  If the item is already checked out,
  * attempts renewal.  Any other events will display a message
  */
function selfckHandleCoResult(r) {
    var evt;

    try {
        evt = r.getResultObject();
    } catch(E) {
        pendingXact = false;
        selfckShowMsgNode({textcode:'UNKNOWN'});
        appendClear($('selfck-errors'), text(E.toString()));
        return;
    }

    if(evt.textcode == 'SUCCESS') {
        selfckDislplayCheckout(evt);
        selfckShowMsgNode(evt);
        successfulItems[itemBarcode] = 1;

    } else if(evt.textcode == 'OPEN_CIRCULATION_EXISTS') {
        selfckRenew();

    } else if(evt.textcode == 'NO_SESSION') {
        
        return selfckLogoutStaff();

    } else {
        pendingXact = false;
        selfckShowMsgNode(evt);
        $('selfck-item-barcode-input').select();
    }
}

/**
  * Display event text in the messages block
  */
function selfckShowMsgNode(evt) {
    var code = evt.textcode;
    var msgspan = $('selfck-event-span');

    // if we're not explicitly handling the event, just say "copy cannot circ"
    if(!$('selfck-event-' + code)) 
        code = 'COPY_CIRC_NOT_ALLOWED';

    appendClear($('selfck-event-time'), text(new Date().toLocaleString()));
    appendClear($('selfck-event-span'), text($('selfck-event-' + code).innerHTML));
}

/**
  * Renders a row in the checkouts table for the current circulation
  */
function selfckDislplayCheckout(evt) {
    unHideMe($('selfck-items-out-table-wrapper'));

    var template = itemsOutTemplate.cloneNode(true);
    var copy = evt.payload.copy;
    var record = evt.payload.record;
    var circ = evt.payload.circ;

    if(record.isbn()) {
	    var pic = $n(template, 'selfck.jacket');
	    pic.setAttribute('src', '../ac/jacket/small/'+cleanISBN(record.isbn()));
    }
    $n(template, 'selfck.barcode').appendChild(text(copy.barcode()));
    $n(template, 'selfck.title').appendChild(text(record.title()));
    $n(template, 'selfck.author').appendChild(text(record.author()));
    $n(template, 'selfck.due_date').appendChild(text(circ.due_date().replace(/T.*/,'')));
    $n(template, 'selfck.remaining').appendChild(text(circ.renewal_remaining()));
    if(isRenewal) {
        hideMe($n(template, 'selfck.cotype_co'));
        unHideMe($n(template, 'selfck.cotype_rn'));
    }

    $('selfck-items-out-tbody').appendChild(template);
    $('selfck-item-barcode-input').value = '';


    // flesh out the printable version of the page as well
    var ptemplate = printTemplate.cloneNode(true);
    $n(ptemplate, 'title').appendChild(text(record.title()));
    $n(ptemplate, 'barcode').appendChild(text(copy.barcode()));
    $n(ptemplate, 'due_date').appendChild(text(circ.due_date().replace(/T.*/,'')));
    printWrapper.appendChild(ptemplate);

    pendingXact = false;
}

/**
  * Checks to see if this item is checked out to the current patron.  If so, 
  * this sends the renewal request.
  */
function selfckRenew() {

    // first, make sure the item is checked out to this patron
    var detailReq = new Request(
        'open-ils.circ:open-ils.circ.copy_details.retrieve.barcode',
        G.user.session, itemBarcode);

    detailReq.callback(
        function(r) {
            var details = r.getResultObject();
            if(details.circ.usr() == patron.id()) {
                // OK, this is our item, renew it
                isRenewal = true;
                var rnReq = new Request(
                    'open-ils.circ:open-ils.circ.renew',
                    G.user.session, {copy_barcode:itemBarcode});
                rnReq.request.alertEvent = false;
                rnReq.callback(selfckHandleCoResult);
                rnReq.send();
            }
        }
    );

    detailReq.send();
}

/**
  * Sets the print date and prints the page
  */
function selfckPrint() {
    for(var x in successfulItems) { // make sure we've checked out at least one item
        appendClear($('selfck-print-date'), text(new Date().toLocaleString()));
        appendClear($('selfck-print-lib-name'), text(orgUnit.name()));
        if(orgUnitAddress) {
            appendClear($('selfck-print-lib-addr-street'), text(orgUnitAddress.street1()+' '+orgUnitAddress.street2()));
            appendClear($('selfck-print-lib-addr-city'), text(orgUnitAddress.city()));
            appendClear($('selfck-print-lib-addr-state'), text(orgUnitAddress.state()));
            appendClear($('selfck-print-lib-addr-post-code'), text(orgUnitAddress.post_code()));
        }
        appendClear($('selfck-print-lname'), text(patron.family_name()));
        appendClear($('selfck-print-fname'), text(patron.first_given_name()));
        appendClear($('selfck-print-lib-phone'), text(orgUnit.phone()));
        if(orgUnitHours) {
            for(var i in [0, 1, 2, 3, 4, 5, 6]) {
                appendClear($('selfck-print-dow_'+i+'_open'), text(orgUnitHours['dow_'+i+'_open']()));
                appendClear($('selfck-print-dow_'+i+'_close'), text(orgUnitHours['dow_'+i+'_close']()));
            }
        }
        window.print();
        return;
    }
}


/**
  * Test method for generating dummy data in the checkout tables
  */
function selfckMkDummyCirc() {
    unHideMe($('selfck-items-out-table'));

    var template = itemsOutTemplate.cloneNode(true);
    $n(template, 'selfck.barcode').appendChild(text('123456789'));
    $n(template, 'selfck.title').appendChild(text('Test Title'));
    $n(template, 'selfck.author').appendChild(text('Test Author'));
    $n(template, 'selfck.due_date').appendChild(text('2008-08-01'));
    $n(template, 'selfck.remaining').appendChild(text('1'));
    $('selfck-items-out-tbody').appendChild(template);

    // flesh out the printable version of the page as well
    var ptemplate = printTemplate.cloneNode(true);
    $n(ptemplate, 'title').appendChild(text('Test Title'));
    $n(ptemplate, 'barcode').appendChild(text('123456789'));
    $n(ptemplate, 'due_date').appendChild(text('2008-08-01'));
    printWrapper.appendChild(ptemplate);
}
