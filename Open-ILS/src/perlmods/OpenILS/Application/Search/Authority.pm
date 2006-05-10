package OpenILS::Application::Search::Authority;
use base qw/OpenSRF::Application/;
use strict; use warnings;

use OpenILS::Utils::Fieldmapper;
use OpenILS::Application::AppUtils;

use JSON;

use Time::HiRes qw(time);
use OpenSRF::EX qw(:try);
use Digest::MD5 qw(md5_hex);

sub crossref_authority {
	my $self = shift;
	my $client = shift;
	my $class = shift;
	my $term = shift;

	my $session = OpenSRF::AppSession->create("open-ils.storage");

	my $freq = $session->request(
		"open-ils.storage.authority.$class.see_from.controlled.atomic",$term, 10);
	my $areq = $session->request(
		"open-ils.storage.authority.$class.see_also_from.controlled.atomic",$term, 10);

	my $fr = $freq->gather(1);
	my $al = $areq->gather(1);

	return _auth_flatten( $term, $fr, $al, 1 );
}

sub _auth_flatten {
	my $term = shift;
	my $fr = shift;
	my $al = shift;
	my $limit = shift;

	my %hash = ();
	for my $x (@$fr) {
		my $string = $$x[0];
		for my $i (1..10) {
			last unless ($$x[$i]);
			if ($string =~ /\W$/o) {
				$string .= ' '.$$x[$i];
			} else {
				$string .= ' -- '.$$x[$i];
			}
		}
		next if (lc($string) eq lc($term));
		$hash{$string}++;
		$hash{$string}++ if (lc($$x[0]) eq lc($term));
	}
	my $from = [ sort { $hash{$b} <=> $hash{$a} || $a cmp $b } keys %hash ];

#	$from = [ @$from[0..4] ] if $limit;

	%hash = ();
	for my $x (@$al) {
		my $string = $$x[0];
		for my $i (1..10) {
			last unless ($$x[$i]);
			if ($string =~ /\W$/o) {
				$string .= ' '.$$x[$i];
			} else {
				$string .= ' -- '.$$x[$i];
			}
		}
		next if (lc($string) eq lc($term));
		$hash{$string}++;
		$hash{$string}++ if (lc($$x[0]) eq lc($term));
	}
	my $also = [ sort { $hash{$b} <=> $hash{$a} || $a cmp $b } keys %hash ];

#	$also = [ @$also[0..4] ] if $limit;


	return { from => $from, also => $also };
}

__PACKAGE__->register_method(
        method		=> "crossref_authority",
        api_name	=> "open-ils.search.authority.crossref",
        argc		=> 2, 
        note		=> "Searches authority data for existing controlled terms and crossrefs",
);              

__PACKAGE__->register_method(
	method		=> "crossref_authority_batch",
   api_name	=> "open-ils.search.authority.crossref.batch",
   argc		=> 1, 
   note		=> <<"	NOTE");
	Takes an array of class,term pair sub-arrays and performs an authority lookup for each

	PARAMS( [ ["subject", "earth"], ["author","shakespeare"] ] );

	Returns an object like so:
	{
		"classname" : {
			"term" : { "from" : [ ...], "also" : [...] }
			"term2" : { "from" : [ ...], "also" : [...] }
		}
	}
	NOTE

sub crossref_authority_batch {
	my( $self, $client, $reqs ) = @_;

	my $response = {};
	my $lastr = [];
	my $session = OpenSRF::AppSession->create("open-ils.storage");

	for my $req (@$reqs) {

		my $class = $req->[0];
		my $term = $req->[1];
		next unless $class and $term;
		warn "Sending authority request for $class : $term\n";
		my $freq = $session->request("open-ils.storage.authority.$class.see_from.controlled.atomic",$term, 10);
		my $areq = $session->request("open-ils.storage.authority.$class.see_also_from.controlled.atomic",$term, 10);

		if( $lastr->[0] ) { #process old data while waiting on new data
			my $cls = $lastr->[0];
			my $trm = $lastr->[1];
			my $fr	= $lastr->[2];
			my $al	= $lastr->[3];
			warn "Flattening $class : $term\n";
			$response->{$cls} = {} unless exists $response->{$cls};
			$response->{$cls}->{$trm} = _auth_flatten( $trm, $fr, $al, 1 );
		}

		$lastr->[0] = $class;
		$lastr->[1] = $term; 
		$lastr->[2] = $freq->gather(1);
		$lastr->[3] = $areq->gather(1);
	}

	if( $lastr->[0] ) { #process old data while waiting on new data
		my $cls = $lastr->[0];
		my $trm = $lastr->[1];
		my $fr	= $lastr->[2];
		my $al	= $lastr->[3];
		warn "Flattening $cls : $trm\n";
		$response->{$cls} = {} unless exists $response->{$cls};
		$response->{$cls}->{$trm} = _auth_flatten( $trm, $fr, $al, 1);
	}

	return $response;
}


1;
