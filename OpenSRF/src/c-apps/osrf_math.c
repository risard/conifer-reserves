#include "opensrf/osrf_app_session.h"
#include "opensrf/osrf_application.h"
#include "objson/object.h"
#include "opensrf/osrf_log.h"

#define MODULENAME "opensrf.math"

int osrfAppInitialize();
int osrfAppChildInit();
int osrfMathRun( osrfMethodContext* );


int osrfAppInitialize() {
	osrfLogInit(MODULENAME);

	osrfAppRegisterMethod( 
			MODULENAME, 
			"add", 
			"osrfMathRun", 
			"Addss two numbers",
			"( num1, num2 )", 2 );

	osrfAppRegisterMethod( 
			MODULENAME, 
			"sub", 
			"osrfMathRun", 
			"Subtracts two numbers",
			"( num1, num2 )", 2 );

	osrfAppRegisterMethod( 
			MODULENAME, 
			"mult", 
			"osrfMathRun", 
			"Multiplies two numbers",
			"( num1, num2 )", 2 );

	osrfAppRegisterMethod( 
			MODULENAME, 
			"div", 
			"osrfMathRun", 
			"Divides two numbers",
			"( num1, num2 )", 2 );

	return 0;
}

int osrfAppChildInit() {
	return 0;
}

int osrfMathRun( osrfMethodContext* ctx ) {

	OSRF_METHOD_VERIFY_CONTEXT(ctx); /* see osrf_application.h */

	osrfLog( OSRF_DEBUG, "Running opensrf.math %s", ctx->method->name );

	/* collect the request params */
	jsonObject* x = jsonObjectGetIndex(ctx->params, 0);
	jsonObject* y = jsonObjectGetIndex(ctx->params, 1);

	if( x && y ) {

		/* pull out the params as strings since they may be either
			strings or numbers depending on the client */
		char* a = jsonObjectToSimpleString(x);
		char* b = jsonObjectToSimpleString(y);

		if( a && b ) {

			/* construct a new params object to send to dbmath */
			jsonObject* newParams = jsonParseString( "[ %s, %s ]", a, b );
			free(a); free(b);

			/* connect to db math */
			osrfAppSession* ses = osrfAppSessionClientInit("opensrf.dbmath");

			/* dbmath uses the same method names that math does */
			int req_id = osrfAppSessionMakeRequest( ses, newParams, ctx->method->name, 1, NULL );
			osrfMessage* omsg = osrfAppSessionRequestRecv( ses, req_id, 60 );

			if(omsg) {
				/* return dbmath's response to the user */
				osrfAppRequestRespondComplete( ctx->session, ctx->request, osrfMessageGetResult(omsg) ); 
				osrfMessageFree(omsg);
				osrfAppSessionFree(ses);
				return 0;
			}

			osrfAppSessionFree(ses);
		}
	}

	return -1;
}



