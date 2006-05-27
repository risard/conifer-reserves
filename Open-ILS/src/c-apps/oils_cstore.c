#include "opensrf/osrf_application.h"
#include "opensrf/osrf_settings.h"
#include "opensrf/utils.h"
#include "objson/object.h"
#include "opensrf/log.h"
#include "oils_utils.h"
#include "oils_constants.h"
#include "oils_event.h"
#include <dbi/dbi.h>

#include <time.h>
#include <stdlib.h>
#include <string.h>
#include <libxml/globals.h>
#include <libxml/xmlerror.h>
#include <libxml/parser.h>
#include <libxml/tree.h>
#include <libxml/debugXML.h>
#include <libxml/xmlmemory.h>

#define OILS_AUTH_CACHE_PRFX "oils_cstore_"
#define MODULENAME "open-ils.cstore"
#define PERSIST_NS "http://open-ils.org/spec/opensrf/IDL/persistance/v1"
#define OBJECT_NS "http://open-ils.org/spec/opensrf/IDL/objects/v1"
#define BASE_NS "http://opensrf.org/spec/IDL/base/v1"

int osrfAppChildInit();
int osrfAppInitialize();

int verifyObjectClass ( osrfMethodContext*, jsonObject* );

int beginTransaction ( osrfMethodContext* );
int commitTransaction ( osrfMethodContext* );
int rollbackTransaction ( osrfMethodContext* );

int setSavepoint ( osrfMethodContext* );
int releaseSavepoint ( osrfMethodContext* );
int rollbackSavepoint ( osrfMethodContext* );

int dispatchCRUDMethod ( osrfMethodContext* );
jsonObject* doCreate ( osrfMethodContext*, int* );
jsonObject* doRetrieve ( osrfMethodContext*, int* );
jsonObject* doUpdate ( osrfMethodContext*, int* );
jsonObject* doDelete ( osrfMethodContext*, int* );
jsonObject* doSearch ( osrfMethodContext*, osrfHash*, jsonObject*, int* );
jsonObject* oilsMakeJSONFromResult( dbi_result, osrfHash* );

char* searchSimplePredicate ( const char*, osrfHash*, jsonObject* );
char* searchFunctionPredicate ( osrfHash*, jsonObjectNode* );
char* searchBETWEENPredicate ( osrfHash*, jsonObject* );
char* searchINPredicate ( osrfHash*, jsonObject* );
char* searchPredicate ( osrfHash*, jsonObject* );

void userDataFree( void* );
void sessionDataFree( char*, void* );

dbi_conn dbhandle; /* our db connection */
xmlDocPtr idlDoc = NULL; // parse and store the IDL here
jsonObject* jsonNULL = NULL; // 


/* parse and store the IDL here */
osrfHash* idlHash;

int osrfAppInitialize() {

	// first we register all the transaction and savepoint methods
	osrfAppRegisterMethod( MODULENAME, "open-ils.cstore.transaction.begin", "beginTransaction", "", 0, 0 );
	osrfAppRegisterMethod( MODULENAME, "open-ils.cstore.transaction.commit", "commitTransaction", "", 0, 0 );
	osrfAppRegisterMethod( MODULENAME, "open-ils.cstore.transaction.rollback", "rollbackTransaction", "", 0, 0 );

	osrfAppRegisterMethod( MODULENAME, "open-ils.cstore.savepoint.set", "setSavepoint", "", 1, 0 );
	osrfAppRegisterMethod( MODULENAME, "open-ils.cstore.savepoint.release", "releaseSavepoint", "", 1, 0 );
	osrfAppRegisterMethod( MODULENAME, "open-ils.cstore.savepoint.rollback", "rollbackSavepoint", "", 1, 0 );


	idlHash = osrfNewHash();
	osrfHash* usrData = NULL;

	osrfLogInfo(OSRF_LOG_MARK, "Initializing the CStore Server...");
	osrfLogInfo(OSRF_LOG_MARK, "Finding XML file...");

	char * idl_filename = osrf_settings_host_value("/apps/%s/app_settings/IDL", MODULENAME);
	osrfLogInfo(OSRF_LOG_MARK, "Found file:");
	osrfLogInfo(OSRF_LOG_MARK, idl_filename);

	osrfLogInfo(OSRF_LOG_MARK, "Parsing the IDL XML...");
	idlDoc = xmlReadFile( idl_filename, NULL, XML_PARSE_XINCLUDE );
	
	if (!idlDoc) {
		osrfLogError(OSRF_LOG_MARK, "Could not load or parse the IDL XML file!");
		exit(1);
	}

	osrfLogInfo(OSRF_LOG_MARK, "...IDL XML parsed");

	osrfStringArray* global_methods = osrfNewStringArray(1);

	osrfStringArrayAdd( global_methods, "create" );
	osrfStringArrayAdd( global_methods, "retrieve" );
	osrfStringArrayAdd( global_methods, "update" );
	osrfStringArrayAdd( global_methods, "delete" );
	osrfStringArrayAdd( global_methods, "search" );

	xmlNodePtr docRoot = xmlDocGetRootElement(idlDoc);
	xmlNodePtr kid = docRoot->children;
	while (kid) {
		if (!strcmp( (char*)kid->name, "class" )) {

			usrData = osrfNewHash();
			osrfHashSet( usrData, xmlGetProp(kid, "id"), "classname");
			osrfHashSet( usrData, xmlGetNsProp(kid, "tablename", PERSIST_NS), "tablename");
			osrfHashSet( usrData, xmlGetNsProp(kid, "fieldmapper", OBJECT_NS), "fieldmapper");

			osrfHashSet( idlHash, usrData, (char*)osrfHashGet(usrData, "classname") );

			osrfLogInfo(OSRF_LOG_MARK, "Generating class methods for %s", osrfHashGet(usrData, "fieldmapper") );

			osrfHash* _tmp;
			osrfHash* links = osrfNewHash();
			osrfHash* fields = osrfNewHash();

			osrfHashSet( usrData, fields, "fields" );
			osrfHashSet( usrData, links, "links" );

			xmlNodePtr _cur = kid->children;

			while (_cur) {
				char* string_tmp = NULL;

				if (!strcmp( (char*)_cur->name, "fields" )) {

					if( (string_tmp = (char*)xmlGetNsProp(_cur, "primary", PERSIST_NS)) ) {
						osrfHashSet(
							usrData,
							strdup( string_tmp ),
							"primarykey"
						);
					}
					string_tmp = NULL;

					if( (string_tmp = (char*)xmlGetNsProp(_cur, "sequence", PERSIST_NS)) ) {
						osrfHashSet(
							usrData,
							strdup( string_tmp ),
							"sequence"
						);
					}
					string_tmp = NULL;

					xmlNodePtr _f = _cur->children;

					while(_f) {
						if (strcmp( (char*)_f->name, "field" )) {
							_f = _f->next;
							continue;
						}

						_tmp = osrfNewHash();

						if( (string_tmp = (char*)xmlGetNsProp(_f, "array_position", OBJECT_NS)) ) {
							osrfHashSet(
								_tmp,
								strdup( string_tmp ),
								"array_position"
							);
						}
						string_tmp = NULL;

						if( (string_tmp = (char*)xmlGetNsProp(_f, "virtual", PERSIST_NS)) ) {
							osrfHashSet(
								_tmp,
								strdup( string_tmp ),
								"virtual"
							);
						}
						string_tmp = NULL;

						if( (string_tmp = (char*)xmlGetProp(_f, "name")) ) {
							osrfHashSet(
								_tmp,
								strdup( string_tmp ),
								"name"
							);
						}

						osrfLogInfo(OSRF_LOG_MARK, "Found field %s for class %s", string_tmp, osrfHashGet(usrData, "classname") );

						osrfHashSet(
							fields,
							_tmp,
							strdup( string_tmp )
						);
						_f = _f->next;
					}
				}

				if (!strcmp( (char*)_cur->name, "links" )) {
					xmlNodePtr _l = _cur->children;

					while(_l) {
						if (strcmp( (char*)_l->name, "link" )) {
							_l = _l->next;
							continue;
						}

						_tmp = osrfNewHash();

						if( (string_tmp = (char*)xmlGetProp(_l, "reltype")) ) {
							osrfHashSet(
								_tmp,
								strdup( string_tmp ),
								"reltype"
							);
						}
						osrfLogInfo(OSRF_LOG_MARK, "Adding link with reltype %s", string_tmp );
						string_tmp = NULL;

						if( (string_tmp = (char*)xmlGetProp(_l, "key")) ) {
							osrfHashSet(
								_tmp,
								strdup( string_tmp ),
								"key"
							);
						}
						osrfLogInfo(OSRF_LOG_MARK, "Link fkey is %s", string_tmp );
						string_tmp = NULL;

						if( (string_tmp = (char*)xmlGetProp(_l, "class")) ) {
							osrfHashSet(
								_tmp,
								strdup( string_tmp ),
								"class"
							);
						}
						osrfLogInfo(OSRF_LOG_MARK, "Link fclass is %s", string_tmp );
						string_tmp = NULL;

						osrfStringArray* map = osrfNewStringArray(0);

						if( (string_tmp = (char*)xmlGetProp(_l, "map") )) {
							char* map_list = strdup( string_tmp );
							osrfLogInfo(OSRF_LOG_MARK, "Link mapping list is %s", string_tmp );

							if (strlen( map_list ) > 0) {
								char* st_tmp;
								char* _map_class = strtok_r(map_list, " ", &st_tmp);
								osrfStringArrayAdd(map, strdup(_map_class));
						
								while ((_map_class = strtok_r(NULL, " ", &st_tmp))) {
									osrfStringArrayAdd(map, strdup(_map_class));
								}
							}
						}
						osrfHashSet( _tmp, map, "map");

						if( (string_tmp = (char*)xmlGetProp(_l, "field")) ) {
							osrfHashSet(
								_tmp,
								strdup( string_tmp ),
								"field"
							);
						}

						osrfHashSet(
							links,
							_tmp,
							strdup( string_tmp )
						);

						osrfLogInfo(OSRF_LOG_MARK, "Found link %s for class %s", string_tmp, osrfHashGet(usrData, "classname") );

						_l = _l->next;
					}
				}

				_cur = _cur->next;
			}

			int i = 0; 
			char* method_type;
			char* st_tmp;
			char* _fm;
			char* part;
			osrfHash* method_meta;
			while ( (method_type = osrfStringArrayGetString(global_methods, i++)) ) {

				if (!osrfHashGet(usrData, "fieldmapper")) continue;

				method_meta = osrfNewHash();
				osrfHashSet(method_meta, usrData, "class");

				_fm = strdup( (char*)osrfHashGet(usrData, "fieldmapper") );
				part = strtok_r(_fm, ":", &st_tmp);

				growing_buffer* method_name =  buffer_init(64);
				buffer_fadd(method_name, "%s.direct.%s", MODULENAME, part);

				while ((part = strtok_r(NULL, ":", &st_tmp))) {
					buffer_fadd(method_name, ".%s", part);
				}
				buffer_fadd(method_name, ".%s", method_type);


				char* method = buffer_data(method_name);
				buffer_free(method_name);
				free(_fm);

				osrfHashSet( method_meta, method, "methodname" );
				osrfHashSet( method_meta, method_type, "methodtype" );

				int flags = 0;
				if (!(strcmp( method_type, "search" ))) {
					flags = flags | OSRF_METHOD_STREAMING;
				}

				osrfAppRegisterExtendedMethod(
					MODULENAME,
					method,
					"dispatchCRUDMethod",
					"",
					1,
					flags,
					(void*)method_meta
				);
			}
		}
		kid = kid->next;
	}

	return 0;
}

