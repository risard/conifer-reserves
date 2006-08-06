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


package OpenILS::Application::Circ::Holds;
use base qw/OpenSRF::Application/;
use strict; use warnings;
use OpenILS::Application::AppUtils;
use Data::Dumper;
use OpenSRF::EX qw(:try);
use OpenILS::Perm;
use OpenILS::Event;
use OpenSRF::Utils::Logger qw(:logger);
use OpenILS::Utils::CStoreEditor q/:funcs/;
use OpenILS::Utils::PermitHold;
use OpenILS::Const qw/:const/;

my $apputils = "OpenILS::Application::AppUtils";
my $U = $apputils;



__PACKAGE__->register_method(
	method	=> "create_hold",
	api_name	=> "open-ils.circ.holds.create",
	notes		=> <<NOTE);
Create a new hold for an item.  From a permissions perspective, 
the login session is used as the 'requestor' of the hold.  
The hold recipient is determined by the 'usr' setting within
the hold object.

First we verify the requestion has holds request permissions.
Then we verify that the recipient is allowed to make the given hold.
If not, we see if the requestor has "override" capabilities.  If not,
a permission exception is returned.  If permissions allow, we cycle
through the set of holds objects and create.

If the recipient does not have permission to place multiple holds
on a single title and said operation is attempted, a permission
exception is returned
NOTE


__PACKAGE__->register_method(
	method	=> "create_hold",
	api_name	=> "open-ils.circ.holds.create.override",
	signature	=> q/
		If the recipient is not allowed to receive the requested hold,
		call this method to attempt the override
		@see open-ils.circ.holds.create
	/
);

sub create_hold {
	my( $self, $conn, $auth, @holds ) = @_;
	my $e = new_editor(authtoken=>$auth, xact=>1);
	return $e->event unless $e->checkauth;

	my $override = 1 if $self->api_name =~ /override/;

	my $holds = (ref($holds[0] eq 'ARRAY')) ? $holds[0] : [@holds];

	for my $hold (@$holds) {

		next unless $hold;
		my @events;

		my $requestor = $e->requestor;
		my $recipient = $requestor;


		if( $requestor->id ne $hold->usr ) {
			# Make sure the requestor is allowed to place holds for 
			# the recipient if they are not the same people
			$recipient = $e->retrieve_actor_user($hold->usr) or return $e->event;
			$e->allowed('REQUEST_HOLDS', $recipient->home_ou) or return $e->event;
		}


		# Now make sure the recipient is allowed to receive the specified hold
		my $pevt;
		my $porg		= $recipient->home_ou;
		my $rid		= $e->requestor->id;
		my $t			= $hold->hold_type;

		# See if a duplicate hold already exists
		my $sargs = {
			usr			=> $recipient->id, 
			hold_type	=> $t, 
			fulfillment_time => undef, 
			target		=> $hold->target,
			cancel_time	=> undef,
		};

		$sargs->{holdable_formats} = $hold->holdable_formats if $t eq 'M';
			
		my $existing = $e->search_action_hold_request($sargs); 
		push( @events, OpenILS::Event->new('HOLD_EXISTS')) if @$existing;

		if( $t eq 'M' ) { $pevt = $e->event unless $e->checkperm($rid, $porg, 'MR_HOLDS'); }
		if( $t eq 'T' ) { $pevt = $e->event unless $e->checkperm($rid, $porg, 'TITLE_HOLDS');  }
		if( $t eq 'V' ) { $pevt = $e->event unless $e->checkperm($rid, $porg, 'VOLUME_HOLDS'); }
		if( $t eq 'C' ) { $pevt = $e->event unless $e->checkperm($rid, $porg, 'COPY_HOLDS'); }

		return $pevt if $pevt;

		if( @events ) {
			if( $override ) {
				for my $evt (@events) {
					next unless $evt;
					my $name = $evt->{textcode};
					return $e->event unless $e->allowed("$name.override", $porg);
				}
			} else {
				return \@events;
			}
		}


#		if( $eevt ) {
#			if( $override ) {
#				return $e->event unless $e->allowed('CREATE_DUPLICATE_HOLDS', $porg);
#			} else {
#				return $eevt;
#			}
#		}


		$hold->requestor($e->requestor->id); 
		$hold->selection_ou($recipient->home_ou) unless $hold->selection_ou;
		$e->create_action_hold_request($hold) or return $e->event;
	}

	$e->commit;
	return 1;
}

