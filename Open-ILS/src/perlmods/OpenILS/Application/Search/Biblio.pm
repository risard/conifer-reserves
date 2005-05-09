package OpenILS::Application::Search::Biblio;
use base qw/OpenSRF::Application/;
use strict; use warnings;

use JSON;
use OpenILS::Utils::Fieldmapper;
use OpenILS::Utils::ModsParser;
use OpenSRF::Utils::SettingsClient;

use OpenILS::Application::AppUtils;

use JSON;

use Time::HiRes qw(time);
use OpenSRF::EX qw(:try);
use Digest::MD5 qw(md5_hex);

use XML::LibXML;
use XML::LibXSLT;

my $apputils = "OpenILS::Application::AppUtils";

# Houses biblio search utilites 

__PACKAGE__->register_method(
	method	=> "biblio_search_marc",
	api_name	=> "open-ils.search.biblio.marc",
	argc		=> 1, 
	note		=> "Searches biblio information by marc tag",
);

sub biblio_search_marc {

	my( $self, $client, $search_hash, $string ) = @_;

	warn "Building biblio marc session\n";
	my $session = OpenSRF::AppSession->create("open-ils.storage");

	use Data::Dumper;
	warn "Sending biblio marc request. String $string\nSearch hash: " . Dumper($search_hash);
	my $request = $session->request( 
			"open-ils.storage.direct.metabib.full_rec.search_fts.index_vector.atomic", 
			restrict => $search_hash, 
			term		=> $string );
	my $data = $request->gather(1);

	warn Dumper $data;

	$session->finish();
	$session->disconnect();

	return $data;

}



# ---------------------------------------------------------------------------
# takes a list of record id's and turns the docs into friendly 
# mods structures. Creates one MODS structure for each doc id.
# ---------------------------------------------------------------------------
sub _records_to_mods {
	my @ids = @_;
	
	my @results;
	my @marcxml_objs;

	my $session = OpenSRF::AppSession->create("open-ils.storage");
	my $request = $session->request(
			"open-ils.storage.direct.biblio.record_entry.batch.retrieve",  @ids );

	my $last_content = undef;

	while( my $response = $request->recv() ) {

		if( $last_content ) {
			my $u = OpenILS::Utils::ModsParser->new();
			$u->start_mods_batch( $last_content->marc );
			my $mods = $u->finish_mods_batch();
			$mods->doc_id($last_content->id());
			warn "Turning doc " . $mods->doc_id() . " into MODS\n";
			$last_content = undef;
			push @results, $mods;
		}

		next unless $response;

		if($response->isa("OpenSRF::EX")) {
			throw $response ($response->stringify);
		}

		$last_content = $response->content;

	}

	if( $last_content ) {
		my $u = OpenILS::Utils::ModsParser->new();
		$u->start_mods_batch( $last_content->marc );
		my $mods = $u->finish_mods_batch();
		$mods->doc_id($last_content->id());
		push @results, $mods;
	}

	$request->finish();
	$session->finish();
	$session->disconnect();

	return \@results;

}

__PACKAGE__->register_method(
	method	=> "record_id_to_mods",
	api_name	=> "open-ils.search.biblio.record.mods.retrieve",
	argc		=> 1, 
	note		=> "Provide ID, we provide the mods"
);

# converts a record into a mods object with copy counts attached
sub record_id_to_mods {

	my( $self, $client, $org_id, $id ) = @_;

	my $mods_list = _records_to_mods( $id );
	my $mods_obj = $mods_list->[0];
	my $cmethod = $self->method_lookup(
			"open-ils.search.biblio.record.copy_count");
	my ($count) = $cmethod->run($org_id, $id);
	$mods_obj->copy_count($count);

	return $mods_obj;
}


__PACKAGE__->register_method(
	method	=> "record_id_to_mods_slim",
	api_name	=> "open-ils.search.biblio.record.mods_slim.retrieve",
	argc		=> 1, 
	note		=> "Provide ID, we provide the mods"
);