/**
 * Connects to the database 
 */
int osrfAppChildInit() {

	osrfLogDebug(OSRF_LOG_MARK, "Attempting to initialize libdbi...");
	dbi_initialize(NULL);
	osrfLogDebug(OSRF_LOG_MARK, "... libdbi initialized.");

	char* driver	= osrf_settings_host_value("/apps/%s/app_settings/driver", MODULENAME);
	char* user	= osrf_settings_host_value("/apps/%s/app_settings/database/user", MODULENAME);
	char* host	= osrf_settings_host_value("/apps/%s/app_settings/database/host", MODULENAME);
	char* port	= osrf_settings_host_value("/apps/%s/app_settings/database/port", MODULENAME);
	char* db	= osrf_settings_host_value("/apps/%s/app_settings/database/db", MODULENAME);
	char* pw	= osrf_settings_host_value("/apps/%s/app_settings/database/pw", MODULENAME);

	osrfLogDebug(OSRF_LOG_MARK, "Attempting to load the database driver [%s]...", driver);
	dbhandle = dbi_conn_new(driver);

	if(!dbhandle) {
		osrfLogError(OSRF_LOG_MARK, "Error loading database driver [%s]", driver);
		return -1;
	}
	osrfLogDebug(OSRF_LOG_MARK, "Database driver [%s] seems OK", driver);

	osrfLogInfo(OSRF_LOG_MARK, "%s connecting to database.  host=%s, "
		"port=%s, user=%s, pw=%s, db=%s", MODULENAME, host, port, user, pw, db );

	if(host) dbi_conn_set_option(dbhandle, "host", host );
	if(port) dbi_conn_set_option_numeric( dbhandle, "port", atoi(port) );
	if(user) dbi_conn_set_option(dbhandle, "username", user);
	if(pw) dbi_conn_set_option(dbhandle, "password", pw );
	if(db) dbi_conn_set_option(dbhandle, "dbname", db );

	free(user);
	free(host);
	free(port);
	free(db);
	free(pw);

	const char* err;
	if (dbi_conn_connect(dbhandle) < 0) {
		dbi_conn_error(dbhandle, &err);
		osrfLogError( OSRF_LOG_MARK, "Error connecting to database: %s", err);
		return -1;
	}

	osrfLogInfo(OSRF_LOG_MARK, "%s successfully connected to the database", MODULENAME);

	int attr;
	unsigned short type;
	int i = 0; 
	char* classname;
	osrfStringArray* classes = osrfHashKeys( idlHash );
	
	while ( (classname = osrfStringArrayGetString(classes, i++)) ) {
		osrfHash* class = osrfHashGet( idlHash, classname );
		osrfHash* fields = osrfHashGet( class, "fields" );
		
		growing_buffer* sql_buf = buffer_init(32);
		buffer_fadd( sql_buf, "SELECT * FROM %s WHERE 1=0;", osrfHashGet(class, "tablename") );

		char* sql = buffer_data(sql_buf);
		buffer_free(sql_buf);
		osrfLogDebug(OSRF_LOG_MARK, "%s Investigatory SQL = %s", MODULENAME, sql);

		dbi_result result = dbi_conn_query(dbhandle, sql);
		free(sql);

		if (result) {

			int columnIndex = 1;
			const char* columnName;
			osrfHash* _f;
			while( (columnName = dbi_result_get_field_name(result, columnIndex++)) ) {

				osrfLogDebug(OSRF_LOG_MARK, "Looking for column named [%s]...", (char*)columnName);

				/* fetch the fieldmapper index */
				if( (_f = osrfHashGet(fields, (char*)columnName)) ) {

					osrfLogDebug(OSRF_LOG_MARK, "Found [%s] in IDL hash...", (char*)columnName);

					/* determine the field type and storage attributes */
					type = dbi_result_get_field_type(result, columnName);
					attr = dbi_result_get_field_attribs(result, columnName);

					switch( type ) {

						case DBI_TYPE_INTEGER :

							osrfHashSet(_f,"number", "primitive");

							if( attr & DBI_INTEGER_SIZE8 ) 
								osrfHashSet(_f,"INT8", "datatype");
							else 
								osrfHashSet(_f,"INT", "datatype");
							break;

						case DBI_TYPE_DECIMAL :
							osrfHashSet(_f,"number", "primitive");
							osrfHashSet(_f,"NUMERIC", "datatype");
							break;

						case DBI_TYPE_STRING :
							osrfHashSet(_f,"string", "primitive");
							osrfHashSet(_f,"TEXT", "datatype");
							break;

						case DBI_TYPE_DATETIME :
							osrfHashSet(_f,"string", "primitive");
							osrfHashSet(_f,"TIMESTAMP", "datatype");
							break;

						case DBI_TYPE_BINARY :
							osrfHashSet(_f,"string", "primitive");
							osrfHashSet(_f,"BYTEA", "datatype");
					}

					osrfLogDebug(
						OSRF_LOG_MARK,
						"Setting [%s] to primitive [%s] and datatype [%s]...",
						(char*)columnName,
						osrfHashGet(_f, "primitive"),
						osrfHashGet(_f, "datatype")
					);
				}
			}
			dbi_result_free(result);
		} else {
			osrfLogDebug(OSRF_LOG_MARK, "No data found for class [%s]...", (char*)classname);
		}
	}

	osrfStringArrayFree(classes);

	return 0;
}

