package OpenILS::Application::AppUtils;
use strict; use warnings;
use base qw/OpenSRF::Application/;


# ---------------------------------------------------------------------------
# Pile of utilty methods used accross applications.
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# on sucess, returns the created session, on failure throws ERROR exception
# ---------------------------------------------------------------------------
sub start_db_session {

	my $self = shift;
	my $session = OpenSRF::AppSession->connect( "open-ils.storage" );
	my $trans_req = $session->request( "open-ils.storage.transaction.begin" );

	my $trans_resp = $trans_req->recv();
	if(ref($trans_resp) and $trans_resp->isa("Error")) { throw $trans_resp; }
	if( ! $trans_resp->content() ) {
		throw OpenSRF::ERROR 
			("Unable to Begin Transaction with database" );
	}
	$trans_req->finish();
	return $session;
}

# ---------------------------------------------------------------------------
# commits and destroys the session
# ---------------------------------------------------------------------------
sub commit_db_session {
	my( $self, $session ) = @_;

	my $req = $session->request( "open-ils.storage.transaction.commit" );
	my $resp = $req->recv();

	if(!$resp) {
		throw OpenSRF::EX::ERROR ("Unable to commit db session");
	}

	if(ref($resp) and $resp->isa("Error")) { 
		throw $resp ($resp->stringify); 
	}

	if(!$resp->content) {
		throw OpenSRF::EX::ERROR ("Unable to commit db session");
	}

	$session->finish();
	$session->disconnect();
	$session->kill_me();
}

sub rollback_db_session {
	my( $self, $session ) = @_;

	my $req = $session->request("open-ils.storage.transaction.rollback");
	my $resp = $req->recv();
	if(ref($resp) and $resp->isa("Error")) { throw $resp; }

	$session->finish();
	$session->disconnect();
	$session->kill_me();
}

# ---------------------------------------------------------------------------
# Checks to see if a user is logged in.  Returns the user record on success,
# throws an exception on error.
# ---------------------------------------------------------------------------
sub check_user_session {

	my( $self, $user_session ) = @_;

	my $session = OpenSRF::AppSession->create( "open-ils.auth" );
	my $request = $session->request("open-ils.auth.session.retrieve", $user_session );
	my $response = $request->recv();

	if(!$response) {
		throw OpenSRF::EX::ERROR ("Session [$user_session] cannot be authenticated" );
	}

	if($response->isa("OpenSRF::EX")) {
		throw $response ($response->stringify);
	}

	my $user = $response->content;
	if(!$user) {
		throw OpenSRF::EX::ERROR ("Session [$user_session] cannot be authenticated" );
	}

	$session->disconnect();
	$session->kill_me();

	return $user;

	
}

# generic simple request returning a scalar value
sub simple_scalar_request {
	my($self, $service, $method, @params) = @_;

	my $session = OpenSRF::AppSession->create( $service );
	my $request = $session->request( $method, @params );
	my $response = $request->recv();

	if(!$response) {
		throw OpenSRF::EX::ERROR 
			("No response from $service for method $method with params @params" );
	}

	if($response->isa("Error")) {
		throw $response ("Call to $service for method $method with params @params" . 
				"\n failed with exception: " . $response->stringify );
	}

	my $value = $response->content;

	$request->finish();
	$session->disconnect();
	$session->kill_me();

	return $value;
}





my $orglist = undef;
my $org_typelist = undef;
my $org_typelist_hash = {};

sub get_org_tree {

	my $self = shift;

	if(!$orglist) {
		$orglist = $self->simple_scalar_request( 
			"open-ils.storage", "open-ils.storage.direct.actor.org_unit.retrieve.all" );
	}

	if( ! $org_typelist ) {
		$org_typelist = $self->simple_scalar_request( 
			"open-ils.storage", "open-ils.storage.direct.actor.org_unit_type.retrieve.all" );
		$self->build_org_type( $org_typelist );
	}

	return $self->build_org_tree($orglist, $org_typelist);

}

sub build_org_type { 
	my($self, $org_typelist)  = @_;
	for my $type (@$org_typelist) {
		$org_typelist_hash->{$type->id()} = $type;
	}
}



sub build_org_tree {

	my( $self, $orglist, $org_typelist ) = @_;



	return $orglist unless ( 
			ref($orglist) and @$orglist > 1 );

	my @list = sort { 
		$a->ou_type <=> $b->ou_type ||
		$a->name cmp $b->name } @$orglist;

	for my $org (@list) {
		next unless ($org and defined($org->parent_ou));

		if(!ref($org->ou_type())) {
			$org->ou_type( $org_typelist_hash->{$org->ou_type()});
		}

		my ($parent) = grep { $_->id == $org->parent_ou } @list;
		next unless $parent;
		$parent->children([]) unless defined($parent->children); 
		push( @{$parent->children}, $org );
	}

	return $list[0];

}

	


1;
