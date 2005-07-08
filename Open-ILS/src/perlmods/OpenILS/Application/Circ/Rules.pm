# ---------------------------------------------------------------
# Copyright (C) 2005  Georgia Public Library Service 
# Bill Erickson <highfalutin@gmail.com>

# This program is free software; you can redistribute it and/or
# modify it under the terms of the GNU General Public License
# as published by the Free Software Foundation; either version 2
# of the License, or (at your option) any later version.

# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
# ---------------------------------------------------------------

package OpenILS::Application::Circ::Rules;
use base qw/OpenSRF::Application/;
use strict; use warnings;

use OpenSRF::Utils::SettingsClient;
use OpenILS::Utils::Fieldmapper;
use OpenILS::EX;
use OpenSRF::Utils::Logger qw(:level); 

use Template qw(:template);
use Template::Stash; 

use Time::HiRes qw(time);
use OpenILS::Utils::ModsParser;

use OpenSRF::Utils;
use OpenSRF::EX qw(:try);

use OpenILS::Application::AppUtils;
my $apputils = "OpenILS::Application::AppUtils";
use Digest::MD5 qw(md5_hex);

my $log = "OpenSRF::Utils::Logger";

# ----------------------------------------------------------------
# rules scripts
my $circ_script;
my $permission_script;
my $duration_script;
my $recurring_fines_script;
my $max_fines_script;
my $permit_hold_script;
# ----------------------------------------------------------------


# data used for this circulation transaction
my $circ_objects = {};

# some static data from the database
my $copy_statuses;
my $patron_standings;
my $patron_profiles;
my $shelving_locations;

# template stash
my $stash;

# memcache for caching the circ objects
my $cache_handle;


use constant NO_COPY => 100;

sub initialize {
	my $self = shift;
	my $conf = OpenSRF::Utils::SettingsClient->new;

	# ----------------------------------------------------------------
	# set up the rules scripts
	# ----------------------------------------------------------------
	$circ_script = $conf->config_value(					
		"apps", "open-ils.circ","app_settings", "rules", "main");

	$permission_script = $conf->config_value(			
		"apps", "open-ils.circ","app_settings", "rules", "permission");

	$duration_script = $conf->config_value(			
		"apps", "open-ils.circ","app_settings", "rules", "duration");

	$recurring_fines_script = $conf->config_value(	
		"apps", "open-ils.circ","app_settings", "rules", "recurring_fines");

	$max_fines_script = $conf->config_value(			
		"apps", "open-ils.circ","app_settings", "rules", "max_fines");

	$permit_hold_script = $conf->config_value(
		"apps", "open-ils.circ","app_settings", "rules", "permit_hold");

	$log->debug("Loaded rules scripts for circ:\n".
		"main - $circ_script : permit circ - $permission_script\n".
		"duration - $duration_script : recurring - $recurring_fines_script\n".
		"max fines - $max_fines_script : permit hold - $permit_hold_script", DEBUG);


	$cache_handle = OpenSRF::Utils::Cache->new();
}


sub _grab_patron_standings {
	my $session = shift;
	if(!$patron_standings) {
		my $standing_req = $session->request(
			"open-ils.storage.direct.config.standing.retrieve.all.atomic");
		$patron_standings = $standing_req->gather(1);
		$patron_standings =
			{ map { (''.$_->id => $_->value) } @$patron_standings };
	}
}

sub _grab_patron_profiles {
	my $session = shift;
	if(!$patron_profiles) {
		my $profile_req = $session->request(
			"open-ils.storage.direct.actor.profile.retrieve.all.atomic");
		$patron_profiles = $profile_req->gather(1);
		$patron_profiles =
			{ map { (''.$_->id => $_->name) } @$patron_profiles };
	}

}

sub _grab_user {
	my $session = shift;
	my $patron_id = shift;
	my $patron_req	= $session->request(
		"open-ils.storage.direct.actor.user.retrieve", 
		$patron_id );
	return $patron_req->gather(1);
}
	

sub _grab_title_by_copy {
	my $session = shift;
	my $copyid = shift;
	my $title_req	= $session->request(
		"open-ils.storage.fleshed.biblio.record_entry.retrieve_by_copy",
		$copyid );
	return $title_req->gather(1);
}

sub _grab_patron_summary {
	my $session = shift;
	my $patron_id = shift;
	my $summary_req = $session->request(
		"open-ils.storage.action.circulation.patron_summary",
		$patron_id );
	return $summary_req->gather(1);
}

sub _grab_copy_by_barcode {
	my($session, $barcode) = @_;
	warn "Searching for copy with barcode $barcode\n";
	my $copy_req	= $session->request(
		"open-ils.storage.fleshed.asset.copy.search.barcode", 
		$barcode );
	return $copy_req->gather(1);
}


