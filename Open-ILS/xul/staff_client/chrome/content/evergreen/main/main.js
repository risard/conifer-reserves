dump('entering main/main.js\n');

function main_init() {
	dump('entering main_init()\n');
	try {
		var pref = Components.classes["@mozilla.org/preferences-service;1"]
			.getService(Components.interfaces.nsIPrefBranch);
		if (pref) {
			pref.setCharPref("capability.principal.codebase.p0.granted", "UniversalXPConnect UniversalPreferencesWrite UniversalBrowserWrite UniversalPreferencesRead UniversalBrowserRead");
			pref.setCharPref("capability.principal.codebase.p0.id", urls.opac);
		}

		if (typeof JSAN == 'undefined') {
			throw(
				"The JSAN library object is missing."
			);
		}
		/////////////////////////////////////////////////////////////////////////////

		JSAN.errorLevel = "die"; // none, warn, or die
		JSAN.addRepository('..');

		//JSAN.use('test.test'); test.test.hello_world();

		var mw = self;
		var G =  {};
		G.OpenILS = {};
		G.OpenSRF = {};

		JSAN.use('util.error');
		G.error = new util.error();
		G.error.sdump('D_ERROR','Testing');

		JSAN.use('main.window');
		G.window = new main.window();

		JSAN.use('auth.controller');
		G.auth = new auth.controller( { 'window' : mw } );

		JSAN.use('OpenILS.data');
		G.OpenILS.data = new OpenILS.data()
		G.OpenILS.data.on_error = G.auth.logoff;
		G.OpenILS.data.entities = entities;
		G.OpenILS.data.stash('entities');

		G.auth.on_login = function() {

			G.OpenILS.data.session = G.auth.session.key;
			G.OpenILS.data.on_complete = function () {
				
				G.OpenILS.data.stash('list','hash');
				G.OpenILS.data._debug_stash();

				G.window.open(urls.opac + urls.remote_menu_frame 
					+ '?session='+mw.escape(G.auth.session.key),'test','chrome');
			}
			G.OpenILS.data.init();
		}

		G.auth.init();

		/////////////////////////////////////////////////////////////////////////////

	} catch(E) {
		var error = "!! This software has encountered an error.  Please tell your friendly " +
			"system administrator or software developer the following:\n" + E + '\n';
		try { G.error.sdump('D_ERROR',error); } catch(E) { dump(error); }
		alert(error);
	}
	dump('exiting main_init()\n');
}

dump('exiting main/main.js\n');
