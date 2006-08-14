load_lib('circ/circ_lib.js');
log_debug('loading circ_item_config.js ...');


/* SIP media types
000 Other
001 Book
002 Magazine
003 Bound journal
004 Audio tape
005 Video tape
006 CD/CDROM
007 Diskette
008 Book with diskette
009 Book with CD
010 Book with audio tape
*/

/* ----------------------------------------------------------------------------- 
	Configure the duration rules for the various item types and circ modifiers

	MARC Fixed Field info:
	http://www.oclc.org/bibformats/en/fixedfield/

	----------------------------------------------------------------------------- */

var MARC_ITEM_TYPE_MAP = {

	a : { /* Language material [Books] */
		SIPMediaType			: '001',
		magneticMedia			: 'f',
		durationRule			: '14_days_2_renew',
		recurringFinesRule	: '10_cent_per_day',
		maxFine					: 'overdue_mid'
	},

	t : { /* Manuscript language material [Books] */
		SIPMediaType			: '001',
		magneticMedia			: 'f',
		durationRule			: '14_days_2_renew',
		recurringFinesRule	: '10_cent_per_day',
		maxFine					: 'overdue_mid'
	},

	g : { /* Projected medium [Videos, etc.] */
		SIPMediaType			: '005',
		magneticMedia			: 'f',
		durationRule			: '7_days_0_renew',
		recurringFinesRule	: '10_cent_per_day',
		maxFine					: 'overdue_mid'
	},

	k : { /* Two-dimensional nonprojectable graphic [Card, charts, etc.] */
		SIPMediaType			: '001',
		magneticMedia			: 'f',
		durationRule			: '3_month_0_renew',
		recurringFinesRule	: '10_cent_per_day',
		maxFine					: 'overdue_mid'
	},

	r : { /* Three-dimensional artifact or naturally occurring object [Models, games, etc.] */ 
		SIPMediaType			: '001',
		magneticMedia			: 'f',
		durationRule			: '14_days_2_renew',
		recurringFinesRule	: '10_cent_per_day',
		maxFine					: 'overdue_mid'
	},

	o : { /* Kit [Mixture of item types] */
		SIPMediaType			: '001',
		magneticMedia			: 'f',
		durationRule			: '14_days_2_renew',
		recurringFinesRule	: '10_cent_per_day',
		maxFine					: 'overdue_mid'
	},

	p : { /* Mixed materials [Mixture of item types] */
		SIPMediaType			: '001',
		magneticMedia			: 'f',
		durationRule			: '14_days_2_renew',
		recurringFinesRule	: '10_cent_per_day',
		maxFine					: 'overdue_mid'
	},

	e : { /* Cartographic material [Map] */
		SIPMediaType			: '001',
		magneticMedia			: 'f',
		durationRule			: '7_days_2_renew',
		recurringFinesRule	: '50_cent_per_day',
		maxFine					: 'overdue_mid'
	},

	f : { /* Manuscript cartographic material [Map] */
		SIPMediaType			: '001',
		magneticMedia			: 'f',
		durationRule			: '3_days_1_renew',
		recurringFinesRule	: '50_cent_per_day',
		maxFine					: 'overdue_mid'
	},

	c : { /* Notated music [Printed music] */
		SIPMediaType			: '001',
		magneticMedia			: 'f',
		durationRule			: '14_days_2_renew',
		recurringFinesRule	: '10_cent_per_day',
		maxFine					: 'overdue_mid'
	},

	d : { /* Manuscript notated music [Printed music] */
		SIPMediaType			: '001',
		magneticMedia			: 'f',
		durationRule			: '14_days_2_renew',
		recurringFinesRule	: '10_cent_per_day',
		maxFine					: 'overdue_mid'
	},

	i : { /* Nonmusical sound recording [Audiobooks, sound effects, etc.] */
		SIPMediaType			: '001',
		magneticMedia			: 'f',
		durationRule			: '14_days_2_renew',
		recurringFinesRule	: '10_cent_per_day',
		maxFine					: 'overdue_mid'
	},

	j : { /* Musical sound recording [Music] */
		SIPMediaType			: '001',
		magneticMedia			: 'f',
		durationRule			: '14_days_2_renew',
		recurringFinesRule	: '10_cent_per_day',
		maxFine					: 'overdue_mid'
	},

	m : { /* Computer file */
		SIPMediaType			: '001',
		magneticMedia			: 'f',
		durationRule			: '14_days_2_renew',
		recurringFinesRule	: '10_cent_per_day',
		maxFine					: 'overdue_mid'
	}
}


