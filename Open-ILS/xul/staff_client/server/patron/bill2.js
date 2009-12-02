function my_init() {
    try {
        netscape.security.PrivilegeManager.enablePrivilege("UniversalXPConnect");
        if (typeof JSAN == 'undefined') { throw( $("commonStrings").getString('common.jsan.missing') ); }
        JSAN.errorLevel = "die"; // none, warn, or die
        JSAN.addRepository('/xul/server/');

        JSAN.use('util.error'); g.error = new util.error();
        JSAN.use('util.network'); g.network = new util.network();
        JSAN.use('util.date');
        JSAN.use('util.money');
        JSAN.use('patron.util');
        JSAN.use('OpenILS.data'); g.data = new OpenILS.data(); g.data.init({'via':'stash'});
        //g.data.temp = ''; g.data.stash('temp');

        g.error.sdump('D_TRACE','my_init() for bill2.xul');

        if (xul_param('current')) {
            $('caption').setAttribute('label',$("patronStrings").getString('staff.patron.bill_history.my_init.current_bills'));
            document.title = $("patronStrings").getString('staff.patron.bill_history.my_init.current_bills');
        } else {
            $('caption').setAttribute('label',$("patronStrings").getString('staff.patron.bill_history.my_init.bill_history'));
            document.title = $("patronStrings").getString('staff.patron.bill_history.my_init.bill_history');
        }

        g.funcs = []; g.bill_map = {}; g.row_map = {}; g.check_map = {};

        g.patron_id = xul_param('patron_id');

        init_lists();

        retrieve_mbts_for_list();

        event_listeners();

        JSAN.use('util.exec'); var exec = new util.exec(20); 
        exec.on_error = function(E) { alert(E); return true; }
        exec.timer(g.funcs,100);

        $('credit_forward').setAttribute('value','???');
        if (!g.patron) {
            g.network.simple_request(
                'FM_AU_FLESHED_RETRIEVE_VIA_ID.authoritative',
                [ ses(), g.patron_id ],
                function(req) {
                    try {
                        g.patron = req.getResultObject();
                        if (typeof g.patron.ilsevent != 'undefined') throw(g.patron);
                        $('credit_forward').setAttribute('value','$' + util.money.sanitize( g.patron.credit_forward_balance() ));
                    } catch(E) {
                        alert('Error in bill2.js, retrieve patron callback: ' + E);
                    }
                }
            );
        } else {
            $('credit_forward').setAttribute('value','$' + util.money.sanitize( g.patron.credit_forward_balance() ));
        }

        default_focus();

    } catch(E) {
        var err_msg = $("commonStrings").getFormattedString('common.exception', ['patron/bill2.xul', E]);
        try { g.error.sdump('D_ERROR',err_msg); } catch(E) { dump(err_msg); }
        alert(err_msg);
    }
}

function event_listeners() {
    try {
        $('details').addEventListener(
            'command',
            handle_details,
            false
        );

        $('add').addEventListener(
            'command',
            handle_add,
            false
        );

        $('payment').addEventListener(
            'change',
            function(ev) { distribute_payment(); },
            false
        );

        $('payment').addEventListener(
            'keypress',
            function(ev) {
                if (! (ev.keyCode == 13 /* enter */ || ev.keyCode == 77 /* mac enter */) ) { return; }
                distribute_payment();
                $('apply_payment_btn').focus();
            },
            false
        );

        $('bill_patron_btn').addEventListener(
            'command',
            function() {
                JSAN.use('util.window'); var win = new util.window();
                var my_xulG = win.open(
                    urls.XUL_PATRON_BILL_WIZARD,
                    'billwizard',
                    'chrome,resizable,modal',
                    { 'patron_id' : g.patron_id }
                );
                if (my_xulG.xact_id) { g.funcs.push( gen_list_append_func( my_xulG.xact_id ) ); /* FIXME: do something to update summary sidebar */ }
            },
            false
        );

        $('convert_change_to_credit').addEventListener(
            'command',
            function(ev) {
                if (ev.target.checked) {
                    addCSSClass( $('change_due'), 'change_to_credit' );
                } else {
                    removeCSSClass( $('change_due'), 'change_to_credit' );
                }
            },
            false
        );

    } catch(E) {
        alert('Error in bill2.js, event_listeners(): ' + E);
    }
}

function $(id) { return document.getElementById(id); }

function default_focus() {
    try { $('payment').focus(); } catch(E) { alert('Error in default_focus(): ' + E); }
}