# converts a record into a mods object with NO copy counts attached
sub record_id_to_mods_slim {

	my( $self, $client, $id ) = @_;
	warn "Retrieving MODS object for record $id\n";
	return undef unless(defined $id);

	my $mods_list = _records_to_mods( $id );
	my $mods_obj = $mods_list->[0];
	return $mods_obj;
}


# Returns the number of copies attached to a record based on org location
__PACKAGE__->register_method(
	method	=> "record_id_to_copy_count",
	api_name	=> "open-ils.search.biblio.record.copy_count",
);

__PACKAGE__->register_method(
	method	=> "record_id_to_copy_count",
	api_name	=> "open-ils.search.biblio.metarecord.copy_count",
);
sub record_id_to_copy_count {
	my( $self, $client, $org_id, $record_id ) = @_;

	my $method = "open-ils.storage.biblio.record_entry.copy_count.atomic";
	my $key = "record";
	if($self->api_name =~ /metarecord/) {
		$method = "open-ils.storage.metabib.metarecord.copy_count.atomic";
		$key = "metarecord";
	}

	my $session = OpenSRF::AppSession->create("open-ils.storage");
	warn "copy_count retrieve $record_id\n";
	return undef unless(defined $record_id);

	my $request = $session->request(
		$method, org_unit => $org_id => $key => $record_id );


	my $count = $request->gather(1);
	$session->disconnect();
	return [ sort { $a->{depth} <=> $b->{depth} } @$count ];

}


# used for cat search classes
my $cat_search_hash =  {

	author => [ 
		{ tag => "100", subfield => "a"} ,
		{ tag => "700", subfield => "a"}, 
	],

	title => [ 
		{ tag => "245", subfield => "a"},
		{ tag => "242", subfield => "a"}, 
		{ tag => "240", subfield => "a"},
		{ tag => "210", subfield => "a"},
	],

	subject => [ 
		{ tag => "650", subfield => "_" }, 
	],

	tcn	=> [
		{ tag => "035", subfield => "_" },
	],

	isbn	=> [
		{ tag => "020", subfield => "a" },
	],

};


__PACKAGE__->register_method(
	method	=> "biblio_search_tcn",
	api_name	=> "open-ils.search.biblio.tcn",
	argc		=> 3, 
	note		=> "Retrieve a record by TCN",
);

sub biblio_search_tcn {

	my( $self, $client, $tcn ) = @_;

	$tcn =~ s/.*?(\w+)\s*$/$1/o;
	warn "Searching TCN $tcn\n";

	my $session = OpenSRF::AppSession->create( "open-ils.storage" );
	my $request = $session->request( 
			"open-ils.storage.direct.biblio.record_entry.search.tcn_value", $tcn );
	my $record_entry = $request->gather(1);

	my @ids;
	for my $record (@$record_entry) {
		push @ids, $record->id;
	}

	$session->disconnect();

	warn "received ID's for tcn search @ids\n";
	my $size = @ids;

	return { count => $size, ids => \@ids };

}


# --------------------------------------------------------------------------------
# ISBN

__PACKAGE__->register_method(
	method	=> "biblio_search_isbn",
	api_name	=> "open-ils.search.biblio.isbn",
);

sub biblio_search_isbn { 
	my( $self, $client, $isbn ) = @_;
	throw OpenSRF::EX::InvalidArg 

		("biblio_search_isbn needs an ISBN to search")
			unless defined $isbn;

	warn "biblio search for ISBN $isbn\n";
	my $method = $self->method_lookup("open-ils.search.biblio.marc");
	my ($records) = $method->run( $cat_search_hash->{isbn}, $isbn );

	my $size = @$records;
	return { count => $size, ids => $records };
}



# --------------------------------------------------------------------------------

__PACKAGE__->register_method(
	method	=> "biblio_barcode_to_copy",
	api_name	=> "open-ils.search.asset.copy.find_by_barcode",
);

# turns a barcode into a copy object
sub biblio_barcode_to_copy { 
	my( $self, $client, $barcode ) = @_;

	throw OpenSRF::EX::InvalidArg 
		("search.biblio.barcode needs a barcode to search")
			unless defined $barcode;

	warn "copy search for barcode $barcode\n";
	my $record = OpenILS::Application::AppUtils->simple_scalar_request(
			"open-ils.storage", 
			"open-ils.storage.direct.asset.copy.search.barcode",
			$barcode );

	return undef unless($record);
	return $record->[0];

}

