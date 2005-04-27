{
	#---------------------------------------------------------------------
	package action::circulation;
	
	action::circulation->table( 'action.circulation' );
	action::circulation->sequence( 'action.circulation_id_seq' );

	#---------------------------------------------------------------------
	package action::survey;
	
	action::survey->table( 'action.survey' );
	action::survey->sequence( 'action.survey_id_seq' );
	
	#---------------------------------------------------------------------
	package action::survey_question;
	
	action::survey_question->table( 'action.survey_question' );
	action::survey_question->sequence( 'action.survey_question_id_seq' );
	
	#---------------------------------------------------------------------
	package action::survey_answer;
	
	action::survey_answer->table( 'action.survey_answer' );
	action::survey_answer->sequence( 'action.survey_answer_id_seq' );
	
	#---------------------------------------------------------------------
	package action::survey_response;
	
	action::survey_response->table( 'action.survey_response' );
	action::survey_response->sequence( 'action.survey_response_id_seq' );
	
	#---------------------------------------------------------------------
	package config::copy_status;
	
	config::copy_status->table( 'config.copy_status' );
	config::copy_status->sequence( 'config.copy_status_id_seq' );

	#---------------------------------------------------------------------
	package config::rules::circ_duration;
	
	config::rules::circ_duration->table( 'config.rule_circ_duration' );
	config::rules::circ_duration->sequence( 'config.rule_circ_duration_id_seq' );
	
	#---------------------------------------------------------------------
	package config::rules::age_hold_protect;
	
	config::rules::age_hold_protect->table( 'config.rule_age_hold_protect' );
	config::rules::age_hold_protect->sequence( 'config.rule_age_hold_protect_id_seq' );
	
	#---------------------------------------------------------------------
	package config::rules::max_fine;
	
	config::rules::max_fine->table( 'config.rule_max_fine' );
	config::rules::max_fine->sequence( 'config.rule_max_fine_id_seq' );
	
	#---------------------------------------------------------------------
	package config::rules::recuring_fine;
	
	config::rules::recuring_fine->table( 'config.rule_recuring_fine' );
	config::rules::recuring_fine->sequence( 'config.rule_recuring_fine_id_seq' );
	
	#---------------------------------------------------------------------
	package config::net_access_level;
	
	config::standing->table( 'config.net_access_level' );
	config::standing->sequence( 'config.net_access_level_id_seq' );
	
	#---------------------------------------------------------------------
	package config::standing;
	
	config::standing->table( 'config.standing' );
	config::standing->sequence( 'config.standing_id_seq' );
	
	#---------------------------------------------------------------------
	package config::metabib_field;
	
	config::metabib_field->table( 'config.metabib_field' );
	config::metabib_field->sequence( 'config.metabib_field_id_seq' );
	
	#---------------------------------------------------------------------
	package config::bib_source;
	
	config::bib_source->table( 'config.bib_source' );
	config::bib_source->sequence( 'config.bib_source_id_seq' );
	
	#---------------------------------------------------------------------
	package config::identification_type;
	
	config::identification_type->table( 'config.identification_type' );
	config::identification_type->sequence( 'config.identification_type_id_seq' );
	
	#---------------------------------------------------------------------
	package asset::call_number_note;
	
	asset::call_number->table( 'asset.call_number_note' );
	asset::call_number->sequence( 'asset.call_number_note_id_seq' );
	
	#---------------------------------------------------------------------
	package asset::copy_note;
	
	asset::copy->table( 'asset.copy_note' );
	asset::copy->sequence( 'asset.copy_note_id_seq' );

	#---------------------------------------------------------------------
	package asset::call_number;
	
	asset::call_number->table( 'asset.call_number' );
	asset::call_number->sequence( 'asset.call_number_id_seq' );
	
	#---------------------------------------------------------------------
	package asset::copy_location;
	
	asset::copy_location->table( 'asset.copy_location' );
	asset::copy_location->sequence( 'asset.copy_location_id_seq' );

	#---------------------------------------------------------------------
	package asset::copy;
	
	asset::copy->table( 'asset.copy' );
	asset::copy->sequence( 'asset.copy_id_seq' );

	#---------------------------------------------------------------------
	package asset::stat_cat;
	
	asset::stat_cat->table( 'asset.stat_cat' );
	asset::stat_cat->sequence( 'asset.stat_cat_id_seq' );
	
	#---------------------------------------------------------------------
	package asset::stat_cat_entry;
	
	asset::stat_cat_entry->table( 'asset.stat_cat_entry' );
	asset::stat_cat_entry->sequence( 'asset.stat_cat_entry_id_seq' );
	
	#---------------------------------------------------------------------
	package asset::stat_cat_entry_copy_map;
	
	asset::stat_cat_entry_copy_map->table( 'asset.stat_cat_entry_copy_map' );
	asset::stat_cat_entry_copy_map->sequence( 'asset.stat_cat_entry_copy_map_id_seq' );
	
	#---------------------------------------------------------------------
	package biblio::record_entry;
	
	biblio::record_entry->table( 'biblio.record_entry' );
	biblio::record_entry->sequence( 'biblio.record_entry_id_seq' );

	#---------------------------------------------------------------------
	#package biblio::record_marc;
	#
	#biblio::record_marc->table( 'biblio.record_marc' );
	#biblio::record_marc->sequence( 'biblio.record_marc_id_seq' );
	#
	#---------------------------------------------------------------------
	package biblio::record_note;
	
	biblio::record_note->table( 'biblio.record_note' );
	biblio::record_note->sequence( 'biblio.record_note_id_seq' );
	
	#---------------------------------------------------------------------
	package actor::user;
	
	actor::user->table( 'actor.usr' );
	actor::user->sequence( 'actor.usr_id_seq' );

	#---------------------------------------------------------------------
	package actor::user_address;
	
	actor::user_address->table( 'actor.usr_address' );
	actor::user_address->sequence( 'actor.usr_address_id_seq' );

	#---------------------------------------------------------------------
	package actor::org_address;
	
	actor::org_address->table( 'actor.org_address' );
	actor::org_address->sequence( 'actor.org_address_id_seq' );
	
	#---------------------------------------------------------------------
	package actor::profile;
	
	actor::profile->table( 'actor.profile' );
	actor::profile->sequence( 'actor.profile_id_seq' );
	
	#---------------------------------------------------------------------
	package actor::org_unit_type;
	
	actor::org_unit_type->table( 'actor.org_unit_type' );
	actor::org_unit_type->sequence( 'actor.org_unit_type_id_seq' );

	#---------------------------------------------------------------------
	package actor::org_unit;
	
	actor::org_unit->table( 'actor.org_unit' );
	actor::org_unit->sequence( 'actor.org_unit_id_seq' );

	#---------------------------------------------------------------------
	package actor::stat_cat;
	
	actor::stat_cat->table( 'actor.stat_cat' );
	actor::stat_cat->sequence( 'actor.stat_cat_id_seq' );
	
	#---------------------------------------------------------------------
	package actor::stat_cat_entry;
	
	actor::stat_cat_entry->table( 'actor.stat_cat_entry' );
	actor::stat_cat_entry->sequence( 'actor.stat_cat_entry_id_seq' );
	
	#---------------------------------------------------------------------
	package actor::stat_cat_entry_user_map;
	
	actor::stat_cat_entry_user_map->table( 'actor.stat_cat_entry_copy_map' );
	actor::stat_cat_entry_user_map->sequence( 'actor.stat_cat_entry_usr_map_id_seq' );
	
	#---------------------------------------------------------------------
	package actor::card;
	
	actor::card->table( 'actor.card' );
	actor::card->sequence( 'actor.card_id_seq' );

	#---------------------------------------------------------------------

	#-------------------------------------------------------------------------------
	package metabib::metarecord;

	metabib::metarecord->table( 'metabib.metarecord' );
	metabib::metarecord->sequence( 'metabib.metarecord_id_seq' );

	OpenILS::Application::Storage->register_method(
		api_name	=> 'open-ils.storage.direct.metabib.metarecord.batch.create',
		method		=> 'copy_create',
		api_level	=> 1,
		'package'	=> 'OpenILS::Application::Storage',
		cdbi		=> 'metabib::metarecord',
	);


	#-------------------------------------------------------------------------------

	#-------------------------------------------------------------------------------
	package metabib::title_field_entry;

	metabib::title_field_entry->table( 'metabib.title_field_entry' );
	metabib::title_field_entry->sequence( 'metabib.title_field_entry_id_seq' );
	metabib::title_field_entry->columns( 'FTS' => 'index_vector' );

#	metabib::title_field_entry->add_trigger(
#		before_create => \&OpenILS::Application::Storage::Driver::Pg::tsearch2_trigger
#	);
#	metabib::title_field_entry->add_trigger(
#		before_update => \&OpenILS::Application::Storage::Driver::Pg::tsearch2_trigger
#	);

	OpenILS::Application::Storage->register_method(
		api_name	=> 'open-ils.storage.direct.metabib.title_field_entry.batch.create',
		method		=> 'copy_create',
		api_level	=> 1,
		'package'	=> 'OpenILS::Application::Storage',
		cdbi		=> 'metabib::title_field_entry',
	);

	#-------------------------------------------------------------------------------

	#-------------------------------------------------------------------------------
	package metabib::author_field_entry;

	metabib::author_field_entry->table( 'metabib.author_field_entry' );
	metabib::author_field_entry->sequence( 'metabib.author_field_entry_id_seq' );
	metabib::author_field_entry->columns( 'FTS' => 'index_vector' );

	OpenILS::Application::Storage->register_method(
		api_name	=> 'open-ils.storage.direct.metabib.author_field_entry.batch.create',
		method		=> 'copy_create',
		api_level	=> 1,
		'package'	=> 'OpenILS::Application::Storage',
		cdbi		=> 'metabib::author_field_entry',
	);

	#-------------------------------------------------------------------------------

	#-------------------------------------------------------------------------------
	package metabib::subject_field_entry;

	metabib::subject_field_entry->table( 'metabib.subject_field_entry' );
	metabib::subject_field_entry->sequence( 'metabib.subject_field_entry_id_seq' );
	metabib::subject_field_entry->columns( 'FTS' => 'index_vector' );

	OpenILS::Application::Storage->register_method(
		api_name	=> 'open-ils.storage.direct.metabib.subject_field_entry.batch.create',
		method		=> 'copy_create',
		api_level	=> 1,
		'package'	=> 'OpenILS::Application::Storage',
		cdbi		=> 'metabib::subject_field_entry',
	);

	#-------------------------------------------------------------------------------

	#-------------------------------------------------------------------------------
	package metabib::keyword_field_entry;

	metabib::keyword_field_entry->table( 'metabib.keyword_field_entry' );
	metabib::keyword_field_entry->sequence( 'metabib.keyword_field_entry_id_seq' );
	metabib::keyword_field_entry->columns( 'FTS' => 'index_vector' );

	OpenILS::Application::Storage->register_method(
		api_name	=> 'open-ils.storage.direct.metabib.keyword_field_entry.batch.create',
		method		=> 'copy_create',
		api_level	=> 1,
		'package'	=> 'OpenILS::Application::Storage',
		cdbi		=> 'metabib::keyword_field_entry',
	);

	#-------------------------------------------------------------------------------

	#-------------------------------------------------------------------------------
	#package metabib::title_field_entry_source_map;

	#metabib::title_field_entry_source_map->table( 'metabib.title_field_entry_source_map' );

	#-------------------------------------------------------------------------------

	#-------------------------------------------------------------------------------
	#package metabib::author_field_entry_source_map;

	#metabib::author_field_entry_source_map->table( 'metabib.author_field_entry_source_map' );

	#-------------------------------------------------------------------------------

	#-------------------------------------------------------------------------------
	#package metabib::subject_field_entry_source_map;

	#metabib::subject_field_entry_source_map->table( 'metabib.subject_field_entry_source_map' );

	#-------------------------------------------------------------------------------

	#-------------------------------------------------------------------------------
	#package metabib::keyword_field_entry_source_map;

	#metabib::keyword_field_entry_source_map->table( 'metabib.keyword_field_entry_source_map' );

	#-------------------------------------------------------------------------------

	#-------------------------------------------------------------------------------
	package metabib::metarecord_source_map;

	metabib::metarecord_source_map->table( 'metabib.metarecord_source_map' );
	OpenILS::Application::Storage->register_method(
		api_name	=> 'open-ils.storage.direct.metabib.metarecord_source_map.batch.create',
		method		=> 'copy_create',
		api_level	=> 1,
		'package'	=> 'OpenILS::Application::Storage',
		cdbi		=> 'metabib::metarecord_source_map',
	);


	#-------------------------------------------------------------------------------
	package metabib::record_descriptor;

	metabib::record_descriptor->table( 'metabib.rec_descriptor' );
	metabib::record_descriptor->sequence( 'metabib.rec_descriptor_id_seq' );

	OpenILS::Application::Storage->register_method(
		api_name	=> 'open-ils.storage.direct.metabib.record_descriptor.batch.create',
		method		=> 'copy_create',
		api_level	=> 1,
		'package'	=> 'OpenILS::Application::Storage',
		cdbi		=> 'metabib::record_descriptor',
	);

	#-------------------------------------------------------------------------------


	#-------------------------------------------------------------------------------
	package metabib::full_rec;

	metabib::full_rec->table( 'metabib.full_rec' );
	metabib::full_rec->sequence( 'metabib.full_rec_id_seq' );
	metabib::full_rec->columns( 'FTS' => 'index_vector' );

	OpenILS::Application::Storage->register_method(
		api_name	=> 'open-ils.storage.direct.metabib.full_rec.batch.create',
		method		=> 'copy_create',
		api_level	=> 1,
		'package'	=> 'OpenILS::Application::Storage',
		cdbi		=> 'metabib::full_rec',
	);


	#-------------------------------------------------------------------------------
}

1;
