#include "osrf_prefork.h"
#include <signal.h>
#include "osrf_app_session.h"
#include "osrf_application.h"

/* true if we just deleted a child.  This will allow us to make sure we're
	not trying to use freed memory */
int child_dead;

int main();
void sigchld_handler( int sig );

int osrf_prefork_run(char* appname) {

	if(!appname) {
		osrfLogError( OSRF_LOG_MARK, "osrf_prefork_run requires an appname to run!");
		return -1;
	}

	set_proc_title( "OpenSRF Listener [%s]", appname );

	int maxr = 1000; 
	int maxc = 10;
	int minc = 3;

	osrfLogInfo( OSRF_LOG_MARK, "Loading config in osrf_forker for app %s", appname);

	jsonObject* max_req = osrf_settings_host_value_object("/apps/%s/unix_config/max_requests", appname);
	jsonObject* min_children = osrf_settings_host_value_object("/apps/%s/unix_config/min_children", appname);
	jsonObject* max_children = osrf_settings_host_value_object("/apps/%s/unix_config/max_children", appname);

	char* keepalive	= osrf_settings_host_value("/apps/%s/keepalive", appname);
	time_t kalive;
	if( keepalive ) {
		kalive = atoi(keepalive);
		free(keepalive);
	} else {
		kalive = 5; /* give it a default */
	}

	osrfLogInfo(OSRF_LOG_MARK, "keepalive setting = %d seconds", kalive);


	
	if(!max_req) osrfLogWarning( OSRF_LOG_MARK, "Max requests not defined, assuming 1000");
	else maxr = (int) jsonObjectGetNumber(max_req);

	if(!min_children) osrfLogWarning( OSRF_LOG_MARK, "Min children not defined, assuming 3");
	else minc = (int) jsonObjectGetNumber(min_children);

	if(!max_children) osrfLogWarning( OSRF_LOG_MARK, "Max children not defined, assuming 10");
	else maxc = (int) jsonObjectGetNumber(max_children);

	jsonObjectFree(max_req);
	jsonObjectFree(min_children);
	jsonObjectFree(max_children);
	/* --------------------------------------------------- */

	char* resc = va_list_to_string("%s_listener", appname);

	if(!osrf_system_bootstrap_client_resc( NULL, NULL, resc )) {
		osrfLogError( OSRF_LOG_MARK, "Unable to bootstrap client for osrf_prefork_run()");
		free(resc);
		return -1;
	}

	free(resc);

	prefork_simple* forker = prefork_simple_init(
		osrfSystemGetTransportClient(), maxr, minc, maxc);

	forker->appname = strdup(appname);
	forker->keepalive	= kalive;

	if(forker == NULL) {
		osrfLogError( OSRF_LOG_MARK, "osrf_prefork_run() failed to create prefork_simple object");
		return -1;
	}

	prefork_launch_children(forker);

	osrf_prefork_register_routers(appname);
	
	osrfLogInfo( OSRF_LOG_MARK, "Launching osrf_forker for app %s", appname);
	prefork_run(forker);
	
	osrfLogWarning( OSRF_LOG_MARK, "prefork_run() retuned - how??");
	prefork_free(forker);
	return 0;

}

void osrf_prefork_register_routers( char* appname ) {

	osrfStringArray* arr = osrfNewStringArray(4);

	int c = osrfConfigGetValueList( NULL, arr, "/routers/router" );
	char* routerName = osrfConfigGetValue( NULL, "/router_name" );
	transport_client* client = osrfSystemGetTransportClient();

	osrfLogInfo( OSRF_LOG_MARK, "router name is %s and we have %d routers to connect to", routerName, c );

	while( c ) {
		char* domain = osrfStringArrayGetString(arr, --c);
		if(domain) {

			char* jid = va_list_to_string( "%s@%s/router", routerName, domain );
			osrfLogInfo( OSRF_LOG_MARK, "Registering with router %s", jid );

			transport_message* msg = message_init("registering", NULL, NULL, jid, NULL );
			message_set_router_info( msg, NULL, NULL, appname, "register", 0 );

			client_send_message( client, msg );
			message_free( msg );
			free(jid);
		}
	}

	free(routerName);
	osrfStringArrayFree(arr);
}