sub __create_hold {
	my( $self, $client, $login_session, @holds) = @_;

	if(!@holds){return 0;}
	my( $user, $evt ) = $apputils->checkses($login_session);
	return $evt if $evt;

	my $holds;
	if(ref($holds[0]) eq 'ARRAY') {
		$holds = $holds[0];
	} else { $holds = [ @holds ]; }

	$logger->debug("Iterating over holds requests...");

	for my $hold (@$holds) {

		if(!$hold){next};
		my $type = $hold->hold_type;

		$logger->activity("User " . $user->id . 
			" creating new hold of type $type for user " . $hold->usr);

		my $recipient;
		if($user->id ne $hold->usr) {
			( $recipient, $evt ) = $apputils->fetch_user($hold->usr);
			return $evt if $evt;

		} else {
			$recipient = $user;
		}


		my $perm = undef;

		# am I allowed to place holds for this user?
		if($hold->requestor ne $hold->usr) {
			$perm = _check_request_holds_perm($user->id, $user->home_ou);
			if($perm) { return $perm; }
		}

		# is this user allowed to have holds of this type?
		$perm = _check_holds_perm($type, $hold->requestor, $recipient->home_ou);
		if($perm) { 
			#if there is a requestor, see if the requestor has override privelages
			if($hold->requestor ne $hold->usr) {
				$perm = _check_request_holds_override($user->id, $user->home_ou);
				if($perm) {return $perm;}

			} else {
				return $perm; 
			}
		}

		#enforce the fact that the login is the one requesting the hold
		$hold->requestor($user->id); 
		$hold->selection_ou($recipient->home_ou) unless $hold->selection_ou;

		my $resp = $apputils->simplereq(
			'open-ils.storage',
			'open-ils.storage.direct.action.hold_request.create', $hold );

		if(!$resp) { 
			return OpenSRF::EX::ERROR ("Error creating hold"); 
		}
	}

	return 1;
}

# makes sure that a user has permission to place the type of requested hold
# returns the Perm exception if not allowed, returns undef if all is well
sub _check_holds_perm {
	my($type, $user_id, $org_id) = @_;

	my $evt;
	if($type eq "M") {
		if($evt = $apputils->check_perms(
			$user_id, $org_id, "MR_HOLDS")) {
			return $evt;
		} 

	} elsif ($type eq "T") {
		if($evt = $apputils->check_perms(
			$user_id, $org_id, "TITLE_HOLDS")) {
			return $evt;
		}

	} elsif($type eq "V") {
		if($evt = $apputils->check_perms(
			$user_id, $org_id, "VOLUME_HOLDS")) {
			return $evt;
		}

	} elsif($type eq "C") {
		if($evt = $apputils->check_perms(
			$user_id, $org_id, "COPY_HOLDS")) {
			return $evt;
		}
	}

	return undef;
}

# tests if the given user is allowed to place holds on another's behalf
sub _check_request_holds_perm {
	my $user_id = shift;
	my $org_id = shift;
	if(my $evt = $apputils->check_perms(
		$user_id, $org_id, "REQUEST_HOLDS")) {
		return $evt;
	}
}

sub _check_request_holds_override {
	my $user_id = shift;
	my $org_id = shift;
	if(my $evt = $apputils->check_perms(
		$user_id, $org_id, "REQUEST_HOLDS_OVERRIDE")) {
		return $evt;
	}
}

__PACKAGE__->register_method(
	method	=> "retrieve_holds_by_id",
	api_name	=> "open-ils.circ.holds.retrieve_by_id",
	notes		=> <<NOTE);
Retrieve the hold, with hold transits attached, for the specified id
The login session is the requestor and if the requestor is
different from the user, then the requestor must have VIEW_HOLD permissions.
NOTE


