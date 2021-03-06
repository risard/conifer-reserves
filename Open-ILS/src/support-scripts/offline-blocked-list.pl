#!/usr/bin/perl
#

use strict; use warnings;

use Getopt::Long;

use OpenSRF::Utils::JSON;     # for the oils_requestor approach
use IPC::Open2 qw/open2/;     # for the oils_requestor approach
use Net::Domain qw/hostfqdn/; # for the oils_requestor approach

# use OpenSRF::EX qw(:try);   # for traditional approach 
use OpenSRF::System;        # for traditional approach 
use OpenSRF::AppSession;    # for traditional approach 

### USAGE

sub usage {
    my $defhost = hostfqdn();
    return <<END_OF_USAGE

$0

Generate a file of blocked barcodes for offline use.  There are two styles of 
invocation, old and new (using oils_requestor).  See WARNING.

By default, all known blocked barcodes are output.  Override with --barcodes option.

OPTIONS:

--oldstyle  Use traditional OpenSRF calls       default: OFF.
--verbose   give feedback on STDERR, including number of barcodes fetched
--help      print this message

--config   =[file] core config file             default: /openils/conf/opensrf_core.xml
--requestor=[/path/to/requstor]                 default: /openils/bin/oils_requestor
--hostname =[my.fqdn.com]                       default: hostfqdn()
                                                (Only used by new style.)  
     May be necessary if hostfqdn does not match router configs.
     Currently your hostfqdn is '$defhost'.

--barcodes [key=eg_code]                        default: ALL 
     Specify what kind of barcodes to fetch and how to tag them in the output.
     The key is the (one letter) tag used in the offline file,
     and the eg_code is the component of the SRF call that targets the barcodes
     (like "lost").  NOTE: This option can be specified multiple times.
           

EXAMPLES:

# Use the old style with a custom config
$0 --config /openils/conf/test_core.xml --oldstyle

# Append just lost and barred barcodes to file, showing feedback on STDERR
$0 --verbose --barcodes L=lost --barcodes B=barred >>file

WARNING:
The new style offers performance benefits but seems to lose one line of data per call.

END_OF_USAGE
}

### DEFAULTS

my $config    = '/openils/conf/opensrf_core.xml';
my $oils_reqr = '/openils/bin/oils_requestor';
my $context   = 'opensrf';
my $hostname  = hostfqdn();
my $help      = 0;
my $verbose   = 0;
my $approach  = 0;
my %types     = ();

GetOptions(
    "barcodes=s" => \%types,
      "config"   => \$config,
      "oldstyle" => \$approach,
      "hostname" => \$hostname,
     "requestor" => \$oils_reqr,
      "verbose"  => \$verbose,
       "help"    => \$help,
);

### SANITY CHECK

print usage() and exit if $help;

(-r $config) or die "Cannot read config file\n";

%types or %types = (    # If you don't specify, you get'm all.
    L => 'lost',
    E => 'expired',     # Possibly too many, making the file too large for download
    B => 'barred',
    D => 'penalized',
);

my %counts = ();
foreach (keys %types) {
    $counts{$_} = 0;    # initialize count
}

### FEEDBACK

if ($verbose) {
    print STDERR "verbose feedback is ON\n";
    print STDERR "hostname: $hostname\n";
    print STDERR "barcodes types:\n";
    foreach (sort keys %types) {
        print STDERR " $_ ==> $types{$_}\n";
    }
    print STDERR "Using the ", ($approach ? 'traditional' : 'new oils'), " approach\n";
}

### Engine of the new style piped approach
### Note, this appears to LOSE DATA, specifically one barcode value from each call.

sub runmethod {
    my $method  = shift;
    my $key     = shift;
    my $command = "echo \"open-ils.storage $method\" | $oils_reqr -f $config -c $context -h $hostname";
    $verbose and print STDERR "\nCOMMAND:\n-> $command\n";

    my ($child_stdout, $child_stdin);
    my $pid = open2($child_stdout, $child_stdin, $command);
    for my $barcode (<$child_stdout>) {
        next if $barcode =~ /^oils/o; # hack to chop out the oils_requestor prompt
        next if $barcode =~ /^Connected to OpenSRF/o;
        chomp $barcode;
        $barcode = OpenSRF::Utils::JSON->JSON2perl($barcode);
        print "$barcode $key\n" if $barcode;
        $counts{$key}++;
    }
    close($child_stdout);
    close($child_stdin);
    waitpid($pid, 0); # don't leave any zombies (see ipc::open2)
}

### MAIN

if (! $approach) {
    # ------------------------------------------------------------
    # This sends the method calls to storage via oils_requestor,
    # which is able to process the results much faster
    # Make this the default for now.
    # ------------------------------------------------------------

    foreach my $key (keys %types) {
        runmethod('open-ils.storage.actor.user.' . $types{$key} . '_barcodes', $key);
    }

} else {
    # ------------------------------------------------------------
    # Uses the traditional opensrf Perl API approach
    # ------------------------------------------------------------

    OpenSRF::System->bootstrap_client( config_file => $config );

    my $ses = OpenSRF::AppSession->connect( 'open-ils.storage' );

    foreach my $key (keys %types) {
        my $req = $ses->request( 'open-ils.storage.actor.user.' . $types{$key} . '_barcodes' );
        while (my $resp = $req->recv) {
            print $resp->content, " $key\n";
            $counts{$key}++;
        }
        $req->finish;
    }

    $ses->disconnect;
    $ses->finish;
}

if ($verbose) {
    print STDERR "\nBarcodes retrieved:\n";
    foreach (sort keys %types) {
        printf STDERR " %s ==> %9s ==> %d\n", $_, $types{$_}, $counts{$_};
    }
    print STDERR "\ndone\n";
}

