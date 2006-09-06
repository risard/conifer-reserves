package OpenILS::Application::Actor;
use base qw/OpenSRF::Application/;
use strict; use warnings;
use Data::Dumper;
$Data::Dumper::Indent = 0;
use OpenILS::Event;

use Digest::MD5 qw(md5_hex);

use OpenSRF::EX qw(:try);
use OpenILS::Perm;

use OpenILS::Application::AppUtils;

use OpenILS::Utils::Fieldmapper;
use OpenILS::Utils::ModsParser;
use OpenSRF::Utils::Logger qw/$logger/;
use OpenSRF::Utils qw/:datetime/;

use OpenSRF::Utils::Cache;

use JSON;
use DateTime;
use DateTime::Format::ISO8601;
use OpenILS::Const qw/:const/;

use OpenILS::Application::Actor::Container;
use OpenILS::Application::Actor::ClosedDates;

use OpenILS::Utils::CStoreEditor qw/:funcs/;

use OpenILS::Application::Actor::UserGroups;
sub initialize {
	OpenILS::Application::Actor::Container->initialize();
	OpenILS::Application::Actor::UserGroups->initialize();
	OpenILS::Application::Actor::ClosedDates->initialize();
}

my $apputils = "OpenILS::Application::AppUtils";
my $U = $apputils;

sub _d { warn "Patron:\n" . Dumper(shift()); }

my $cache;


my $set_user_settings;
my $set_ou_settings;

__PACKAGE__->register_method(
	method	=> "set_user_settings",
	api_name	=> "open-ils.actor.patron.settings.update",
);
sub set_user_settings {
	my( $self, $client, $user_session, $uid, $settings ) = @_;
	
	$logger->debug("Setting user settings: $user_session, $uid, " . Dumper($settings));

	my( $staff, $user, $evt ) = 
		$apputils->checkses_requestor( $user_session, $uid, 'UPDATE_USER' );	
	return $evt if $evt;
	
	my @params = map { 
		[{ usr => $user->id, name => $_}, {value => $$settings{$_}}] } keys %$settings;
		
	$_->[1]->{value} = JSON->perl2JSON($_->[1]->{value}) for @params;

	$logger->activity("User " . $staff->id . " updating user $uid settings with: " . Dumper(\@params));

	my $ses = $U->start_db_session();
	my $stat = $ses->request(
		'open-ils.storage.direct.actor.user_setting.batch.merge', @params )->gather(1);
	$U->commit_db_session($ses);

	return $stat;
}



__PACKAGE__->register_method(
	method	=> "set_ou_settings",
	api_name	=> "open-ils.actor.org_unit.settings.update",
);
sub set_ou_settings {
	my( $self, $client, $user_session, $ouid, $settings ) = @_;
	
	my( $staff, $evt ) = $apputils->checkses( $user_session );
	return $evt if $evt;
	$evt = $apputils->check_perms( $staff->id, $ouid, 'UPDATE_ORG_SETTING' );
	return $evt if $evt;

	my @params;
	for my $set (keys %$settings) {

		my $json = JSON->perl2JSON($$settings{$set});
		$logger->activity("updating org_unit.setting: $ouid : $set : $json");

		push( @params, 
			{ org_unit => $ouid, name => $set }, 
			{ value => $json } );
	}

	my $ses = $U->start_db_session();
	my $stat = $ses->request(
		'open-ils.storage.direct.actor.org_unit_setting.merge', @params )->gather(1);
	$U->commit_db_session($ses);

	return $stat;
}


my $fetch_user_settings;
my $fetch_ou_settings;

__PACKAGE__->register_method(
	method	=> "user_settings",
	api_name	=> "open-ils.actor.patron.settings.retrieve",
);
sub user_settings {
	my( $self, $client, $user_session, $uid ) = @_;
	
	my( $staff, $user, $evt ) = 
		$apputils->checkses_requestor( $user_session, $uid, 'VIEW_USER' );
	return $evt if $evt;

	$logger->debug("User " . $staff->id . " fetching user $uid\n");
	my $s = $apputils->simplereq(
		'open-ils.cstore',
		'open-ils.cstore.direct.actor.user_setting.search.atomic', { usr => $uid } );

	return { map { ( $_->name => JSON->JSON2perl($_->value) ) } @$s };
}



__PACKAGE__->register_method(
	method	=> "ou_settings",
	api_name	=> "open-ils.actor.org_unit.settings.retrieve",
);
sub ou_settings {
	my( $self, $client, $ouid ) = @_;
	
	$logger->info("Fetching org unit settings for org $ouid");

	my $s = $apputils->simplereq(
		'open-ils.cstore',
		'open-ils.cstore.direct.actor.org_unit_setting.search.atomic', {org_unit => $ouid});

	return { map { ( $_->name => JSON->JSON2perl($_->value) ) } @$s };
}

__PACKAGE__->register_method (
	method		=> "ou_setting_delete",
	api_name		=> 'open-ils.actor.org_setting.delete',
	signature	=> q/
		Deletes a specific org unit setting for a specific location
		@param authtoken The login session key
		@param orgid The org unit whose setting we're changing
		@param setting The name of the setting to delete
		@return True value on success.
	/
);

sub ou_setting_delete {
	my( $self, $conn, $authtoken, $orgid, $setting ) = @_;
	my( $reqr, $evt) = $U->checkses($authtoken);
	return $evt if $evt;
	$evt = $U->check_perms($reqr->id, $orgid, 'UPDATE_ORG_SETTING');
	return $evt if $evt;

	my $id = $U->cstorereq(
		'open-ils.cstore.direct.actor.org_unit_setting.id_list', 
		{ name => $setting, org_unit => $orgid } );

	$logger->debug("Retrieved setting $id in org unit setting delete");

	my $s = $U->cstorereq(
		'open-ils.cstore.direct.actor.org_unit_setting.delete', $id );

	$logger->activity("User ".$reqr->id." deleted org unit setting $id") if $s;
	return $s;
}



__PACKAGE__->register_method(
	method	=> "update_patron",
	api_name	=> "open-ils.actor.patron.update",);

sub update_patron {
	my( $self, $client, $user_session, $patron ) = @_;

	my $session = $apputils->start_db_session();
	my $err = undef;

	$logger->info("Creating new patron...") if $patron->isnew; 
	$logger->info("Updating Patron: " . $patron->id) unless $patron->isnew;

	my( $user_obj, $evt ) = $U->checkses($user_session);
	return $evt if $evt;

	# XXX does this user have permission to add/create users.  Granularity?
	# $new_patron is the patron in progress.  $patron is the original patron
	# passed in with the method.  new_patron will change as the components
	# of patron are added/updated.

	my $new_patron;

	# unflesh the real items on the patron
	$patron->card( $patron->card->id ) if(ref($patron->card));
	$patron->billing_address( $patron->billing_address->id ) 
		if(ref($patron->billing_address));
	$patron->mailing_address( $patron->mailing_address->id ) 
		if(ref($patron->mailing_address));

	# create/update the patron first so we can use his id
	if($patron->isnew()) {
		( $new_patron, $evt ) = _add_patron($session, _clone_patron($patron), $user_obj);
		return $evt if $evt;
	} else { $new_patron = $patron; }

	( $new_patron, $evt ) = _add_update_addresses($session, $patron, $new_patron, $user_obj);
	return $evt if $evt;

	( $new_patron, $evt ) = _add_update_cards($session, $patron, $new_patron, $user_obj);
	return $evt if $evt;

	( $new_patron, $evt ) = _add_survey_responses($session, $patron, $new_patron, $user_obj);
	return $evt if $evt;

	# re-update the patron if anything has happened to him during this process
	if($new_patron->ischanged()) {
		( $new_patron, $evt ) = _update_patron($session, $new_patron, $user_obj);
		return $evt if $evt;
	}

	#$session = OpenSRF::AppSession->create("open-ils.storage");  # why did i put this here?

	($new_patron, $evt) = _create_stat_maps($session, $user_session, $patron, $new_patron, $user_obj);
	return $evt if $evt;

	($new_patron, $evt) = _create_perm_maps($session, $user_session, $patron, $new_patron, $user_obj);
	return $evt if $evt;

	($new_patron, $evt) = _create_standing_penalties($session, $user_session, $patron, $new_patron, $user_obj);
	return $evt if $evt;

	$logger->activity("user ".$user_obj->id." updating/creating  user ".$new_patron->id);

	my $opatron;
	if(!$patron->isnew) {
		$opatron = new_editor()->retrieve_actor_user($new_patron->id);
	}

	$apputils->commit_db_session($session);
	my $fuser =  flesh_user($new_patron->id());

	if( $opatron ) {
		# Log the new and old patron for investigation
		$logger->info("$user_session updating patron object. orig patron object = ".
			JSON->perl2JSON($opatron). " |||| new patron = ".JSON->perl2JSON($fuser));
	}


	return $fuser;
}


sub flesh_user {
	my $id = shift;
	return new_flesh_user($id, [
		"cards",
		"card",
		"standing_penalties",
		"addresses",
		"billing_address",
		"mailing_address",
		"stat_cat_entries" ] );
}






# clone and clear stuff that would break the database
sub _clone_patron {
	my $patron = shift;

	my $new_patron = $patron->clone;
	# clear these
	$new_patron->clear_billing_address();
	$new_patron->clear_mailing_address();
	$new_patron->clear_addresses();
	$new_patron->clear_card();
	$new_patron->clear_cards();
	$new_patron->clear_id();
	$new_patron->clear_isnew();
	$new_patron->clear_ischanged();
	$new_patron->clear_isdeleted();
	$new_patron->clear_stat_cat_entries();
	$new_patron->clear_permissions();
	$new_patron->clear_standing_penalties();

	return $new_patron;
}


