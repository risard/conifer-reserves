use strict; use warnings;
package OpenILS::Utils::Editor;
use OpenILS::Application::AppUtils;
use OpenSRF::EX qw(:try);
use OpenILS::Utils::Fieldmapper;
use OpenILS::Event;
use Data::Dumper;
use OpenSRF::Utils::Logger qw($logger);
my $U = "OpenILS::Application::AppUtils";


# -----------------------------------------------------------------------------
# These need to be auto-generated
# -----------------------------------------------------------------------------
my %PERMS = (
	'biblio.record_entry'	=> { update => 'UPDATE_MARC' },
	'asset.copy'				=> { update => 'UPDATE_COPY'},
	'asset.call_number'		=> { update => 'UPDATE_VOLUME'},
	'action.circulation'		=> { retrieve => 'VIEW_CIRCULATIONS'},
);




# -----------------------------------------------------------------------------
# Params include:
#	xact=><true> : creates a storage transaction
#	authtoken=>$token : the login session key
# -----------------------------------------------------------------------------
sub new {
	my( $class, %params ) = @_;
	$class = ref($class) || $class;
	my $self = bless( \%params, $class );
	$self->{checked_perms} = {};
	return $self;
}

# -----------------------------------------------------------------------------
# Verifies the auth token and fetches the requestor object
# -----------------------------------------------------------------------------
sub checkauth {
	my $self = shift;
	$logger->info("editor: checking auth token ".$self->authtoken);
	my ($reqr, $evt) = $U->checkses($self->authtoken);
	$self->event($evt) if $evt;
	return $self->{requestor} = $reqr;
}


# -----------------------------------------------------------------------------
# Returns the last generated event
# -----------------------------------------------------------------------------
sub event {
	my( $self, $evt ) = @_;
	$self->{event} = $evt if $evt;
	return $self->{event};
}

sub clear_event {
	my $self = shift;
	$self->{event} = undef;
}

sub authtoken {
	my( $self, $auth ) = @_;
	$self->{authtoken} = $auth if $auth;
	return $self->{authtoken};
}

# -----------------------------------------------------------------------------
# fetches the session, creating if necessary.  If 'xact' is true on this
# object, a db session is created
# -----------------------------------------------------------------------------
sub session {
	my( $self, $session ) = @_;
	$self->{session} = $session if $session;
	if(!$self->{session}) {
		if( $self->{xact} ) {
			$self->{session} = $U->start_db_session;
		} else {
			$self->{session} = 
				OpenSRF::AppSession->create('open-ils.storage');
		}
	}
	return $self->{session};
}

# -----------------------------------------------------------------------------
# commits the db session and destroys the session
# -----------------------------------------------------------------------------
sub commit {
	my $self = shift;
	return unless $self->{xact};
	$logger->info("editor: committing session");
	$U->commit_db_session( $self->session );
	$self->{session} = undef;
}

# -----------------------------------------------------------------------------
# clears all object data. Does not commit the db transaction.
# -----------------------------------------------------------------------------
sub reset {
	my $self = shift;
	$logger->debug("editor: cleaning up");
	$$self{$_} = undef for (keys %$self);
}

# -----------------------------------------------------------------------------
# commits and resets
# -----------------------------------------------------------------------------
sub finish {
	my $self = shift;
	$self->commit;
	$self->reset;
}


# -----------------------------------------------------------------------------
# Does a simple storage request
# -----------------------------------------------------------------------------
sub request {
	my( $self, $method, @params ) = @_;
	$logger->info("editor: performing simple storage request $method");
	return $self->session->request($method, @params)->gather(1);
}


sub requestor {
	my($self, $requestor) = @_;
	$self->{requestor} = $requestor if $requestor;
	$logger->warn("editor: no requestor defined") unless $self->{requestor};
	return $self->{requestor};
}

# -----------------------------------------------------------------------------
# Holds the last data received from a storage call
# -----------------------------------------------------------------------------
sub data {
	my( $self, $data ) = @_;
	$self->{data} = $data if defined $data;
	return $self->{data};
}


# -----------------------------------------------------------------------------
# True if this perm has already been checked at this org
# -----------------------------------------------------------------------------
sub perm_checked {
	my( $self, $perm, $org ) = @_;
	$self->{checked_perms}->{$org} = {}
		unless $self->{checked_perms}->{$org};
	my $checked = $self->{checked_perms}->{$org}->{$perm};
	if(!$checked) {
		$self->{checked_perms}->{$org}->{$perm} = 1;
		return 0;
	}
	return 1;
}



# -----------------------------------------------------------------------------
# Returns true if the requested perm is allowed.  If the perm check fails,
# $e->event is set and undef is returned
# The perm user is $e->requestor->id and perm org defaults to the requestor's
# ws_ou
# If this perm at the given org has already been verified, true is returned
# and the perm is not re-checked
# -----------------------------------------------------------------------------
sub allowed {
	my( $self, $perm, $org ) = @_;
	my $uid = $self->requestor->id;
	$org ||= $self->requestor->ws_ou;
	$logger->info("editor: checking perms user=$uid, org=$org, perm=$perm");
	return 1 if $self->perm_checked($perm, $org); 

	my $s = $self->request(
		"open-ils.storage.permission.user_has_perm", $uid, $perm, $org );

	if(!$s) {
		my $e = OpenILS::Event->new('PERM_FAILURE', ilsperm => $perm, ilspermloc => $org);
		$self->event($e);
		return undef;
	}

	return 1;
}



