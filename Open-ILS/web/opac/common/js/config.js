/* Export some constants  ----------------------------------------------------- */

/* URL param names */
var PARAM_TERM			= "t";			/* search term */
var PARAM_STYPE		= "tp";			/* search type */
var PARAM_LOCATION	= "l";			/* current location */
var PARAM_DEPTH		= "d";			/* search depth */
var PARAM_FORM			= "f";			/* search format */
var PARAM_OFFSET		= "o";			/* search offset */
var PARAM_COUNT		= "c";			/* hits per page */
var PARAM_HITCOUNT	= "hc";			/* hits per page */
var PARAM_MRID			= "m";			/* metarecord id */
var PARAM_RID			= "r";			/* record id */
var PARAM_ORIGLOC		= "ol"			/* the original location */
var PARAM_TOPRANK		= "tr"			/* this highest ranking rank */

/* URL param values (see comments above) */
var TERM;  
var STYPE;  
var LOCATION;  
var DEPTH;  
var FORM; 
var OFFSET;
var COUNT;  
var HITCOUNT;  
var RANKS; 
var FONTSIZE;
var ORIGLOC;
var TOPRANK;

/* cookie values */
var SBEXTRAS; 
var SKIN;


/* cookies */
var COOKIE_SB = "sbe";
var COOKIE_SES = "ses";
var COOKIE_IDS	= "ids";
var COOKIE_FONT = "fnt";
var COOKIE_SKIN = "skin";

/* these are the actual param values - set on page load */

/* pages */
var MRESULT		= "mresult";
var RRESULT		= "rresult";
var RDETAIL		= "rdetail";
var MYOPAC		= "myopac";
var ADVANCED	= "advanced";
var HOME			= "home";

/* search type (STYPE) options */
var STYPE_AUTHOR	= "author";
var STYPE_TITLE		= "title";
var STYPE_SUBJECT	= "subject";
var STYPE_SERIES	= "series";
var STYPE_KEYWORD	= "keyword";


/* container for global variables shared accross pages */
var G		= {};
G.user	= null; /* global user object */
G.ui		= {} /* cache of UI components */


/* call me after page init and I will load references 
	to all of the ui object id's defined below 
	They will be stored in G.ui.<page>.<thingy>
 */
function loadUIObjects() {
	for( var p in config.ids ) {
		G.ui[p] = {};
		for( var o in config.ids[p] ) 
			G.ui[p][o] = getId(config.ids[p][o]);
	}
}

/* try our best to free memory */
function clearUIObjects() {
	for( var p in config.ids ) {
		for( var o in config.ids[p] ) {
			if(G.ui[p][o]) {
				G.ui[p][o].onclick = null;
				G.ui[p][o].onkeydown = null;
				G.ui[p][o] = null;
			}
		}
		G.ui[p] = null;
	}
}

/* ---------------------------------------------------------------------------- 
	Set up ID's and CSS classes 
	Any new ids, css, etc. may be added by giving the unique names and putting 
	them into the correct scope 
/* ---------------------------------------------------------------------------- */

var config = {};

/* Set up the page names */
config.page = {};
config.page[HOME]			= "index.xml";
config.page[ADVANCED]	= "advanced.xml";
config.page[MRESULT]		= "mresult.xml";
config.page[RRESULT]		= "rresult.xml";
config.page[MYOPAC]		= "myopac.xml";
config.page[RDETAIL]		= "rdetail.xml";

/* themes */
config.themes = {};

/* set up images  */
config.images = {};
config.images.logo = "main_logo.jpg";


/* set up ID's, CSS, and node names */
config.ids				= {};
config.ids.result		= {};
config.ids.mresult	= {};
config.ids.advanced	= {};
config.ids.rresult	= {};
config.ids.myopac		= {};
config.ids.rdetail	= {};

config.css				= {};
config.css.result		= {};
config.css.mresult	= {};
config.css.advanced	= {};
config.css.rresult	= {};
config.css.myopac		= {};
config.css.rdetail	= {};

config.names			= {};
config.names.result	= {};
config.names.mresult = {};
config.names.advanced = {};
config.names.rresult = {};
config.names.myopac	= {};
config.names.rdetail = {};


/* id's shared accross skins. These *must* be defined */
config.ids.common = {};
config.ids.common.loading			= "loading_div";		
config.ids.common.canvas			= "canvas";				
config.ids.common.canvas_main		= "canvas_main";		
config.ids.common.org_tree			= "org_tree";			
config.ids.common.org_container	= "org_container";

config.ids.xul = {};


/* shared CSS */
config.css.hide_me = "hide_me";
config.css.dim = "dim";
config.css.dim2 = "dim2";


/* ---------------------------------------------------------------------------- */
/* These are pages that may replace the canvas */
/* ---------------------------------------------------------------------------- */
config.ids.altcanvas = {};



/* ---------------------------------------------------------------------------- */
/* Methods are defined as service:method 
	An optional 3rd component is when a method is followed by a :1, such methods
	have a staff counterpart and should have ".staff" appended to the method 
	before the method is called when in XUL mode */