sub _add_patron {

	my $session		= shift;
	my $patron		= shift;
	my $user_obj	= shift;

	my $evt = $U->check_perms($user_obj->id, $patron->home_ou, 'CREATE_USER');
	return (undef, $evt) if $evt;

	my $ex = $session->request(
		'open-ils.storage.direct.actor.user.search.usrname', $patron->usrname())->gather(1);
	if( $ex and @$ex ) {
		return (undef, OpenILS::Event->new('USERNAME_EXISTS'));
	}

	$logger->info("Creating new user in the DB with username: ".$patron->usrname());

	my $id = $session->request(
		"open-ils.storage.direct.actor.user.create", $patron)->gather(1);
	return (undef, $U->DB_UPDATE_FAILED($patron)) unless $id;

	$logger->info("Successfully created new user [$id] in DB");

	return ( $session->request( 
		"open-ils.storage.direct.actor.user.retrieve", $id)->gather(1), undef );
}


sub _update_patron {
	my( $session, $patron, $user_obj, $noperm) = @_;

	$logger->info("Updating patron ".$patron->id." in DB");

	my $evt;

	if(!$noperm) {
		$evt = $U->check_perms($user_obj->id, $patron->home_ou, 'UPDATE_USER');
		return (undef, $evt) if $evt;
	}

	# update the password by itself to avoid the password protection magic
	if( $patron->passwd ) {
		my $s = $session->request(
			'open-ils.storage.direct.actor.user.remote_update',
			{id => $patron->id}, {passwd => $patron->passwd})->gather(1);
		return (undef, $U->DB_UPDATE_FAILED($patron)) unless defined($s);
		$patron->clear_passwd;
	}

	if(!$patron->ident_type) {
		$patron->clear_ident_type;
		$patron->clear_ident_value;
	}

	my $stat = $session->request(
		"open-ils.storage.direct.actor.user.update",$patron )->gather(1);
	return (undef, $U->DB_UPDATE_FAILED($patron)) unless defined($stat);

	return ($patron);
}

sub _check_dup_ident {
	my( $session, $patron ) = @_;

	return undef unless $patron->ident_value;

	my $search = {
		ident_type	=> $patron->ident_type, 
		ident_value => $patron->ident_value,
	};

	$logger->debug("patron update searching for dup ident values: " . 
		$patron->ident_type . ':' . $patron->ident_value);

	$search->{id} = {'!=' => $patron->id} if $patron->id and $patron->id > 0;

	my $dups = $session->request(
		'open-ils.storage.direct.actor.user.search_where.atomic', $search )->gather(1);


	return OpenILS::Event->new('PATRON_DUP_IDENT1', payload => $patron )
		if $dups and @$dups;

	return undef;
}


sub _add_update_addresses {

	my $session = shift;
	my $patron = shift;
	my $new_patron = shift;

	my $evt;

	my $current_id; # id of the address before creation

	for my $address (@{$patron->addresses()}) {

		next unless ref $address;
		$current_id = $address->id();

		if( $patron->billing_address() and
			$patron->billing_address() == $current_id ) {
			$logger->info("setting billing addr to $current_id");
			$new_patron->billing_address($address->id());
			$new_patron->ischanged(1);
		}
	
		if( $patron->mailing_address() and
			$patron->mailing_address() == $current_id ) {
			$new_patron->mailing_address($address->id());
			$logger->info("setting mailing addr to $current_id");
			$new_patron->ischanged(1);
		}


		if($address->isnew()) {

			$address->usr($new_patron->id());

			($address, $evt) = _add_address($session,$address);
			return (undef, $evt) if $evt;

			# we need to get the new id
			if( $patron->billing_address() and 
					$patron->billing_address() == $current_id ) {
				$new_patron->billing_address($address->id());
				$logger->info("setting billing addr to $current_id");
				$new_patron->ischanged(1);
			}

			if( $patron->mailing_address() and
					$patron->mailing_address() == $current_id ) {
				$new_patron->mailing_address($address->id());
				$logger->info("setting mailing addr to $current_id");
				$new_patron->ischanged(1);
			}

		} elsif($address->ischanged() ) {

			($address, $evt) = _update_address($session, $address);
			return (undef, $evt) if $evt;

		} elsif($address->isdeleted() ) {

			if( $address->id() == $new_patron->mailing_address() ) {
				$new_patron->clear_mailing_address();
				($new_patron, $evt) = _update_patron($session, $new_patron);
				return (undef, $evt) if $evt;
			}

			if( $address->id() == $new_patron->billing_address() ) {
				$new_patron->clear_billing_address();
				($new_patron, $evt) = _update_patron($session, $new_patron);
				return (undef, $evt) if $evt;
			}

			$evt = _delete_address($session, $address);
			return (undef, $evt) if $evt;
		} 
	}

	return ( $new_patron, undef );
}


# adds an address to the db and returns the address with new id
sub _add_address {
	my($session, $address) = @_;
	$address->clear_id();

	$logger->info("Creating new address at street ".$address->street1);

	# put the address into the database
	my $id = $session->request(
		"open-ils.storage.direct.actor.user_address.create", $address )->gather(1);
	return (undef, $U->DB_UPDATE_FAILED($address)) unless $id;

	$address->id( $id );
	return ($address, undef);
}


sub _update_address {
	my( $session, $address ) = @_;

	$logger->info("Updating address ".$address->id." in the DB");

	my $stat = $session->request(
		"open-ils.storage.direct.actor.user_address.update", $address )->gather(1);

	return (undef, $U->DB_UPDATE_FAILED($address)) unless defined($stat);
	return ($address, undef);
}



sub _add_update_cards {

	my $session = shift;
	my $patron = shift;
	my $new_patron = shift;

	my $evt;

	my $virtual_id; #id of the card before creation
	for my $card (@{$patron->cards()}) {

		$card->usr($new_patron->id());

		if(ref($card) and $card->isnew()) {

			$virtual_id = $card->id();
			( $card, $evt ) = _add_card($session,$card);
			return (undef, $evt) if $evt;

			#if(ref($patron->card)) { $patron->card($patron->card->id); }
			if($patron->card() == $virtual_id) {
				$new_patron->card($card->id());
				$new_patron->ischanged(1);
			}

		} elsif( ref($card) and $card->ischanged() ) {
			$evt = _update_card($session, $card);
			return (undef, $evt) if $evt;
		}
	}

	return ( $new_patron, undef );
}


# adds an card to the db and returns the card with new id
sub _add_card {
	my( $session, $card ) = @_;
	$card->clear_id();

	$logger->info("Adding new patron card ".$card->barcode);

	my $id = $session->request(
		"open-ils.storage.direct.actor.card.create", $card )->gather(1);
	return (undef, $U->DB_UPDATE_FAILED($card)) unless $id;
	$logger->info("Successfully created patron card $id");

	$card->id($id);
	return ( $card, undef );
}


# returns event on error.  returns undef otherwise
sub _update_card {
	my( $session, $card ) = @_;
	$logger->info("Updating patron card ".$card->id);

	my $stat = $session->request(
		"open-ils.storage.direct.actor.card.update", $card )->gather(1);
	return $U->DB_UPDATE_FAILED($card) unless defined($stat);
	return undef;
}




# returns event on error.  returns undef otherwise
sub _delete_address {
	my( $session, $address ) = @_;

	$logger->info("Deleting address ".$address->id." from DB");

	my $stat = $session->request(
		"open-ils.storage.direct.actor.user_address.delete", $address )->gather(1);

	return $U->DB_UPDATE_FAILED($address) unless defined($stat);
	return undef;
}



sub _add_survey_responses {
	my ($session, $patron, $new_patron) = @_;

	$logger->info( "Updating survey responses for patron ".$new_patron->id );

	my $responses = $patron->survey_responses;

	if($responses) {

		$_->usr($new_patron->id) for (@$responses);

		my $evt = $U->simplereq( "open-ils.circ", 
			"open-ils.circ.survey.submit.user_id", $responses );

		return (undef, $evt) if defined($U->event_code($evt));

	}

	return ( $new_patron, undef );
}


sub _create_stat_maps {

	my($session, $user_session, $patron, $new_patron) = @_;

	my $maps = $patron->stat_cat_entries();

	for my $map (@$maps) {

		my $method = "open-ils.storage.direct.actor.stat_cat_entry_user_map.update";

		if ($map->isdeleted()) {
			$method = "open-ils.storage.direct.actor.stat_cat_entry_user_map.delete";

		} elsif ($map->isnew()) {
			$method = "open-ils.storage.direct.actor.stat_cat_entry_user_map.create";
			$map->clear_id;
		}


		$map->target_usr($new_patron->id);

		#warn "
		$logger->info("Updating stat entry with method $method and map $map");

		my $stat = $session->request($method, $map)->gather(1);
		return (undef, $U->DB_UPDATE_FAILED($map)) unless defined($stat);

	}

	return ($new_patron, undef);
}

