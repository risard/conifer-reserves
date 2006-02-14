package OpenILS::Application::SuperCat;

use strict;
use warnings;

# All OpenSRF applications must be based on OpenSRF::Application or
# a subclass thereof.  Makes sense, eh?
use OpenSRF::Application;
use base qw/OpenSRF::Application/;

# This is the client class, used for connecting to open-ils.storage
use OpenSRF::AppSession;

# This is an extention of Error.pm that supplies some error types to throw
use OpenSRF::EX qw(:try);

# This is a helper class for querying the OpenSRF Settings application ...
use OpenSRF::Utils::SettingsClient;

# ... and here we have the built in logging helper ...
use OpenSRF::Utils::Logger qw($logger);

# ... and this is our OpenILS object (en|de)coder and psuedo-ORM package.
use OpenILS::Utils::Fieldmapper;


# We'll be working with XML, so...
use XML::LibXML;
use XML::LibXSLT;
use Unicode::Normalize;

use JSON;

our ($_parser, $_mods_sheet, $_storage);

sub child_init {
	$_parser = new XML::LibXML;
	my $mods_xslt = $_parser->parse_file(
		OpenSRF::Utils::SettingsClient
			->new
			->config_value( dirs => 'xsl' ).
		"/MARC21slim2MODS.xsl"
	);
	my $xslt = new XML::LibXSLT;
	$_mods_sheet = $xslt->parse_stylesheet( $mods_xslt );
	$_storage = OpenSRF::AppSession->create( 'open-ils.storage' );
	return 1;
}

sub entityize {
	my $stuff = NFC(shift());
	$stuff =~ s/([\x{0080}-\x{fffd}])/sprintf('&#x%X;',ord($1))/sgoe;
	return $stuff;
}


sub retrieve_record_marcxml {
	my $self = shift;
	my $client = shift;
	my $rid = shift;

	return
	entityize(
		$_storage
			->request( 'open-ils.storage.direct.biblio.record_entry.retrieve' => $rid )
			->gather(1)
			->marc
	);
}

__PACKAGE__->register_method(
	method    => 'retrieve_record_marcxml',
	api_name  => 'open-ils.supercat.record.marcxml.retrieve',
	api_level => 1,
	argc      => 1,
	signature =>
		{ desc     => <<"		  DESC",
Returns the MARCXML representation of the requested bibliographic record
		  DESC
		  params   =>
		  	[
				{ name => 'bibId',
				  desc => 'An OpenILS biblio::record_entry id',
				  type => 'number' },
			],
		  'return' =>
		  	{ desc => 'The bib record in MARCXML',
			  type => 'string' }
		}
);

sub retrieve_record_mods {
	my $self = shift;
	my $client = shift;
	my $rid = shift;

	my $marc = $_storage->request(
		'open-ils.storage.direct.biblio.record_entry.retrieve',
		$rid
	)->gather(1)->marc;

	return entityize($_mods_sheet->transform( $_parser->parse_string( $marc ) )->toString);
}

__PACKAGE__->register_method(
	method    => 'retrieve_record_mods',
	api_name  => 'open-ils.supercat.record.mods.retrieve',
	api_level => 1,
	argc      => 1,
	signature =>
		{ desc     => <<"		  DESC",
Returns the MODS representation of the requested bibliographic record
		  DESC
		  params   =>
		  	[
				{ name => 'bibId',
				  desc => 'An OpenILS biblio::record_entry id',
				  type => 'number' },
			],
		  'return' =>
		  	{ desc => 'The bib record in MODS',
			  type => 'string' }
		}
);

