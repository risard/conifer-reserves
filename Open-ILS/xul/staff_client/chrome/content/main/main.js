dump('entering main/main.js\n');
// vim:noet:sw=4:ts=4:

var offlineStrings;

function grant_perms(url) {
	var perms = "UniversalXPConnect UniversalPreferencesWrite UniversalBrowserWrite UniversalPreferencesRead UniversalBrowserRead UniversalFileRead";
	dump('Granting ' + perms + ' to ' + url + '\n');
	var pref = Components.classes["@mozilla.org/preferences-service;1"]
		.getService(Components.interfaces.nsIPrefBranch);
	if (pref) {
		pref.setCharPref("capability.principal.codebase.p0.granted", perms);
		pref.setCharPref("capability.principal.codebase.p0.id", url);
		pref.setBoolPref("dom.disable_open_during_load",false);
		pref.setBoolPref("browser.popups.showPopupBlocker",false);
	}

}

function clear_the_cache() {
	try {
		var cacheClass 		= Components.classes["@mozilla.org/network/cache-service;1"];
		var cacheService	= cacheClass.getService(Components.interfaces.nsICacheService);
		cacheService.evictEntries(Components.interfaces.nsICache.STORE_ON_DISK);
		cacheService.evictEntries(Components.interfaces.nsICache.STORE_IN_MEMORY);
	} catch(E) {
		dump(E+'\n');alert(E);
	}
}

