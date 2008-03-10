package OpenILS::Application::Actor::Container;
use base 'OpenILS::Application';
use strict; use warnings;
use OpenILS::Application::AppUtils;
use OpenILS::Perm;
use Data::Dumper;
use OpenSRF::EX qw(:try);
use OpenILS::Utils::Fieldmapper;
use OpenILS::Utils::CStoreEditor qw/:funcs/;

my $apputils = "OpenILS::Application::AppUtils";
my $U = $apputils;
my $logger = "OpenSRF::Utils::Logger";

sub initialize { return 1; }

my $svc = 'open-ils.cstore';
my $meth = 'open-ils.cstore.direct.container';
my %types;
$types{'biblio'} = "$meth.biblio_record_entry_bucket";
$types{'callnumber'} = "$meth.call_number_bucket";
$types{'copy'} = "$meth.copy_bucket";
$types{'user'} = "$meth.user_bucket";
my $event;

sub _sort_buckets {
	my $buckets = shift;
	return $buckets unless ($buckets && $buckets->[0]);
	return [ sort { $a->name cmp $b->name } @$buckets ];
}

__PACKAGE__->register_method(
	method	=> "bucket_retrieve_all",
	api_name	=> "open-ils.actor.container.all.retrieve_by_user",
	notes		=> <<"	NOTES");
		Retrieves all un-fleshed buckets assigned to given user 
		PARAMS(authtoken, bucketOwnerId)
		If requestor ID is different than bucketOwnerId, requestor must have
		VIEW_CONTAINER permissions.
	NOTES

sub bucket_retrieve_all {
	my($self, $client, $authtoken, $userid) = @_;

	my( $staff, $evt ) = $apputils->checkses($authtoken);
	return $evt if $evt;

	my( $user, $e ) = $apputils->checkrequestor( $staff, $userid, 'VIEW_CONTAINER');
	return $e if $e;

	$logger->debug("User " . $staff->id . 
		" retrieving all buckets for user $userid");

	my %buckets;

	$buckets{$_} = $apputils->simplereq( 
		$svc, $types{$_} . ".search.atomic", { owner => $userid } ) for keys %types;

	return \%buckets;
}

__PACKAGE__->register_method(
	method	=> "bucket_flesh",
	api_name	=> "open-ils.actor.container.flesh",
	argc		=> 3, 
	notes		=> <<"	NOTES");
		Fleshes a bucket by id
		PARAMS(authtoken, bucketClass, bucketId)
		bucketclasss include biblio, callnumber, copy, and user.  
		bucketclass defaults to biblio.
		If requestor ID is different than bucketOwnerId, requestor must have
		VIEW_CONTAINER permissions.
	NOTES

sub bucket_flesh {

	my($self, $client, $authtoken, $class, $bucket) = @_;

	my( $staff, $evt ) = $apputils->checkses($authtoken);
	return $evt if $evt;

	$logger->debug("User " . $staff->id . " retrieving bucket $bucket");

	my $meth = $types{$class};

	my $bkt = $apputils->simplereq( $svc, "$meth.retrieve", $bucket );
	#if(!$bkt) {return undef};
	return OpenILS::Event->new('CONTAINER_NOT_FOUND', payload=>$bucket) unless $bkt;

	if(!$bkt->pub) {
		my( $user, $e ) = $apputils->checkrequestor( $staff, $bkt->owner, 'VIEW_CONTAINER' );
		return $e if $e;
	}

	$bkt->items( $apputils->simplereq( $svc,
		"$meth"."_item.search.atomic", { bucket => $bucket } ) );

	return $bkt;
}


__PACKAGE__->register_method(
	method	=> "bucket_flesh_public",
	api_name	=> "open-ils.actor.container.public.flesh",
	argc		=> 3, 
	notes		=> <<"	NOTES");
		Fleshes a bucket by id
		PARAMS(authtoken, bucketClass, bucketId)
		bucketclasss include biblio, callnumber, copy, and user.  
		bucketclass defaults to biblio.
		If requestor ID is different than bucketOwnerId, requestor must have
		VIEW_CONTAINER permissions.
	NOTES

sub bucket_flesh_public {

	my($self, $client, $class, $bucket) = @_;

	my $meth = $types{$class};
	my $bkt = $apputils->simplereq( $svc, "$meth.retrieve", $bucket );
	return undef unless ($bkt and $bkt->pub);

	$bkt->items( $apputils->simplereq( $svc,
		"$meth"."_item.search.atomic", { bucket => $bucket } ) );

	return $bkt;
}


__PACKAGE__->register_method(
	method	=> "bucket_retrieve_class",
	api_name	=> "open-ils.actor.container.retrieve_by_class",
	argc		=> 3, 
	notes		=> <<"	NOTES");
		Retrieves all un-fleshed buckets by class assigned to given user 
		PARAMS(authtoken, bucketOwnerId, class [, type])
		class can be one of "biblio", "callnumber", "copy", "user"
		The optional "type" parameter allows you to limit the search by 
		bucket type.  
		If bucketOwnerId is not defined, the authtoken is used as the
		bucket owner.
		If requestor ID is different than bucketOwnerId, requestor must have
		VIEW_CONTAINER permissions.
	NOTES

