#include "oils_idl.h"

#include <stdlib.h>
#include <string.h>
#include <libxml/globals.h>
#include <libxml/xmlerror.h>
#include <libxml/parser.h>
#include <libxml/tree.h>
#include <libxml/debugXML.h>
#include <libxml/xmlmemory.h>

#define PERSIST_NS "http://open-ils.org/spec/opensrf/IDL/persistence/v1"
#define OBJECT_NS "http://open-ils.org/spec/opensrf/IDL/objects/v1"
#define BASE_NS "http://opensrf.org/spec/IDL/base/v1"

xmlDocPtr idlDoc = NULL; // parse and store the IDL here

/* parse and store the IDL here */
osrfHash* idlHash;

osrfHash* oilsIDL() { return idlHash; }
osrfHash* oilsIDLInit( char* idl_filename ) {

	if (idlHash) return idlHash;

	char* string_tmp = NULL;

	idlHash = osrfNewHash();
	osrfHash* usrData = NULL;

	osrfLogInfo(OSRF_LOG_MARK, "Parsing the IDL XML...");
	idlDoc = xmlReadFile( idl_filename, NULL, XML_PARSE_XINCLUDE );
	
	if (!idlDoc) {
		osrfLogError(OSRF_LOG_MARK, "Could not load or parse the IDL XML file!");
		return NULL;
	}

	osrfLogInfo(OSRF_LOG_MARK, "Initializing the Fieldmapper IDL...");

	xmlNodePtr docRoot = xmlDocGetRootElement(idlDoc);
	xmlNodePtr kid = docRoot->children;
	while (kid) {
		if (!strcmp( (char*)kid->name, "class" )) {

			usrData = osrfNewHash();
			osrfHashSet( usrData, xmlGetProp(kid, BAD_CAST "id"), "classname");
			osrfHashSet( usrData, xmlGetNsProp(kid, BAD_CAST "fieldmapper", BAD_CAST OBJECT_NS), "fieldmapper");
			osrfHashSet( usrData, xmlGetNsProp(kid, BAD_CAST "readonly", BAD_CAST PERSIST_NS), "readonly");

			osrfHashSet( idlHash, usrData, (char*)osrfHashGet(usrData, "classname") );

			string_tmp = NULL;
			if ((string_tmp = (char*)xmlGetNsProp(kid, BAD_CAST "tablename", BAD_CAST PERSIST_NS))) {
				osrfHashSet(
					usrData,
					strdup( string_tmp ),
					"tablename"
				);
			}

			string_tmp = NULL;
			if ((string_tmp = (char*)xmlGetNsProp(kid, BAD_CAST "virtual", BAD_CAST PERSIST_NS))) {
				osrfHashSet(
					usrData,
					strdup( string_tmp ),
					"virtual"
				);
			}

			osrfStringArray* controller = osrfNewStringArray(0);
			string_tmp = NULL;
			if( (string_tmp = (char*)xmlGetProp(kid, BAD_CAST "controller") )) {
				char* controller_list = strdup( string_tmp );
				osrfLogInfo(OSRF_LOG_MARK, "Controller list is %s", string_tmp );

				if (strlen( controller_list ) > 0) {
					char* st_tmp;
					char* _controller_class = strtok_r(controller_list, " ", &st_tmp);
					osrfStringArrayAdd(controller, strdup(_controller_class));

					while ((_controller_class = strtok_r(NULL, " ", &st_tmp))) {
						osrfStringArrayAdd(controller, strdup(_controller_class));
					}
				}
			}
			osrfHashSet( usrData, controller, "controller");


			osrfHash* _tmp;
			osrfHash* links = osrfNewHash();
			osrfHash* fields = osrfNewHash();

			osrfHashSet( usrData, fields, "fields" );
			osrfHashSet( usrData, links, "links" );

			xmlNodePtr _cur = kid->children;

			while (_cur) {

				if (!strcmp( (char*)_cur->name, "fields" )) {

					string_tmp = NULL;
					if( (string_tmp = (char*)xmlGetNsProp(_cur, BAD_CAST "primary", BAD_CAST PERSIST_NS)) ) {
						osrfHashSet(
							usrData,
							strdup( string_tmp ),
							"primarykey"
						);
					}

					string_tmp = NULL;
					if( (string_tmp = (char*)xmlGetNsProp(_cur, BAD_CAST "sequence", BAD_CAST PERSIST_NS)) ) {
						osrfHashSet(
							usrData,
							strdup( string_tmp ),
							"sequence"
						);
					}

					xmlNodePtr _f = _cur->children;

					while(_f) {
						if (strcmp( (char*)_f->name, "field" )) {
							_f = _f->next;
							continue;
						}

						_tmp = osrfNewHash();

						string_tmp = NULL;
						if( (string_tmp = (char*)xmlGetNsProp(_f, BAD_CAST "array_position", BAD_CAST OBJECT_NS)) ) {
							osrfHashSet(
								_tmp,
								strdup( string_tmp ),
								"array_position"
							);
						}

						string_tmp = NULL;
						if( (string_tmp = (char*)xmlGetNsProp(_f, BAD_CAST "virtual", BAD_CAST PERSIST_NS)) ) {
							osrfHashSet(
								_tmp,
								strdup( string_tmp ),
								"virtual"
							);
						}

						string_tmp = NULL;
						if( (string_tmp = (char*)xmlGetNsProp(_f, BAD_CAST "primitive", BAD_CAST PERSIST_NS)) ) {
							osrfHashSet(
								_tmp,
								strdup( string_tmp ),
								"primitive"
							);
						}

						string_tmp = NULL;
						if( (string_tmp = (char*)xmlGetProp(_f, BAD_CAST "name")) ) {
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

						string_tmp = NULL;
						if( (string_tmp = (char*)xmlGetProp(_l, BAD_CAST "reltype")) ) {
							osrfHashSet(
								_tmp,
								strdup( string_tmp ),
								"reltype"
							);
						}
						osrfLogInfo(OSRF_LOG_MARK, "Adding link with reltype %s", string_tmp );

						string_tmp = NULL;
						if( (string_tmp = (char*)xmlGetProp(_l, BAD_CAST "key")) ) {
							osrfHashSet(
								_tmp,
								strdup( string_tmp ),
								"key"
							);
						}
						osrfLogInfo(OSRF_LOG_MARK, "Link fkey is %s", string_tmp );

						string_tmp = NULL;
						if( (string_tmp = (char*)xmlGetProp(_l, BAD_CAST "class")) ) {
							osrfHashSet(
								_tmp,
								strdup( string_tmp ),
								"class"
							);
						}
						osrfLogInfo(OSRF_LOG_MARK, "Link fclass is %s", string_tmp );

						osrfStringArray* map = osrfNewStringArray(0);

						string_tmp = NULL;
						if( (string_tmp = (char*)xmlGetProp(_l, BAD_CAST "map") )) {
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

						string_tmp = NULL;
						if( (string_tmp = (char*)xmlGetProp(_l, BAD_CAST "field")) ) {
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

				if (!strcmp( (char*)_cur->name, "source_definition" )) {
					string_tmp = NULL;
					if( (string_tmp = (char*)xmlNodeGetContent(_cur)) ) {
						osrfHashSet(
							usrData,
							strdup( string_tmp ),
							"source_definition"
						);
					}

				}

				_cur = _cur->next;
			}
		}

		kid = kid->next;
	}

	osrfLogInfo(OSRF_LOG_MARK, "...IDL XML parsed");

	return idlHash;
}

osrfHash* oilsIDLFindPath( char* path, ... ) {
	if(!path || strlen(path) < 1) return NULL;

	osrfHash* obj = idlHash;

	VA_LIST_TO_STRING(path);
	char* buf = VA_BUF;

	char* token = NULL;
	char* t = buf;
	char* tt;

	token = strtok_r(t, "/", &tt);
	if(!token) return NULL;

	do {
		obj = osrfHashGet(obj, token);
	} while( (token = strtok_r(NULL, "/", &tt)) && obj);

	return obj;
}

int oilsIDL_classIsFieldmapper ( char* classname ) {
	if (!classname) return 0;
	if(oilsIDLFindPath( "/%s", classname )) return 1;
	return 0;
}

int oilsIDL_ntop (char* classname, char* fieldname) {
	osrfHash* _pos = NULL;

	if (!oilsIDL_classIsFieldmapper(classname)) return -1;
	_pos = oilsIDLFindPath( "/%s/fields/%s", classname, fieldname );
	if (_pos) return atoi( osrfHashGet(_pos, "array_position") );
	return -1;
}

char * oilsIDL_pton (char* classname, int pos) {
	char* ret = NULL;
	osrfHash* f = NULL;
	osrfHash* fields = NULL;
	osrfHashIterator* itr = NULL;

	if (!oilsIDL_classIsFieldmapper(classname)) return NULL;

	fields = oilsIDLFindPath( "/%s/fields", classname );
	itr = osrfNewHashIterator( fields );

	while ( (f = osrfHashIteratorNext( itr )) ) {
		if ( atoi(osrfHashGet(f, "array_position")) == pos ) {
			ret = strdup(itr->current);
			break;
		}
	}

	osrfHashIteratorFree( itr );

	return ret;
}