sub retrieve_holds_by_id {
	my($self, $client, $login_session, $hold_id) = @_;

	#FIXME
	#my( $user, $target, $evt ) = $apputils->checkses_requestor(
	#	$login_session, $user_id, 'VIEW_HOLD' );
	#return $evt if $evt;

	my $holds = $apputils->simplereq(
		'open-ils.cstore',
		"open-ils.cstore.direct.action.hold_request.search.atomic",
		{ id =>  $hold_id , fulfillment_time => undef }, { order_by => { ahr => "request_time" } });
	
	for my $hold ( @$holds ) {
		$hold->transit(
			$apputils->simplereq(
				'open-ils.cstore',
				"open-ils.cstore.direct.action.hold_transit_copy.search.atomic",
				{ hold => $hold->id },
				{ order_by => { ahtc => 'id desc' }, limit => 1 }
			)->[0]
		);
	}

	return $holds;
}


__PACKAGE__->register_method(
	method	=> "retrieve_holds",
	api_name	=> "open-ils.circ.holds.retrieve",
	notes		=> <<NOTE);
Retrieves all the holds, with hold transits attached, for the specified
user id.  The login session is the requestor and if the requestor is
different from the user, then the requestor must have VIEW_HOLD permissions.
NOTE


sub retrieve_holds {
	my($self, $client, $login_session, $user_id) = @_;

	my( $user, $target, $evt ) = $apputils->checkses_requestor(
		$login_session, $user_id, 'VIEW_HOLD' );
	return $evt if $evt;

	my $holds = $apputils->simplereq(
		'open-ils.cstore',
		"open-ils.cstore.direct.action.hold_request.search.atomic",
		{ 
			usr =>  $user_id , 
			fulfillment_time => undef,
			cancel_time => undef,
		}, 
		{ order_by => { ahr => "request_time" } }
	);
	
	for my $hold ( @$holds ) {
		$hold->transit(
			$apputils->simplereq(
				'open-ils.cstore',
				"open-ils.cstore.direct.action.hold_transit_copy.search.atomic",
				{ hold => $hold->id },
				{ order_by => { ahtc => 'id desc' }, limit => 1 }
			)->[0]
		);
	}

	return $holds;
}

__PACKAGE__->register_method(
	method	=> "retrieve_holds_by_pickup_lib",
	api_name	=> "open-ils.circ.holds.retrieve_by_pickup_lib",
	notes		=> <<NOTE);
Retrieves all the holds, with hold transits attached, for the specified
pickup_ou id. 
NOTE


sub retrieve_holds_by_pickup_lib {
	my($self, $client, $login_session, $ou_id) = @_;

	#FIXME -- put an appropriate permission check here
	#my( $user, $target, $evt ) = $apputils->checkses_requestor(
	#	$login_session, $user_id, 'VIEW_HOLD' );
	#return $evt if $evt;

	my $holds = $apputils->simplereq(
		'open-ils.cstore',
		"open-ils.cstore.direct.action.hold_request.search.atomic",
		{ 
			pickup_lib =>  $ou_id , 
			fulfillment_time => undef,
			cancel_time => undef
		}, 
		{ order_by => { ahr => "request_time" } });
	
	for my $hold ( @$holds ) {
		$hold->transit(
			$apputils->simplereq(
				'open-ils.cstore',
				"open-ils.cstore.direct.action.hold_transit_copy.search.atomic",
				{ hold => $hold->id },
				{ order_by => { ahtc => 'id desc' }, limit => 1 }
			)->[0]
		);
	}

	return $holds;
}


__PACKAGE__->register_method(
	method	=> "cancel_hold",
	api_name	=> "open-ils.circ.hold.cancel",
	notes		=> <<"	NOTE");
	Cancels the specified hold.  The login session
	is the requestor and if the requestor is different from the usr field
	on the hold, the requestor must have CANCEL_HOLDS permissions.
	the hold may be either the hold object or the hold id
	NOTE

