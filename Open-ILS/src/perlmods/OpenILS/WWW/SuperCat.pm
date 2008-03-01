package OpenILS::WWW::SuperCat;
use strict; use warnings;

use Apache2::Log;
use Apache2::Const -compile => qw(OK REDIRECT DECLINED NOT_FOUND :log);
use APR::Const    -compile => qw(:error SUCCESS);
use Apache2::RequestRec ();
use Apache2::RequestIO ();
use Apache2::RequestUtil;
use CGI;
use Data::Dumper;
use SRU::Request;
use SRU::Response;

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
use OpenILS::WWW::SuperCat::Feed;
use OpenSRF::Utils::Logger qw/$logger/;

use MARC::Record;
use MARC::File::XML;

# set the bootstrap config when this module is loaded
my ($bootstrap, $cstore, $supercat, $actor, $parser, $search, $xslt, $cn_browse_xslt, %browse_types);

$browse_types{call_number}{xml} = sub {
	my $tree = shift;

	my $year = (gmtime())[5] + 1900;
	my $content = '';

	$content .= "<hold:volumes  xmlns:hold='http://open-ils.org/spec/holdings/v1'>";

	for my $cn (@$tree) {
		(my $cn_class = $cn->class_name) =~ s/::/-/gso;
		$cn_class =~ s/Fieldmapper-//gso;

		my $cn_tag = "tag:open-ils.org,$year:$cn_class/".$cn->id;
		my $cn_lib = $cn->owning_lib->shortname;
		my $cn_label = $cn->label;

		$cn_label =~ s/\n//gos;
		$cn_label =~ s/'/&apos;/go;

		(my $ou_class = $cn->owning_lib->class_name) =~ s/::/-/gso;
		$ou_class =~ s/Fieldmapper-//gso;

		my $ou_tag = "tag:open-ils.org,$year:$ou_class/".$cn->owning_lib->id;
		my $ou_name = $cn->owning_lib->name;

		$ou_name =~ s/\n//gos;
		$ou_name =~ s/'/&apos;/go;

		(my $rec_class = $cn->record->class_name) =~ s/::/-/gso;
		$rec_class =~ s/Fieldmapper-//gso;

		my $rec_tag = "tag:open-ils.org,$year:$rec_class/".$cn->record->id.'/'.$cn->owning_lib->shortname;

		$content .= "<hold:volume id='$cn_tag' lib='$cn_lib' label='$cn_label'>";
		$content .= "<act:owning_lib xmlns:act='http://open-ils.org/spec/actors/v1' id='$ou_tag' name='$ou_name'/>";

		my $r_doc = $parser->parse_string($cn->record->marc);
		$r_doc->documentElement->setAttribute( id => $rec_tag );
		$content .= entityize($r_doc->documentElement->toString);

		$content .= "</hold:volume>";
	}

	$content .= '</hold:volumes>';
	return ("Content-type: application/xml\n\n",$content);
};


$browse_types{call_number}{html} = sub {
	my $tree = shift;
	my $p = shift;
	my $n = shift;

	if (!$cn_browse_xslt) {
	        $cn_browse_xslt = $parser->parse_file(
        	        OpenSRF::Utils::SettingsClient
                	        ->new
                        	->config_value( dirs => 'xsl' ).
	                "/CNBrowse2HTML.xsl"
        	);
		$cn_browse_xslt = $xslt->parse_stylesheet( $cn_browse_xslt );
	}

	my (undef,$xml) = $browse_types{call_number}{xml}->($tree);

	return (
		"Content-type: text/html\n\n",
		entityize(
			$cn_browse_xslt->transform(
				$parser->parse_string( $xml ),
				'prev' => "'$p'",
				'next' => "'$n'"
			)->toString(1)
		)
	);
};

sub import {
	my $self = shift;
	$bootstrap = shift;
}


sub child_init {
	OpenSRF::System->bootstrap_client( config_file => $bootstrap );
	
	my $idl = OpenSRF::Utils::SettingsClient->new->config_value("IDL");
	Fieldmapper->import(IDL => $idl);

	$supercat = OpenSRF::AppSession->create('open-ils.supercat');
	$cstore = OpenSRF::AppSession->create('open-ils.cstore');
	$actor = OpenSRF::AppSession->create('open-ils.actor');
	$search = OpenSRF::AppSession->create('open-ils.search');
	$parser = new XML::LibXML;
	$xslt = new XML::LibXSLT;

        $cn_browse_xslt = $parser->parse_file(
                OpenSRF::Utils::SettingsClient
                        ->new
                        ->config_value( dirs => 'xsl' ).
                "/CNBrowse2HTML.xsl"
        );

	$cn_browse_xslt = $xslt->parse_stylesheet( $cn_browse_xslt );

}

sub oisbn {

	my $apache = shift;
	return Apache2::Const::DECLINED if (-e $apache->filename);

	(my $isbn = $apache->path_info) =~ s{^.*?([^/]+)$}{$1}o;

	my $list = $supercat
		->request("open-ils.supercat.oisbn", $isbn)
		->gather(1);

	print "Content-type: application/xml; charset=utf-8\n\n";
	print "<?xml version='1.0' encoding='UTF-8' ?>\n";

	unless (exists $$list{metarecord}) {
		print '<idlist/>';
		return Apache2::Const::OK;
	}

	print "<idlist metarecord='$$list{metarecord}'>\n";

	for ( keys %{ $$list{record_list} } ) {
		(my $o = $$list{record_list}{$_}) =~s/^(\S+).*?$/$1/o;
		print "  <isbn record='$_'>$o</isbn>\n"
	}

	print "</idlist>\n";

	return Apache2::Const::OK;
}

