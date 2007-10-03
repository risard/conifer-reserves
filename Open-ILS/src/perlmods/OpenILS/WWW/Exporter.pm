package OpenILS::WWW::Exporter;
use strict;
use warnings;
use bytes;

use Apache2::Log;
use Apache2::Const -compile => qw(OK REDIRECT DECLINED NOT_FOUND :log);
use APR::Const    -compile => qw(:error SUCCESS);
use APR::Table;

use Apache2::RequestRec ();
use Apache2::RequestIO ();
use Apache2::RequestUtil;
use CGI;
use Data::Dumper;
use Text::CSV;

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

	# find some IDs ...
	my @records;

	@records = $cgi->param('id');

	if (!@records) { # try for a file
		my $file = $cgi->param('idfile');
		if ($file) {
			warn "FILE $file";
			my $col = $cgi->param('idcolumn') || 0;
			my $csv = new Text::CSV;

			while (<$file>) {
				chomp;
				warn "LINE $_";
				$csv->parse($_);
				my @data = $csv->fields;
				my $id = $data[$col];
				warn "ID $id";
				$id =~ s/\D+//o;
				next unless ($id);
				push @records, $id;
			}
		}
	}

	if (!@records) { # try pathinfo
		my $path_rec = $cgi->path_info();
		if ($path_rec) {
			@records = map { $_ ? ($_) : () } split '/', $path_rec;
		}
	}

	return show_template($r) unless (@records);

	my $type = $cgi->param('rectype') || 'biblio';
	if ($type ne 'biblio' && $type ne 'authority') {
		die "Bad record type: $type";
	}

	my $tcn_v = 'tcn_value';
	my $tcn_s = 'tcn_source';

	if ($type eq 'authority') {
		$tcn_v = 'arn_value';
		$tcn_s = 'arn_source';
	}

	my $holdings = $cgi->param('holdings') if ($type eq 'biblio');
	my $location = $cgi->param('location') || 'gaaagpl'; # just because...

	my $format = $cgi->param('format') || 'USMARC';
	$format = uc($format);

	my $encoding = $cgi->param('encoding') || 'UTF-8';
	$encoding = uc($encoding);

	my $filename = $cgi->param('filename') || "export.$type.$encoding.$format";

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

	$r->headers_out->set("Content-Disposition" => "inline; filename=$filename");

	if (uc($format) eq 'XML') {
		$r->content_type('application/xml');
	} else {
		$r->content_type('application/octet-stream');
	}

	$r->print( <<"	HEADER" ) if (uc($format) eq 'XML');
<?xml version="1.0" encoding="$encoding"?>
<collection xmlns='http://www.loc.gov/MARC21/slim'>
	HEADER

	my %orgs;
	my %shelves;

	my $flesh = {};
	if ($holdings) {

		my $req = $ses->request( 'open-ils.cstore.direct.actor.org_unit.search', { id => { '!=' => undef } } );

    		while (my $o = $req->recv) {
        		die $req->failed->stringify if ($req->failed);
        		$o = $o->content;
        		last unless ($o);
	    		$orgs{$o->id} = $o;
    		}
    		$req->finish;

		$req = $ses->request( 'open-ils.cstore.direct.asset.copy_location.search', { id => { '!=' => undef } } );

    		while (my $s = $req->recv) {
        		die $req->failed->stringify if ($req->failed);
        		$s = $s->content;
        		last unless ($s);
	    		$shelves{$s->id} = $s;
    		}
    		$req->finish;

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
        		$r->print( OpenSRF::Utils::JSON->perl2JSON($bib) );
        		next;
    		}

		try {

			my $req = MARC::Record->new_from_xml( $bib->marc, $encoding, $format );
			$req->delete_field( $_ ) for ($req->field(901));

			$req->append_fields(
				MARC::Field->new(
					901, '', '', 
					a => $bib->$tcn_v,
					b => $bib->$tcn_s,
					c => $bib->id
				)
			);


			if ($holdings) {
        			my $cn_list = $bib->call_numbers;
        			if ($cn_list && @$cn_list) {

            				my $cp_list = [ map { @{ $_->copies } } @$cn_list ];
            				if ($cp_list && @$cp_list) {

	            				my %cn_map;
	            				push @{$cn_map{$_->call_number}}, $_ for (@$cp_list);
		                        
	            				for my $cn ( @$cn_list ) {
	                				my $cn_map_list = $cn_map{$cn->id};
	
	                				for my $cp ( @$cn_map_list ) {
		                        
								$req->append_fields(
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
			}

			if (uc($format) eq 'XML') {
				my $x = $req->as_xml_record;
				$x =~ s/^<\?xml version="1.0" encoding="UTF-8"\?>//o;
				$r->print($x);
			} elsif (uc($format) eq 'UNIMARC') {
				$r->print($req->as_unimarc);
			} elsif (uc($format) eq 'USMARC') {
				$r->print($req->as_usmarc);
			}

		} otherwise {
			my $e = shift;
			warn "\n$e\n";
		};

	}

	$r->print("</collection>\n") if ($format eq 'XML');

	return Apache2::Const::OK;

}

sub show_template {
	my $r = shift;

	$r->content_type('text/html');
	$r->print(<<HTML);

<html>
	<head>
		<title>Record Export</title>
	</head>
	<body>
		<form method="POST" enctype="multipart/form-data">
			Use field number <input type="text" size="2" maxlength="2" name="idcolumn" value="0"/> (starting from 0)
			from CSV file <input type="file" name="idfile"/>
			<br/><br/> <b>or</b> <br/><br/>
			Record ID <input type="text" size="12" maxlength="12" name="id"/>
			<br/><br/> Record Type:
			<select name="type">
				<option value="biblio">Bibliographic Records</option>
				<option value="authority">Authority Records</option>
			</select>
			<br/> Record Fromat:
			<select name="format">
				<option value="USMARC">MARC21</option>
				<option value="UNIMARC">UNIMARC</option>
				<option value="XML">MARC XML</option>
				<option value="BRE">Evergreen BRE</option>
			</select>
			<br/> Record Encoding:
			<select name="encoding">
				<option value="UTF-8">UTF-8</option>
				<option value="MARC8">MARC8</option>
			</select>
			<br/> Include holdings in Bibliographic Records:
			<input type="checkbox" name="holdings" value="1">
			<br/><br/><input type="submit" value="Retrieve Records"/>
		</form>
	</body>
</html>

HTML

	return Apache2::Const::OK;
}

1;