function tally_pending() {
    try {
        var payments = [];
        JSAN.use('util.money');
        var tb = $('payment');
        var payment_tendered = util.money.dollars_float_to_cents_integer( tb.value );
        var payment_pending = 0;
        var retrieve_ids = g.bill_list.dump_retrieve_ids();
        for (var i = 0; i < retrieve_ids.length; i++) {
            var row_params = g.row_map[retrieve_ids[i]];
            if (g.check_map[retrieve_ids[i]]) { 
                var value = util.money.dollars_float_to_cents_integer( row_params.row.my.payment_pending );
                payment_pending += value;
                if (value != '0.00') { payments.push( [ retrieve_ids[i], value ] ); }
            }
        }
        var change_pending = payment_tendered - payment_pending;
        $('pending_payment').value = util.money.cents_as_dollars( payment_pending );
        $('pending_change').value = util.money.cents_as_dollars( change_pending );
        $('change_due').value = util.money.cents_as_dollars( change_pending );
        return { 'payments' : payments, 'change' : change_pending };
    } catch(E) {
        alert('Error in bill2.js, tally_pending(): ' + E);
    }
}

function tally_selected() {
    try {
        JSAN.use('util.money');
        var selected_billed = 0;
        var selected_paid = 0;
        var selected_balance = 0;

        for (var i = 0; i < g.bill_list_selection.length; i++) {
            var bill = g.bill_map[g.bill_list_selection[i]];
            if (!bill) {
                //$('checked_owed').setAttribute('value', '???');
                //$('checked_billed').setAttribute('value', '???');
                //$('checked_paid').setAttribute('value', '???');
                return;
            }
            var to = util.money.dollars_float_to_cents_integer( bill.transaction.total_owed() );
            var tp = util.money.dollars_float_to_cents_integer( bill.transaction.total_paid() );
            var bo = util.money.dollars_float_to_cents_integer( bill.transaction.balance_owed() );
            selected_billed += to;
            selected_paid += tp;
            selected_balance += bo;
        }
        //$('checked_billed').setAttribute('value', '$' + util.money.cents_as_dollars( selected_billed ) );
        //$('checked_paid').setAttribute('value', '$' + util.money.cents_as_dollars( selected_paid ) );
        //$('checked_owed').setAttribute('value', '$' + util.money.cents_as_dollars( selected_balance ) );
    } catch(E) {
        alert('Error in bill2.js, tally_selected(): ' + E);
    }
}

function tally_all() {
    try {
        JSAN.use('util.money');
        var checked_billed = 0;
        var checked_paid = 0;
        var checked_balance = 0;
        var total_billed = 0;
        var total_paid = 0;
        var total_balance = 0;
        var refunds_owed = 0;

        var retrieve_ids = g.bill_list.dump_retrieve_ids();
        for (var i = 0; i < retrieve_ids.length; i++) {
            var bill = g.bill_map[retrieve_ids[i]];
            if (!bill) {
                $('checked_owed').setAttribute('value', '???');
                $('checked_owed2').setAttribute('value', '???');
                $('checked_billed').setAttribute('value', '???');
                $('checked_paid').setAttribute('value', '???');
                $('total_owed').setAttribute('value', '???');
                $('total_owed2').setAttribute('value', '???');
                $('total_billed').setAttribute('value', '???');
                $('total_paid').setAttribute('value', '???');
                $('refunds_owed').setAttribute('value', '???');
                return;
            }
            var to = util.money.dollars_float_to_cents_integer( bill.transaction.total_owed() );
            var tp = util.money.dollars_float_to_cents_integer( bill.transaction.total_paid() );
            var bo = util.money.dollars_float_to_cents_integer( bill.transaction.balance_owed() );
            total_billed += to;
            total_paid += tp;
            total_balance += bo;
            if ( bo < 0 ) refunds_owed += bo;
            if (g.check_map[retrieve_ids[i]]) {
                checked_billed += to;
                checked_paid += tp;
                checked_balance += bo;
            }
        }
        $('checked_billed').setAttribute('value', '$' + util.money.cents_as_dollars( checked_billed ) );
        $('checked_paid').setAttribute('value', '$' + util.money.cents_as_dollars( checked_paid ) );
        $('checked_owed').setAttribute('value', '$' + util.money.cents_as_dollars( checked_balance ) );
        $('checked_owed2').setAttribute('value', '$' + util.money.cents_as_dollars( checked_balance ) );
        $('total_billed').setAttribute('value', '$' + util.money.cents_as_dollars( total_billed ) );
        $('total_paid').setAttribute('value', '$' + util.money.cents_as_dollars( total_paid ) );
        $('total_owed').setAttribute('value', '$' + util.money.cents_as_dollars( total_balance ) );
        $('total_owed2').setAttribute('value', '$' + util.money.cents_as_dollars( total_balance ) );
        $('refunds_owed').setAttribute('value', '$' + util.money.cents_as_dollars( Math.abs( refunds_owed ) ) );
        // tally_selected();
    } catch(E) {
        alert('Error in bill2.js, tally_all(): ' + E);
    }
}