void userDataFree( void* blob ) {
	osrfHashFree( (osrfHash*)blob );
	return;
}

void sessionDataFree( char* key, void* item ) {
	if (!(strcmp(key,"xact_id")))
		free(item);

	return;
}

int beginTransaction ( osrfMethodContext* ctx ) {
	OSRF_METHOD_VERIFY_CONTEXT(ctx);

	dbi_result result = dbi_conn_query(dbhandle, "START TRANSACTION;");
	if (!result) {
		osrfLogError(OSRF_LOG_MARK, "%s: Error starting transaction", MODULENAME );
		osrfAppSessionStatus( ctx->session, OSRF_STATUS_INTERNALSERVERERROR, "osrfMethodException", ctx->request, "Error starting transaction" );
		return -1;
	} else {
		jsonObject* ret = jsonNewObject(ctx->session->session_id);
		osrfAppRespondComplete( ctx, ret );
		jsonObjectFree(ret);
		
		if (!ctx->session->userData) {
			ctx->session->userData = osrfNewHash();
			((osrfHash*)ctx->session->userData)->freeItem = &sessionDataFree;
		}

		osrfHashSet( (osrfHash*)ctx->session->userData, strdup( ctx->session->session_id ), "xact_id" );
		ctx->session->userDataFree = &userDataFree;
		
	}
	return 0;
}

int setSavepoint ( osrfMethodContext* ctx ) {
	OSRF_METHOD_VERIFY_CONTEXT(ctx);

	char* spName = jsonObjectToSimpleString(jsonObjectGetIndex(ctx->params, 0));

	if (!osrfHashGet( (osrfHash*)ctx->session->userData, "xact_id" )) {
		osrfAppSessionStatus(
			ctx->session,
			OSRF_STATUS_INTERNALSERVERERROR,
			"osrfMethodException",
			ctx->request,
			"No active transaction -- required for savepoints"
		);
		return -1;
	}

	dbi_result result = dbi_conn_queryf(dbhandle, "SAVEPOINT \"%s\";", spName);
	if (!result) {
		osrfLogError(
			OSRF_LOG_MARK,
			"%s: Error creating savepoint %s in transaction %s",
			MODULENAME,
			spName,
			osrfHashGet( (osrfHash*)ctx->session->userData, "xact_id" )
		);
		osrfAppSessionStatus( ctx->session, OSRF_STATUS_INTERNALSERVERERROR, "osrfMethodException", ctx->request, "Error creating savepoint" );
		return -1;
	} else {
		jsonObject* ret = jsonNewObject(spName);
		osrfAppRespondComplete( ctx, ret );
		jsonObjectFree(ret);
	}
	return 0;
}

int releaseSavepoint ( osrfMethodContext* ctx ) {
	OSRF_METHOD_VERIFY_CONTEXT(ctx);

	char* spName = jsonObjectToSimpleString(jsonObjectGetIndex(ctx->params, 0));

	if (!osrfHashGet( (osrfHash*)ctx->session->userData, "xact_id" )) {
		osrfAppSessionStatus(
			ctx->session,
			OSRF_STATUS_INTERNALSERVERERROR,
			"osrfMethodException",
			ctx->request,
			"No active transaction -- required for savepoints"
		);
		return -1;
	}

	dbi_result result = dbi_conn_queryf(dbhandle, "RELEASE SAVEPOINT \"%s\";", spName);
	if (!result) {
		osrfLogError(
			OSRF_LOG_MARK,
			"%s: Error releasing savepoint %s in transaction %s",
			MODULENAME,
			spName,
			osrfHashGet( (osrfHash*)ctx->session->userData, "xact_id" )
		);
		osrfAppSessionStatus( ctx->session, OSRF_STATUS_INTERNALSERVERERROR, "osrfMethodException", ctx->request, "Error releasing savepoint" );
		return -1;
	} else {
		jsonObject* ret = jsonNewObject(spName);
		osrfAppRespondComplete( ctx, ret );
		jsonObjectFree(ret);
	}
	return 0;
}

int rollbackSavepoint ( osrfMethodContext* ctx ) {
	OSRF_METHOD_VERIFY_CONTEXT(ctx);

	char* spName = jsonObjectToSimpleString(jsonObjectGetIndex(ctx->params, 0));

	if (!osrfHashGet( (osrfHash*)ctx->session->userData, "xact_id" )) {
		osrfAppSessionStatus(
			ctx->session,
			OSRF_STATUS_INTERNALSERVERERROR,
			"osrfMethodException",
			ctx->request,
			"No active transaction -- required for savepoints"
		);
		return -1;
	}

	dbi_result result = dbi_conn_queryf(dbhandle, "ROLLBACK TO SAVEPOINT \"%s\";", spName);
	if (!result) {
		osrfLogError(
			OSRF_LOG_MARK,
			"%s: Error rolling back savepoint %s in transaction %s",
			MODULENAME,
			spName,
			osrfHashGet( (osrfHash*)ctx->session->userData, "xact_id" )
		);
		osrfAppSessionStatus( ctx->session, OSRF_STATUS_INTERNALSERVERERROR, "osrfMethodException", ctx->request, "Error rolling back savepoint" );
		return -1;
	} else {
		jsonObject* ret = jsonNewObject(spName);
		osrfAppRespondComplete( ctx, ret );
		jsonObjectFree(ret);
	}
	return 0;
}