sub gather_hold_objects {
	my($session, $hold, $copy, $args) = @_;

	_grab_patron_standings($session);
	_grab_patron_profiles($session);


	# flesh me
	$copy = _grab_copy_by_barcode($session, $copy->barcode);

	my $hold_objects = {};
	$hold_objects->{standings} = $patron_standings;
	$hold_objects->{copy}		= $copy;
	$hold_objects->{hold}		= $hold;
	$hold_objects->{title}		= $$args{title} || _grab_title_by_copy($session, $copy->id);
	$hold_objects->{requestor} = _grab_user($session, $hold->requestor);
	my $patron						= _grab_user($session, $hold->usr);

	$copy->status( $copy->status->name );
	$patron->standing($patron_standings->{$patron->standing()});
	$patron->profile( $patron_profiles->{$patron->profile});

	$hold_objects->{patron}		= $patron;

	return $hold_objects;
}



__PACKAGE__->register_method(
	method	=> "permit_hold",
	api_name	=> "open-ils.circ.permit_hold",
	notes		=> <<NOTES
Determines whether a given copy is eligible to be held
NOTES
);

sub permit_hold {
	my( $self, $client, $hold, $copy, $args ) = @_;

	my $session	= OpenSRF::AppSession->create("open-ils.storage");
	
	# collect items necessary for circ calculation
	my $hold_objects = gather_hold_objects( $session, $hold, $copy, $args );

	$stash = Template::Stash->new(
			circ_objects			=> $hold_objects,
			result					=> []);

	$stash->set("run_block", $permit_hold_script);

	# grab the number of copies checked out by the patron as
	# well as the total fines
	my $summary = _grab_patron_summary($session, $hold_objects->{patron}->id);
	$summary->[0] ||= 0;
	$summary->[0] ||= 0.0;

	$stash->set("patron_copies", $summary->[0] );
	$stash->set("patron_fines", $summary->[1] );

	# run the permissibility script
	run_script();
	my $result = $stash->get("result");

	# 0 means OK in the script
	return 1 if($result->[0] == 0);
	return 0;

}





# ----------------------------------------------------------------
# Collect all of the objects necessary for calculating the
# circ matrix.
# ----------------------------------------------------------------
sub gather_circ_objects {
	my( $session, $barcode_string, $patron_id ) = @_;

	throw OpenSRF::EX::ERROR 
		("gather_circ_objects needs data")
			unless ($barcode_string and $patron_id);

	warn "Gathering circ objects with barcode $barcode_string and patron id $patron_id\n";

	# see if all of the circ objects are in cache
	my $cache_key =  "circ_object_" . md5_hex( $barcode_string, $patron_id );
	$circ_objects = $cache_handle->get_cache($cache_key);

	if($circ_objects) { 
		$stash = Template::Stash->new(
			circ_objects			=> $circ_objects,
			result					=> [],
			target_copy_status	=> 1,
			);
		return;
	}

	# only necessary if the circ objects have not been built yet

	_grab_patron_standings($session);
	_grab_patron_profiles($session);


	my $copy = _grab_copy_by_barcode($session, $barcode_string);
	if(!$copy) { return NO_COPY; }

	my $patron = _grab_user($session, $patron_id);

	$copy->status( $copy->status->name );
	$circ_objects->{copy} = $copy;

	$patron->standing($patron_standings->{$patron->standing()});
	$patron->profile( $patron_profiles->{$patron->profile});
	$circ_objects->{patron} = $patron;
	$circ_objects->{standings} = $patron_standings;

	#$circ_objects->{title} = $title_req->gather(1);
	$circ_objects->{title} = _grab_title_by_copy($session, $circ_objects->{copy}->id);
	$cache_handle->put_cache( $cache_key, $circ_objects, 30 );

	$stash = Template::Stash->new(
			circ_objects			=> $circ_objects,
			result					=> [],
			target_copy_status	=> 1,
			);
}



sub run_script {

	my $result;

	my $template = Template->new(
		{ 
			STASH			=> $stash,
			ABSOLUTE		=> 1, 
			OUTPUT		=> \$result,
		}
	);

	my $status = $template->process($circ_script);

	if(!$status) { 
		throw OpenSRF::EX::ERROR 
			("Error processing circ script " .  $template->error()); 
	}

	warn "Script result: $result\n";
}




__PACKAGE__->register_method(
	method	=> "permit_circ",
	api_name	=> "open-ils.circ.permit_checkout",
);

