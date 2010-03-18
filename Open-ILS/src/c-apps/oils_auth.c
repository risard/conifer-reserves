#include "opensrf/osrf_app_session.h"
#include "opensrf/osrf_application.h"
#include "opensrf/osrf_settings.h"
#include "opensrf/osrf_json.h"
#include "opensrf/log.h"
#include "openils/oils_utils.h"
#include "openils/oils_constants.h"
#include "openils/oils_event.h"

#define OILS_AUTH_CACHE_PRFX "oils_auth_"

#define MODULENAME "open-ils.auth"

#define OILS_AUTH_OPAC "opac"
#define OILS_AUTH_STAFF "staff"
#define OILS_AUTH_TEMP "temp"

int osrfAppInitialize();
int osrfAppChildInit();

static int _oilsAuthOPACTimeout = 0;
static int _oilsAuthStaffTimeout = 0;
static int _oilsAuthOverrideTimeout = 0;


/**
	@brief Initialize the application by registering functions for method calls.
	@return Zero in all cases.
*/
int osrfAppInitialize() {

	osrfLogInfo(OSRF_LOG_MARK, "Initializing Auth Server...");

	/* load and parse the IDL */
	if (!oilsInitIDL(NULL)) return 1; /* return non-zero to indicate error */

	osrfAppRegisterMethod(
		MODULENAME,
		"open-ils.auth.authenticate.init",
		"oilsAuthInit",
		"Start the authentication process and returns the intermediate authentication seed"
		" PARAMS( username )", 1, 0 );

	osrfAppRegisterMethod(
		MODULENAME,
		"open-ils.auth.authenticate.complete",
		"oilsAuthComplete",
		"Completes the authentication process.  Returns an object like so: "
		"{authtoken : <token>, authtime:<time>}, where authtoken is the login "
		"token and authtime is the number of seconds the session will be active"
		"PARAMS(username, md5sum( seed + md5sum( password ) ), type, org_id ) "
		"type can be one of 'opac','staff', or 'temp' and it defaults to 'staff' "
		"org_id is the location at which the login should be considered "
		"active for login timeout purposes", 1, 0 );

	osrfAppRegisterMethod(
		MODULENAME,
		"open-ils.auth.session.retrieve",
		"oilsAuthSessionRetrieve",
		"Pass in the auth token and this retrieves the user object.  The auth "
		"timeout is reset when this call is made "
		"Returns the user object (password blanked) for the given login session "
		"PARAMS( authToken )", 1, 0 );

	osrfAppRegisterMethod(
		MODULENAME,
		"open-ils.auth.session.delete",
		"oilsAuthSessionDelete",
		"Destroys the given login session "
		"PARAMS( authToken )",  1, 0 );

	osrfAppRegisterMethod(
		MODULENAME,
		"open-ils.auth.session.reset_timeout",
		"oilsAuthResetTimeout",
		"Resets the login timeout for the given session "
		"Returns an ILS Event with payload = session_timeout of session "
		"if found, otherwise returns the NO_SESSION event"
		"PARAMS( authToken )", 1, 0 );

	return 0;
}

/**
	@brief Dummy placeholder for initializing a server drone.

	There is nothing to do, so do nothing.
*/
int osrfAppChildInit() {
	return 0;
}

/**
	@brief Implement the "init" method.
	@param ctx The method context.
	@return Zero if successful, or -1 if not.

	Method parameters:
	- username

	Return to client: Intermediate authentication seed.

	Combine the username with a timestamp and process ID, and take an md5 hash of the result.
	Store the hash in memcache, with a key based on the username.  Then return the hash to
	the client.

	However: if the username includes one or more embedded blank spaces, return a dummy
	hash without storing anything in memcache.  The dummy will never match a stored hash, so
	any attempt to authenticate with it will fail.
*/
int oilsAuthInit( osrfMethodContext* ctx ) {
	OSRF_METHOD_VERIFY_CONTEXT(ctx);

	char* username  = jsonObjectToSimpleString( jsonObjectGetIndex(ctx->params, 0) );
	if( username ) {

		jsonObject* resp;

		if( strchr( username, ' ' ) ) {

			// Embedded spaces are not allowed in a username.  Use "x" as a dummy
			// seed.  It will never be a valid seed because 'x' is not a hex digit.
			resp = jsonNewObject( "x" );

		} else {

			// Build a key and a seed; store them in memcache.
			char* key  = va_list_to_string( "%s%s", OILS_AUTH_CACHE_PRFX, username );
			char* seed = md5sum( "%d.%ld.%s", (int) time(NULL), (long) getpid(), username );
			osrfCachePutString( key, seed, 30 );

			osrfLogDebug( OSRF_LOG_MARK, "oilsAuthInit(): has seed %s and key %s", seed, key );

			// Build a returnable object containing the seed.
			resp = jsonNewObject( seed );

			free( seed );
			free( key );
		}

		// Return the seed to the client.
		osrfAppRespondComplete( ctx, resp );

		jsonObjectFree(resp);
		free(username);
		return 0;
	}

	return -1;  // Error: no username parameter
}