sub retrieve_metarecord_mods {
	my $self = shift;
	my $client = shift;
	my $rid = shift;

	# We want a session
	$_storage->connect;

	# Get the metarecord in question
	my $mr =
	$_storage->request(
		'open-ils.storage.direct.metabib.metarecord.retrieve' => $rid
	)->gather(1);

	# Now get the map of all bib records for the metarecord
	my $recs =
	$_storage->request(
		'open-ils.storage.direct.metabib.metarecord_source_map.search.metarecord.atomic',
		$rid
	)->gather(1);

	$logger->debug("Adding ".scalar(@$recs)." bib record to the MODS of the metarecord");

	# and retrieve the lead (master) record as MODS
	my ($master) =
		$self	->method_lookup('open-ils.supercat.record.mods.retrieve')
			->run($mr->master_record);
	my $master_mods = $_parser->parse_string($master)->documentElement;
	$master_mods->setNamespace( "http://www.loc.gov/mods/", "mods", 1 );

	# ... and a MODS clone to populate, with guts removed.
	my $mods = $_parser->parse_string($master)->documentElement;
	$mods->setNamespace( "http://www.loc.gov/mods/", "mods", 1 );
	($mods) = $mods->findnodes('//mods:mods');
	$mods->removeChildNodes;

	# Add the metarecord ID as a (locally defined) info URI
	my $recordInfo = $mods
		->ownerDocument
		->createElement("mods:recordInfo");

	my $recordIdentifier = $mods
		->ownerDocument
		->createElement("mods:recordIdentifier");

	$recordIdentifier->setAttribute( source => 'oils:/metabib-metarecord/' );

	my $id = $mr->id;
	$recordIdentifier->appendTextNode( $id );

	$recordInfo->appendChild($recordIdentifier);
	$mods->appendChild($recordInfo);

	# Grab the title, author and ISBN for the master record and populate the metarecord
	my ($title) = $master_mods->findnodes( './mods:titleInfo[not(@type)]' );
	
	if ($title) {
		$title->setNamespace( "http://www.loc.gov/mods/", "mods", 1 );
		$title = $mods->ownerDocument->importNode($title);
		$mods->appendChild($title);
	}

	my ($author) = $master_mods->findnodes( './mods:name[mods:role/mods:text[text()="creator"]]' );
	if ($author) {
		$author->setNamespace( "http://www.loc.gov/mods/", "mods", 1 );
		$author = $mods->ownerDocument->importNode($author);
		$mods->appendChild($author);
	}

	my ($isbn) = $master_mods->findnodes( './mods:identifier[@type="isbn"]' );
	if ($isbn) {
		$isbn->setNamespace( "http://www.loc.gov/mods/", "mods", 1 );
		$isbn = $mods->ownerDocument->importNode($isbn);
		$mods->appendChild($isbn);
	}

	# ... and loop over the constituent records
	for my $map ( @$recs ) {

		# get the MODS
		my ($rec) =
			$self	->method_lookup('open-ils.supercat.record.mods.retrieve')
				->run($map->source);

		my $part_mods = $_parser->parse_string($rec);
		$part_mods->documentElement->setNamespace( "http://www.loc.gov/mods/", "mods", 1 );
		($part_mods) = $part_mods->findnodes('//mods:mods');

		for my $node ( ($part_mods->findnodes( './mods:subject' )) ) {
			$node->setNamespace( "http://www.loc.gov/mods/", "mods", 1 );
			$node = $mods->ownerDocument->importNode($node);
			$mods->appendChild( $node );
		}

		my $relatedItem = $mods
			->ownerDocument
			->createElement("mods:relatedItem");

		$relatedItem->setAttribute( type => 'constituent' );

		my $identifier = $mods
			->ownerDocument
			->createElement("mods:identifier");

		$identifier->setAttribute( type => 'uri' );

		my $recordInfo = $mods
			->ownerDocument
			->createElement("mods:recordInfo");

		my $recordIdentifier = $mods
			->ownerDocument
			->createElement("mods:recordIdentifier");

		$recordIdentifier->setAttribute( source => 'oils:/biblio-record_entry/' );

		my $id = $map->source;
		$recordIdentifier->appendTextNode( $id );
		$recordInfo->appendChild($recordIdentifier);

		$relatedItem->appendChild( $recordInfo );

		my ($tor) = $part_mods->findnodes( './mods:typeOfResource' );
		$tor->setNamespace( "http://www.loc.gov/mods/", "mods", 1 ) if ($tor);
		$tor = $mods->ownerDocument->importNode($tor) if ($tor);
		$relatedItem->appendChild($tor) if ($tor);

		if ( my ($part_isbn) = $part_mods->findnodes( './mods:identifier[@type="isbn"]' ) ) {
			$part_isbn->setNamespace( "http://www.loc.gov/mods/", "mods", 1 );
			$part_isbn = $mods->ownerDocument->importNode($part_isbn);
			$relatedItem->appendChild( $part_isbn );

			if (!$isbn) {
				$isbn = $mods->appendChild( $part_isbn->cloneNode(1) );
			}
		}

		$mods->appendChild( $relatedItem );

	}

	$_storage->disconnect;

	return entityize($mods->toString);

}
__PACKAGE__->register_method(
	method    => 'retrieve_metarecord_mods',
	api_name  => 'open-ils.supercat.metarecord.mods.retrieve',
	api_level => 1,
	argc      => 1,
	signature =>
		{ desc     => <<"		  DESC",
Returns the MODS representation of the requested metarecord
		  DESC
		  params   =>
		  	[
				{ name => 'metarecordId',
				  desc => 'An OpenILS metabib::metarecord id',
				  type => 'number' },
			],
		  'return' =>
		  	{ desc => 'The metarecord in MODS',
			  type => 'string' }
		}
);