sub cancel_hold {
	my($self, $client, $auth, $holdid) = @_;

	my $e = new_editor(authtoken=>$auth, xact=>1);
	return $e->event unless $e->checkauth;

	my $hold = $e->retrieve_action_hold_request($holdid)
		or return $e->event;

	if( $e->requestor->id ne $hold->usr ) {
		return $e->event unless $e->allowed('CANCEL_HOLDS');
	}

	return 1 if $hold->cancel_time;

	# If the hold is captured, reset the copy status
	if( $hold->capture_time and $hold->current_copy ) {

		my $copy = $e->retrieve_asset_copy($hold->current_copy)
			or return $e->event;
		my $stat = $U->copy_status_from_name('on holds shelf');

		if( $copy->status == $stat->id ) {
			$logger->info("setting copy to status 'reshelving' on hold cancel");
			$copy->status(OILS_COPY_STATUS_RESHELVING);
			$copy->editor($e->requestor->id);
			$copy->edit_date('now');
			$e->update_asset_copy($copy) or return $e->event;
		}
	}

	$hold->cancel_time('now');
	$e->update_action_hold_request($hold)
		or return $e->event;

	$e->commit;
	return 1;
}


__PACKAGE__->register_method(
	method	=> "update_hold",
	api_name	=> "open-ils.circ.hold.update",
	notes		=> <<"	NOTE");
	Updates the specified hold.  The login session
	is the requestor and if the requestor is different from the usr field
	on the hold, the requestor must have UPDATE_HOLDS permissions.
	NOTE

sub update_hold {
	my($self, $client, $login_session, $hold) = @_;

	my( $requestor, $target, $evt ) = $apputils->checkses_requestor(
		$login_session, $hold->usr, 'UPDATE_HOLD' );
	return $evt if $evt;

	$logger->activity('User ' . $requestor->id . 
		' updating hold ' . $hold->id . ' for user ' . $target->id );

	return $U->storagereq(
		"open-ils.storage.direct.action.hold_request.update", $hold );
}


__PACKAGE__->register_method(
	method	=> "retrieve_hold_status",
	api_name	=> "open-ils.circ.hold.status.retrieve",
	notes		=> <<"	NOTE");
	Calculates the current status of the hold.
	the requestor must have VIEW_HOLD permissions if the hold is for a user
	other than the requestor.
	Returns -1  on error (for now)
	Returns 1 for 'waiting for copy to become available'
	Returns 2 for 'waiting for copy capture'
	Returns 3 for 'in transit'
	Returns 4 for 'arrived'
	NOTE

sub retrieve_hold_status {
	my($self, $client, $login_session, $hold_id) = @_;


	my( $requestor, $target, $hold, $copy, $transit, $evt );

	( $hold, $evt ) = $apputils->fetch_hold($hold_id);
	return $evt if $evt;

	( $requestor, $target, $evt ) = $apputils->checkses_requestor(
		$login_session, $hold->usr, 'VIEW_HOLD' );
	return $evt if $evt;

	return 1 unless (defined($hold->current_copy));
	
	( $copy, $evt ) = $apputils->fetch_copy($hold->current_copy);
	return $evt if $evt;

	return 4 if ($hold->capture_time and $copy->circ_lib eq $hold->pickup_lib);

	( $transit, $evt ) = $apputils->fetch_hold_transit_by_hold( $hold->id );
	return 4 if(ref($transit) and defined($transit->dest_recv_time) ); 

	return 3 if defined($hold->capture_time);

	return 2;
}





=head DEPRECATED
__PACKAGE__->register_method(
	method	=> "capture_copy",
	api_name	=> "open-ils.circ.hold.capture_copy.barcode",
	notes		=> <<"	NOTE");
	Captures a copy to fulfil a hold
	Params is login session and copy barcode
	Optional param is 'flesh'.  If set, we also return the
	relevant copy and title
	login mus have COPY_CHECKIN permissions (since this is essentially
	copy checkin)
	NOTE

# XXX deprecate me XXX

