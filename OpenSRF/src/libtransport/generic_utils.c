#include "opensrf/generic_utils.h"
#include <stdio.h>
#include "pthread.h"
#include <sys/timeb.h>

void get_timestamp( char buf_36chars[]) {

	struct timeb tb;
	ftime(&tb);
	char* localtime = strdup( ctime( &(tb.time) ) );
	char mil[4];
	memset(mil,0,4);
	sprintf(mil," (%d)",tb.millitm);
	strcpy( buf_36chars, localtime );
	buf_36chars[ strlen(localtime)-1] = '\0'; // remove newline
	strcat(buf_36chars,mil);
	free(localtime);
}

double get_timestamp_millis() {
	struct timeb t;
	ftime(&t);
	double time	= ( (int)t.time	+ ( ((double)t.millitm) / 1000 ) );
	return time;
}
	

inline void* safe_malloc( int size ) {
	void* ptr = (void*) malloc( size );
	if( ptr == NULL ) 
		fatal_handler("safe_malloc(): Out of Memory" );
	memset( ptr, 0, size );
	return ptr;
}

// ---------------------------------------------------------------------------------
// Here we define how we want to handle various error levels.
// ---------------------------------------------------------------------------------


static FILE* log_file = NULL;
static int log_level = -1;
static int logging = 0;
pthread_mutex_t mutex;

void log_free() { if( log_file != NULL ) fclose(log_file ); }

void fatal_handler( char* msg, ... ) {
		
	char buf[36];
	memset( buf, 0, 36 );
	get_timestamp( buf );
	pid_t  pid = getpid();
	va_list args;

	if( logging ) {

		if( log_level < LOG_ERROR )
			return;

		pthread_mutex_lock( &(mutex) );
		fprintf( log_file, "[%s %d] [%s] ", buf, pid, "ERR " );
	
		va_start(args, msg);
		vfprintf(log_file, msg, args);
		va_end(args);
	
		fprintf(log_file, "\n");
		fflush( log_file );
		pthread_mutex_unlock( &(mutex) );

	}
	
	/* also log to stderr  for ERRORS*/
	fprintf( stderr, "[%s %d] [%s] ", buf, pid, "ERR " );
	va_start(args, msg);
	vfprintf(stderr, msg, args);
	va_end(args);
	fprintf( stderr, "\n" );

	exit(99);
}

void warning_handler( char* msg, ... ) {

	char buf[36];
	memset( buf, 0, 36 );
	get_timestamp( buf );
	pid_t  pid = getpid();
	va_list args;
	
	if(logging) {

		if( log_level < LOG_WARNING )
			return;

		pthread_mutex_lock( &(mutex) );
		fprintf( log_file, "[%s %d] [%s] ", buf, pid, "WARN" );
	
		va_start(args, msg);
		vfprintf(log_file, msg, args);
		va_end(args);
	
		fprintf(log_file, "\n");
		fflush( log_file );
		pthread_mutex_unlock( &(mutex) );

	} else {

		fprintf( stderr, "[%s %d] [%s] ", buf, pid, "WARN" );
		va_start(args, msg);
		vfprintf(stderr, msg, args);
		va_end(args);
		fprintf( stderr, "\n" );
	}

}

void info_handler( char* msg, ... ) {

	char buf[36];
	memset( buf, 0, 36 );
	get_timestamp( buf );
	pid_t  pid = getpid();
	va_list args;

	if(logging) {

		if( log_level < LOG_INFO )
			return;
		pthread_mutex_lock( &(mutex) );
		fprintf( log_file, "[%s %d] [%s] ", buf, pid, "INFO" );

		va_start(args, msg);
		vfprintf(log_file, msg, args);
		va_end(args);
	
		fprintf(log_file, "\n");
		fflush( log_file );
		pthread_mutex_unlock( &(mutex) );

	} else {

		fprintf( stderr, "[%s %d] [%s] ", buf, pid, "INFO" );
		va_start(args, msg);
		vfprintf(stderr, msg, args);
		va_end(args);
		fprintf( stderr, "\n" );
		fflush(stderr);

	}
}