/**
	Verifies that the user has permission to login with the
	given type.  If the permission fails, an oilsEvent is returned
	to the caller.
	@return -1 if the permission check failed, 0 if the permission
	is granted
*/
static int oilsAuthCheckLoginPerm(
		osrfMethodContext* ctx, const jsonObject* userObj, const char* type ) {

	if(!(userObj && type)) return -1;
	oilsEvent* perm = NULL;

	if(!strcasecmp(type, OILS_AUTH_OPAC)) {
		char* permissions[] = { "OPAC_LOGIN" };
		perm = oilsUtilsCheckPerms( oilsFMGetObjectId( userObj ), -1, permissions, 1 );

	} else if(!strcasecmp(type, OILS_AUTH_STAFF)) {
		char* permissions[] = { "STAFF_LOGIN" };
		perm = oilsUtilsCheckPerms( oilsFMGetObjectId( userObj ), -1, permissions, 1 );

	} else if(!strcasecmp(type, OILS_AUTH_TEMP)) {
		char* permissions[] = { "STAFF_LOGIN" };
		perm = oilsUtilsCheckPerms( oilsFMGetObjectId( userObj ), -1, permissions, 1 );
	}

	if(perm) {
		osrfAppRespondComplete( ctx, oilsEventToJSON(perm) );
		oilsEventFree(perm);
		return -1;
	}

	return 0;
}

/**
	Returns 1 if the password provided matches the user's real password
	Returns 0 otherwise
	Returns -1 on error
*/
/**
	@brief Verify the password received from the client.
	@param ctx The method context.
	@param userObj An object from the database, representing the user.
	@param password An obfuscated password received from the client.
	@return 1 if the password is valid; 0 if it isn't; or -1 upon error.

	(None of the so-called "passwords" used here are in plaintext.  All have been passed
	through at least one layer of hashing to obfuscate them.)

	Take the password from the user object.  Append it to the username seed from memcache,
	as stored previously by a call to the init method.  Take an md5 hash of the result.
	Then compare this hash to the password received from the client.

	In order for the two to match, other than by dumb luck, the client had to construct
	the password it passed in the same way.  That means it neded to know not only the
	original password (either hashed or plaintext), but also the seed.  The latter requirement
	means that the client process needs either to be the same process that called the init
	method or to receive the seed from the process that did so.
*/
static int oilsAuthVerifyPassword( const osrfMethodContext* ctx,
		const jsonObject* userObj, const char* uname, const char* password ) {

	// Get the username seed, as stored previously in memcache by the init method
	char* seed = osrfCacheGetString( "%s%s", OILS_AUTH_CACHE_PRFX, uname );
	if(!seed) {
		return osrfAppRequestRespondException( ctx->session,
			ctx->request, "No authentication seed found. "
			"open-ils.auth.authenticate.init must be called first");
	}

	// Get the hashed password from the user object
	char* realPassword = oilsFMGetString( userObj, "passwd" );

	osrfLogInternal(OSRF_LOG_MARK, "oilsAuth retrieved real password: [%s]", realPassword);
	osrfLogDebug(OSRF_LOG_MARK, "oilsAuth retrieved seed from cache: %s", seed );

	// Concatenate them and take an MD5 hash of the result
	char* maskedPw = md5sum( "%s%s", seed, realPassword );

	free(realPassword);
	free(seed);

	if( !maskedPw ) {
		// This happens only if md5sum() runs out of memory
		free( maskedPw );
		return -1;  // md5sum() ran out of memory
	}

	osrfLogDebug(OSRF_LOG_MARK,  "oilsAuth generated masked password %s. "
			"Testing against provided password %s", maskedPw, password );

	int ret = 0;
	if( !strcmp( maskedPw, password ) )
		ret = 1;

	free(maskedPw);

	return ret;
}