int commitTransaction ( osrfMethodContext* ctx ) {
	OSRF_METHOD_VERIFY_CONTEXT(ctx);

	if (!osrfHashGet( (osrfHash*)ctx->session->userData, "xact_id" )) {
		osrfAppSessionStatus( ctx->session, OSRF_STATUS_INTERNALSERVERERROR, "osrfMethodException", ctx->request, "No active transaction to commit" );
		return -1;
	}

	dbi_result result = dbi_conn_query(dbhandle, "COMMIT;");
	if (!result) {
		osrfLogError(OSRF_LOG_MARK, "%s: Error committing transaction", MODULENAME );
		osrfAppSessionStatus( ctx->session, OSRF_STATUS_INTERNALSERVERERROR, "osrfMethodException", ctx->request, "Error committing transaction" );
		return -1;
	} else {
		osrfHashRemove(ctx->session->userData, "xact_id");
		jsonObject* ret = jsonNewObject(ctx->session->session_id);
		osrfAppRespondComplete( ctx, ret );
		jsonObjectFree(ret);
	}
	return 0;
}

int rollbackTransaction ( osrfMethodContext* ctx ) {
	OSRF_METHOD_VERIFY_CONTEXT(ctx);

	if (!osrfHashGet( (osrfHash*)ctx->session->userData, "xact_id" )) {
		osrfAppSessionStatus( ctx->session, OSRF_STATUS_INTERNALSERVERERROR, "osrfMethodException", ctx->request, "No active transaction to roll back" );
		return -1;
	}

	dbi_result result = dbi_conn_query(dbhandle, "ROLLBACK;");
	if (!result) {
		osrfLogError(OSRF_LOG_MARK, "%s: Error rolling back transaction", MODULENAME );
		osrfAppSessionStatus( ctx->session, OSRF_STATUS_INTERNALSERVERERROR, "osrfMethodException", ctx->request, "Error rolling back transaction" );
		return -1;
	} else {
		osrfHashRemove(ctx->session->userData, "xact_id");
		jsonObject* ret = jsonNewObject(ctx->session->session_id);
		osrfAppRespondComplete( ctx, ret );
		jsonObjectFree(ret);
	}
	return 0;
}

int dispatchCRUDMethod ( osrfMethodContext* ctx ) {
	OSRF_METHOD_VERIFY_CONTEXT(ctx);

	osrfHash* meta = (osrfHash*) ctx->method->userData;
	osrfHash* class_obj = osrfHashGet( meta, "class" );
	
	int err = 0;

	jsonObject * obj = NULL;
	if (!strcmp( (char*)osrfHashGet(meta, "methodtype"), "create"))
		obj = doCreate(ctx, &err);

	if (!strcmp( (char*)osrfHashGet(meta, "methodtype"), "retrieve"))
		obj = doRetrieve(ctx, &err);

	if (!strcmp( (char*)osrfHashGet(meta, "methodtype"), "update"))
		obj = doUpdate(ctx, &err);

	if (!strcmp( (char*)osrfHashGet(meta, "methodtype"), "delete"))
		obj = doDelete(ctx, &err);

	if (!strcmp( (char*)osrfHashGet(meta, "methodtype"), "search")) {

		obj = doSearch(ctx, class_obj, ctx->params, &err);
		if(err) return err;

		jsonObjectNode* cur;
		jsonObjectIterator* itr = jsonNewObjectIterator( obj );
		while ((cur = jsonObjectIteratorNext( itr ))) {
			osrfAppRespond( ctx, jsonObjectClone(cur->item) );
		}
		jsonObjectIteratorFree(itr);
		osrfAppRespondComplete( ctx, NULL );
		
	} else {
		osrfAppRespondComplete( ctx, obj );
	}

	jsonObjectFree(obj);

	return err;
}

int verifyObjectClass ( osrfMethodContext* ctx, jsonObject* param ) {
	
	osrfHash* meta = (osrfHash*) ctx->method->userData;
	osrfHash* class = osrfHashGet( meta, "class" );
	
	if ((strcmp( osrfHashGet(class, "classname"), param->classname ))) {

		growing_buffer* msg = buffer_init(128);
		buffer_fadd(
			msg,
			"%s: %s method for type %s was passed a %s",
			MODULENAME,
			osrfHashGet(meta, "methodtype"),
			osrfHashGet(class, "classname"),
			param->classname
		);

		char* m = buffer_data(msg);
		osrfAppSessionStatus( ctx->session, OSRF_STATUS_BADREQUEST, "osrfMethodException", ctx->request, m );

		buffer_free(msg);
		free(m);

		return 0;
	}
	return 1;
}

jsonObject* doCreate(osrfMethodContext* ctx, int* err ) {

	osrfHash* meta = osrfHashGet( (osrfHash*) ctx->method->userData, "class" );
	jsonObject* target = jsonObjectGetIndex( ctx->params, 0 );

	if (!verifyObjectClass(ctx, target)) {
		*err = -1;
		return jsonNULL;
	}

	if (!osrfHashGet( (osrfHash*)ctx->session->userData, "xact_id" )) {
		osrfAppSessionStatus(
			ctx->session,
			OSRF_STATUS_BADREQUEST,
			"osrfMethodException",
			ctx->request,
			"No active transaction -- required for CREATE"
		);
		*err = -1;
		return jsonNULL;
	}

	osrfHash* fields = osrfHashGet(meta, "fields");
	char* pkey = osrfHashGet(meta, "primarykey");
	char* seq = osrfHashGet(meta, "sequence");

	growing_buffer* table_buf = buffer_init(128);
	growing_buffer* col_buf = buffer_init(128);
	growing_buffer* val_buf = buffer_init(128);

	buffer_fadd(table_buf,"INSERT INTO %s", osrfHashGet(meta, "tablename"));
	buffer_add(col_buf,"(");
	buffer_add(val_buf,"VALUES (");

	int i = 0;
	int first = 1;
	char* field_name;
	osrfStringArray* field_list = osrfHashKeys( fields );
	while ( (field_name = osrfStringArrayGetString(field_list, i++)) ) {

		osrfHash* field = osrfHashGet( fields, field_name );

		if(!( strcmp( osrfHashGet(osrfHashGet(fields,field_name), "virtual"), "true" ) )) continue;

		int pos = atoi(osrfHashGet(field, "array_position"));
		char* value = jsonObjectToSimpleString( jsonObjectGetIndex( target, pos ) );

		if (first) {
			first = 0;
		} else {
			buffer_add(col_buf, ",");
			buffer_add(val_buf, ",");
		}

		buffer_add(col_buf, field_name);

		if (jsonObjectGetIndex(target, pos)->type == JSON_NULL) {
			buffer_add( val_buf, "DEFAULT" );
			
		} else if ( !strcmp(osrfHashGet(field, "primitive"), "number") ) {
			if ( !strcmp(osrfHashGet(field, "datatype"), "INT8") ) {
				buffer_fadd( val_buf, "%lld", atol(value) );
				
			} else if ( !strcmp(osrfHashGet(field, "datatype"), "INT") ) {
				buffer_fadd( val_buf, "%ld", atoll(value) );
				
			} else if ( !strcmp(osrfHashGet(field, "datatype"), "NUMERIC") ) {
				buffer_fadd( val_buf, "%f", atof(value) );
			}
		} else {
			if ( dbi_conn_quote_string(dbhandle, &value) ) {
				buffer_fadd( val_buf, "%s", value );

			} else {
				osrfLogError(OSRF_LOG_MARK, "%s: Error quoting string [%s]", MODULENAME, value);
				osrfAppSessionStatus(
					ctx->session,
					OSRF_STATUS_INTERNALSERVERERROR,
					"osrfMethodException",
					ctx->request,
					"Error quoting string -- please see the error log for more details"
				);
				free(value);
				buffer_free(table_buf);
				buffer_free(col_buf);
				buffer_free(val_buf);
				*err = -1;
				return jsonNULL;
			}
		}

		free(value);
		
	}

	buffer_add(col_buf,")");
	buffer_add(val_buf,")");

	growing_buffer* sql = buffer_init(128);
	buffer_fadd(
		sql,
		"%s %s %s;",
		buffer_data(table_buf),
		buffer_data(col_buf),
		buffer_data(val_buf)
	);
	buffer_free(table_buf);
	buffer_free(col_buf);
	buffer_free(val_buf);

	char* query = buffer_data(sql);
	buffer_free(sql);

	osrfLogDebug(OSRF_LOG_MARK, "%s: Insert SQL [%s]", MODULENAME, query);

	
	dbi_result result = dbi_conn_query(dbhandle, query);

	jsonObject* obj = NULL;

	if (!result) {
		obj = jsonNewObject(NULL);
		osrfLogError(
			OSRF_LOG_MARK,
			"%s ERROR inserting %s object using query [%s]",
			MODULENAME,
			osrfHashGet(meta, "fieldmapper"),
			query
		);
		osrfAppSessionStatus(
			ctx->session,
			OSRF_STATUS_INTERNALSERVERERROR,
			"osrfMethodException",
			ctx->request,
			"INSERT error -- please see the error log for more details"
		);
		*err = -1;
	} else {

		int pos = atoi(osrfHashGet( osrfHashGet(fields, pkey), "array_position" ));
		char* id = jsonObjectToSimpleString(jsonObjectGetIndex(target, pos));
		if (!id) {
			unsigned long long new_id = dbi_conn_sequence_last(dbhandle, seq);
			growing_buffer* _id = buffer_init(10);
			buffer_fadd(_id, "%lld", new_id);
			id = buffer_data(_id);
			buffer_free(_id);
		}

		jsonObject* fake_params = jsonParseString("[]");
		jsonObjectPush(fake_params, jsonParseString("{}"));

		jsonObjectSetKey(
			jsonObjectGetIndex(fake_params, 0),
			osrfHashGet(meta, "primarykey"),
			jsonNewObject(id)
		);

		jsonObject* list = doSearch( ctx,meta, fake_params, err);

		if(*err) {
			jsonObjectFree( fake_params );
			obj = jsonNULL;
		} else {
			obj = jsonObjectClone( jsonObjectGetIndex(list, 0) );
		}

		jsonObjectFree( list );
		jsonObjectFree( fake_params );

	}

	free(query);

	return obj;

}