__PACKAGE__->register_method(
	method	=> "biblio_id_to_copy",
	api_name	=> "open-ils.search.asset.copy.batch.retrieve",
);

# turns a barcode into a copy object
sub biblio_id_to_copy { 
	my( $self, $client, $ids ) = @_;

	throw OpenSRF::EX::InvalidArg 
		("search.biblio.batch.retrieve needs a id to search")
			unless defined $ids;

	warn "copy search for ids @$ids\n";
	my $record = OpenILS::Application::AppUtils->simple_scalar_request(
			"open-ils.storage", 
			"open-ils.storage.direct.asset.copy.batch.retrieve.atomic",
			@$ids );

	return $record;

}


__PACKAGE__->register_method(
	method	=> "fleshed_copy_retrieve",
	api_name	=> "open-ils.search.asset.copy.fleshed.batch.retrieve",
);

# turns a barcode into a copy object
sub fleshed_copy_retrieve { 
	my( $self, $client, $ids ) = @_;

	throw OpenSRF::EX::InvalidArg 
		("search.biblio.batch.retrieve needs a id to search")
			unless defined $ids;

	warn "fleshed copy search for id @$ids\n";
	my $copy = OpenILS::Application::AppUtils->simple_scalar_request(
			"open-ils.storage", 
			"open-ils.storage.fleshed.asset.copy.batch.retrieve.atomic",
			@$ids );

	return $copy;
}



__PACKAGE__->register_method(
	method	=> "biblio_barcode_to_title",
	api_name	=> "open-ils.search.biblio.find_by_barcode",
);

sub biblio_barcode_to_title {
	my( $self, $client, $barcode ) = @_;

	if(!$barcode) {
		throw OpenSRF::EX::ERROR 
			("Not enough args to find_by_barcode");
	}

	my $title = $apputils->simple_scalar_request(
		"open-ils.storage",
		"open-ils.storage.biblio.record_entry.retrieve_by_barcode",
		$barcode );

	return { ids => $title->id, count => 1 };

=head
	my $u = OpenILS::Utils::ModsParser->new();
	$u->start_mods_batch( $title->marc );
	my $mods = $u->finish_mods_batch();
	$mods->doc_id($title->id());
	return $mods;
=cut
	
}


__PACKAGE__->register_method(
	method	=> "biblio_copy_to_mods",
	api_name	=> "open-ils.search.biblio.copy.mods.retrieve",
);

# takes a copy object and returns it fleshed mods object
sub biblio_copy_to_mods {
	my( $self, $client, $copy ) = @_;

	throw OpenSRF::EX::InvalidArgs 
		("copy.mods.retrieve needs a copy") unless( $copy );

	new Fieldmapper::asset::copy($copy);

	my $volume = OpenILS::Application::AppUtils->simple_scalar_request(
		"open-ils.storage",
		"open-ils.storage.direct.asset.call_number.retrieve",
		$copy->call_number() );

	my $mods = _records_to_mods($volume->record());
	$mods = shift @$mods;
	$volume->copies([$copy]);
	push @{$mods->call_numbers()}, $volume;

	return $mods;
}


sub barcode_to_mods {

}


# --------------------------------------------------------------------------------

__PACKAGE__->register_method(
	method	=> "cat_biblio_search_class",
	api_name	=> "open-ils.search.cat.biblio.class",
	argc		=> 3, 
	note		=> "Searches biblio information by search class",
);