sub capture_copy {
	my( $self, $client, $login_session, $params ) = @_;
	my %params = %$params;
	my $barcode = $params{barcode};


	my( $user, $target, $copy, $hold, $evt );

	( $user, $evt ) = $apputils->checkses($login_session);
	return $evt if $evt;

	# am I allowed to checkin a copy?
	$evt = $apputils->check_perms($user->id, $user->home_ou, "COPY_CHECKIN");
	return $evt if $evt;

	$logger->info("Capturing copy with barcode $barcode");

	my $session = $apputils->start_db_session();

	($copy, $evt) = $apputils->fetch_copy_by_barcode($barcode);
	return $evt if $evt;

	$logger->debug("Capturing copy " . $copy->id);

	#( $hold, $evt ) = _find_local_hold_for_copy($session, $copy, $user);
	( $hold, $evt ) = $self->find_nearest_permitted_hold($session, $copy, $user);
	return $evt if $evt;

	warn "Found hold " . $hold->id . "\n";
	$logger->info("We found a hold " .$hold->id. "for capturing copy with barcode $barcode");

	$hold->current_copy($copy->id);
	$hold->capture_time("now"); 

	#update the hold
	my $stat = $session->request(
			"open-ils.storage.direct.action.hold_request.update", $hold)->gather(1);
	if(!$stat) { throw OpenSRF::EX::ERROR 
		("Error updating hold request " . $copy->id); }

	$copy->status(OILS_COPY_STATUS_ON_HOLDS_SHELF); #status on holds shelf

	# if the staff member capturing this item is not at the pickup lib
	if( $user->home_ou ne $hold->pickup_lib ) {
		$self->_build_hold_transit( $login_session, $session, $hold, $user, $copy );
	}

	$copy->editor($user->id);
	$copy->edit_date("now");
	$stat = $session->request(
		"open-ils.storage.direct.asset.copy.update", $copy )->gather(1);
	if(!$stat) { throw OpenSRF::EX ("Error updating copy " . $copy->id); }

	my $payload = { hold => $hold };
	$payload->{copy} = $copy if $params{flesh_copy};

	if($params{flesh_record}) {
		my $record;
		($record, $evt) = $apputils->fetch_record_by_copy( $copy->id );
		return $evt if $evt;
		$record = $apputils->record_to_mvr($record);
		$payload->{record} = $record;
	}

	$apputils->commit_db_session($session);

	return OpenILS::Event->new('ROUTE_ITEM', 
		route_to => $hold->pickup_lib, payload => $payload );
}

sub _build_hold_transit {
	my( $self, $login_session, $session, $hold, $user, $copy ) = @_;
	my $trans = Fieldmapper::action::hold_transit_copy->new;

	$trans->hold($hold->id);
	$trans->source($user->home_ou);
	$trans->dest($hold->pickup_lib);
	$trans->source_send_time("now");
	$trans->target_copy($copy->id);
	$trans->copy_status($copy->status);

	my $meth = $self->method_lookup("open-ils.circ.hold_transit.create");
	my ($stat) = $meth->run( $login_session, $trans, $session );
	if(!$stat) { throw OpenSRF::EX ("Error creating new hold transit"); }
	else { $copy->status(6); } #status in transit 
}



__PACKAGE__->register_method(
	method	=> "create_hold_transit",
	api_name	=> "open-ils.circ.hold_transit.create",
	notes		=> <<"	NOTE");
	Creates a new transit object
	NOTE

sub create_hold_transit {
	my( $self, $client, $login_session, $transit, $session ) = @_;

	my( $user, $evt ) = $apputils->checkses($login_session);
	return $evt if $evt;
	$evt = $apputils->check_perms($user->id, $user->home_ou, "CREATE_TRANSIT");
	return $evt if $evt;

	my $ses;
	if($session) { $ses = $session; } 
	else { $ses = OpenSRF::AppSession->create("open-ils.storage"); }

	return $ses->request(
		"open-ils.storage.direct.action.hold_transit_copy.create", $transit )->gather(1);
}

=cut


sub find_local_hold {
	my( $class, $session, $copy, $user ) = @_;
	return $class->find_nearest_permitted_hold($session, $copy, $user);
}






sub fetch_open_hold_by_current_copy {
	my $class = shift;
	my $copyid = shift;
	my $hold = $apputils->simplereq(
		'open-ils.cstore', 
		'open-ils.cstore.direct.action.hold_request.search.atomic',
		{ current_copy =>  $copyid , cancel_time => undef, fulfillment_time => undef });
	return $hold->[0] if ref($hold);
	return undef;
}

sub fetch_related_holds {
	my $class = shift;
	my $copyid = shift;
	return $apputils->simplereq(
		'open-ils.cstore', 
		'open-ils.cstore.direct.action.hold_request.search.atomic',
		{ current_copy =>  $copyid , cancel_time => undef, fulfillment_time => undef });
}


