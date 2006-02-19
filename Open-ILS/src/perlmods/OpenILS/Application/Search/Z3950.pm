#!/usr/bin/perl
package OpenILS::Application::Search::Z3950;
use strict; use warnings;
use base qw/OpenSRF::Application/;


use Net::Z3950;
use MARC::Record;
use MARC::File::XML;
use OpenSRF::Utils::SettingsClient;

use OpenILS::Utils::FlatXML;
use OpenILS::Application::Cat::Utils;
use OpenILS::Application::AppUtils;

use OpenSRF::Utils::Logger qw/$logger/;

use OpenSRF::EX qw(:try);

my $utils = "OpenILS::Application::Cat::Utils";
my $apputils = "OpenILS::Application::AppUtils";

use OpenILS::Utils::ModsParser;
use Data::Dumper;

my $output = "USMARC"; # only support output for now
my $host;
my $port;
my $database;
my $attr;
my $username;
my $password;

my $settings_client;

sub initialize {
	$settings_client = OpenSRF::Utils::SettingsClient->new();
	$host			= $settings_client->config_value("z3950", "oclc", "host");
	$port			= $settings_client->config_value("z3950", "oclc", "port");
	$database	= $settings_client->config_value("z3950", "oclc", "db");
	$attr			= $settings_client->config_value("z3950", "oclc", "attr");
	$username	= $settings_client->config_value("z3950", "oclc", "username");
	$password	= $settings_client->config_value("z3950", "oclc", "password");

	$logger->info("z3950:  Search App connecting:  host=$host, port=$port, ".
		"db=$database, attr=$attr, username=$username, password=$password" );
}


__PACKAGE__->register_method(
	method	=> "z39_search_by_string",
	api_name	=> "open-ils.search.z3950.raw_string",
);

sub z39_search_by_string {

	my( $self, $client, $server, 
			$port, $db, $search, $user, $pw ) = @_;

	throw OpenSRF::EX::InvalidArg unless( 
			$server and $port and $db and $search);


	$logger->info("Z3950: searching for $search");

	$user ||= "";
	$pw	||= "";

	my $conn = new Net::Z3950::Connection(
		$server, $port, 
		databaseName				=> $db, 
		user							=> $user,
		password						=> $pw,
		preferredRecordSyntax	=> $output, 
	);


	my $rs = $conn->search( $search );
	if(!$rs) {
		throw OpenSRF::EX::ERROR ("z39 search failed"); 
	}

	my $records = [];
	my $hash = {};

	$hash->{count} =  $rs->size();
	$logger->info("Z3950: Search recovered " . $hash->{count} . " records");

	# until there is a more graceful way to handle this
	if($hash->{count} > 20) { return $hash; }


	for( my $x = 0; $x != $hash->{count}; $x++ ) {
		$logger->debug("z3950: Churning on z39 record count $x");

		my $rec = $rs->record($x+1);
		my $marc = MARC::Record->new_from_usmarc($rec->rawdata());

		my $marcxml = $marc->as_xml();
		my $flat = OpenILS::Utils::FlatXML->new( xml => $marcxml ); 
		my $doc = $flat->xml_to_doc();


		if( $doc->documentElement->nodeName =~ /collection/io ) {
			$doc->setDocumentElement( $doc->documentElement->firstChild );
			$doc->documentElement->setNamespace(
					"http://www.loc.gov/MARC21/slim", undef, 1);
		}

		$logger->debug("z3950: Turning doc into a nodeset...");

		my $tree;
		my $err;

		try {
			my $nodes = OpenILS::Utils::FlatXML->new->xmldoc_to_nodeset($doc);
			$logger->debug("z3950: turning nodeset into tree");
			$tree = $utils->nodeset2tree( $nodes->nodeset );
		} catch Error with {
			$err = shift;
		};

		if($err) {
			$logger->error("z3950: Error turning doc into nodeset/node tree: $err");
		} else {
			my $mods;
			
			my $u = OpenILS::Utils::ModsParser->new();
			$u->start_mods_batch( $marcxml );
			$mods = $u->finish_mods_batch();

			push @$records, { 'mvr' => $mods, 'brn' => $tree };

			#push @$records, $tree;
		}

	}

	$logger->debug("z3950: got here near the end with " . scalar(@$records) . " records." );

	$hash->{records} = $records;
	return $hash;

}


__PACKAGE__->register_method(
	method	=> "import_search",
	api_name	=> "open-ils.search.z3950.import",
);

sub import_search {
	my($self, $client, $user_session, $string) = @_;

	my $user_obj = 
		$apputils->check_user_session( $user_session ); #throws EX on error

	return $self->z39_search_by_string(
		$client, $host, $port, $database, 
			"\@attr 1=$attr \"$string\"", $username, $password );
}




1;
