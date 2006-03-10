dump('entering auth/controller.js\n');

if (typeof auth == 'undefined') auth = {};
auth.controller = function (params) {
	JSAN.use('util.error'); this.error = new util.error();
	this.w = params.window;

	return this;
};

auth.controller.prototype = {

	'init' : function () {

		var obj = this;  // so the 'this' in event handlers don't confuse us
		var w = obj.w;

		JSAN.use('OpenILS.data');
		obj.data = new OpenILS.data(); obj.data.init({'via':'stash'});

		// MVC
		JSAN.use('util.controller'); obj.controller = new util.controller();
		obj.controller.init(
			{
				'control_map' : {
					'cmd_login' : [
						['command'],
						function() {
							obj.login();
						}
					],
					'cmd_override' : [
						['command'],
						function() {
							obj.override();
						}
					],
					'cmd_logoff' : [
						['command'],
						function() {
							obj.logoff()
						}
					],
					'cmd_close_window' : [
						['command'],
						function() {
							obj.close()
						}
					],

					'server_prompt' : [
						['keypress'],
						handle_keypress
					],
					'name_prompt' : [
						['keypress'],
						handle_keypress
					],
					'password_prompt' : [
						['keypress'],
						handle_keypress
					],
					'submit_button' : [
						['render'],
						function(e) { return function() {} }
					],
					'progress_bar' : [
						['render'],
						function(e) { return function() {} }
					],
					'status' : [
						['render'],
						function(e) { return function() {
						} }
					],
					'ws_deck' : [
						['render'],
						function(e) { return function() {
							try {
								JSAN.use('util.widgets'); util.widgets.remove_children(e);
								var x = document.createElement('description');
								e.appendChild(x);
								if (obj.data.ws_info 
									&& obj.data.ws_info[ obj.controller.view.server_prompt.value ]) {
									var ws = obj.data.ws_info[ obj.controller.view.server_prompt.value ];
									x.appendChild(
										document.createTextNode(
											ws.name + ' @  ' + ws.lib_shortname
										)
									);
								} else {
									x.appendChild(
										document.createTextNode(
											'Not yet configured for the specified server.'
										)
									);
								}
							} catch(E) {
								alert(E);
							}
						} }
					],
					'menu_spot' : [
						['render'],
						function(e) { return function() {
						} }
					],

				}
			}
		);
		obj.controller.view.name_prompt.focus();

		function handle_keypress(ev) {
			try {
				if (ev.keyCode && ev.keyCode == 13) {
					switch(this) {
						case obj.controller.view.server_prompt:
							ev.preventDefault();
							obj.controller.view.name_prompt.focus(); obj.controller.view.name_prompt.select();
						break;
						case obj.controller.view.name_prompt:
							ev.preventDefault();
							obj.controller.view.password_prompt.focus(); obj.controller.view.password_prompt.select();
						break;
						case obj.controller.view.password_prompt:
							ev.preventDefault();
							obj.controller.view.submit_button.focus(); 
							obj.login();
						break;
						default: break;
					}
				}
			} catch(E) {
				alert(E);
			}
		}

		obj.controller.view.server_prompt.addEventListener(
			'change',
			function (ev) { 
				obj.controller.render('ws_deck'); 
				obj.test_server(ev.target.value);
			},
			false
		);

		// This talks to our ILS
		JSAN.use('auth.session');
		obj.session = new auth.session(obj.controller.view);

		obj.controller.render();
		obj.test_server( obj.controller.view.server_prompt.value );

		if (typeof this.on_init == 'function') {
			this.error.sdump('D_AUTH','auth.controller.on_init()\n');
			this.on_init();
		}
	},

	'test_server' : function(url) {
		var obj = this;
		var s = document.getElementById('status');
		s.setAttribute('value','Testing hostname...');
		s.setAttribute('style','color: orange;');
		if (!url) {
			s.setAttribute('value','Please enter a server hostname.');
			s.setAttribute('style','color: red;');
			return;
		}
		try {
			if ( ! url.match(/^http:\/\//) ) url = 'http://' + url;
			var x = new XMLHttpRequest();
			dump('server url = ' + url + '\n');
			x.open("GET",url,true);
			x.onreadystatechange = function() {
				try {
					if (x.readyState != 4) return;
					s.setAttribute('value',x.status + ' : ' + x.statusText);
					if (x.status == 200) {
						s.setAttribute('style','color: green;');
					} else {
						s.setAttribute('style','color: red;');
					}
					obj.test_version(url);
				} catch(E) {
					s.setAttribute('value','There was an error testing this hostname.');
					s.setAttribute('style','color: red;');
					obj.error.sdump('D_ERROR',E);
				}
			}
			x.send(null);
		} catch(E) {
			s.setAttribute('value','There was an error testing this hostname.');
			s.setAttribute('style','color: brown;');
			obj.error.sdump('D_ERROR',E);
		}
	},

	'test_version' : function(url) {
		var obj = this;
		var s = document.getElementById('version');
		s.setAttribute('value','Testing version...');
		s.setAttribute('style','color: orange;');
		try {
			var x = new XMLHttpRequest();
			url = url + '/xul/server/';
			dump('version url = ' + url + '\n');
			x.open("GET",url,true);
			x.onreadystatechange = function() {
				try {
					if (x.readyState != 4) return;
					s.setAttribute('value',x.status + ' : ' + x.statusText);
					if (x.status == 200) {
						s.setAttribute('style','color: green;');
					} else {
						s.setAttribute('style','color: red;');
					}
				} catch(E) {
					s.setAttribute('value','There was an error checking version support.');
					s.setAttribute('style','color: red;');
					obj.error.sdump('D_ERROR',E);
				}
			}
			x.send(null);
		} catch(E) {
			s.setAttribute('value','There was an error checking version support.');
			s.setAttribute('style','color: brown;');
			obj.error.sdump('D_ERROR',E);
		}
	},

	'login' : function() { 

		var obj = this;

		this.error.sdump('D_AUTH','login with ' 
			+ this.controller.view.name_prompt.value + ' and ' 
			+ this.controller.view.password_prompt.value + ' at ' 
			+ this.controller.view.server_prompt.value + '\n'
		); 
		this.controller.view.server_prompt.disabled = true;
		this.controller.view.name_prompt.disabled = true;
		this.controller.view.password_prompt.disabled = true;
		this.controller.view.submit_button.disabled = true;
		XML_HTTP_SERVER = this.controller.view.server_prompt.value;

		try {

			if (typeof this.on_login == 'function') {
				this.error.sdump('D_AUTH','auth.controller.session.on_init = ' +
					'auth.controller.on_login\n');
				this.session.on_init = this.on_login;
				this.session.on_error = function() { obj.logoff(); };
			}
			
			this.session.init();

		} catch(E) {
			var error = '!! ' + E + '\n';
			this.error.sdump('D_ERROR',error); 
			alert(error);
			this.logoff();
			if (E == 'open-ils.auth.authenticate.init returned false\n') {
				this.controller.view.server_prompt.focus();
				this.controller.view.server_prompt.select();
			}

			if (typeof this.on_login_error == 'function') {
				this.error.sdump('D_AUTH','auth.controller.on_login_error()\n');
				this.on_login_error(E);
			}
		}

	},

	'logoff' : function() { 
	
		this.error.sdump('D_AUTH','logoff' + this.w + '\n'); 
		this.controller.view.progress_bar.value = 0; 
		this.controller.view.progress_bar.setAttribute('real','0.0');
		this.controller.view.submit_button.disabled = false;
		this.controller.view.password_prompt.disabled = false;
		this.controller.view.password_prompt.value = '';
		this.controller.view.name_prompt.disabled = false;
		this.controller.view.name_prompt.focus(); 
		this.controller.view.name_prompt.select();
		this.controller.view.server_prompt.disabled = false;

		var windowManager = Components.classes["@mozilla.org/appshell/window-mediator;1"].getService();
		var windowManagerInterface = windowManager.QueryInterface(Components.interfaces.nsIWindowMediator);
		var enumerator = windowManagerInterface.getEnumerator(null);

		var w; // close all other windows
		while ( w = enumerator.getNext() ) {
			if (w != window) w.close();
		}

		this.controller.render('ws_deck');

		this.session.close();

		if (typeof this.on_logoff == 'function') {
			this.error.sdump('D_AUTH','auth.controller.on_logoff()\n');
			this.on_logoff();
		}
		
	},
	'close' : function() { 
	
		this.error.sdump('D_AUTH','close' + this.w + '\n');
		this.logoff();
		//Basically, we want to close all the windows for this application (and in case we're running this as
		//a firefox extension, we don't want to merely shutdown mozilla).  I'll probably create an XPCOM for
		//tracking the windows.
		//for (var w in this.G.window.appshell_list) {
		//	this.G.window.appshell_list[w].close();
		//}
		this.w.close(); /* Probably won't go any further */

		if (typeof this.on_close == 'function') {
			this.error.sdump('D_AUTH','auth.controller.on_close()\n');
			this.on_close();
		}
		
	}
}

dump('exiting auth/controller.js\n');