var CIRC_MOD_MAP = {

	'art'		: {
		SIPMediaType			: '000',
		magneticMedia			: 'f',
		durationRule			: '3_month_0_renew',
		recurringFinesRule	: '10_cent_per_day',
		maxFine					: 'overdue_mid'
	},

	'atlas'		: {
		SIPMediaType			: '000',
		magneticMedia			: 'f',
		durationRule			: '7_days_2_renew',
		recurringFinesRule	: '50_cent_per_day',
		maxFine					: 'overdue_mid'
	},

	'audiobook' : {
		SIPMediaType			: '004',
		magneticMedia			: 'f',
		durationRule			: '14_days_2_renew',
		recurringFinesRule	: '10_cent_per_day',
		maxFine					: 'overdue_mid'
	},

	'av' : {
		SIPMediaType			: '005',
		magneticMedia			: 'f',
		durationRule			: '7_days_2_renew',
		recurringFinesRule	: '50_cent_per_day',
		maxFine					: 'overdue_mid'
	},

	'bestseller'				: {
		SIPMediaType			: '001',
		magneticMedia			: 'f',
		durationRule			: '7_days_2_renew',
		recurringFinesRule	: '50_cent_per_day',
		maxFine					: 'overdue_mid'
	},

	'bestsellernh'				: {
		SIPMediaType			: '001',
		magneticMedia			: 'f',
		durationRule			: '7_days_2_renew',
		recurringFinesRule	: '50_cent_per_day',
		maxFine					: 'overdue_mid'
	},

	'book'						: {
		SIPMediaType			: '001',
		magneticMedia			: 'f',
		durationRule			: '14_days_2_renew',
		recurringFinesRule	: '10_cent_per_day',
		maxFine					: 'overdue_mid'
	},

	'cd'				: {
		SIPMediaType			: '006',
		magneticMedia			: 'f',
		durationRule			: '14_days_2_renew',
		recurringFinesRule	: '10_cent_per_day',
		maxFine					: 'overdue_mid'
	},

	'dvd'							: {
		SIPMediaType			: '006',
		magneticMedia			: 'f',
		durationRule			: '7_days_0_renew',
		recurringFinesRule	: '50_cent_per_day',
		maxFine					: 'overdue_mid'
	},

	'e-book' : {
		SIPMediaType			: '001',
		magneticMedia			: 'f',
		durationRule			: '3_days_1_renew',
		recurringFinesRule	: '50_cent_per_day',
		maxFine					: 'overdue_mid'
	},

	'equipment' : { 
		SIPMediaType			: '000',
		magneticMedia			: 'f',
		durationRule			: '3_days_1_renew',
		recurringFinesRule	: '50_cent_per_day',
		maxFine					: 'overdue_mid'
	},

	'filmstrip'					: {
		SIPMediaType			: '000',
		magneticMedia			: 'f',
		durationRule			: '14_days_2_renew',
		recurringFinesRule	: '10_cent_per_day',
		maxFine					: 'overdue_mid'
	},

	'kit' : {
		SIPMediaType			: '000',
		magneticMedia			: 'f',
		durationRule			: '14_days_2_renew',
		recurringFinesRule	: '10_cent_per_day',
		maxFine					: 'overdue_mid'
	},

	'magazine'	: {
		SIPMediaType			: '002',
		magneticMedia			: 'f',
		durationRule			: '14_days_2_renew',
		recurringFinesRule	: '10_cent_per_day',
		maxFine					: 'overdue_mid'
	},

	'map' : {
		SIPMediaType			: '000',
		magneticMedia			: 'f',
		durationRule			: '3_days_1_renew',
		recurringFinesRule	: '50_cent_per_day',
		maxFine					: 'overdue_mid'
	},

	'microform' : {
		SIPMediaType			: '000',
		magneticMedia			: 'f',
		durationRule			: '14_days_2_renew',
		recurringFinesRule	: '10_cent_per_day',
		maxFine					: 'overdue_mid'
	},

	'music' : {
		SIPMediaType			: '004',
		magneticMedia			: 'f',
		durationRule			: '14_days_2_renew',
		recurringFinesRule	: '10_cent_per_day',
		maxFine					: 'overdue_mid'
	},

	'record'						: {
		SIPMediaType			: '000',
		magneticMedia			: 'f',
		durationRule			: '14_days_2_renew',
		recurringFinesRule	: '10_cent_per_day',
		maxFine					: 'overdue_mid'
	},

	'software' : {
		SIPMediaType			: '006',
		magneticMedia			: 'f',
		durationRule			: '7_days_2_renew',
		recurringFinesRule	: '10_cent_per_day',
		maxFine					: 'overdue_mid'
	},

	'talking book'				: {  
		SIPMediaType			: '006',
		magneticMedia			: 'f',
		durationRule			: 'unlimited',
	},

	'toy'							: {
		SIPMediaType			: '000',
		magneticMedia			: 'f',
		durationRule			: '7_days_2_renew',
		recurringFinesRule	: '50_cent_per_day',
		maxFine					: 'overdue_mid'
	},

	'video'	: {
		SIPMediaType			: '005',
		magneticMedia			: 'f',
		durationRule			: '7_days_0_renew',
		recurringFinesRule	: '50_cent_per_day',
		maxFine					: 'overdue_mid'
	},
}


