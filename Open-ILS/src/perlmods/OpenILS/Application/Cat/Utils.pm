package OpenILS::Application::Cat::Utils;
use strict; use warnings;
use OpenILS::Utils::Fieldmapper;
use XML::LibXML;
use XML::LibXSLT;
use OpenSRF::Utils::SettingsParser;


my $parser		= XML::LibXML->new();
my $xslt			= XML::LibXSLT->new();
my $xslt_doc	=	$parser->parse_file( "/pines/cvs/ILS/Open-ILS/xsl/MARC21slim2MODS.xsl" );
my $mods_sheet = $xslt->parse_stylesheet( $xslt_doc );



sub new {
	my($class) = @_;
	$class = ref($class) || $class;
	return bless( {}, $class );
}


# ---------------------------------------------------------------------------
# Converts an XML nodeset into a tree
# This method expects a blessed Fieldmapper::biblio::record_node object 
sub nodeset2tree {
	my($class, $nodeset) = @_;

	for my $child (@$nodeset) {
		next unless ($child and defined($child->parent_node));
		my $parent = $nodeset->[$child->parent_node];
		$parent->children([]) unless defined($parent->children); 
		$child->isnew(0);
		$child->isdeleted(0);
		push( @{$parent->children}, $child );
	}

	return $nodeset->[0];
}

# ---------------------------------------------------------------------------
# Converts a tree into an xml nodeset
# This method expects a blessed Fieldmapper::biblio::record_node object 

sub tree2nodeset {
	my($self, $node, $newnodes) = @_;

	return $newnodes unless $node;

	if(!$newnodes) { $newnodes = []; }

	push( @$newnodes, $node );

	if( $node->children() ) {

		for my $child (@{ $node->children() }) {

			new Fieldmapper::biblio::record_node ($child);
	
			if(!defined($child->parent_node)) {
				$child->parent_node($node->intra_doc_id);
				$child->ischanged(1); #just to be sure
			}
	
			$self->tree2nodeset( $child, $newnodes );
		}
	}

	$node->children([]); #we don't need them hanging around
	return $newnodes;
}

# ---------------------------------------------------------------------------
# Walks a nodeset and checks for insert, update, and delete and makes 
# appropriate db calls
# This method expects a blessed Fieldmapper::biblio::record_node object 
sub commit_nodeset {
	my($self, $nodeset) = @_;

	my @_deleted = ();
	my @_added = ();
	my @_altered = ();

	my $size = @$nodeset;
	my $offset = 0;


	for my $index (0..$size) {


		my $pos = $index + $offset;
		my $node = $nodeset->[$index];
		next unless $node;


		if($node->isdeleted()) {
			$offset--;
			warn "Deleting Node " . $node->intra_doc_id() . "\n";
			push @_deleted, $node;
			next;
		}

		if($node->isnew()) {
			$node->intra_doc_id($pos);
			warn "Adding Node $pos\n";
			push @_added, $node;
			next;
		}

		if(	($node->intra_doc_id() 
				and $node->intra_doc_id() != $pos) ||
			 $node->ischanged() ) {

			warn "Updating Node " . $node->intra_doc_id() . " to $pos\n";

			$node->intra_doc_id($pos);
			push @_altered, $node;
			next;
		}
	}

	my $d = @_deleted;
	my $al = @_altered;
	my $a = @_added;

	# iterate through each list and send updates to the db

	my $hash = { added => $a, deleted => $d, updated =>  $al };
	return $hash;
}



# ---------------------------------------------------------------------------
# Utility method for turning a nodes_array ($nodelist->nodelist) into
# a perl structure
# ---------------------------------------------------------------------------
sub _nodeset_to_perl {
	my($self, $nodeset) = @_;
	return undef unless ($nodeset);
	my $xmldoc = 
		OpenILS::Utils::FlatXML->new()->nodeset_to_xml( $nodeset );

	# Evil, but for some reason necessary
	$xmldoc = $parser->parse_string( $xmldoc->toString() );
	return $self->marcxml_doc_to_mods_perl($xmldoc);
}


# ---------------------------------------------------------------------------
# Initializes a MARC -> Unified MODS batch process
# ---------------------------------------------------------------------------
sub start_mods_batch {
	my( $self, $master_doc ) = @_;
	$self->{master_doc} = $self->_nodeset_to_perl( $master_doc->nodeset );
}

# ---------------------------------------------------------------------------
# Completes a MARC -> Unified MODS batch process and returns the perl hash
# ---------------------------------------------------------------------------
sub finish_mods_batch {
	my $self = shift;
	my $perl = $self->{master_doc};
	$self->{master_doc} = undef;
	return $perl
}

# ---------------------------------------------------------------------------
# Pushes a marcxml nodeset into the current MODS batch
# ---------------------------------------------------------------------------
sub mods_push_nodeset {
	my( $self, $nodeset ) = @_;
	my $xmlperl	= $self->_nodeset_to_perl( $nodeset->nodeset );
	for my $subject( @{$xmlperl->{subject}} ) {
		push @{$self->{master_doc}->{subject}}, $subject;
	}
}



# ---------------------------------------------------------------------------
# Transforms a MARC21SLIM XML document into a MODS formatted perl hash
# ---------------------------------------------------------------------------
sub marcxml_doc_to_mods_perl {
	my( $self, $marcxml_doc ) = @_;
	my $mods = $mods_sheet->transform($marcxml_doc);
	my $perl = OpenSRF::Utils::SettingsParser::XML2perl( $mods->documentElement );
	return $perl->{mods} if $perl;
	return undef;
}



# ---------------------------------------------------------------------------
# Transforms a set of marcxml nodesets into a unified MODS perl hash.  The
# first doc is assumed to be the 'master'
# ---------------------------------------------------------------------------
sub marcxml_nodeset_list_to_mods_perl {
	my( $self, $nodeset_list ) = @_;
	my $master = $self->_nodeset_to_perl( shift(@$nodeset_list) );
	my $first;
	for my $nodes (@$nodeset_list) {
		my $xmlperl	= $self->_nodeset_to_perl( $nodes );
		for my $subject( @{$xmlperl->{subject}} ) {
			push @{$master->{subject}}, $subject;
		}
	}
	return $master;
}



# not really sure if we'll ever need this one...
sub marcxml_doc_to_mods_nodeset {
	my( $self, $marcxml_doc ) = @_;
	my $mods = $mods_sheet->transform($marcxml_doc);
	my $u = OpenILS::Utils::FlatXML->new();
	my $nodeset = $u->xmldoc_to_nodeset( $mods );
	return $nodeset->nodeset if $nodeset;
	return undef;
}







1;
