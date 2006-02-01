package OpenILS::Application::Circ::Circulate;
use base 'OpenSRF::Application';
use strict; use warnings;
use OpenSRF::EX qw(:try);
use Data::Dumper;
use OpenSRF::Utils;
use OpenSRF::Utils::Cache;
use Digest::MD5 qw(md5_hex);
use OpenILS::Utils::ScriptRunner;
use OpenILS::Application::AppUtils;
use OpenILS::Application::Circ::Holds;
use OpenSRF::Utils::Logger qw(:logger);

$Data::Dumper::Indent = 0;
my $apputils = "OpenILS::Application::AppUtils";
my $U = $apputils;
my $holdcode = "OpenILS::Application::Circ::Holds";

my %scripts;			# - circulation script filenames
my $script_libs;		# - any additional script libraries
my %cache;				# - db objects cache
my %contexts;			# - Script runner contexts
my $cache_handle;		# - memcache handle

# ------------------------------------------------------------------------------
# Load the circ script from the config
# ------------------------------------------------------------------------------
sub initialize {

	my $self = shift;
	$cache_handle = OpenSRF::Utils::Cache->new('global');
	my $conf = OpenSRF::Utils::SettingsClient->new;
	my @pfx2 = ( "apps", "open-ils.circ","app_settings" );
	my @pfx = ( @pfx2, "scripts" );

	my $p		= $conf->config_value(	@pfx, 'circ_permit_patron' );
	my $c		= $conf->config_value(	@pfx, 'circ_permit_copy' );
	my $d		= $conf->config_value(	@pfx, 'circ_duration' );
	my $f		= $conf->config_value(	@pfx, 'circ_recurring_fines' );
	my $m		= $conf->config_value(	@pfx, 'circ_max_fines' );
	my $pr	= $conf->config_value(	@pfx, 'circ_permit_renew' );
	my $ph	= $conf->config_value(	@pfx, 'circ_permit_hold' );
	my $lb	= $conf->config_value(	@pfx2, 'script_path' );

	$logger->error( "Missing circ script(s)" ) 
		unless( $p and $c and $d and $f and $m and $pr and $ph );

	$scripts{circ_permit_patron}	= $p;
	$scripts{circ_permit_copy}		= $c;
	$scripts{circ_duration}			= $d;
	$scripts{circ_recurring_fines}= $f;
	$scripts{circ_max_fines}		= $m;
	$scripts{circ_renew_permit}	= $pr;
	$scripts{hold_permit}			= $ph;

	$lb = [ $lb ] unless ref($lb);
	$script_libs = $lb;

	$logger->debug("Loaded rules scripts for circ: " .
		"circ permit patron: $p, circ permit copy: $c, ".
		"circ duration :$d , circ recurring fines : $f, " .
		"circ max fines : $m, circ renew permit : $pr, permit hold: $ph");
}


# ------------------------------------------------------------------------------
# Loads the necessary circ objects and pushes them into the script environment
# Returns ( $data, $evt ).  if $evt is defined, then an
# unexpedted event occurred and should be dealt with / returned to the caller
# ------------------------------------------------------------------------------
sub create_circ_ctx {
	my %params = @_;

	my $evt;
	my $ctx = \%params;

	$evt = _ctx_add_patron_objects($ctx, %params);
	return $evt if $evt;

	if( ($params{copy} or $params{copyid} or $params{barcode}) and !$params{noncat} ) {
		$evt = _ctx_add_copy_objects($ctx, %params);
		return $evt if $evt;
	}

	_doctor_patron_object($ctx) if $ctx->{patron};
	_doctor_copy_object($ctx) if $ctx->{copy};
	_doctor_circ_objects($ctx);
	_build_circ_script_runner($ctx);
	_add_script_runner_methods( $ctx );

	return $ctx;
}

sub _ctx_add_patron_objects {
	my( $ctx, %params) = @_;

	$ctx->{patron}	= $params{patron};

	if(!defined($cache{patron_standings})) {
		$cache{patron_standings} = $apputils->fetch_patron_standings();
		$cache{group_tree} = $apputils->fetch_permission_group_tree();
	}

	$ctx->{patron_standings} = $cache{patron_standings};
	$ctx->{group_tree} = $cache{group_tree};

	$ctx->{patron_circ_summary} = 
		$apputils->fetch_patron_circ_summary($ctx->{patron}->id) 
		if $params{fetch_patron_circsummary};

	return undef;
}