sub cat_biblio_search_class {

	my( $self, $client, $org_id, $class, $sort, $string ) = @_;

	throw OpenSRF::EX::InvalidArg 
		("Not enough args to open-ils.search.cat.biblio.class")
			unless( defined($org_id) and $class and $sort and $string );


	my $search_hash;

	my $method = $self->method_lookup("open-ils.search.biblio.marc");
	if(!$method) {
		throw OpenSRF::EX::PANIC 
			("Can't lookup method 'open-ils.search.biblio.marc'");
	}

	my ($records) = $method->run( $cat_search_hash->{$class}, $string );

	my @ids;
	for my $i (@$records) { push @ids, $i->[0]; }

	my $mods_list = _records_to_mods( @ids );
	return undef unless (ref($mods_list) eq "ARRAY");

	# ---------------------------------------------------------------
	# append copy count information to the mods objects
	my $session = OpenSRF::AppSession->create("open-ils.storage");

	my $request = $session->request(
		"open-ils.storage.direct.biblio.record_copy_count.batch",  $org_id, @ids );

	for my $id (@ids) {

		warn "receiving copy counts for doc $id\n";

		my $response = $request->recv();
		next unless $response;

		if( $response and UNIVERSAL::isa($response, "Error")) {
			throw $response ($response->stringify);
		}

		my $count = $response->content;
		my $mods_obj = undef;
		for my $m (@$mods_list) {
			$mods_obj = $m if ($m->doc_id() == $id)
		}
		if($mods_obj) {
			$mods_obj->copy_count($count);
		}

		$client->respond( $mods_obj );

	}	
	$request->finish();

	$session->finish();
	$session->disconnect();
	$session->kill_me();
	# ---------------------------------------------------------------

	return undef;
}



__PACKAGE__->register_method(
	method	=> "cat_biblio_search_class_id",
	api_name	=> "open-ils.search.cat.biblio.class.id",
	argc		=> 3, 
	note		=> "Searches biblio information by search class and returns the IDs",
);

sub cat_biblio_search_class_id {

	my( $self, $client, $org_id, $class, $string, $limit, $offset ) = @_;

	$offset	||= 0;
	$limit	||= 100;
	$limit -= 1;


	$string = OpenILS::Application::Search->filter_search($string);
	if(!$string) { return undef; }

	warn "Searching cat.biblio.class.id string: $string offset: $offset limit: $limit\n";

	throw OpenSRF::EX::InvalidArg 
		("Not enough args to open-ils.search.cat.biblio.class")
			unless( defined($org_id) and $class and $string );


	my $search_hash;

	my $cache_key = md5_hex( $org_id . $class . $string );
	my $id_array = OpenILS::Application::SearchCache->get_cache($cache_key);

	if(ref($id_array)) {
		warn "Returning class search from cache\n";
		my $size = @$id_array;
		my @ids = @$id_array[ $offset..($offset+$limit) ];
		return { count => $size, ids => \@ids };
	}

	my $method = $self->method_lookup("open-ils.search.biblio.marc");
	if(!$method) {
		throw OpenSRF::EX::PANIC 
			("Can't lookup method 'open-ils.search.biblio.marc'");
	}

	my ($records) = $method->run( $cat_search_hash->{$class}, $string );

	my @cache_ids;

	for my $i (@$records) { 
		if(defined($i->[0])) {
			push @cache_ids, $i->[0]; 
		}
	}

	my @ids = @cache_ids[ $offset..($offset+$limit) ];
	my $size = @$records;

	OpenILS::Application::SearchCache->put_cache( 
			$cache_key, \@cache_ids, $size );

	return { count =>$size, ids => \@ids };

}


__PACKAGE__->register_method(
	method	=> "biblio_search_class",
	api_name	=> "open-ils.search.biblio.class",
	argc		=> 3, 
	note		=> "Searches biblio information by search class and returns the IDs",
);

