package OpenILS::Application::Penalty;
use strict; use warnings;
use DateTime;
use Data::Dumper;
use OpenSRF::EX qw(:try);
use OpenSRF::Utils::Cache;
use OpenSRF::Utils qw/:datetime/;
use OpenILS::Application::Circ::ScriptBuilder;
use OpenSRF::Utils::SettingsClient;
use OpenILS::Application::AppUtils;
use OpenSRF::Utils::Logger qw(:logger);
use OpenILS::Utils::CStoreEditor qw/:funcs/;
use OpenILS::Application;
use base 'OpenILS::Application';

my $U = "OpenILS::Application::AppUtils";
my $script;
my $path;
my $libs;
my $runner;
my %groups; # - user groups

my $fatal_key = 'result.fatalEvents';
my $info_key = 'result.infoEvents';


# --------------------------------------------------------------
# Loads the config info
# --------------------------------------------------------------
sub initialize {

	my $conf = OpenSRF::Utils::SettingsClient->new;
	my @pfx  = ( "apps", "open-ils.penalty","app_settings" );
	$path		= $conf->config_value( @pfx, 'script_path');
	$script	= $conf->config_value( @pfx, 'patron_penalty' );

	$path = (ref($path)) ? $path : [$path];

	if(!($path and $script)) {
		$logger->error("penalty:  server config missing script and/or script path");
		return 0;
	}

	$logger->info("penalty: Loading patron penalty script $script with paths @$path");
}



__PACKAGE__->register_method (
	method	 => 'patron_penalty',
	api_name	 => 'open-ils.penalty.patron_penalty.calculate',
	signature => q/
		Calculates the patron's standing penalties
		@param args An object of named params including:
			patronid The id of the patron
			update True if this call should update the database
			background True if this call should return immediately,
				then go on to process the penalties.  This flag
				works only in conjunction with the 'update' flag.
		@return An object with keys 'fatal_penalties' and 
		'info_penalties' who are themeselves arrays of 0 or 
		more penalties.  Returns event on error.
	/
);

# --------------------------------------------------------------
# modes: 
#  - update 
#  - background : modifier to 'update' which says to return 
#		immediately then continue processing.  If this flag is set
#		then the caller will get no penalty info and will never 
#		know for sure if the call even succeeded. 
# --------------------------------------------------------------
sub patron_penalty {
	my( $self, $conn, $args ) = @_;
	
	my( $patron, $evt );

	$conn->respond_complete(1) if $$args{background};

	return { fatal_penalties => [], info_penalties => [] }
		unless ($args->{patron} || $args->{patronid});

	$args->{patron_id} = $args->{patronid};
	$args->{fetch_patron_circ_info} = 1;
	$args->{fetch_patron_money_info} = 1;
	$args->{ignore_user_status} = 1;

	$args->{editor} = undef; # just to be safe
	my $runner = OpenILS::Application::Circ::ScriptBuilder->build($args);
	
	# - Load up the script and run it
	$runner->add_path($_) for @$path;

	$runner->load($script);
	my $result = $runner->run or throw OpenSRF::EX::ERROR ("Patron Penalty Script Died: $@");

	my @fatals = @{$result->{fatalEvents}};
	my @infos = @{$result->{infoEvents}};
	my $all = [ @fatals, @infos ];

	$logger->info("penalty: script returned fatal events [@fatals] and info events [@infos]");

	$conn->respond_complete(
		{ fatal_penalties => \@fatals, info_penalties => \@infos });

	# - update the penalty info in the db if necessary
	$logger->debug("update penalty settings = " . $$args{update});

	$evt = update_patron_penalties( 
		patron    => $args->{patron}, 
		penalties => $all) if $$args{update};

	# - The caller won't know it failed, so log it
	$logger->error("penalty: Error updating the patron ".
		"penalties in the database: ".Dumper($evt)) if $evt;

	$runner->cleanup;
	return undef;
}

# --------------------------------------------------------------
# Removes existing penalties for the patron that are not passed 
# into this function.  Creates new penalty entries for the 
# provided penalties that don't already exist;
# --------------------------------------------------------------
sub update_patron_penalties {

	my %args			= @_;
	my $patron		= $args{patron};
	my $penalties	= $args{penalties};
	my $editor		= new_editor(xact=>1);
	my $pid			= $patron->id;

	$logger->debug("updating penalties for patron $pid => @$penalties");

	# - fetch the current penalties
	my $existing = $editor->search_actor_user_standing_penalty({usr=>$pid});

	my @types;
	push( @types, $_->penalty_type ) for @$existing;
	$logger->info("penalty: user has existing penalties [@types]");

	my @deleted;

	# If an existing penalty is not in the newly generated 
	# list of penalties, remove it from the DB
	for my $e (@$existing) {
		if( ! grep { $_ eq $e->penalty_type } @$penalties ) {

			$logger->activity("penalty: removing user penalty ".
				$e->penalty_type . " from user $pid");

			$editor->delete_actor_user_standing_penalty($e)
				or return $editor->die_event;
		}
	}

	# Add penalties that previously didn't exist
	for my $p (@$penalties) {
		if( ! grep { $_->penalty_type eq $p } @$existing ) {

			$logger->activity("penalty: adding user penalty $p to user $pid");

			my $newp = Fieldmapper::actor::user_standing_penalty->new;
			$newp->penalty_type( $p );
			$newp->usr( $pid );

			$editor->create_actor_user_standing_penalty($newp)
				or return $editor->die_event;
		}
	}
	
	$editor->commit;
	return undef;
}





1;