int prefork_child_init_hook(prefork_child* child) {

	if(!child) return -1;
	osrfLogDebug( OSRF_LOG_MARK, "Child init hook for child %d", child->pid);
	char* resc = va_list_to_string("%s_drone",child->appname);

	/* we want to remove traces of our parents socket connection 
	 * so we can have our own */
	osrfSystemIgnoreTransportClient();

	if(!osrf_system_bootstrap_client_resc( NULL, NULL, resc)) {
		osrfLogError( OSRF_LOG_MARK, "Unable to bootstrap client for osrf_prefork_run()");
		free(resc);
		return -1;
	}

	free(resc);

	if( ! osrfAppRunChildInit(child->appname) ) {
		osrfLogDebug(OSRF_LOG_MARK, "Prefork child_init succeeded\n");
	} else {
		osrfLogError(OSRF_LOG_MARK, "Prefork child_init failed\n");
		return -1;
	}

	set_proc_title( "OpenSRF Drone [%s]", child->appname );
	return 0;
}

void prefork_child_process_request(prefork_child* child, char* data) {
	if( !child ) return;

	/* construct the message from the xml */
	transport_message* msg = new_message_from_xml( data );

	osrfAppSession* session = osrf_stack_transport_handler(msg, child->appname);
	if(!session) return;

	if( session->stateless && session->state != OSRF_SESSION_CONNECTED ) {
		osrfAppSessionFree( session );
		return;
	}

	osrfLogDebug( OSRF_LOG_MARK, "Entering keepalive loop for session %s", session->session_id );
	int keepalive = child->keepalive;
	int retval;
	time_t start;
	time_t end;

	while(1) {

		osrfLogDebug(OSRF_LOG_MARK, 
				"osrf_prefork calling queue_wait [%d] in keepalive loop", keepalive);
		start		= time(NULL);
		retval	= osrf_app_session_queue_wait(session, keepalive);
		end		= time(NULL);

		if(retval) {
			osrfLogError(OSRF_LOG_MARK, "queue-wait returned non-success %d", retval);
			break;
		}

		/* see if the client disconnected from us */
		if(session->state != OSRF_SESSION_CONNECTED) break;

		/* see if the used up the timeout */
		if( (end - start) >= keepalive ) {

			osrfLogDebug(OSRF_LOG_MARK, "Keepalive timed out, exiting connected session");

			osrfAppSessionStatus( 
					session, 
					OSRF_STATUS_TIMEOUT, 
					"osrfConnectStatus", 
					0, "Disconnected on timeout" );

			break;
		}
	}

	osrfLogDebug( OSRF_LOG_MARK, "Exiting keepalive loop for session %s", session->session_id );
	osrfAppSessionFree( session );
	return;
}


prefork_simple*  prefork_simple_init( transport_client* client, 
		int max_requests, int min_children, int max_children ) {

	if( min_children > max_children ) {
		osrfLogError( OSRF_LOG_MARK,  "min_children (%d) is greater "
				"than max_children (%d)", min_children, max_children );
		return NULL;
	}

	if( max_children > ABS_MAX_CHILDREN ) {
		osrfLogError( OSRF_LOG_MARK,  "max_children (%d) is greater than ABS_MAX_CHILDREN (%d)",
				max_children, ABS_MAX_CHILDREN );
		return NULL;
	}

	osrfLogInfo(OSRF_LOG_MARK, "Prefork launching child with max_request=%d,"
		"min_children=%d, max_children=%d", max_requests, min_children, max_children );

	/* flesh out the struct */
	prefork_simple* prefork = (prefork_simple*) safe_malloc(sizeof(prefork_simple));	
	prefork->max_requests = max_requests;
	prefork->min_children = min_children;
	prefork->max_children = max_children;
	prefork->first_child = NULL;
	prefork->connection = client;

	return prefork;
}

