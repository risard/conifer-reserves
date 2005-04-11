BEGIN;

ALTER TABLE actor.usr ADD CONSTRAINT actor_usr_class_fkey FOREIGN KEY (class) REFERENCES actor.usr_class (id);
ALTER TABLE actor.usr ADD CONSTRAINT actor_usr_address_fkey FOREIGN KEY (address) REFERENCES actor.usr_address (id);
ALTER TABLE actor.usr ADD CONSTRAINT actor_usr_home_ou_fkey FOREIGN KEY (home_ou) REFERENCES actor.org_unit (id);
        
ALTER TABLE actor.stat_cat ADD CONSTRAINT actor_stat_cat_owner_fkey FOREIGN KEY (owner) REFERENCES actor.org_unit (id);

ALTER TABLE actor.stat_cat_entry ADD CONSTRAINT actor_stat_cat_entry_owner_fkey FOREIGN KEY (owner) REFERENCES actor.org_unit (id);

ALTER TABLE actor.org_unit ADD CONSTRAINT actor_org_unit_address_fkey FOREIGN KEY (address) REFERENCES actor.org_address (id);

ALTER TABLE biblio.record_note ADD CONSTRAINT biblio_record_note_record_fkey FOREIGN KEY (record) REFERENCES biblio.record_entry (id) ON DELETE CASCADE;
ALTER TABLE biblio.record_note ADD CONSTRAINT biblio_record_note_creator_fkey FOREIGN KEY (creator) REFERENCES actor.usr (id);
ALTER TABLE biblio.record_note ADD CONSTRAINT biblio_record_note_editor_fkey FOREIGN KEY (editor) REFERENCES actor.usr (id);

ALTER TABLE biblio.record_entry ADD CONSTRAINT biblio_record_entry_creator_fkey FOREIGN KEY (creator) REFERENCES actor.usr (id);
ALTER TABLE biblio.record_entry ADD CONSTRAINT biblio_record_entry_editor_fkey FOREIGN KEY (editor) REFERENCES actor.usr (id);

ALTER TABLE metabib.metarecord ADD CONSTRAINT metabib_metarecord_master_record_fkey FOREIGN KEY (master_record) REFERENCES biblio.record_entry (id);

ALTER TABLE metabib.title_field_entry ADD CONSTRAINT metabib_title_field_entry_source_pkey FOREIGN KEY (source) REFERENCES biblio.record_entry (id);
ALTER TABLE metabib.title_field_entry ADD CONSTRAINT metabib_title_field_entry_field_pkey FOREIGN KEY (field) REFERENCES config.metabib_field (id);

ALTER TABLE metabib.author_field_entry ADD CONSTRAINT metabib_author_field_entry_source_pkey FOREIGN KEY (source) REFERENCES biblio.record_entry (id);
ALTER TABLE metabib.author_field_entry ADD CONSTRAINT metabib_author_field_entry_field_pkey FOREIGN KEY (field) REFERENCES config.metabib_field (id);

ALTER TABLE metabib.subject_field_entry ADD CONSTRAINT metabib_subject_field_entry_source_pkey FOREIGN KEY (source) REFERENCES biblio.record_entry (id);
ALTER TABLE metabib.subject_field_entry ADD CONSTRAINT metabib_subject_field_entry_field_pkey FOREIGN KEY (field) REFERENCES config.metabib_field (id);

ALTER TABLE metabib.keyword_field_entry ADD CONSTRAINT metabib_keyword_field_entry_source_pkey FOREIGN KEY (source) REFERENCES biblio.record_entry (id);
ALTER TABLE metabib.keyword_field_entry ADD CONSTRAINT metabib_keyword_field_entry_field_pkey FOREIGN KEY (field) REFERENCES config.metabib_field (id);

ALTER TABLE metabib.rec_descriptor ADD CONSTRAINT metabib_rec_descriptor_record_fkey FOREIGN KEY (record) REFERENCES biblio.record_entry (id);

ALTER TABLE metabib.full_rec ADD CONSTRAINT metabib_full_rec_record_fkey FOREIGN KEY (record) REFERENCES biblio.record_entry (id);

ALTER TABLE metabib.metarecord_source_map ADD CONSTRAINT metabib_metarecord_source_map_source_fkey FOREIGN KEY (source) REFERENCES biblio.record_entry (id);
ALTER TABLE metabib.metarecord_source_map ADD CONSTRAINT metabib_metarecord_source_map_metarecord_fkey FOREIGN KEY (metarecord) REFERENCES metabib.metarecord (id);

ALTER TABLE asset.copy ADD CONSTRAINT asset_copy_call_number_fkey FOREIGN KEY (call_number) REFERENCES asset.call_number (id);
ALTER TABLE asset.copy ADD CONSTRAINT asset_copy_creator_fkey FOREIGN KEY (creator) REFERENCES actor.usr (id);
ALTER TABLE asset.copy ADD CONSTRAINT asset_copy_editor_fkey FOREIGN KEY (editor) REFERENCES actor.usr (id);

ALTER TABLE asset.copy_note ADD CONSTRAINT asset_copy_note_copy_fkey FOREIGN KEY (owning_copy) REFERENCES asset.copy (id);
ALTER TABLE asset.copy_note ADD CONSTRAINT asset_copy_note_creator_fkey FOREIGN KEY (creator) REFERENCES actor.usr (id);

ALTER TABLE asset.call_number ADD CONSTRAINT asset_call_number_owning_lib_fkey FOREIGN KEY (owning_lib) REFERENCES actor.org_unit (id);
ALTER TABLE asset.call_number ADD CONSTRAINT asset_call_number_record_fkey FOREIGN KEY (record) REFERENCES biblio.record_entry (id);
ALTER TABLE asset.call_number ADD CONSTRAINT asset_call_number_creator_fkey FOREIGN KEY (creator) REFERENCES actor.usr (id);
ALTER TABLE asset.call_number ADD CONSTRAINT asset_call_number_editor_fkey FOREIGN KEY (editor) REFERENCES actor.usr (id);

ALTER TABLE asset.call_number_note ADD CONSTRAINT asset_call_number_note_record_fkey FOREIGN KEY (call_number) REFERENCES asset.call_number (id);
ALTER TABLE asset.call_number_note ADD CONSTRAINT asset_call_number_note_creator_fkey FOREIGN KEY (creator) REFERENCES actor.usr (id);

ALTER TABLE money.billable_xact ADD CONSTRAINT money_billable_xact_usr_fkey FOREIGN KEY (usr) REFERENCES actor.usr (id);

ALTER TABLE action.circulation ADD CONSTRAINT action_circulation_usr_fkey FOREIGN KEY (usr) REFERENCES actor.usr (id);
ALTER TABLE action.circulation ADD CONSTRAINT action_circulation_circ_lib_fkey FOREIGN KEY (circ_lib) REFERENCES actor.org_unit (id);
ALTER TABLE action.circulation ADD CONSTRAINT action_circulation_target_copy_fkey FOREIGN KEY (target_copy) REFERENCES asset.copy (id);

COMMIT;