sub permit_circ {
	my( $self, $client, $user_session, $barcode, $user_id, $outstanding_count ) = @_;

	$outstanding_count ||= 0;

	my $session	= OpenSRF::AppSession->create("open-ils.storage");
	
	# collect items necessary for circ calculation
	my $status = gather_circ_objects( $session, $barcode, $user_id );

	if( $status == NO_COPY ) {
		return { record => undef, 
			status => NO_COPY, 
			text => "No copy available with barcode $barcode"
		};
	}

	$stash->set("run_block", $permission_script);

	# grab the number of copies checked out by the patron as
	# well as the total fines
	my $summary_req = $session->request(
		"open-ils.storage.action.circulation.patron_summary",
		$stash->get("circ_objects")->{patron}->id );
	my $summary = $summary_req->gather(1);

	$stash->set("patron_copies", $summary->[0]  + $outstanding_count );
	$stash->set("patron_fines", $summary->[1] );

	# run the permissibility script
	run_script();
	my $obj = $stash->get("circ_objects");

	# turn the biblio record into a friendly object
	my $u = OpenILS::Utils::ModsParser->new();
	$u->start_mods_batch( $obj->{title}->marc() );
	my $mods = $u->finish_mods_batch();

	my $arr = $stash->get("result");
	return { record => $mods, status => $arr->[0], text => $arr->[1] };

}



__PACKAGE__->register_method(
	method	=> "circulate",
	api_name	=> "open-ils.circ.checkout.barcode",
);

sub circulate {
	my( $self, $client, $user_session, $barcode, $patron ) = @_;


	my $session = $apputils->start_db_session();

	gather_circ_objects( $session, $barcode, $patron );

	# grab the copy statuses if we don't already have them
	if(!$copy_statuses) {
		my $csreq = $session->request(
			"open-ils.storage.direct.config.copy_status.retrieve.all.atomic" );
		$copy_statuses = $csreq->gather(1);
	}

	# put copy statuses into the stash
	$stash->set("copy_statuses", $copy_statuses );

	my $copy = $circ_objects->{copy};
	my ($circ, $duration, $recurring, $max) =  run_circ_scripts($session);

	# commit new circ object to db
	my $commit = $session->request(
		"open-ils.storage.direct.action.circulation.create",
		$circ );
	my $id = $commit->gather(1);

	if(!$id) {
		throw OpenSRF::EX::ERROR 
			("Error creating new circulation object");
	}

	# update the copy with the new circ
	$copy->status( $stash->get("target_copy_status") );
	$copy->location( $copy->location->id );
	$copy->circ_lib( $copy->circ_lib->id );

	# commit copy to db
	my $copy_update = $session->request(
		"open-ils.storage.direct.asset.copy.update",
		$copy );
	$copy_update->gather(1);

	$apputils->commit_db_session($session);

	# remove our circ object from the cache
	$cache_handle->delete_cache("circ_object_" . md5_hex($barcode, $patron));

	# re-retrieve the the committed circ object  
	$circ = $apputils->simple_scalar_request(
		"open-ils.storage",
		"open-ils.storage.direct.action.circulation.retrieve",
		$id );


	# push the rules and due date into the circ object
	$circ->duration_rule($duration);
	$circ->max_fine_rule($max);
	$circ->recuring_fine_rule($recurring);


#	my $due_date = 
#		OpenSRF::Utils->interval_to_seconds( 
#		$circ->duration ) + int(time());

#	this comes from an earlier setting now
#	$circ->due_date($due_date);

	return $circ;

}



# runs the duration, recurring_fines, and max_fines scripts.
# builds the new circ object based on the rules returned from 
# these scripts. 
# returns (circ, duration_rule, recurring_fines_rule, max_fines_rule)
sub run_circ_scripts {
	my $session = shift;

	# go through all of the scripts and process
	# each script returns 
	# [ rule_name, level (appropriate to the script) ]
	$stash->set("result", [] );
	$stash->set("run_block", $duration_script);
	run_script();
	my $duration_rule = $stash->get("result");

	$stash->set("run_block", $recurring_fines_script);
	$stash->set("result", [] );
	run_script();
	my $rec_fines_rule = $stash->get("result");

	$stash->set("run_block", $max_fines_script);
	$stash->set("result", [] );
	run_script();
	my $max_fines_rule = $stash->get("result");

	my $obj = $stash->get("circ_objects");

	# ----------------------------------------------------------
	# find the rules objects based on the rule names returned from
	# the various scripts.
	my $dur_req = $session->request(
		"open-ils.storage.direct.config.rules.circ_duration.search.name.atomic",
		$duration_rule->[0] );

	my $rec_req = $session->request(
		"open-ils.storage.direct.config.rules.recuring_fine.search.name.atomic",
		$rec_fines_rule->[0] );

	my $max_req = $session->request(
		"open-ils.storage.direct.config.rules.max_fine.search.name.atomic",
		$max_fines_rule->[0] );

	my $duration	= $dur_req->gather(1)->[0];
	my $recurring	= $rec_req->gather(1)->[0];
	my $max			= $max_req->gather(1)->[0];

	my $copy = $circ_objects->{copy};

	use Data::Dumper;
	warn "Building a new circulation object with\n".
		"=> copy "				. Dumper($copy) .
		"=> duration_rule "	. Dumper($duration_rule) .
		"=> rec_files_rule " . Dumper($rec_fines_rule) .
		"=> duration "			. Dumper($duration) .
		"=> recurring "		. Dumper($recurring) .
		"=> max "				. Dumper($max);


	# build the new circ object
	my $circ =  build_circ_object($session, $copy, $duration_rule->[1], 
			$rec_fines_rule->[1], $duration, $recurring, $max );

	return ($circ, $duration, $recurring, $max);

}