sub biblio_search_class {

	my( $self, $client, $class, $string, 
			$org_id, $org_type, $limit, $offset ) = @_;

	warn "org: $org_id : depth: $org_type : limit: $limit :  offset: $offset\n";

	$offset		||= 0;
	$limit		= 100 unless defined($limit and $limit > 0 );
	$org_id	 	= "1" unless defined($org_id); # xxx
	$org_type	= 0	unless defined($org_type);

	warn "Searching biblio.class.id\n" . 
		"string: $string "		. 
		"\noffset: $offset\n"	.
		"limit: $limit\n"			.
		"org_id: $org_id\n"		.
		"depth: $org_type\n" ;

	$string = OpenILS::Application::Search->filter_search($string);
	if(!$string) { return undef; }

	if( !defined($org_id) or !$class or !$string ) {
		warn "not enbough args to metarecord search\n";
		throw OpenSRF::EX::InvalidArg 
			("Not enough args to open-ils.search.cat.biblio.class")
	}

	$class =~ s/\s+//g;

	if( ($class ne "title") and ($class ne "author") and 
		($class ne "subject") and ($class ne "keyword") ) {
		warn "Invalid search class: $class\n";
		throw OpenSRF::EX::InvalidArg ("Not a valid search class: $class")
	}

	# grab the mr id's from storage

	my $method = "open-ils.storage.metabib.$class.search_fts.metarecord_count";
	warn "Performing count method $method\n";
	my $session = OpenSRF::AppSession->create('open-ils.storage');

	my $request = $session->request( $method, 
			term => $string, 
			org_unit => $org_id, 
			depth =>$org_type );

	my $count = $request->gather(1);
	warn "Received count $count\n";
	# XXX check count size and respond accordingly

	$request = $session->request(	
		"open-ils.storage.metabib.$class.search_fts.metarecord.atomic",
		#"open-ils.storage.cachable.metabib.$class.search_fts.metarecord.atomic",
		term		=> $string, 
		org_unit => $org_id, 
		depth		=> $org_type, 
		limit		=> $limit,
		offset	=> $offset,
		);

	my $records = $request->gather(1);
	my @all_ids;

	use Data::Dumper;
	warn "Received from class search " . Dumper($records);

	# if we just get one, it won't be wrapped in an array
	if(!ref($records->[0])) {
		$records = [$records];
	}

	for my $i (@$records) { 
		if(defined($i)) {
			push @all_ids, $i; 
		}
	}

	#my @ids = @all_ids[ $offset..($offset+$limit) ];
	my @ids = @all_ids;
	@ids = grep { defined($_->[0]) } @ids;

	$session->finish();
	$session->disconnect();

	return { count =>$count, ids => \@ids };

}




__PACKAGE__->register_method(
	method	=> "biblio_mrid_to_modsbatch",
	api_name	=> "open-ils.search.biblio.metarecord.mods_slim.retrieve",
);

sub biblio_mrid_to_modsbatch {
	my( $self, $client, $mrid ) = @_;

	throw OpenSRF::EX::InvalidArg 
		("search.biblio.metarecord_to_mods requires mr id")
			unless defined( $mrid );


	my $metarecord = OpenILS::Application::AppUtils->simple_scalar_request( "open-ils.storage", 
			"open-ils.storage.direct.metabib.metarecord.retrieve", $mrid );

	if(!$metarecord) {
		throw OpenSRF::EX::ERROR ("No metarecord exists with the given id: $mrid");
	}

	my $master_id = $metarecord->master_record();


	# check for existing mods
	if($metarecord->mods()){
		warn "We already have mods for " . $metarecord->id . "\n";
		my $perl = JSON->JSON2perl($metarecord->mods());
		return Fieldmapper::metabib::virtual_record->new($perl);
	}



	warn "Creating mods batch for metarecord $mrid\n";
	my $id_hash = biblio_mrid_to_record_ids( undef, undef,  $mrid );
	my @ids = @{$id_hash->{ids}};

	if(@ids < 1) { return undef; }

	warn "Master ID is $master_id\n";
	# grab the master record to start the mods batch 

	my $record = OpenILS::Application::AppUtils->simple_scalar_request( "open-ils.storage", 
			"open-ils.storage.direct.biblio.record_entry.retrieve", $master_id );

	if(!$record) {
		throw OpenSRF::EX::ERROR 
			("No record returned with id $master_id");
	}

	my $u = OpenILS::Utils::ModsParser->new();
	use Data::Dumper;
	$u->start_mods_batch( $record->marc );
	my $main_doc_id = $record->id();

	@ids = grep { $_ ne $master_id } @ids;

	# now we have to collect all of the marc objects and push them into a mods batch
	my $session = OpenSRF::AppSession->create("open-ils.storage");
	my $request = $session->request(
		"open-ils.storage.direct.biblio.record_entry.batch.retrieve",  @ids );

	while( my $response = $request->recv() ) {

		next unless $response;
		if(UNIVERSAL::isa( $response,"OpenSRF::EX")) {
			throw $response ($response->stringify);
		}

		my $content = $response->content;

		if( $content ) {
			$u->push_mods_batch( $content->marc );
		}
	}

	my $mods = $u->finish_mods_batch();
	$mods->doc_id($mrid);
	$request->finish();

	$client->respond_complete($mods);

	my $mods_string = JSON->perl2JSON($mods->decast);

	$metarecord->mods($mods_string);

	my $req = $session->request( 
			"open-ils.storage.direct.metabib.metarecord.update", 
			$metarecord );


	$req->gather(1);

	$session->finish();
	$session->disconnect();

	return undef;

}



