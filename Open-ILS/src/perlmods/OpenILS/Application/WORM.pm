package OpenILS::Application::WORM;
use base qw/OpenSRF::Application/;
use strict; use warnings;

use OpenSRF::EX qw/:try/;

use OpenILS::Utils::FlatXML;
use OpenILS::Utils::Fieldmapper;
use JSON;

use XML::LibXML;
use XML::LibXSLT;
use Time::HiRes qw(time);

my $xml_util	= OpenILS::Utils::FlatXML->new();

my $parser		= XML::LibXML->new();
my $xslt			= XML::LibXSLT->new();
#my $xslt_doc	=	$parser->parse_file( "/home/miker/cvs/OpenILS/app_server/stylesheets/MARC21slim2MODS.xsl" );
my $xslt_doc	= $parser->parse_file( "/pines/cvs/ILS/Open-ILS/xsl/MARC21slim2MODS.xsl" );
my $mods_sheet = $xslt->parse_stylesheet( $xslt_doc );

use open qw/:utf8/;


sub child_init {
	#try {
	#	__PACKAGE__->method_lookup('i.do.not.exist');
	#} catch Error with {
	#	warn shift();
	#};
}


# get me from the database
my $xpathset = {

	title => {

		abbreviated => 
			"//mods:mods/mods:titleInfo[mods:title and (\@type='abreviated')]",

		translated =>
			"//mods:mods/mods:titleInfo[mods:title and (\@type='translated')]",

		uniform =>
			"//mods:mods/mods:titleInfo[mods:title and (\@type='uniform')]",

		proper =>
			"//mods:mods/mods:titleInfo[mods:title and not (\@type)]",
	},

	author => {

		corporate => 
			"//mods:mods/mods:name[\@type='corporate']/*[local-name()='namePart']".
				"[../mods:role/mods:text[text()='creator']][1]",

		personal => 
			"//mods:mods/mods:name[\@type='personal']/*[local-name()='namePart']".
				"[../mods:role/mods:text[text()='creator']][1]",

		conference => 
			"//mods:mods/mods:name[\@type='conference']/*[local-name()='namePart']".
				"[../mods:role/mods:text[text()='creator']][1]",

		other => 
			"//mods:mods/mods:name[\@type='personal']/*[local-name()='namePart']",
	},

	subject => {

		geographic => 
			"//mods:mods/*[local-name()='subject']/*[local-name()='geographic']",

		name => 
			"//mods:mods/*[local-name()='subject']/*[local-name()='name']",

		temporal => 
			"//mods:mods/*[local-name()='subject']/*[local-name()='temporal']",

		topic => 
			"//mods:mods/*[local-name()='subject']/*[local-name()='topic']",

	},

	keyword => { keyword => "//mods:mods/*[not(local-name()='originInfo')]", },

};


# --------------------------------------------------------------------------------

__PACKAGE__->register_method( 
	api_name	=> "open-ils.worm.wormize",
	method		=> "wormize",
	api_level	=> 1,
	argc		=> 1,
);

sub wormize {

	my( $self, $client, $docid ) = @_;

	# step -1: grab the doc from storage
	my $meth = $self->method_lookup('open-ils.storage.biblio.record_marc.retrieve');
	my ($marc) = $meth->run($docid);
	return $self->wormize_marc( $client, $docid, $marc->marc );
}


__PACKAGE__->register_method( 
	api_name	=> "open-ils.worm.wormize.marc",
	method		=> "wormize",
	api_level	=> 1,
	argc		=> 1,
);