sub unapi {

	my $apache = shift;
	return Apache2::Const::DECLINED if (-e $apache->filename);

	my $cgi = new CGI;

	my $add_path = 0;
	if ( $cgi->server_software !~ m|^Apache/2.2| ) {
		my $rel_name = $cgi->url(-relative=>1);
		$add_path = 1 if ($cgi->url(-path_info=>1) !~ /$rel_name$/);
	}

	my $url = $cgi->url(-path_info=>$add_path);
	my $root = (split 'unapi', $url)[0];
	my $base = (split 'unapi', $url)[0] . 'unapi';


	my $uri = $cgi->param('id') || '';
	my $host = $cgi->virtual_host || $cgi->server_name;

	my $format = $cgi->param('format');
	my $flesh_feed = ($format =~ /-full$/o) ? 1 : 0;
	(my $base_format = $format) =~ s/-full$//o;
	my ($id,$type,$command,$lib) = ('','','');

	if (!$format) {
		my $body = "Content-type: application/xml; charset=utf-8\n\n";
	
		if ($uri =~ m{^tag:[^:]+:([^\/]+)/([^/]+)(?:/(.+))$}o) {
			$id = $2;
			$lib = uc($3);
			$type = 'record';
			$type = 'metarecord' if ($1 =~ /^m/o);

			my $list = $supercat
				->request("open-ils.supercat.$type.formats")
				->gather(1);

			if ($type eq 'record' or $type eq 'isbn') {
				$body .= <<"				FORMATS";
<formats id='$uri'>
	<format name='opac' type='text/html'/>
	<format name='html' type='text/html'/>
	<format name='htmlholdings' type='text/html'/>
	<format name='html-full' type='text/html'/>
	<format name='htmlholdings-full' type='text/html'/>
				FORMATS
			} elsif ($type eq 'metarecord') {
				$body .= <<"				FORMATS";
				<formats id='$uri'>
					<format name='opac' type='text/html'/>
				FORMATS
			}

			for my $h (@$list) {
				my ($type) = keys %$h;
				$body .= "\t<format name='$type' type='application/xml'";

				for my $part ( qw/namespace_uri docs schema_location/ ) {
					$body .= " $part='$$h{$type}{$part}'"
						if ($$h{$type}{$part});
				}
				
				$body .= "/>\n";

				if (OpenILS::WWW::SuperCat::Feed->exists($type)) {
					$body .= "\t<format name='$type-full' type='application/xml'";

					for my $part ( qw/namespace_uri docs schema_location/ ) {
						$body .= " $part='$$h{$type}{$part}'"
							if ($$h{$type}{$part});
					}
				
					$body .= "/>\n";
				}
			}

			$body .= "</formats>\n";

		} else {
			my $list = $supercat
				->request("open-ils.supercat.record.formats")
				->gather(1);
				
			push @$list,
				@{ $supercat
					->request("open-ils.supercat.metarecord.formats")
					->gather(1);
				};

			my %hash = map { ( (keys %$_)[0] => (values %$_)[0] ) } @$list;
			$list = [ map { { $_ => $hash{$_} } } sort keys %hash ];

			$body .= <<"			FORMATS";
<formats>
	<format name='opac' type='text/html'/>
	<format name='html' type='text/html'/>
	<format name='htmlholdings' type='text/html'/>
	<format name='html-full' type='text/html'/>
	<format name='htmlholdings-full' type='text/html'/>
			FORMATS


			for my $h (@$list) {
				my ($type) = keys %$h;
				$body .= "\t<format name='$type' type='application/xml'";

				for my $part ( qw/namespace_uri docs schema_location/ ) {
					$body .= " $part='$$h{$type}{$part}'"
						if ($$h{$type}{$part});
				}
				
				$body .= "/>\n";

				if (OpenILS::WWW::SuperCat::Feed->exists($type)) {
					$body .= "\t<format name='$type-full' type='application/xml'";

					for my $part ( qw/namespace_uri docs schema_location/ ) {
						$body .= " $part='$$h{$type}{$part}'"
							if ($$h{$type}{$part});
					}
				
					$body .= "/>\n";
				}
			}

			$body .= "</formats>\n";

		}
		print $body;
		return Apache2::Const::OK;
	}

	if ($uri =~ m{^tag:[^:]+:([^\/]+)/([^/]+)(?:/(.+))?}o) {
		$id = $2;
		$lib = uc($3);
		$type = 'record';
		$type = 'metarecord' if ($1 =~ /^metabib/o);
		$type = 'isbn' if ($1 =~ /^isbn/o);
		$type = 'call_number' if ($1 =~ /^call_number/o);
		$command = 'retrieve';
		$command = 'browse' if ($type eq 'call_number');
	}

	if (!$lib || $lib eq '-') {
	 	$lib = $actor->request(
			'open-ils.actor.org_unit_list.search' => parent_ou => undef
		)->gather(1)->[0]->shortname;
	}

	my $lib_object = $actor->request(
		'open-ils.actor.org_unit_list.search' => shortname => $lib
	)->gather(1)->[0];
	my $lib_id = $lib_object->id;

	my $ou_types = $actor->request( 'open-ils.actor.org_types.retrieve' )->gather(1);
	my $lib_depth = (grep { $_->id == $lib_object->ou_type } @$ou_types)[0]->depth;

	if ($type eq 'call_number' and $command eq 'browse') {
		print "Location: $root/browse/$base_format/call_number/$lib/$id\n\n";
		return 302;
	}

	if ($type eq 'isbn') {
		my $rec = $supercat->request('open-ils.supercat.isbn.object.retrieve',$id)->gather(1);
		if (!@$rec) {
			print "Content-type: text/html; charset=utf-8\n\n";
			$apache->custom_response( 404, <<"			HTML");
			<html>
				<head>
					<title>Type [$type] with id [$id] not found!</title>
				</head>
				<body>
					<br/>
					<center>Sorry, we couldn't $command a $type with the id of $id in format $format.</center>
				</body>
			</html>
			HTML
			return 404;
		}
		$id = $rec->[0]->id;
		$type = 'record';
	}

	if ( !grep
	       { (keys(%$_))[0] eq $base_format }
	       @{ $supercat->request("open-ils.supercat.$type.formats")->gather(1) }
	     and !grep
	       { $_ eq $base_format }
	       qw/opac html htmlholdings/
	) {
		print "Content-type: text/html; charset=utf-8\n\n";
		$apache->custom_response( 406, <<"		HTML");
		<html>
			<head>
				<title>Invalid format [$format] for type [$type]!</title>
			</head>
			<body>
				<br/>
				<center>Sorry, format $format is not valid for type $type.</center>
			</body>
		</html>
		HTML
		return 406;
	}

	if ($format eq 'opac') {
		print "Location: $root/../../en-US/skin/default/xml/rresult.xml?m=$id&l=$lib_id&d=$lib_depth\n\n"
			if ($type eq 'metarecord');
		print "Location: $root/../../en-US/skin/default/xml/rdetail.xml?r=$id&l=$lib_id&d=$lib_depth\n\n"
			if ($type eq 'record');
		return 302;
	} elsif (OpenILS::WWW::SuperCat::Feed->exists($base_format)) {
		my $feed = create_record_feed(
			$type,
			$format => [ $id ],
			$base,
			$lib,
			$flesh_feed
		);

		if (!$feed->count) {
			print "Content-type: text/html; charset=utf-8\n\n";
			$apache->custom_response( 404, <<"			HTML");
			<html>
				<head>
					<title>Type [$type] with id [$id] not found!</title>
				</head>
				<body>
					<br/>
					<center>Sorry, we couldn't $command a $type with the id of $id in format $format.</center>
				</body>
			</html>
			HTML
			return 404;
		}

		$feed->root($root);
		$feed->creator($host);
		$feed->update_ts(gmtime_ISO8601());
		$feed->link( unapi => $base) if ($flesh_feed);

		print "Content-type: ". $feed->type ."; charset=utf-8\n\n";
		print entityize($feed->toString) . "\n";

		return Apache2::Const::OK;
	}

	my $req = $supercat->request("open-ils.supercat.$type.$format.$command",$id);
	my $data = $req->gather(1);

	if ($req->failed || !$data) {
		print "Content-type: text/html; charset=utf-8\n\n";
		$apache->custom_response( 404, <<"		HTML");
		<html>
			<head>
				<title>$type $id not found!</title>
			</head>
			<body>
				<br/>
				<center>Sorry, we couldn't $command a $type with the id of $id in format $format.</center>
			</body>
		</html>
		HTML
		return 404;
	}

	print "Content-type: application/xml; charset=utf-8\n\n$data";

	return Apache2::Const::OK;
}