sub _create_perm_maps {

	my($session, $user_session, $patron, $new_patron) = @_;

	my $maps = $patron->permissions;

	for my $map (@$maps) {

		my $method = "open-ils.storage.direct.permission.usr_perm_map.update";
		if ($map->isdeleted()) {
			$method = "open-ils.storage.direct.permission.usr_perm_map.delete";
		} elsif ($map->isnew()) {
			$method = "open-ils.storage.direct.permission.usr_perm_map.create";
			$map->clear_id;
		}


		$map->usr($new_patron->id);

		#warn( "Updating permissions with method $method and session $user_session and map $map" );
		$logger->info( "Updating permissions with method $method and map $map" );

		my $stat = $session->request($method, $map)->gather(1);
		return (undef, $U->DB_UPDATE_FAILED($map)) unless defined($stat);

	}

	return ($new_patron, undef);
}


sub _create_standing_penalties {

	my($session, $user_session, $patron, $new_patron) = @_;

	my $maps = $patron->standing_penalties;
	my $method;

	for my $map (@$maps) {

		if ($map->isdeleted()) {
			$method = "open-ils.storage.direct.actor.user_standing_penalty.delete";
		} elsif ($map->isnew()) {
			$method = "open-ils.storage.direct.actor.user_standing_penalty.create";
			$map->clear_id;
		} else {
			next;
		}

		$map->usr($new_patron->id);

		$logger->debug( "Updating standing penalty with method $method and session $user_session and map $map" );

		my $stat = $session->request($method, $map)->gather(1);
		return (undef, $U->DB_UPDATE_FAILED($map)) unless $stat;
	}

	return ($new_patron, undef);
}



__PACKAGE__->register_method(
	method	=> "search_username",
	api_name	=> "open-ils.actor.user.search.username",
);

sub search_username {
	my($self, $client, $username) = @_;
	my $users = OpenILS::Application::AppUtils->simple_scalar_request(
			"open-ils.cstore", 
			"open-ils.cstore.direct.actor.user.search.atomic",
			{ usrname => $username }
	);
	return $users;
}




__PACKAGE__->register_method(
	method	=> "user_retrieve_by_barcode",
	api_name	=> "open-ils.actor.user.fleshed.retrieve_by_barcode",);

sub user_retrieve_by_barcode {
	my($self, $client, $user_session, $barcode) = @_;

	$logger->debug("Searching for user with barcode $barcode");
	my ($user_obj, $evt) = $apputils->checkses($user_session);
	return $evt if $evt;

	my $card = OpenILS::Application::AppUtils->simple_scalar_request(
			"open-ils.cstore", 
			"open-ils.cstore.direct.actor.card.search.atomic",
			{ barcode => $barcode }
	);

	if(!$card || !$card->[0]) {
		return OpenILS::Event->new( 'ACTOR_USER_NOT_FOUND' );
	}

	$card = $card->[0];
	my $user = flesh_user($card->usr());

	$evt = $U->check_perms($user_obj->id, $user->home_ou, 'VIEW_USER');
	return $evt if $evt;

	if(!$user) { return OpenILS::Event->new( 'ACTOR_USER_NOT_FOUND' ); }
	return $user;

}



__PACKAGE__->register_method(
	method	=> "get_user_by_id",
	api_name	=> "open-ils.actor.user.retrieve",);

sub get_user_by_id {
	my ($self, $client, $auth, $id) = @_;
	my $e = new_editor(authtoken=>$auth);
	return $e->event unless $e->checkauth;
	my $user = $e->retrieve_actor_user($id)
		or return $e->event;
	return $e->event unless $e->allowed('VIEW_USER', $user->home_ou);	
	return $user;
}



__PACKAGE__->register_method(
	method	=> "get_org_types",
	api_name	=> "open-ils.actor.org_types.retrieve",);

my $org_types;
sub get_org_types {
	my($self, $client) = @_;
	return $org_types if $org_types;
	return $org_types = new_editor()->retrieve_all_actor_org_unit_type();
}



__PACKAGE__->register_method(
	method	=> "get_user_ident_types",
	api_name	=> "open-ils.actor.user.ident_types.retrieve",
);
my $ident_types;
sub get_user_ident_types {
	return $ident_types if $ident_types;
	return $ident_types = 
		new_editor()->retrieve_all_config_identification_type();
}




__PACKAGE__->register_method(
	method	=> "get_org_unit",
	api_name	=> "open-ils.actor.org_unit.retrieve",
);

sub get_org_unit {
	my( $self, $client, $user_session, $org_id ) = @_;
	my $e = new_editor(authtoken => $user_session);
	if(!$org_id) {
		return $e->event unless $e->checkauth;
		$org_id = $e->requestor->ws_ou;
	}
	my $o = $e->retrieve_actor_org_unit($org_id)
		or return $e->event;
	return $o;
}

__PACKAGE__->register_method(
	method	=> "search_org_unit",
	api_name	=> "open-ils.actor.org_unit_list.search",
);

sub search_org_unit {

	my( $self, $client, $field, $value ) = @_;

	my $list = OpenILS::Application::AppUtils->simple_scalar_request(
		"open-ils.cstore",
		"open-ils.cstore.direct.actor.org_unit.search.atomic", 
		{ $field => $value } );

	return $list;
}


# build the org tree

__PACKAGE__->register_method(
	method	=> "get_org_tree",
	api_name	=> "open-ils.actor.org_tree.retrieve",
	argc		=> 0, 
	note		=> "Returns the entire org tree structure",
);

sub get_org_tree {
	my( $self, $client) = @_;

	$cache	= OpenSRF::Utils::Cache->new("global", 0) unless $cache;
	my $tree = $cache->get_cache('orgtree');
	return $tree if $tree;

	$tree = new_editor()->search_actor_org_unit( 
		[
			{"parent_ou" => undef },
			{
				flesh				=> 2,
				flesh_fields	=> { aou =>  ['children'] },
				order_by			=> { aou => 'name'}
			}
		]
	)->[0];

	$cache->put_cache('orgtree', $tree);
	return $tree;
}


# turns an org list into an org tree
sub build_org_tree {

	my( $self, $orglist) = @_;

	return $orglist unless ( 
			ref($orglist) and @$orglist > 1 );

	my @list = sort { 
		$a->ou_type <=> $b->ou_type ||
		$a->name cmp $b->name } @$orglist;

	for my $org (@list) {

		next unless ($org and defined($org->parent_ou));
		my ($parent) = grep { $_->id == $org->parent_ou } @list;
		next unless $parent;

		$parent->children([]) unless defined($parent->children); 
		push( @{$parent->children}, $org );
	}

	return $list[0];

}


__PACKAGE__->register_method(
	method	=> "get_org_descendants",
	api_name	=> "open-ils.actor.org_tree.descendants.retrieve"
);

# depth is optional.  org_unit is the id
sub get_org_descendants {
	my( $self, $client, $org_unit, $depth ) = @_;
	my $orglist = $apputils->simple_scalar_request(
			"open-ils.storage", 
			"open-ils.storage.actor.org_unit.descendants.atomic",
			$org_unit, $depth );
	return $self->build_org_tree($orglist);
}


__PACKAGE__->register_method(
	method	=> "get_org_ancestors",
	api_name	=> "open-ils.actor.org_tree.ancestors.retrieve"
);

# depth is optional.  org_unit is the id
sub get_org_ancestors {
	my( $self, $client, $org_unit, $depth ) = @_;
	my $orglist = $apputils->simple_scalar_request(
			"open-ils.storage", 
			"open-ils.storage.actor.org_unit.ancestors.atomic",
			$org_unit, $depth );
	return $self->build_org_tree($orglist);
}


__PACKAGE__->register_method(
	method	=> "get_standings",
	api_name	=> "open-ils.actor.standings.retrieve"
);

my $user_standings;
sub get_standings {
	return $user_standings if $user_standings;
	return $user_standings = 
		$apputils->simple_scalar_request(
			"open-ils.cstore",
			"open-ils.cstore.direct.config.standing.search.atomic",
			{ id => { "!=" => undef } }
		);
}



__PACKAGE__->register_method(
	method	=> "get_my_org_path",
	api_name	=> "open-ils.actor.org_unit.full_path.retrieve"
);

sub get_my_org_path {
	my( $self, $client, $user_session, $org_id ) = @_;
	my $user_obj = $apputils->check_user_session($user_session); 
	if(!defined($org_id)) { $org_id = $user_obj->home_ou; }

	return $apputils->simple_scalar_request(
		"open-ils.storage",
		"open-ils.storage.actor.org_unit.full_path.atomic",
		$org_id );
}


__PACKAGE__->register_method(
	method	=> "patron_adv_search",
	api_name	=> "open-ils.actor.patron.search.advanced" );
sub patron_adv_search {
	my( $self, $client, $auth, $search_hash, $search_limit, $search_sort, $include_inactive ) = @_;
	my $e = new_editor(authtoken=>$auth);
	return $e->event unless $e->checkauth;
	return $e->event unless $e->allowed('VIEW_USER');
	return $U->storagereq(
		"open-ils.storage.actor.user.crazy_search", 
		$search_hash, $search_limit, $search_sort, $include_inactive);
}



sub _verify_password {
	my($user_session, $password) = @_;
	my $user_obj = $apputils->check_user_session($user_session); 

	#grab the user with password
	$user_obj = $apputils->simple_scalar_request(
		"open-ils.cstore", 
		"open-ils.cstore.direct.actor.user.retrieve",
		$user_obj->id );

	if($user_obj->passwd eq $password) {
		return 1;
	}

	return 0;
}


__PACKAGE__->register_method(
	method	=> "update_password",
	api_name	=> "open-ils.actor.user.password.update");

