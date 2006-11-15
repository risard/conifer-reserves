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
					var jsrc = 'data:text/javascript,' + window.escape('var params = { "data" : ' + js2JSON(params.data) + ', "list" : ' + js2JSON(params.list) + '}; function my_init() { if (typeof go_print == "function") { go_print(); } else { alert("Please inform the developers that the go_print bug occurred.  After this alert, we will try to print again."); window.print(); } /* FIXME - mozilla bug#301560 - xpcom kills it too */ if (' + (typeof params.modal != 'undefined' ? 'true' : 'false') + ') setTimeout(function(){ try { window.print(); window.close(); } catch(E) { alert(E); } },0); }');
					w = obj.win.open('data:text/html,<html id="top"><head><script src="/xul/server/main/JSAN.js"></script><script src="' + window.escape(jsrc) + '"></script></head><body onload="try{my_init();}catch(E){alert(E);}">' + window.escape(msg) + '</body></html>','receipt_temp','chrome,resizable');
					w.minimize();
					w.go_print = function() { 

						//setTimeout(
						//	function() {
								try {
									obj.NSPrint(w, silent, params);
								} catch(E) {
									obj.error.standard_unexpected_error_alert("Print Error in util.print.simple.  After this dialog we'll try a second print attempt. content_type = " + content_type,E);
									w.print();
								}
								w.minimize(); w.close();
						//	}, 0
						//);

					}
				break;
				default:
					w = obj.win.open('data:' + content_type + ',' + window.escape(msg),'receipt_temp','chrome,resizable');
					w.minimize();
					setTimeout(
						function() {
							try {
								obj.NSPrint(w, silent, params);
							} catch(E) {
								obj.error.standard_unexpected_error_alert("Print Error in util.print.simple.  After this dialog we'll try a second print attempt. content_type = " + content_type,E);
								w.print();
							}
							w.minimize(); w.close();
						}, 1000
					);
				break;
			}

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
		var cols = [];

		var s = '';
		if (params.header) s += this.template_sub( params.header, cols, params );
		if (params.list) {
			for (var i = 0; i < params.list.length; i++) {
				params.row = params.list[i];
				s += this.template_sub( params.line_item, cols, params );
			}
		}
		if (params.footer) s += this.template_sub( params.footer, cols, params );

		if (params.sample_frame) {
			var jsrc = 'data:text/javascript,' + window.escape('var params = { "data" : ' + js2JSON(params.data) + ', "list" : ' + js2JSON(params.list) + '};');
			params.sample_frame.setAttribute('src','data:text/html,<html id="top"><head><script src="' + window.escape(jsrc) + '"></script></head><body>' + window.escape(s) + '</body></html>');
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
		try{b = s; s = s.replace(/%STAFF_PROFILE%/,obj.data.hash.pgt[ params.staff.profile() ].name() ); }
			catch(E){s = b; this.error.sdump('D_WARN','string = <' + s + '> error = ' + js2JSON(E)+'\n');}
		try{b = s; s = s.replace(/%PATRON_FIRSTNAME%/,params.patron.first_given_name());}
			catch(E){s = b; this.error.sdump('D_WARN','string = <' + s + '> error = ' + js2JSON(E)+'\n');}
		try{b = s; s = s.replace(/%PATRON_LASTNAME%/,params.patron.family_name());}
			catch(E){s = b; this.error.sdump('D_WARN','string = <' + s + '> error = ' + js2JSON(E)+'\n');}
		try{b = s; s = s.replace(/%PATRON_BARCODE%/,typeof params.patron.card() == 'object' ? params.patron.card().barcode() : util.functional.find_id_object_in_list( params.patron.cards(), params.patron.card() ).barcode() ) ;}
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
					alert('debug - please tell the developers that deprecated template code tried to execute');
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

			if (params.print_strategy || obj.data.print_strategy) {

				switch(params.print_strategy || obj.data.print_strategy) {
					case 'dos.print':
						obj._NSPrint_dos_print(w,silent,params);
					break;	
					case 'window.print':
						w.print();
					break;	
					case 'webBrowserPrint':
						obj._NSPrint_webBrowserPrint(w,silent,params);
					break;	
					default:
						//w.print();
						obj._NSPrint_webBrowserPrint(w,silent,params);
					break;	
				}

			} else {
				//w.print();
				obj._NSPrint_webBrowserPrint(w,silent,params);
			}

		} catch (e) {
			//alert('Probably not printing: ' + e);
			this.error.sdump('D_ERROR','PRINT EXCEPTION: ' + js2JSON(e) + '\n');
		}

	},

	'_NSPrint_dos_print' : function(w,silent,params) {
		var obj = this;
		try {
			/* This is a kludge/workaround.  webBrowserPrint doesn't always work.  So we're going to let
				the html window handle our receipt template rendering, and then force a selection of all
				the text nodes and dump that to a file, for printing through a dos utility */

			netscape.security.PrivilegeManager.enablePrivilege("UniversalXPConnect");
			w.getSelection().selectAllChildren(w.document.firstChild);
			var text = w.getSelection().toString();

			JSAN.use('util.file'); var file = new util.file('receipt.txt');
			file.write_content('truncate',text); file.close();
			
			file = new util.file('receipt.bat');
			if (! file._file.exists()) { 
				file.write_content('truncate','copy chrome\\open_ils_staff_client\\content\\conf\\receipt.txt lpt1 /b\n');
				file.close();
				file = new util.file('receipt.bat');
			}

			var process = Components.classes["@mozilla.org/process/util;1"].createInstance(Components.interfaces.nsIProcess);
			process.init(file._file);

			var args = [];

			process.run(true, args, args.length);

		} catch (e) {
			//alert('Probably not printing: ' + e);
			this.error.sdump('D_ERROR','_NSPrint_dos_print PRINT EXCEPTION: ' + js2JSON(e) + '\n');
		}
	},

	'_NSPrint_webBrowserPrint' : function(w,silent,params) {
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
					if (params.marginLeft) gPrintSettings.marginLeft = params.marginLeft;
				}
				webBrowserPrint.print(gPrintSettings, null);
				this.error.sdump('D_PRINT','Should be printing\n');
			} else {
				this.error.sdump('D_ERROR','Should not be printing\n');
			}
		} catch (e) {
			//alert('Probably not printing: ' + e);
			// Pressing cancel is expressed as an NS_ERROR_ABORT return value,
			// causing an exception to be thrown which we catch here.
			// Unfortunately this will also consume helpful failures
			this.error.sdump('D_ERROR','_NSPrint_webBrowserPrint PRINT EXCEPTION: ' + js2JSON(e) + '\n');
		}
	},

	'GetPrintSettings' : function() {
		try {
			//alert('entering GetPrintSettings');
			netscape.security.PrivilegeManager.enablePrivilege("UniversalXPConnect");
			var pref = Components.classes["@mozilla.org/preferences-service;1"]
				.getService(Components.interfaces.nsIPrefBranch);
			//alert('pref = ' + pref);
			if (pref) {
				this.gPrintSettingsAreGlobal = pref.getBoolPref("print.use_global_printsettings", false);
				this.gSavePrintSettings = pref.getBoolPref("print.save_print_settings", false);
				//alert('gPrintSettingsAreGlobal = ' + this.gPrintSettingsAreGlobal + '  gSavePrintSettings = ' + this.gSavePrintSettings);
			}
 
			var printService = Components.classes["@mozilla.org/gfx/printsettings-service;1"]
				.getService(Components.interfaces.nsIPrintSettingsService);
			if (this.gPrintSettingsAreGlobal) {
				this.gPrintSettings = printService.globalPrintSettings;
				//alert('called setPrinterDefaultsForSelectedPrinter');
				this.setPrinterDefaultsForSelectedPrinter(printService);
			} else {
				this.gPrintSettings = printService.newPrintSettings;
				//alert('used printService.newPrintSettings');
			}
		} catch (e) {
			this.error.sdump('D_ERROR',"GetPrintSettings() "+e+"\n");
			//alert("GetPrintSettings() "+e+"\n");
		}
 
		return this.gPrintSettings;
	},

	'setPrinterDefaultsForSelectedPrinter' : function (aPrintService) {
		try {
			netscape.security.PrivilegeManager.enablePrivilege("UniversalXPConnect");
			if (this.gPrintSettings.printerName == "") {
				this.gPrintSettings.printerName = aPrintService.defaultPrinterName;
				//alert('used .defaultPrinterName');
			}
			//alert('printerName = ' + this.gPrintSettings.printerName);
	 
			// First get any defaults from the printer 
			aPrintService.initPrintSettingsFromPrinter(this.gPrintSettings.printerName, this.gPrintSettings);
	 
			// now augment them with any values from last time
			aPrintService.initPrintSettingsFromPrefs(this.gPrintSettings, true, this.gPrintSettings.kInitSaveAll);

			// now augment from our own saved settings if they exist
			this.load_settings();

		} catch(E) {
			this.error.sdump('D_ERROR',"setPrinterDefaultsForSelectedPrinter() "+E+"\n");
		}
	},

	'page_settings' : function() {
		try {
			netscape.security.PrivilegeManager.enablePrivilege("UniversalXPConnect");
			this.GetPrintSettings();
			var PO = Components.classes["@mozilla.org/gfx/printsettings-service;1"].getService(Components.interfaces.nsIPrintOptions);
			PO.ShowPrintSetupDialog(this.gPrintSettings);
		} catch(E) {
			this.error.standard_unexpected_error_alert("page_settings()",E);
		}
	},

	'load_settings' : function() {
		try {
			netscape.security.PrivilegeManager.enablePrivilege("UniversalXPConnect");
			JSAN.use('util.file'); var file = new util.file('gPrintSettings');
			if (file._file.exists()) {
				temp = file.get_object(); file.close();
				for (var i in temp) {
					this.gPrintSettings[i] = temp[i];
				}
			} else {
				this.gPrintSettings.marginTop = 0;
				this.gPrintSettings.marginLeft = 0;
				this.gPrintSettings.marginBottom = 0;
				this.gPrintSettings.marginRight = 0;
				this.gPrintSettings.headerStrLeft = '';
				this.gPrintSettings.headerStrCenter = '';
				this.gPrintSettings.headerStrRight = '';
				this.gPrintSettings.footerStrLeft = '';
				this.gPrintSettings.footerStrCenter = '';
				this.gPrintSettings.footerStrRight = '';
			}
		} catch(E) {
			this.error.standard_unexpected_error_alert("load_settings()",E);
		}
	},

	'save_settings' : function() {
		try {
			netscape.security.PrivilegeManager.enablePrivilege("UniversalXPConnect");
			JSAN.use('util.file'); var file = new util.file('gPrintSettings');
			file.set_object(this.gPrintSettings); file.close();
		} catch(E) {
			this.error.standard_unexpected_error_alert("save_settings()",E);
		}
	},
}

dump('exiting util/print.js\n');