sub _ctx_add_copy_objects {
	my($ctx, %params)  = @_;
	my $evt;

	$cache{copy_statuses} = $apputils->fetch_copy_statuses 
		if( $params{fetch_copy_statuses} and !defined($cache{copy_statuses}) );

	$cache{copy_locations} = $apputils->fetch_copy_locations 
		if( $params{fetch_copy_locations} and !defined($cache{copy_locations}));

	$ctx->{copy_statuses} = $cache{copy_statuses};
	$ctx->{copy_locations} = $cache{copy_locations};

	my $copy = $params{copy} if $params{copy};

	if(!$copy) {

		( $copy, $evt ) = 
			$apputils->fetch_copy($params{copyid}) if $params{copyid};
		return $evt if $evt;

		if(!$copy) {
			( $copy, $evt ) = 
				$apputils->fetch_copy_by_barcode( $params{barcode} ) if $params{barcode};
			return $evt if $evt;
		}
	}

	$ctx->{copy} = $copy;

	( $ctx->{title}, $evt ) = $apputils->fetch_record_by_copy( $ctx->{copy}->id );
	return $evt if $evt;

	return undef;
}


# ------------------------------------------------------------------------------
# Fleshes parts of the patron object
# ------------------------------------------------------------------------------
sub _doctor_copy_object {

	my $ctx = shift;
	my $copy = $ctx->{copy};

	# set the copy status to a status name
	$copy->status( _get_copy_status( 
		$copy, $ctx->{copy_statuses} ) ) if $copy;

	# set the copy location to the location object
	$copy->location( _get_copy_location( 
		$copy, $ctx->{copy_locations} ) ) if $copy;

	$copy->circ_lib( $U->fetch_org_unit($copy->circ_lib) );
}


# ------------------------------------------------------------------------------
# Fleshes parts of the copy object
# ------------------------------------------------------------------------------
sub _doctor_patron_object {
	my $ctx = shift;
	my $patron = $ctx->{patron};

	# push the standing object into the patron
	if(ref($ctx->{patron_standings})) {
		for my $s (@{$ctx->{patron_standings}}) {
			$patron->standing($s) if ( $s->id eq $ctx->{patron}->standing );
		}
	}

	# set the patron ptofile to the profile name
	$patron->profile( _get_patron_profile( 
		$patron, $ctx->{group_tree} ) ) if $ctx->{group_tree};

	# flesh the org unit
	$patron->home_ou( 
		$apputils->fetch_org_unit( $patron->home_ou ) ) if $patron;

}

# recurse and find the patron profile name from the tree
# another option would be to grab the groups for the patron
# and cycle through those until the "profile" group has been found
sub _get_patron_profile { 
	my( $patron, $group_tree ) = @_;
	return $group_tree if ($group_tree->id eq $patron->profile);
	return undef unless ($group_tree->children);

	for my $child (@{$group_tree->children}) {
		my $ret = _get_patron_profile( $patron, $child );
		return $ret if $ret;
	}
	return undef;
}

sub _get_copy_status {
	my( $copy, $cstatus ) = @_;
	my $s = undef;
	for my $status (@$cstatus) {
		$s = $status if( $status->id eq $copy->status ) 
	}
	$logger->debug("Retrieving copy status: " . $s->name) if $s;
	return $s;
}

sub _get_copy_location {
	my( $copy, $locations ) = @_;
	my $l = undef;
	for my $loc (@$locations) {
		$l = $loc if $loc->id eq $copy->location;
	}
	$logger->debug("Retrieving copy location: " . $l->name ) if $l;
	return $l;
}