function check_all() {
    try {
        for (var i in g.bill_map) {
            g.check_map[i] = true;
            var row_params = g.row_map[i];
            row_params.row.my.checked = true;
            g.bill_list.refresh_row(row_params);
        }
        distribute_payment();
    } catch(E) {
        alert('Error in bill2.js, check_all(): ' + E);
    }

}

function uncheck_all() {
    try {
        for (var i in g.bill_map) {
            g.check_map[i] = false;
            var row_params = g.row_map[i];
            row_params.row.my.checked = false;
            g.bill_list.refresh_row(row_params);
        }
        distribute_payment();
    } catch(E) {
        alert('Error in bill2.js, check_all(): ' + E);
    }

}

function check_all_refunds() {
    try {
        for (var i in g.bill_map) {
            g.check_map[i] = true;
            if ( Number( g.bill_map[i].transaction.balance_owed() ) < 0 ) {
                var row_params = g.row_map[i];
                row_params.row.my.checked = true;
                g.bill_list.refresh_row(row_params);
            }
        }
        distribute_payment();
    } catch(E) {
        alert('Error in bill2.js, check_all_refunds(): ' + E);
    }
}

function gen_list_append_func(r) {
    return function() {
        if (typeof r == 'object') { g.row_map[ r.id() ] = g.bill_list.append( { 'retrieve_id' : r.id(), 'row' : { 'my' : { 'checked' : true, 'mbts' : r } } } );
        } else { g.row_map[r] = g.bill_list.append( { 'retrieve_id' : r, 'row' : { 'my' : { 'checked' : true } } } ); }
    }
}

function retrieve_mbts_for_list() {
    var method = 'FM_MBTS_IDS_RETRIEVE_ALL_HAVING_BALANCE.authoritative';
    g.mbts_ids = g.network.simple_request(method,[ses(),g.patron_id]);
    if (g.mbts_ids.ilsevent) {
        switch(Number(g.mbts_ids.ilsevent)) {
            case -1: g.error.standard_network_error_alert($("patronStrings").getString('staff.patron.bill_history.retrieve_mbts_for_list.close_win_try_again')); break;
            default: g.error.standard_unexpected_error_alert($("patronStrings").getString('staff.patron.bill_history.retrieve_mbts_for_list.close_win_try_again'),g.mbts_ids); break;
        }
    } else if (g.mbts_ids == null) {
        g.error.standard_unexpected_error_alert($("patronStrings").getString('staff.patron.bill_history.retrieve_mbts_for_list.close_win_try_again'),null);
    } else {
   
        g.mbts_ids.reverse();
 
        for (var i = 0; i < g.mbts_ids.length; i++) {
            dump('i = ' + i + ' g.mbts_ids[i] = ' + g.mbts_ids[i] + '\n');
            g.funcs.push( gen_list_append_func(g.mbts_ids[i]) );
        }
    }
}