__PACKAGE__->register_method (
	method		=> "hold_pull_list",
	api_name		=> "open-ils.circ.hold_pull_list.retrieve",
	signature	=> q/
		Returns a list of hold ID's that need to be "pulled"
		by a given location
	/
);

sub hold_pull_list {
	my( $self, $conn, $authtoken, $limit, $offset ) = @_;
	my( $reqr, $evt ) = $U->checkses($authtoken);
	return $evt if $evt;

	my $org = $reqr->ws_ou || $reqr->home_ou;
	# the perm locaiton shouldn't really matter here since holds
	# will exist all over and VIEW_HOLDS should be universal
	$evt = $U->check_perms($reqr->id, $org, 'VIEW_HOLD');
	return $evt if $evt;

	return $U->storagereq(
		'open-ils.storage.direct.action.hold_request.pull_list.search.current_copy_circ_lib.atomic',
		$org, $limit, $offset ); 
}

__PACKAGE__->register_method (
	method		=> 'fetch_hold_notify',
	api_name		=> 'open-ils.circ.hold_notification.retrieve_by_hold',
	signature	=> q/ 
		Returns a list of hold notification objects based on hold id.
		@param authtoken The loggin session key
		@param holdid The id of the hold whose notifications we want to retrieve
		@return An array of hold notification objects, event on error.
	/
);

sub fetch_hold_notify {
	my( $self, $conn, $authtoken, $holdid ) = @_;
	my( $requestor, $evt ) = $U->checkses($authtoken);
	return $evt if $evt;
	my ($hold, $patron);
	($hold, $evt) = $U->fetch_hold($holdid);
	return $evt if $evt;
	($patron, $evt) = $U->fetch_user($hold->usr);
	return $evt if $evt;

	$evt = $U->check_perms($requestor->id, $patron->home_ou, 'VIEW_HOLD_NOTIFICATION');
	return $evt if $evt;

	$logger->info("User ".$requestor->id." fetching hold notifications for hold $holdid");
	return $U->cstorereq(
		'open-ils.cstore.direct.action.hold_notification.search.atomic', {hold => $holdid} );
}


__PACKAGE__->register_method (
	method		=> 'create_hold_notify',
	api_name		=> 'open-ils.circ.hold_notification.create',
	signature	=> q/
		Creates a new hold notification object
		@param authtoken The login session key
		@param notification The hold notification object to create
		@return ID of the new object on success, Event on error
		/
);
sub create_hold_notify {
	my( $self, $conn, $authtoken, $notification ) = @_;
	my( $requestor, $evt ) = $U->checkses($authtoken);
	return $evt if $evt;
	my ($hold, $patron);
	($hold, $evt) = $U->fetch_hold($notification->hold);
	return $evt if $evt;
	($patron, $evt) = $U->fetch_user($hold->usr);
	return $evt if $evt;

	# XXX perm depth probably doesn't matter here -- should always be consortium level
	$evt = $U->check_perms($requestor->id, $patron->home_ou, 'CREATE_HOLD_NOTIFICATION');
	return $evt if $evt;

	# Set the proper notifier 
	$notification->notify_staff($requestor->id);
	my $id = $U->storagereq(
		'open-ils.storage.direct.action.hold_notification.create', $notification );
	return $U->DB_UPDATE_FAILED($notification) unless $id;
	$logger->info("User ".$requestor->id." successfully created new hold notification $id");
	return $id;
}


__PACKAGE__->register_method(
	method	=> 'reset_hold',
	api_name	=> 'open-ils.circ.hold.reset',
	signature	=> q/
		Un-captures and un-targets a hold, essentially returning
		it to the state it was in directly after it was placed,
		then attempts to re-target the hold
		@param authtoken The login session key
		@param holdid The id of the hold
	/
);


sub reset_hold {
	my( $self, $conn, $auth, $holdid ) = @_;
	my $reqr;
	my ($hold, $evt) = $U->fetch_hold($holdid);
	return $evt if $evt;
	($reqr, $evt) = $U->checksesperm($auth, 'UPDATE_HOLD'); # XXX stronger permission
	return $evt if $evt;
	$evt = $self->_reset_hold($reqr, $hold);
	return $evt if $evt;
	return 1;
}

