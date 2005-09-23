package OpenILS::WWW::Reporter;
use strict; use warnings;

use Apache2 ();
use Apache2::Log;
use Apache2::Const -compile => qw(OK REDIRECT :log);
use APR::Const    -compile => qw(:error SUCCESS);
use Apache2::RequestRec ();
use Apache2::RequestIO ();
use Apache2::RequestUtil;
use CGI;

use Template qw(:template);

use OpenSRF::EX qw(:try);
use OpenSRF::System;
use XML::LibXML;

use OpenSRF::Utils::SettingsParser;



# set the bootstrap config and template include directory when 
# this module is loaded
my $bootstrap;
my $includes = [];  
my $base_xml;
#my $base_xml_doc;

sub import {
	my( $self, $bs_config, $tdir, $core_xml ) = @_;
	$bootstrap = $bs_config;
	$base_xml = $core_xml;
	$includes = [ $tdir ];
}


# our templates plugins are here
my $plugin_base = 'OpenILS::Template::Plugin';

sub child_init {
	OpenSRF::System->bootstrap_client( config_file => $bootstrap );

	#parse the base xml file
	#my $parser = XML::LibXML->new;
	#$base_xml_doc = $parser->parse_file($base_xml);

}

sub handler {

	my $apache = shift;
	my $cgi = CGI->new;

	my $path = $apache->path_info;
	(my $ttk = $path) =~ s{^/?([a-zA-Z0-9_]+).*?$}{$1}o;

	$ttk = "s1" unless $ttk;
	my $user;

	# if the user is not logged in via cookie, route them to the login page
	if(! ($user = verify_login($cgi->cookie("ses"))) ) {
		$ttk = "login";
	}

	print "Content-type: text/html; charset=utf-8\n\n";

	_process_template(
			apache		=> $apache,
			template		=> "$ttk.ttk",
			params		=> { 
				user => $user, 
				stage_dir => $ttk, 
				config_xml => $base_xml, 
				},
			);

	return Apache2::Const::OK;
}


sub _process_template {

	my %params = @_;
	my $ttk				= $params{template}		|| return undef;
	my $apache			= $params{apache}			|| undef;
	my $param_hash		= $params{params}			|| {};

	my $template;

	$template = Template->new( { 
		OUTPUT			=> $apache, 
		ABSOLUTE		=> 1, 
		RELATIVE		=> 1,
		PLUGIN_BASE		=> $plugin_base,
		INCLUDE_PATH	=> $includes, 
		PRE_CHOMP		=> 1,
		POST_CHOMP		=> 1,
		#LOAD_PERL		=> 1,
		} 
	);

	try {

		if( ! $template->process( $ttk, $param_hash ) ) { 
			warn  "Error Processing Template: " . $template->error();
			my $err = $template->error();
			$err =~ s/\n/\<br\/\>/g;
			warn "Error processing template $ttk\n";	
			my $string =  "<br><b>Unable to process template:<br/><br/> " . $err . "</b>";
			print "ERROR: $string";
			#$template->process( $error_ttk , { error => $string } );
		}

	} catch Error with {
		my $e = shift;
		warn "Error processing template $ttk:  $e - $@ \n";	
		print "<center><br/><br/><b>Error<br/><br/> $e <br/><br/> $@ </b><br/></center>";
		return;
	};

}

# returns 1 if the session is valid, 0 otherwise
sub verify_login {
	my $auth_token = shift;
	return 0 unless $auth_token;

	my $session = OpenSRF::AppSession->create("open-ils.auth");
	my $req = $session->request("open-ils.auth.session.retrieve", $auth_token );
	my $user = $req->gather(1);

	return 1 if ref($user);
	return 0;
}



1;
