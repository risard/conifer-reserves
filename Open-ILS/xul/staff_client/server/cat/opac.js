dump('entering cat.opac.js\n');

if (typeof patron == 'undefined') patron = {};
cat.opac = function (params) {

	JSAN.use('util.error'); this.error = new util.error();
}

cat.opac.prototype = {

	'init' : function( params ) {

		netscape.security.PrivilegeManager.enablePrivilege("UniversalXPConnect");

		var obj = this;

		obj.session = params['session'];
		obj.url = params['url'];

		JSAN.use('main.controller'); obj.controller = new main.controller();
		obj.controller.init(
			{
				control_map : {
					'cmd_broken' : [
						['command'],
						function() { alert('Not Yet Implemented'); }
					],
				}
			}
		);
		obj.controller.view.opac_browser = document.getElementById('opac_browser');

		obj.buildProgressListener();
		obj.controller.view.opac_browser.addProgressListener(obj.progressListener,
		                Components.interfaces.nsIWebProgress.NOTIFY_ALL );

		obj.controller.view.opac_browser.setAttribute('src',obj.url);

	},

	'push_variables' : function() {

		netscape.security.PrivilegeManager.enablePrivilege("UniversalXPConnect");

		obj.controller.view.opac_browser.contentWindow.IAMXUL = true;

		if (window.xulG) obj.controller.view.opac_browser.contentWindow.xulG = xulG;
	},
	
	'buildProgressListener' : function() {

		netscape.security.PrivilegeManager.enablePrivilege("UniversalXPConnect");

		var obj = this;
		obj.progressListener = {
			onProgressChange	: function(){},
			onLocationChange	: function(){},
			onStatusChange		: function(){},
			onSecurityChange	: function(){},
			onStateChange 		: function ( webProgress, request, stateFlags, status) {
				var s = '';
				const nsIWebProgressListener = Components.interfaces.nsIWebProgressListener;
				const nsIChannel = Components.interfaces.nsIChannel;
				if (stateFlags == 65540 || stateFlags == 65537 || stateFlags == 65552) { return; }
				s = ('onStateChange: stateFlags = ' + stateFlags + ' status = ' + status + '\n');
				if (stateFlags & nsIWebProgressListener.STATE_IS_REQUEST) {
					s += ('\tSTATE_IS_REQUEST\n');
				}
				if (stateFlags & nsIWebProgressListener.STATE_IS_DOCUMENT) {
					s += ('\tSTATE_IS_DOCUMENT\n');
					if( stateFlags & nsIWebProgressListener.STATE_STOP ) obj.push_variables(); 
				}
				if (stateFlags & nsIWebProgressListener.STATE_IS_NETWORK) {
					s += ('\tSTATE_IS_NETWORK\n');
				}
				if (stateFlags & nsIWebProgressListener.STATE_IS_WINDOW) {
					s += ('\tSTATE_IS_WINDOW\n');
				}
				if (stateFlags & nsIWebProgressListener.STATE_START) {
					s += ('\tSTATE_START\n');
				}
				if (stateFlags & nsIWebProgressListener.STATE_REDIRECTING) {
					s += ('\tSTATE_REDIRECTING\n');
				}
				if (stateFlags & nsIWebProgressListener.STATE_TRANSFERING) {
					s += ('\tSTATE_TRANSFERING\n');
				}
				if (stateFlags & nsIWebProgressListener.STATE_NEGOTIATING) {
					s += ('\tSTATE_NEGOTIATING\n');
				}
				if (stateFlags & nsIWebProgressListener.STATE_STOP) {
					s += ('\tSTATE_STOP\n');
				}
				obj.error.sdump('D_OPAC',s);	
			}
		}
		obj.progressListener.QueryInterface = function(){return this;};
	},
}

dump('exiting cat.opac.js\n');
