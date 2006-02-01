#!/usr/bin/perl

#----------------------------------------------------------------
# Code for testing the container API
#----------------------------------------------------------------

require '../oils_header.pl';
use vars qw/ $apputils $memcache $user $authtoken $authtime /;
use strict; use warnings;
use Time::HiRes qw/time/;

#----------------------------------------------------------------
err("\nusage: $0 <config> <oils_login_username> ".
	" <oils_login_password> <patronid> <copy_barcode> [<type>, <noncat_type>]\n".
	"Where <type> is one of:\n".
	"\t'permit' to run the permit only\n".
	"\t'noncat_permit' to run the permit script against a noncat item\n".
	"\t'noncat' to check out a noncat item\n".
	"\t(blank) to do a regular checkout\n" ) unless $ARGV[4];
#----------------------------------------------------------------

my $config		= shift; 
my $username	= shift;
my $password	= shift;
my $patronid	= shift;
my $barcode		= shift;
my $type			= shift || "";
my $nc_type		= shift;

my $start;

sub go {
	osrf_connect($config);
	oils_login($username, $password);
	my $key = do_permit($patronid, $barcode, $type =~ /noncat/ ); 
	do_checkout($key, $patronid, $barcode, $type =~ /noncat/, $nc_type ) unless ($type =~ /permit/);
	oils_logout();
}

go();

#----------------------------------------------------------------

sub do_permit {
	my( $patronid, $barcode, $noncat ) = @_;

	my $args = { patron => $patronid, barcode => $barcode };
	if($noncat) {
		$args->{noncat} = 1;
		$args->{noncat_type} = $nc_type;
	}

	$start = time();
	my $resp = simplereq( 
		CIRC(), 'open-ils.circ.checkout.permit', $authtoken, $args );
	
	oils_event_die($resp);
	my $e = time() - $start;
	my $key = $resp->{payload};
	printl("Permit OK: \n\ttime =\t$e\n\tkey =\t$key" );
	return $key;
}

sub do_checkout {
	my( $key, $patronid, $barcode, $noncat, $nc_type ) = @_;

	my $args = { permit_key => $key, patron => $patronid, barcode => $barcode };
	if($noncat) {
		$args->{noncat} = 1;
		$args->{noncat_type} = $nc_type;
	}

	my $start_checkout = time();
	my $resp = osrf_request(
		'open-ils.circ', 
		'open-ils.circ.checkout', $authtoken, $args );
	my $finish = time();

	oils_event_die($resp);

	my $d = $finish - $start_checkout;
	my $dd = $finish - $start;

	printl("Checkout OK:");
	if(!$noncat) {
		printl("\ttime = $d");
		printl("\ttotal time = $dd");
		printl("\ttitle = " . $resp->{payload}->{record}->title );
		printl("\tdue_date = " . $resp->{payload}->{circ}->due_date );
	}
}