__PACKAGE__->register_method(
	method	=> "update_password",
	api_name	=> "open-ils.actor.user.username.update");

__PACKAGE__->register_method(
	method	=> "update_password",
	api_name	=> "open-ils.actor.user.email.update");

sub update_password {
	my( $self, $client, $user_session, $new_value, $current_password ) = @_;

	my $evt;

	my $user_obj = $apputils->check_user_session($user_session); 

	if($self->api_name =~ /password/o) {

		#make sure they know the current password
		if(!_verify_password($user_session, md5_hex($current_password))) {
			return OpenILS::Event->new('INCORRECT_PASSWORD');
		}

		$logger->debug("update_password setting new password $new_value");
		$user_obj->passwd($new_value);

	} elsif($self->api_name =~ /username/o) {
		my $users = search_username(undef, undef, $new_value); 
		if( $users and $users->[0] ) {
			return OpenILS::Event->new('USERNAME_EXISTS');
		}
		$user_obj->usrname($new_value);

	} elsif($self->api_name =~ /email/o) {
		#warn "Updating email to $new_value\n";
		$user_obj->email($new_value);
	}

	my $session = $apputils->start_db_session();

	( $user_obj, $evt ) = _update_patron($session, $user_obj, $user_obj, 1);
	return $evt if $evt;

	$apputils->commit_db_session($session);

	if($user_obj) { return 1; }
	return undef;
}


__PACKAGE__->register_method(
	method	=> "check_user_perms",
	api_name	=> "open-ils.actor.user.perm.check",
	notes		=> <<"	NOTES");
	Takes a login session, user id, an org id, and an array of perm type strings.  For each
	perm type, if the user does *not* have the given permission it is added
	to a list which is returned from the method.  If all permissions
	are allowed, an empty list is returned
	if the logged in user does not match 'user_id', then the logged in user must
	have VIEW_PERMISSION priveleges.
	NOTES

sub check_user_perms {
	my( $self, $client, $login_session, $user_id, $org_id, $perm_types ) = @_;

	my( $staff, $evt ) = $apputils->checkses($login_session);
	return $evt if $evt;

	if($staff->id ne $user_id) {
		if( $evt = $apputils->check_perms(
			$staff->id, $org_id, 'VIEW_PERMISSION') ) {
			return $evt;
		}
	}

	my @not_allowed;
	for my $perm (@$perm_types) {
		if($apputils->check_perms($user_id, $org_id, $perm)) {
			push @not_allowed, $perm;
		}
	}

	return \@not_allowed
}

__PACKAGE__->register_method(
	method	=> "check_user_perms2",
	api_name	=> "open-ils.actor.user.perm.check.multi_org",
	notes		=> q/
		Checks the permissions on a list of perms and orgs for a user
		@param authtoken The login session key
		@param user_id The id of the user to check
		@param orgs The array of org ids
		@param perms The array of permission names
		@return An array of  [ orgId, permissionName ] arrays that FAILED the check
		if the logged in user does not match 'user_id', then the logged in user must
		have VIEW_PERMISSION priveleges.
	/);

sub check_user_perms2 {
	my( $self, $client, $authtoken, $user_id, $orgs, $perms ) = @_;

	my( $staff, $target, $evt ) = $apputils->checkses_requestor(
		$authtoken, $user_id, 'VIEW_PERMISSION' );
	return $evt if $evt;

	my @not_allowed;
	for my $org (@$orgs) {
		for my $perm (@$perms) {
			if($apputils->check_perms($user_id, $org, $perm)) {
				push @not_allowed, [ $org, $perm ];
			}
		}
	}

	return \@not_allowed
}


__PACKAGE__->register_method(
	method => 'check_user_perms3',
	api_name	=> 'open-ils.actor.user.perm.highest_org',
	notes		=> q/
		Returns the highest org unit id at which a user has a given permission
		If the requestor does not match the target user, the requestor must have
		'VIEW_PERMISSION' rights at the home org unit of the target user
		@param authtoken The login session key
		@param userid The id of the user in question
		@param perm The permission to check
		@return The org unit highest in the org tree within which the user has
		the requested permission
	/);

sub check_user_perms3 {
	my( $self, $client, $authtoken, $userid, $perm ) = @_;

	my( $staff, $target, $org, $evt );

	( $staff, $target, $evt ) = $apputils->checkses_requestor(
		$authtoken, $userid, 'VIEW_PERMISSION' );
	return $evt if $evt;

	my $tree = $self->get_org_tree();
	return _find_highest_perm_org( $perm, $userid, $target->ws_ou, $tree );
}


sub _find_highest_perm_org {
	my ( $perm, $userid, $start_org, $org_tree ) = @_;
	my $org = $apputils->find_org($org_tree, $start_org );

	my $lastid = undef;
	while( $org ) {
		last if ($apputils->check_perms( $userid, $org->id, $perm )); # perm failed
		$lastid = $org->id;
		$org = $apputils->find_org( $org_tree, $org->parent_ou() );
	}

	return $lastid;
}

__PACKAGE__->register_method(
	method => 'check_user_perms4',
	api_name	=> 'open-ils.actor.user.perm.highest_org.batch',
	notes		=> q/
		Returns the highest org unit id at which a user has a given permission
		If the requestor does not match the target user, the requestor must have
		'VIEW_PERMISSION' rights at the home org unit of the target user
		@param authtoken The login session key
		@param userid The id of the user in question
		@param perms An array of perm names to check 
		@return An array of orgId's  representing the org unit 
		highest in the org tree within which the user has the requested permission
		The arrah of orgId's has matches the order of the perms array
	/);

sub check_user_perms4 {
	my( $self, $client, $authtoken, $userid, $perms ) = @_;
	
	my( $staff, $target, $org, $evt );

	( $staff, $target, $evt ) = $apputils->checkses_requestor(
		$authtoken, $userid, 'VIEW_PERMISSION' );
	return $evt if $evt;

	my @arr;
	return [] unless ref($perms);
	my $tree = $self->get_org_tree();

	for my $p (@$perms) {
		push( @arr, _find_highest_perm_org( $p, $userid, $target->home_ou, $tree ) );
	}
	return \@arr;
}




__PACKAGE__->register_method(
	method	=> "user_fines_summary",
	api_name	=> "open-ils.actor.user.fines.summary",
	notes		=> <<"	NOTES");
	Returns a short summary of the users total open fines, excluding voided fines
	Params are login_session, user_id
	Returns a 'mous' object.
	NOTES

sub user_fines_summary {
	my( $self, $client, $login_session, $user_id ) = @_;

	my $user_obj = $apputils->check_user_session($login_session); 
	if($user_obj->id ne $user_id) {
		if($apputils->check_user_perms($user_obj->id, $user_obj->home_ou, "VIEW_USER_FINES_SUMMARY")) {
			return OpenILS::Perm->new("VIEW_USER_FINES_SUMMARY"); 
		}
	}

	return $apputils->simple_scalar_request( 
		"open-ils.cstore",
		"open-ils.cstore.direct.money.open_user_summary.search",
		{ usr => $user_id } );

}




__PACKAGE__->register_method(
	method	=> "user_transactions",
	api_name	=> "open-ils.actor.user.transactions",
	notes		=> <<"	NOTES");
	Returns a list of open user transactions (mbts objects);
	Params are login_session, user_id
	Optional third parameter is the transactions type.  defaults to all
	NOTES

__PACKAGE__->register_method(
	method	=> "user_transactions",
	api_name	=> "open-ils.actor.user.transactions.have_charge",
	notes		=> <<"	NOTES");
	Returns a list of all open user transactions (mbts objects) that have an initial charge
	Params are login_session, user_id
	Optional third parameter is the transactions type.  defaults to all
	NOTES

__PACKAGE__->register_method(
	method	=> "user_transactions",
	api_name	=> "open-ils.actor.user.transactions.have_balance",
	notes		=> <<"	NOTES");
	Returns a list of all open user transactions (mbts objects) that have a balance
	Params are login_session, user_id
	Optional third parameter is the transactions type.  defaults to all
	NOTES

__PACKAGE__->register_method(
	method	=> "user_transactions",
	api_name	=> "open-ils.actor.user.transactions.fleshed",
	notes		=> <<"	NOTES");
	Returns an object/hash of transaction, circ, title where transaction = an open 
	user transactions (mbts objects), circ is the attached circluation, and title
	is the title the circ points to
	Params are login_session, user_id
	Optional third parameter is the transactions type.  defaults to all
	NOTES

__PACKAGE__->register_method(
	method	=> "user_transactions",
	api_name	=> "open-ils.actor.user.transactions.have_charge.fleshed",
	notes		=> <<"	NOTES");
	Returns an object/hash of transaction, circ, title where transaction = an open 
	user transactions that has an initial charge (mbts objects), circ is the 
	attached circluation, and title is the title the circ points to
	Params are login_session, user_id
	Optional third parameter is the transactions type.  defaults to all
	NOTES

__PACKAGE__->register_method(
	method	=> "user_transactions",
	api_name	=> "open-ils.actor.user.transactions.have_balance.fleshed",
	notes		=> <<"	NOTES");
	Returns an object/hash of transaction, circ, title where transaction = an open 
	user transaction that has a balance (mbts objects), circ is the attached 
	circluation, and title is the title the circ points to
	Params are login_session, user_id
	Optional third parameter is the transaction type.  defaults to all
	NOTES