sub bucket_retrieve_class {
	my( $self, $client, $authtoken, $userid, $class, $type ) = @_;

	my( $staff, $user, $evt ) = 
		$apputils->checkses_requestor( $authtoken, $userid, 'VIEW_CONTAINER' );
	return $evt if $evt;

	$logger->debug("User " . $staff->id . 
		" retrieving buckets for user $userid [class=$class, type=$type]");

	my $meth = $types{$class} . ".search.atomic";
	my $buckets;

	if( $type ) {
		$buckets = $apputils->simplereq( $svc, 
			$meth, { owner => $userid, btype => $type } );
	} else {
		$logger->debug("Grabbing buckets by class $class: $svc : $meth :  {owner => $userid}");
		$buckets = $apputils->simplereq( $svc, $meth, { owner => $userid } );
	}

	return _sort_buckets($buckets);
}

__PACKAGE__->register_method(
	method	=> "bucket_create",
	api_name	=> "open-ils.actor.container.create",
	notes		=> <<"	NOTES");
		Creates a new bucket object.  If requestor is different from
		bucketOwner, requestor needs CREATE_CONTAINER permissions
		PARAMS(authtoken, bucketObject);
		Returns the new bucket object
	NOTES

sub bucket_create {
	my( $self, $client, $authtoken, $class, $bucket ) = @_;

	my $e = new_editor(xact=>1, authtoken=>$authtoken);
	return $e->event unless $e->checkauth;

	if( $bucket->owner ne $e->requestor->id ) {
		return $e->event unless
			$e->allowed('CREATE_CONTAINER');

	} else {
		return $e->event unless
			$e->allowed('CREATE_MY_CONTAINER');
	}
		
	$bucket->clear_id;

    my $evt = OpenILS::Event->new('CONTAINER_EXISTS', 
        payload => [$class, $bucket->owner, $bucket->btype, $bucket->name]);
    my $search = {name => $bucket->name, owner => $bucket->owner, btype => $bucket->btype};

	my $obj;
	if( $class eq 'copy' ) {
        return $evt if $e->search_container_copy_bucket($search)->[0];
		return $e->event unless
			$obj = $e->create_container_copy_bucket($bucket);
	}

	if( $class eq 'callnumber' ) {
        return $evt if $e->search_container_call_number_bucket($search)->[0];
		return $e->event unless
			$obj = $e->create_container_call_number_bucket($bucket);
	}

	if( $class eq 'biblio' ) {
        return $evt if $e->search_container_biblio_record_entry_bucket($search)->[0];
		return $e->event unless
			$obj = $e->create_container_biblio_record_entry_bucket($bucket);
	}

	if( $class eq 'user') {
        return $evt if $e->search_container_user_bucket($search)->[0];
		return $e->event unless
			$obj = $e->create_container_user_bucket($bucket);
	}

	$e->commit;
	return $obj->id;
}


__PACKAGE__->register_method(
	method	=> "item_create",
	api_name	=> "open-ils.actor.container.item.create",
	notes		=> <<"	NOTES");
		PARAMS(authtoken, class, item)
	NOTES

sub item_create {
	my( $self, $client, $authtoken, $class, $item ) = @_;

	my $e = new_editor(xact=>1, authtoken=>$authtoken);
	return $e->event unless $e->checkauth;

	my ( $bucket, $evt ) = $apputils->fetch_container_e($e, $item->bucket, $class);
	return $evt if $evt;

	if( $bucket->owner ne $e->requestor->id ) {
		return $e->event unless
			$e->allowed('CREATE_CONTAINER_ITEM');

	} else {
#		return $e->event unless
#			$e->allowed('CREATE_CONTAINER_ITEM'); # new perm here?
	}
		
	$item->clear_id;

	my $stat;
	if( $class eq 'copy' ) {
		return $e->event unless
			$stat = $e->create_container_copy_bucket_item($item);
	}

	if( $class eq 'callnumber' ) {
		return $e->event unless
			$stat = $e->create_container_call_number_bucket_item($item);
	}

	if( $class eq 'biblio' ) {
		return $e->event unless
			$stat = $e->create_container_biblio_record_entry_bucket_item($item);
	}

	if( $class eq 'user') {
		return $e->event unless
			$stat = $e->create_container_user_bucket_item($item);
	}

	$e->commit;
	return $stat->id;
}



__PACKAGE__->register_method(
	method	=> "item_delete",
	api_name	=> "open-ils.actor.container.item.delete",
	notes		=> <<"	NOTES");
		PARAMS(authtoken, class, itemId)
	NOTES

