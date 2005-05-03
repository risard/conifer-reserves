#!/usr/bin/perl
use strict;

use OpenILS::Application::Storage;
use OpenILS::Application::Storage::CDBI;

# I need to abstract the driver loading away...
use OpenILS::Application::Storage::Driver::Pg;

use CGI qw/:standard start_*/;

OpenILS::Application::Storage::CDBI->connection('dbi:Pg:host=10.0.0.2;dbname=open-ils-dev', 'postgres');
OpenILS::Application::Storage::CDBI->db_Main->{ AutoCommit } = 1;

my $cgi = new CGI;

#-------------------------------------------------------------------------------
# HTML part
#-------------------------------------------------------------------------------

print <<HEADER;
Content-type: text/html

<html>

<head>
	<style>
		table.table_class {
			border: dashed lightgrey 1px;
			background-color: #EEE;
			border-collapse: collapse;
		}

		deactivated {
			color: lightgrey;
		}

		tr.row_class td {
			border: solid lightgrey 1px;
		}
		
		tr.header_class th {
			background-color: lightblue;
		}

	</style>
<body style='padding: 25px;'>

<h1>Organizational Unit Type Setup</h1>
<hr/>

HEADER

#-------------------------------------------------------------------------------
# setup part
#-------------------------------------------------------------------------------

my %ou_cols = ( qw/id SysID name Name depth Depth parent ParentType can_have_vols CanHaveVolumes can_have_users CanHaveUsers/ );

my @col_display_order = ( qw/id name depth parent can_have_vols can_have_users/ );

#-------------------------------------------------------------------------------
# Logic part
#-------------------------------------------------------------------------------

if (my $action = $cgi->param('action')) {
	if ( $action eq 'Remove Selected' ) {
		for my $id ( ($cgi->param('id')) ) {
			actor::org_unit_type->retrieve($id)->delete;
		}
	} elsif ( $action eq 'Update Selected' ) {
		for my $id ( ($cgi->param('id')) ) {
			my $u = actor::org_unit_type->retrieve($id);
			for my $col (@col_display_order) {
				$u->$col( $cgi->param($col."_$id") );
			}
			$u->update;
		}
	} elsif ( $action eq 'Add New' ) {
		actor::org_unit_type->create( { map {defined($cgi->param($_)) ? ($_ => $cgi->param($_)) : () } @col_display_order } );
	}
}


#-------------------------------------------------------------------------------
# Form part
#-------------------------------------------------------------------------------
{
	#-----------------------------------------------------------------------
	# User form
	#-----------------------------------------------------------------------
	print	"<form method='POST'>".
		"<table class='table_class'><tr class='header_class'>\n";
	
	for my $col ( @col_display_order ) {
		print th($ou_cols{$col});
	}
	
	print '<th>Action</th></tr>';
	
	for my $row ( sort { $a->depth <=> $b->depth } (actor::org_unit_type->retrieve_all) ) {
		print Tr(
			td( $row->id() ),
			td("<input type='text' name='name_$row' value='". $row->name() ."'>"),
			td("<input type='text' size=3 name='depth_$row' value='". $row->depth() ."'>"),
			td("<select name='parent_$row'><option>-- Select One --</option>".do{
				my $out = '';
				for my $type ( sort {$a->depth <=> $b->depth} actor::org_unit_type->retrieve_all) {
					$out .= "<option value='$type' ".do{
							if ($row->parent == $type->id) {
								"selected";
							}
						}.">".$type->name.'</option>'
				}
				$out;
				}."</select>"),
			td("<input type='checkbox' name='can_have_vols_$row' value='t' ". do{if($row->can_have_vols){"checked"}} .">"),
			td("<input type='checkbox' name='can_have_users_$row' value='t' ". do{if($row->can_have_users){"checked"}} .">"),
			td("<input type='checkbox' value='$row' name='id'>"),
		);
	}

	print Tr(
		td(),
		td("<input type='text' name='name'>"),
		td("<input type='text' size=3 name='depth'>"),
		td("<select name='parent'><option>-- Select One --</option>".do{
			my $out = '';
			for my $type ( sort {$a->depth <=> $b->depth} actor::org_unit_type->retrieve_all) {
				$out .= "<option value='$type'>".$type->name.'</option>'
			}
			$out;
			}."</select>"),
		td("<input type='checkbox' name='can_have_vols' value='t'>"),
		td("<input type='checkbox' name='can_have_users' value='t'>"),
		td(),
	);
	print	"</table>";
	print	"<input type='submit' name='action' value='Remove Selected'/> | ";
	print	"<input type='submit' name='action' value='Update Selected'/> | ";
	print	"<input type='submit' name='action' value='Add New'/></form><hr/>";
}

print "</body></html>";