# ------------------------------------------------------------------
# Builds a new circ object
# ------------------------------------------------------------------
sub build_circ_object {
	my( $session, $copy, $dur_level, $rec_level, 
			$duration, $recurring, $max ) = @_;

	my $circ = new Fieldmapper::action::circulation;

	$circ->circ_lib( $copy->circ_lib->id() );
	if($dur_level == 1) {
		$circ->duration( $duration->shrt );
	} elsif($dur_level == 2) {
		$circ->duration( $duration->normal );
	} elsif($dur_level == 3) {
		$circ->duration( $duration->extended );
	}

	if($rec_level == 1) {
		$circ->recuring_fine( $recurring->low );
	} elsif($rec_level == 2) {
		$circ->recuring_fine( $recurring->normal );
	} elsif($rec_level == 3) {
		$circ->recuring_fine( $recurring->high );
	}

	$circ->duration_rule( $duration->name );
	$circ->recuring_fine_rule( $recurring->name );
	$circ->max_fine_rule( $max->name );
	$circ->max_fine( $max->amount );

	$circ->fine_interval($recurring->recurance_interval);
	$circ->renewal_remaining( $duration->max_renewals );
	$circ->target_copy( $copy->id );
	$circ->usr( $circ_objects->{patron}->id );

	return $circ;

}

__PACKAGE__->register_method(
	method	=> "checkin",
	api_name	=> "open-ils.circ.checkin.barcode",
);

sub checkin {
	my( $self, $client, $user_session, $barcode ) = @_;

	my $err;
	my $copy;

	try {
		my $session = $apputils->start_db_session();
	
		warn "retrieving copy for checkin\n";

		if(!$shelving_locations) {
			my $sh_req = $session->request(
				"open-ils.storage.direct.asset.copy_location.retrieve.all.atomic");
			$shelving_locations = $sh_req->gather(1);
			$shelving_locations = 
				{ map { (''.$_->id => $_->name) } @$shelving_locations };
		}
	
		my $copy_req = $session->request(
			"open-ils.storage.direct.asset.copy.search.barcode.atomic", 
			$barcode );
		$copy = $copy_req->gather(1)->[0];
		if(!$copy) {
			$client->respond_complete(
					OpenILS::EX->new("UNKNOWN_BARCODE")->ex);
		}

		$copy->status(0);
	
		# find circ's where the transaction is still open for the
		# given copy.  should only be one.
		warn "Retrieving circ for checking\n";
		my $circ_req = $session->request(
			"open-ils.storage.direct.action.circulation.search.atomic.atomic",
			{ target_copy => $copy->id, xact_finish => undef } );
	
		my $circ = $circ_req->gather(1)->[0];
	
		if(!$circ) {
			$err = "No circulation exists for the given barcode";

		} else {
	
			warn "Checking in circ ". $circ->id . "\n";
		
			$circ->stop_fines("CHECKIN");
			$circ->xact_finish("now");
		
			my $cp_up = $session->request(
				"open-ils.storage.direct.asset.copy.update",
				$copy );
			$cp_up->gather(1);
		
			my $ci_up = $session->request(
				"open-ils.storage.direct.action.circulation.update",
				$circ );
			$ci_up->gather(1);
		
			$apputils->commit_db_session($session);
		
			warn "Checkin succeeded\n";
		}
	
	} catch Error with {
		my $e = shift;
		$err = "Error checking in: $e";
	};
	
	if($err) {
		return { record => undef, status => -1, text => $err };

	} else {

		my $record = $apputils->simple_scalar_request(
			"open-ils.storage",
			"open-ils.storage.fleshed.biblio.record_entry.retrieve_by_copy",
			$copy->id() );

		my $u = OpenILS::Utils::ModsParser->new();
		$u->start_mods_batch( $record->marc() );
		my $mods = $u->finish_mods_batch();
		return { record => $mods, status => 0, text => "OK", 
			route_to => $shelving_locations->{$copy->location} };
	}

	return 1;

}





1;
