package OpenILS::Application::Vandelay;
use strict; use warnings;
use OpenILS::Application;
use base qw/OpenILS::Application/;
use Unicode::Normalize;
use OpenSRF::EX qw/:try/;
use OpenSRF::AppSession;
use OpenSRF::Utils::SettingsClient;
use OpenSRF::Utils::Cache;
use OpenILS::Utils::Fieldmapper;
use OpenILS::Utils::CStoreEditor qw/:funcs/;
use MARC::Batch;
use MARC::Record;
use MARC::File::XML;
use OpenILS::Utils::Fieldmapper;
use Time::HiRes qw(time);
use OpenSRF::Utils::Logger qw/$logger/;
use MIME::Base64;
use OpenILS::Application::AppUtils;
use OpenILS::Application::Cat::BibCommon;
use OpenILS::Application::Cat::AuthCommon;
my $U = 'OpenILS::Application::AppUtils';

sub initialize {}
sub child_init {}

# --------------------------------------------------------------------------------
# Biblio ingest

sub create_bib_queue {
	my $self = shift;
	my $client = shift;
	my $auth = shift;
	my $name = shift;
	my $owner = shift;
	my $type = shift;

	my $e = new_editor(authtoken => $auth, xact => 1);

	return $e->die_event unless $e->checkauth;
	return $e->die_event unless $e->allowed('CREATE_BIB_IMPORT_QUEUE');
    $owner ||= $e->requestor->id;

    return OpenILS::Event->new('BIB_QUEUE_EXISTS') 
        if $e->search_vandelay_bib_queue(
            {name => $name, owner => $owner, queue_type => $type})->[0];

	my $queue = new Fieldmapper::vandelay::bib_queue();
	$queue->name( $name );
	$queue->owner( $owner );
	$queue->queue_type( $type ) if ($type);

	my $new_q = $e->create_vandelay_bib_queue( $queue );
	return $e->die_event unless ($new_q);
	$e->commit;

    return $new_q;
}
__PACKAGE__->register_method(  
	api_name	=> "open-ils.vandelay.bib_queue.create",
	method		=> "create_bib_queue",
	api_level	=> 1,
	argc		=> 3,
);                      


sub create_auth_queue {
	my $self = shift;
	my $client = shift;
	my $auth = shift;
	my $name = shift;
	my $owner = shift;
	my $type = shift;

	my $e = new_editor(authtoken => $auth, xact => 1);

	return $e->die_event unless $e->checkauth;
	return $e->die_event unless $e->allowed('CREATE_AUTHORITY_IMPORT_QUEUE');
    $owner ||= $e->requestor->id;

    return OpenILS::Event->new('AUTH_QUEUE_EXISTS') 
        if $e->search_vandelay_bib_queue(
            {name => $name, owner => $owner, queue_type => $type})->[0];

	my $queue = new Fieldmapper::vandelay::authority_queue();
	$queue->name( $name );
	$queue->owner( $owner );
	$queue->queue_type( $type ) if ($type);

	my $new_q = $e->create_vandelay_authority_queue( $queue );
	$e->die_event unless ($new_q);
	$e->commit;

    return $new_q;
}
__PACKAGE__->register_method(  
	api_name	=> "open-ils.vandelay.authority_queue.create",
	method		=> "create_auth_queue",
	api_level	=> 1,
	argc		=> 3,
);                      

sub add_record_to_bib_queue {
	my $self = shift;
	my $client = shift;
	my $auth = shift;
	my $queue = shift;
	my $marc = shift;
	my $purpose = shift;

	my $e = new_editor(authtoken => $auth, xact => 1);

	$queue = $e->retrieve_vandelay_bib_queue($queue);

	return $e->die_event unless $e->checkauth;
	return $e->die_event unless
		($e->allowed('CREATE_BIB_IMPORT_QUEUE', undef, $queue) ||
		 $e->allowed('CREATE_BIB_IMPORT_QUEUE'));

	my $new_rec = _add_bib_rec($e, $marc, $queue->id, $purpose);

	return $e->die_event unless ($new_rec);
	$e->commit;
    return $new_rec;
}
__PACKAGE__->register_method(  
	api_name	=> "open-ils.vandelay.queued_bib_record.create",
	method		=> "add_record_to_bib_queue",
	api_level	=> 1,
	argc		=> 3,
);                      

