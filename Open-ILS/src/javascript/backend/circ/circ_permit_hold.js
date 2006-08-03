function go() {

load_lib('circ/circ_lib.js');
log_vars('circ_permit_hold');

if( isTrue(patron.barred) ) 
	result.events.push('PATRON_BARRED');

/* projected medium 
	this needs to be expanded to check circ_modifiers as well
*/
if( getMARCItemType() == 'g' &&
		!isOrgDescendent(copy.circ_lib.shortname, patron.home_ou.id) )
	result.events.push('CIRC_EXCEEDS_COPY_RANGE');

} go();