jsonObject* doRetrieve(osrfMethodContext* ctx, int* err ) {

	osrfHash* meta = osrfHashGet( (osrfHash*) ctx->method->userData, "class" );

	jsonObject* obj;

	char* id = jsonObjectToSimpleString(jsonObjectGetIndex(ctx->params, 0));
	jsonObject* order_hash = jsonObjectGetIndex(ctx->params, 1);

	osrfLogDebug(
		OSRF_LOG_MARK,
		"%s retrieving %s object with id %s",
		MODULENAME,
		osrfHashGet(meta, "fieldmapper"),
		id
	);

	jsonObject* fake_params = jsonParseString("[]");
	jsonObjectPush(fake_params, jsonParseString("{}"));

	jsonObjectSetKey(
		jsonObjectGetIndex(fake_params, 0),
		osrfHashGet(meta, "primarykey"),
		jsonParseString(id)
	);

	if (order_hash) jsonObjectPush(fake_params, jsonObjectClone(order_hash) );

	jsonObject* list = doSearch( ctx,meta, fake_params, err);

	if(*err) {
		jsonObjectFree( fake_params );
		return jsonNULL;
	}

	obj = jsonObjectClone( jsonObjectGetIndex(list, 0) );

	jsonObjectFree( list );
	jsonObjectFree( fake_params );

	return obj;
}

char* jsonNumberToDBString ( osrfHash* field, jsonObject* value ) {
	growing_buffer* val_buf = buffer_init(32);
	double x = jsonObjectGetNumber(value);

	if ( !strncmp(osrfHashGet(field, "datatype"), "INT", 3) ) {
		buffer_fadd( val_buf, "%d", (int)x );

	} else if ( !strcmp(osrfHashGet(field, "datatype"), "NUMERIC") ) {
		buffer_fadd( val_buf, "%f", x );
	}

	char* pred = buffer_data(val_buf);
	buffer_free(val_buf);

	return pred;
}

char* searchINPredicate (osrfHash* field, jsonObject* node) {
	growing_buffer* sql_buf = buffer_init(32);
	
	buffer_fadd(
		sql_buf,
		"%s IN (",
		osrfHashGet(field, "name")
	);

	int in_item_index = 0;
	int in_item_first = 1;
	jsonObject* in_item;
	while ( (in_item = jsonObjectGetIndex(node, in_item_index++)) ) {

		if (in_item_first)
			in_item_first = 0;
		else
			buffer_add(sql_buf, ", ");

		if ( !strcmp(osrfHashGet(field, "primitive"), "number") ) {
			char* val = jsonNumberToDBString( field, in_item );
			buffer_fadd( sql_buf, "%s", val );
			free(val);

		} else {
			char* key_string = jsonObjectToSimpleString(in_item);
			if ( dbi_conn_quote_string(dbhandle, &key_string) ) {
				buffer_fadd( sql_buf, "%s", key_string );
				free(key_string);
			} else {
				osrfLogError(OSRF_LOG_MARK, "%s: Error quoting key string [%s]", MODULENAME, key_string);
				free(key_string);
				buffer_free(sql_buf);
				return NULL;
			}
		}
	}

	buffer_add(
		sql_buf,
		")"
	);

	char* pred = buffer_data(sql_buf);
	buffer_free(sql_buf);

	return pred;
}

char* searchFunctionPredicate (osrfHash* field, jsonObjectNode* node) {
	growing_buffer* sql_buf = buffer_init(32);
	
	buffer_fadd(
		sql_buf,
		"%s %s ",
		osrfHashGet(field, "name"),
		node->key
	);

	char* val = NULL;
	int func_item_index = 0;
	int func_item_first = 2;
	jsonObject* func_item;
	while ( (func_item = jsonObjectGetIndex(node->item, func_item_index++)) ) {

		val = jsonObjectToSimpleString(func_item);

		if (func_item_first == 2) {
			buffer_fadd(sql_buf, "%s( ", val);
			free(val);
			func_item_first--;
			continue;
		}

		if (func_item_first)
			func_item_first--;
		else
			buffer_add(sql_buf, ", ");

		if ( dbi_conn_quote_string(dbhandle, &val) ) {
			buffer_fadd( sql_buf, "%s", val );
			free(val);
		} else {
			osrfLogError(OSRF_LOG_MARK, "%s: Error quoting key string [%s]", MODULENAME, val);
			free(val);
			buffer_free(sql_buf);
			return NULL;
		}
	}

	buffer_add(
		sql_buf,
		" )"
	);

	char* pred = buffer_data(sql_buf);
	buffer_free(sql_buf);

	return pred;
}