# -----------------------------------------------------------------------------
# checks the appropriate perm for the operation
# -----------------------------------------------------------------------------
sub checkperm {
	my( $self, $ptype, $action, $org ) = @_;
	$org ||= $self->requestor->ws_ou;
	my $perm = $PERMS{$ptype}{$action};
	if( $perm ) {
		return undef if $self->perm_checked($perm, $org);
		return $self->event unless $self->allowed($perm, $org);
	} else {
		$logger->error("editor: no perm provided for $ptype.$action");
	}
	return undef;
}



# -----------------------------------------------------------------------------
# Logs update actions to the activity log
# -----------------------------------------------------------------------------
sub log_activity {
	my( $self, $type, $action, $arg ) = @_;
	my $str = "$type.$action";

	if( $self->requestor ) {
		$str = "$str [requestor=".$self->requestor->id."] : ";
	} else { $str = "$str : "; }

	my @props = $arg->properties;
	for(@props) {
		my $prop = $arg->$_() || "";
		$str .= " $_=$prop";
	}

	$logger->activity($str);
}



# -----------------------------------------------------------------------------
# This does the actual storage query.
#
# 'search' calls become search_where calls and $arg can be a search hash or
# an array-ref of storage search options.  
#
# 'retrieve' expects an id
# 'update' expects an object
# 'create' expects an object
# 'delete' expects an object
#
# All methods return true on success and undef on failure.  On failure, 
# $e->event is set to the generated event.  This method assumes that updating
# a non-changed object and thereby receiving a 0 from storage, is a successful
# update.  The method will therefore return true so the caller can just do 
# $e->update_blah($x) or return $e->event;
# The true value returned from storage for all methods will be stored in 
# $e->data, until the next method is called.
# -----------------------------------------------------------------------------
sub runmethod {
	my( $self, $action, $type, $arg, $options ) = @_;

	my @arg = ($arg);
	my $method = "open-ils.storage.direct.$type.$action";
	if( $action eq 'search' ) {
		$method =~ s/search/search_where/o;
		$method =~ s/direct/id_list/o if $options->{idlist};
		$method = "$method.atomic";
		@arg = @$arg if ref($arg) eq 'ARRAY';
	}

	# remove any stale events
	$self->clear_event;

	if( $action eq 'update' or $action eq 'delete' or $action eq 'create' ) {
		$self->log_activity($type, $action, $arg);
	} else {
		$logger->info("editor: performing $action on $type=$arg");
	}

	if($$options{checkperm}) {
		my $a = ($action eq 'search') ? 'retrieve' : $action;
		my $e = $self->checkperm($type, $a, $$options{permorg});
		if($e) {
			$self->event($e);
			return undef;
		}
	}

	my $obj; 
	my $err;

	try {
		$obj = $self->request($method, @arg);
	} catch Error with {
		$err = shift;
	};

	if(!defined $obj) {
		$logger->info("editor: request returned no data");

		if( $action eq 'retrieve' ) {
			(my $t = $type) =~ s/\./_/og;
			$t = uc($t);
			$self->event(OpenILS::Event->new("${t}_NOT_FOUND", payload => $arg));

		} elsif( $action eq 'update' or 
				$action eq 'delete' or $action eq 'create' ) {
			my $evt = OpenILS::Event->new(
				'DATABASE_UPDATE_FAILED', payload => $arg, debug => "$err" );
			$self->event($evt);
		}

		return undef;
	}

	$arg->id($obj) if $action eq 'create';
	$self->data($obj);

	return ($obj) ? $obj : 1;
}




# utility method for loading
sub __fm2meth { 
	my $str = shift;
	my $sep = shift;
	$str =~ s/Fieldmapper:://o;
	$str =~ s/::/$sep/g;
	return $str;
}


# -------------------------------------------------------------
# Load up the methods from the FM classes
# -------------------------------------------------------------
my $map = $Fieldmapper::fieldmap;
for my $object (keys %$map) {
	my $obj = __fm2meth($object,'_');
	my $type = __fm2meth($object, '.');

	my $update = "update_$obj";
	my $updatef = 
		"sub $update {return shift()->runmethod('update', '$type', \@_);}";
	eval $updatef;

	my $retrieve = "retrieve_$obj";
	my $retrievef = 
		"sub $retrieve {return shift()->runmethod('retrieve', '$type', \@_);}";
	eval $retrievef;

	my $search = "search_$obj";
	my $searchf = 
		"sub $search {return shift()->runmethod('search', '$type', \@_);}";
	eval $searchf;

	my $create = "create_$obj";
	my $createf = 
		"sub $create {return shift()->runmethod('create', '$type', \@_);}";
	eval $createf;

	my $delete = "delete_$obj";
	my $deletef = 
		"sub $delete {return shift()->runmethod('delete', '$type', \@_);}";
	eval $deletef;
}



1;


