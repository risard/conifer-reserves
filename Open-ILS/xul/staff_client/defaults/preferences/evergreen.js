// Preferences that get set when the application is loaded

// Modified by Jason for Evergreen

// This one is required for XUL Runner
pref("toolkit.defaultChromeURI", "chrome://evergreen/content/main/main.xul");

// This one just makes things speedier.  We use a lot of XMLHttpRequest
pref("network.http.max-persistent-connections-per-server",8);

// This stops the unresponsive script warning, but the code is still too slow for some reason.
// However, it's better than POEM, which I wasted a day on :)
pref("dom.max_script_run_time",60);

pref("javascript.options.strict",false);
pref("javascript.options.showInConsole",true);

// This lets remote xul access link to local chrome
pref("security.checkloaduri", false);
pref("signed.applets.codebase_principal_support", true);

//user_pref("capability.principal.codebase.p0.granted", "UniversalXPConnect");
//user_pref("capability.principal.codebase.p0.id", "http://gapines.org");

