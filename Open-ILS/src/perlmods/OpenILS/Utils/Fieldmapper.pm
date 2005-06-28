package Fieldmapper;
use JSON;
use Data::Dumper;
use base 'OpenSRF::Application';

use OpenSRF::Utils::Logger;
my $log = 'OpenSRF::Utils::Logger';

use OpenILS::Application::Storage::CDBI;
use OpenILS::Application::Storage::CDBI::actor;
use OpenILS::Application::Storage::CDBI::action;
use OpenILS::Application::Storage::CDBI::asset;
use OpenILS::Application::Storage::CDBI::biblio;
use OpenILS::Application::Storage::CDBI::config;
use OpenILS::Application::Storage::CDBI::metabib;
use OpenILS::Application::Storage::CDBI::money;

use vars qw/$fieldmap $VERSION/;

_init();

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

sub _init {
	return if (keys %$fieldmap);

	$fieldmap = 
	{
		'Fieldmapper::action::survey'			=> { hint		=> 'asv',
								     proto_fields	=> { questions	=> 1,
								     			     responses	=> 1 } },
		'Fieldmapper::action::survey_question'		=> { hint		=> 'asvq',
								     proto_fields	=> { answers	=> 1,
								     			     responses	=> 1 } },
		'Fieldmapper::action::survey_answer'		=> { hint		=> 'asva',
								     proto_fields	=> { responses => 1 } },
		'Fieldmapper::action::survey_response'		=> { hint		=> 'asvr'  },
		'Fieldmapper::action::circulation'		=> { hint		=> 'circ',
								     proto_fields	=> { due_date => 1 } },
		'Fieldmapper::actor::user'			=> { hint		=> 'au',
								     proto_fields	=> { cards		=> 1,
								     			     survey_responses	=> 1,
								     			     stat_cat_entries	=> 1,
								     			     addresses		=> 1 } },
		'Fieldmapper::actor::user_address'		=> { hint => 'aua'    },
		'Fieldmapper::actor::org_address'		=> { hint => 'aoa'    },
		'Fieldmapper::actor::profile'			=> { hint => 'ap'    },
		'Fieldmapper::actor::card'			=> { hint => 'ac'    },
		'Fieldmapper::config::standing'			=> { hint => 'cst'   },
		'Fieldmapper::config::copy_status'		=> { hint => 'ccs'   },
		'Fieldmapper::actor::stat_cat'			=> { hint 		=> 'actsc',
								     proto_fields	=> { entries => 1 } },
		'Fieldmapper::actor::stat_cat_entry'		=> { hint => 'actsce'    },
		'Fieldmapper::actor::stat_cat_entry_user_map'	=> { hint => 'actscecm'  },
		'Fieldmapper::actor::org_unit'			=> { hint 		=> 'aou',
								     proto_fields	=> { children => 1 } },
		'Fieldmapper::actor::org_unit_type'		=> { hint 		=> 'aout',
								     proto_fields	=> { children => 1 } },
		
		'Fieldmapper::biblio::record_node'		=> { hint		=> 'brn',
								     virtual		=> 1,
								     proto_fields	=> { children		=> 1,
								     			     id			=> 1,
								     			     owner_doc		=> 1,
								     			     intra_doc_id	=> 1,
								     			     parent_node	=> 1,
								     			     node_type		=> 1,
								     			     namespace_uri	=> 1,
								     			     name		=> 1,
								     			     value		=> 1,
											   } },

		'Fieldmapper::metabib::virtual_record'		=> { hint		=> 'mvr',
								     virtual		=> 1,
								     proto_fields	=> { title		=> 1,
											     author	        => 1,
								     			     doc_id	 	=> 1,
								     			     doc_type		=> 1,
								     			     isbn	 	=> 1,
								     			     pubdate		=> 1,
								     			     publisher	    	=> 1,
								     			     tcn		=> 1,
								     			     subject		=> 1,
								     			     types_of_resource	=> 1,
								     			     call_numbers	=> 1,
													  edition	=> 1,
											     copy_count	        => 1,
											     series	        => 1,
											     serials	        => 1,
											   } },

		'Fieldmapper::biblio::record_entry'		=> { hint		=> 'bre',
								     proto_fields	=> { call_numbers => 1,
								     			     fixed_fields => 1 } },
		#'Fieldmapper::biblio::record_marc'		=> { hint => 'brx'  }, # now it's inside record_entry

		'Fieldmapper::money::cash_payment'		=> { hint => 'mcp'  },
		'Fieldmapper::money::billing'			=> { hint => 'mb'  },

		'Fieldmapper::config::identification_type'	=> { hint => 'cit'  },
		'Fieldmapper::config::bib_source'		=> { hint => 'cbs'  },
		'Fieldmapper::config::metabib_field'		=> { hint => 'cmf'  },
		'Fieldmapper::config::rules::recuring_fine'	=> { hint => 'crrf'  },
		'Fieldmapper::config::rules::circ_duration'	=> { hint => 'crcd'  },
		'Fieldmapper::config::rules::max_fine'		=> { hint => 'crmf'  },

		'Fieldmapper::metabib::metarecord'		=> { hint => 'mmr'  },
		'Fieldmapper::metabib::title_field_entry'	=> { hint => 'mtfe' },
		'Fieldmapper::metabib::author_field_entry'	=> { hint => 'mafe' },
		'Fieldmapper::metabib::subject_field_entry'	=> { hint => 'msfe' },
		'Fieldmapper::metabib::keyword_field_entry'	=> { hint => 'mkfe' },
		'Fieldmapper::metabib::series_field_entry'	=> { hint => 'msefe' },
		'Fieldmapper::metabib::full_rec'		=> { hint => 'mfr'  },
		'Fieldmapper::metabib::record_descriptor'	=> { hint => 'mrd'  },
		'Fieldmapper::metabib::metarecord_source_map'	=> { hint => 'mmrsm'},

		'Fieldmapper::asset::copy'			=> { hint 		=> 'acp',
								     proto_fields	=> { stat_cat_entries => 1 } },
		'Fieldmapper::asset::stat_cat'			=> { hint 		=> 'asc',
								     proto_fields	=> { entries => 1 } },
		'Fieldmapper::asset::stat_cat_entry'		=> { hint => 'asce'    },
		'Fieldmapper::asset::stat_cat_entry_copy_map'	=> { hint => 'ascecm'  },
		'Fieldmapper::asset::copy_note'			=> { hint => 'acpn'    },
		'Fieldmapper::asset::copy_location'		=> { hint => 'acpl'    },
		'Fieldmapper::asset::call_number'		=> { hint		=> 'acn',
								     proto_fields	=> { copies => 1 } },
		'Fieldmapper::asset::call_number_note'		=> { hint => 'acnn'    },

		'Fieldmapper::permission::perm_list'		=> { hint => 'ppl'    },
		'Fieldmapper::permission::grp_tree'		=> { hint => 'pgt'    },
		'Fieldmapper::permission::usr_grp_map'		=> { hint => 'pugm'   },
		'Fieldmapper::permission::usr_perm_map'		=> { hint => 'pupm'   },
		'Fieldmapper::permission::grp_perm_map'		=> { hint => 'pgpm'   },
		'Fieldmapper::action::hold_request'		=> { hint => 'ahr'   },
		'Fieldmapper::action::hold_notification'	=> { hint => 'ahn'   },


		'Fieldmapper::ex'				=> { hint => 'ex',
								     virtual => 1,
								     proto_fields => {
									err_msg	=> 1,
									type	=> 1,
								     } },


		'Fieldmapper::perm_ex'				=> { hint => 'perm_ex',
								     virtual => 1,
								     proto_fields => {
									err_msg	=> 1,
									type	=> 1,
								     } },


      
	};

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

		unless ( $$fieldmap{$pkg}{virtual} ) {
			$$fieldmap{$pkg}{cdbi} = $cdbi;
			for my $col ( sort $cdbi->columns('All') ) {
				$$fieldmap{$pkg}{fields}{$col} = { position => $pos, virtual => 0 };
				$pos++;
			}
		}

		JSON->register_class_hint(
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
		unless (exists $$fieldmap{$class_name}{fields}{$field});


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

sub api_level {
	my $self = shift;
	return $fieldmap->{$self->class_name}->{api_level};
}


sub is_virtual {
	my $self = shift;
	my $field = shift;
	return $fieldmap->{$self->class_name}->{proto_fields}->{$field} if ($field);
	return $fieldmap->{$self->class_name}->{virtual};
}

sub json_hint {
	my $self = shift;
	return $fieldmap->{$self->class_name}->{hint};
}


1;
