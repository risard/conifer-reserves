package OpenILS::Application::Search;
use base qw/OpenSRF::Application/;
use strict; use warnings;
use JSON;

use OpenILS::Utils::Fieldmapper;
use OpenILS::Utils::ModsParser;
use OpenSRF::Utils::SettingsClient;
use OpenSRF::Utils::Cache;


#use OpenILS::Application::Search::StaffClient;
use OpenILS::Application::Search::Web;
use OpenILS::Application::Search::Biblio;
use OpenILS::Application::Search::Z3950;

use OpenILS::Application::AppUtils;

use Time::HiRes qw(time);
use OpenSRF::EX qw(:try);

# Houses generic search utilites 

sub child_init {
	OpenILS::Application::SearchCache->child_init();
}

sub filter_search {
	my($self, $string) = @_;

	$string =~ s/\s+the\s+//i;
	$string =~ s/\s+an\s+//i;
	$string =~ s/\s+a\s+//i;

	$string =~ s/^the\s+//i;
	$string =~ s/^an\s+//i;
	$string =~ s/^a\s+//i;

	$string =~ s/\s+the$//i;
	$string =~ s/\s+an$//i;
	$string =~ s/\s+a$//i;

	$string =~ s/^the$//i;
	$string =~ s/^an$//i;
	$string =~ s/^a$//i;

	warn "Cleansed string to: $string\n";
	return $string;
}	


__PACKAGE__->register_method(
	method	=> "get_org_tree",
	api_name	=> "open-ils.search.actor.org_tree.retrieve",
	argc		=> 1, 
	note		=> "Returns the entire org tree structure",
);

sub get_org_tree {

	my( $self, $client, $user_session ) = @_;

	if( $user_session ) { # keep for now for backwards compatibility

		my $user_obj = 
			OpenILS::Application::AppUtils->check_user_session( $user_session ); #throws EX on error
		
		my $session = OpenSRF::AppSession->create("open-ils.storage");
		my $request = $session->request( 
				"open-ils.storage.direct.actor.org_unit.retrieve", $user_obj->home_ou );
		my $response = $request->recv();

		if(!$response) { 
			throw OpenSRF::EX::ERROR (
					"No response from storage for org_unit retrieve");
		}
		if(UNIVERSAL::isa($response,"Error")) {
			throw $response ($response->stringify);
		}

		my $home_ou = $response->content;
		$request->finish();
		$session->disconnect();

		return $home_ou;
	}

	return OpenILS::Application::AppUtils->get_org_tree();
}



__PACKAGE__->register_method(
	method	=> "get_org_sub_tree",
	api_name	=> "open-ils.search.actor.org_subtree.retrieve",
	argc		=> 1, 
	note		=> "Returns the entire org tree structure",
);

sub get_sub_org_tree {

	my( $self, $client, $user_session ) = @_;

	if(!$user_session) {
		throw OpenSRF::EX::InvalidArg 
			("No User session provided to org_subtree.retrieve");
	}

	if( $user_session ) {

		my $user_obj = 
			OpenILS::Application::AppUtils->check_user_session( $user_session ); #throws EX on error

		
		my $session = OpenSRF::AppSession->create("open-ils.storage");
		my $request = $session->request( 
				"open-ils.storage.direct.actor.org_unit.retrieve", $user_obj->home_ou );
		my $response = $request->recv();

		if(!$response) { 
			throw OpenSRF::EX::ERROR (
					"No response from storage for org_unit retrieve");
		}
		if(UNIVERSAL::isa($response,"Error")) {
			throw $response ($response->stringify);
		}

		my $home_ou = $response->content;

		# XXX grab descendants and build org tree from them
=head comment
		my $request = $session->request( 
				"open-ils.storage.actor.org_unit_descendants" );
		my $response = $request->recv();
		if(!$response) { 
			throw OpenSRF::EX::ERROR (
					"No response from storage for org_unit retrieve");
		}
		if(UNIVERSAL::isa($response,"Error")) {
			throw $response ($response->stringify);
		}

		my $descendants = $response->content;
=cut

		$request->finish();
		$session->disconnect();

		return $home_ou;
	}

	return undef;

}








package OpenILS::Application::SearchCache;
use strict; use warnings;

my $cache_handle;
my $max_timeout;

sub child_init {

	my $config_client = OpenSRF::Utils::SettingsClient->new();
	my $memcache_servers = 
		$config_client->config_value( 
				"apps","open-ils.search", "app_settings","memcache" );

	if( !$memcache_servers ) {
		throw OpenSRF::EX::Config ("
				No Memcache servers specified for open-ils.search!");
	}

	if(!ref($memcache_servers)) {
		$memcache_servers = [$memcache_servers];
	}
	$cache_handle = OpenSRF::Utils::Cache->new( "open-ils.search", 0, $memcache_servers );
	$max_timeout = $config_client->config_value( 
			"apps", "open-ils.search", "app_settings", "max_cache_time" );

	if(ref($max_timeout) eq "ARRAY") {
		$max_timeout = $max_timeout->[0];
	}

}

sub new {return bless({},shift());}

sub put_cache {
	my($self, $key, $data, $timeout) = @_;
	return undef unless( $key and $data );

	$timeout ||= $max_timeout;
	$timeout = ($timeout <= $max_timeout) ? $timeout : $max_timeout;

	warn "putting $key into cache for $timeout seconds\n";
	$cache_handle->put_cache( "_open-ils.search_$key", JSON->perl2JSON($data), $timeout );
}

sub get_cache {
	my( $self, $key ) = @_;
	my $json =  $cache_handle->get_cache("_open-ils.search_$key");
	if($json) {
		warn "retrieving from cache $key\n  =>>>  $json";
	}
	return JSON->JSON2perl($json);
}




1;