__PACKAGE__->register_method(
	method	=> "user_transactions",
	api_name	=> "open-ils.actor.user.transactions.count",
	notes		=> <<"	NOTES");
	Returns an object/hash of transaction, circ, title where transaction = an open 
	user transactions (mbts objects), circ is the attached circluation, and title
	is the title the circ points to
	Params are login_session, user_id
	Optional third parameter is the transactions type.  defaults to all
	NOTES

__PACKAGE__->register_method(
	method	=> "user_transactions",
	api_name	=> "open-ils.actor.user.transactions.have_charge.count",
	notes		=> <<"	NOTES");
	Returns an object/hash of transaction, circ, title where transaction = an open 
	user transactions that has an initial charge (mbts objects), circ is the 
	attached circluation, and title is the title the circ points to
	Params are login_session, user_id
	Optional third parameter is the transactions type.  defaults to all
	NOTES

__PACKAGE__->register_method(
	method	=> "user_transactions",
	api_name	=> "open-ils.actor.user.transactions.have_balance.count",
	notes		=> <<"	NOTES");
	Returns an object/hash of transaction, circ, title where transaction = an open 
	user transaction that has a balance (mbts objects), circ is the attached 
	circluation, and title is the title the circ points to
	Params are login_session, user_id
	Optional third parameter is the transaction type.  defaults to all
	NOTES

__PACKAGE__->register_method(
	method	=> "user_transactions",
	api_name	=> "open-ils.actor.user.transactions.have_balance.total",
	notes		=> <<"	NOTES");
	Returns an object/hash of transaction, circ, title where transaction = an open 
	user transaction that has a balance (mbts objects), circ is the attached 
	circluation, and title is the title the circ points to
	Params are login_session, user_id
	Optional third parameter is the transaction type.  defaults to all
	NOTES



sub user_transactions {
	my( $self, $client, $login_session, $user_id, $type ) = @_;

	my( $user_obj, $target, $evt ) = $apputils->checkses_requestor(
		$login_session, $user_id, 'VIEW_USER_TRANSACTIONS' );
	return $evt if $evt;

	my $api = $self->api_name();
	my $trans;
	my @xact;

	if(defined($type)) { @xact = (xact_type =>  $type); 

	} else { @xact = (); }

	if($api =~ /have_charge/o) {

		($trans) = $self
			->method_lookup('open-ils.actor.user.transactions.history.have_bill')
			->run($login_session => $user_id => $type);
		$trans = [ grep { int($_->total_owed * 100) > 0 } @$trans ];

	} elsif($api =~ /have_balance/o) {

		($trans) = $self
			->method_lookup('open-ils.actor.user.transactions.history.have_balance')
			->run($login_session => $user_id => $type);

	} else {

		($trans) = $self
			->method_lookup('open-ils.actor.user.transactions.history.still_open')
			->run($login_session => $user_id => $type);
		$trans = [ grep { int($_->total_owed * 100) > 0 } @$trans ];

	}
	
	$trans = [ grep { !$_->xact_finish } @$trans ];

	if($api =~ /total/o) { 
		my $total = 0.0;
		for my $t (@$trans) {
			$total += $t->balance_owed;
		}

		$logger->debug("Total balance owed by user $user_id: $total");
		return $total;
	}

	if($api =~ /count/o) { return scalar @$trans; }
	if($api !~ /fleshed/o) { return $trans; }

	my @resp;
	for my $t (@$trans) {
			
		if( $t->xact_type ne 'circulation' ) {
			push @resp, {transaction => $t};
			next;
		}

		my $circ = $apputils->simple_scalar_request(
				"open-ils.cstore",
				"open-ils.cstore.direct.action.circulation.retrieve",
				$t->id );

		next unless $circ;

		my $title = $apputils->simple_scalar_request(
			"open-ils.storage", 
			"open-ils.storage.fleshed.biblio.record_entry.retrieve_by_copy",
			$circ->target_copy );

		next unless $title;

		my $u = OpenILS::Utils::ModsParser->new();
		$u->start_mods_batch($title->marc());
		my $mods = $u->finish_mods_batch();
		$mods->doc_id($title->id) if $mods;

		push @resp, {transaction => $t, circ => $circ, record => $mods };

	}

	return \@resp; 
} 


__PACKAGE__->register_method(
	method	=> "user_transaction_retrieve",
	api_name	=> "open-ils.actor.user.transaction.fleshed.retrieve",
	argc		=> 1,
	notes		=> <<"	NOTES");
	Returns a fleshedtransaction record
	NOTES
__PACKAGE__->register_method(
	method	=> "user_transaction_retrieve",
	api_name	=> "open-ils.actor.user.transaction.retrieve",
	argc		=> 1,
	notes		=> <<"	NOTES");
	Returns a transaction record
	NOTES
sub user_transaction_retrieve {
	my( $self, $client, $login_session, $bill_id ) = @_;

	my $trans = $apputils->simple_scalar_request( 
		"open-ils.cstore",
		"open-ils.cstore.direct.money.billable_transaction_summary.retrieve",
		$bill_id
	);

	my( $user_obj, $target, $evt ) = $apputils->checkses_requestor(
		$login_session, $trans->usr, 'VIEW_USER_TRANSACTIONS' );
	return $evt if $evt;
	
	my $api = $self->api_name();
	if($api !~ /fleshed/o) { return $trans; }

	if( $trans->xact_type ne 'circulation' ) {
		$logger->debug("Returning non-circ transaction");
		return {transaction => $trans};
	}

	my $circ = $apputils->simple_scalar_request(
			"open-ils.cstore",
			"open-ils..direct.action.circulation.retrieve",
			$trans->id );

	return {transaction => $trans} unless $circ;
	$logger->debug("Found the circ transaction");

	my $title = $apputils->simple_scalar_request(
		"open-ils.storage", 
		"open-ils.storage.fleshed.biblio.record_entry.retrieve_by_copy",
		$circ->target_copy );

	return {transaction => $trans, circ => $circ } unless $title;
	$logger->debug("Found the circ title");

	my $mods;
	try {
		my $u = OpenILS::Utils::ModsParser->new();
		$u->start_mods_batch($title->marc());
		$mods = $u->finish_mods_batch();
	} otherwise {
		if ($title->id == OILS_PRECAT_RECORD) {
			my $copy = $apputils->simple_scalar_request(
				"open-ils.cstore",
				"open-ils.cstore.direct.asset.copy.retrieve",
				$circ->target_copy );

			$mods = new Fieldmapper::metabib::virtual_record;
			$mods->doc_id(OILS_PRECAT_RECORD);
			$mods->title($copy->dummy_title);
			$mods->author($copy->dummy_author);
		}
	};

	$logger->debug("MODSized the circ title");

	return {transaction => $trans, circ => $circ, record => $mods };
}


__PACKAGE__->register_method(
	method	=> "hold_request_count",
	api_name	=> "open-ils.actor.user.hold_requests.count",
	argc		=> 1,
	notes		=> <<"	NOTES");
	Returns hold ready/total counts
	NOTES
sub hold_request_count {
	my( $self, $client, $login_session, $userid ) = @_;

	my( $user_obj, $target, $evt ) = $apputils->checkses_requestor(
		$login_session, $userid, 'VIEW_HOLD' );
	return $evt if $evt;
	

	my $holds = $apputils->simple_scalar_request(
			"open-ils.cstore",
			"open-ils.cstore.direct.action.hold_request.search.atomic",
			{ 
				usr => $userid,
				fulfillment_time => {"=" => undef },
				cancel_time => undef,
			}
	);

	my @ready;
	for my $h (@$holds) {
		next unless $h->capture_time and $h->current_copy;

		my $copy = $apputils->simple_scalar_request(
			"open-ils.cstore",
			"open-ils.cstore.direct.asset.copy.retrieve",
			$h->current_copy
		);

		if ($copy and $copy->status == 8) {
			push @ready, $h;
		}
	}

	return { total => scalar(@$holds), ready => scalar(@ready) };
}


__PACKAGE__->register_method(
	method	=> "checkedout_count",
	api_name	=> "open-ils.actor.user.checked_out.count__",
	argc		=> 1,
	notes		=> <<"	NOTES");
	Returns a transaction record
	NOTES

# XXX Deprecate Me
sub checkedout_count {
	my( $self, $client, $login_session, $userid ) = @_;

	my( $user_obj, $target, $evt ) = $apputils->checkses_requestor(
		$login_session, $userid, 'VIEW_CIRCULATIONS' );
	return $evt if $evt;
	
	my $circs = $apputils->simple_scalar_request(
			"open-ils.cstore",
			"open-ils.cstore.direct.action.circulation.search.atomic",
			{ usr => $userid, stop_fines => undef }
			#{ usr => $userid, checkin_time => {"=" => undef } }
	);

	my $parser = DateTime::Format::ISO8601->new;

	my (@out,@overdue);
	for my $c (@$circs) {
		my $due_dt = $parser->parse_datetime( clense_ISO8601( $c->due_date ) );
		my $due = $due_dt->epoch;

		if ($due < DateTime->today->epoch) {
			push @overdue, $c;
		}
	}

	return { total => scalar(@$circs), overdue => scalar(@overdue) };
}


__PACKAGE__->register_method(
	method		=> "checked_out",
	api_name		=> "open-ils.actor.user.checked_out",
	argc			=> 2,
	signature	=> q/
		Returns a structure of circulations objects sorted by
		out, overdue, lost, claims_returned, long_overdue.
		A list of IDs are returned of each type.
		lost, long_overdue, and claims_returned circ will not
		be "finished" (there is an outstanding balance or some 
		other pending action on the circ). 

		The .count method also includes a 'total' field which 
		sums all "open" circs
	/
);