prefork_child*  launch_child( prefork_simple* forker ) {

	pid_t pid;
	int data_fd[2];
	int status_fd[2];

	/* Set up the data pipes and add the child struct to the parent */
	if( pipe(data_fd) < 0 ) { /* build the data pipe*/
		osrfLogError( OSRF_LOG_MARK,  "Pipe making error" );
		return NULL;
	}

	if( pipe(status_fd) < 0 ) {/* build the status pipe */
		osrfLogError( OSRF_LOG_MARK,  "Pipe making error" );
		return NULL;
	}

	osrfLogInternal( OSRF_LOG_MARK,  "Pipes: %d %d %d %d", data_fd[0], data_fd[1], status_fd[0], status_fd[1] );
	prefork_child* child = prefork_child_init( forker->max_requests, data_fd[0], 
			data_fd[1], status_fd[0], status_fd[1] );

	child->appname = strdup(forker->appname);
	child->keepalive = forker->keepalive;


	add_prefork_child( forker, child );

	if( (pid=fork()) < 0 ) {
		osrfLogError( OSRF_LOG_MARK,  "Forking Error" );
		return NULL;
	}

	if( pid > 0 ) {  /* parent */

		signal(SIGCHLD, sigchld_handler);
		(forker->current_num_children)++;
		child->pid = pid;

		osrfLogDebug( OSRF_LOG_MARK,  "Parent launched %d", pid );
		/* *no* child pipe FD's can be closed or the parent will re-use fd's that
			the children are currently using */
		return child;
	}

	else { /* child */

		osrfLogInternal( OSRF_LOG_MARK, "I am  new child with read_data_fd = %d and write_status_fd = %d",
			child->read_data_fd, child->write_status_fd );

		child->pid = getpid();
		close( child->write_data_fd );
		close( child->read_status_fd );

		/* do the initing */
		if( prefork_child_init_hook(child) == -1 ) {
			osrfLogError(OSRF_LOG_MARK, 
				"Forker child going away because we could not connect to OpenSRF...");
			exit(1);
		}

		prefork_child_wait( child );
		exit(0); /* just to be sure */
	 }
	return NULL;
}


void prefork_launch_children( prefork_simple* forker ) {
	if(!forker) return;
	int c = 0;
	while( c++ < forker->min_children )
		launch_child( forker );
}


void sigchld_handler( int sig ) {
	signal(SIGCHLD, sigchld_handler);
	child_dead = 1;
}


void reap_children( prefork_simple* forker ) {

	pid_t child_pid;
	int status;

	while( (child_pid=waitpid(-1,&status,WNOHANG)) > 0) 
		del_prefork_child( forker, child_pid ); 

	/* replenish */
	while( forker->current_num_children < forker->min_children ) 
		launch_child( forker );

	child_dead = 0;
}

void prefork_run(prefork_simple* forker) {

	if( forker->first_child == NULL )
		return;

	transport_message* cur_msg = NULL;


	while(1) {

		if( forker->first_child == NULL ) {/* no more children */
			osrfLogWarning( OSRF_LOG_MARK, "No more children..." );
			return;
		}

		osrfLogDebug( OSRF_LOG_MARK, "Forker going into wait for data...");
		cur_msg = client_recv( forker->connection, -1 );

		//fprintf(stderr, "Got Data %f\n", get_timestamp_millis() );

		if( cur_msg == NULL ) continue;

		int honored = 0;	/* true if we've serviced the request */

		while( ! honored ) {

			check_children( forker ); 

			osrfLogDebug( OSRF_LOG_MARK,  "Server received inbound data" );
			int k;
			prefork_child* cur_child = forker->first_child;

			/* Look for an available child */
			for( k = 0; k < forker->current_num_children; k++ ) {

				osrfLogInternal( OSRF_LOG_MARK, "Searching for available child. cur_child->pid = %d", cur_child->pid );
				osrfLogInternal( OSRF_LOG_MARK, "Current num children %d and loop %d", forker->current_num_children, k);
			
				if( cur_child->available ) {
					osrfLogDebug( OSRF_LOG_MARK,  "forker sending data to %d", cur_child->pid );

					message_prepare_xml( cur_msg );
					char* data = cur_msg->msg_xml;
					if( ! data || strlen(data) < 1 ) break;

					cur_child->available = 0;
					osrfLogInternal( OSRF_LOG_MARK,  "Writing to child fd %d", cur_child->write_data_fd );

					int written = 0;
					//fprintf(stderr, "Writing Data %f\n", get_timestamp_millis() );
					if( (written = write( cur_child->write_data_fd, data, strlen(data) + 1 )) < 0 ) {
						osrfLogWarning( OSRF_LOG_MARK, "Write returned error %d", errno);
						cur_child = cur_child->next;
						continue;
					}

					//fprintf(stderr, "Wrote %d bytes to child\n", written);

					forker->first_child = cur_child->next;
					honored = 1;
					break;
				} else 
					cur_child = cur_child->next;
			} 

			/* if none available, add a new child if we can */
			if( ! honored ) {
				osrfLogDebug( OSRF_LOG_MARK, "Not enough children, attempting to add...");
				if( forker->current_num_children < forker->max_children ) {
					osrfLogDebug( OSRF_LOG_MARK,  "Launching new child with current_num = %d",
							forker->current_num_children );

					prefork_child* new_child = launch_child( forker );
					message_prepare_xml( cur_msg );
					char* data = cur_msg->msg_xml;
					if( ! data || strlen(data) < 1 ) break;
					new_child->available = 0;
					osrfLogDebug( OSRF_LOG_MARK,  "Writing to new child fd %d : pid %d", 
							new_child->write_data_fd, new_child->pid );
					write( new_child->write_data_fd, data, strlen(data) + 1 );
					forker->first_child = new_child->next;
					honored = 1;
				}
			}

			if( !honored ) {
				osrfLogWarning( OSRF_LOG_MARK,  "No children available, sleeping and looping..." );
				usleep( 50000 ); /* 50 milliseconds */
			}

			if( child_dead )
				reap_children(forker);


			//fprintf(stderr, "Parent done with request %f\n", get_timestamp_millis() );

		} // honored?

		message_free( cur_msg );

	} /* top level listen loop */

}