sub _add_bib_rec {
	my $e = shift;
	my $marc = shift;
	my $queue = shift;
	my $purpose = shift;

	my $rec = new Fieldmapper::vandelay::queued_bib_record();
	$rec->marc( $marc );
	$rec->queue( $queue );
	$rec->purpose( $purpose ) if ($purpose);

	return $e->create_vandelay_queued_bib_record( $rec );
}

sub add_record_to_authority_queue {
	my $self = shift;
	my $client = shift;
	my $auth = shift;
	my $queue = shift;
	my $marc = shift;
	my $purpose = shift;

	my $e = new_editor(authtoken => $auth, xact => 1);

	$queue = $e->retrieve_vandelay_authority_queue($queue);

	return $e->die_event unless $e->checkauth;
	return $e->die_event unless
		($e->allowed('CREATE_AUTHORITY_IMPORT_QUEUE', undef, $queue) ||
		 $e->allowed('CREATE_AUTHORITY_IMPORT_QUEUE'));

	my $new_rec = _add_auth_rec($e, $marc, $queue->id, $purpose);

	return $e->die_event unless ($new_rec);
	$e->commit;
    return $new_rec;
}
__PACKAGE__->register_method(
	api_name	=> "open-ils.vandelay.queued_authority_record.create",
	method		=> "add_record_to_authority_queue",
	api_level	=> 1,
	argc		=> 3,
);

sub _add_auth_rec {
	my $e = shift;
	my $marc = shift;
	my $queue = shift;
    my $purpose = shift;

	my $rec = new Fieldmapper::vandelay::queued_authority_record();
	$rec->marc( $marc );
	$rec->queue( $queue );
	$rec->purpose( $purpose ) if ($purpose);

	return $e->create_vandelay_queued_authority_record( $rec );
}

sub process_spool {
	my $self = shift;
	my $client = shift;
	my $auth = shift;
	my $fingerprint = shift;
	my $queue_id = shift;

	my $e = new_editor(authtoken => $auth, xact => 1);
    return $e->die_event unless $e->checkauth;

    my $queue;
    my $type = $self->{record_type};

    if($type eq 'bib') {
        $queue = $e->retrieve_vandelay_bib_queue($queue_id) or return $e->die_event;
    } else {
        $queue = $e->retrieve_vandelay_authority_queue($queue_id) or return $e->die_event;
    }

    my $evt = check_queue_perms($e, $type, $queue);
    return $evt if $evt;

	my $method = "open-ils.vandelay.queued_${type}_record.create";
	$method = $self->method_lookup( $method );

    my $cache = new OpenSRF::Utils::Cache();

    my $data = $cache->get_cache('vandelay_import_spool_' . $fingerprint);
	my $purpose = $data->{purpose};
    $data = decode_base64($data->{marc});

    $logger->info("vandelay loaded $fingerprint purpose=$purpose and ".length($data)." bytes of data");

    my $fh;
    open $fh, '<', \$data;

    my $marctype = 'USMARC'; # ?
	my $batch = new MARC::Batch ( $marctype, $fh );
	$batch->strict_off;

	my $count = 0;
	while (my $r = $batch->next) {
        $logger->info("processing record $count");
		try {
			(my $xml = $r->as_xml_record()) =~ s/\n//sog;
			$xml =~ s/^<\?xml.+\?\s*>//go;
			$xml =~ s/>\s+</></go;
			$xml =~ s/\p{Cc}//go;
			$xml = $U->entityize($xml);
			$xml =~ s/[\x00-\x1f]//go;

			if ($type eq 'bib') {
				_add_bib_rec( $e, $xml, $queue_id, $purpose ) or return $e->die_event;
			} else {
				_add_auth_rec( $e, $xml, $queue_id, $purpose ) or return $e->die_event;
			}
			$count++;
			
			$client->respond( $count );
		} catch Error with {
			my $error = shift;
			$logger->warn("Encountered a bad record at Vandelay ingest: ".$error);
		}
	}

	$e->commit;
	return undef;
}
__PACKAGE__->register_method(  
	api_name	=> "open-ils.vandelay.bib.process_spool",
	method		=> "process_spool",
	api_level	=> 1,
	argc		=> 3,
	record_type	=> 'bib'
);                      
__PACKAGE__->register_method(  
	api_name	=> "open-ils.vandelay.auth.process_spool",
	method		=> "process_spool",
	api_level	=> 1,
	argc		=> 3,
	record_type	=> 'auth'
);                      