sub supercat {

	my $apache = shift;
	return Apache2::Const::DECLINED if (-e $apache->filename);

	my $cgi = new CGI;

	my $add_path = 0;
	if ( $cgi->server_software !~ m|^Apache/2.2| ) {
		my $rel_name = $cgi->url(-relative=>1);
		$add_path = 1 if ($cgi->url(-path_info=>1) !~ /$rel_name$/);
	}

	my $url = $cgi->url(-path_info=>$add_path);
	my $root = (split 'supercat', $url)[0];
	my $base = (split 'supercat', $url)[0] . 'supercat';
	my $unapi = (split 'supercat', $url)[0] . 'unapi';

	my $host = $cgi->virtual_host || $cgi->server_name;

	my $path = $cgi->path_info;
	my ($id,$type,$format,$command) = reverse split '/', $path;
	my $flesh_feed = ($type =~ /-full$/o) ? 1 : 0;
	(my $base_format = $format) =~ s/-full$//o;
	
	if ( $path =~ m{^/formats(?:/([^\/]+))?$}o ) {
		print "Content-type: application/xml; charset=utf-8\n";
		if ($1) {
			my $list = $supercat
				->request("open-ils.supercat.$1.formats")
				->gather(1);

			print "\n";

			print "<formats>
				   <format>
				     <name>opac</name>
				     <type>text/html</type>
				   </format>";

			if ($1 eq 'record' or $1 eq 'isbn') {
				print "<format>
				     <name>htmlholdings</name>
				     <type>text/html</type>
				   </format>
				   <format>
				     <name>html</name>
				     <type>text/html</type>
				   </format>
				   <format>
				     <name>htmlholdings-full</name>
				     <type>text/html</type>
				   </format>
				   <format>
				     <name>html-full</name>
				     <type>text/html</type>
				   </format>";
			}

			for my $h (@$list) {
				my ($type) = keys %$h;
				print "<format><name>$type</name><type>application/xml</type>";

				for my $part ( qw/namespace_uri docs schema_location/ ) {
					print "<$part>$$h{$type}{$part}</$part>"
						if ($$h{$type}{$part});
				}
				
				print '</format>';

				if (OpenILS::WWW::SuperCat::Feed->exists($type)) {
					print "<format><name>$type-full</name><type>application/xml</type>";

					for my $part ( qw/namespace_uri docs schema_location/ ) {
						print "<$part>$$h{$type}{$part}</$part>"
							if ($$h{$type}{$part});
					}
				
					print '</format>';
				}

			}

			print "</formats>\n";

			return Apache2::Const::OK;
		}

		my $list = $supercat
			->request("open-ils.supercat.record.formats")
			->gather(1);
				
		push @$list,
			@{ $supercat
				->request("open-ils.supercat.metarecord.formats")
				->gather(1);
			};

		my %hash = map { ( (keys %$_)[0] => (values %$_)[0] ) } @$list;
		$list = [ map { { $_ => $hash{$_} } } sort keys %hash ];

		print "\n<formats>
			   <format>
			     <name>opac</name>
			     <type>text/html</type>
			   </format>
			   <format>
			     <name>htmlholdings</name>
			     <type>text/html</type>
			   </format>
			   <format>
			     <name>html</name>
			     <type>text/html</type>
			   </format>
			   <format>
			     <name>htmlholdings-full</name>
			     <type>text/html</type>
			   </format>
			   <format>
			     <name>html-full</name>
			     <type>text/html</type>
			   </format>";

		for my $h (@$list) {
			my ($type) = keys %$h;
			print "<format><name>$type</name><type>application/xml</type>";

			for my $part ( qw/namespace_uri docs schema_location/ ) {
				print "<$part>$$h{$type}{$part}</$part>"
					if ($$h{$type}{$part});
			}
			
			print '</format>';

			if (OpenILS::WWW::SuperCat::Feed->exists($type)) {
				print "<format><name>$type-full</name><type>application/xml</type>";

				for my $part ( qw/namespace_uri docs schema_location/ ) {
					print "<$part>$$h{$type}{$part}</$part>"
						if ($$h{$type}{$part});
				}
				
				print '</format>';
			}

		}

		print "</formats>\n";


		return Apache2::Const::OK;
	}

	if ($format eq 'opac') {
		print "Location: $root/../../en-US/skin/default/xml/rresult.xml?m=$id\n\n"
			if ($type eq 'metarecord');
		print "Location: $root/../../en-US/skin/default/xml/rdetail.xml?r=$id\n\n"
			if ($type eq 'record');
		return 302;

	} elsif ($base_format eq 'marc21') {

		my $ret = 200;    
		try {
			my $bib = $supercat->request( "open-ils.supercat.record.object.retrieve", $id )->gather(1)->[0];
        
			my $r = MARC::Record->new_from_xml( $bib->marc, 'UTF-8', 'USMARC' );
			$r->delete_field( $_ ) for ($r->field(901));
                
			$r->append_fields(
				MARC::Field->new(
					901, '', '',
					a => $bib->tcn_value,
					b => $bib->tcn_source,
					c => $bib->id
				)
			);

			print "Content-type: application/octet-stream\n\n";
			print $r->as_usmarc;

		} otherwise {
			warn shift();
			
			print "Content-type: text/html; charset=utf-8\n\n";
			$apache->custom_response( 404, <<"			HTML");
			<html>
				<head>
					<title>ERROR</title>
				</head>
				<body>
					<br/>
					<center>Couldn't fetch $id as MARC21.</center>
				</body>
			</html>
			HTML
			$ret = 404;
		};

		return Apache2::Const::OK;

	} elsif (OpenILS::WWW::SuperCat::Feed->exists($base_format)) {
		my $feed = create_record_feed(
			$type,
			$format => [ $id ],
			undef, undef,
			$flesh_feed
		);

		$feed->root($root);
		$feed->creator($host);
		$feed->update_ts(gmtime_ISO8601());
		$feed->link( unapi => $base) if ($flesh_feed);

		print "Content-type: ". $feed->type ."; charset=utf-8\n\n";
		print entityize($feed->toString) . "\n";

		return Apache2::Const::OK;
	}

	my $req = $supercat->request("open-ils.supercat.$type.$format.$command",$id);
	$req->wait_complete;

	if ($req->failed) {
		print "Content-type: text/html; charset=utf-8\n\n";
		$apache->custom_response( 404, <<"		HTML");
		<html>
			<head>
				<title>$type $id not found!</title>
			</head>
			<body>
				<br/>
				<center>Sorry, we couldn't $command a $type with the id of $id in format $format.</center>
			</body>
		</html>
		HTML
		return 404;
	}

	print "Content-type: application/xml; charset=utf-8\n\n";
	print entityize( $parser->parse_string( $req->gather(1) )->documentElement->toString );

	return Apache2::Const::OK;
}