function init_lists() {
    JSAN.use('util.list'); JSAN.use('circ.util'); 

    g.bill_list_selection = [];

    g.bill_list = new util.list('bill_tree');

    g.bill_list.init( {
        'columns' : 
            [
                {
                    'id' : 'select', 'type' : 'checkbox', 'editable' : true, 'label' : '', 'render' : function(my) { return String( my.checked ) == 'true'; }, 
                }
            ].concat(
                patron.util.mbts_columns({
                    'xact_finish' : { 'hidden' : xul_param('current') ? true : false }
                }
            ).concat( 
                circ.util.columns({ 
                    'title' : { 'hidden' : false, 'flex' : '3' }
                }
            ).concat( 
                [
                    {
                        'id' : 'payment_pending', 'editable' : false, 'label' : 'Payment Pending', 'sort_type' : 'money', 'render' : function(my) { return my.payment_pending || '0.00'; }, 
                    }
                ]
            ))),
        'map_row_to_columns' : patron.util.std_map_row_to_columns(' '),
        'on_select' : function(ev) {
            JSAN.use('util.functional');
            g.bill_list_selection = util.functional.map_list(
                g.bill_list.retrieve_selection(),
                function(o) { return o.getAttribute('retrieve_id'); }
            );
            //tally_selected();
            $('details').setAttribute('disabled', g.bill_list_selection.length == 0);
            $('add').setAttribute('disabled', g.bill_list_selection.length == 0);
            $('voidall').setAttribute('disabled', g.bill_list_selection.length == 0);
        },
        'on_click' : function(ev) {
            netscape.security.PrivilegeManager.enablePrivilege('UniversalXPConnect UniversalBrowserRead');
            var row = {}; var col = {}; var nobj = {};
            g.bill_list.node.treeBoxObject.getCellAt(ev.clientX,ev.clientY,row,col,nobj);
            if (row.value == -1) return;
            var treeItem = g.bill_list.node.contentView.getItemAtIndex(row.value);
            if (treeItem.nodeName != 'treeitem') return;
            var treeRow = treeItem.firstChild;
            var treeCell = treeRow.firstChild;
            if (g.check_map[ treeItem.getAttribute('retrieve_id') ] != (treeCell.getAttribute('value') == 'true')) {
                g.check_map[ treeItem.getAttribute('retrieve_id') ] = treeCell.getAttribute('value') == 'true';
                g.row_map[ treeItem.getAttribute('retrieve_id') ].row.my.checked = treeCell.getAttribute('value') == 'true';
                tally_all();
                distribute_payment();
            }
        },
        'on_sort' : function() {
            tally_all();
        },
        'on_checkbox_toggle' : function(toggle) {
            try {
                var retrieve_ids = g.bill_list.dump_retrieve_ids();
                for (var i = 0; i < retrieve_ids.length; i++) {
                    g.check_map[ retrieve_ids[i] ] = (toggle=='on');
                    g.row_map[ retrieve_ids[i] ].row.my.checked = (toggle=='on');
                }
                tally_all();
            } catch(E) {
                alert('error in on_checkbox_toggle(): ' + E);
            }
        },
        'retrieve_row' : function(params) {
            try {
                var id = params.retrieve_id;
                var row = params.row;
                if (id) {
                    if (typeof row.my == 'undefined') row.my = {};
                    if (typeof row.my.mbts == 'undefined' ) {
                        g.network.simple_request('BLOB_MBTS_DETAILS_RETRIEVE',[ses(),id], function(req) {
                            var blob = req.getResultObject();
                            row.my.mbts = blob.transaction;
                            row.my.circ = blob.circ;
                            row.my.acp = blob.copy;
                            row.my.mvr = blob.record;
                            if (typeof params.on_retrieve == 'function') {
                                if ( Number( row.my.mbts.balance_owed() ) < 0 ) {
                                    params.row_node.firstChild.setAttribute('properties','refundable');
                                    row.my.checked = false;
                                }
                                params.on_retrieve(row);
                            };
                            g.bill_map[ id ] = blob;
                            g.check_map[ id ] = row.my.checked;
                            tally_all();
                        } );
                    } else {
                        if (typeof params.on_retrieve == 'function') { params.on_retrieve(row); }
                    }
                } else {
                    if (typeof params.on_retrieve == 'function') { params.on_retrieve(row); }
                }
                return row;
            } catch(E) {
                alert('Error in bill2.js, retrieve_row(): ' + E);
            }
        }
    } );

    $('bill_list_actions').appendChild( g.bill_list.render_list_actions() );
    g.bill_list.set_list_actions();
}

function handle_add() {
    if(g.bill_list_selection.length > 1)
        var msg = $("patronStrings").getFormattedString('staff.patron.bill_history.handle_add.message_plural', [g.bill_list_selection]);
    else
        var msg = $("patronStrings").getFormattedString('staff.patron.bill_history.handle_add.message_singular', [g.bill_list_selection]);
        
    var r = g.error.yns_alert(msg,
        $("patronStrings").getString('staff.patron.bill_history.handle_add.title'),
        $("patronStrings").getString('staff.patron.bill_history.handle_add.btn_yes'),
        $("patronStrings").getString('staff.patron.bill_history.handle_add.btn_no'),null,
        $("patronStrings").getString('staff.patron.bill_history.handle_add.confirm_message'));
    if (r == 0) {
        JSAN.use('util.window');
        var win = new util.window();
        for (var i = 0; i < g.bill_list_selection.length; i++) {
            var w = win.open(
                urls.XUL_PATRON_BILL_WIZARD,
                'billwizard',
                'chrome,resizable,modal',
                { 'patron_id' : g.patron_id, 'xact_id' : g.bill_list_selection[i] }
            );
        }
        g.bill_list.clear();
        retrieve_mbts_for_list();
        if (typeof window.refresh == 'function') window.refresh();
        if (typeof window.xulG == 'object' && typeof window.xulG.refresh == 'function') window.xulG.refresh();
    }
}