__PACKAGE__->register_method(  
	api_name	=> "open-ils.vandelay.bib_queue.records.retrieve",
	method		=> 'retrieve_queue',
	api_level	=> 1,
	argc		=> 2,
    stream      => 1,
	record_type	=> 'bib'
);
__PACKAGE__->register_method(  
	api_name	=> "open-ils.vandelay.auth_queue.records.retrieve",
	method		=> 'retrieve_queue',
	api_level	=> 1,
	argc		=> 2,
    stream      => 1,
	record_type	=> 'auth'
);

__PACKAGE__->register_method(  
	api_name	=> "open-ils.vandelay.bib_queue.records.matches.retrieve",
	method		=> 'retrieve_queue',
	api_level	=> 1,
	argc		=> 2,
    stream      => 1,
	record_type	=> 'bib',
    signature   => {
        desc => q/Only retrieve queued bib records that have matches against existing records/
    }
);
__PACKAGE__->register_method(  
	api_name	=> "open-ils.vandelay.auth_queue.records.matches.retrieve",
	method		=> 'retrieve_queue',
	api_level	=> 1,
	argc		=> 2,
    stream      => 1,
	record_type	=> 'auth',
    signature   => {
        desc => q/Only retrieve queued authority records that have matches against existing records/
    }

);

sub retrieve_queue {
    my($self, $conn, $auth, $queue_id, $options) = @_;
    my $e = new_editor(authtoken => $auth);
    return $e->event unless $e->checkauth;
    $options ||= {};
    my $limit = $$options{limit} || 20;
    my $offset = $$options{offset} || 0;

    my $type = $self->{record_type};
    my $queue;
    if($type eq 'bib') {
        $queue = $e->retrieve_vandelay_bib_queue($queue_id) or return $e->die_event;
    } else {
        $queue = $e->retrieve_vandelay_authority_queue($queue_id) or return $e->die_event;
    }
    my $evt = check_queue_perms($e, $type, $queue);
    return $evt if $evt;

    my $class = ($type eq 'bib') ? 'vqbr' : 'vqar';
    my $search = ($type eq 'bib') ? 
        'search_vandelay_queued_bib_record' : 'search_vandelay_queued_authority_record';
    my $retrieve = ($type eq 'bib') ? 
        'retrieve_vandelay_queued_bib_record' : 'retrieve_vandelay_queued_authority_record';

    my $record_ids;
    if($self->api_name =~ /matches/) {
        # fetch only matched records
        $record_ids = queued_records_with_matches($e, $type, $queue_id, $limit, $offset);
    } else {
        # fetch all queue records
        $record_ids = $e->$search([
                {queue => $queue_id}, 
                {order_by => {$class => 'id'}, limit => $limit, offset => $offset}
            ],
            {idlist => 1}
        );
    }


    for my $rec_id (@$record_ids) {
        my $params = {   
            flesh => 1,
            flesh_fields => {$class => ['attributes', 'matches']},
        };
        my $rec = $e->$retrieve([$rec_id, $params]);
        $rec->clear_marc if $$options{clear_marc};
        $conn->respond($rec);
    }
    return undef;
}

sub check_queue_perms {
    my($e, $type, $queue) = @_;
	if ($type eq 'bib') {
		return $e->die_event unless
			($e->allowed('CREATE_BIB_IMPORT_QUEUE', undef, $queue) ||
			 $e->allowed('CREATE_BIB_IMPORT_QUEUE'));
	} else {
		return $e->die_event unless
			($e->allowed('CREATE_AUTHORITY_IMPORT_QUEUE', undef, $queue) ||
			 $e->allowed('CREATE_AUTHORITY_IMPORT_QUEUE'));
	}

    return undef;
}

__PACKAGE__->register_method(  
	api_name	=> "open-ils.vandelay.bib_record.list.import",
	method		=> 'import_record_list',
	api_level	=> 1,
	argc		=> 2,
    stream      => 1,
	record_type	=> 'bib'
);

__PACKAGE__->register_method(  
	api_name	=> "open-ils.vandelay.auth_record.list.import",
	method		=> 'import_record_list',
	api_level	=> 1,
	argc		=> 2,
    stream      => 1,
	record_type	=> 'auth'
);

sub import_record_list {
    my($self, $conn, $auth, $rec_ids, $args) = @_;
    my $e = new_editor(xact => 1, authtoken => $auth);
    return $e->die_event unless $e->checkauth;
    $args ||= {};
    my $err = import_record_list_impl($self, $conn, $auth, $e, $rec_ids, $args);
    return $err if $err;
    $e->commit;
    return {complete => 1};
}