sub _reset_hold {
	my ($self, $reqr, $hold, $session) = @_;

	my $x;
	if(!$session) {
		$x = 1;
		$session = $U->start_db_session();
	}

	$hold->clear_capture_time;
	$hold->clear_current_copy;

	return $U->DB_UPDATE_FAILED($hold) unless 
		$session->request(
			'open-ils.storage.direct.action.hold_request.update', $hold )->gather(1);

	$session->request(
		'open-ils.storage.action.hold_request.copy_targeter', undef, $hold->id )->gather(1);

	$U->commit_db_session($session) unless $x;
	return undef;
}


__PACKAGE__->register_method(
	method => 'fetch_open_title_holds',
	api_name	=> 'open-ils.circ.open_holds.retrieve',
	signature	=> q/
		Returns a list ids of un-fulfilled holds for a given title id
		@param authtoken The login session key
		@param id the id of the item whose holds we want to retrieve
		@param type The hold type - M, T, V, C
	/
);

sub fetch_open_title_holds {
	my( $self, $conn, $auth, $id, $type, $org ) = @_;
	my $e = new_editor( authtoken => $auth );
	return $e->event unless $e->checkauth;

	$type ||= "T";
	$org ||= $e->requestor->ws_ou;

#	return $e->search_action_hold_request(
#		{ target => $id, hold_type => $type, fulfillment_time => undef }, {idlist=>1});

	# XXX make me return IDs in the future ^--
	return $e->search_action_hold_request(
		{ target => $id, cancel_time => undef, hold_type => $type, fulfillment_time => undef });
}




__PACKAGE__->register_method(
	method => 'fetch_captured_holds',
	api_name	=> 'open-ils.circ.captured_holds.on_shelf.retrieve',
	signature	=> q/
		Returns a list ids of un-fulfilled holds for a given title id
		@param authtoken The login session key
		@param org The org id of the location in question
	/
);
sub fetch_captured_holds {
	my( $self, $conn, $auth, $org ) = @_;

	my $e = new_editor(authtoken => $auth);
	return $e->event unless $e->checkauth;
	return $e->event unless $e->allowed('VIEW_HOLD'); # XXX rely on editor perm

	$org ||= $e->requestor->ws_ou;

	my $holds = $e->search_action_hold_request(
		{ 
			capture_time		=> { "!=" => undef },
			current_copy		=> { "!=" => undef },
			fulfillment_time	=> undef,
			pickup_lib			=> $org,
			cancel_time			=> undef,
		}
	);

	my @res;
	my $stat = OILS_COPY_STATUS_ON_HOLDS_SHELF;
	for my $h (@$holds) {
		my $copy = $e->retrieve_asset_copy($h->current_copy)
			or return $e->event;
		push( @res, $h ) if $copy->status == $stat->id; # eventually, push IDs here
	}

	return \@res;
}





__PACKAGE__->register_method(
	method	=> "check_title_hold",
	api_name	=> "open-ils.circ.title_hold.is_possible",
	notes		=> q/
		Determines if a hold were to be placed by a given user,
		whether or not said hold would have any potential copies
		to fulfill it.
		@param authtoken The login session key
		@param params A hash of named params including:
			patronid  - the id of the hold recipient
			titleid (brn) - the id of the title to be held
			depth	- the hold range depth (defaults to 0)
	/);

