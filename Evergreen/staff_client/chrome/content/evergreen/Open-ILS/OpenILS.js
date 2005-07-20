function OpenILS_init(params) { 
	sdump( 'D_TRACE', arg_dump( arguments, { '0':'js2JSON( map_object( arg,function(i,o){try{return [i,o.toString()];}catch(E){return [i,o];}}))' }));

	try {

		switch(params.app) {
			case 'Auth' : auth_init(params); break;
			case 'AppShell' : app_shell_init(params); register_AppShell(params.w); break;
			case 'Opac' : opac_init(params); break;
			case 'PatronSearch' : patron_search_init(params); break;
			case 'PatronDisplay' : patron_display_init(params); break;
			case 'Checkin' : checkin_init(params); break;
			case 'HoldCapture' : hold_capture_init(params); break;
		}

	} catch(E) { sdump('D_ERROR',js2JSON(E)+'\n'); }

	try {

		//register_document(params.w.document);
		register_window(params.w);

	} catch(E) { sdump('D_ERROR',js2JSON(E)+'\n'); }
	sdump('D_TRACE_EXIT',arg_dump(arguments));
}

function OpenILS_exit(params) {
	sdump( 'D_TRACE', arg_dump( arguments, { '0':'js2JSON( map_object( arg,function(i,o){try{return [i,o.toString()];}catch(E){return [i,o];}}))' }));

	/*
	try {
	
		switch(params.app) {
			case 'Auth' : auth_exit(params); break;
			case 'AppShell' : app_shell_exit(params); unregister_AppShell(params.w); break;
			case 'Opac' : opac_exit(params); break;
			case 'PatronSearch' : patron_search_exit(params); break;
			case 'PatronDisplay' : patron_display_exit(params); break;
			case 'Checkin' : checkin_exit(params); break;
			case 'HoldCapture' : hold_capture_exit(params); break;
		}

	} catch(E) { sdump('D_ERROR',js2JSON(E)+'\n'); }
	*/

	try {

		// buggy for now
		//unregister_document(params.w.document);
		unregister_window(params.w);

	} catch(E) { sdump('D_ERROR',js2JSON(E)+'\n'); }

	sdump('D_TRACE','Exiting OpenILS_exit\n');
}