char* searchSimplePredicate (const char* orig_op, osrfHash* field, jsonObject* node) {

	char* val = NULL;
	char* op = NULL;
	if (node->type == JSON_NULL) {
		val = strdup("NULL");

		if (strcmp( orig_op, "=" ))
			op = strdup("IS NOT");
		else
			op = strdup("IS");

	} else if ( !strcmp(osrfHashGet(field, "primitive"), "number") ) {
		val = jsonNumberToDBString( field, node );
		op = strdup (orig_op);

	} else {
		val = jsonObjectToSimpleString(node);
		op = strdup (orig_op);
		if ( !dbi_conn_quote_string(dbhandle, &val) ) {
			osrfLogError(OSRF_LOG_MARK, "%s: Error quoting key string [%s]", MODULENAME, val);
			free(val);
			return NULL;
		}
	}

	growing_buffer* sql_buf = buffer_init(16);
	buffer_fadd( sql_buf, "%s %s %s", osrfHashGet(field, "name"), op, val );
	free(val);
	free(op);

	char* pred = buffer_data(sql_buf);
	buffer_free(sql_buf);

	return pred;
}

char* searchBETWEENPredicate (osrfHash* field, jsonObject* node) {

	char* x_string;
	char* y_string;

	if ( !strcmp(osrfHashGet(field, "primitive"), "number") ) {
		x_string = jsonNumberToDBString(field, jsonObjectGetIndex(node,0));
		y_string = jsonNumberToDBString(field, jsonObjectGetIndex(node,1));

	} else {
		x_string = jsonObjectToSimpleString(jsonObjectGetIndex(node,0));
		y_string = jsonObjectToSimpleString(jsonObjectGetIndex(node,1));
		if ( !(dbi_conn_quote_string(dbhandle, &x_string) && dbi_conn_quote_string(dbhandle, &y_string)) ) {
			osrfLogError(OSRF_LOG_MARK, "%s: Error quoting key strings [%s] and [%s]", MODULENAME, x_string, y_string);
			free(x_string);
			free(y_string);
			return NULL;
		}
	}

	growing_buffer* sql_buf = buffer_init(32);
	buffer_fadd( sql_buf, "%s BETWEEN %s AND %s", osrfHashGet(field, "name"), x_string, y_string );
	free(x_string);
	free(y_string);

	char* pred = buffer_data(sql_buf);
	buffer_free(sql_buf);

	return pred;
}

char* searchPredicate ( osrfHash* field, jsonObject* node ) {

	char* pred = NULL;
	if (node->type == JSON_ARRAY) { // equality IN search
		pred = searchINPredicate( field, node );
	} else if (node->type == JSON_HASH) { // non-equality search
		jsonObjectNode* pred_node;
		jsonObjectIterator* pred_itr = jsonNewObjectIterator( node );
		while ( (pred_node = jsonObjectIteratorNext( pred_itr )) ) {
			if ( !(strcasecmp( pred_node->key,"between" )) )
				pred = searchBETWEENPredicate( field, pred_node->item );
			else if ( !(strcasecmp( pred_node->key,"in" )) )
				pred = searchINPredicate( field, pred_node->item );
			else if ( pred_node->item->type == JSON_ARRAY )
				pred = searchFunctionPredicate( field, pred_node );
			else 
				pred = searchSimplePredicate( pred_node->key, field, pred_node->item );

			break;
		}
	} else if (node->type == JSON_NULL) { // IS NULL search
		growing_buffer* _p = buffer_init(16);
		buffer_fadd(
			_p,
			"%s IS NULL",
			osrfHashGet(field, "name")
		);
		pred = buffer_data(_p);
		buffer_free(_p);
	} else { // equality search
		pred = searchSimplePredicate( "=", field, node );
	}

	return pred;

}