# ------------------------------------------------------------------------------
# Constructs and shoves data into the script environment
# ------------------------------------------------------------------------------
sub _build_circ_script_runner {
	my $ctx = shift;

	$logger->debug("Loading script environment for circulation");

	my $runner;
	if( $runner = $contexts{$ctx->{type}} ) {
		$runner->refresh_context;
	} else {
		$runner = OpenILS::Utils::ScriptRunner->new unless $runner;
		$contexts{type} = $runner;
	}

	for(@$script_libs) {
		$logger->debug("Loading circ script lib path $_");
		$runner->add_path( $_ );
	}

	$runner->insert( 'environment.patron',		$ctx->{patron}, 1);
	$runner->insert( 'environment.title',		$ctx->{title}, 1);
	$runner->insert( 'environment.copy',		$ctx->{copy}, 1);

	# circ script result
	$runner->insert( 'result', {} );
	$runner->insert( 'result.event', 'SUCCESS' );

	$runner->insert('environment.isRenewal', 1) if $ctx->{renew};
	$runner->insert('environment.isNonCat', 1) if $ctx->{noncat};
	$runner->insert('environment.nonCatType', $ctx->{noncat_type}) if $ctx->{noncat};

	if(ref($ctx->{patron_circ_summary})) {
		$runner->insert( 'environment.patronItemsOut', $ctx->{patron_circ_summary}->[0], 1 );
		$runner->insert( 'environment.patronFines', $ctx->{patron_circ_summary}->[1], 1 );
	}

	$ctx->{runner} = $runner;
	return $runner;
}


sub _add_script_runner_methods {
	my $ctx = shift;
	my $runner = $ctx->{runner};

	if( $ctx->{copy} ) {
		
		# allows a script to fetch a hold that is currently targeting the
		# copy in question
		$runner->insert_method( 'environment.copy', '__OILS_FUNC_fetch_hold', sub {
				my $key = shift;
				my $hold = $holdcode->fetch_related_holds($ctx->{copy}->id);
				$hold = undef unless $hold;
				$runner->insert( $key, $hold, 1 );
			}
		);
	}
}

# ------------------------------------------------------------------------------

__PACKAGE__->register_method(
	method	=> "permit_circ",
	api_name	=> "open-ils.circ.checkout.permit",
	notes		=> q/
		Determines if the given checkout can occur
		@param authtoken The login session key
		@param params A trailing hash of named params including 
			barcode : The copy barcode, 
			patron : The patron the checkout is occurring for, 
			renew : true or false - whether or not this is a renewal
		@return The event that occurred during the permit check.  
			If all is well, the SUCCESS event is returned
	/);

sub permit_circ {
	my( $self, $client, $authtoken, $params ) = @_;

	my ( $requestor, $patron, $ctx, $evt );

	if(1) {
		$logger->debug("PERMIT: " . Dumper($params));
	}

	# check permisson of the requestor
	( $requestor, $patron, $evt ) = 
		$apputils->checkses_requestor( 
		$authtoken, $params->{patron}, 'VIEW_PERMIT_CHECKOUT' );
	return $evt if $evt;

	# fetch and build the circulation environment
	( $ctx, $evt ) = create_circ_ctx( %$params, 
		patron							=> $patron, 
		requestor						=> $requestor, 
		type								=> 'permit',
		fetch_patron_circ_summary	=> 1,
		fetch_copy_statuses			=> 1, 
		fetch_copy_locations			=> 1, 
		);
	return $evt if $evt;

	return _run_permit_scripts($ctx);
}


# Runs the patron and copy permit scripts
# if this is a non-cat circulation, the copy permit script 
# is not run
sub _run_permit_scripts {

	my $ctx			= shift;
	my $runner		= $ctx->{runner};
	my $patronid	= $ctx->{patron}->id;
	my $barcode		= ($ctx->{copy}) ? $ctx->{copy}->barcode : undef;

	$runner->load($scripts{circ_permit_patron});
	$runner->run or throw OpenSRF::EX::ERROR ("Circ Permit Patron Script Died: $@");
	my $evtname = $runner->retrieve('result.event');
	$logger->activity("circ_permit_patron for user $patronid returned event: $evtname");

	return OpenILS::Event->new($evtname) if $evtname ne 'SUCCESS';

	if ( $ctx->{noncat}  ) {
		my $key = _cache_permit_key(-1, $patronid, $ctx->{requestor}->id);
		return OpenILS::Event->new($evtname, payload => $key);
	}

	$runner->load($scripts{circ_permit_copy});
	$runner->run or throw OpenSRF::EX::ERROR ("Circ Permit Copy Script Died: $@");
	$evtname = $runner->retrieve('result.event');
	$logger->activity("circ_permit_patron for user $patronid ".
		"and copy $barcode returned event: $evtname");

	if( $evtname eq 'SUCCESS' ) {
		my $key = _cache_permit_key($ctx->{copy}->id, $patronid, $ctx->{requestor}->id);
		return OpenILS::Event->new($evtname, payload => $key);
	}

	return OpenILS::Event->new($evtname);

}