__PACKAGE__->register_method(
	method		=> "checked_out",
	api_name		=> "open-ils.actor.user.checked_out.count",
	argc			=> 2,
	signature	=> q/@see open-ils.actor.user.checked_out/
);

sub checked_out {
	my( $self, $conn, $auth, $userid ) = @_;

	my $e = new_editor(authtoken=>$auth);
	return $e->event unless $e->checkauth;

	if( $userid ne $e->requestor->id ) {
		return $e->event unless $e->allowed('VIEW_CIRCULATIONS');
	}

	my $count = $self->api_name =~ /count/;
	return _checked_out( $count, $e, $userid );
}

sub _checked_out {
	my( $iscount, $e, $userid ) = @_;

	my $circs = $e->search_action_circulation( 
		{ usr => $userid, stop_fines => undef });

	my $mcircs = $e->search_action_circulation( 
		{ 
			usr => $userid, 
			checkin_time => undef, 
			xact_finish => undef, 
			stop_fines => OILS_STOP_FINES_MAX_FINES 
		});

	
	push( @$circs, @$mcircs );

	my $parser = DateTime::Format::ISO8601->new;

	# split the circs up into overdue and not-overdue circs
	my (@out,@overdue);
	for my $c (@$circs) {
		if( $c->due_date ) {
			my $due_dt = $parser->parse_datetime( clense_ISO8601( $c->due_date ) );
			my $due = $due_dt->epoch;
			if ($due < DateTime->today->epoch) {
				push @overdue, $c->id;
			} else {
				push @out, $c->id;
			}
		} else {
			push @out, $c->id;
		}
	}

	# grab all of the lost, claims-returned, and longoverdue circs
	#my $open = $e->search_action_circulation(
	#	{usr => $userid, stop_fines => { '!=' => undef }, xact_finish => undef });


	# these items have stop_fines, but no xact_finish, so money
	# is owed on them and they have not been checked in
	my $open = $e->search_action_circulation(
		{
			usr				=> $userid, 
			stop_fines		=> { '!=' => undef }, 
			xact_finish		=> undef,
			checkin_time	=> undef,
		}
	);


	my( @lost, @cr, @lo );
	for my $c (@$open) {
		push( @lost, $c->id ) if $c->stop_fines eq 'LOST';
		push( @cr, $c->id ) if $c->stop_fines eq 'CLAIMSRETURNED';
		push( @lo, $c->id ) if $c->stop_fines eq 'LONGOVERDUE';
	}


	if( $iscount ) {
		return {
			total		=> @$circs + @lost + @cr + @lo,
			out		=> scalar(@out),
			overdue	=> scalar(@overdue),
			lost		=> scalar(@lost),
			claims_returned	=> scalar(@cr),
			long_overdue		=> scalar(@lo)
		};
	}

	return {
		out		=> \@out,
		overdue	=> \@overdue,
		lost		=> \@lost,
		claims_returned	=> \@cr,
		long_overdue		=> \@lo
	};
}



__PACKAGE__->register_method(
	method		=> "checked_in_with_fines",
	api_name		=> "open-ils.actor.user.checked_in_with_fines",
	argc			=> 2,
	signature	=> q/@see open-ils.actor.user.checked_out/
);
sub checked_in_with_fines {
	my( $self, $conn, $auth, $userid ) = @_;

	my $e = new_editor(authtoken=>$auth);
	return $e->event unless $e->checkauth;

	if( $userid ne $e->requestor->id ) {
		return $e->event unless $e->allowed('VIEW_CIRCULATIONS');
	}

	# money is owed on these items and they are checked in
	my $open = $e->search_action_circulation(
		{
			usr				=> $userid, 
			xact_finish		=> undef,
			checkin_time	=> { "!=" => undef },
		}
	);


	my( @lost, @cr, @lo );
	for my $c (@$open) {
		push( @lost, $c->id ) if $c->stop_fines eq 'LOST';
		push( @cr, $c->id ) if $c->stop_fines eq 'CLAIMSRETURNED';
		push( @lo, $c->id ) if $c->stop_fines eq 'LONGOVERDUE';
	}

	return {
		lost		=> \@lost,
		claims_returned	=> \@cr,
		long_overdue		=> \@lo
	};
}









__PACKAGE__->register_method(
	method	=> "user_transaction_history",
	api_name	=> "open-ils.actor.user.transactions.history",
	argc		=> 1,
	notes		=> <<"	NOTES");
	Returns a list of billable transaction ids for a user, optionally by type
	NOTES
__PACKAGE__->register_method(
	method	=> "user_transaction_history",
	api_name	=> "open-ils.actor.user.transactions.history.have_charge",
	argc		=> 1,
	notes		=> <<"	NOTES");
	Returns a list of billable transaction ids for a user that have an initial charge, optionally by type
	NOTES
__PACKAGE__->register_method(
	method	=> "user_transaction_history",
	api_name	=> "open-ils.actor.user.transactions.history.have_balance",
	argc		=> 1,
	notes		=> <<"	NOTES");
	Returns a list of billable transaction ids for a user that have a balance, optionally by type
	NOTES
__PACKAGE__->register_method(
	method	=> "user_transaction_history",
	api_name	=> "open-ils.actor.user.transactions.history.still_open",
	argc		=> 1,
	notes		=> <<"	NOTES");
	Returns a list of billable transaction ids for a user that are not finished
	NOTES
__PACKAGE__->register_method(
	method	=> "user_transaction_history",
	api_name	=> "open-ils.actor.user.transactions.history.have_bill",
	argc		=> 1,
	notes		=> <<"	NOTES");
	Returns a list of billable transaction ids for a user that has billings
	NOTES



=head old
sub _user_transaction_history {
	my( $self, $client, $login_session, $user_id, $type ) = @_;

	my( $user_obj, $target, $evt ) = $apputils->checkses_requestor(
		$login_session, $user_id, 'VIEW_USER_TRANSACTIONS' );
	return $evt if $evt;

	my $api = $self->api_name();
	my @xact;
	my @charge;
	my @balance;

	@xact = (xact_type =>  $type) if(defined($type));
	@balance = (balance_owed => { "!=" => 0}) if($api =~ /have_balance/);
	@charge  = (last_billing_ts => { "<>" => undef }) if $api =~ /have_charge/;

	$logger->debug("searching for transaction history: @xact : @balance, @charge");

	my $trans = $apputils->simple_scalar_request( 
		"open-ils.cstore",
		"open-ils.cstore.direct.money.billable_transaction_summary.search.atomic",
		{ usr => $user_id, @xact, @charge, @balance }, { order_by => { mbts => 'xact_start DESC' } });

	return [ map { $_->id } @$trans ];
}
=cut

sub _make_mbts {
	my @xacts = @_;

	my @mbts;
	for my $x (@xacts) {
		my $s = new Fieldmapper::money::billable_transaction_summary;
		$s->id( $x->id );
		$s->usr( $x->usr );
		$s->xact_start( $x->xact_start );
		$s->xact_finish( $x->xact_finish );

		my $to = 0.0;
		my $lb = undef;
		for my $b (@{ $x->billings }) {
			next if ($b->voided eq 'f' or !$b->voided);
			$to += $b->amount;
			$lb ||= $b->billing_ts;
			if ($b->billing_ts ge $lb) {
				$lb = $b->billing_ts;
				$s->last_billing_note($b->note);
				$s->last_billing_ts($b->billing_ts);
				$s->last_billing_type($b->billing_type);
			}
		}
		$s->total_owed( $to );

		my $tp = 0.0;
		my $lp = undef;
		for my $p (@{ $x->payments }) {
			next if ($p->voided eq 'f' or !$p->voided);
			$tp += $p->amount;
			$lp ||= $p->payment_ts;
			if ($b->payment_ts ge $lp) {
				$lp = $b->payment_ts;
				$s->last_payment_note($b->note);
				$s->last_payment_ts($b->payment_ts);
				$s->last_payment_type($b->payment_type);
			}
		}
		$s->total_paid( $tp );

		$s->balance_owed( $s->total_owed - $s->total_paid );

		$s->xact_type( 'grocery' ) if ($x->grocery);
		$s->xact_type( 'circulation' ) if ($x->circulation);

		push @mbts, $s;
	}

	return @mbts;
}

sub user_transaction_history {
	my( $self, $conn, $auth, $userid, $type ) = @_;
	my $e = new_editor(authtoken=>$auth);
	return $e->event unless $e->checkauth;
	return $e->event unless $e->allowed('VIEW_USER_TRANSACTIONS');

	my $api = $self->api_name;
	my @xact_finish  = (xact_finish => undef ) if $api =~ /still_open/;

	my @xacts = @{ $e->search_money_billable_transaction(
		[	{ usr => $userid, @xact_finish },
			{ flesh => 1,
			  flesh_fields => { mbt => [ qw/billings payments grocery circulation/ ] },
			  order_by => { mbt => 'xact_start DESC' },
			}
		]
	) };

	my @mbts = _make_mbts( @xacts );

	if(defined($type)) {
		@mbts = grep { $_->xact_type eq $type } @mbts;
	}

	if($api =~ /have_balance/o) {
		@mbts = grep { int($_->balance_owed * 100) != 0 } @mbts;
	}

	if($api =~ /have_charge/o) {
		@mbts = grep { defined($_->last_billing_ts) } @mbts;
	}

	if($api =~ /have_bill/o) {
		@mbts = grep { int($_->total_owed * 100) != 0 } @mbts;
	}

	return [@mbts];
}



