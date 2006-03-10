dump('entering circ.in_house_use.js\n');

if (typeof circ == 'undefined') circ = {};
circ.in_house_use = function (params) {

	JSAN.use('util.error'); this.error = new util.error();
	JSAN.use('util.network'); this.network = new util.network();
	JSAN.use('util.date');
	JSAN.use('OpenILS.data'); this.data = new OpenILS.data(); this.data.init({'via':'stash'});
}

circ.in_house_use.prototype = {

	'init' : function( params ) {

		var obj = this;

		obj.session = params['session'];

		JSAN.use('circ.util');
		var columns = circ.util.columns( 
			{ 
				'barcode' : { 'hidden' : false },
				'title' : { 'hidden' : false },
				'status' : { 'hidden' : false },
				'location' : { 'hidden' : false },
				'call_number' : { 'hidden' : false },
				'checkin_text' : { 'hidden' : false, 'flex' : 3 }
			} 
		);

		JSAN.use('util.list'); obj.list = new util.list('in_house_use_list');
		obj.list.init(
			{
				'columns' : columns,
				'map_row_to_column' : circ.util.std_map_row_to_column(),
			}
		);
		
		JSAN.use('util.controller'); obj.controller = new util.controller();
		obj.controller.init(
			{
				'control_map' : {
					'in_house_use_barcode_entry_textbox' : [
						['keypress'],
						function(ev) {
							if (ev.keyCode && ev.keyCode == 13) {
								obj.in_house_use();
							}
						}
					],
					'in_house_use_multiplier_label' : [
						['render'],
						function(e) {
							return function() {
								obj.controller.view.in_house_use_multiplier_textbox.select();
								obj.controller.view.in_house_use_multiplier_textbox.value = 1;
							};
						}
					],
					'in_house_use_multiplier_textbox' : [
						['change'],
						function(ev) {
							if (ev.target.nodeName == 'textbox') {
								try {
									if (ev.target.value > 0) {
										/* good value */
									} else {
										ev.target.value = 1;
									}
								} catch(E) {
									dump('in_house_use:multiplier: ' + E + '\n');
									ev.target.value = 1;
								}
							}
						}
					],
					'cmd_broken' : [
						['command'],
						function() { alert('Not Yet Implemented'); }
					],
					'cmd_in_house_use_submit_barcode' : [
						['command'],
						function() {
							obj.in_house_use();
						}
					],
					'cmd_in_house_use_print' : [
						['command'],
						function() {
						}
					],
					'cmd_in_house_use_reprint' : [
						['command'],
						function() {
						}
					],
					'cmd_in_house_use_done' : [
						['command'],
						function() {
						}
					],
				}
			}
		);
		this.controller.render();
		this.controller.view.in_house_use_barcode_entry_textbox.focus();

	},

	'in_house_use' : function() {
		var obj = this;
		try {
			var barcode = obj.controller.view.in_house_use_barcode_entry_textbox.value;
			var multiplier = obj.controller.view.in_house_use_multiplier_textbox.value;
			JSAN.use('circ.util');

			var copy = obj.network.simple_request('FM_ACP_RETRIEVE_VIA_BARCODE',[ barcode ]); 
			var mods = obj.network.simple_request('MODS_SLIM_RECORD_RETRIEVE_VIA_COPY',[ copy.id() ]);
			var result = obj.network.simple_request('FM_AIHU_CREATE',
				[ obj.session, { 'copyid' : copy.id(), 'location' : obj.data.list.au[0].ws_ou(), 'count' : multiplier } ]
			);

			obj.list.append(
				{
					'row' : {
						'my' : {
							'mvr' : mods,
							'acp' : copy,
							'text' : result.length + ' uses',
						}
					}
				//I could override map_row_to_column here
				}
			);
			if (typeof obj.on_in_house_use == 'function') {
				obj.on_in_house_use(result);
			}
			if (typeof window.xulG == 'object' && typeof window.xulG.on_in_house_use == 'function') {
				obj.error.sdump('D_CIRC','circ.in_house_use: Calling external .on_in_house_use()\n');
				window.xulG.on_in_house_use(result);
			} else {
				obj.error.sdump('D_CIRC','circ.in_house_use: No external .on_in_house_use()\n');
			}

		} catch(E) {
			alert('FIXME: need special alert and error handling\n'
				+ js2JSON(E));
			if (typeof obj.on_failure == 'function') {
				obj.on_failure(E);
			}
			if (typeof window.xulG == 'object' && typeof window.xulG.on_failure == 'function') {
				obj.error.sdump('D_CIRC','circ.in_house_use: Calling external .on_failure()\n');
				window.xulG.on_failure(E);
			} else {
				obj.error.sdump('D_CIRC','circ.in_house_use: No external .on_failure()\n');
			}
		}

	},

	'on_in_house_use' : function() {
		this.controller.view.in_house_use_multiplier_textbox.select();
		this.controller.view.in_house_use_multiplier_textbox.value = '1';
		this.controller.view.in_house_use_barcode_entry_textbox.value = '';
		this.controller.view.in_house_use_barcode_entry_textbox.focus();
	},

	'on_failure' : function() {
		this.controller.view.in_house_use_barcode_entry_textbox.select();
		this.controller.view.in_house_use_barcode_entry_textbox.focus();
	}
}

dump('exiting circ.in_house_use.js\n');