# takes copyid, patronid, and requestor id
sub _cache_permit_key {
	my( $cid, $pid, $rid ) = @_;
	my $key = md5_hex( time() . rand() . "$$ $cid $pid $rid" );
	$logger->debug("Setting circ permit key [$key] for copy $cid, patron $pid, and staff $rid");
	$cache_handle->put_cache( "oils_permit_key_$key", [ $cid, $pid, $rid ], 300 );
	return $key;
}

# takes permit_key, copyid, patronid, and requestor id
sub _check_permit_key {
	my( $key, $cid, $pid, $rid ) = @_;
	$logger->debug("Fetching circ permit key $key");
	my $k = "oils_permit_key_$key";
	my $arr = $cache_handle->get_cache($k);
	$cache_handle->delete_cache($k);
	return 1 if( ref($arr) and @$arr[0] eq $cid and @$arr[1] eq $pid and @$arr[2] eq $rid );
	return 0;
}


# ------------------------------------------------------------------------------

__PACKAGE__->register_method(
	method	=> "checkout",
	api_name	=> "open-ils.circ.checkout",
	notes => q/
		Checks out an item
		@param authtoken The login session key
		@param params A named hash of params including:
			copy			The copy object
			barcode		If no copy is provided, the copy is retrieved via barcode
			copyid		If no copy or barcode is provide, the copy id will be use
			patron		The patron's id
			noncat		True if this is a circulation for a non-cataloted item
			noncat_type	The non-cataloged type id
			noncat_circ_lib The location for the noncat circ.  
				Default is the home org of the staff member
		@return The SUCCESS event on success, any other event depending on the error
	/);

sub checkout {
	my( $self, $client, $authtoken, $params ) = @_;

	my ( $requestor, $patron, $ctx, $evt, $circ );
	my $key = $params->{permit_key};

	# check permisson of the requestor
	( $requestor, $patron, $evt ) = 
		$apputils->checkses_requestor( 
			$authtoken, $params->{patron}, 'COPY_CHECKOUT' );
	return $evt if $evt;

	if( $params->{noncat} ) {
		return OpenILS::Event->new('CIRC_PERMIT_BAD_KEY') 
			unless _check_permit_key( $key, -1, $patron->id, $requestor->id );

		( $circ, $evt ) = _checkout_noncat( $requestor, $patron, %$params );
		return $evt if $evt;
		return OpenILS::Event->new('SUCCESS', 
			payload => { noncat_circ => $circ } );
	}

	my $session = $U->start_db_session();

	# fetch and build the circulation environment
	( $ctx, $evt ) = create_circ_ctx( %$params, 
		patron							=> $patron, 
		requestor						=> $requestor, 
		session							=> $session, 
		type								=> 'checkout',
		fetch_patron_circ_summary	=> 1,
		fetch_copy_statuses			=> 1, 
		fetch_copy_locations			=> 1, 
		);
	return $evt if $evt;

	return OpenILS::Event->new('CIRC_PERMIT_BAD_KEY') 
		unless _check_permit_key( $key, $ctx->{copy}->id, $patron->id, $requestor->id );

	$ctx->{circ_lib} = (defined($params->{circ_lib})) ? 
		$params->{circ_lib} : $requestor->home_ou;

	$evt = _run_checkout_scripts($ctx);
	return $evt if $evt;

	_build_checkout_circ_object($ctx);

	$evt = _commit_checkout_circ_object($ctx);
	return $evt if $evt;

	_update_checkout_copy($ctx);

	$evt = _handle_related_holds($ctx);
	return $evt if $evt;

	#$U->commit_db_session($session);
	$session->disconnect;

	return OpenILS::Event->new('SUCCESS', 
		payload		=> { 
			copy		=> $ctx->{copy},
			circ		=> $ctx->{circ},
			record	=> $U->record_to_mvr($ctx->{title}),
		} );
}


