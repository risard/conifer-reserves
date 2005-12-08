#include "mod_ils_gateway.h"
#include "http_log.h"

char* ils_gateway_config_file = NULL;
char* ils_rest_gateway_config_file = NULL;

static const char* ils_gateway_set_config(cmd_parms *parms, void *config, const char *arg) {
	ils_gateway_config  *cfg;
	cfg = ap_get_module_config(parms->server->module_config, &ils_gateway_module);
	cfg->configfile = (char*) arg;
	ils_gateway_config_file = (char*) arg;
	return NULL;
}

/* tell apache about our commands */
static const command_rec ils_gateway_cmds[] = {
	AP_INIT_TAKE1( GATEWAY_CONFIG, ils_gateway_set_config, NULL, RSRC_CONF, "gateway config file"),
	{NULL}
};

/* build the config object */
static void* ils_gateway_create_config( apr_pool_t* p, server_rec* s) {
	ils_gateway_config* cfg = (ils_gateway_config*) apr_palloc(p, sizeof(ils_gateway_config));
	cfg->configfile = GATEWAY_DEFAULT_CONFIG;
	return (void*) cfg;
}


static void mod_ils_gateway_child_init(apr_pool_t *p, server_rec *s) {

	char* cfg = ils_gateway_config_file;
	if( ! osrf_system_bootstrap_client( cfg, CONFIG_CONTEXT) ) {
		osrfLogError("Unable to bootstrap client in gateway...");
		return;
	}
	fprintf(stderr, "Bootstrapping %d\n", getpid() );
	fflush(stderr);
}

static int mod_ils_gateway_method_handler (request_rec *r) {

	/* make sure we're needed first thing*/
	if (strcmp(r->handler, MODULE_NAME )) 
		return DECLINED;
	
	osrfLogSetAppname("osrf_json_gw");

	apr_pool_t *p = r->pool;	/* memory pool */
	char* arg = r->args;			/* url query string */

	char* service					= NULL;	/* service to connect to */
	char* method					= NULL;	/* method to perform */

	string_array* sarray			= init_string_array(12); /* method parameters */

	growing_buffer* buffer		= NULL;	/* POST data */
	growing_buffer* tmp_buf		= NULL;	/* temp buffer */

	char* key						= NULL;	/* query item name */
	char* val						= NULL;	/* query item value */

	jsonObject* response			= jsonParseString("{ }");
	jsonObject* payload			= jsonParseString("[ ]");
	jsonObjectSetKey(response, "payload", payload );

	/* verify we are connected */
	if(!osrf_system_get_transport_client()) {
		osrfLogError("Bootstrap Failed, no transport client");
		return HTTP_INTERNAL_SERVER_ERROR;
	}

	ap_set_content_type(r, "text/plain");
	osrfLogDebug("Apache request method: %s", r->method );

	/* gather the post args and append them to the url query string */
	if( !strcmp(r->method,"POST") ) {

		ap_setup_client_block(r,REQUEST_CHUNKED_DECHUNK);

		if(! ap_should_client_block(r)) {
			osrfLogWarning("No Post Body");
			ap_rputs("null", r);
			return OK;
		}

		int BUFL = 1024;
		char body[BUFL];
		bzero(body, BUFL);
		buffer = buffer_init(BUFL);

		while(ap_get_client_block(r, body, BUFL - 1 )) {
			buffer_add( buffer, body );
			bzero(body, BUFL);
		}

		if( buffer->n_used < 1 ) {
			osrfLogWarning("No Post Body");
			ap_rputs("null", r);
			return OK;
		}

		if(arg && strlen(arg) > 0 ) {
			tmp_buf = buffer_init(BUFL);
			buffer_add(tmp_buf,arg);
			buffer_add(tmp_buf,buffer->buf);
			arg = (char*) apr_pstrdup(p, tmp_buf->buf);
			buffer_free(tmp_buf);
		} else {
			arg = (char*) apr_pstrdup(p, buffer->buf);
		}
		buffer_free(buffer);

	} 

	if( ! arg || strlen(arg) == 0 ) { /* we received no request */
		osrfLogWarning("No Args");
		ap_rputs("null", r);
		return OK;
	}

	ap_log_rerror( APLOG_MARK, APLOG_DEBUG, 0, r, "URL: %s", arg );

	r->allowed |= (AP_METHOD_BIT << M_GET);
	r->allowed |= (AP_METHOD_BIT << M_POST);
	
	while( arg && (val = ap_getword(p, (const char**) &arg, '&'))) {

		key = ap_getword(r->pool, (const char**) &val, '=');
		if(!key || !key[0])
			break;

		ap_unescape_url((char*)key);
		ap_unescape_url((char*)val);

		if(!strcmp(key,"service")) 
			service = val;

		if(!strcmp(key,"method"))
			method = val;

		if(!strcmp(key,"param"))
			string_array_add(sarray, val);

	}

	osrfLogInfo("\r\nPerforming(%d):  service %s "
			"| method %s |", getpid(), service, method );

	int k;
	for( k = 0; k!= sarray->size; k++ ) {
		osrfLogInfo( "param %s", string_array_get_string(sarray,k));
	}

	osrf_app_session* session = osrf_app_client_session_init(service);

	osrfLogDebug("session service: %s", session->remote_service );

	int req_id = osrf_app_session_make_req( session, NULL, method, 1, sarray );
	string_array_destroy(sarray);

	osrf_message* omsg = NULL;

	while((omsg = osrf_app_session_request_recv( session, req_id, 60 ))) {

		jsonObjectSetKey(response, "status", jsonNewNumberObject(omsg->status_code));

		if( omsg->_result_content ) {
			jsonObjectPush( payload, jsonObjectClone(omsg->_result_content));
	
		} else {

			if( omsg->status_code > 299 ) {
				char* s = omsg->status_name ? omsg->status_name : "Unknown Error";
				char* t = omsg->status_text ? omsg->status_text : "No Error Message";
				jsonObjectSetKey(response, "debug", jsonNewObject("\n\n%s:\n%s\n", s, t));
				osrfLogError( "Gateway received error: %s", 
						jsonObjectGetString(jsonObjectGetKey(response, "debug")));
				break;
			}
		}

		osrf_message_free(omsg);
		omsg = NULL;
	}

	char* content = jsonObjectToJSON(response);
	if(content) {
		osrfLogInfo( "Gateway responding with:  %s", content );
		ap_rputs(content,r);
		free(content);
	} 
	jsonObjectFree(response);

	osrf_app_session_request_finish( session, req_id );
	osrfLogDebug("gateway processed message successfully");

	osrf_app_session_destroy(session);
	return OK;
}

static void mod_ils_gateway_register_hooks (apr_pool_t *p) {
	ap_hook_handler(mod_ils_gateway_method_handler, NULL, NULL, APR_HOOK_MIDDLE);
	ap_hook_child_init(mod_ils_gateway_child_init,NULL,NULL,APR_HOOK_MIDDLE);
}


module AP_MODULE_DECLARE_DATA ils_gateway_module = {
	STANDARD20_MODULE_STUFF,
	NULL,
	NULL,
	ils_gateway_create_config,
	NULL,
	ils_gateway_cmds,
	mod_ils_gateway_register_hooks,
};




