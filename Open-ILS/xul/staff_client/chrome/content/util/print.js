dump('entering util/print.js\n');

if (typeof util == 'undefined') util = {};
util.print = function () {

	netscape.security.PrivilegeManager.enablePrivilege("UniversalXPConnect");

	JSAN.use('util.error'); this.error = new util.error();
	JSAN.use('OpenILS.data'); this.data = new OpenILS.data(); this.data.init( { 'via':'stash' } );
	JSAN.use('util.window'); this.win = new util.window();
	JSAN.use('util.functional');

	return this;
};

util.print.prototype = {

	'reprint_last' : function() {
		try {
			var obj = this; obj.data.init({'via':'stash'});
			if (!obj.data.last_print) {
				alert('Nothing to re-print');
				return;
			}
			var msg = obj.data.last_print.msg;
			var params = obj.data.last_print.params; params.no_prompt = false;
			obj.simple( msg, params );
		} catch(E) {
			this.error.standard_unexpected_error_alert('util.print.reprint_last',E);
		}
	},

	'simple' : function(msg,params) {
		try {
			if (!params) params = {};

			var obj = this;

			obj.data.last_print = { 'msg' : msg, 'params' : params}; obj.data.stash('last_print');

			var silent = false;
			if ( params && params.no_prompt && (params.no_prompt == true || params.no_prompt == 'true') ) {
				silent = true;
			}

			var content_type;
			if (params && params.content_type) {
				content_type = params.content_type;
			} else {
				content_type = 'text/html';
			}

			var w;
			switch(content_type) {
				case 'text/html' :
					var jsrc = 'data:text/javascript,' + window.escape('var params = { "data" : ' + js2JSON(params.data) + ', "list" : ' + js2JSON(params.list) + '}; function my_init() { return; /* FIXME */ if (' + (typeof params.modal != 'undefined' ? 'true' : 'false') + ') setTimeout(function(){ try { /* JSAN.use("util.print"); var p = new util.print(); p.NSPrint(window,false,{}); */ alert("test"); window.print(); alert("test2"); window.close(); } catch(E) { alert(E); } },0); }');
					w = obj.win.open('data:text/html,<html><head><script src="/xul/server/main/JSAN.js"></script><script src="' + window.escape(jsrc) + '"></script></head><body onload="try{my_init();}catch(E){alert(E);}">' + window.escape(msg) + '</body></html>','receipt_temp','chrome,resizable');
				break;
				default:
					w = obj.win.open('data:' + content_type + ',' + window.escape(msg),'receipt_temp','chrome,resizable');
				break;
			}

			w.minimize();

			setTimeout(
				function() {
					try {
						obj.NSPrint(w, silent, params);
					} catch(E) {
						obj.error.sdump('D_ERROR','util.print.simple: ' + E);
						w.print();
					}
					w.minimize(); w.close();
				}, 0
			);
		} catch(E) {
			this.error.standard_unexpected_error_alert('util.print.simple',E);
		}
	},
	
	'tree_list' : function (params) { 
		try {
			dump('print.tree_list.params.list = \n' + this.error.pretty_print(js2JSON(params.list)) + '\n');
		} catch(E) {
			dump(E+'\n');
		}
		var cols;
		// FIXME -- This could be done better.. instead of finding the columns and handling a tree dump,
		// we could do a dump_with_keys instead
		switch(params.type) {
			case 'offline_checkout' :
				JSAN.use('circ.util');
				cols = util.functional.map_list(
					circ.util.offline_checkout_columns( {} ),
					function(o) {
						return '%' + o.id + '%';
					}
				);

			break;
			case 'offline_checkin' :
				JSAN.use('circ.util');
				cols = util.functional.map_list(
					circ.util.offline_checkin_columns( {} ),
					function(o) {
						return '%' + o.id + '%';
					}
				);

			break;
			case 'offline_renew' :
				JSAN.use('circ.util');
				cols = util.functional.map_list(
					circ.util.offline_renew_columns( {} ),
					function(o) {
						return '%' + o.id + '%';
					}
				);
			break;
			case 'offline_inhouse_use' :
				JSAN.use('circ.util');
				cols = util.functional.map_list(
					circ.util.offline_inhouse_use_columns( {} ),
					function(o) {
						return '%' + o.id + '%';
					}
				);
			break;
			case 'items':
				JSAN.use('circ.util');
				cols = util.functional.map_list(
					circ.util.columns( {} ),
					function(o) {
						return '%' + o.id + '%';
					}
				);
			break;
			case 'bills':
				JSAN.use('patron.util');
				cols = util.functional.map_list(
					patron.util.mbts_columns( {} ),
					function(o) {
						return '%' + o.id + '%';
					}
				);
			break;
			case 'payment':
				cols = [ '%bill_id%','%payment%'];
			break;
			case 'holds':
				JSAN.use('circ.util');
				cols = util.functional.map_list(
					circ.util.hold_columns( {} ),
					function(o) {
						return '%' + o.id + '%';
					}
				);
			break;
			case 'patrons':
				JSAN.use('patron.util');
				cols = util.functional.map_list(
					patron.util.columns( {} ),
					function(o) {
						return '%' + o.id + '%';
					}
				);
			break;
		}

		var s = this.template_sub( params.header, cols, params );
		for (var i = 0; i < params.list.length; i++) {
			params.row = params.list[i];
			s += this.template_sub( params.line_item, cols, params );
		}
		s += this.template_sub( params.footer, cols, params );

		if (params.sample_frame) {
			var jsrc = 'data:text/javascript,' + window.escape('var params = { "data" : ' + js2JSON(params.data) + ', "list" : ' + js2JSON(params.list) + '};');
			params.sample_frame.setAttribute('src','data:text/html,<html><head><script src="' + window.escape(jsrc) + '"></script></head><body>' + window.escape(s) + '</body></html>');
		} else {
			this.simple(s,params);
		}
	},

	'template_sub' : function( msg, cols, params ) {
		if (!msg) { dump('template sub called with empty string\n'); return; }
		JSAN.use('util.date');
		var s = msg; var b;

		try{b = s; s = s.replace(/%patron_barcode%/,params.patron_barcode);}
			catch(E){s = b; this.error.sdump('D_WARN','string = <' + s + '> error = ' + js2JSON(E)+'\n');}

		try{b = s; s = s.replace(/%LIBRARY%/,params.lib.name());}
			catch(E){s = b; this.error.sdump('D_WARN','string = <' + s + '> error = ' + js2JSON(E)+'\n');}
		try{b = s; s = s.replace(/%PINES_CODE%/,params.lib.shortname());}
			catch(E){s = b; this.error.sdump('D_WARN','string = <' + s + '> error = ' + js2JSON(E)+'\n');}
		try{b = s; s = s.replace(/%STAFF_FIRSTNAME%/,params.staff.first_given_name());}
			catch(E){s = b; this.error.sdump('D_WARN','string = <' + s + '> error = ' + js2JSON(E)+'\n');}
		try{b = s; s = s.replace(/%STAFF_LASTNAME%/,params.staff.family_name());}
			catch(E){s = b; this.error.sdump('D_WARN','string = <' + s + '> error = ' + js2JSON(E)+'\n');}
		try{b = s; s = s.replace(/%STAFF_BARCODE%/,params.staff.barcode); }
			catch(E){s = b; this.error.sdump('D_WARN','string = <' + s + '> error = ' + js2JSON(E)+'\n');}
		try{b = s; s = s.replace(/%PATRON_FIRSTNAME%/,params.patron.first_given_name());}
			catch(E){s = b; this.error.sdump('D_WARN','string = <' + s + '> error = ' + js2JSON(E)+'\n');}
		try{b = s; s = s.replace(/%PATRON_LASTNAME%/,params.patron.family_name());}
			catch(E){s = b; this.error.sdump('D_WARN','string = <' + s + '> error = ' + js2JSON(E)+'\n');}
		try{b = s; s = s.replace(/%PATRON_BARCODE%/,params.patron.card().barcode());}
			catch(E){s = b; this.error.sdump('D_WARN','string = <' + s + '> error = ' + js2JSON(E)+'\n');}

		try{b = s; s=s.replace(/%TODAY%/g,(new Date()));}
			catch(E){s = b; this.error.sdump('D_WARN','string = <' + s + '> error = ' + js2JSON(E)+'\n');}
		try{b = s; s=s.replace(/%TODAY_m%/g,(util.date.formatted_date(new Date(),'%m')));}
			catch(E){s = b; this.error.sdump('D_WARN','string = <' + s + '> error = ' + js2JSON(E)+'\n');}
		try{b = s; s=s.replace(/%TODAY_TRIM%/g,(util.date.formatted_date(new Date(),'')));}
			catch(E){s = b; this.error.sdump('D_WARN','string = <' + s + '> error = ' + js2JSON(E)+'\n');}
		try{b = s; s=s.replace(/%TODAY_d%/g,(util.date.formatted_date(new Date(),'%d')));}
			catch(E){s = b; this.error.sdump('D_WARN','string = <' + s + '> error = ' + js2JSON(E)+'\n');}
		try{b = s; s=s.replace(/%TODAY_Y%/g,(util.date.formatted_date(new Date(),'%Y')));}
			catch(E){s = b; this.error.sdump('D_WARN','string = <' + s + '> error = ' + js2JSON(E)+'\n');}
		try{b = s; s=s.replace(/%TODAY_H%/g,(util.date.formatted_date(new Date(),'%H')));}
			catch(E){s = b; this.error.sdump('D_WARN','string = <' + s + '> error = ' + js2JSON(E)+'\n');}
		try{b = s; s=s.replace(/%TODAY_I%/g,(util.date.formatted_date(new Date(),'%I')));}
			catch(E){s = b; this.error.sdump('D_WARN','string = <' + s + '> error = ' + js2JSON(E)+'\n');}
		try{b = s; s=s.replace(/%TODAY_M%/g,(util.date.formatted_date(new Date(),'%M')));}
			catch(E){s = b; this.error.sdump('D_WARN','string = <' + s + '> error = ' + js2JSON(E)+'\n');}
		try{b = s; s=s.replace(/%TODAY_D%/g,(util.date.formatted_date(new Date(),'%D')));}
			catch(E){s = b; this.error.sdump('D_WARN','string = <' + s + '> error = ' + js2JSON(E)+'\n');}
		try{b = s; s=s.replace(/%TODAY_F%/g,(util.date.formatted_date(new Date(),'%F')));}
			catch(E){s = b; this.error.sdump('D_WARN','string = <' + s + '> error = ' + js2JSON(E)+'\n');}

		try {
			if (typeof params.row != 'undefined') {
				if (params.row.length >= 0) {
					for (var i = 0; i < cols.length; i++) {
						var re = new RegExp(cols[i],"g");
						try{b = s; s=s.replace(re, params.row[i]);}
							catch(E){s = b; this.error.standard_unexpected_error_alert('string = <' + s + '> error = ' + js2JSON(E)+'\n',E);}
					}
				} else { 
					/* for dump_with_keys */
					for (var i in params.row) {
						var re = new RegExp('%'+i+'%',"g");
						try{b = s; s=s.replace(re, params.row[i]);}
							catch(E){s = b; this.error.standard_unexpected_error_alert('string = <' + s + '> error = ' + js2JSON(E)+'\n',E);}
					}
				}
			}

			if (typeof params.data != 'undefined') {
				for (var i in params.data) {
					var re = new RegExp('%'+i+'%',"g");
					try{b = s; s=s.replace(re, params.data[i]);}
						catch(E){s = b; this.error.standard_unexpected_error_alert('string = <' + s + '> error = ' + js2JSON(E)+'\n',E);}
				}
			}
		} catch(E) { dump(E+'\n'); }

		return s;
	},


	'NSPrint' : function(w,silent,params) {
		if (!w) w = window;
		var obj = this;
		try {
			netscape.security.PrivilegeManager.enablePrivilege("UniversalXPConnect");
			var webBrowserPrint = w
				.QueryInterface(Components.interfaces.nsIInterfaceRequestor)
				.getInterface(Components.interfaces.nsIWebBrowserPrint);
			this.error.sdump('D_PRINT','webBrowserPrint = ' + webBrowserPrint);
			if (webBrowserPrint) {
				var gPrintSettings = obj.GetPrintSettings();
				if (silent) gPrintSettings.printSilent = true;
				else gPrintSettings.printSilent = false;
				if (params) {
					gPrintSettings.marginTop = 0;
					gPrintSettings.marginLeft = 0;
					gPrintSettings.marginBottom = 0;
					gPrintSettings.marginRight = 0;
					if (params.marginLeft) gPrintSettings.marginLeft = params.marginLeft;
				}
				gPrintSettings.headerStrLeft = '';
				gPrintSettings.headerStrCenter = '';
				gPrintSettings.headerStrRight = '';
				gPrintSettings.footerStrLeft = '';
				gPrintSettings.footerStrCenter = '';
				gPrintSettings.footerStrRight = '';
				//this.error.sdump('D_PRINT','gPrintSettings = ' + obj.error.pretty_print(js2JSON(gPrintSettings)));
				//alert('gPrintSettings = ' + js2JSON(gPrintSettings));
				webBrowserPrint.print(gPrintSettings, null);
				/*
				if (this.gPrintSettingsAreGlobal && this.gSavePrintSettings) {
					var PSSVC = Components.classes["@mozilla.org/gfx/printsettings-service;1"]
						.getService(Components.interfaces.nsIPrintSettingsService);
					PSSVC.savePrintSettingsToPrefs( gPrintSettings, true, gPrintSettings.kInitSaveAll);
					PSSVC.savePrintSettingsToPrefs( gPrintSettings, false, gPrintSettings.kInitSavePrinterName);
				}
				*/
				//this.error.sdump('D_PRINT','gPrintSettings 2 = ' + obj.error.pretty_print(js2JSON(gPrintSettings)));
				//alert('Should be printing\n');
				this.error.sdump('D_PRINT','Should be printing\n');
			} else {
				//alert('Should not be printing\n');
				this.error.sdump('D_PRINT','Should not be printing\n');
			}
		} catch (e) {
			//alert('Probably not printing: ' + e);
			// Pressing cancel is expressed as an NS_ERROR_ABORT return value,
			// causing an exception to be thrown which we catch here.
			// Unfortunately this will also consume helpful failures, so add a
			this.error.sdump('D_PRINT','PRINT EXCEPTION: ' + js2JSON(e) + '\n');
			// if you need to debug
		}

	},

	'GetPrintSettings' : function() {
		try {
			netscape.security.PrivilegeManager.enablePrivilege("UniversalXPConnect");
			var pref = Components.classes["@mozilla.org/preferences-service;1"]
				.getService(Components.interfaces.nsIPrefBranch);
			if (pref) {
				this.gPrintSettingsAreGlobal = pref.getBoolPref("print.use_global_printsettings", false);
				this.gSavePrintSettings = pref.getBoolPref("print.save_print_settings", false);
			}
 
			var printService = Components.classes["@mozilla.org/gfx/printsettings-service;1"]
				.getService(Components.interfaces.nsIPrintSettingsService);
			if (this.gPrintSettingsAreGlobal) {
				this.gPrintSettings = printService.globalPrintSettings;
				this.setPrinterDefaultsForSelectedPrinter(printService);
			} else {
				this.gPrintSettings = printService.newPrintSettings;
			}
		} catch (e) {
			this.error.sdump('D_PRINT',"GetPrintSettings() "+e+"\n");
			//alert("GetPrintSettings() "+e+"\n");
		}
 
		return this.gPrintSettings;
	},

	'setPrinterDefaultsForSelectedPrinter' : function (aPrintService) {
		try {
			netscape.security.PrivilegeManager.enablePrivilege("UniversalXPConnect");
			if (this.gPrintSettings.printerName == "") {
				this.gPrintSettings.printerName = aPrintService.defaultPrinterName;
			}
	 
			// First get any defaults from the printer 
			aPrintService.initPrintSettingsFromPrinter(this.gPrintSettings.printerName, this.gPrintSettings);
	 
			// now augment them with any values from last time
			aPrintService.initPrintSettingsFromPrefs(this.gPrintSettings, true, this.gPrintSettings.kInitSaveAll);
		} catch(E) {
			this.error.sdump('D_PRINT',"setPrinterDefaultsForSelectedPrinter() "+E+"\n");
		}
	}
}

dump('exiting util/print.js\n');