__PACKAGE__->register_method(  
	api_name	=> "open-ils.vandelay.bib_queue.import",
	method		=> 'import_queue',
	api_level	=> 1,
	argc		=> 2,
    stream      => 1,
	record_type	=> 'bib'
);

__PACKAGE__->register_method(  
	api_name	=> "open-ils.vandelay.auth_queue.import",
	method		=> 'import_queue',
	api_level	=> 1,
	argc		=> 2,
    stream      => 1,
	record_type	=> 'auth'
);
__PACKAGE__->register_method(  
	api_name	=> "open-ils.vandelay.bib_queue.nomatch.import",
	method		=> 'import_queue',
	api_level	=> 1,
	argc		=> 2,
    stream      => 1,
    signature   => {
        desc => q/Only import records that have no collisions/
    },
	record_type	=> 'bib'
);

__PACKAGE__->register_method(  
	api_name	=> "open-ils.vandelay.auth_queue.nomatch.import",
	method		=> 'import_queue',
	api_level	=> 1,
	argc		=> 2,
    stream      => 1,
    signature   => {
        desc => q/Only import records that have no collisions/
    },
	record_type	=> 'auth'
);
sub import_queue {
    my($self, $conn, $auth, $q_id, $options) = @_;
    my $e = new_editor(xact => 1, authtoken => $auth);
    return $e->die_event unless $e->checkauth;
    $options ||= {};
    my $type = $self->{record_type};
    my $class = ($type eq 'bib') ? 'vqbr' : 'vqar';

    my $query = {queue => $q_id, import_time => undef};

    if($self->api_name =~ /nomatch/) {
        my $matched_recs = queued_records_with_matches($e, $type, $q_id, undef, undef, {import_time => undef});
        $query->{id} = {'not in' => $matched_recs} if @$matched_recs;
    }

    my $search = ($type eq 'bib') ? 
        'search_vandelay_queued_bib_record' : 'search_vandelay_queued_authority_record';
    my $rec_ids = $e->$search($query, {idlist => 1});
    my $err = import_record_list_impl($self, $conn, $auth, $e, $rec_ids, $options);
    return $err if $err;
    $e->commit;
    return {complete => 1};
}


# returns a list of queued record IDs for a given queue that 
# have at least one entry in the match table
sub queued_records_with_matches {
    my($e, $type, $q_id, $limit, $offset, $filter) = @_;

    my $match_class = 'vbm';
    my $rec_class = 'vqbr';
    if($type eq 'auth') {
        $match_class = 'vam';
         $rec_class = 'vqar';
    }

    $filter ||= {};
    $filter->{queue} = $q_id;

    my $query = {
        distinct => 1, 
        select => {$match_class => ['queued_record']}, 
        from => {
            $match_class => {
                $rec_class => {
                    field => 'id',
                    fkey => 'queued_record',
                    filter => $filter,
                }
            }
        }
    };        

    if($limit or defined $offset) {
        $limit ||= 20;
        $offset ||= 0;
        $query->{limit} = $limit;
        $query->{offset} = $offset;
    }

    my $data = $e->json_query($query);
    return [ map {$_->{queued_record}} @$data ];
}