__PACKAGE__->register_method(
	method	=> "user_perms",
	api_name	=> "open-ils.actor.permissions.user_perms.retrieve",
	argc		=> 1,
	notes		=> <<"	NOTES");
	Returns a list of permissions
	NOTES
sub user_perms {
	my( $self, $client, $authtoken, $user ) = @_;

	my( $staff, $evt ) = $apputils->checkses($authtoken);
	return $evt if $evt;

	$user ||= $staff->id;

	if( $user != $staff->id and $evt = $apputils->check_perms( $staff->id, $staff->home_ou, 'VIEW_PERMISSION') ) {
		return $evt;
	}

	return $apputils->simple_scalar_request(
		"open-ils.storage",
		"open-ils.storage.permission.user_perms.atomic",
		$user);
}

__PACKAGE__->register_method(
	method	=> "retrieve_perms",
	api_name	=> "open-ils.actor.permissions.retrieve",
	notes		=> <<"	NOTES");
	Returns a list of permissions
	NOTES
sub retrieve_perms {
	my( $self, $client ) = @_;
	return $apputils->simple_scalar_request(
		"open-ils.cstore",
		"open-ils.cstore.direct.permission.perm_list.search.atomic",
		{ id => { '!=' => undef } }
	);
}

__PACKAGE__->register_method(
	method	=> "retrieve_groups",
	api_name	=> "open-ils.actor.groups.retrieve",
	notes		=> <<"	NOTES");
	Returns a list of user groupss
	NOTES
sub retrieve_groups {
	my( $self, $client ) = @_;
	return new_editor()->retrieve_all_permission_grp_tree();
}

__PACKAGE__->register_method(
	method	=> "retrieve_org_address",
	api_name	=> "open-ils.actor.org_unit.address.retrieve",
	notes		=> <<'	NOTES');
	Returns an org_unit address by ID
	@param An org_address ID
	NOTES
sub retrieve_org_address {
	my( $self, $client, $id ) = @_;
	return $apputils->simple_scalar_request(
		"open-ils.cstore",
		"open-ils.cstore.direct.actor.org_address.retrieve",
		$id
	);
}

__PACKAGE__->register_method(
	method	=> "retrieve_groups_tree",
	api_name	=> "open-ils.actor.groups.tree.retrieve",
	notes		=> <<"	NOTES");
	Returns a list of user groups
	NOTES
sub retrieve_groups_tree {
	my( $self, $client ) = @_;
	return new_editor()->search_permission_grp_tree(
		[
			{ parent => undef},
			{	
				flesh				=> 10, 
				flesh_fields	=> { pgt => ["children"] }, 
				order_by			=> { pgt => 'name'}
			}
		]
	)->[0];
}


# turns an org list into an org tree
=head old code
sub build_group_tree {

	my( $self, $grplist) = @_;

	return $grplist unless ( 
			ref($grplist) and @$grplist > 1 );

	my @list = sort { $a->name cmp $b->name } @$grplist;

	my $root;
	for my $grp (@list) {

		if ($grp and !defined($grp->parent)) {
			$root = $grp;
			next;
		}
		my ($parent) = grep { $_->id == $grp->parent} @list;

		$parent->children([]) unless defined($parent->children); 
		push( @{$parent->children}, $grp );
	}

	return $root;
}
=cut


__PACKAGE__->register_method(
	method	=> "add_user_to_groups",
	api_name	=> "open-ils.actor.user.set_groups",
	notes		=> <<"	NOTES");
	Adds a user to one or more permission groups
	NOTES

sub add_user_to_groups {
	my( $self, $client, $authtoken, $userid, $groups ) = @_;

	my( $requestor, $target, $evt ) = $apputils->checkses_requestor(
		$authtoken, $userid, 'CREATE_USER_GROUP_LINK' );
	return $evt if $evt;

	( $requestor, $target, $evt ) = $apputils->checkses_requestor(
		$authtoken, $userid, 'REMOVE_USER_GROUP_LINK' );
	return $evt if $evt;

	$apputils->simplereq(
		'open-ils.storage',
		'open-ils.storage.direct.permission.usr_grp_map.mass_delete', { usr => $userid } );
		
	for my $group (@$groups) {
		my $link = Fieldmapper::permission::usr_grp_map->new;
		$link->grp($group);
		$link->usr($userid);

		my $id = $apputils->simplereq(
			'open-ils.storage',
			'open-ils.storage.direct.permission.usr_grp_map.create', $link );
	}

	return 1;
}

__PACKAGE__->register_method(
	method	=> "get_user_perm_groups",
	api_name	=> "open-ils.actor.user.get_groups",
	notes		=> <<"	NOTES");
	Retrieve a user's permission groups.
	NOTES


sub get_user_perm_groups {
	my( $self, $client, $authtoken, $userid ) = @_;

	my( $requestor, $target, $evt ) = $apputils->checkses_requestor(
		$authtoken, $userid, 'VIEW_PERM_GROUPS' );
	return $evt if $evt;

	return $apputils->simplereq(
		'open-ils.cstore',
		'open-ils.cstore.direct.permission.usr_grp_map.search.atomic', { usr => $userid } );
}	



__PACKAGE__->register_method (
	method		=> 'register_workstation',
	api_name		=> 'open-ils.actor.workstation.register.override',
	signature	=> q/@see open-ils.actor.workstation.register/);

__PACKAGE__->register_method (
	method		=> 'register_workstation',
	api_name		=> 'open-ils.actor.workstation.register',
	signature	=> q/
		Registers a new workstion in the system
		@param authtoken The login session key
		@param name The name of the workstation id
		@param owner The org unit that owns this workstation
		@return The workstation id on success, WORKSTATION_NAME_EXISTS
		if the name is already in use.
	/);

sub _register_workstation {
	my( $self, $connection, $authtoken, $name, $owner ) = @_;
	my( $requestor, $evt ) = $U->checkses($authtoken);
	return $evt if $evt;
	$evt = $U->check_perms($requestor->id, $owner, 'REGISTER_WORKSTATION');
	return $evt if $evt;

	my $ws = $U->cstorereq(
		'open-ils.cstore.direct.actor.workstation.search', { name => $name } );
	return OpenILS::Event->new('WORKSTATION_NAME_EXISTS') if $ws;

	$ws = Fieldmapper::actor::workstation->new;
	$ws->owning_lib($owner);
	$ws->name($name);

	my $id = $U->storagereq(
		'open-ils.storage.direct.actor.workstation.create', $ws );
	return $U->DB_UPDATE_FAILED($ws) unless $id;

	$ws->id($id);
	return $ws->id();
}

sub register_workstation {
	my( $self, $conn, $authtoken, $name, $owner ) = @_;

	my $e = new_editor(authtoken=>$authtoken, xact=>1);
	return $e->event unless $e->checkauth;
	return $e->event unless $e->allowed('REGISTER_WORKSTATION'); # XXX rely on editor perms
	my $existing = $e->search_actor_workstation({name => $name});

	if( @$existing ) {
		if( $self->api_name =~ /override/o ) {
			return $e->event unless $e->allowed('DELETE_WORKSTATION'); # XXX rely on editor perms
			return $e->event unless $e->delete_actor_workstation($$existing[0]);
		} else {
			return OpenILS::Event->new('WORKSTATION_NAME_EXISTS')
		}
	}

	my $ws = Fieldmapper::actor::workstation->new;
	$ws->owning_lib($owner);
	$ws->name($name);
	$e->create_actor_workstation($ws) or return $e->event;
	$e->commit;
	return $ws->id; # note: editor sets the id on the new object for us
}


__PACKAGE__->register_method (
	method		=> 'fetch_patron_note',
	api_name		=> 'open-ils.actor.note.retrieve.all',
	signature	=> q/
		Returns a list of notes for a given user
		Requestor must have VIEW_USER permission if pub==false and
		@param authtoken The login session key
		@param args Hash of params including
			patronid : the patron's id
			pub : true if retrieving only public notes
	/
);

sub fetch_patron_note {
	my( $self, $conn, $authtoken, $args ) = @_;
	my $patronid = $$args{patronid};

	my($reqr, $evt) = $U->checkses($authtoken);

	my $patron;
	($patron, $evt) = $U->fetch_user($patronid);
	return $evt if $evt;

	if($$args{pub}) {
		if( $patronid ne $reqr->id ) {
			$evt = $U->check_perms($reqr->id, $patron->home_ou, 'VIEW_USER');
			return $evt if $evt;
		}
		return $U->cstorereq(
			'open-ils.cstore.direct.actor.usr_note.search.atomic', 
			{ usr => $patronid, pub => 't' } );
	}

	$evt = $U->check_perms($reqr->id, $patron->home_ou, 'VIEW_USER');
	return $evt if $evt;

	return $U->cstorereq(
		'open-ils.cstore.direct.actor.usr_note.search.atomic', { usr => $patronid } );
}

__PACKAGE__->register_method (
	method		=> 'create_user_note',
	api_name		=> 'open-ils.actor.note.create',
	signature	=> q/
		Creates a new note for the given user
		@param authtoken The login session key
		@param note The note object
	/
);
sub create_user_note {
	my( $self, $conn, $authtoken, $note ) = @_;
	my( $reqr, $patron, $evt ) = 
		$U->checkses_requestor($authtoken, $note->usr, 'UPDATE_USER');
	return $evt if $evt;
	$logger->activity("user ".$reqr->id." creating note for user ".$note->usr);

	$note->creator($reqr->id);
	my $id = $U->storagereq(
		'open-ils.storage.direct.actor.usr_note.create', $note );
	return $U->DB_UPDATE_FAILED($note) unless $id;
	return $id;
}