sub _run_checkout_scripts {
	my $ctx = shift;
	my $evt;
	my $circ;

	my $runner = $ctx->{runner};

	$runner->insert('result.durationLevel');
	$runner->insert('result.durationRule');
	$runner->insert('result.recurringFinesRule');
	$runner->insert('result.recurringFinesLevel');
	$runner->insert('result.maxFine');

	$runner->load($scripts{circ_duration});
	$runner->run or throw OpenSRF::EX::ERROR ("Circ Duration Script Died: $@");
	my $duration = $runner->retrieve('result.durationRule');
	$logger->debug("Circ duration script yielded a duration rule of: $duration");

	$runner->load($scripts{circ_recurring_fines});
	$runner->run or throw OpenSRF::EX::ERROR ("Circ Recurring Fines Script Died: $@");
	my $recurring = $runner->retrieve('result.recurringFinesRule');
	$logger->debug("Circ recurring fines script yielded a rule of: $recurring");

	$runner->load($scripts{circ_max_fines});
	$runner->run or throw OpenSRF::EX::ERROR ("Circ Max Fine Script Died: $@");
	my $max_fine = $runner->retrieve('result.maxFine');
	$logger->debug("Circ max_fine fines script yielded a rule of: $max_fine");

	($duration, $evt) = $U->fetch_circ_duration_by_name($duration);
	return $evt if $evt;
	($recurring, $evt) = $U->fetch_recurring_fine_by_name($recurring);
	return $evt if $evt;
	($max_fine, $evt) = $U->fetch_max_fine_by_name($max_fine);
	return $evt if $evt;

	$ctx->{duration_level}			= $runner->retrieve('result.durationLevel');
	$ctx->{recurring_fines_level} = $runner->retrieve('result.recurringFinesLevel');
	$ctx->{duration_rule}			= $duration;
	$ctx->{recurring_fines_rule}	= $recurring;
	$ctx->{max_fine_rule}			= $max_fine;

	return undef;
}

sub _build_checkout_circ_object {
	my $ctx = shift;

	my $circ			= new Fieldmapper::action::circulation;
	my $duration	= $ctx->{duration_rule};
	my $max			= $ctx->{max_fine_rule};
	my $recurring	= $ctx->{recurring_fines_rule};
	my $copy			= $ctx->{copy};
	my $patron 		= $ctx->{patron};
	my $dur_level	= $ctx->{duration_level};
	my $rec_level	= $ctx->{recurring_fines_level};

	$circ->duration( $duration->shrt ) if ($dur_level == 1);
	$circ->duration( $duration->normal ) if ($dur_level == 2);
	$circ->duration( $duration->extended ) if ($dur_level == 3);

	$circ->recuring_fine( $recurring->low ) if ($rec_level =~ /low/io);
	$circ->recuring_fine( $recurring->normal ) if ($rec_level =~ /normal/io);
	$circ->recuring_fine( $recurring->high ) if ($rec_level =~ /high/io);

	$circ->duration_rule( $duration->name );
	$circ->recuring_fine_rule( $recurring->name );
	$circ->max_fine_rule( $max->name );
	$circ->max_fine( $max->amount );

	$circ->fine_interval($recurring->recurance_interval);
	$circ->renewal_remaining( $duration->max_renewals );
	$circ->target_copy( $copy->id );
	$circ->usr( $patron->id );
	$circ->circ_lib( $ctx->{circ_lib} );

	if( $ctx->{renew} ) {
		$circ->opac_renewal(1); # XXX different for different types ?????
		$circ->clear_id;
		#$circ->renewal_remaining($numrenews - 1); # XXX
		$circ->circ_staff($ctx->{patron}->id);

	} else {
		$circ->circ_staff( $ctx->{requestor}->id );
	}

	_set_circ_due_date($circ);
	$ctx->{circ} = $circ;
}

