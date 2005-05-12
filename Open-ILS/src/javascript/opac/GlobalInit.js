/* */

var globalPage						= null; /* the current top level page object */
var globalUser						= null; /* the user session */
var globalOrgTreeWidget			= null;
var globalLocation				= null;
var globalOrgTreeWidgetBox		= null;
var globalSelectedLocation		= null;
var globalSearchDepth			= null;
var globalMenuManager			= null;

var loaded = false;

function isXUL() {
	try {
		if(IAMXUL)
			return true;
	} catch(E) {
		return false;
	}
}


function globalInit() {

	debug(" --- XUL IS " + isXUL() );

	var page_name = globalPageTarget;

	if(!page_name) 
		throw new EXArg("globalInit requires globalPageTarget to be set");

	debug("globalInit init-ing page: " + page_name );

	switch( page_name ) {

		case "start":
			globalPage = new OPACStartPage();
			break;

		case  "advanced_search":
			globalPage = new AdvancedSearchPage();
			break;

		case  "mr_result":
			globalPage = new MRResultPage();
			break;

		case  "record_result":
			globalPage = new RecordResultPage();
			break;

		case  "login":
			globalPage = new LoginPage();
			break;

		case  "logout":
			globalPage = new LogoutPage();
			break;

		case  "my_opac":
			globalPage = new MyOPACPage();
			break;

		case "record_detail":
			globalPage = new RecordDetailPage();
			break;

		case  "about":
			globalPage = new AboutPage();
			break;

		}

	if( ! globalPage ) 
		throw new EXArg(
			"globalInit requires a valid page target: " + page_name );

	if(!loaded) { loaded = true; GlobalInitLoad(); }

	globalMenuManager = new ContextMenuManager();

	/* hide all context menus on body click */
	getDocument().body.onclick = function() {
			globalMenuManager.hideAll(); 
	}

	globalPage.init();
	globalPage.setLocDisplay();
	globalPage.locationTree = globalOrgTreeWidget;

	if(globalSearchBarChunk)
		globalSearchBarChunk.reset();
	
	if( globalSearchBarFormChunk != null)
		globalSearchBarFormChunk.resetPage();

}


/* we only do this on loading of the outer frame (i.e. only once) */
function GlobalInitLoad() {

	debug("Global Init is doing its primary load");
	globalOrgTreeWidget = new LocationTree(globalOrgTree);
	globalUser = UserSession.instance();

	var ses = null;
	var org = null;

	if(isXUL()) {
		ses = G['auth_ses'][0]; /* G is shoved in by XUL */
		org = G['user_ou']; /* the desired location of the user */
	}

	if(globalUser.verifySession(ses)) {
		globalUser.grabOrgUnit(org);

	} else  {
		globalUser = null;
		globalLocation = globalOrgTree;
		globalSearchDepth = findOrgDepth(globalOrgTree.ou_type());
	}

}