/**
	Calculates the login timeout
	1. If orgloc is 1 or greater and has a timeout specified as an
	org unit setting, it is used
	2. If orgloc is not valid, we check the org unit auth timeout
	setting for the home org unit of the user logging in
	3. If that setting is not defined, we use the configured defaults
*/
static double oilsAuthGetTimeout( const jsonObject* userObj, const char* type, double orgloc ) {

	if(!_oilsAuthOPACTimeout) { /* Load the default timeouts */

		jsonObject* value_obj;

		value_obj = osrf_settings_host_value_object(
			"/apps/open-ils.auth/app_settings/default_timeout/opac" );
		_oilsAuthOPACTimeout = jsonObjectGetNumber(value_obj);
		jsonObjectFree(value_obj);

		value_obj = osrf_settings_host_value_object(
			"/apps/open-ils.auth/app_settings/default_timeout/staff" );
		_oilsAuthStaffTimeout = jsonObjectGetNumber(value_obj);
		jsonObjectFree(value_obj);

		value_obj = osrf_settings_host_value_object(
				"/apps/open-ils.auth/app_settings/default_timeout/temp" );
		_oilsAuthOverrideTimeout = jsonObjectGetNumber(value_obj);
		jsonObjectFree(value_obj);


		osrfLogInfo(OSRF_LOG_MARK,
				"Set default auth timeouts: opac => %d : staff => %d : temp => %d",
				_oilsAuthOPACTimeout, _oilsAuthStaffTimeout, _oilsAuthOverrideTimeout );
	}

	char* setting = NULL;

	double home_ou = jsonObjectGetNumber( oilsFMGetObject( userObj, "home_ou" ) );
	if(orgloc < 1) orgloc = (int) home_ou;

	if(!strcmp(type, OILS_AUTH_OPAC))
		setting = OILS_ORG_SETTING_OPAC_TIMEOUT;
	else if(!strcmp(type, OILS_AUTH_STAFF))
		setting = OILS_ORG_SETTING_STAFF_TIMEOUT;
	else if(!strcmp(type, OILS_AUTH_TEMP))
		setting = OILS_ORG_SETTING_TEMP_TIMEOUT;

	char* timeout = oilsUtilsFetchOrgSetting( orgloc, setting );

	if(!timeout) {
		if( orgloc != home_ou ) {
			osrfLogDebug(OSRF_LOG_MARK, "Auth timeout not defined for org %d, "
								"trying home_ou %d", orgloc, home_ou );
			timeout = oilsUtilsFetchOrgSetting( (int) home_ou, setting );
		}
		if(!timeout) {
			if(!strcmp(type, OILS_AUTH_STAFF)) return _oilsAuthStaffTimeout;
			if(!strcmp(type, OILS_AUTH_TEMP)) return _oilsAuthOverrideTimeout;
			return _oilsAuthOPACTimeout;
		}
	}

	double t = atof(timeout);
	free(timeout);
	return t ;
}

/*
	Adds the authentication token to the user cache.  The timeout for the
	auth token is based on the type of login as well as (if type=='opac')
	the org location id.
	Returns the event that should be returned to the user.
	Event must be freed
*/
static oilsEvent* oilsAuthHandleLoginOK( jsonObject* userObj, const char* uname,
		const char* type, double orgloc, const char* workstation ) {

	oilsEvent* response;

	double timeout;
	char* wsorg = jsonObjectToSimpleString(oilsFMGetObject(userObj, "ws_ou"));
	if(wsorg) { /* if there is a workstation, use it for the timeout */
		osrfLogDebug( OSRF_LOG_MARK,
				"Auth session trying workstation id %d for auth timeout", atoi(wsorg));
		timeout = oilsAuthGetTimeout( userObj, type, atoi(wsorg) );
		free(wsorg);
	} else {
		osrfLogDebug( OSRF_LOG_MARK,
				"Auth session trying org from param [%d] for auth timeout", orgloc );
		timeout = oilsAuthGetTimeout( userObj, type, orgloc );
	}
	osrfLogDebug(OSRF_LOG_MARK, "Auth session timeout for %s: %f", uname, timeout );

	char* string = va_list_to_string(
			"%d.%ld.%s", (long) getpid(), time(NULL), uname );
	char* authToken = md5sum(string);
	char* authKey = va_list_to_string(
			"%s%s", OILS_AUTH_CACHE_PRFX, authToken );

	const char* ws = (workstation) ? workstation : "";
	osrfLogActivity(OSRF_LOG_MARK,
		"successful login: username=%s, authtoken=%s, workstation=%s", uname, authToken, ws );

	oilsFMSetString( userObj, "passwd", "" );
	jsonObject* cacheObj = jsonParseFmt("{\"authtime\": %f}", timeout);
	jsonObjectSetKey( cacheObj, "userobj", jsonObjectClone(userObj));

	osrfCachePutObject( authKey, cacheObj, timeout );
	jsonObjectFree(cacheObj);
	osrfLogInternal(OSRF_LOG_MARK, "oilsAuthHandleLoginOK(): Placed user object into cache");
	jsonObject* payload = jsonParseFmt(
		"{ \"authtoken\": \"%s\", \"authtime\": %f }", authToken, timeout );

	response = oilsNewEvent2( OSRF_LOG_MARK, OILS_EVENT_SUCCESS, payload );
	free(string); free(authToken); free(authKey);
	jsonObjectFree(payload);

	return response;
}