sub oISBN {
	my $self = shift;
	my $client = shift;
	my $isbn = shift;

	throw OpenSRF::EX::InvalidArg ('I need an ISBN please')
		unless (length($isbn) >= 10);

	# Create a storage session, since we'll be making muliple requests.
	$_storage->connect;

	# Find the record that has that ISBN.
	my $bibrec = $_storage->request(
		'open-ils.storage.direct.metabib.full_rec.search_where.atomic',
		{ tag => '020', subfield => 'a', value => { like => $isbn.'%'} }
	)->gather(1);

	# Go away if we don't have one.
	return {} unless (@$bibrec);

	# Find the metarecord for that bib record.
	my $mr = $_storage->request(
		'open-ils.storage.direct.metabib.metarecord_source_map.search.source.atomic',
		$bibrec->[0]->record
	)->gather(1);

	# Find the other records for that metarecord.
	my $records = $_storage->request(
		'open-ils.storage.direct.metabib.metarecord_source_map.search.metarecord.atomic',
		$mr->[0]->metarecord
	)->gather(1);

	# Just to be safe.  There's currently no unique constraint on sources...
	my %unique_recs = map { ($_->source, 1) } @$records;
	my @rec_list = sort keys %unique_recs;

	# And now fetch the ISBNs for thos records.
	my $recs = $_storage->request(
		'open-ils.storage.direct.metabib.full_rec.search_where.atomic',
		{ tag => '020', subfield => 'a', record => \@rec_list }
	)->gather(1);

	# We're done with the storage server session.
	$_storage->disconnect;

	# Return the oISBN data structure.  This will be XMLized at a higher layer.
	return { metarecord => $mr->[0]->metarecord, record_list => { map { ($_->record, $_->value) } @$recs } };

}
__PACKAGE__->register_method(
	method    => 'oISBN',
	api_name  => 'open-ils.supercat.oisbn',
	api_level => 1,
	argc      => 1,
	signature =>
		{ desc     => <<"		  DESC",
Returns the ISBN list for the metarecord of the requested isbn
		  DESC
		  params   =>
		  	[
				{ name => 'isbn',
				  desc => 'An ISBN.  Duh.',
				  type => 'string' },
			],
		  'return' =>
		  	{ desc => 'record to isbn map',
			  type => 'object' }
		}
);

1;
