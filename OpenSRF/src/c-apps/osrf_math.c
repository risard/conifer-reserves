#include "opensrf/osrf_app_session.h"
#include "opensrf/osrf_application.h"
#include "objson/object.h"
#include "opensrf/log.h"

#define MODULENAME "opensrf.math"

int osrfAppInitialize();
int osrfAppChildInit();
void osrfAppChildExit();
int osrfMathRun( osrfMethodContext* );


int osrfAppInitialize() {

	osrfAppRegisterMethod( 
			MODULENAME,				/* which application has this method */
			"add",					/* the name of the method */
			"osrfMathRun",			/* the symbol that runs the method */
			"Adds two numbers",	/* description of the method */
			2,							/* the minimum number of params required to run the method */
			0 );						/* method options, 0 for not special options */

	osrfAppRegisterMethod( 
			MODULENAME, 
			"sub", 
			"osrfMathRun", 
			"Subtracts two numbers", 2, 0 );

	osrfAppRegisterMethod( 
			MODULENAME, 
			"mult", 
			"osrfMathRun", 
			"Multiplies two numbers", 2, 0 );

	osrfAppRegisterMethod( 
			MODULENAME, 
			"div", 
			"osrfMathRun", 
			"Divides two numbers", 2, 0 );

	return 0;
}

/* called when this process is just coming into existence */
int osrfAppChildInit() {
	return 0;
}

/* called when this process is about to exit */
void osrfAppChildExit() {
   osrfLogDebug(OSRF_LOG_MARK, "Child is exiting...");
}


int osrfMathRun( osrfMethodContext* ctx ) {

	OSRF_METHOD_VERIFY_CONTEXT(ctx); /* see osrf_application.h */

	/* collect the request params */
	jsonObject* x = jsonObjectGetIndex(ctx->params, 0);
	jsonObject* y = jsonObjectGetIndex(ctx->params, 1);

	if( x && y ) {

		/* pull out the params as strings since they may be either
			strings or numbers depending on the client */
		char* a = jsonObjectToSimpleString(x);
		char* b = jsonObjectToSimpleString(y);

		if( a && b ) {

			osrfLogActivity( OSRF_LOG_MARK, "Running opensrf.math %s [ %s : %s ]", 
					ctx->method->name, a, b );

			/* construct a new params object to send to dbmath */
			jsonObject* newParams = jsonParseStringFmt( "[ %s, %s ]", a, b );
			free(a); free(b);

			/* connect to db math */
			osrfAppSession* ses = osrfAppSessionClientInit("opensrf.dbmath");

			/* forcing an explicit connect allows us to talk to one worker backend
			 * regardless of "stateful" config settings for the server 
			 * This buys us nothing here since we're only sending one request...
			 * */
			/*osrfAppSessionConnect(ses);*/

			/* dbmath uses the same method names that math does */
			int req_id = osrfAppSessionMakeRequest( ses, newParams, ctx->method->name, 1, NULL );
			osrfMessage* omsg = osrfAppSessionRequestRecv( ses, req_id, 60 );

			if(omsg) {
				/* return dbmath's response to the user */
				osrfAppRespondComplete( ctx, osrfMessageGetResult(omsg) ); 
				osrfMessageFree(omsg);
				osrfAppSessionFree(ses);
				return 0;
			}

			osrfAppSessionFree(ses);
		}
	}

	return -1;
}