sub item_delete {
	my( $self, $client, $authtoken, $class, $itemid ) = @_;

	my $e = new_editor(xact=>1, authtoken=>$authtoken);
	return $e->event unless $e->checkauth;

	my $ret = __item_delete($e, $class, $itemid);
	$e->commit unless $U->event_code($ret);
	return $ret;
}

sub __item_delete {
	my( $e, $class, $itemid ) = @_;
	my( $bucket, $item, $evt);

	( $item, $evt ) = $U->fetch_container_item_e( $e, $itemid, $class );
	return $evt if $evt;

	( $bucket, $evt ) = $U->fetch_container_e($e, $item->bucket, $class);
	return $evt if $evt;

	if( $bucket->owner ne $e->requestor->id ) {
      my $owner = $e->retrieve_actor_user($bucket->owner)
         or return $e->die_event;
		return $e->event unless $e->allowed('DELETE_CONTAINER_ITEM', $owner->home_ou);
	}

	my $stat;
	if( $class eq 'copy' ) {
		return $e->event unless
			$stat = $e->delete_container_copy_bucket_item($item);
	}

	if( $class eq 'callnumber' ) {
		return $e->event unless
			$stat = $e->delete_container_call_number_bucket_item($item);
	}

	if( $class eq 'biblio' ) {
		return $e->event unless
			$stat = $e->delete_container_biblio_record_entry_bucket_item($item);
	}

	if( $class eq 'user') {
		return $e->event unless
			$stat = $e->delete_container_user_bucket_item($item);
	}

	return $stat;
}


__PACKAGE__->register_method(
	method	=> 'full_delete',
	api_name	=> 'open-ils.actor.container.full_delete',
	notes		=> "Complety removes a container including all attached items",
);	

sub full_delete {
	my( $self, $client, $authtoken, $class, $containerId ) = @_;
	my( $container, $evt);

	my $e = new_editor(xact=>1, authtoken=>$authtoken);
	return $e->event unless $e->checkauth;

	( $container, $evt ) = $apputils->fetch_container_e($e, $containerId, $class);
	return $evt if $evt;

	if( $container->owner ne $e->requestor->id ) {
      my $owner = $e->retrieve_actor_user($container->owner)
         or return $e->die_event;
		return $e->event unless $e->allowed('DELETE_CONTAINER', $owner->home_ou);
	}

	my $items; 

	my @s = ({bucket => $containerId}, {idlist=>1});

	if( $class eq 'copy' ) {
		$items = $e->search_container_copy_bucket_item(@s);
	}

	if( $class eq 'callnumber' ) {
		$items = $e->search_container_call_number_bucket_item(@s);
	}

	if( $class eq 'biblio' ) {
		$items = $e->search_container_biblio_record_entry_bucket_item(@s);
	}

	if( $class eq 'user') {
		$items = $e->search_container_user_bucket_item(@s);
	}

	__item_delete($e, $class, $_) for @$items;

	my $stat;
	if( $class eq 'copy' ) {
		return $e->event unless
			$stat = $e->delete_container_copy_bucket($container);
	}

	if( $class eq 'callnumber' ) {
		return $e->event unless
			$stat = $e->delete_container_call_number_bucket($container);
	}

	if( $class eq 'biblio' ) {
		return $e->event unless
			$stat = $e->delete_container_biblio_record_entry_bucket($container);
	}

	if( $class eq 'user') {
		return $e->event unless
			$stat = $e->delete_container_user_bucket($container);
	}

	$e->commit;
	return $stat;
}

__PACKAGE__->register_method(
	method		=> 'container_update',
	api_name		=> 'open-ils.actor.container.update',
	signature	=> q/
		Updates the given container item.
		@param authtoken The login session key
		@param class The container class
		@param container The container item
		@return true on success, 0 on no update, Event on error
		/
);

sub container_update {
	my( $self, $conn, $authtoken, $class, $container )  = @_;

	my $e = new_editor(xact=>1, authtoken=>$authtoken);
	return $e->event unless $e->checkauth;

	my ( $dbcontainer, $evt ) = $U->fetch_container_e($e, $container->id, $class);
	return $evt if $evt;

	if( $e->requestor->id ne $container->owner ) {
		return $e->event unless $e->allowed('UPDATE_CONTAINER');
	}

	my $stat;
	if( $class eq 'copy' ) {
		return $e->event unless
			$stat = $e->update_container_copy_bucket($container);
	}

	if( $class eq 'callnumber' ) {
		return $e->event unless
			$stat = $e->update_container_call_number_bucket($container);
	}

	if( $class eq 'biblio' ) {
		return $e->event unless
			$stat = $e->update_container_biblio_record_entry_bucket($container);
	}

	if( $class eq 'user') {
		return $e->event unless
			$stat = $e->update_container_user_bucket($container);
	}

	$e->commit;
	return $stat;
}




1;


