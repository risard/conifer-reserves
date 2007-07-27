package OpenILS::WWW::Exporter;
use strict;
use warnings;
use bytes;

use Apache2::Log;
use Apache2::Const -compile => qw(OK REDIRECT DECLINED NOT_FOUND :log);
use APR::Const    -compile => qw(:error SUCCESS);
use Apache2::RequestRec ();
use Apache2::RequestIO ();
use Apache2::RequestUtil;
use CGI;
use Data::Dumper;

use OpenSRF::EX qw(:try);
use OpenSRF::Utils qw/:datetime/;
use OpenSRF::Utils::Cache;
use OpenSRF::System;
use OpenSRF::AppSession;
use XML::LibXML;
use XML::LibXSLT;

use Encode;
use Unicode::Normalize;
use OpenILS::Utils::Fieldmapper;
use OpenSRF::Utils::Logger qw/$logger/;

use MARC::Record;
use MARC::File::XML;

use UNIVERSAL::require;

our @formats = qw/USMARC UNIMARC XML BRE/;

# set the bootstrap config and template include directory when
# this module is loaded
my $bootstrap;

sub import {
        my $self = shift;
        $bootstrap = shift;
}


sub child_init {
        OpenSRF::System->bootstrap_client( config_file => $bootstrap );
}

sub handler {
	my $r = shift;
	my $cgi = new CGI;
	
	my @records = $cgi->param('id');

	return 200 unless (@records);

	my $type = $cgi->param('rectype') || 'biblio';
	if ($type ne 'biblio && $type ne 'authority') {
		die "Bad record type: $type";
	}

	my $holdings = $cgi->param('holdings') if ($type eq 'biblio');
	my $location = $cgi->param('location') || 'gaaagpl'; # just because...

	my $format = $cgi->param('format') || 'USMARC';
	$format = uc($format);

	my $encoding = $cgi->param('encoding') || 'UTF-8';
	$encoding = uc($encoding);

	binmode(STDOUT, ':raw') if ($encoding ne 'UTF-8');
	binmode(STDOUT, ':utf8') if ($encoding eq 'UTF-8');

	if (!grep { uc($format) eq $_ } @formats) {
		die	"Please select a supported format.  ".
			"Right now that means one of [".
			join('|',@formats). "]\n";
	}

	if ($format ne 'XML') {
		my $ftype = 'MARC::File::' . $format;
		$ftype->require;
	}

	my $ses = OpenSRF::AppSession->create('open-ils.cstore');

	$r->content_type('application/octet-stream') if (uc($format) ne 'XML');
	$r->content_type('application/xml') if (uc($format) eq 'XML');

	my $content = '';


	$content .= <<"	HEADER" if (uc($format) eq 'XML');
<?xml version="1.0" encoding="$encoding"?>
<collection xmlns='http://www.loc.gov/MARC21/slim'>
	HEADER

	my %orgs;
	my %shelves;

	my $flesh = {};
	if ($holdings) {

		my $r = $ses->request( 'open-ils.cstore.direct.actor.org_unit.search', { id => { '!=' => undef } } );

    		while (my $o = $r->recv) {
        		die $r->failed->stringify if ($r->failed);
        		$o = $o->content;
        		last unless ($o);
	    		$orgs{$o->id} = $o;
    		}
    		$r->finish;

		$r = $ses->request( 'open-ils.cstore.direct.asset.copy_location.search', { id => { '!=' => undef } } );

    		while (my $s = $r->recv) {
        		die $r->failed->stringify if ($r->failed);
        		$s = $s->content;
        		last unless ($s);
	    		$shelves{$s->id} = $s;
    		}
    		$r->finish;

    		$flesh = { flesh => 2, flesh_fields => { bre => [ 'call_numbers' ], acn => [ 'copies' ] } };
	}

	for my $i ( @records ) {
    		my $bib;
    		try {
        		local $SIG{ALRM} = sub { die "TIMEOUT\n" };
        		alarm(1);
	    		$bib = $ses->request( "open-ils.cstore.direct.$type.record_entry.retrieve", $i, $flesh )->gather(1);
        		alarm(0);
    		} otherwise {
        		warn "\n!!!!!! Timed out trying to read record $i\n";
    		};
    		alarm(0);

		next unless $bib;

    		if (uc($format) eq 'BRE') {
        		$content .= OpenSRF::Utils::JSON->perl2JSON($bib);
        		next;
    		}

		try {

			my $r = MARC::Record->new_from_xml( $bib->marc, $encoding, $format );
			$r->delete_field( $_ ) for ($r->field(901));

			$r->append_fields(
				MARC::Field->new(
					901, '', '', 
					a => $bib->tcn_value,
					b => $bib->tcn_source,
					c => $bib->id
				)
			);


        		my $cn_list = $bib->call_numbers;
        		if ($cn_list && @$cn_list) {

            			my $cp_list = [ map { @{ $_->copies } } @$cn_list ];
            			if ($cp_list && @$cp_list) {

	            			my %cn_map;
	            			push @{$cn_map{$_->call_number}}, $_ for (@$cp_list);
		                        
	            			for my $cn ( @$cn_list ) {
	                			my $cn_map_list = $cn_map{$cn->id};
	
	                			for my $cp ( @$cn_map_list ) {
		                        
							$r->append_fields(
								MARC::Field->new(
									852, '4', '', 
									a => $location,
									b => $orgs{$cn->owning_lib}->shortname,
									b => $orgs{$cp->circ_lib}->shortname,
									c => $shelves{$cp->location}->name,
									j => $cn->label,
									($cp->circ_modifier ? ( g => $cp->circ_modifier ) : ()),
									p => $cp->barcode,
									($cp->price ? ( y => $cp->price ) : ()),
									($cp->copy_number ? ( t => $cp->copy_number ) : ()),
									($cp->ref eq 't' ? ( x => 'reference' ) : ()),
									($cp->holdable eq 'f' ? ( x => 'unholdable' ) : ()),
									($cp->circulate eq 'f' ? ( x => 'noncirculating' ) : ()),
									($cp->opac_visible eq 'f' ? ( x => 'hidden' ) : ()),
								)
							);

						}
					}
				}
        		}

			if (uc($format) eq 'XML') {
				my $x = $r->as_xml_record;
				$x =~ s/^<\?xml version="1.0" encoding="UTF-8"\?>//o;
				$content .= $x;
			} elsif (uc($format) eq 'UNIMARC') {
				$content .= $r->as_unimarc
			} elsif (uc($format) eq 'USMARC') {
				$content .= $r->as_usmarc
			}

		} otherwise {
			my $e = shift;
			warn "\n$e\n";
		};

	}

	$content .= "</collection>\n" if ($format eq 'XML');

	$r->print($content);
	return Apache2::Const::OK;

}

1;