sub bookbag_feed {
	my $apache = shift;
	return Apache2::Const::DECLINED if (-e $apache->filename);

	my $cgi = new CGI;

	my $year = (gmtime())[5] + 1900;
	my $host = $cgi->virtual_host || $cgi->server_name;

	my $add_path = 0;
	if ( $cgi->server_software !~ m|^Apache/2.2| ) {
		my $rel_name = $cgi->url(-relative=>1);
		$add_path = 1 if ($cgi->url(-path_info=>1) !~ /$rel_name$/);
	}

	my $url = $cgi->url(-path_info=>$add_path);
	my $root = (split 'feed', $url)[0] . '/';
	my $base = (split 'bookbag', $url)[0] . '/bookbag';
	my $unapi = (split 'feed', $url)[0] . '/unapi';

	$root =~ s{(?<!http:)//}{/}go;
	$base =~ s{(?<!http:)//}{/}go;
	$unapi =~ s{(?<!http:)//}{/}go;

	my $path = $cgi->path_info;
	#warn "URL breakdown: $url -> $root -> $base -> $path -> $unapi";

	my ($id,$type) = reverse split '/', $path;
	my $flesh_feed = ($type =~ /-full$/o) ? 1 : 0;

	my $bucket = $actor->request("open-ils.actor.container.public.flesh", 'biblio', $id)->gather(1);
	return Apache2::Const::NOT_FOUND unless($bucket);

	my $bucket_tag = "tag:$host,$year:record_bucket/$id";
	if ($type eq 'opac') {
		print "Location: $root/../../en-US/skin/default/xml/rresult.xml?rt=list&" .
			join('&', map { "rl=" . $_->target_biblio_record_entry } @{ $bucket->items }) .
			"\n\n";
		return 302;
	}

	my $feed = create_record_feed(
		'record',
		$type,
		[ map { $_->target_biblio_record_entry } @{ $bucket->items } ],
		$unapi,
		undef,
		$flesh_feed
	);
	$feed->root($root);

	$feed->title("Items in Book Bag [".$bucket->name."]");
	$feed->creator($host);
	$feed->update_ts(gmtime_ISO8601());

	$feed->link(rss => $base . "/rss2-full/$id" => 'application/rss+xml');
	$feed->link(alternate => $base . "/atom-full/$id" => 'application/atom+xml');
	$feed->link(html => $base . "/html-full/$id" => 'text/html');
	$feed->link(unapi => $unapi);

	$feed->link(
		OPAC =>
		'/opac/en-US/skin/default/xml/rresult.xml?rt=list&' .
			join('&', map { 'rl=' . $_->target_biblio_record_entry } @{$bucket->items} ),
		'text/html'
	);


	print "Content-type: ". $feed->type ."; charset=utf-8\n\n";
	print entityize($feed->toString) . "\n";

	return Apache2::Const::OK;
}

sub changes_feed {
	my $apache = shift;
	return Apache2::Const::DECLINED if (-e $apache->filename);

	my $cgi = new CGI;

	my $year = (gmtime())[5] + 1900;
	my $host = $cgi->virtual_host || $cgi->server_name;

	my $add_path = 0;
	if ( $cgi->server_software !~ m|^Apache/2.2| ) {
		my $rel_name = $cgi->url(-relative=>1);
		$add_path = 1 if ($cgi->url(-path_info=>1) !~ /$rel_name$/);
	}

	my $url = $cgi->url(-path_info=>$add_path);
	my $root = (split 'feed', $url)[0];
	my $base = (split 'freshmeat', $url)[0] . 'freshmeat';
	my $unapi = (split 'feed', $url)[0] . 'unapi';

	my $path = $cgi->path_info;
	#warn "URL breakdown: $url ($rel_name) -> $root -> $base -> $path -> $unapi";

	$path =~ s/^\/(?:feed\/)?freshmeat\///og;
	
	my ($type,$rtype,$axis,$limit,$date) = split '/', $path;
	my $flesh_feed = ($type =~ /-full$/o) ? 1 : 0;
	$limit ||= 10;

	my $list = $supercat->request("open-ils.supercat.$rtype.record.$axis.recent", $date, $limit)->gather(1);

	#if ($type eq 'opac') {
	#	print "Location: $root/../../en-US/skin/default/xml/rresult.xml?rt=list&" .
	#		join('&', map { "rl=" . $_ } @$list) .
	#		"\n\n";
	#	return 302;
	#}

	my $feed = create_record_feed( 'record', $type, $list, $unapi, undef, $flesh_feed);
	$feed->root($root);

	if ($date) {
		$feed->title("Up to $limit recent $rtype ${axis}s from $date forward");
	} else {
		$feed->title("$limit most recent $rtype ${axis}s");
	}

	$feed->creator($host);
	$feed->update_ts(gmtime_ISO8601());

	$feed->link(rss => $base . "/rss2-full/$rtype/$axis/$limit/$date" => 'application/rss+xml');
	$feed->link(alternate => $base . "/atom-full/$rtype/$axis/$limit/$date" => 'application/atom+xml');
	$feed->link(html => $base . "/html-full/$rtype/$axis/$limit/$date" => 'text/html');
	$feed->link(unapi => $unapi);

	$feed->link(
		OPAC =>
		'/opac/en-US/skin/default/xml/rresult.xml?rt=list&' .
			join('&', map { 'rl=' . $_} @$list ),
		'text/html'
	);


	print "Content-type: ". $feed->type ."; charset=utf-8\n\n";
	print entityize($feed->toString) . "\n";

	return Apache2::Const::OK;
}

sub opensearch_osd {
	my $version = shift;
	my $lib = shift;
	my $class = shift;
	my $base = shift;

	if ($version eq '1.0') {
		print <<OSD;
Content-type: application/opensearchdescription+xml; charset=utf-8

<?xml version="1.0" encoding="UTF-8"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearchdescription/1.0/">
  <Url>$base/1.0/$lib/-/$class/?searchTerms={searchTerms}&amp;startPage={startPage}&amp;startIndex={startIndex}&amp;count={count}</Url>
  <Format>http://a9.com/-/spec/opensearchrss/1.0/</Format>
  <ShortName>$lib</ShortName>
  <LongName>Search $lib</LongName>
  <Description>Search the $lib OPAC by $class.</Description>
  <Tags>$lib book library</Tags>
  <SampleSearch>harry+potter</SampleSearch>
  <Developer>Mike Rylander for GPLS/PINES</Developer>
  <Contact>feedback\@open-ils.org</Contact>
  <SyndicationRight>open</SyndicationRight>
  <AdultContent>false</AdultContent>
</OpenSearchDescription>
OSD
	} else {
		print <<OSD;
Content-type: application/opensearchdescription+xml; charset=utf-8

<?xml version="1.0" encoding="UTF-8"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">
  <ShortName>$lib</ShortName>
  <Description>Search the $lib OPAC by $class.</Description>
  <Tags>$lib book library</Tags>
  <Url type="application/rss+xml"
       template="$base/1.1/$lib/rss2-full/$class/?searchTerms={searchTerms}&amp;startPage={startPage?}&amp;startIndex={startIndex?}&amp;count={count?}&amp;searchLang={language?}"/>
  <Url type="application/atom+xml"
       template="$base/1.1/$lib/atom-full/$class/?searchTerms={searchTerms}&amp;startPage={startPage?}&amp;startIndex={startIndex?}&amp;count={count?}&amp;searchLang={language?}"/>
  <Url type="application/x-mods3+xml"
       template="$base/1.1/$lib/mods3/$class/?searchTerms={searchTerms}&amp;startPage={startPage?}&amp;startIndex={startIndex?}&amp;count={count?}&amp;searchLang={language?}"/>
  <Url type="application/x-mods+xml"
       template="$base/1.1/$lib/mods/$class/?searchTerms={searchTerms}&amp;startPage={startPage?}&amp;startIndex={startIndex?}&amp;count={count?}&amp;searchLang={language?}"/>
  <Url type="application/x-marcxml+xml"
       template="$base/1.1/$lib/marcxml/$class/?searchTerms={searchTerms}&amp;startPage={startPage?}&amp;startIndex={startIndex?}&amp;count={count?}&amp;searchLang={language?}"/>
  <Url type="text/html"
       template="$base/1.1/$lib/html-full/$class/?searchTerms={searchTerms}&amp;startPage={startPage?}&amp;startIndex={startIndex?}&amp;count={count?}&amp;searchLang={language?}"/>
  <LongName>Search $lib</LongName>
  <Query role="example" searchTerms="harry+potter" />
  <Developer>Mike Rylander for GPLS/PINES</Developer>
  <Contact>feedback\@open-ils.org</Contact>
  <SyndicationRight>open</SyndicationRight>
  <AdultContent>false</AdultContent>
  <Language>en-US</Language>
  <OutputEncoding>UTF-8</OutputEncoding>
  <InputEncoding>UTF-8</InputEncoding>
</OpenSearchDescription>
OSD
	}

	return Apache2::Const::OK;
}

sub opensearch_feed {
	my $apache = shift;
	return Apache2::Const::DECLINED if (-e $apache->filename);

	my $cgi = new CGI;
	my $year = (gmtime())[5] + 1900;

	my $host = $cgi->virtual_host || $cgi->server_name;

	my $add_path = 0;
	if ( $cgi->server_software !~ m|^Apache/2.2| ) {
		my $rel_name = $cgi->url(-relative=>1);
		$add_path = 1 if ($cgi->url(-path_info=>1) !~ /$rel_name$/);
	}

	my $url = $cgi->url(-path_info=>$add_path);
	my $root = (split 'opensearch', $url)[0];
	my $base = (split 'opensearch', $url)[0] . 'opensearch';
	my $unapi = (split 'opensearch', $url)[0] . 'unapi';

	my $path = $cgi->path_info;
	#warn "URL breakdown: $url ($rel_name) -> $root -> $base -> $path -> $unapi";

	if ($path =~ m{^/?(1\.\d{1})/(?:([^/]+)/)?([^/]+)/osd.xml}o) {
		
		my $version = $1;
		my $lib = uc($2);
		my $class = $3;

		if (!$lib || $lib eq '-') {
		 	$lib = $actor->request(
				'open-ils.actor.org_unit_list.search' => parent_ou => undef
			)->gather(1)->[0]->shortname;
		}

		if ($class eq '-') {
			$class = 'keyword';
		}

		return opensearch_osd($version, $lib, $class, $base);
	}


	my $page = $cgi->param('startPage') || 1;
	my $offset = $cgi->param('startIndex') || 1;
	my $limit = $cgi->param('count') || 10;

	$page = 1 if ($page !~ /^\d+$/);
	$offset = 1 if ($offset !~ /^\d+$/);
	$limit = 10 if ($limit !~ /^\d+$/); $limit = 25 if ($limit > 25);

	if ($page > 1) {
		$offset = ($page - 1) * $limit;
	} else {
		$offset -= 1;
	}

	my ($version,$org,$type,$class,$terms,$sort,$sortdir,$lang) = ('','','','','','','','');
	(undef,$version,$org,$type,$class,$terms,$sort,$sortdir,$lang) = split '/', $path;

	$lang = $cgi->param('searchLang') if $cgi->param('searchLang');
	$lang = '' if ($lang eq '*');

	$sort = $cgi->param('searchSort') if $cgi->param('searchSort');
	$sortdir = $cgi->param('searchSortDir') if $cgi->param('searchSortDir');
	$terms .= " " . $cgi->param('searchTerms') if $cgi->param('searchTerms');

	$class = $cgi->param('searchClass') if $cgi->param('searchClass');
	$class ||= '-';

	$type = $cgi->param('responseType') if $cgi->param('responseType');
	$type ||= '-';

	$org = $cgi->param('searchOrg') if $cgi->param('searchOrg');
	$org ||= '-';


	my $kwt = $cgi->param('kw');
	my $tit = $cgi->param('ti');
	my $aut = $cgi->param('au');
	my $sut = $cgi->param('su');
	my $set = $cgi->param('se');

	$terms .= " keyword: $kwt" if ($kwt);
	$terms .= " title: $tit" if ($tit);
	$terms .= " author: $aut" if ($aut);
	$terms .= " subject: $sut" if ($sut);
	$terms .= " series: $set" if ($set);

	if ($version eq '1.0') {
		$type = 'rss2';
	} elsif ($type eq '-') {
		$type = 'atom';
	}
	my $flesh_feed = ($type =~ /-full$/o) ? 1 : 0;

	$terms = decode_utf8($terms);
	$terms =~ s/\+/ /go;
	$terms =~ s/'//go;
	$terms =~ s/^\s+//go;
	my $term_copy = $terms;

	my $complex_terms = 0;
	if ($terms eq 'help') {
		print $cgi->header(-type => 'text/html');
		print <<"		HTML";
			<html>
			 <head>
			  <title>just type something!</title>
			 </head>
			 <body>
			  <p>You are in a maze of dark, twisty stacks, all alike.</p>
			 </body>
			</html>
		HTML
		return Apache2::Const::OK;
	}

	my $cache_key = '';
	my $searches = {};
	while ($term_copy =~ s/((?:keyword(?:\|\w+)?|title(?:\|\w+)?|author(?:\|\w+)?|subject(?:\|\w+)?|series(?:\|\w+)?|site|dir|sort|lang):[^:]+)$//so) {
		my ($c,$t) = split ':' => $1;
		if ($c eq 'site') {
			$org = $t;
			$org =~ s/^\s*//o;
			$org =~ s/\s*$//o;
		} elsif ($c eq 'sort') {
			($sort = lc($t)) =~ s/^\s*(\w+)\s*$/$1/go;
		} elsif ($c eq 'dir') {
			($sortdir = lc($t)) =~ s/^\s*(\w+)\s*$/$1/go;
		} elsif ($c eq 'lang') {
			($lang = lc($t)) =~ s/^\s*(\w+)\s*$/$1/go;
		} else {
			$$searches{$c}{term} .= ' '.$t;
			$cache_key .= $c . $t;
			$complex_terms = 1;
		}
	}

	$lang = 'eng' if ($lang eq 'en-US');

	if ($term_copy) {
		no warnings;
		$class = 'keyword' if ($class eq '-');
		$$searches{$class}{term} .= " $term_copy";
		$cache_key .= $class . $term_copy;
	}

	my $org_unit;
	if ($org eq '-') {
	 	$org_unit = $actor->request(
			'open-ils.actor.org_unit_list.search' => parent_ou => undef
		)->gather(1);
	} else {
	 	$org_unit = $actor->request(
			'open-ils.actor.org_unit_list.search' => shortname => uc($org)
		)->gather(1);
	}

	{ no warnings; $cache_key .= $org.$sort.$sortdir.$lang; }

	my $rs_name = $cgi->cookie('os_session');
	my $cached_res = OpenSRF::Utils::Cache->new->get_cache( "os_session:$rs_name" ) if ($rs_name);

	my $recs;
	if (!($recs = $$cached_res{os_results}{$cache_key})) {
		$rs_name = $cgi->remote_host . '::' . rand(time);
		$recs = $search->request(
			'open-ils.search.biblio.multiclass' => {
				searches	=> $searches,
				org_unit	=> $org_unit->[0]->id,
				offset		=> 0,
				limit		=> 5000,
				($sort ?    ( 'sort'     => $sort    ) : ()),
				($sortdir ? ( 'sort_dir' => $sortdir ) : ($sort ? (sort_dir => 'asc') : (sort_dir => 'desc') )),
				($lang ?    ( 'language' => $lang    ) : ()),
			}
		)->gather(1);
		try {
			$$cached_res{os_results}{$cache_key} = $recs;
			OpenSRF::Utils::Cache->new->put_cache( "os_session:$rs_name", $cached_res, 1800 );
		} catch Error with {
			warn "supercat unable to store IDs in memcache server\n";
			$logger->error("supercat unable to store IDs in memcache server");
		};
	}

	my $feed = create_record_feed(
		'record',
		$type,
		[ map { $_->[0] } @{$recs->{ids}}[$offset .. $offset + $limit - 1] ],
		$unapi,
		$org,
		$flesh_feed
	);
	$feed->root($root);
	$feed->lib($org);
	$feed->search($terms);
	$feed->class($class);

	if ($complex_terms) {
		$feed->title("Search results for [$terms] at ".$org_unit->[0]->name);
	} else {
		$feed->title("Search results for [$class => $terms] at ".$org_unit->[0]->name);
	}

	$feed->creator($host);
	$feed->update_ts(gmtime_ISO8601());

	$feed->_create_node(
		$feed->{item_xpath},
		'http://a9.com/-/spec/opensearch/1.1/',
		'totalResults',
		$recs->{count},
	);

	$feed->_create_node(
		$feed->{item_xpath},
		'http://a9.com/-/spec/opensearch/1.1/',
		'startIndex',
		$offset + 1,
	);

	$feed->_create_node(
		$feed->{item_xpath},
		'http://a9.com/-/spec/opensearch/1.1/',
		'itemsPerPage',
		$limit,
	);

	$feed->link(
		next =>
		$base . "/$version/$org/$type/$class?searchTerms=$terms&searchSort=$sort&searchSortDir=$sortdir&searchLang=$lang&startIndex=" . int($offset + $limit + 1) . "&count=" . $limit =>
		'application/opensearch+xml'
	) if ($offset + $limit < $recs->{count});

	$feed->link(
		previous =>
		$base . "/$version/$org/$type/$class?searchTerms=$terms&searchSort=$sort&searchSortDir=$sortdir&searchLang=$lang&startIndex=" . int(($offset - $limit) + 1) . "&count=" . $limit =>
		'application/opensearch+xml'
	) if ($offset);

	$feed->link(
		self =>
		$base .  "/$version/$org/$type/$class?searchTerms=$terms&searchSort=$sort&searchSortDir=$sortdir&searchLang=$lang" =>
		'application/opensearch+xml'
	);

	$feed->link(
		rss =>
		$base .  "/$version/$org/rss2-full/$class?searchTerms=$terms&searchSort=$sort&searchSortDir=$sortdir&searchLang=$lang" =>
		'application/rss+xml'
	);

	$feed->link(
		alternate =>
		$base .  "/$version/$org/atom-full/$class?searchTerms=$terms&searchSort=$sort&searchSortDir=$sortdir&searchLang=$lang" =>
		'application/atom+xml'
	);

	$feed->link(
		'html' =>
		$base .  "/$version/$org/html/$class?searchTerms=$terms&searchSort=$sort&searchSortDir=$sortdir&searchLang=$lang" =>
		'text/html'
	);

	$feed->link(
		'html-full' =>
		$base .  "/$version/$org/html-full/$class?searchTerms=$terms&searchSort=$sort&searchSortDir=$sortdir&searchLang=$lang" =>
		'text/html'
	);

	$feed->link( 'unapi-server' => $unapi);

#	$feed->link(
#		opac =>
#		$root . "../$lang/skin/default/xml/rresult.xml?rt=list&" .
#			join('&', map { 'rl=' . $_->[0] } grep { ref $_ && defined $_->[0] } @{$recs->{ids}} ),
#		'text/html'
#	);

	print $cgi->header(
		-type		=> $feed->type,
		-charset	=> 'UTF-8',
		-cookie		=> $cgi->cookie( -name => 'os_session', -value => $rs_name, -expires => '+30m' ),
	);

	print entityize($feed->toString) . "\n";

	return Apache2::Const::OK;
}

sub create_record_feed {
	my $search = shift;
	my $type = shift;
	my $records = shift;
	my $unapi = shift;

	my $lib = uc(shift()) || '-';
	my $flesh = shift;
	$flesh = 1 if (!defined($flesh));

	my $cgi = new CGI;
	my $base = $cgi->url;
	my $host = $cgi->virtual_host || $cgi->server_name;

	my $year = (gmtime())[5] + 1900;

	my $flesh_feed = ($type =~ s/-full$//o) ? 1 : 0;

	my $feed = new OpenILS::WWW::SuperCat::Feed ($type);
	$feed->base($base) if ($flesh);
	$feed->unapi($unapi) if ($flesh);

	$type = 'atom' if ($type eq 'html');
	$type = 'marcxml' if ($type eq 'htmlholdings');

	#$records = $supercat->request( "open-ils.supercat.record.object.retrieve", $records )->gather(1);

	my $count = 0;
	for my $record (@$records) {
		next unless($record);

		#my $rec = $record->id;
		my $rec = $record;

		my $item_tag = "tag:$host,$year:biblio-record_entry/$rec/$lib";
		$item_tag = "tag:$host,$year:isbn/$rec/$lib" if ($search eq 'isbn');

		my $xml = $supercat->request(
			"open-ils.supercat.$search.$type.retrieve",
			$rec
		)->gather(1);
		next unless $xml;

		my $node = $feed->add_item($xml);
		next unless $node;

		$xml = '';
		if ($lib && $type eq 'marcxml' &&  $flesh) {
			my $r = $supercat->request( "open-ils.supercat.$search.holdings_xml.retrieve", $rec, $lib );
			while ( !$r->complete ) {
				$xml .= join('', map {$_->content} $r->recv);
			}
			$xml .= join('', map {$_->content} $r->recv);
			$node->add_holdings($xml);
		}

		$node->id($item_tag) if ($flesh);
		#$node->update_ts(clense_ISO8601($record->edit_date));
		$node->link(alternate => $feed->unapi . "?id=$item_tag&format=htmlholdings-full" => 'text/html') if ($flesh);
		$node->link(opac => $feed->unapi . "?id=$item_tag&format=opac") if ($flesh);
		$node->link(unapi => $feed->unapi . "?id=$item_tag") if ($flesh);
		$node->link('unapi-id' => $item_tag) if ($flesh);
	}

	return $feed;
}

sub entityize {
	my $stuff = NFC(shift());
	$stuff =~ s/&(?!\S+;)/&amp;/gso;
	$stuff =~ s/([\x{0080}-\x{fffd}])/sprintf('&#x%X;',ord($1))/sgoe;
	return $stuff;
}

sub string_browse {
	my $apache = shift;
	return Apache2::Const::DECLINED if (-e $apache->filename);

	my $cgi = new CGI;
	my $year = (gmtime())[5] + 1900;

	my $host = $cgi->virtual_host || $cgi->server_name;

	my $add_path = 0;
	if ( $cgi->server_software !~ m|^Apache/2.2| ) {
		my $rel_name = $cgi->url(-relative=>1);
		$add_path = 1 if ($cgi->url(-path_info=>1) !~ /$rel_name$/);
	}

	my $url = $cgi->url(-path_info=>$add_path);
	my $root = (split 'browse', $url)[0];
	my $base = (split 'browse', $url)[0] . 'browse';
	my $unapi = (split 'browse', $url)[0] . 'unapi';

	my $path = $cgi->path_info;
	$path =~ s/^\///og;

	my ($format,$axis,$site,$string,$page,$page_size) = split '/', $path;
	#warn " >>> $format -> $axis -> $site -> $string -> $page -> $page_size ";

	$site ||= $cgi->param('searchOrg');
	$page ||= $cgi->param('startPage') || 0;
	$page_size ||= $cgi->param('count') || 9;

	$page = 0 if ($page !~ /^-?\d+$/);

	my $prev = join('/', $base,$format,$axis,$site,$string,$page - 1,$page_size);
	my $next = join('/', $base,$format,$axis,$site,$string,$page + 1,$page_size);

	unless ($string and $axis and grep { $axis eq $_ } keys %browse_types) {
		warn "something's wrong...";
		warn " >>> $format -> $axis -> $site -> $string -> $page -> $page_size ";
		return undef;
	}

	$string = decode_utf8($string);
	$string =~ s/\+/ /go;
	$string =~ s/'//go;

	my $tree = $supercat->request(
		"open-ils.supercat.$axis.browse",
		$string,
		$site,
		$page_size,
		$page
	)->gather(1);

	my ($header,$content) = $browse_types{$axis}{$format}->($tree,$prev,$next);
	print $header.$content;
	return Apache2::Const::OK;
}

sub sru_search {
    my $cgi = new CGI;

    my $req = SRU::Request->newFromCGI( $cgi );
    my $resp = SRU::Response->newFromRequest( $req );

    if ( $resp->type eq 'searchRetrieve' ) {
		my $cql_query = $req->query;
		my $search_string = $req->cql->toEvergreen;

        warn "SRU search string [$cql_query] converted to [$search_string]\n";

 		my $recs = $search->request(
			'open-ils.search.biblio.multiclass.query' => {} => $search_string
		)->gather(1);

        $recs = $supercat->request( 'open-ils.supercat.record.object.retrieve' => $recs->{ids} );

        $resp->addRecord(
            SRU::Response::Record->new(
                recordSchema    => 'info:srw/schema/1/marcxml-v1.1',
                recordData => $_->marc
            )
        ) for @$recs;

    	print $cgi->header( -type => 'application/xml' );
    	print entityize($resp->toXML) . "\n";
	    return Apache2::Const::OK;
    }
}

{
    package CQL::BooleanNode;

    sub toEvergreen {
        my $self     = shift;
        my $left     = $self->left();
        my $right    = $self->right();
        my $leftStr  = $left->isa('CQL::TermNode') ? $left->toEvergreen()
            : '('.$left->toEvergreen().')';
        my $rightStr = $right->isa('CQL::TermNode') ? $right->toEvergreen()
            : '('.$right->toEvergreen().')';

        my $op =  '||' if uc $self->op() eq 'OR';
        $op ||=  '&&';

        return  "$leftStr $rightStr";
    }

    package CQL::TermNode;

    our %qualifier_map = (

        # Title class:
        'dc.title'              => 'title',
        'bib.titleabbreviated'  => 'title|abbreviated',
        'bib.titleuniform'      => 'title|uniform',
        'bib.titletranslated'   => 'title|translated',
        'bib.titlealternative'  => 'title',
        'bib.titleseries'       => 'series',

        # Author/Name class:
        'creator'               => 'author',
        'dc.creator'            => 'author',
        'dc.contributer'        => 'author',
        'dc.publisher'          => 'keyword',
        'bib.name'              => 'author',
        'bib.namepersonal'      => 'author|personal',
        'bib.namepersonalfamily'=> 'author|personal',
        'bib.namepersonalgiven' => 'author|personal',
        'bib.namecorporate'     => 'author|corporate',
        'bib.nameconference'    => 'author|converence',

        # Subject class:
        'dc.subject'            => 'subject',
        'bib.subjectplace'      => 'subject|geographic',
        'bib.subjecttitle'      => 'keyword',
        'bib.subjectname'       => 'subject|name',
        'bib.subjectoccupation' => 'keyword',

        # Keyword class:
        'srw.serverchoice'      => 'keyword',

        # Identifiers:
        'dc.identifier'         => 'keyword',

        # Dates:
        'bib.dateissued'        => undef,
        'bib.datecreated'       => undef,
        'bib.datevalid'         => undef,
        'bib.datemodified'      => undef,
        'bib.datecopyright'     => undef,

        # Resource Type:
        'dc.type'               => undef,

        # Format:
        'dc.format'             => undef,

        # Genre:
        'bib.genre'             => undef,

        # Target Audience:
        'bib.audience'          => undef,

        # Place of Origin:
        'bib.originplace'       => undef,

        # Language
        'dc.language'           => 'lang',

        # Edition
        'bib.edition'           => undef,

        # Part:
        'bib.volume'            => undef,
        'bib.issue'             => undef,
        'bib.startpage'         => undef,
        'bib.endpage'          => undef,

        # Issuance:
        'bib.issuance'          => undef,
    );

    sub toEvergreen {
        my $self      = shift;
        my $qualifier = maybeQuote( $self->getQualifier() );
        my $term      = $self->getTerm();
        my $relation  = $self->getRelation();

        my $query;
        if ( $qualifier and $qualifier_map{lc($qualifier)} ) {
            my $base      = $relation->getBase();
            my @modifiers = $relation->getModifiers();

            foreach my $m ( @modifiers ) {
                if( $m->[ 1 ] eq 'fuzzy' ) {
                    $term = "$term~";
                }
            }

            if( $base eq '=' ) {
                $base = ':';
            } else {
                croak( "Evergreen doesn't support relations other than '='" );
            }
            return "$qualifier$base$term";
        } elsif ($qualifier) {
            return "kw:$term";
        } else {
            return "";
        }
    }
}

1;
