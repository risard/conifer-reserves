dump('Loading constants.js\n');
var api = {
	'auth_init' : { 'app' : 'open-ils.auth', 'method' : 'open-ils.auth.authenticate.init' },
	'auth_complete' : { 'app' : 'open-ils.auth', 'method' : 'open-ils.auth.authenticate.complete' },
	'bill_pay' : { 'app' : 'open-ils.circ', 'method' : 'open-ils.circ.money.payment' },
	'blob_checkouts_retrieve' : { 'app' : 'open-ils.circ', 'method' : 'open-ils.circ.actor.user.checked_out' },
	'capture_copy_for_hold_via_barcode' : { 'app' : 'open-ils.circ', 'method' : 'open-ils.circ.hold.capture_copy.barcode' },
	'checkin_via_barcode' : { 'app' : 'open-ils.circ', 'method' : 'open-ils.circ.checkin.barcode' },
	'checkout_permit_via_barcode' : { 'app' : 'open-ils.circ', 'method' : 'open-ils.circ.permit_checkout' },
	'checkout_via_barcode' : { 'app' : 'open-ils.circ', 'method' : 'open-ils.circ.checkout.barcode' },
	'fm_acp_retrieve' : { 'app' : 'open-ils.search', 'method' : 'open-ils.search.asset.copy.fleshed.retrieve' },
	'fm_acpl_retrieve' : { 'app' : 'open-ils.search', 'method' : 'open-ils.search.config.copy_location.retrieve.all' },
	'fm_actsc_retrieve_via_aou' : { 'app' : 'open-ils.circ', 'method' : 'open-ils.circ.stat_cat.actor.retrieve.all' },
	'fm_ahr_retrieve' : { 'app' : 'open-ils.circ', 'method' : 'open-ils.circ.holds.retrieve' },
	'fm_aou_retrieve' : { 'app' : 'open-ils.actor', 'method' : 'open-ils.actor.org_tree.retrieve' },
	'fm_aou_retrieve_related_via_session' : { 'app' : 'open-ils.actor', 'method' : 'open-ils.actor.org_unit.full_path.retrieve' },
	'fm_aout_retrieve' : { 'app' : 'open-ils.actor', 'method' : 'open-ils.actor.org_types.retrieve' },
	'fm_au_ids_retrieve_via_hash' : { 'app' : 'open-ils.actor', 'method' : 'open-ils.actor.patron.search.advanced' },
	'fm_au_retrieve_via_session' : { 'app' : 'open-ils.auth', 'method' : 'open-ils.auth.session.retrieve' },
	'fm_au_retrieve_via_barcode' : { 'app' : 'open-ils.actor', 'method' : 'open-ils.actor.user.fleshed.retrieve_by_barcode' },
	'fm_au_retrieve_via_id' : { 'app' : 'open-ils.actor', 'method' : 'open-ils.actor.user.fleshed.retrieve' },
	'fm_ccs_retrieve' : { 'app' : 'open-ils.search', 'method' : 'open-ils.search.config.copy_status.retrieve.all' },
	'fm_circ_retrieve_via_user' : { 'app' : 'open-ils.circ', 'method' : 'open-ils.circ.actor.user.checked_out.slim' },
	'fm_cit_retrieve' : { 'app' : 'open-ils.actor', 'method' : 'open-ils.actor.user.ident_types.retrieve' },
	'fm_cst_retrieve' : { 'app' : 'open-ils.actor', 'method' : 'open-ils.actor.standings.retrieve' },
	'fm_mb_create' : { 'app' : 'open-ils.circ', 'method' : 'open-ils.circ.money.billing.create' },
	'fm_mb_retrieve_via_mbts_id' : { 'app' : 'open-ils.circ', 'method' : 'open-ils.circ.money.billing.retrieve.all' },
	'fm_mp_retrieve_via_mbts_id' : { 'app' : 'open-ils.circ', 'method' : 'open-ils.circ.money.payment.retrieve.all' },
	'fm_mg_create' : { 'app' : 'open-ils.circ', 'method' : 'open-ils.circ.money.grocery.create' },
	'fm_mobts_having_balance' : { 'app' : 'open-ils.actor', 'method' : 'open-ils.actor.user.transactions.have_balance' },
	'fm_pgt_retrieve' : { 'app' : 'open-ils.actor', 'method' : 'open-ils.actor.groups.retrieve' },
	'mods_slim_metarecord_retrieve' : { 'app' : 'open-ils.search', 'method' : 'open-ils.search.biblio.metarecord.mods_slim.retrieve' },
	'mods_slim_record_retrieve' : { 'app' : 'open-ils.search', 'method' : 'open-ils.search.biblio.record.mods_slim.retrieve' },
	'mods_slim_record_retrieve_via_copy' : { 'app' : 'open-ils.search', 'method' : 'open-ils.search.biblio.mods_from_copy' },
}

var urls = {
	'opac' : 'http://dev.gapines.org/opac/en-US/skin/default/xml/advanced.xml',
	'remote' : 'http://dev.gapines.org/',
	'remote_checkin' : '/xul/server/circ/checkin.xul',
	'remote_checkout' : '/xul/server/circ/checkout.xul',
	'remote_debug_console' : 'chrome://global/content/console.xul',
	'remote_debug_fieldmapper' : '/xul/server/util/fm_view.xul',
	'remote_debug_filter_console' : '/xul/server/util/filter_console.xul',
	'remote_debug_shell' : '/xul/server/util/shell.html',
	'remote_debug_xuleditor' : '/xul/server/util/xuledit.xul',
	'remote_hold_capture' : '/xul/server/circ/hold_capture.xul',
	'remote_menu_frame' : 'chrome://evergreen/content/main/menu_frame.xul',
	'remote_patron_barcode_entry' : '/xul/server/patron/barcode_entry.xul',
	'remote_patron_bills' : '/xul/server/patron/bills.xul',
	'remote_patron_bill_cc_info' : '/xul/server/patron/bill_cc_info.xul',
	'remote_patron_bill_check_info' : '/xul/server/patron/bill_check_info.xul',
	'remote_patron_bill_details' : '/xul/server/patron/bill_details.xul',
	'remote_patron_bill_wizard' : '/xul/server/patron/bill_wizard.xul',
	'remote_patron_display' : '/xul/server/patron/display.xul',
	'remote_patron_edit' : '/xul/server/patron/user_edit.xml',
	'remote_patron_holds' : '/xul/server/patron/holds.xul',
	'remote_patron_info' : 'data:text/html,<h1>Info Here</h1>',
	'remote_patron_items' : '/xul/server/patron/items.xul',
	'remote_patron_search_form' : '/xul/server/patron/search_form.xul',
	'remote_patron_search_result' : '/xul/server/patron/search_result.xul',
	'remote_patron_summary' : '/xul/server/patron/summary.xul',
	'test_html' : '/xul/server/main/test.html',
	'test_xul' : '/xul/server/main/test.xul',
	'xul_opac_wrapper' : '/xul/server/cat/opac.xul',
}