my $get_old_fr;
my $rm_old_fr;
sub wormize_marc {
	my( $self, $client, $docid, $xml) = @_;

	# step 0: turn the doc into marcxml and mods
	my $marcdoc = $parser->parse_string($xml);


	# step 1: build the KOHA rows
	my @ns_list = _marcxml_to_full_rows( $marcdoc );
	$_->record( $docid ) for (@ns_list);


	$get_old_fr = $self->method_lookup( 'open-ils.storage.metabib.full_rec.search.record')
		unless ($get_old_fr);
	$rm_old_fr = $self->method_lookup( 'open-ils.storage.metabib.full_rec.batch.delete')
		unless ($rm_old_fr);

	my ($old_fr) = $get_old_fr->run( $docid );
	if (@$old_fr) {
		my ($res) = $rm_old_fr->run( @$old_fr );
		throw OpenSRF::EX::PANIC ("Couldn't remove old metabib::full_rec entries!")
			unless ($res);
	}

	# step 1.1: start the WORM transaction
	my $st_ses = $client->session->create('open-ils.storage');
	throw OpenSRF::EX::PANIC ("WORM can't connect to the open-is.storage server!")
		if (!$st_ses->connect);

	my $xact_req = $st_ses->request('open-ils.storage.transaction.begin');
	$xact_req->wait_complete;

	my $resp = $xact_req->recv;
	throw OpenSRF::EX::PANIC ("Couldn't start a transaction! -- $resp")
		unless (UNIVERSAL::can($resp, 'content'));
	throw OpenSRF::EX::PANIC ("Transaction creation failed! -- ".$resp->content)
		unless ($resp->content);




	# step 1.2: insert the KOHA style data
	my $fr_req = $st_ses->request( 'open-ils.storage.metabib.full_rec.batch.create', @ns_list );
	$fr_req->wait_complete;

	$resp = $fr_req->recv;

	my $rb;
	unless (UNIVERSAL::can($resp, 'content')) {
		my $rb = $st_ses->request('open-ils.storage.biblio.transaction.rollback');
		$rb->wait_complete;
		throw OpenSRF::EX::PANIC ("Couldn't run .full_rec.batch.create! -- $resp")
	}
	unless ($resp->content) {
		my $rb = $st_ses->request('open-ils.storage.biblio.transaction.rollback');
		$rb->wait_complete;
		throw OpenSRF::EX::PANIC ("Didn't create any full_rec entries! -- ".$resp->content)
	}

	$fr_req->finish();

	# That's all for now!
	my $commit_req = $st_ses->request( 'open-ils.storage.transaction.commit' );
	$commit_req->wait_complete;

	$resp = $commit_req->recv;

	unless (UNIVERSAL::can($resp, 'content')) {
		my $rb = $st_ses->request('open-ils.storage.transaction.rollback');
		$rb->wait_complete;
		throw OpenSRF::EX::PANIC ("Error commiting transaction! -- $resp")
	}
	unless ($resp->content) {
		my $rb = $st_ses->request('open-ils.storage.transaction.rollback');
		$rb->wait_complete;
		throw OpenSRF::EX::PANIC ("Transaction commit failed! -- ".$resp->content)
	}

	$commit_req->finish();
	$xact_req->finish();

	$st_ses->disconnect();
	$st_ses->finish();

	return 1;

	my $mods = $mods_sheet->transform($marcdoc);

	# step 2: get the MODS based metadata
	for my $class (keys %$xpathset) {
		for my $type(keys %{$xpathset->{$class}}) {
			my $value = _get_field_value( $mods, $xpathset->{$class}->{$type} );
		}
	}

}



# --------------------------------------------------------------------------------


sub _marcxml_to_full_rows {

	my $marcxml = shift;

	my @ns_list;
	
	my $root = $marcxml->documentElement;

	for my $tagline ( @{$root->getChildrenByTagName("leader")} ) {
		next unless $tagline;

		my $ns = new Fieldmapper::metabib::full_rec;

		$ns->tag( 'LDR' );
		$ns->value( $tagline->textContent );

		push @ns_list, $ns;
	}

	for my $tagline ( @{$root->getChildrenByTagName("controlfield")} ) {
		next unless $tagline;

		my $ns = new Fieldmapper::metabib::full_rec;

		$ns->tag( $tagline->getAttribute( "tag" ) );
		$ns->value( $tagline->textContent );

		push @ns_list, $ns;
	}

	for my $tagline ( @{$root->getChildrenByTagName("datafield")} ) {
		next unless $tagline;

		for my $data ( @{$tagline->getChildrenByTagName("subfield")} ) {
			next unless $tagline;

			my $ns = new Fieldmapper::metabib::full_rec;

			$ns->tag( $tagline->getAttribute( "tag" ) );
			$ns->ind1( $tagline->getAttribute( "ind1" ) );
			$ns->ind2( $tagline->getAttribute( "ind2" ) );
			$ns->subfield( $data->getAttribute( "code" ) );
			$ns->value( $data->textContent );

			push @ns_list, $ns;
		}
	}
	return @ns_list;
}

sub _get_field_value {

	my( $mods, $xpath ) = @_;

	my $string = "";
	my $root = $mods->documentElement;
	$root->setNamespace( "http://www.loc.gov/mods/", "mods", 1 );

	# grab the set of matching nodes
	my @nodes = $root->findnodes( $xpath );
	for my $value (@nodes) {

		# grab all children of the node
		my @children = $value->childNodes();
		for my $child (@children) {

			# add the childs content to the growing buffer
			my $content = quotemeta($child->textContent);
			next if ($string =~ /$content/);  # uniquify the values
			$string .= $child->textContent . " ";
		}
		if( ! @children ) {
			$string .= $value->textContent . " ";
		}
	}
	return $string;
}


sub modsdoc_to_values {
	my( $self, $mods ) = @_;
	my $data = {};
	for my $class (keys %$xpathset) {
		$data->{$class} = {};
		for my $type(keys %{$xpathset->{$class}}) {
			my $value = _get_field_value( $mods, $xpathset->{$class}->{$type} );
			$data->{$class}->{$type} = $value;
		}
	}
	return $data;
}


1;