static oilsEvent* oilsAuthVerifyWorkstation(
		const osrfMethodContext* ctx, jsonObject* userObj, const char* ws ) {
	osrfLogInfo(OSRF_LOG_MARK, "Attaching workstation to user at login: %s", ws);
	jsonObject* workstation = oilsUtilsFetchWorkstationByName(ws);
	if(!workstation || workstation->type == JSON_NULL) {
		jsonObjectFree(workstation);
		return oilsNewEvent(OSRF_LOG_MARK, "WORKSTATION_NOT_FOUND");
	}
	long wsid = oilsFMGetObjectId(workstation);
	LONG_TO_STRING(wsid);
	char* orgid = oilsFMGetString(workstation, "owning_lib");
	oilsFMSetString(userObj, "wsid", LONGSTR);
	oilsFMSetString(userObj, "ws_ou", orgid);
	free(orgid);
	jsonObjectFree(workstation);
	return NULL;
}



/**
	@brief Implement the "complete" method.
	@param ctx The method context.
	@return -1 upon error; zero if successful, and if a STATUS message has been sent to the
	client to indicate completion; a positive integer if successful but no such STATUS
	message has been sent.

	Method parameters:
	- a hash with some combination of the following elements:
		- "username"
		- "barcode"
		- "password" (hashed with the cached seed; not plaintext)
		- "type"
		- "org"
		- "workstation"

	The password is required.  Either a username or a barcode must also be present.

	Return to client: Intermediate authentication seed.

	Validate the password, using the username if available, or the barcode if not.  The
	user must be active, and not barred from logging on.  The barcode, if used for
	authentication, must be active as well.  The workstation, if specified, must be valid.

	Upon deciding whether to allow the logon, return a corresponding event to the client.
*/
int oilsAuthComplete( osrfMethodContext* ctx ) {
	OSRF_METHOD_VERIFY_CONTEXT(ctx);

	const jsonObject* args  = jsonObjectGetIndex(ctx->params, 0);

	const char* uname       = jsonObjectGetString(jsonObjectGetKeyConst(args, "username"));
	const char* password    = jsonObjectGetString(jsonObjectGetKeyConst(args, "password"));
	const char* type        = jsonObjectGetString(jsonObjectGetKeyConst(args, "type"));
	double orgloc           = jsonObjectGetNumber(jsonObjectGetKeyConst(args, "org"));
	const char* workstation = jsonObjectGetString(jsonObjectGetKeyConst(args, "workstation"));
	const char* barcode     = jsonObjectGetString(jsonObjectGetKeyConst(args, "barcode"));

	const char* ws = (workstation) ? workstation : "";

	if( !type )
		 type = OILS_AUTH_STAFF;

	if( !( (uname || barcode) && password) ) {
		return osrfAppRequestRespondException( ctx->session, ctx->request,
			"username/barcode and password required for method: %s", ctx->method->name );
	}

	oilsEvent* response = NULL;
	jsonObject* userObj = NULL;
	int card_active     = 1;      // boolean; assume active until proven otherwise

	// Fetch a row from the actor.usr table, by username if available,
	// or by barcode if not.
	if(uname) {
		userObj = oilsUtilsFetchUserByUsername( uname );
		if( userObj && JSON_NULL == userObj->type ) {
			jsonObjectFree( userObj );
			userObj = NULL;         // username not found
		}
	}
	else if(barcode) {
		// Read from actor.card by barcode

		osrfLogInfo( OSRF_LOG_MARK, "Fetching user by barcode %s", barcode );

		jsonObject* params = jsonParseFmt("{\"barcode\":\"%s\"}", barcode);
		jsonObject* card = oilsUtilsQuickReq(
			"open-ils.cstore", "open-ils.cstore.direct.actor.card.search", params );
		jsonObjectFree( params );

		if( card ) {
			// Determine whether the card is active
			char* card_active_str = oilsFMGetString( card, "active" );
			card_active = oilsUtilsIsDBTrue( card_active_str );
			free( card_active_str );

			// Look up the user who owns the card
			char* userid = oilsFMGetString( card, "usr" );
			jsonObjectFree( card );
			params = jsonParseFmt( "[%s]", userid );
			free( userid );
			userObj = oilsUtilsQuickReq(
					"open-ils.cstore", "open-ils.cstore.direct.actor.user.retrieve", params );
			jsonObjectFree( params );
		}
	}

	if(!userObj) {
		response = oilsNewEvent( OSRF_LOG_MARK, OILS_EVENT_AUTH_FAILED );
		osrfLogInfo(OSRF_LOG_MARK,  "failed login: username=%s, barcode=%s, workstation=%s",
				uname, (barcode ? barcode : "(none)"), ws );
		osrfAppRespondComplete( ctx, oilsEventToJSON(response) );
		oilsEventFree(response);
		return 0;           // No such user
	}

	// Such a user exists.  Now see if he or she has the right credentials.
	int passOK = -1;
	if(uname)
		passOK = oilsAuthVerifyPassword( ctx, userObj, uname, password );
	else if (barcode)
		passOK = oilsAuthVerifyPassword( ctx, userObj, barcode, password );

	if( passOK < 0 ) {
		jsonObjectFree(userObj);
		return passOK;
	}

	// See if the account is active
	char* active = oilsFMGetString(userObj, "active");
	if( !oilsUtilsIsDBTrue(active) ) {
		if( passOK )
			response = oilsNewEvent( OSRF_LOG_MARK, "PATRON_INACTIVE" );
		else
			response = oilsNewEvent( OSRF_LOG_MARK, OILS_EVENT_AUTH_FAILED );

		osrfAppRespondComplete( ctx, oilsEventToJSON(response) );
		oilsEventFree(response);
		jsonObjectFree(userObj);
		free(active);
		return 0;
	}
	free(active);

	osrfLogInfo( OSRF_LOG_MARK, "Fetching card by barcode %s", barcode );

	if( !card_active ) {
		osrfLogInfo( OSRF_LOG_MARK, "barcode %s is not active, returning event", barcode );
		response = oilsNewEvent( OSRF_LOG_MARK, "PATRON_CARD_INACTIVE" );
		osrfAppRespondComplete( ctx, oilsEventToJSON( response ) );
		oilsEventFree( response );
		jsonObjectFree( userObj );
		return 0;
	}


	// See if the user is even allowed to log in
	if( oilsAuthCheckLoginPerm( ctx, userObj, type ) == -1 ) {
		jsonObjectFree(userObj);
		return 0;
	}

	// If a workstation is defined, add the workstation info
	if( workstation != NULL ) {
		osrfLogDebug(OSRF_LOG_MARK, "Workstation is %s", workstation);
		response = oilsAuthVerifyWorkstation( ctx, userObj, workstation );
		if(response) {
			jsonObjectFree(userObj);
			osrfAppRespondComplete( ctx, oilsEventToJSON(response) );
			oilsEventFree(response);
			return 0;
		}

	} else {
		// Otherwise, use the home org as the workstation org on the user
		char* orgid = oilsFMGetString(userObj, "home_ou");
		oilsFMSetString(userObj, "ws_ou", orgid);
		free(orgid);
	}

	char* freeable_uname = NULL;
	if(!uname) {
		uname = freeable_uname = oilsFMGetString( userObj, "usrname" );
	}

	if( passOK ) {
		response = oilsAuthHandleLoginOK( userObj, uname, type, orgloc, workstation );

	} else {
		response = oilsNewEvent( OSRF_LOG_MARK, OILS_EVENT_AUTH_FAILED );
		osrfLogInfo(OSRF_LOG_MARK,  "failed login: username=%s, barcode=%s, workstation=%s",
				uname, (barcode ? barcode : "(none)"), ws );
	}

	jsonObjectFree(userObj);
	osrfAppRespondComplete( ctx, oilsEventToJSON(response) );
	oilsEventFree(response);

	if(freeable_uname)
		free(freeable_uname);

	return 0;
}



