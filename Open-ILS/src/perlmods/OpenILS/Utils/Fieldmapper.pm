package Fieldmapper;
use OpenSRF::Utils::JSON;
use Data::Dumper;
use base 'OpenSRF::Application';
use OpenSRF::Utils::Logger;
use OpenSRF::Utils::SettingsClient;
use OpenSRF::System;
use XML::Simple;

my $log = 'OpenSRF::Utils::Logger';

use vars qw/$fieldmap $VERSION/;

sub publish_fieldmapper {
	my ($self,$client,$class) = @_;

	return $fieldmap unless (defined $class);
	return undef unless (exists($$fieldmap{$class}));
	return {$class => $$fieldmap{$class}};
}
__PACKAGE__->register_method(
	api_name	=> 'opensrf.open-ils.system.fieldmapper',
	api_level	=> 1,
	method		=> 'publish_fieldmapper',
);

#
# To dump the Javascript version of the fieldmapper struct use the command:
#
#	PERL5LIB=~/cvs/ILS/OpenSRF/src/perlmods/:~/cvs/ILS/Open-ILS/src/perlmods/ GEN_JS=1 perl -MOpenILS::Utils::Fieldmapper -e 'print "\n";'
#
# ... adjusted for your CVS sandbox, of course.
#

sub classes {
	return () unless (defined $fieldmap);
	return keys %$fieldmap;
}

import();
sub import {
	my $class = shift;
	my %args = @_;

	return if (keys %$fieldmap);
	return if (!OpenSRF::System->connected && !$args{IDL});

        # parse the IDL ...
        my $file = $args{IDL} || OpenSRF::Utils::SettingsClient->new->config_value( 'IDL' );
        my $idl = XMLin( $file, ForceArray => 0, KeyAttr => ['name', 'id'], ValueAttr => {link =>'key'} )->{class};
	for my $c ( keys %$idl ) {
		next unless ($idl->{$c}{'oils_obj:fieldmapper'});
		my $n = 'Fieldmapper::'.$idl->{$c}{'oils_obj:fieldmapper'};

		$log->debug("Building Fieldmapper class for [$n] from IDL");

		$$fieldmap{$n}{hint} = $c;
		$$fieldmap{$n}{virtual} = ($idl->{$c}{'oils_persist:virtual'} eq 'true') ? 1 : 0;
		$$fieldmap{$n}{table} = $idl->{$c}{'oils_persist:tablename'};
		$$fieldmap{$n}{sequence} = $idl->{$c}{fields}{'oils_persist:sequence'};
		$$fieldmap{$n}{identity} = $idl->{$c}{fields}{'oils_persist:primary'};

		for my $f ( keys %{ $idl->{$c}{fields}{field} } ) {
			$$fieldmap{$n}{fields}{$f} =
				{ virtual => ($idl->{$c}{fields}{field}{$f}{'oils_persist:virtual'} eq 'true') ? 1 : 0,
				  position => $idl->{$c}{fields}{field}{$f}{'oils_obj:array_position'},
				};

			if ($idl->{$c}{fields}{field}{$f}{'reporter:selector'}) {
				$$fieldmap{$n}{selector} = $idl->{$c}{fields}{field}{$f}{'reporter:selector'};
			}
		}
	}


	#-------------------------------------------------------------------------------
	# Now comes the evil!  Generate classes

	for my $pkg ( __PACKAGE__->classes ) {
		(my $cdbi = $pkg) =~ s/^Fieldmapper:://o;

		eval <<"		PERL";
			package $pkg;
			use base 'Fieldmapper';
		PERL

		my $pos = 0;
		for my $vfield ( qw/isnew ischanged isdeleted/ ) {
			$$fieldmap{$pkg}{fields}{$vfield} = { position => $pos, virtual => 1 };
			$pos++;
		}

		if (exists $$fieldmap{$pkg}{proto_fields}) {
			for my $pfield ( sort keys %{ $$fieldmap{$pkg}{proto_fields} } ) {
				$$fieldmap{$pkg}{fields}{$pfield} = { position => $pos, virtual => $$fieldmap{$pkg}{proto_fields}{$pfield} };
				$pos++;
			}
		}

		OpenSRF::Utils::JSON->register_class_hint(
			hint => $pkg->json_hint,
			name => $pkg,
			type => 'array',
		);

	}
}

sub new {
	my $self = shift;
	my $value = shift;
	$value = [] unless (defined $value);
	return bless $value => $self->class_name;
}

sub decast {
	my $self = shift;
	return [ @$self ];
}

sub DESTROY {}

sub AUTOLOAD {
	my $obj = shift;
	my $value = shift;
	(my $field = $AUTOLOAD) =~ s/^.*://o;
	my $class_name = $obj->class_name;

	my $fpos = $field;
	$fpos  =~ s/^clear_//og ;

	my $pos = $$fieldmap{$class_name}{fields}{$fpos}{position};

	if ($field =~ /^clear_/o) {
		{	no strict 'subs';
			*{$obj->class_name."::$field"} = sub {
				my $self = shift;
				$self->[$pos] = undef;
				return 1;
			};
		}
		return $obj->$field();
	}

	die "No field by the name $field in $class_name!"
		unless (exists $$fieldmap{$class_name}{fields}{$field} && defined($pos));


	{	no strict 'subs';
		*{$obj->class_name."::$field"} = sub {
			my $self = shift;
			my $new_val = shift;
			$self->[$pos] = $new_val if (defined $new_val);
			return $self->[$pos];
		};
	}
	return $obj->$field($value);
}

sub Selector {
	my $self = shift;
	return $$fieldmap{$self->class_name}{selector};
}

sub Identity {
	my $self = shift;
	return $$fieldmap{$self->class_name}{identity};
}

sub Sequence {
	my $self = shift;
	return $$fieldmap{$self->class_name}{sequence};
}

sub Table {
	my $self = shift;
	return $$fieldmap{$self->class_name}{table};
}

sub class_name {
	my $class_name = shift;
	return ref($class_name) || $class_name;
}

sub real_fields {
	my $self = shift;
	my $class_name = $self->class_name;
	my $fields = $$fieldmap{$class_name}{fields};

	my @f = grep {
			!$$fields{$_}{virtual}
		} sort {$$fields{$a}{position} <=> $$fields{$b}{position}} keys %$fields;

	return @f;
}

sub has_field {
	my $self = shift;
	my $field = shift;
	my $class_name = $self->class_name;
	return 1 if grep { $_ eq $field } keys %{$$fieldmap{$class_name}{fields}};
	return 0;
}

sub properties {
	my $self = shift;
	my $class_name = $self->class_name;
	return keys %{$$fieldmap{$class_name}{fields}};
}

sub to_bare_hash {
	my $self = shift;

	my %hash = ();
	for my $f ($self->properties) {
		my $val = $self->$f;
		$hash{$f} = $val;
	}

	return \%hash;
}

sub clone {
	my $self = shift;
	return $self->new( [@$self] );
}

sub api_level {
	my $self = shift;
	return $fieldmap->{$self->class_name}->{api_level};
}

sub cdbi {
	my $self = shift;
	return $fieldmap->{$self->class_name}->{cdbi};
}

sub is_virtual {
	my $self = shift;
	my $field = shift;
	return $fieldmap->{$self->class_name}->{proto_fields}->{$field} if ($field);
	return $fieldmap->{$self->class_name}->{virtual};
}

sub is_readonly {
	my $self = shift;
	my $field = shift;
	return $fieldmap->{$self->class_name}->{readonly};
}

sub json_hint {
	my $self = shift;
	return $fieldmap->{$self->class_name}->{hint};
}


1;