# converts a mr id into a list of record ids

__PACKAGE__->register_method(
	method	=> "biblio_mrid_to_record_ids",
	api_name	=> "open-ils.search.biblio.metarecord_to_records",
);

sub biblio_mrid_to_record_ids {
	my( $self, $client, $mrid ) = @_;

	throw OpenSRF::EX::InvalidArg 
		("search.biblio.metarecord_to_record_ids requires mr id")
			unless defined( $mrid );

	warn "Searching for record for MR $mrid\n";

	my $mrmaps = OpenILS::Application::AppUtils->simple_scalar_request( "open-ils.storage", 
			"open-ils.storage.direct.metabib.metarecord_source_map.search.metarecord", $mrid );

	my @ids;
	for my $map (@$mrmaps) { push @ids, $map->source(); }

	warn "Recovered id's [@ids] for mr $mrid\n";

	my $size = @ids;

	return { count => $size, ids => \@ids };

}



__PACKAGE__->register_method(
	method	=> "biblio_record_to_marc_html",
	api_name	=> "open-ils.search.biblio.record.html" );

my $parser		= XML::LibXML->new();
my $xslt			= XML::LibXSLT->new();
my $marc_sheet;

my $settings_client = OpenSRF::Utils::SettingsClient->new();
sub biblio_record_to_marc_html {
	my( $self, $client, $recordid ) = @_;

	if( !$marc_sheet ) {
		my $dir = $settings_client->config_value( "dirs", "xsl" );
		my $xsl = $settings_client->config_value(
			"apps", "open-ils.search", "app_settings", "marc_html_xsl" );

		$xsl = $parser->parse_file("$dir/$xsl");
		$marc_sheet = $xslt->parse_stylesheet( $xsl );
	}


	my $record = $apputils->simple_scalar_request(
		"open-ils.storage", 
		"open-ils.storage.direct.biblio.record_entry.retrieve",
		$recordid );

	my $xmldoc = $parser->parse_string($record->marc);
	my $html = $marc_sheet->transform($xmldoc);
	$html = $html->toString();
	return $html;

}



__PACKAGE__->register_method(
	method	=> "retrieve_all_copy_locations",
	api_name	=> "open-ils.search.config.copy_location.retrieve.all" );

my $shelving_locations;
sub retrieve_all_copy_locations {
	my( $self, $client ) = @_;
	if(!$shelving_locations) {
		$shelving_locations = $apputils->simple_scalar_request(
			"open-ils.storage", 
			"open-ils.storage.direct.asset.copy_location.retrieve.all.atomic");
	}
	return $shelving_locations;
}



__PACKAGE__->register_method(
	method	=> "retrieve_all_copy_statuses",
	api_name	=> "open-ils.search.config.copy_status.retrieve.all" );

my $copy_statuses;
sub retrieve_all_copy_statuses {
	my( $self, $client ) = @_;
	if(!$copy_statuses) {
		$copy_statuses = $apputils->simple_scalar_request(
			"open-ils.storage",
			"open-ils.storage.direct.config.copy_status.retrieve.all.atomic" );
	}
	return $copy_statuses;
}





1;