int oilsAuthSessionDelete( osrfMethodContext* ctx ) {
	OSRF_METHOD_VERIFY_CONTEXT(ctx);

	const char* authToken = jsonObjectGetString( jsonObjectGetIndex(ctx->params, 0) );
	jsonObject* resp = NULL;

	if( authToken ) {
		osrfLogDebug(OSRF_LOG_MARK, "Removing auth session: %s", authToken );
		char* key = va_list_to_string("%s%s", OILS_AUTH_CACHE_PRFX, authToken ); /**/
		osrfCacheRemove(key);
		resp = jsonNewObject(authToken); /**/
		free(key);
	}

	osrfAppRespondComplete( ctx, resp );
	jsonObjectFree(resp);
	return 0;
}

/**
	Resets the auth login timeout
	@return The event object, OILS_EVENT_SUCCESS, or OILS_EVENT_NO_SESSION
*/
static oilsEvent*  _oilsAuthResetTimeout( const char* authToken ) {
	if(!authToken) return NULL;

	oilsEvent* evt = NULL;
	double timeout;

	osrfLogDebug(OSRF_LOG_MARK, "Resetting auth timeout for session %s", authToken);
	char* key = va_list_to_string("%s%s", OILS_AUTH_CACHE_PRFX, authToken );
	jsonObject* cacheObj = osrfCacheGetObject( key );

	if(!cacheObj) {
		osrfLogInfo(OSRF_LOG_MARK, "No user in the cache exists with key %s", key);
		evt = oilsNewEvent(OSRF_LOG_MARK, OILS_EVENT_NO_SESSION);

	} else {

		timeout = jsonObjectGetNumber( jsonObjectGetKeyConst( cacheObj, "authtime"));
		osrfCacheSetExpire( timeout, key );
		jsonObject* payload = jsonNewNumberObject(timeout);
		evt = oilsNewEvent2(OSRF_LOG_MARK, OILS_EVENT_SUCCESS, payload);
		jsonObjectFree(payload);
		jsonObjectFree(cacheObj);
	}

	free(key);
	return evt;
}