void check_children( prefork_simple* forker ) {

	//check_begin:

	int select_ret;
	fd_set read_set;
	FD_ZERO(&read_set);
	int max_fd = 0;
	int n;

	struct timeval tv;
	tv.tv_sec	= 0;
	tv.tv_usec	= 0;

	if( child_dead )
		reap_children(forker);

	prefork_child* cur_child = forker->first_child;

	int i;
	for( i = 0; i!= forker->current_num_children; i++ ) {

		if( cur_child->read_status_fd > max_fd )
			max_fd = cur_child->read_status_fd;
		FD_SET( cur_child->read_status_fd, &read_set );
		cur_child = cur_child->next;
	}

	FD_CLR(0,&read_set);/* just to be sure */

	if( (select_ret=select( max_fd + 1 , &read_set, NULL, NULL, &tv)) == -1 ) {
		osrfLogWarning( OSRF_LOG_MARK,  "Select returned error %d on check_children", errno );
	}

	if( select_ret == 0 )
		return;

	/* see if one of a child has told us it's done */
	cur_child = forker->first_child;
	int j;
	int num_handled = 0;
	for( j = 0; j!= forker->current_num_children && num_handled < select_ret ; j++ ) {

		if( FD_ISSET( cur_child->read_status_fd, &read_set ) ) {
			//printf( "Server received status from a child %d\n", cur_child->pid );
			osrfLogDebug( OSRF_LOG_MARK,  "Server received status from a child %d", cur_child->pid );

			num_handled++;

			/* now suck off the data */
			char buf[64];
			memset( buf, 0, 64);
			if( (n=read(cur_child->read_status_fd, buf, 63))  < 0 ) {
				osrfLogWarning( OSRF_LOG_MARK, "Read error afer select in child status read with errno %d", errno);
			}

			osrfLogDebug( OSRF_LOG_MARK,  "Read %d bytes from status buffer: %s", n, buf );
			cur_child->available = 1;
		}
		cur_child = cur_child->next;
	} 

}


void prefork_child_wait( prefork_child* child ) {

	int i,n;
	growing_buffer* gbuf = buffer_init( READ_BUFSIZE );
	char buf[READ_BUFSIZE];
	memset( buf, 0, READ_BUFSIZE );

	for( i = 0; i < child->max_requests; i++ ) {

		n = -1;
		clr_fl(child->read_data_fd, O_NONBLOCK );
		while( (n=read(child->read_data_fd, buf, READ_BUFSIZE-1)) > 0 ) {
			buffer_add( gbuf, buf );
			memset( buf, 0, READ_BUFSIZE );

			//fprintf(stderr, "Child read %d bytes\n", n);

			if( n == READ_BUFSIZE ) { 
				//fprintf(stderr, "We read READ_BUFSIZE data....\n");
				/* XXX */
				/* either we have exactly READ_BUFSIZE data, 
					or there's more waiting that we need to grab*/
				/* must set to non-block for reading more */
			} else {
				//fprintf(stderr, "Read Data %f\n", get_timestamp_millis() );
				prefork_child_process_request(child, gbuf->buf);
				buffer_reset( gbuf );
				break;
			}
		}

		if( n < 0 ) {
			osrfLogWarning( OSRF_LOG_MARK,  "Prefork child read returned error with errno %d", errno );
			break;
		}

		if( i < child->max_requests - 1 ) 
			write( child->write_status_fd, "available" /*less than 64 bytes*/, 9 );
	}

	buffer_free(gbuf);

	osrfLogDebug( OSRF_LOG_MARK, "Child with max-requests=%d, num-served=%d exiting...[%d]", 
			child->max_requests, i, getpid() );

	exit(0);
}