sub _create_due_date {
	my $duration = shift;

	my ($sec,$min,$hour,$mday,$mon,$year,$wday,$yday,$isdst) = 
		gmtime(OpenSRF::Utils->interval_to_seconds($duration) + int(time()));

	$year += 1900; $mon += 1;
	my $due_date = sprintf(
   	'%s-%0.2d-%0.2dT%s:%0.2d:%0.s2-00',
   	$year, $mon, $mday, $hour, $min, $sec);
	return $due_date;
}

sub _set_circ_due_date {
	my $circ = shift;
	my $dd = _create_due_date($circ->duration);
	$logger->debug("Checkout setting due date on circ to: $dd");
	$circ->due_date($dd);
}

# Sets the editor, edit_date, un-fleshes the copy, and updates the copy in the DB
sub _update_checkout_copy {
	my $ctx = shift;
	my $copy = $ctx->{copy};

	$copy->status( $copy->status->id );
	$copy->editor( $ctx->{requestor}->id );
	$copy->edit_date( 'now' );
	$copy->location( $copy->location->id );
	$copy->circ_lib( $copy->circ_lib->id );

	$logger->debug("Updating editor info on copy in checkout: " . $copy->id );
	$ctx->{session}->request( 
		'open-ils.storage.direct.asset.copy.update', $copy )->gather(1);
}

# commits the circ object to the db then fleshes the circ with rules objects
sub _commit_checkout_circ_object {

	my $ctx = shift;
	my $circ = $ctx->{circ};

	my $r = $ctx->{session}->request(
		"open-ils.storage.direct.action.circulation.create", $circ )->gather(1);

	return $U->DB_UPDATE_FAILED($circ) unless $r;

	$logger->debug("Created a new circ object in checkout: $r");

	$circ->id($r);
	$circ->duration_rule($ctx->{duration_rule});
	$circ->max_fine_rule($ctx->{max_fine_rule});
	$circ->recuring_fine_rule($ctx->{recurring_fines_rule});

	return undef;
}


# sees if there are any holds that this copy 
sub _handle_related_holds {

	my $ctx		= shift;
	my $copy		= $ctx->{copy};
	my $patron	= $ctx->{patron};
	my $holds	= $holdcode->fetch_related_holds($copy->id);

	if(ref($holds) && @$holds) {

		# for now, just sort by id to get what should be the oldest hold
		$holds = [ sort { $a->id <=> $b->id } @$holds ];
		$holds = [ grep { $_->usr eq $patron->id } @$holds ];

		if(@$holds) {
			my $hold = $holds->[0];

			$logger->debug("Related hold found in checkout: " . $hold->id );

			$hold->fulfillment_time('now');
			my $r = $ctx->{session}->request(
				"open-ils.storage.direct.action.hold_request.update", $hold )->gather(1);
			return $U->DB_UPDATE_FAILED( $hold ) unless $r;
		}
	}

	return undef;
}


sub _checkout_noncat {
	my ( $requestor, $patron, %params ) = @_;
	my $circlib = $params{noncat_circ_lib} || $requestor->home_ou;
	return OpenILS::Application::Circ::NonCat::create_non_cat_circ(
			$requestor->id, $patron->id, $circlib, $params{noncat_type} );
}


# ------------------------------------------------------------------------------

__PACKAGE__->register_method(
	method	=> "checkin",
	api_name	=> "open-ils.circ.checkin",
	notes		=> <<"	NOTES");
	PARAMS( authtoken, barcode => bc )
	Checks in based on barcode
	Returns an event object whose payload contains the record, circ, and copy
	If the item needs to be routed, the event is a ROUTE_COPY event
	with an additional 'route_to' variable set on the event
	NOTES

sub checkin {
	my( $self, $client, $authtoken, $params ) = @_;
}

# ------------------------------------------------------------------------------

__PACKAGE__->register_method(
	method	=> "renew",
	api_name	=> "open-ils.circ.renew_",
	notes		=> <<"	NOTES");
	PARAMS( authtoken, circ => circ_id );
	open-ils.circ.renew(login_session, circ_object);
	Renews the provided circulation.  login_session is the requestor of the
	renewal and if the logged in user is not the same as circ->usr, then
	the logged in user must have RENEW_CIRC permissions.
	NOTES

sub renew {
	my( $self, $client, $authtoken, $params ) = @_;
}

	


1;