function handle_details() {
    JSAN.use('util.window'); var win = new util.window();
    for (var i = 0; i < g.bill_list_selection.length; i++) {
        var my_xulG = win.open(
            urls.XUL_PATRON_BILL_DETAILS,
            'test_billdetails_' + g.bill_list_selection[i],
            'chrome,resizable',
            {
                'patron_id' : g.patron_id,
                'mbts_id' : g.bill_list_selection[i],
                'refresh' : function() { 
                    if (typeof window.refresh == 'function') window.refresh();
                    if (typeof window.xulG == 'object' && typeof window.xulG.refresh == 'function') window.xulG.refresh();
                }, 
            }
        );
    }
}

function print_bills() {
    try {
        var template = 'bills_historical'; if (xul_param('current')) template = 'bills_current';
        JSAN.use('patron.util');
        var params = { 
            'patron' : patron.util.retrieve_au_via_id(ses(),g.patron_id), 
            'template' : template
        };
        g.bill_list.print(params);
    } catch(E) {
        g.error.standard_unexpected_error_alert($("patronStrings").getString('staff.patron.bill_history.print_bills.print_error'), E);
    }
}

function distribute_payment() {
    try {
        JSAN.use('util.money');
        var tb = $('payment');
        tb.value = util.money.cents_as_dollars( util.money.dollars_float_to_cents_integer( tb.value ) );
        tb.setAttribute('value', tb.value );
        var total = util.money.dollars_float_to_cents_integer( tb.value );
        if (total < 0) { tb.value = '0.00'; tb.setAttribute('value','0.00'); total = 0; }
        var retrieve_ids = g.bill_list.dump_retrieve_ids();
        for (var i = 0; i < retrieve_ids.length; i++) {
            var row_params = g.row_map[retrieve_ids[i]];
            if (g.check_map[retrieve_ids[i]]) { 
                var bill = g.bill_map[retrieve_ids[i]].transaction;
                var bo = util.money.dollars_float_to_cents_integer( bill.balance_owed() );
                if ( bo > total ) {
                    row_params.row.my.payment_pending = util.money.cents_as_dollars( total );
                    total = 0;
                } else {
                    row_params.row.my.payment_pending = util.money.cents_as_dollars( bo );
                    total = total - bo;
                }
            } else {
                row_params.row.my.payment_pending = '0.00';
            }
            g.bill_list.refresh_row(row_params);
        }
        tally_pending();
    } catch(E) {
        alert('Error in bill2.js, distribute_payment(): ' + E);
    }
}