int oilsAuthResetTimeout( osrfMethodContext* ctx ) {
	OSRF_METHOD_VERIFY_CONTEXT(ctx);
	const char* authToken = jsonObjectGetString( jsonObjectGetIndex(ctx->params, 0));
	oilsEvent* evt = _oilsAuthResetTimeout(authToken);
	osrfAppRespondComplete( ctx, oilsEventToJSON(evt) );
	oilsEventFree(evt);
	return 0;
}


int oilsAuthSessionRetrieve( osrfMethodContext* ctx ) {
	OSRF_METHOD_VERIFY_CONTEXT(ctx);

	const char* authToken = jsonObjectGetString( jsonObjectGetIndex(ctx->params, 0));
	jsonObject* cacheObj = NULL;
	oilsEvent* evt = NULL;

	if( authToken ){

		evt = _oilsAuthResetTimeout(authToken);

		if( evt && strcmp(evt->event, OILS_EVENT_SUCCESS) ) {
			osrfAppRespondComplete( ctx, oilsEventToJSON(evt) );

		} else {

			osrfLogDebug(OSRF_LOG_MARK, "Retrieving auth session: %s", authToken);
			char* key = va_list_to_string("%s%s", OILS_AUTH_CACHE_PRFX, authToken );
			cacheObj = osrfCacheGetObject( key );
			if(cacheObj) {
				osrfAppRespondComplete( ctx, jsonObjectGetKeyConst( cacheObj, "userobj"));
				jsonObjectFree(cacheObj);
			} else {
				oilsEvent* evt2 = oilsNewEvent(OSRF_LOG_MARK, OILS_EVENT_NO_SESSION);
				osrfAppRespondComplete( ctx, oilsEventToJSON(evt2) ); /* should be event.. */
				oilsEventFree(evt2);
			}
			free(key);
		}

	} else {

		evt = oilsNewEvent(OSRF_LOG_MARK, OILS_EVENT_NO_SESSION);
		osrfAppRespondComplete( ctx, oilsEventToJSON(evt) );
	}

	if(evt)
		oilsEventFree(evt);

	return 0;
}