__PACKAGE__->register_method (
	method		=> 'delete_user_note',
	api_name		=> 'open-ils.actor.note.delete',
	signature	=> q/
		Deletes a note for the given user
		@param authtoken The login session key
		@param noteid The note id
	/
);
sub delete_user_note {
	my( $self, $conn, $authtoken, $noteid ) = @_;

	my $note = $U->cstorereq(
		'open-ils.cstore.direct.actor.usr_note.retrieve', $noteid);
	return OpenILS::Event->new('ACTOR_USER_NOTE_NOT_FOUND') unless $note;

	my( $reqr, $patron, $evt ) = 
		$U->checkses_requestor($authtoken, $note->usr, 'UPDATE_USER');
	return $evt if $evt;
	$logger->activity("user ".$reqr->id." deleting note [$noteid] for user ".$note->usr);

	my $stat = $U->storagereq(
		'open-ils.storage.direct.actor.usr_note.delete', $noteid );
	return $U->DB_UPDATE_FAILED($note) unless defined $stat;
	return $stat;
}


__PACKAGE__->register_method (
	method		=> 'update_user_note',
	api_name		=> 'open-ils.actor.note.update',
	signature	=> q/
		@param authtoken The login session key
		@param note The note
	/
);

sub update_user_note {
	my( $self, $conn, $auth, $note ) = @_;
	my $e = new_editor(authtoken=>$auth, xact=>1);
	return $e->event unless $e->checkauth;
	my $patron = $e->retrieve_actor_user($note->usr)
		or return $e->event;
	return $e->event unless 
		$e->allowed('UPDATE_USER', $patron->home_ou);
	$e->update_actor_user_note($note)
		or return $e->event;
	$e->commit;
	return 1;
}




__PACKAGE__->register_method (
	method		=> 'create_closed_date',
	api_name	=> 'open-ils.actor.org_unit.closed_date.create',
	signature	=> q/
		Creates a new closing entry for the given org_unit
		@param authtoken The login session key
		@param note The closed_date object
	/
);
sub create_closed_date {
	my( $self, $conn, $authtoken, $cd ) = @_;

	my( $user, $evt ) = $U->checkses($authtoken);
	return $evt if $evt;

	$evt = $U->check_perms($user->id, $cd->org_unit, 'CREATE_CLOSEING');
	return $evt if $evt;

	$logger->activity("user ".$user->id." creating library closing for ".$cd->org_unit);

	my $id = $U->storagereq(
		'open-ils.storage.direct.actor.org_unit.closed_date.create', $cd );
	return $U->DB_UPDATE_FAILED($cd) unless $id;
	return $id;
}


__PACKAGE__->register_method (
	method		=> 'delete_closed_date',
	api_name	=> 'open-ils.actor.org_unit.closed_date.delete',
	signature	=> q/
		Deletes a closing entry for the given org_unit
		@param authtoken The login session key
		@param noteid The close_date id
	/
);
sub delete_closed_date {
	my( $self, $conn, $authtoken, $cd ) = @_;

	my( $user, $evt ) = $U->checkses($authtoken);
	return $evt if $evt;

	my $cd_obj;
	($cd_obj, $evt) = fetch_closed_date($cd);
	return $evt if $evt;

	$evt = $U->check_perms($user->id, $cd->org_unit, 'DELETE_CLOSEING');
	return $evt if $evt;

	$logger->activity("user ".$user->id." deleting library closing for ".$cd->org_unit);

	my $stat = $U->storagereq(
		'open-ils.storage.direct.actor.org_unit.closed_date.delete', $cd );
	return $U->DB_UPDATE_FAILED($cd) unless $stat;
	return $stat;
}


__PACKAGE__->register_method(
	method => 'usrname_exists',
	api_name	=> 'open-ils.actor.username.exists',
	signature => q/
		Returns 1 if the requested username exists, returns 0 otherwise
	/
);

sub usrname_exists {
	my( $self, $conn, $auth, $usrname ) = @_;
	my $e = new_editor(authtoken=>$auth);
	return $e->event unless $e->checkauth;
	my $a = $e->search_actor_user({usrname => $usrname, deleted=>'f'}, {idlist=>1});
	return $$a[0] if $a and @$a;
	return 0;
}

__PACKAGE__->register_method(
	method => 'barcode_exists',
	api_name	=> 'open-ils.actor.barcode.exists',
	signature => q/
		Returns 1 if the requested barcode exists, returns 0 otherwise
	/
);

sub barcode_exists {
	my( $self, $conn, $auth, $barcode ) = @_;
	my $e = new_editor(authtoken=>$auth);
	return $e->event unless $e->checkauth;
	my $a = $e->search_actor_card({barcode => $barcode}, {idlist=>1});
	return $$a[0] if $a and @$a;
	return 0;
}


__PACKAGE__->register_method(
	method => 'retrieve_net_levels',
	api_name	=> 'open-ils.actor.net_access_level.retrieve.all',
);

sub retrieve_net_levels {
	my( $self, $conn, $auth ) = @_;
	my $e = new_editor(authtoken=>$auth);
	return $e->event unless $e->checkauth;
	return $e->retrieve_all_config_net_access_level();
}


__PACKAGE__->register_method(
	method => 'fetch_org_by_shortname',
	api_name => 'open-ils.actor.org_unit.retrieve_by_shorname',
);
sub fetch_org_by_shortname {
	my( $self, $conn, $sname ) = @_;
	my $e = new_editor();
	my $org = $e->search_actor_org_unit({ shortname => uc($sname)})->[0];
	return $e->event unless $org;
	return $org;
}


__PACKAGE__->register_method(
	method => 'session_home_lib',
	api_name => 'open-ils.actor.session.home_lib',
);

sub session_home_lib {
	my( $self, $conn, $auth ) = @_;
	my $e = new_editor(authtoken=>$auth);
	return undef unless $e->checkauth;
	my $org = $e->retrieve_actor_org_unit($e->requestor->home_ou);
	return $org->shortname;
}



__PACKAGE__->register_method(
	method => 'slim_tree',
	api_name	=> "open-ils.actor.org_tree.slim_hash.retrieve",
);
sub slim_tree {
	my $tree = new_editor()->search_actor_org_unit( 
		[
			{"parent_ou" => undef },
			{
				flesh				=> 2,
				flesh_fields	=> { aou =>  ['children'] },
				order_by			=> { aou => 'name'},
				select			=> { aou => ["id","shortname", "name"]},
			}
		]
	)->[0];

	return trim_tree($tree);
}


sub trim_tree {
	my $tree = shift;
	return undef unless $tree;
	my $htree = {
		code => $tree->shortname,
		name => $tree->name,
	};
	if( $tree->children and @{$tree->children} ) {
		$htree->{children} = [];
		for my $c (@{$tree->children}) {
			push( @{$htree->{children}}, trim_tree($c) );
		}
	}

	return $htree;
}



__PACKAGE__->register_method(
	method	=> "user_retrieve_fleshed_by_id",
	api_name	=> "open-ils.actor.user.fleshed.retrieve",);

sub user_retrieve_fleshed_by_id {
	my( $self, $client, $auth, $user_id, $fields ) = @_;
	my $e = new_editor(authtoken => $auth);
	return $e->event unless $e->checkauth;
	if( $e->requestor->id != $user_id ) {
		return $e->event unless $e->allowed('VIEW_USER');
	}
	$fields ||= [
		"cards",
		"card",
		"standing_penalties",
		"addresses",
		"billing_address",
		"mailing_address",
		"stat_cat_entries" ];
	return new_flesh_user($user_id, $fields, $e);
}


sub new_flesh_user {

	my $id = shift;
	my $fields = shift || [];
	my $e	= shift || new_editor(xact=>1);

	my $user = $e->retrieve_actor_user(
   	[
      	$id,
      	{
         	"flesh" 			=> 1,
         	"flesh_fields" =>  { "au" => $fields }
      	}
   	]
	) or return $e->event;


	if( grep { $_ eq 'addresses' } @$fields ) {

		$user->addresses([]) unless @{$user->addresses};
	
		if( ref $user->billing_address ) {
			unless( grep { $user->billing_address->id == $_->id } @{$user->addresses} ) {
				push( @{$user->addresses}, $user->billing_address );
			}
		}
	
		if( ref $user->mailing_address ) {
			unless( grep { $user->mailing_address->id == $_->id } @{$user->addresses} ) {
				push( @{$user->addresses}, $user->mailing_address );
			}
		}
	}

	$e->disconnect;
	$user->clear_passwd();
	return $user;
}




__PACKAGE__->register_method(
	method	=> "user_retrieve_parts",
	api_name	=> "open-ils.actor.user.retrieve.parts",);

sub user_retrieve_parts {
	my( $self, $client, $auth, $user_id, $fields ) = @_;
	my $e = new_editor(authtoken => $auth);
	return $e->event unless $e->checkauth;
	if( $e->requestor->id != $user_id ) {
		return $e->event unless $e->allowed('VIEW_USER');
	}
	my @resp;
	my $user = $e->retrieve_actor_user($user_id) or return $e->event;
	push(@resp, $user->$_()) for(@$fields);
	return \@resp;
}






1;

