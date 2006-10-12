package OpenILS::Utils::PermitHold;
use strict; use warnings;
use Data::Dumper;
use OpenSRF::Utils;
use OpenSRF::Utils::SettingsClient;
use OpenILS::Utils::ScriptRunner;
use OpenILS::Application::AppUtils;
use DateTime::Format::ISO8601;
use OpenILS::Application::Circ::ScriptBuilder;
use OpenSRF::Utils::Logger qw(:logger);
use OpenILS::Event;
my $U	= "OpenILS::Application::AppUtils";

my $script;			# - the permit script
my $script_libs;	# - extra script libs

# mental note:  open-ils.storage.biblio.record_entry.ranged_tree


# params within a hash are: copy, patron, 
# requestor, request_lib, title, title_descriptor
sub permit_copy_hold {
	my $params	= shift;
	my @allevents;

	my $ctx = {
		patron_id	=> $$params{patron_id},
		patron		=> $$params{patron},
		copy			=> $$params{copy},
		requestor	=> $$params{requestor},
		title			=> $$params{title},
		volume		=> $$params{volume},
		flesh_age_protect => 1,
		_direct	=> {
			requestLib	=> $$params{request_lib},
			pickupLib	=> $$params{pickup_lib},
		}
	};

	my $runner = OpenILS::Application::Circ::ScriptBuilder->build($ctx);

	my $ets = $ctx->{_events};

	# --------------------------------------------------------------
	# Strip the expired event since holds are still allowed to be
	# captured on expired patrons.  
	# --------------------------------------------------------------
	if( $ets and @$ets ) {
		$ets = [ grep { $_->{textcode} ne 'PATRON_ACCOUNT_EXPIRED' } @$ets ];
	} else { $ets = []; }

	if( @$ets ) {
		push( @allevents, @$ets);

		# --------------------------------------------------------------
		# If scriptbuilder returned any events, then the script context
		# is undefined and should not be used
		# --------------------------------------------------------------

	} else {

		# check the various holdable flags
		push( @allevents, OpenILS::Event->new('ITEM_NOT_HOLDABLE') )
			unless $U->is_true($ctx->{copy}->holdable);
	
		push( @allevents, OpenILS::Event->new('ITEM_NOT_HOLDABLE') )
			unless $U->is_true($ctx->{copy}->location->holdable);
	
		push( @allevents, OpenILS::Event->new('ITEM_NOT_HOLDABLE') )
			unless $U->is_true($ctx->{copy}->status->holdable);
	
		my $evt = check_age_protect($ctx->{patron}, $ctx->{copy});
		push( @allevents, $evt ) if $evt;
	
		$logger->debug("Running permit_copy_hold on copy " . $$params{copy}->id);
	
		load_scripts($runner);
		my $result = $runner->run or 
			throw OpenSRF::EX::ERROR ("Hold Copy Permit Script Died: $@");

		# --------------------------------------------------------------
		# Extract and uniquify the event list
		# --------------------------------------------------------------
		my $events = $result->{events};
		my $pid = ($params->{patron}) ? $params->{patron}->id : $params->{patron_id};
		$logger->debug("circ_permit_hold for user $pid returned events: [@$events]");
	
		push( @allevents, OpenILS::Event->new($_)) for @$events;
	}

	my %hash = map { ($_->{ilsevent} => $_) } @allevents;
	@allevents = values %hash;

	$runner->cleanup;

	return \@allevents if $$params{show_event_list};
	return 1 unless @allevents;
	return 0;
}


sub load_scripts {
	my $runner = shift;

	if(!$script) {
		my $conf = OpenSRF::Utils::SettingsClient->new;
		my @pfx	= ( "apps", "open-ils.circ","app_settings" );
		my $libs	= $conf->config_value(@pfx, 'script_path');
		$script	= $conf->config_value(@pfx, 'scripts', 'circ_permit_hold');
		$script_libs = (ref($libs)) ? $libs : [$libs];
	}

	$runner->add_path($_) for(@$script_libs);
	$runner->load($script);
}


sub check_age_protect {
	my( $patron, $copy ) = @_;

	return undef unless $copy and $copy->age_protect and $patron;

	my $hou = (ref $patron->home_ou) ? $patron->home_ou->id : $patron->home_ou;

	my $prox = $U->storagereq(
		'open-ils.storage.asset.copy.proximity', $copy->id, $hou );

	# If this copy is within the appropriate proximity, 
	# age protect does not apply
	return undef if $prox <= $copy->age_protect->prox;

	my $protection_list = $U->storagereq(
		'open-ils.storage.direct.config.rules.age_hold_protect.search_where.atomic', 
		{ age  => { '>=' => $copy->age_protect->age  },
		  prox => { '>=' => $copy->age_protect->prox },
		},
		{ order_by => 'age' }
	);

	# Now, now many seconds old is this copy
	my $create_date = DateTime::Format::ISO8601
		->new
		->parse_datetime( OpenSRF::Utils::clense_ISO8601($copy->create_date) )
		->epoch;

	my $age = time - $create_date;

	for my $protection ( @$protection_list ) {

		$logger->info("analyzing age protect ".$protection->name);

		# age protect does not apply if within the proximity
		last if $prox <= $protection->prox;

		# How many seconds old does the copy have to be to escape age protection
		my $interval = OpenSRF::Utils::interval_to_seconds($protection->age);

		$logger->info("age_protect interval=$interval, create_date=$create_date, age=$age");

		if( $interval > $age ) { 
			# if age of the item is less than the protection interval, 
			# the item falls within the age protect range
			$logger->info("age_protect prevents copy from having a hold placed on it: ".$copy->id);
			return OpenILS::Event->new('ITEM_AGE_PROTECTED', copy => $copy->id );
		}
	}
		
	return undef;
}

23;