function main_init() {
	dump('entering main_init()\n');
	try {
		clear_the_cache();

		// Now we can safely load the strings without the cache getting wiped
		offlineStrings = document.getElementById('offlineStrings');

		if (typeof JSAN == 'undefined') {
			throw(
				offlineStrings.getString('common.jsan.missing')
			);
		}
		/////////////////////////////////////////////////////////////////////////////

		JSAN.errorLevel = "die"; // none, warn, or die
		JSAN.addRepository('..');

		//JSAN.use('test.test'); test.test.hello_world();

		var mw = self;
		G =  {};

		JSAN.use('util.error');
		G.error = new util.error();
		G.error.sdump('D_ERROR', offlineStrings.getString('main.testing'));

		JSAN.use('util.window');
		G.window = new util.window();

		JSAN.use('auth.controller');
		G.auth = new auth.controller( { 'window' : mw } );

		JSAN.use('OpenILS.data');
		G.data = new OpenILS.data();
		G.data.on_error = G.auth.logoff;

		JSAN.use('util.file');
		G.file = new util.file();
		try {
			G.file.get('ws_info');
			G.ws_info = G.file.get_object(); G.file.close();
		} catch(E) {
			G.ws_info = {};
		}
		G.data.ws_info = G.ws_info; G.data.stash('ws_info');

		G.auth.on_login = function() {

			var url = G.auth.controller.view.server_prompt.value || urls.remote;

			G.data.server_unadorned = url; G.data.stash('server_unadorned'); G.data.stash_retrieve();

			if (! url.match( '^http://' ) ) { url = 'http://' + url; }

			G.data.server = url; G.data.stash('server'); 
			G.data.session = { 'key' : G.auth.session.key, 'auth' : G.auth.session.authtime }; G.data.stash('session');
			G.data.stash_retrieve();

			grant_perms(url);

			var xulG = {
				'auth' : G.auth,
				'url' : url,
				'window' : G.window
			};

			if (G.data.ws_info && G.data.ws_info[G.auth.controller.view.server_prompt.value]) {
				JSAN.use('util.widgets');
				var deck = document.getElementById('progress_space');
				util.widgets.remove_children( deck );
				var iframe = document.createElement('iframe'); deck.appendChild(iframe);
				iframe.setAttribute( 'src', url + '/xul/server/main/data.xul' );
				iframe.contentWindow.xulG = xulG;
			} else {
				xulG.file = G.file;
				var deck = G.auth.controller.view.ws_deck;
				JSAN.use('util.widgets'); util.widgets.remove_children('ws_deck');
				var iframe = document.createElement('iframe'); deck.appendChild(iframe);
				iframe.setAttribute( 'src', url + '/xul/server/main/ws_info.xul' );
				iframe.contentWindow.xulG = xulG;
				deck.selectedIndex = deck.childNodes.length - 1;
			}
		};

		G.auth.on_standalone = function() {
			try {
				G.window.open(urls.XUL_STANDALONE,'Offline','chrome,resizable');
			} catch(E) {
				alert(E);
			}
		};

		G.auth.on_standalone_export = function() {
			try {
				JSAN.use('util.file'); var file = new util.file('pending_xacts');
				if (file._file.exists()) {
                    var file2 = new util.file('');
					var f = file2.pick_file( { 'mode' : 'save', 'title' : offlineStrings.getString('main.transaction_export.title') } );
					if (f) {
						if (f.exists()) {
							var r = G.error.yns_alert(
								offlineStrings.getFormattedString('main.transaction_export.prompt', [f.leafName]),
								offlineStrings.getString('main.transaction_export.prompt.title'),
								offlineStrings.getString('common.yes'),
								offlineStrings.getString('common.no'),
								null,
								offlineStrings.getString('common.confirm')
							);
							if (r != 0) { file.close(); return; }
						}
						var e_file = new util.file(''); e_file._file = f;
						e_file.write_content( 'truncate', file.get_content() );
						e_file.close();
						var r = G.error.yns_alert(
							offlineStrings.getFormattedString('main.transaction_export.success.prompt', [f.leafName]),
							offlineStrings.getString('main.transaction_export.success.title'),
							offlineStrings.getString('common.yes'),
							offlineStrings.getString('common.no'),
							null,
							offlineStrings.getString('common.confirm')
						);
						if (r == 0) {
							var count = 0;
							var filename = 'pending_xacts_exported_' + new Date().getTime();
							var t_file = new util.file(filename);
							while (t_file._file.exists()) {
								filename = 'pending_xacts_' + new Date().getTime() + '.exported';
								t_file = new util.file(filename);
								if (count++ > 100) {
									throw(offlineStrings.getString('main.transaction_export.filename.error'));
								}
							}
							file._file.moveTo(null,filename);
						} else {
							alert(offlineStrings.getString('main.transaction_export.duplicate.warning'));
						}
					} else {
						alert(offlineStrings.getString('main.transaction_export.no_filename.error'));
					}
				} else {
					alert(offlineStrings.getString('main.transaction_export.no_transactions.error'));
				}
				file.close();
			} catch(E) {
				alert(E);
			}
		};

		G.auth.on_standalone_import = function() {
			try {
				JSAN.use('util.file'); var file = new util.file('pending_xacts');
				if (file._file.exists()) {
					alert(offlineStrings.getString('main.transaction_import.outstanding.error'));
				} else {
                    var file2 = new util.file('');
					var f = file2.pick_file( { 'mode' : 'open', 'title' : offlineStrings.getString('main.transaction_import.title')} );
					if (f && f.exists()) {
						var i_file = new util.file(''); i_file._file = f;
						file.write_content( 'truncate', i_file.get_content() );
						i_file.close();
						var r = G.error.yns_alert(
							offlineStrings.getFormattedString('main.transaction_import.delete.prompt', [f.leafName]),
							offlineStrings.getString('main.transaction_import.success'),
							offlineStrings.getString('common.yes'),
							offlineStrings.getString('common.no'),
							null,
							offlineStrings.getString('common.confirm')
						);
						if (r == 0) {
							f.remove(false);
						}
					}
				}
				file.close();
			} catch(E) {
				alert(E);
			}
		};

		G.auth.on_debug = function(action) {
			switch(action) {
				case 'js_console' :
					G.window.open(urls.XUL_DEBUG_CONSOLE,'testconsole','chrome,resizable');
				break;
				case 'clear_cache' :
					clear_the_cache();
					alert(offlineStrings.getString('main.on_debug.clear_cache'));
				break;
				default:
					alert(offlineStrings.getString('main.on_debug.debug'));
				break;
			}
		};

		G.auth.init();
		// XML_HTTP_SERVER will get reset to G.auth.controller.view.server_prompt.value

		/////////////////////////////////////////////////////////////////////////////

		var version = '/xul/server/'.split(/\//)[2];
		if (version == 'server') {
			version = 'versionless debug build';
			document.getElementById('debug_gb').hidden = false;
		}
		//var x = document.getElementById('version_label');
		//x.setAttribute('value','Build ID: ' + version);
		var x = document.getElementById('about_btn');
		x.setAttribute('label', offlineStrings.getString('main.about_btn.label'));
		x.addEventListener(
			'command',
			function() {
				try { 
					G.window.open('about.html','about','chrome,resizable,width=800,height=600');
				} catch(E) { alert(E); }
			}, 
			false
		);
		if ( found_ws_info_in_Achrome() ) {
			//var hbox = x.parentNode; var b = document.createElement('button'); 
			//b.setAttribute('label','Migrate legacy settings'); hbox.appendChild(b);
			//b.addEventListener(
			//	'command',
			//	function() {
			//		try {
			//			handle_migration();
			//		} catch(E) { alert(E); }
			//	},
			//	false
			//);
			if (window.confirm(offlineStrings.getString('main.settings.migrate'))) {
				setTimeout( function() { handle_migration(); }, 0 );
			}
		}

	} catch(E) {
		var error = offlineStrings.getFormattedString('common.exception', [E, '']);
		try { G.error.sdump('D_ERROR',error); } catch(E) { dump(error); }
		alert(error);
	}
	dump('exiting main_init()\n');
}

function found_ws_info_in_Achrome() {
	JSAN.use('util.file');
	var f = new util.file();
	var f_in_chrome = f.get('ws_info','chrome');
	var path = f_in_chrome.exists() ? f_in_chrome.path : false;
	f.close();
	return path;
}

function found_ws_info_in_Uchrome() {
	JSAN.use('util.file');
	var f = new util.file();
	var f_in_uchrome = f.get('ws_info','uchrome');
	var path = f_in_uchrome.exists() ? f_in_uchrome.path : false;
	f.close();
	return path;
}

function handle_migration() {
	if ( found_ws_info_in_Uchrome() ) {
		alert(offlineStrings.getFormattedString('main.settings.migrate.failed', [found_ws_info_in_Uchrome(), found_ws_info_in_Achrome()])
		);
	} else {
		var dirService = Components.classes["@mozilla.org/file/directory_service;1"].getService( Components.interfaces.nsIProperties );
		var f_new = dirService.get( "UChrm", Components.interfaces.nsIFile );
		var f_old = dirService.get( "AChrom", Components.interfaces.nsIFile );
		f_old.append(myPackageDir); f_old.append("content"); f_old.append("conf"); 
		if (window.confirm(offlineStrings.getFormattedString("main.settings.migrate.confirm", [f_old.path, f_new.path]))) {
			var files = f_old.directoryEntries;
			while (files.hasMoreElements()) {
				var file = files.getNext();
				var file2 = file.QueryInterface( Components.interfaces.nsILocalFile );
				try {
					file2.moveTo( f_new, '' );
				} catch(E) {
					alert(offlineStrings.getFormattedString('main.settings.migrate.error', [file2.path, f_new.path]) + '\n');
				}
			}
			location.href = location.href; // huh?
		}
	}
}

dump('exiting main/main.js\n');
