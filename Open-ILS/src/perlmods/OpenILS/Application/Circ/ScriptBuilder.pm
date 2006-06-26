package OpenILS::Application::Circ::ScriptBuilder;
use strict; use warnings;
use OpenILS::Utils::ScriptRunner;
use OpenILS::Utils::CStoreEditor qw/:funcs/;
use OpenILS::Application::AppUtils;
use OpenILS::Application::Actor;
my $U = "OpenILS::Application::AppUtils";

my $evt = "environment";
my @COPY_STATUSES;
my @COPY_LOCATIONS;
my @GROUP_LIST;


# -----------------------------------------------------------------------
# Possible Args:
#  copy
#  copy_id
#  copy_barcode
#
#  patron
#  patron_id
#  patron_barcode
#
#  fetch_patron_circ_info - load info on items out, overdues, and fines.
#
#  _direct - this is a hash of key/value pairs to shove directly into the 
#  script runner.  Use this to cover data not covered by this module
# -----------------------------------------------------------------------
sub build {
	my( $class, $args ) = @_;

	my $editor = $$args{editor} || new_editor();

	$args->{_direct} = {} unless $args->{_direct};
	
	fetch_bib_data($editor, $args);
	fetch_user_data($editor, $args);
	return build_runner($editor, $args);
}


sub build_runner {
	my $editor	= shift;
	my $ctx		= shift;
	my $runner	= OpenILS::Utils::ScriptRunner->new;

	$runner->insert( "$evt.patron",		$ctx->{patron}, 1);
	$runner->insert( "$evt.copy",			$ctx->{copy}, 1);
	$runner->insert( "$evt.volume",		$ctx->{volume}, 1);
	$runner->insert( "$evt.record",		$ctx->{title}, 1);
	$runner->insert( "$evt.requestor",	$ctx->{requestor}, 1);
	$runner->insert( "$evt.recordDescriptor", $ctx->{recordDescriptor}, 1);

	$runner->insert( "$evt.patronItemsOut", $ctx->{patronItemsOut} );
	$runner->insert( "$evt.patronOverdueCount", $ctx->{patronOverdue} );
	$runner->insert( "$evt.patronFines", $ctx->{patronFines} );

	# circ script result
	$runner->insert("result", {});
	$runner->insert("result.events", []);
	$runner->insert('result.fatalEvents', []);
	$runner->insert('result.infoEvents', []);

	$runner->insert("$evt.$_", $ctx->{_direct}->{$_}) for keys %{$ctx->{_direct}};

	$ctx->{runner} = $runner;
	return $runner;
}

sub fetch_bib_data {
	my $e = shift;
	my $ctx = shift;

	if(!$ctx->{copy}) {

		if($ctx->{copy_id}) {
			$ctx->{copy} = $e->retrieve_asset_copy($ctx->{copy_id})
				or return $e->event;

		} elsif( $ctx->{copy_barcode} ) {

			$ctx->{copy} = $e->search_asset_copy(
				{barcode => $ctx->{copy_barcode}}) or return $e->event;
			$ctx->{copy} = $ctx->{copy}->[0];
		}
	}

	return undef unless my $copy = $ctx->{copy};

	# --------------------------------------------------------------------
	# Fetch/Cache the copy status and location objects
	# --------------------------------------------------------------------
	if(!@COPY_STATUSES) {
		my $s = $e->retrieve_all_config_copy_status();
		@COPY_STATUSES = @$s;
		$s = $e->retrieve_all_asset_copy_location();
		@COPY_LOCATIONS = @$s;
		$s = $e->retrieve_all_permission_grp_tree();
		@GROUP_LIST = @$s;
	}

	# Flesh the status and location
	$copy->status( grep { $_->id == $copy->status } @COPY_STATUSES );
	$copy->location( grep { $_->id == $copy->location } @COPY_LOCATIONS );

	$ctx->{volume} = $e->retrieve_asset_call_number(
		$ctx->{copy}->call_number) or return $e->event;

	$ctx->{record} = $e->retrieve_biblio_record_entry(
		$ctx->{volume}->record) or return $e->event;

	$ctx->{recordDescriptor} = $e->search_metabib_record_descriptor( 
		{ record => $ctx->{record}->id }) or return $e->event;

	$ctx->{recordDescriptor} = $ctx->{recordDescriptor}->[0];

	return undef;
}



sub fetch_user_data {
	my( $e, $ctx ) = @_;
	
	if(!$ctx->{patron}) {

		if( $ctx->{patron_id} ) {
			$ctx->{patron} = $e->retrieve_actor_user($ctx->{patron_id});

		} elsif( $ctx->{patron_barcode} ) {

			my $card = $e->search_actor_card( 
				{ barcode => $ctx->{patron_barcode} } ) or return $e->event;

			$ctx->{patron} = $e->search_actor_user( 
				{ card => $card->[0]->id }) or return $e->event;
			$ctx->{patron} = $ctx->{patron}->[0];
		}
	}

	return undef unless my $patron = $ctx->{patron};

	$patron->home_ou( $e->retrieve_actor_org_unit($patron->home_ou) );	
	$patron->profile( grep { $_->id == $patron->profile } @GROUP_LIST );

	$ctx->{requestor} = $ctx->{requestor} || $e->requestor;

	# this could alter the requestor object within the editor..
	#if( my $req = $ctx->{requestor} ) {
	#	$req->home_ou( $e->retrieve_actor_org_unit($requestor->home_ou) );	
	#	$req->ws_ou( $e->retrieve_actor_org_unit($requestor->ws_ou) );	
	#}

	if( $ctx->{fetch_patron_circ_info} ) {

		my $circ_counts = 
			OpenILS::Application::Actor::_checked_out(1, $e, $patron->id);

		$ctx->{patronOverdue} = $circ_counts->{overdue} || 0;
		$ctx->{patronItemsOut} = $ctx->{patronOverdue} + $circ_counts->{out};

		# Grab the fines
		my $fxacts = $e->search_money_open_billable_transaction_summary(
			{ usr => $patron->id, balance_owed => { ">" => 0 } });

		my $fines = 0;
		$fines += $_->balance_owed for @$fxacts;
		$ctx->{patronFines} = $fines;
	}

	return undef;
}

1;