void debug_handler( char* msg, ... ) {

	char buf[36];
	memset( buf, 0, 36 );
	get_timestamp( buf );
	pid_t  pid = getpid();
	va_list args;
	
	if(logging) {

		if( log_level < LOG_DEBUG )
			return;

		pthread_mutex_lock( &(mutex) );
		fprintf( log_file, "[%s %d] [%s] ", buf, pid, "DEBG" );
	
		va_start(args, msg);
		vfprintf(log_file, msg, args);
		va_end(args);
	
		fprintf(log_file, "\n");
		fflush( log_file );
		pthread_mutex_unlock( &(mutex) );

	} else {

		fprintf( stderr, "[%s %d] [%s] ", buf, pid, "DEBG" );
		va_start(args, msg);
		vfprintf(stderr, msg, args);
		va_end(args);
		fprintf( stderr, "\n" );
	}

}


int log_init( int llevel, char* lfile ) {


	if( llevel < 1 ) {
		logging = 0;
		return 0;
	}

	log_level = llevel;
	log_file = fopen( lfile, "a" );
	if( log_file == NULL ) {
		fprintf( stderr, "Unable to open log file %s for appending\n", lfile );
		return 0;
	}
	logging = 1;
	return 1;

}


// ---------------------------------------------------------------------------------
// Flesh out a ubiqitous growing string buffer
// ---------------------------------------------------------------------------------

growing_buffer* buffer_init(int num_initial_bytes) {

	if( num_initial_bytes > BUFFER_MAX_SIZE ) {
		return NULL;
	}


	size_t len = sizeof(growing_buffer);

	growing_buffer* gb = (growing_buffer*) safe_malloc(len);

	gb->n_used = 0;/* nothing stored so far */
	gb->size = num_initial_bytes;
	gb->buf = (char *) safe_malloc(gb->size + 1);

	return gb;
}

int buffer_add(growing_buffer* gb, char* data) {


	if( ! gb || ! data  ) { return 0; }
	int data_len = strlen( data );

	if( data_len == 0 ) { return 0; }
	int total_len = data_len + gb->n_used;

	while( total_len >= gb->size ) {
		gb->size *= 2;
	}

	if( gb->size > BUFFER_MAX_SIZE ) {
		warning_handler( "Buffer reached MAX_SIZE of %d", BUFFER_MAX_SIZE );
		buffer_free( gb );
		return 0;
	}

	char* new_data = (char*) safe_malloc( gb->size );

	strcpy( new_data, gb->buf );
	free( gb->buf );
	gb->buf = new_data;

	strcat( gb->buf, data );
	gb->n_used = total_len;
	return total_len;
}


int buffer_reset( growing_buffer *gb){
	if( gb == NULL ) { return 0; }
	if( gb->buf == NULL ) { return 0; }
	memset( gb->buf, 0, gb->size );
	gb->n_used = 0;
	return 1;
}

int buffer_free( growing_buffer* gb ) {
	if( gb == NULL ) 
		return 0;
	free( gb->buf );
	free( gb );
	return 1;
}

char* buffer_data( growing_buffer *gb) {
	return strdup( gb->buf );
}





// ---------------------------------------------------------------------------------
// Config module
// ---------------------------------------------------------------------------------


// ---------------------------------------------------------------------------------
// Allocate and build the conf_reader.  This only has to happen once in a given
// system.  Repeated calls are ignored.
// ---------------------------------------------------------------------------------
/*
void config_reader_init( char* config_file ) {
	if( conf_reader == NULL ) {

		if( config_file == NULL || strlen(config_file) == 0 ) {
			fatal_handler( "config_reader_init(): No config file specified" );
			return;
		}

		size_t len = sizeof( config_reader );
		conf_reader = (config_reader*) safe_malloc( len );

		conf_reader->config_doc = xmlParseFile( config_file ); 
		conf_reader->xpathCx = xmlXPathNewContext( conf_reader->config_doc );
		if( conf_reader->xpathCx == NULL ) {
			fatal_handler( "config_reader_init(): Unable to create xpath context");
			return;
		}
	}
}
*/