sub check_title_hold {
	my( $self, $client, $authtoken, $params ) = @_;

	my %params		= %$params;
	my $titleid		= $params{titleid} ||"";
	my $mrid			= $params{mrid} ||"";
	my $depth		= $params{depth} || 0;
	my $pickup_lib	= $params{pickup_lib};
	my $hold_type	= $params{hold_type} || 'T';

	my $e = new_editor(authtoken=>$authtoken);
	return $e->event unless $e->checkauth;
	my $patron = $e->retrieve_actor_user($params{patronid})
		or return $e->event;
	return $e->event unless $e->allowed('VIEW_HOLD_PERMIT', $patron->home_ou);

	return OpenILS::Event->new('PATRON_BARRED') 
		if $patron->barred and 
			($patron->barred =~ /t/i or $patron->barred == 1);

	my $rangelib	= $params{range_lib} || $patron->home_ou;

	my $request_lib = $e->retrieve_actor_org_unit($e->requestor->ws_ou)
		or return $e->event;

	if( $hold_type eq 'T' ) {
		return _check_title_hold_is_possible(
			$titleid, $rangelib, $depth, $request_lib, $patron, $e->requestor, $pickup_lib);
	}

	if( $hold_type eq 'M' ) {
		my $maps = $e->search_metabib_source_map({metarecord=>$mrid});
		my @recs = map { $_->source } @$maps;
		for my $rec (@recs) {
			return 1 if (_check_title_hold_is_possible(
				$rec, $rangelib, $depth, $request_lib, $patron, $e->requestor, $pickup_lib));
		}
	}
}



sub _check_title_hold_is_possible {
	my( $titleid, $rangelib, $depth, $request_lib, $patron, $requestor, $pickup_lib ) = @_;

	my $limit	= 10;
	my $offset	= 0;
	my $title;

	$logger->debug("Fetching ranged title tree for title $titleid, org $rangelib, depth $depth");

	while( $title = $U->storagereq(
				'open-ils.storage.biblio.record_entry.ranged_tree', 
				$titleid, $rangelib, $depth, $limit, $offset ) ) {

		last unless 
			ref($title) and 
			ref($title->call_numbers) and 
			@{$title->call_numbers};

		for my $cn (@{$title->call_numbers}) {
	
			$logger->debug("Checking callnumber ".$cn->id." for hold fulfillment possibility");
	
			for my $copy (@{$cn->copies}) {
	
				$logger->debug("Checking copy ".$copy->id." for hold fulfillment possibility");
	
				return 1 if OpenILS::Utils::PermitHold::permit_copy_hold(
					{	patron				=> $patron, 
						requestor			=> $requestor, 
						copy					=> $copy,
						title					=> $title, 
						title_descriptor	=> $title->fixed_fields, # this is fleshed into the title object
						pickup_lib			=> $pickup_lib,
						request_lib			=> $request_lib 
					} 
				);
	
				$logger->debug("Copy ".$copy->id." for hold fulfillment possibility failed...");
			}
		}

		$offset += $limit;
	}
	return 0;
}



sub find_nearest_permitted_hold {

	my $class	= shift;
	my $session = shift;
	my $copy		= shift;
	my $user		= shift;
	my $evt		= OpenILS::Event->new('ACTION_HOLD_REQUEST_NOT_FOUND');

	# first see if this copy has already been selected to fulfill a hold
	my $hold  = $session->request(
		"open-ils.storage.direct.action.hold_request.search_where",
		{ current_copy => $copy->id, cancel_time => undef, capture_time => undef } )->gather(1);

	if( $hold ) {
		$logger->info("hold found which can be fulfilled by copy ".$copy->id);
		return $hold;
	}

	# We know this hold is permitted, so just return it
	return $hold if $hold;

	$logger->debug("searching for potential holds at org ". 
		$user->ws_ou." and copy ".$copy->id);

	my $holds = $session->request(
		"open-ils.storage.action.hold_request.nearest_hold.atomic",
		$user->ws_ou, $copy->id, 5 )->gather(1);

	return (undef, $evt) unless @$holds;

	# for each potential hold, we have to run the permit script
	# to make sure the hold is actually permitted.

	for my $holdid (@$holds) {
		next unless $holdid;
		$logger->info("Checking if hold $holdid is permitted for user ".$user->id);

		my ($hold) = $U->fetch_hold($holdid);
		next unless $hold;
		my ($reqr) = $U->fetch_user($hold->requestor);

		return ($hold) if OpenILS::Utils::PermitHold::permit_copy_hold(
			{
				patron_id			=> $hold->usr,
				requestor			=> $reqr->id,
				copy					=> $copy,
				pickup_lib			=> $hold->pickup_lib,
				request_lib			=> $hold->request_lib 
			} 
		);
	}

	return (undef, $evt);
}


#__PACKAGE__->register_method(
#);





1;