var FETCH_MRCOUNT					= "open-ils.search:open-ils.search.biblio.class.count:1";
var FETCH_MRIDS					= "open-ils.search:open-ils.search.biblio.class:1";
var FETCH_MRIDS_FULL				= "open-ils.search:open-ils.search.biblio.class.full:1";
var FETCH_MRMODS					= "open-ils.search:open-ils.search.biblio.metarecord.mods_slim.retrieve";
var FETCH_MR_COPY_COUNTS		= "open-ils.search:open-ils.search.biblio.metarecord.copy_count:1";
var FETCH_RIDS						= "open-ils.search:open-ils.search.biblio.metarecord_to_records:1";
var FETCH_RMODS					= "open-ils.search:open-ils.search.biblio.record.mods_slim.retrieve";
var FETCH_R_COPY_COUNTS			= "open-ils.search:open-ils.search.biblio.record.copy_count";
var FETCH_FLESHED_USER			= "open-ils.actor:open-ils.actor.user.fleshed.retrieve";
var FETCH_SESSION					= "open-ils.auth:open-ils.auth.session.retrieve";
var LOGIN_INIT						= "open-ils.auth:open-ils.auth.authenticate.init";
var LOGIN_COMPLETE				= "open-ils.auth:open-ils.auth.authenticate.complete";
var LOGIN_DELETE					= "open-ils.auth:open-ils.auth.session.delete";
var FETCH_USER_PREFS				= "open-ils.actor:open-ils.actor.patron.settings.retrieve"; 
var UPDATE_USER_PREFS			= "open-ils.actor:open-ils.actor.patron.settings.update"; 
var FETCH_COPY_STATUSES			= "open-ils.search:open-ils.search.config.copy_status.retrieve.all";
var FETCH_COPY_COUNTS_SUMMARY	= "open-ils.search:open-ils.search.biblio.copy_counts.summary.retrieve";
var FETCH_MARC_HTML				= "open-ils.search:open-ils.search.biblio.record.html";
var FETCH_CHECKED_OUT			= "open-ils.circ:open-ils.circ.actor.user.checked_out";
var FETCH_HOLDS					= "open-ils.circ:open-ils.circ.holds.retrieve";
var FETCH_FINES_SUMMARY			= "open-ils.actor:open-ils.actor.user.fines.summary";
var FETCH_TRANSACTIONS			= "open-ils.actor:open-ils.actor.user.transactions.have_charge.fleshed";
var FETCH_CROSSREF				= "open-ils.search:open-ils.search.authority.crossref";
var FETCH_CROSSREF_BATCH		= "open-ils.search:open-ils.search.authority.crossref.batch";
var CREATE_HOLD					= "open-ils.circ:open-ils.circ.holds.create";
var CANCEL_HOLD					= "open-ils.circ:open-ils.circ.hold.cancel";
var UPDATE_USERNAME				= "open-ils.actor:open-ils.actor.user.username.update";
var UPDATE_PASSWORD				= "open-ils.actor:open-ils.actor.user.password.update";
var UPDATE_EMAIL					= "open-ils.actor:open-ils.actor.user.email.update";
var RENEW_CIRC						= "open-ils.circ:open-ils.circ.renew";
var CHECK_SPELL					= "open-ils.search:open-ils.search.spell_check";
var FETCH_REVIEWS					= "open-ils.search:open-ils.search.added_content.review.retrieve.all";
var FETCH_TOC						= "open-ils.search:open-ils.search.added_content.toc.retrieve";
var FETCH_ACONT_SUMMARY			= "open-ils.search:open-ils.search.added_content.summary.retrieve";
/* ---------------------------------------------------------------------------- */



/* ---------------------------------------------------------------------------- */
/* event callback functions. Other functions may be appended to these vars to
	for added functionality.  */

G.evt				= {}; /* events container */

function runEvt(scope, name, a, b, c, d, e, f, g) {
	var evt = G.evt[scope][name];
	for( var i in evt ) {
		evt[i](a, b, c, d, e, f, g);	
	}
}

/* creates a new event if it doesn't already exist */
function createEvt(scope, name) {
	if(!G.evt[scope]) G.evt[scope] = {};
	if(G.evt[scope][name] == null)
		G.evt[scope][name] = []; 
}

function attachEvt(scope, name, action) {
	createEvt(scope, name);
	G.evt[scope][name].push(action);
}

function detachAllEvt(scope, name) {
	G.evt[scope][name] = [];
}


createEvt("common", "init");						/* f() : what happens on page init */
createEvt("common", "pageRendered");			/* f() : what happens when the page is done (up to the skin to call this even)*/
createEvt("common", "unload");					/* f() : what happens on window unload (clean memory, etc.)*/
createEvt("common", "locationChanged");		/* f() : what happens when the location has changed */
createEvt("common", "locationUpdated");		/* f() : what happens when the location has updated by the code */

createEvt("common", "run");						/* f() : make the page do stuff */
createEvt("result", "idsReceived");				/* f(ids) */
createEvt("rresult", "recordDrawn");			/* f(recordid, linkDOMNode) : after record is drawn, allow others (xul) to plugin actions */
createEvt("result", "preCollectRecords");		/* f() we're about to go and grab the recs */

createEvt("result", "hitCountReceived");		/* f() : display hit info, pagination, etc. */
createEvt("result", "recordReceived");			/* f(mvr, pagePosition, isMr) : display the record*/
createEvt("result", "recordDrawn");				/* f(recordid, linkDOMNode) : after record is drawn, allow others (xul) to plugin actions */
createEvt("result", "copyCountsReceived");	/* f(mvr, pagePosition, copyCountInfo) : display copy counts*/
createEvt("result", "allRecordsReceived");	/* f(mvrsArray) : add other page stuff, sidebars, etc.*/

createEvt("rdetail", "recordDrawn");			/* f() : the record has been drawn */

createEvt("common", "loggedIn");					/* f() : user has just logged in */
createEvt('result', 'zeroHits');
createEvt('result', 'lowHits');
createEvt('rdetail', 'recordRetrieved');			/* we are about to draw the rdetail page */