void config_reader_init( char* name, char* config_file ) {

	if( name == NULL || config_file == NULL || strlen(config_file) == 0 ) {
		fatal_handler( "config_reader_init(): No config file specified" );
		return;
	}

	config_reader* reader = 
		(config_reader*) safe_malloc(sizeof(config_reader));

	reader->config_doc = xmlParseFile( config_file ); 
	reader->xpathCx = xmlXPathNewContext( reader->config_doc );
	reader->name = strdup(name);
	reader->next = NULL;

	if( reader->xpathCx == NULL ) {
		fprintf( stderr, "config_reader_init(): Unable to create xpath context\n");
		return;
	}

	if( conf_reader == NULL ) {
		conf_reader = reader;
	} else {
		config_reader* tmp = conf_reader;
		conf_reader = reader;
		reader->next = tmp;
	}
}


char* config_value( const char* config_name, const char* xp_query, ... ) {

	if( conf_reader == NULL || xp_query == NULL ) {
		fatal_handler( "config_value(): NULL conf_reader or NULL param(s)" );
		return NULL;
	}

	config_reader* reader = conf_reader;
	while( reader != NULL ) {
		if( !strcmp(reader->name, config_name)) 
			break;
		reader = reader->next;
	}

	if( reader == NULL ) {
		fprintf(stderr, "No Config file with name %s\n", config_name );
		return NULL;
	}

	int slen = strlen(xp_query) + 512;/* this is unsafe ... */
	char xpath_query[ slen ]; 
	memset( xpath_query, 0, slen );
	va_list va_args;
	va_start(va_args, xp_query);
	vsprintf(xpath_query, xp_query, va_args);
	va_end(va_args);


	char* val;
	int len = strlen(xpath_query) + 100;
	char alert_buffer[len];
	memset( alert_buffer, 0, len );

	// build the xpath object
	xmlXPathObjectPtr xpathObj = xmlXPathEvalExpression( BAD_CAST xpath_query, reader->xpathCx );

	if( xpathObj == NULL ) {
		sprintf( alert_buffer, "Could not build xpath object: %s", xpath_query );
		fatal_handler( alert_buffer );
		return NULL;
	}


	if( xpathObj->type == XPATH_NODESET ) {

		// ----------------------------------------------------------------------------
		// Grab nodeset from xpath query, then first node, then first text node and 
		// finaly the text node's value
		// ----------------------------------------------------------------------------
		xmlNodeSet* node_list = xpathObj->nodesetval;
		if( node_list == NULL ) {
			sprintf( alert_buffer, "Could not build xpath object: %s", xpath_query );
			warning_handler(alert_buffer);
			return NULL;
		}

		if( node_list->nodeNr == 0 ) {
			sprintf( alert_buffer, "Config XPATH query  returned 0 results: %s", xpath_query );
			warning_handler(alert_buffer);
			return NULL;
		}


		xmlNodePtr element_node = *(node_list)->nodeTab;
		if( element_node == NULL ) {
			sprintf( alert_buffer, "Config XPATH query  returned 0 results: %s", xpath_query );
			warning_handler(alert_buffer);
			return NULL;
		}

		xmlNodePtr text_node = element_node->children;
		if( text_node == NULL ) {
			sprintf( alert_buffer, "Config variable has no value: %s", xpath_query );
			warning_handler(alert_buffer);
			return NULL;
		}

		val = text_node->content;
		if( val == NULL ) {
			sprintf( alert_buffer, "Config variable has no value: %s", xpath_query );
			warning_handler(alert_buffer);
			return NULL;
		}


	} else { 
		sprintf( alert_buffer, "Xpath evaluation failed: %s", xpath_query );
		warning_handler(alert_buffer);
		return NULL;
	}

	char* value = strdup(val);
	if( value == NULL ) { warning_handler( "config_value(): Empty config value or Out of Memory!" ); }

	// Free XPATH structures
	if( xpathObj != NULL ) xmlXPathFreeObject( xpathObj );

	return value;
}


void config_reader_free() {
	while( conf_reader != NULL ) {
		xmlXPathFreeContext( conf_reader->xpathCx );
		xmlFreeDoc( conf_reader->config_doc );
		free(conf_reader->name );
		config_reader* tmp = conf_reader->next;
		free( conf_reader );
		conf_reader = tmp;
	}
}