void add_prefork_child( prefork_simple* forker, prefork_child* child ) {
	
	if( forker->first_child == NULL ) {
		forker->first_child = child;
		child->next = child;
		return;
	}

	/* we put the child in as the last because, regardless, 
		we have to do the DLL splice dance, and this is the
	   simplest way */

	prefork_child* start_child = forker->first_child;
	while(1) {
		if( forker->first_child->next == start_child ) 
			break;
		forker->first_child = forker->first_child->next;
	}

	/* here we know that forker->first_child is the last element 
		in the list and start_child is the first.  Insert the
		new child between them*/

	forker->first_child->next = child;
	child->next = start_child;
	return;
}

prefork_child* find_prefork_child( prefork_simple* forker, pid_t pid ) {

	if( forker->first_child == NULL ) { return NULL; }
	prefork_child* start_child = forker->first_child;
	do {
		if( forker->first_child->pid == pid ) 
			return forker->first_child;
	} while( (forker->first_child = forker->first_child->next) != start_child );

	return NULL;
}


void del_prefork_child( prefork_simple* forker, pid_t pid ) { 

	if( forker->first_child == NULL ) { return; }

	(forker->current_num_children)--;
	osrfLogDebug( OSRF_LOG_MARK, "Deleting Child: %d", pid );

	prefork_child* start_child = forker->first_child; /* starting point */
	prefork_child* cur_child	= start_child; /* current pointer */
	prefork_child* prev_child	= start_child; /* the trailing pointer */

	/* special case where there is only one in the list */
	if( start_child == start_child->next ) {
		if( start_child->pid == pid ) {
			forker->first_child = NULL;

			close( start_child->read_data_fd );
			close( start_child->write_data_fd );
			close( start_child->read_status_fd );
			close( start_child->write_status_fd );

			prefork_child_free( start_child );
		}
		return;
	}


	/* special case where the first item in the list needs to be removed */
	if( start_child->pid == pid ) { 

		/* find the last one so we can remove the start_child */
		do { 
			prev_child = cur_child;
			cur_child = cur_child->next;
		}while( cur_child != start_child );

		/* now cur_child == start_child */
		prev_child->next = cur_child->next;
		forker->first_child = prev_child;

		close( cur_child->read_data_fd );
		close( cur_child->write_data_fd );
		close( cur_child->read_status_fd );
		close( cur_child->write_status_fd );

		prefork_child_free( cur_child );
		return;
	} 

	do {
		prev_child = cur_child;
		cur_child = cur_child->next;

		if( cur_child->pid == pid ) {
			prev_child->next = cur_child->next;

			close( cur_child->read_data_fd );
			close( cur_child->write_data_fd );
			close( cur_child->read_status_fd );
			close( cur_child->write_status_fd );

			prefork_child_free( cur_child );
			return;
		}

	} while(cur_child != start_child);
}




prefork_child* prefork_child_init( 
	int max_requests, int read_data_fd, int write_data_fd, 
	int read_status_fd, int write_status_fd ) {

	prefork_child* child = (prefork_child*) safe_malloc(sizeof(prefork_child));
	child->max_requests		= max_requests;
	child->read_data_fd		= read_data_fd;
	child->write_data_fd		= write_data_fd;
	child->read_status_fd	= read_status_fd;
	child->write_status_fd	= write_status_fd;
	child->available			= 1;

	return child;
}


int prefork_free( prefork_simple* prefork ) {
	
	while( prefork->first_child != NULL ) {
		osrfLogInfo( OSRF_LOG_MARK,  "Killing children and sleeping 1 to reap..." );
		kill( 0,	SIGKILL );
		sleep(1);
	}

	client_free(prefork->connection);
	free(prefork->appname);
	free( prefork );
	return 1;
}

int prefork_child_free( prefork_child* child ) { 
	free(child->appname);
	close(child->read_data_fd);
	close(child->write_status_fd);
	free( child ); 
	return 1;
}

