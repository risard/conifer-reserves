dump('entering circ.hold_capture.js\n');

if (typeof circ == 'undefined') circ = {};
circ.hold_capture = function (params) {

	JSAN.use('util.error'); this.error = new util.error();
	JSAN.use('util.network'); this.network = new util.network();
	this.OpenILS = {}; JSAN.use('OpenILS.data'); this.OpenILS.data = new OpenILS.data(); this.OpenILS.data.init({'via':'stash'});
}

circ.hold_capture.prototype = {

	'init' : function( params ) {

		var obj = this;

		obj.session = params['session'];

		JSAN.use('circ.util');
		var columns = circ.util.columns( 
			{ 
				'barcode' : { 'hidden' : false },
				'title' : { 'hidden' : false },
				'status' : { 'hidden' : false },
				//'hold_capture_status' : { 'hidden' : false },
				'hold_capture_route_to' : { 'hidden' : false },
				'hold_capture_text' : { 'hidden' : false, 'flex' : 3 },
			} 
		);
		dump('columns = ' + js2JSON(columns) + '\n');

		JSAN.use('util.list'); obj.list = new util.list('hold_capture_list');
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
					'hold_capture_barcode_entry_textbox' : [
						['keypress'],
						function(ev) {
							if (ev.keyCode && ev.keyCode == 13) {
								obj.hold_capture();
							}
						}
					],
					'cmd_broken' : [
						['command'],
						function() { alert('Not Yet Implemented'); }
					],
					'cmd_hold_capture_submit_barcode' : [
						['command'],
						function() {
							obj.hold_capture();
						}
					],
					'cmd_hold_capture_print' : [
						['command'],
						function() {
						}
					],
					'cmd_hold_capture_reprint' : [
						['command'],
						function() {
						}
					],
					'cmd_hold_capture_done' : [
						['command'],
						function() {
						}
					],
				}
			}
		);
		this.controller.view.hold_capture_barcode_entry_textbox.focus();

	},

	'hold_capture' : function() {
		var obj = this;
		try {
			var barcode = obj.controller.view.hold_capture_barcode_entry_textbox.value;
			JSAN.use('circ.util');
			var hold_capture = circ.util.hold_capture_via_barcode(
				obj.session, barcode, true
			);
			if (hold_capture) {
				JSAN.use('patron.util');
				var au_obj = patron.util.retrieve_via_id( hold_capture.hold.usr() );
				obj.list.append(
					{
						'row' : {
							'my' : {
								'patron' : au_obj,
								'circ' : hold_capture.circ,
								'mvr' : hold_capture.record,
								'acp' : hold_capture.copy,
								'status' : hold_capture.status,
								'route_to' : hold_capture.route_to,
								'text' : hold_capture.text,
							}
						}
					//I could override map_row_to_column here
					}
				);
			
				alert('To Printer\n' + check.text + '\r\n' + 'Barcode: ' + barcode + '  Title: ' + check.record.title() + 
					'  Author: ' + check.record.author() + '\r\n' +
					'Route To: ' + check.route_to + 
					'  Patron: ' + au_obj.card().barcode() + ' ' + au_obj.family_name() + ', ' + au_obj.first_given_name() + 
					'\r\n'); //FIXME
				/*
				sPrint(check.text + '<br />\r\n' + 'Barcode: ' + barcode + '  Title: ' + check.record.title() + 
					'  Author: ' + check.record.author() + '<br />\r\n' +
					'Route To: ' + check.route_to + 
					'  Patron: ' + au_obj.card().barcode() + ' ' + au_obj.family_name() + ', ' + au_obj.first_given_name() + 
					'<br />\r\n'
				);
				*/

				if (typeof obj.on_hold_capture == 'function') {
					obj.on_hold_capture(hold_capture);
				}
				if (typeof window.xulG == 'object' && typeof window.xulG.on_hold_capture == 'function') {
					obj.error.sdump('D_CIRC','circ.hold_capture: Calling external .on_hold_capture()\n');
					window.xulG.on_hold_capture(hold_capture);
				} else {
					obj.error.sdump('D_CIRC','circ.hold_capture: No external .on_hold_capture()\n');
				}
			} else {
				throw("Could not capture hold.");
			}

		} catch(E) {
			alert('FIXME: need special alert and error handling\n'
				+ js2JSON(E));
			if (typeof obj.on_failure == 'function') {
				obj.on_failure(E);
			}
			if (typeof window.xulG == 'object' && typeof window.xulG.on_failure == 'function') {
				obj.error.sdump('D_CIRC','circ.hold_capture: Calling external .on_failure()\n');
				window.xulG.on_failure(E);
			} else {
				obj.error.sdump('D_CIRC','circ.hold_capture: No external .on_failure()\n');
			}
		}

	},

	'on_hold_capture' : function() {
		this.controller.view.hold_capture_barcode_entry_textbox.value = '';
		this.controller.view.hold_capture_barcode_entry_textbox.focus();
	},

	'on_failure' : function() {
		this.controller.view.hold_capture_barcode_entry_textbox.select();
		this.controller.view.hold_capture_barcode_entry_textbox.focus();
	}
}

dump('exiting circ.hold_capture.js\n');