jsonObject* doSearch(osrfMethodContext* ctx, osrfHash* meta, jsonObject* params, int* err ) {

	osrfHash* links = osrfHashGet(meta, "links");
	osrfHash* fields = osrfHashGet(meta, "fields");

	jsonObject* _tmp;
	jsonObject* obj;
	jsonObject* search_hash = jsonObjectGetIndex(params, 0);
	jsonObject* order_hash = jsonObjectGetIndex(params, 1);

	growing_buffer* sql_buf = buffer_init(128);
	buffer_fadd(sql_buf, "SELECT * FROM %s WHERE ", osrfHashGet(meta, "tablename") );

	jsonObjectNode* node = NULL;
	jsonObjectIterator* search_itr = jsonNewObjectIterator( search_hash );

	char* pred;
	int first = 1;
	while ( (node = jsonObjectIteratorNext( search_itr )) ) {
		osrfHash* field = osrfHashGet( fields, node->key );

		if (!field) continue;

		/*
		if (!field) {
			field = osrfNewHash();
			osrfHashSet(field, node->key, "name");
		}
		*/

		if (first) {
			first = 0;
		} else {
			buffer_add(sql_buf, " AND ");
		}

		pred = searchPredicate( field, node->item);
		buffer_fadd( sql_buf, "%s", pred );
		free(pred);
	}

	jsonObjectIteratorFree(search_itr);

	if (order_hash) {
		char* string;
		_tmp = jsonObjectGetKey( order_hash, "order_by" );
		if (_tmp) {
			string = jsonObjectToSimpleString(_tmp);
			buffer_fadd(
				sql_buf,
				" ORDER BY %s",
				string
			);
			free(string);
		}

		_tmp = jsonObjectGetKey( order_hash, "limit" );
		if (_tmp) {
			string = jsonObjectToSimpleString(_tmp);
			buffer_fadd(
				sql_buf,
				" LIMIT %d",
				atoi(string)
			);
			free(string);
		}

		_tmp = jsonObjectGetKey( order_hash, "offset" );
		if (_tmp) {
			string = jsonObjectToSimpleString(_tmp);
			buffer_fadd(
				sql_buf,
				" OFFSET %d",
				atoi(string)
			);
			free(string);
		}
	}

	buffer_add(sql_buf, ";");

	char* sql = buffer_data(sql_buf);
	buffer_free(sql_buf);
	
	osrfLogDebug(OSRF_LOG_MARK, "%s SQL =  %s", MODULENAME, sql);
	dbi_result result = dbi_conn_query(dbhandle, sql);

	jsonObject* res_list = jsonParseString("[]");
	if(result) {
		osrfLogDebug(OSRF_LOG_MARK, "Query returned with no errors");

		if (dbi_result_first_row(result)) {
			/* JSONify the result */
			osrfLogDebug(OSRF_LOG_MARK, "Query returned at least one row");
			do {
				obj = oilsMakeJSONFromResult( result, meta );
				jsonObjectPush(res_list, obj);
			} while (dbi_result_next_row(result));
		} else {
			osrfLogDebug(OSRF_LOG_MARK, "%s returned no results for query %s", MODULENAME, sql);
		}

		/* clean up the query */
		dbi_result_free(result); 

	} else {
		osrfLogError(OSRF_LOG_MARK, "%s: Error retrieving %s with query [%s]", MODULENAME, osrfHashGet(meta, "fieldmapper"), sql);
		osrfAppSessionStatus(
			ctx->session,
			OSRF_STATUS_INTERNALSERVERERROR,
			"osrfMethodException",
			ctx->request,
			"Severe query error -- see error log for more details"
		);
		*err = -1;
		free(sql);
		jsonObjectFree(res_list);
		return jsonNULL;

	}

	free(sql);

	if (order_hash) {
		_tmp = jsonObjectGetKey( order_hash, "flesh" );
		if (_tmp) {
			int x = (int)jsonObjectGetNumber(_tmp);

			if (x > 0) {

				jsonObjectNode* cur;
				jsonObjectIterator* itr = jsonNewObjectIterator( res_list );
				while ((cur = jsonObjectIteratorNext( itr ))) {

					int i = 0;
					char* link_field;
					osrfStringArray* link_fields;
					
					jsonObject* flesh_fields = jsonObjectGetKey( order_hash, "flesh_fields" );
					if (flesh_fields) {
						jsonObjectNode* _f;
						jsonObjectIterator* _i = jsonNewObjectIterator( flesh_fields );
						link_fields = osrfNewStringArray(1);
						while ((_f = jsonObjectIteratorNext( _i ))) {
							osrfStringArrayAdd( link_fields, jsonObjectToSimpleString( _f->item ) );
						}
					} else {
						link_fields = osrfHashKeys( links );
					}

					while ( (link_field = osrfStringArrayGetString(link_fields, i++)) ) {

						osrfLogDebug(OSRF_LOG_MARK, "Starting to flesh %s", link_field);

						osrfHash* kid_link = osrfHashGet(links, link_field);
						if (!kid_link) continue;

						osrfHash* field = osrfHashGet(fields, link_field);
						if (!field) continue;

						osrfHash* value_field = field;

						osrfHash* kid_idl = osrfHashGet(idlHash, osrfHashGet(kid_link, "class"));
						if (!kid_idl) continue;

						if (!(strcmp( osrfHashGet(kid_link, "reltype"), "has_many" ))) { // has_many
							value_field = osrfHashGet( fields, osrfHashGet(meta, "primarykey") );
						}
							
						if (!(strcmp( osrfHashGet(kid_link, "reltype"), "might_have" ))) { // might_have
							value_field = osrfHashGet( fields, osrfHashGet(meta, "primarykey") );
						}

						osrfLogDebug(
							OSRF_LOG_MARK,
							"Link field: %s, remote class: %s, fkey: %s, reltype: %s",
							osrfHashGet(kid_link, "field"),
							osrfHashGet(kid_link, "class"),
							osrfHashGet(kid_link, "key"),
							osrfHashGet(kid_link, "reltype")
						);

						jsonObject* fake_params = jsonParseString("[]");
						jsonObjectPush(fake_params, jsonParseString("{}")); // search hash
						jsonObjectPush(fake_params, jsonParseString("{}")); // order/flesh hash

						osrfLogDebug(OSRF_LOG_MARK, "Creating dummy params object...");

						char* search_key =
						jsonObjectToSimpleString(
							jsonObjectGetIndex(
								cur->item,
								atoi( osrfHashGet(value_field, "array_position") )
							)
						);

						if (!search_key) {
							osrfLogDebug(OSRF_LOG_MARK, "Nothing to search for!");
							continue;
						}
							
						jsonObjectSetKey(
							jsonObjectGetIndex(fake_params, 0),
							osrfHashGet(kid_link, "key"),
							jsonNewObject( search_key )
						);

						free(search_key);


						jsonObjectSetKey(
							jsonObjectGetIndex(fake_params, 1),
							"flesh",
							jsonNewNumberObject( (double)(x - 1) )
						);

						if (flesh_fields) {
							jsonObjectSetKey(
								jsonObjectGetIndex(fake_params, 1),
								"flesh_fields",
								jsonObjectClone( flesh_fields )
							);
						}

						if (jsonObjectGetKey(order_hash, "order_by")) {
							jsonObjectSetKey(
								jsonObjectGetIndex(fake_params, 1),
								"order_by",
								jsonObjectClone(jsonObjectGetKey(order_hash, "order_by"))
							);
						}

						jsonObject* kids = doSearch(ctx, kid_idl, fake_params, err);

						if(*err) {
							jsonObjectFree( fake_params );
							if (flesh_fields) osrfStringArrayFree(link_fields);
							jsonObjectIteratorFree(itr);
							jsonObjectFree(res_list);
							return jsonNULL;
						}



						osrfLogDebug(OSRF_LOG_MARK, "Search for %s return %d linked objects", osrfHashGet(kid_link, "class"), kids->size);
						
						if (!(strcmp( osrfHashGet(kid_link, "reltype"), "has_a" ))) {
							osrfLogDebug(OSRF_LOG_MARK, "Storing fleshed objects in %s", osrfHashGet(kid_link, "field"));
							jsonObjectSetIndex(
								cur->item,
								(unsigned long)atoi( osrfHashGet( field, "array_position" ) ),
								jsonObjectClone( jsonObjectGetIndex(kids, 0) )
							);
							jsonObjectFree( kids );
						}

						if (!(strcmp( osrfHashGet(kid_link, "reltype"), "has_many" ))) { // has_many
							osrfLogDebug(OSRF_LOG_MARK, "Storing fleshed objects in %s", osrfHashGet(kid_link, "field"));
							jsonObjectSetIndex(
								cur->item,
								(unsigned long)atoi( osrfHashGet( field, "array_position" ) ),
								kids
							);
						}

						osrfLogDebug(OSRF_LOG_MARK, "Fleshing of %s complete", osrfHashGet(kid_link, "field"));

						jsonObjectFree( fake_params );
					}
					if (flesh_fields) osrfStringArrayFree(link_fields);
				}
				jsonObjectIteratorFree(itr);
			}
		}
	}

	return res_list;
}


jsonObject* doUpdate(osrfMethodContext* ctx, int* err ) {

	osrfHash* meta = osrfHashGet( (osrfHash*) ctx->method->userData, "class" );
	jsonObject* target = jsonObjectGetIndex(ctx->params, 0);

	if (!verifyObjectClass(ctx, target)) {
		*err = -1;
		return jsonNULL;
	}

	if (!osrfHashGet( (osrfHash*)ctx->session->userData, "xact_id" )) {
		osrfAppSessionStatus(
			ctx->session,
			OSRF_STATUS_BADREQUEST,
			"osrfMethodException",
			ctx->request,
			"No active transaction -- required for UPDATE"
		);
		*err = -1;
		return jsonNULL;
	}

	char* pkey = osrfHashGet(meta, "primarykey");
	osrfHash* fields = osrfHashGet(meta, "fields");

	char* id =
		jsonObjectToSimpleString(
			jsonObjectGetIndex(
				target,
				atoi( osrfHashGet( osrfHashGet( fields, pkey ), "array_position" ) )
			)
		);

	osrfLogDebug(
		OSRF_LOG_MARK,
		"%s updating %s object with %s = %s",
		MODULENAME,
		osrfHashGet(meta, "fieldmapper"),
		pkey,
		id
	);

	growing_buffer* sql = buffer_init(128);
	buffer_fadd(sql,"UPDATE %s SET", osrfHashGet(meta, "tablename"));

	int i = 0;
	int first = 1;
	char* field_name;
	osrfStringArray* field_list = osrfHashKeys( fields );
	while ( (field_name = osrfStringArrayGetString(field_list, i++)) ) {

		osrfHash* field = osrfHashGet( fields, field_name );

		if(!( strcmp( field_name, pkey ) )) continue;
		if(!( strcmp( osrfHashGet(osrfHashGet(fields,field_name), "virtual"), "true" ) )) continue;

		int pos = atoi(osrfHashGet(field, "array_position"));
		char* value = jsonObjectToSimpleString( jsonObjectGetIndex( target, pos ) );

		if (jsonObjectGetIndex(target, pos)->type == JSON_NULL) {
			if ( !(!( strcmp( osrfHashGet(meta, "classname"), "au" ) ) && !( strcmp( field_name, "passwd" ) )) ) { // arg at the special case!
				if (first) first = 0;
				else buffer_add(sql, ",");
				buffer_fadd( sql, " %s = NULL", field_name );
			}
			
		} else if ( !strcmp(osrfHashGet(field, "primitive"), "number") ) {
			if (first) first = 0;
			else buffer_add(sql, ",");
			
			char* v = jsonNumberToDBString( field, jsonObjectGetIndex( target, pos ) );
			buffer_fadd( sql, " %s = %s", v );
			free(v);
		} else {
			if ( dbi_conn_quote_string(dbhandle, &value) ) {
				if (first) first = 0;
				else buffer_add(sql, ",");
				buffer_fadd( sql, " %s = %s", field_name, value );

			} else {
				osrfLogError(OSRF_LOG_MARK, "%s: Error quoting string [%s]", MODULENAME, value);
				osrfAppSessionStatus(
					ctx->session,
					OSRF_STATUS_INTERNALSERVERERROR,
					"osrfMethodException",
					ctx->request,
					"Error quoting string -- please see the error log for more details"
				);
				free(value);
				free(id);
				buffer_free(sql);
				*err = -1;
				return jsonNULL;
			}
		}

		free(value);
		
	}

	jsonObject* obj = jsonParseString(id);

	if ( strcmp( osrfHashGet( osrfHashGet( osrfHashGet(meta, "fields"), pkey ), "primitive" ), "number" ) )
		dbi_conn_quote_string(dbhandle, &id);

	buffer_fadd( sql, " WHERE %s = %s;", pkey, id );

	char* query = buffer_data(sql);
	buffer_free(sql);

	osrfLogDebug(OSRF_LOG_MARK, "%s: Update SQL [%s]", MODULENAME, query);

	dbi_result result = dbi_conn_query(dbhandle, query);
	free(query);

	if (!result) {
		jsonObjectFree(obj);
		obj = jsonNewObject(NULL);
		osrfLogError(
			OSRF_LOG_MARK,
			"%s ERROR updating %s object with %s = %s",
			MODULENAME,
			osrfHashGet(meta, "fieldmapper"),
			pkey,
			id
		);
	}

	free(id);

	return obj;
}