/* Set up rules for legacy types */
CIRC_MOD_MAP['DEPOSIT'] 	= CIRC_MOD_MAP['book'];
CIRC_MOD_MAP['E-AUDIO'] 	= CIRC_MOD_MAP['book'];
CIRC_MOD_MAP['EQUIP'] 		= CIRC_MOD_MAP['book'];
CIRC_MOD_MAP['FACBESTSLR'] = CIRC_MOD_MAP['book'];
CIRC_MOD_MAP['FACNEWBK'] 	= CIRC_MOD_MAP['book'];
CIRC_MOD_MAP['MAG-CIRC'] 	= CIRC_MOD_MAP['book'];
CIRC_MOD_MAP['MAG-NOCIRC'] = CIRC_MOD_MAP['book'];
CIRC_MOD_MAP['NEW-AV'] 		= CIRC_MOD_MAP['book'];
CIRC_MOD_MAP['NEW-BOOK'] 	= CIRC_MOD_MAP['book'];
CIRC_MOD_MAP['NEWSPAPER'] 	= CIRC_MOD_MAP['book'];
CIRC_MOD_MAP['NILS-ITEM'] 	= CIRC_MOD_MAP['book'];
CIRC_MOD_MAP['OUTREACH'] 	= CIRC_MOD_MAP['book'];
CIRC_MOD_MAP['PAMPHLET'] 	= CIRC_MOD_MAP['book'];
CIRC_MOD_MAP['PAPERBACK'] 	= CIRC_MOD_MAP['book'];
CIRC_MOD_MAP['REALIA'] 		= CIRC_MOD_MAP['book'];
CIRC_MOD_MAP['RESERVE'] 	= CIRC_MOD_MAP['book'];
CIRC_MOD_MAP['STATE-BOOK'] = {
	SIPMediaType			: '001',
	magneticMedia			: 'f',
	durationRule			: '35_days_1_renew',
	recurringFinesRule	: "10_cent_per_day",
	maxFine					: "overdue_mid"
};
CIRC_MOD_MAP['STATE-MFRM'] =  {
	SIPMediaType			: '001',
	magneticMedia			: 'f',
	durationRule			: '14_days_2_renew',
	recurringFinesRule	: "10_cent_per_day",
	maxFine					: "overdue_mid"
};

/* this will set defaults even if no one asked for them */
log_debug("Calling getItemConfig() to force defaults..");
getItemConfig();
log_debug("getItemConfig() set magneticMedia to "+result.magneticMedia);


function getItemConfig() {

	/* ----------------------------------------------------------------------------------- 
		If a circ_modifier is defined on the copy and we have config info for the
		provided circ_modifier, use that config.  Otherwise fall back on the MARC item type
		----------------------------------------------------------------------------------- */
	var marcType	= getMARCItemType();
	var circMod		= copy.circ_modifier;
	var itemForm	= (marcXMLDoc) ? extractFixedField(marcXMLDoc,'Form') : "";
	
	var config;
	
	if( circMod && CIRC_MOD_MAP[circMod.toLowerCase()] ) {
		/* if we have a config for the given circ_modifier, use it */
		log_debug("a circ_mod config exists for the copy: " + circMod);
		config = CIRC_MOD_MAP[circMod];
	
	} else {
		/* otherwise, fall back on the MARC item type */
	
		if( circMod ) {
			log_debug("no circ_mod config found for "
				+circMod+", falling back to MARC");
		}
		config = MARC_ITEM_TYPE_MAP[marcType];
	}

	/* if no config could be found, default to 'book' */
	if(!config) {
		log_warn("item_config found no circ_mod OR MARC config, defaulting to 'book'");
		config = CIRC_MOD_MAP['book'];
	}

	/* go ahead and set some default result 
		data (which may be overidden) */
	for( var i in config ) {
		log_debug("item_config setting result defaults: "+i+" = " +config[i]);
		result[i] = config[i];
	}

	return config;
}