sub import_record_list_impl {
    my($self, $conn, $auth, $e, $rec_ids, $args) = @_;

    my $overlay_map = $args->{overlay_map} || {};
    my $type = $self->{record_type};
    my $total = @$rec_ids;
    my $count = 0;
    my %queues;

    for my $rec_id (@$rec_ids) {

        my $overlay_target = $overlay_map->{$rec_id};

        if($type eq 'bib') {

            my $rec = $e->retrieve_vandelay_queued_bib_record($rec_id) 
                or return $e->die_event;

            next if $rec->import_time;
            $queues{$rec->queue} = 1;

            my $record;
            if(defined $overlay_target) {
                $logger->info("vl: overlaying record $overlay_target");
                $record = OpenILS::Application::Cat::BibCommon->biblio_record_replace_marc(
                    $e, $overlay_target, $rec->marc); #$rec->bib_source
            } else {
                $logger->info("vl: importing new record");
                $record = OpenILS::Application::Cat::BibCommon->biblio_record_xml_import(
                    $e, $rec->marc); #$rec->bib_source
            }

            return $record if $U->event_code($record);
            $rec->imported_as($record->id);
            $rec->import_time('now');
            $e->update_vandelay_queued_bib_record($rec) or return $e->die_event;

        } else { # authority

            my $rec = $e->retrieve_vandelay_queued_authority_record($rec_id) 
                or return $e->die_event;

            next if $rec->import_time;
            $queues{$rec->queue} = 1;

            my $record;
            if(defined $overlay_target) {
                $logger->info("vl: overlaying record $overlay_target");
                $record = OpenILS::Utils::Cat::AuthCommon->overlay_authority_record(
                    $overlay_target, $rec->marc); #$source);
            } else {
                $logger->info("vl: importing new record");
                $record = OpenILS::Utils::Cat::AuthCommon->import_authority_record(
                    $rec->marc) #$source);
            }

            return $record if $U->event_code($record);
            $rec->imported_as($record->id);
            $rec->import_time('now');
            $e->update_vandelay_queued_authority_record($rec) or return $e->die_event;
        }

        $conn->respond({total => $total, progress => ++$count, imported => $rec_id});
    }

    # see if we need to mark any queues as complete
    for my $q_id (keys %queues) {
        if($type eq 'bib') {
            my $remaining = $e->search_vandelay_queued_bib_record(
                {queue => $q_id, import_time => undef}, {idlist => 1});
            unless(@$remaining) {
                my $queue = $e->retrieve_vandelay_bib_queue($q_id);
                unless($U->is_true($queue->complete)) {
                    $queue->complete('t');
                    $e->update_vandelay_bib_queue($queue) or return $e->die_event;
                }
            }
        } else {
            my $remaining = $e->search_vandelay_queued_authority_record(
                {queue => $q_id, import_time => undef}, {idlist => 1});
            unless(@$remaining) {
                my $queue = $e->retrieve_vandelay_authority_queue($q_id);
                unless($U->is_true($queue->complete)) {
                    $queue->complete('t');
                    $e->update_vandelay_authority_queue($queue) or return $e->die_event;
                }
            }
        }
    }

    return undef;
}


__PACKAGE__->register_method(  
	api_name	=> "open-ils.vandelay.bib_queue.owner.retrieve",
	method		=> 'owner_queue_retrieve',
	api_level	=> 1,
	argc		=> 2,
    stream      => 1,
	record_type	=> 'bib'
);
__PACKAGE__->register_method(  
	api_name	=> "open-ils.vandelay.authority_queue.owner.retrieve",
	method		=> 'owner_queue_retrieve',
	api_level	=> 1,
	argc		=> 2,
    stream      => 1,
	record_type	=> 'auth'
);

sub owner_queue_retrieve {
    my($self, $conn, $auth, $owner_id) = @_;
    my $e = new_editor(authtoken => $auth);
    return $e->die_event unless $e->checkauth;
    $owner_id = $e->requestor->id; # XXX add support for viewing other's queues?
    my $queues;
    if($self->{record_type} eq 'bib') {
        $queues = $e->search_vandelay_bib_queue(
            {complete => 'f', owner => $owner_id});
    } else {
        $queues = $e->search_vandelay_authority_queue(
            {complete => 'f', owner => $owner_id});
    }
    $conn->respond($_) for @$queues;
    return undef;
}

__PACKAGE__->register_method(  
	api_name	=> "open-ils.vandelay.bib_queue.delete",
	method		=> "delete_queue",
	api_level	=> 1,
	argc		=> 2,
	record_type	=> 'bib'
);            
__PACKAGE__->register_method(  
	api_name	=> "open-ils.vandelay.auth_queue.delete",
	method		=> "delete_queue",
	api_level	=> 1,
	argc		=> 2,
	record_type	=> 'auth'
);  

sub delete_queue {
    my($self, $conn, $auth, $q_id) = @_;
    my $e = new_editor(xact => 1, authtoken => $auth);
    return $e->die_event unless $e->checkauth;
    if($self->{record_type} eq 'bib') {
	    return $e->die_event unless $e->allowed('CREATE_BIB_IMPORT_QUEUE');
        my $queue = $e->retrieve_vandelay_bib_queue($q_id)
            or return $e->die_event;
        $e->delete_vandelay_bib_queue($queue)
            or return $e->die_event;
    } else {
   	    return $e->die_event unless $e->allowed('CREATE_AUTHORITY_IMPORT_QUEUE');
        my $queue = $e->retrieve_vandelay_authority_queue($q_id)
            or return $e->die_event;
        $e->delete_vandelay_authority_queue($queue)
            or return $e->die_event;
    }
    $e->commit;
    return 1;
}

1;