function apply_payment() {
    try {
        var payment_blob = {};
        JSAN.use('util.window');
        var win = new util.window();
        switch($('payment_type').value) {
            case 'credit_card_payment' :
                g.data.temp = '';
                g.data.stash('temp');
                var my_xulG = win.open(
                    urls.XUL_PATRON_BILL_CC_INFO,
                    'billccinfo',
                    'chrome,resizable,modal',
                    {'patron_id': g.patron_id}
                );
                g.data.stash_retrieve();
                payment_blob = JSON2js( g.data.temp ); // FIXME - replace with my_xulG and update_modal_xulG, though it looks like we were using that before and moved away from it
            break;
            case 'check_payment' :
                g.data.temp = '';
                g.data.stash('temp');
                var my_xulG = win.open(
                    urls.XUL_PATRON_BILL_CHECK_INFO,
                    'billcheckinfo',
                    'chrome,resizable,modal'
                );
                g.data.stash_retrieve();
                payment_blob = JSON2js( g.data.temp );
            break;
        }
        if (
            (typeof payment_blob == 'undefined') || 
            payment_blob=='' || 
            payment_blob.cancelled=='true'
        ) { 
            alert( $('commonStrings').getString('common.cancelled') ); 
            return; 
        }
        payment_blob.userid = g.patron_id;
        payment_blob.note = payment_blob.note || '';
        //payment_blob.cash_drawer = 1; // FIXME: get new Config() to work
        payment_blob.payment_type = $('payment_type').value;
        var tally_blob = tally_pending();
        payment_blob.payments = tally_blob.payments;
        payment_blob.patron_credit = $('convert_change_to_credit').checked ? tally_blob.change : '0.00'; 
        if ( payment_blob.payments.length == 0 && payment_blob.patron_credit == '0.00' ) {
            alert($("patronStrings").getString('staff.patron.bills.apply_payment.nothing_applied'));
            return;
        }
        if ( pay( payment_blob ) ) {

            g.data.voided_billings = []; g.data.stash('voided_billings');
            g.bill_list.clear();
            retrieve_mbts_for_list();
            if (typeof window.refresh == 'function') window.refresh();
            if (typeof window.xulG == 'object' && typeof window.xulG.refresh == 'function') window.xulG.refresh();
            try {
                var no_print_prompting = g.data.hash.aous['circ.staff_client.do_not_auto_attempt_print'];
                if (no_print_prompting) {
                    if (no_print_prompting.indexOf( "Bill Pay" ) > -1) return; // Skip print attempt
                }
                netscape.security.PrivilegeManager.enablePrivilege("UniversalXPConnect");
                g.data.stash_retrieve();
                var template = 'bill_payment';
                JSAN.use('patron.util'); JSAN.use('util.functional');
                var params = { 
                    'patron' : g.patron,
                    'lib' : data.hash.aou[ ses('ws_ou') ],
                    'staff' : ses('staff'),
                    'header' : data.print_list_templates[template].header,
                    'line_item' : data.print_list_templates[template].line_item,
                    'footer' : data.print_list_templates[template].footer,
                    'type' : data.print_list_templates[template].type,
                    'list' : util.functional.map_list(
                        payment_blob.payments,
                        function(o) {
                            return {
                                'bill_id' : o[0],
                                'payment' : o[1],
                                'last_billing_type' : g.bill_map[ o[0] ].transaction.last_billing_type(),
                                'last_billing_note' : g.bill_map[ o[0] ].transaction.last_billing_note(),
                                'title' : typeof g.bill_map[ o[0] ].title != 'undefined' ? g.bill_map[ o[0] ].title : '', 
                                'barcode' : typeof g.bill_map[ o[0] ].barcode != 'undefined' ? g.bill_map[ o[0] ].barcode : ''
                            };
                        }
                    ),
                    'data' : g.previous_summary
                };
                g.error.sdump('D_DEBUG',js2JSON(params));
                if ($('auto_print').checked) params.no_prompt = true;
                JSAN.use('util.print'); var print = new util.print();
                print.tree_list( params );
            } catch(E) {
                g.standard_unexpected_error_alert('bill receipt', E);
            }
        }
    } catch(E) {
        alert('Error in bill2.js, apply_payment(): ' + E);
    }
}

function pay(payment_blob) {
    try {
        var x = $('annotate_payment');
        if (x && x.checked && (! payment_blob.note)) {
            payment_blob.note = window.prompt(
                $("patronStrings").getString('staff.patron.bills.pay.annotate_payment'),
                '', 
                $("patronStrings").getString('staff.patron.bills.pay.annotate_payment.title')
            );
        }
        previous_summary = {
            original_balance : obj.controller.view.bill_total_owed.value,
            voided_balance : obj.controller.view.voided_balance.value,
            payment_received : obj.controller.view.bill_payment_amount.value,
            payment_applied : obj.controller.view.bill_payment_applied.value,
            change_given : obj.controller.view.bill_change_amount.value,
            credit_given : obj.controller.view.bill_credit_amount.value,
            new_balance : obj.controller.view.bill_new_balance.value,
            payment_type : obj.controller.view.payment_type.getAttribute('label'),
            note : payment_blob.note
        }
        var robj = g.network.request(
            api.BILL_PAY.app,    
            api.BILL_PAY.method,
            [ ses(), payment_blob ]
        );
        if (robj == 1) { return true; } 
        if (typeof robj.ilsevent != 'undefined') {
            switch(Number(robj.ilsevent)) {
                case 0 /* SUCCESS */ : return true; break;
                case 1226 /* REFUND_EXCEEDS_DESK_PAYMENTS */ : alert($("patronStrings").getFormattedString('staff.patron.bills.pay.refund_exceeds_desk_payment', [robj.desc])); return false; break;
                default: throw(robj); break;
            }
        }
    } catch(E) {
        obj.error.standard_unexpected_error_alert($("patronStrings").getString('staff.patron.bills.pay.payment_failed'),E);
        return false;
    }
}


