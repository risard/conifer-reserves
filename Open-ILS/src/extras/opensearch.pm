package opensearch;
use strict;
use warnings;

use Apache2 ();
use Apache::Log;
use Apache::Const -compile => qw(OK REDIRECT :log);
use APR::Const    -compile => qw(:error SUCCESS);
use Apache::RequestRec ();
use Apache::RequestIO ();
use Apache::RequestUtil;

use CGI ();
use Template qw(:template);

use OpenSRF::EX qw(:try);
use OpenSRF::System;

sub handler {

	my $apache = shift;
	print "Content-type: application/rss+xml; charset=utf-8\n\n";

	my $template = Template->new( { 
		OUTPUT			=> $apache, 
		ABSOLUTE			=> 1, 
		RELATIVE			=> 1,
		PLUGIN_BASE		=> 'OpenILS::Template::Plugin',
		INCLUDE_PATH	=> ['/pines/cvs/ILS/Open-ILS/src/extras'], 
		PRE_CHOMP		=> 1,
		POST_CHOMP		=> 1,
		} 
	);

	try {

		if( ! $template->process( 'opensearch.ttk' ) ) { 
			warn "Error processing template opensearch.ttk\n";	
			warn  "Error Occured: " . $template->error();
			my $err = $template->error();
			$err =~ s/\n/\<br\/\>/g;
			print "<br><b>Unable to process template:<br/><br/> " . $err . "!!!</b>";
		}

	} catch Error with {
		my $e = shift;
		warn "Error processing template opensearch.ttk:  $e - $@ \n";	
		print "<center><br/><br/><b>Error<br/><br/> $e <br/><br/> $@ </b><br/></center>";
		return;
	};



	return Apache::OK;
}

1;
