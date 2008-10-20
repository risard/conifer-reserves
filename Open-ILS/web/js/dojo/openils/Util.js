/* ---------------------------------------------------------------------------
 * Copyright (C) 2008  Georgia Public Library Service
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
 * ---------------------------------------------------------------------------
 */


/**
 * General purpose, static utility functions
 */

if(!dojo._hasResource["openils.Util"]) {
    dojo._hasResource["openils.Util"] = true;
    dojo.provide("openils.Util");
    dojo.require('openils.Event');
    dojo.declare('openils.Util', null, {});


    /**
     * Wrapper for dojo.addOnLoad that verifies a valid login session is active
     * before adding the function to the onload set
     */
    openils.Util.addOnLoad = function(func, noSes) {
        if(func) {
            if(!noSes) {
                dojo.require('openils.User');
                if(!openils.User.authtoken) 
                    return;
            }
            console.log("adding onload " + func.name);
            dojo.addOnLoad(func);
        }
    };

    /**
     * Returns true if the provided array contains the specified value
     */
    openils.Util.arrayContains = function(arr, val) {
        for(var i = 0; arr && i < arr.length; i++) {
            if(arr[i] == val)
                return true;
        }
        return false;
    };

    /**
     * Parses opensrf response objects to see if they contain 
     * data and/or an ILS event.  This only calls request.recv()
     * once, so in a streaming context, it's necessary to loop on
     * this method. 
     * @param r The OpenSRF Request object
     * @param eventOK If true, any found events will be returned as responses.  
     * If false, they will be treated as error conditions and their content will
     * be alerted if openils.Util.alertEvent is set to true.  Also, if eventOk is
     * false, the response content will be null when an event is encountered.
     */
    openils.Util.alertEvent = true;
    openils.Util.extractResponse = function(r, eventOk) {
        var msg = r.recv();
        if(msg == null) return msg;
        var val = msg.content();
        if(e = openils.Event.parse(val)) {
            if(eventOk) return e;
            console.log(e.toString());
            if(openils.Util.alertEvent)
                alert(e);
            return null;
        }
        return val;
    };

}
