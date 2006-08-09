dump('entering patron/display.js\n');

if (typeof patron == 'undefined') patron = {};
patron.display = function (params) {

	JSAN.use('util.error'); this.error = new util.error();
	JSAN.use('util.window'); this.window = new util.window();
	JSAN.use('util.network'); this.network = new util.network();
	this.w = window;
}

patron.display.prototype = {

	'retrieve_ids' : [],
	'stop_checkouts' : false,
	'check_stop_checkouts' : function() { return this.stop_checkouts; },

	'init' : function( params ) {

		var obj = this;

		obj.barcode = params['barcode'];
		obj.id = params['id'];

		JSAN.use('OpenILS.data'); this.OpenILS = {}; 
		obj.OpenILS.data = new OpenILS.data(); obj.OpenILS.data.init({'via':'stash'});

		JSAN.use('util.deck'); 
		obj.right_deck = new util.deck('patron_right_deck');
		obj.left_deck = new util.deck('patron_left_deck');

		function spawn_checkout_interface() {
			var frame = obj.right_deck.set_iframe(
				urls.XUL_CHECKOUT,
				{},
				{ 
					'set_tab' : xulG.set_tab,
					'patron_id' : obj.patron.id(),
					'check_stop_checkouts' : function() { return obj.check_stop_checkouts(); },
					'on_list_change' : function(checkout) {
					
						/* this stops noncats from getting pushed into Items Out */
						if (!checkout.circ.id()) return; 

						netscape.security.PrivilegeManager.enablePrivilege("UniversalXPConnect");
						obj.summary_window.g.summary.controller.render('patron_checkouts');
						obj.summary_window.g.summary.controller.render('patron_standing');
						if (obj.items_window) {
							obj.items_window.g.items.list.append(
								{
									'row' : {
										'my' : {
											'circ_id' : checkout.circ.id(),
										}
									}
								}
							)
						}
					}
				}
			);
			netscape.security.PrivilegeManager.enablePrivilege("UniversalXPConnect");
			obj.checkout_window = frame.contentWindow;
		}

		JSAN.use('util.controller'); obj.controller = new util.controller();
		obj.controller.init(
			{
				control_map : {
					'cmd_broken' : [
						['command'],
						function() { alert('Not Yet Implemented'); }
					],
					'cmd_patron_retrieve' : [
						['command'],
						function(ev) {
							if (typeof window.xulG == 'object' && typeof window.xulG.new_tab == 'function') {
								for (var i = 0; i < obj.retrieve_ids.length; i++) {	
									try {
										var url = urls.XUL_PATRON_DISPLAY 
											+ '?id=' + window.escape( obj.retrieve_ids[i] );
										window.xulG.new_tab(
											url
										);
									} catch(E) {
										alert(E);
									}
								}
							}
						}
					],
					'cmd_search_form' : [
						['command'],
						function(ev) {
							obj.controller.view.cmd_search_form.setAttribute('disabled','true');
							obj.left_deck.node.selectedIndex = 0;
							obj.controller.view.patron_name.setAttribute('value','No Patron Selected');
							removeCSSClass(document.documentElement,'PATRON_HAS_BILLS');
							removeCSSClass(document.documentElement,'PATRON_HAS_OVERDUES');
							removeCSSClass(document.documentElement,'PATRON_HAS_NOTES');
							removeCSSClass(document.documentElement,'NO_PENALTIES');
							removeCSSClass(document.documentElement,'ONE_PENALTY');
							removeCSSClass(document.documentElement,'MULTIPLE_PENALTIES');
							removeCSSClass(document.documentElement,'PATRON_HAS_ALERT');
							removeCSSClass(document.documentElement,'PATRON_BARRED');
							removeCSSClass(document.documentElement,'PATRON_INACTIVE');
							removeCSSClass(document.documentElement,'PATRON_EXPIRED');
							removeCSSClass(document.documentElement,'PATRON_HAS_INVALID_DOB');
							removeCSSClass(document.documentElement,'PATRON_AGE_GE_65');
							removeCSSClass(document.documentElement,'PATRON_AGE_LE_65');
							removeCSSClass(document.documentElement,'PATRON_AGE_GE_24');
							removeCSSClass(document.documentElement,'PATRON_AGE_LE_24');
							removeCSSClass(document.documentElement,'PATRON_AGE_GE_21');
							removeCSSClass(document.documentElement,'PATRON_AGE_LE_21');
							removeCSSClass(document.documentElement,'PATRON_AGE_GE_18');
							removeCSSClass(document.documentElement,'PATRON_AGE_LE_18');
							removeCSSClass(document.documentElement,'PATRON_AGE_GE_13');
							removeCSSClass(document.documentElement,'PATRON_AGE_LE_13');
						}
					],
					'cmd_patron_refresh' : [
						['command'],
						function(ev) {
							obj.refresh_all();
						}
					],
					'cmd_patron_checkout' : [
						['command'],
						spawn_checkout_interface
					],
					'cmd_patron_items' : [
						['command'],
						function(ev) {
							var frame = obj.right_deck.set_iframe(
								urls.XUL_PATRON_ITEMS
								+ '?patron_id=' + window.escape( obj.patron.id() ),
								{},
								{
									'on_list_change' : function(b) {
										netscape.security.PrivilegeManager.enablePrivilege("UniversalXPConnect");
										obj.summary_window.g.summary.controller.render('patron_checkouts');
										obj.summary_window.g.summary.controller.render('patron_standing');
										obj.summary_window.g.summary.controller.render('patron_bill');
										obj.bill_window.g.bills.refresh(true);
									},
									'url_prefix' : xulG.url_prefix,
									'new_tab' : xulG.new_tab,
								}
							);
							netscape.security.PrivilegeManager.enablePrivilege("UniversalXPConnect");
							obj.items_window = frame.contentWindow;
						}
					],
					'cmd_patron_edit' : [
						['command'],
						function(ev) {

								function spawn_search(s) {
									obj.error.sdump('D_TRACE', 'Editor would like to search for: ' + js2JSON(s) ); 
									obj.data.stash_retrieve();
									var loc = xulG.url_prefix(urls.XUL_PATRON_DISPLAY);
									loc += '?doit=1&query=' + window.escape(js2JSON(s));
									xulG.new_tab( loc, {}, {} );
								}

								function spawn_editor(p) {
									var url = urls.XUL_PATRON_EDIT;
									var param_count = 0;
									for (var i in p) {
										if (param_count++ == 0) url += '?'; else url += '&';
										url += i + '=' + window.escape(p[i]);
									}
									var loc = xulG.url_prefix( urls.XUL_REMOTE_BROWSER ) + '?url=' + window.escape( url );
									xulG.new_tab(
										loc, 
										{}, 
										{ 
											'show_print_button' : true , 
											'tab_name' : 'Editing Related Patron' ,
											'passthru_content_params' : {
												'spawn_search' : spawn_search,
												'spawn_editor' : spawn_editor,
												'url_prefix' : xulG.url_prefix,
												'new_tab' : xulG.new_tab,
											}
										}
									);
								}

							obj.right_deck.set_iframe(
								urls.XUL_REMOTE_BROWSER
								+ '?url=' + window.escape( 
									urls.XUL_PATRON_EDIT
									+ '?ses=' + window.escape( ses() )
									+ '&usr=' + window.escape( obj.patron.id() )
								),
								{}, {
									'show_print_button' : true,
									'passthru_content_params' : {
										'on_save' : function(p) {
											try {
												netscape.security.PrivilegeManager.enablePrivilege("UniversalXPConnect");
												obj.summary_window.g.summary.retrieve();
											} catch(E) {
												alert(E);
											}
										},
										'spawn_search' : spawn_search,
										'spawn_editor' : spawn_editor,
										'url_prefix' : xulG.url_prefix,
										'new_tab' : xulG.new_tab,
									}
								}
							);
						}
					],
					'cmd_patron_info' : [
						['command'],
						function(ev) {
							obj.right_deck.set_iframe(
								urls.XUL_PATRON_INFO + '?patron_id=' + window.escape( obj.patron.id() ),
								{},
								{
									'url_prefix' : xulG.url_prefix,
									'new_tab' : xulG.new_tab,
								}
							);
						}
					],
					'cmd_patron_holds' : [
						['command'],
						function(ev) {
							obj.right_deck.set_iframe(
								urls.XUL_PATRON_HOLDS	
								+ '?patron_id=' + window.escape( obj.patron.id() ),
								{},
								{
									'on_list_change' : function(h) {
										netscape.security.PrivilegeManager.enablePrivilege("UniversalXPConnect");
										obj.summary_window.g.summary.controller.render('patron_holds');
										obj.summary_window.g.summary.controller.render('patron_standing');
									},
									'url_prefix' : xulG.url_prefix,
									'new_tab' : xulG.new_tab,
								}
							);
						}
					],
					'cmd_patron_bills' : [
						['command'],
						function(ev) {
							var f = obj.right_deck.set_iframe(
								urls.XUL_PATRON_BILLS
								+ '?patron_id=' + window.escape( obj.patron.id() ),
								{},
								{
									'on_money_change' : function(b) {
										//alert('test');
										netscape.security.PrivilegeManager.enablePrivilege("UniversalXPConnect");
										obj.summary_window.g.summary.retrieve(true);
										obj.items_window.g.items.retrieve(true);
									}
								}
							);
							netscape.security.PrivilegeManager.enablePrivilege("UniversalXPConnect");
							obj.bill_window = f.contentWindow;
						}
					],
					'patron_name' : [
						['render'],
						function(e) {
							return function() { 
								e.setAttribute('value',
									obj.patron.family_name() + ', ' + obj.patron.first_given_name() + ' ' +
									( obj.patron.second_given_name() ? obj.patron.second_given_name() : '' )
								);
								JSAN.use('patron.util'); patron.util.set_penalty_css(obj.patron);
							};
						}
					],
					'PatronNavBar' : [
						['render'],
						function(e) {
							return function() {}
						}
					],
				}
			}
		);

		if (obj.barcode || obj.id) {
			if (typeof window.xulG == 'object' && typeof window.xulG.set_tab_name == 'function') {
				try { window.xulG.set_tab_name('Retrieving Patron...'); } catch(E) { alert(E); }
			}

			obj.controller.view.PatronNavBar.selectedIndex = 1;
			JSAN.use('util.widgets'); 
			util.widgets.enable_accesskeys_in_node_and_children(
				obj.controller.view.PatronNavBar.lastChild
			);
			util.widgets.disable_accesskeys_in_node_and_children(
				obj.controller.view.PatronNavBar.firstChild
			);
			obj.controller.view.cmd_patron_refresh.setAttribute('disabled','true');
			obj.controller.view.cmd_patron_checkout.setAttribute('disabled','true');
			obj.controller.view.cmd_patron_items.setAttribute('disabled','true');
			obj.controller.view.cmd_patron_holds.setAttribute('disabled','true');
			obj.controller.view.cmd_patron_bills.setAttribute('disabled','true');
			obj.controller.view.cmd_patron_edit.setAttribute('disabled','true');
			obj.controller.view.cmd_patron_info.setAttribute('disabled','true');
			obj.controller.view.patron_name.setAttribute('value','Retrieving...');
			document.documentElement.setAttribute('class','');
			var frame = obj.left_deck.set_iframe(
				urls.XUL_PATRON_SUMMARY
				+'?barcode=' + window.escape(obj.barcode) 
				+'&id=' + window.escape(obj.id), 
				{},
				{
					'on_finished' : function(patron) {

						obj.patron = patron; obj.controller.render();

						obj.controller.view.cmd_patron_refresh.setAttribute('disabled','false');
						obj.controller.view.cmd_patron_checkout.setAttribute('disabled','false');
						obj.controller.view.cmd_patron_items.setAttribute('disabled','false');
						obj.controller.view.cmd_patron_holds.setAttribute('disabled','false');
						obj.controller.view.cmd_patron_bills.setAttribute('disabled','false');
						obj.controller.view.cmd_patron_edit.setAttribute('disabled','false');
						obj.controller.view.cmd_patron_info.setAttribute('disabled','false');

						if (typeof window.xulG == 'object' && typeof window.xulG.set_tab_name == 'function') {
							try { 
								window.xulG.set_tab_name(
									'Patron: ' + patron.family_name() + ', ' + patron.first_given_name() + ' ' 
										+ (patron.second_given_name() ? patron.second_given_name() : '' ) 
								); 
							} catch(E) { 
								obj.error.sdump('D_ERROR',E);
							}
						}

						if (!obj._checkout_spawned) {
							spawn_checkout_interface();
							obj._checkout_spawned = true;
						}

						obj.network.simple_request(
							'FM_AHR_COUNT_RETRIEVE',
							[ ses(), patron.id() ],
							function(req) {
								try {
									var msg = ''; obj.stop_checkouts = false;
									if (patron.alert_message()) msg += '"' + patron.alert_message() + '"\n';
									//alert('obj.barcode = ' + obj.barcode);
									if (obj.barcode) {
										if (patron.cards()) for (var i = 0; i < patron.cards().length; i++) {
											//alert('card #'+i+' == ' + js2JSON(patron.cards()[i]));
											if ( (patron.cards()[i].barcode()==obj.barcode) && ( ! get_bool(patron.cards()[i].active()) ) ) {
												msg += 'Patron retrieved with an INACTIVE barcode.\n';
												obj.stop_checkouts = true;
											}
										}
									}
									if (get_bool(patron.barred())) {
										msg += 'Patron is BARRED.\n';
										obj.stop_checkouts = true;
									}
									if (!get_bool(patron.active())) {
										msg += 'Patron is INACTIVE.\n';
										obj.stop_checkouts = true;
									}
									if (patron.expire_date()) {
										var now = new Date();
										now = now.getTime()/1000;

										var expire_parts = patron.expire_date().substr(0,10).split('-');
										expire_parts[1] = expire_parts[1] - 1;

										var expire = new Date();
										expire.setFullYear(expire_parts[0], expire_parts[1], expire_parts[2]);
										expire = expire.getTime()/1000

										if (expire < now) {
											msg += 'Patron is EXPIRED.\n';
										obj.stop_checkouts = true;
										}
									}
									var holds = req.getResultObject();
									if (holds.ready && holds.ready > 0) msg += 'Holds available: ' + holds.ready;
									if (obj.stop_checkouts && obj.checkout_window) {
										setTimeout( function() {
											try {
											if (
												obj.checkout_window &&
												obj.checkout_window.g &&
												obj.checkout_window.g.checkout &&
												typeof obj.checkout_window.g.check_disable == 'function') {
													obj.checkout_window.g.checkout.check_disable();
												}
											} catch(E) {
												alert(E);
											}
										}, 0);
									}
									if (msg) {
										obj.error.yns_alert(msg,'Alert Message','OK',null,null,'Check here to confirm this message.');
									}
								} catch(E) {
									obj.error.standard_unexpected_error_alert('Error showing patron alert and holds availability.',E);
								}
							}
						);

					},
					'on_error' : function(E) {
						try {
							var error;
							if (typeof E.ilsevent != 'undefined') {
								error = E.textcode;
							} else {
								error = js2JSON(E).substr(0,100);
							}
							location.href = urls.XUL_PATRON_BARCODE_ENTRY + '?error=' + window.escape(error);
						} catch(F) {
							alert(F);
						}
					}
				}
			);
			netscape.security.PrivilegeManager.enablePrivilege("UniversalXPConnect");
			obj.summary_window = frame.contentWindow;
		} else {
			if (typeof window.xulG == 'object' && typeof window.xulG.set_tab_name == 'function') {
				try { window.xulG.set_tab_name('Patron Search'); } catch(E) { alert(E); }
			}

			obj.controller.view.PatronNavBar.selectedIndex = 0;
			JSAN.use('util.widgets'); 
			util.widgets.enable_accesskeys_in_node_and_children(
				obj.controller.view.PatronNavBar.firstChild
			);
			util.widgets.disable_accesskeys_in_node_and_children(
				obj.controller.view.PatronNavBar.lastChild
			);
			obj.controller.view.cmd_patron_retrieve.setAttribute('disabled','true');
			obj.controller.view.cmd_search_form.setAttribute('disabled','true');

			var loc = urls.XUL_PATRON_SEARCH_FORM + '?blah=blah';
			if (params['query']) {
				var query = JSON2js(params['query']);
				for (var i in query) {
					loc += '&'+window.escape(i)+'='+window.escape(query[i].value);
				}
				if (params.doit) {
					loc += '&doit=1';
				}
			}
			var form_frame = obj.left_deck.set_iframe(
				loc,
				{},
				{
					'on_submit' : function(query) {
						obj.controller.view.cmd_patron_retrieve.setAttribute('disabled','true');
						var list_frame = obj.right_deck.reset_iframe(
							urls.XUL_PATRON_SEARCH_RESULT + '?' + query,
							{},
							{
								'on_select' : function(list) {
									if (!list) return;
									if (list.length < 1) return;
									obj.controller.view.cmd_patron_retrieve.setAttribute('disabled','false');
									obj.controller.view.cmd_search_form.setAttribute('disabled','false');
									obj.retrieve_ids = list;
									obj.controller.view.patron_name.setAttribute('value','Retrieving...');
									document.documentElement.setAttribute('class','');
									setTimeout(
										function() {
											var frame = obj.left_deck.set_iframe(
												urls.XUL_PATRON_SUMMARY
													+'?id=' + window.escape(list[0]), 
													{},
													{
														'on_finished' : function(patron) {
															obj.patron = patron;
															obj.controller.render();
														}
													}
											);
											netscape.security.PrivilegeManager.enablePrivilege(
												"UniversalXPConnect"
											);
											obj.summary_window = frame.contentWindow;
											obj.patron = obj.summary_window.g.summary.patron;
											obj.controller.render('patron_name');
										}, 0
									);
								}
							}
						);
						netscape.security.PrivilegeManager.enablePrivilege("UniversalXPConnect");
						obj.search_result = list_frame.contentWindow;
					}
				}
			);
			netscape.security.PrivilegeManager.enablePrivilege("UniversalXPConnect");
			obj.search_window = form_frame.contentWindow;
			obj._checkout_spawned = true;
		}
	},

	'_checkout_spawned' : false,

	'refresh_deck' : function(url) {
		var obj = this;
		netscape.security.PrivilegeManager.enablePrivilege("UniversalXPConnect");
		for (var i = 0; i < obj.right_deck.node.childNodes.length; i++) {
			try {
				var f = obj.right_deck.node.childNodes[i];
				var w = f.contentWindow;
				if (url) {
					if (w.location.href == url) w.refresh(true);
				} else {
					if (typeof w.refresh == 'function') {
						w.refresh(true);
					}
				}

			} catch(E) {
				obj.error.sdump('D_ERROR','refresh_deck: ' + E + '\n');
			}
		}
	},
	
	'refresh_all' : function() {
		var obj = this;
		obj.controller.view.patron_name.setAttribute(
			'value','Retrieving...'
		);
		document.documentElement.setAttribute('class','');
		try { obj.summary_window.refresh(); } catch(E) { obj.error.sdump('D_ERROR', E + '\n'); }
		try { obj.refresh_deck(); } catch(E) { obj.error.sdump('D_ERROR', E + '\n'); }
	},
}

dump('exiting patron/display.js\n');