jsonObject* doDelete(osrfMethodContext* ctx, int* err ) {

	osrfHash* meta = osrfHashGet( (osrfHash*) ctx->method->userData, "class" );

	if (!osrfHashGet( (osrfHash*)ctx->session->userData, "xact_id" )) {
		osrfAppSessionStatus(
			ctx->session,
			OSRF_STATUS_BADREQUEST,
			"osrfMethodException",
			ctx->request,
			"No active transaction -- required for DELETE"
		);
		*err = -1;
		return jsonNULL;
	}

	jsonObject* obj;

	char* pkey = osrfHashGet(meta, "primarykey");

	char* id;
	if (jsonObjectGetIndex(ctx->params, 0)->classname) {
		if (!verifyObjectClass(ctx, jsonObjectGetIndex( ctx->params, 0 ))) {
			*err = -1;
			return jsonNULL;
		}

		id = jsonObjectToSimpleString(
			jsonObjectGetIndex(
				jsonObjectGetIndex(ctx->params, 0),
				atoi( osrfHashGet( osrfHashGet( osrfHashGet(meta, "fields"), pkey ), "array_position") )
			)
		);
	} else {
		id = jsonObjectToSimpleString(jsonObjectGetIndex(ctx->params, 0));
	}

	osrfLogDebug(
		OSRF_LOG_MARK,
		"%s deleting %s object with %s = %s",
		MODULENAME,
		osrfHashGet(meta, "fieldmapper"),
		pkey,
		id
	);

	obj = jsonParseString(id);

	if ( strcmp( osrfHashGet( osrfHashGet( osrfHashGet(meta, "fields"), pkey ), "primitive" ), "number" ) )
		dbi_conn_quote_string(dbhandle, &id);

	dbi_result result = dbi_conn_queryf(dbhandle, "DELETE FROM %s WHERE %s = %s;", osrfHashGet(meta, "tablename"), pkey, id);

	if (!result) {
		jsonObjectFree(obj);
		obj = jsonNewObject(NULL);
		osrfLogError(
			OSRF_LOG_MARK,
			"%s ERROR deleting %s object with %s = %s",
			MODULENAME,
			osrfHashGet(meta, "fieldmapper"),
			pkey,
			id
		);
	}

	free(id);

	return obj;

}


jsonObject* oilsMakeJSONFromResult( dbi_result result, osrfHash* meta) {
	if(!(result && meta)) return jsonNULL;

	jsonObject* object = jsonParseString("[]");
	jsonObjectSetClass(object, osrfHashGet(meta, "classname"));

	osrfHash* fields = osrfHashGet(meta, "fields");

	osrfLogDebug(OSRF_LOG_MARK, "Setting object class to %s ", object->classname);

	osrfHash* _f;
	time_t _tmp_dt;
	char dt_string[256];
	struct tm gmdt;

	int fmIndex;
	int columnIndex = 1;
	int attr;
	unsigned short type;
	const char* columnName;

	/* cycle through the column list */
	while( (columnName = dbi_result_get_field_name(result, columnIndex++)) ) {

		osrfLogDebug(OSRF_LOG_MARK, "Looking for column named [%s]...", (char*)columnName);

		fmIndex = -1; // reset the position
		
		/* determine the field type and storage attributes */
		type = dbi_result_get_field_type(result, columnName);
		attr = dbi_result_get_field_attribs(result, columnName);

		/* fetch the fieldmapper index */
		if( (_f = osrfHashGet(fields, (char*)columnName)) ) {
			char* virt = (char*)osrfHashGet(_f, "virtual");
			char* pos = (char*)osrfHashGet(_f, "array_position");

			if ( !virt || !pos || !(strcmp( virt, "true" )) ) continue;

			fmIndex = atoi( pos );
			osrfLogDebug(OSRF_LOG_MARK, "... Found column at position [%s]...", pos);
		}

		if (dbi_result_field_is_null(result, columnName)) {
			jsonObjectSetIndex( object, fmIndex, jsonNewObject(NULL) );
		} else {

			switch( type ) {

				case DBI_TYPE_INTEGER :

					if( attr & DBI_INTEGER_SIZE8 ) 
						jsonObjectSetIndex( object, fmIndex, 
							jsonNewNumberObject(dbi_result_get_longlong(result, columnName)));
					else 
						jsonObjectSetIndex( object, fmIndex, 
							jsonNewNumberObject(dbi_result_get_long(result, columnName)));

					break;

				case DBI_TYPE_DECIMAL :
					jsonObjectSetIndex( object, fmIndex, 
							jsonNewNumberObject(dbi_result_get_double(result, columnName)));
					break;

				case DBI_TYPE_STRING :


					jsonObjectSetIndex(
						object,
						fmIndex,
						jsonNewObject( dbi_result_get_string(result, columnName) )
					);

					break;

				case DBI_TYPE_DATETIME :

					memset(dt_string, '\0', 256);
					memset(&gmdt, '\0', sizeof(gmdt));
					memset(&_tmp_dt, '\0', sizeof(_tmp_dt));

					_tmp_dt = dbi_result_get_datetime(result, columnName);

					localtime_r( &_tmp_dt, &gmdt );

					if (!(attr & DBI_DATETIME_DATE)) {
						strftime(dt_string, 255, "%T", &gmdt);
					} else if (!(attr & DBI_DATETIME_TIME)) {
						strftime(dt_string, 255, "%F", &gmdt);
					} else {
						/* XXX ARG! My eyes! The goggles, they do nothing! */

						strftime(dt_string, 255, "%FT%T%z", &gmdt);
					}

					jsonObjectSetIndex( object, fmIndex, jsonNewObject(dt_string) );

					break;

				case DBI_TYPE_BINARY :
					osrfLogError( OSRF_LOG_MARK, 
						"Can't do binary at column %s : index %d", columnName, columnIndex - 1);
			}
		}
	}

	return object;
}

