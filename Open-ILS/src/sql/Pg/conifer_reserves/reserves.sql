

DROP SCHEMA reserves CASCADE;

BEGIN;

CREATE SCHEMA reserves;

/*
Mostly likely:
config.reserves_term,
config.reserves_actions
config.reserves_log_type

will be depricated.  They won't be necessary with the action_trigger logic

*/

CREATE TABLE config.reserves_term (
    id              SERIAL PRIMARY KEY,
    ou              INTEGER    REFERENCES actor.org_unit (id) DEFERRABLE INITIALLY DEFERRED,
    academic_year   DATE    NOT NULL,
    term            TEXT    NOT NULL
);


CREATE TABLE config.reserves_actions (
--trigger event logic could replace this table

    id        SERIAL    PRIMARY KEY,
    action    TEXT    NOT NULL
);  

CREATE TABLE config.reserves_log_types ( 
    id      SERIAL   PRIMARY KEY,
    type    TEXT    NOT NULL
); 

INSERT INTO config.reserves_log_types (type) VALUES ('item');
INSERT INTO config.reserves_log_types (type) VALUES ('course');
INSERT INTO config.reserves_log_types (type) VALUES ('container');


CREATE TABLE config.reserves_media_types ( 
    id      SERIAL   PRIMARY KEY,
    type    TEXT    NOT NULL
); 

INSERT INTO config.reserves_media_types (type) VALUES ('Library book');
INSERT INTO config.reserves_media_types (type) VALUES ('Professor copy');
INSERT INTO config.reserves_media_types (type) VALUES ('Library online resource');
INSERT INTO config.reserves_media_types (type) VALUES ('3rd party online resource');



CREATE TABLE reserves.course (
    id              SERIAL    PRIMARY KEY,
    name            TEXT    NOT NULL,
    code            TEXT    NOT NULL,
    term            INTEGER    REFERENCES config.reserves_term (id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,      
    location        INTEGER    REFERENCES asset.copy_location (id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,    
    default_loan    TEXT    REFERENCES config.circ_modifier (code)  ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,    
    owner           INTEGER    NOT NULL    REFERENCES actor.usr (id) DEFERRABLE INITIALLY DEFERRED,
    note            TEXT    DEFAULT 'na',
    archive         BOOLEAN    NOT NULL    DEFAULT FALSE 
);

CREATE INDEX reserves_course_name_idx ON reserves.course (name);
CREATE INDEX reserves_course_code_idx ON reserves.course (code);
CREATE INDEX reserves_course_owner_idx ON reserves.course (owner);
CREATE INDEX reserves_course_owner_name_idx ON reserves.course (owner);
CREATE INDEX reserves_course_term_idx ON reserves.course (term);
CREATE INDEX reserves_course_archive_idx ON reserves.course (archive);

CREATE TABLE reserves.item (
-- almost none of the fields in this table check back against evergreen because of
-- the necessity of accommodating none cataloged resources (ie a website)
-- one way around this might be to create a stub cataloging record for everything,
-- including websites
 
    id                      SERIAL    PRIMARY KEY,          
    cat_id                  INTEGER    NOT NULL DEFAULT 0,
    title                   TEXT    NOT NULL,
    author                  TEXT    NOT NULL,
    call_number             TEXT    NOT NULL    DEFAULT 'na', 
    url                     TEXT    NOT NULL    DEFAULT 'na',
    original_circ_modifier  TEXT    REFERENCES config.circ_modifier (code) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
    reserves_circ_modifier  TEXT    REFERENCES config.circ_modifier (code) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
    original_location       INTEGER    REFERENCES asset.copy_location (id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
    reserves_location       INTEGER    REFERENCES asset.copy_location (id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
    copyright_notice        TEXT    NOT NULL    DEFAULT 'na',
    copyright_fee           NUMERIC(6,2)    DEFAULT 000000.00,
    media_type              INTEGER    REFERENCES config.reserves_media_types (id)    DEFERRABLE INITIALLY DEFERRED,
    note                    TEXT    DEFAULT 'na',
    archive                 BOOLEAN    NOT NULL    DEFAULT FALSE
);
CREATE INDEX reserves_item_title ON reserves.item (title);
CREATE INDEX reserves_item_author ON reserves.item (author);
CREATE INDEX reserves_item_archive ON reserves.item (archive);


CREATE TABLE reserves.course_container (
    id         SERIAL    PRIMARY KEY,
    name       TEXT    NOT NULL,
    parent     INTEGER    REFERENCES reserves.course_container (id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED, 
    course_id  INTEGER    REFERENCES reserves.course (id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
    item_id    INTEGER    REFERENCES reserves.item (id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
    note       TEXT    DEFAULT 'na'
);



CREATE TABLE reserves.course_members_map (
    id              SERIAL    PRIMARY KEY,
    course_id       INTEGER    REFERENCES reserves.course (id)  ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
    member_id       INTEGER    REFERENCES actor.usr (id)  ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
    member_access   INTEGER    REFERENCES permission.grp_tree (id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
    receive_email   BOOLEAN    DEFAULT TRUE
);   


CREATE TABLE reserves.event_log (
/*
It was originally intended for this table to be populated via triggers
A better way is the action_trigger system built into evergreen as it
allows administrators to add events for logging at run time
*/
    id            SERIAL    PRIMARY KEY,
    entity_id     INTEGER    REFERENCES reserves.item (id)    DEFERRABLE INITIALLY DEFERRED,
    entity_type   INTEGER    REFERENCES config.reserves_log_types (id)    DEFERRABLE INITIALLY DEFERRED,
    action        INTEGER    REFERENCES config.reserves_actions (id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
    time_stamp    TIMESTAMP WITH TIME ZONE     NOT NULL    DEFAULT NOW()
);
CREATE INDEX reserves_stat_log_action_idx ON reserves.event_log (action);
CREATE INDEX reserves_stat_log_time_stamp_idx ON reserves.event_log (time_stamp);


CREATE TABLE config.reserves (
    id                              SERIAL    PRIMARY KEY,
    ou                              INTEGER     REFERENCES actor.org_unit (id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
    default_transit_status          INTEGER     REFERENCES config.copy_status (id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
    default_copyright               TEXT    NOT NULL    DEFAULT 'na',
    default_copyright_fee           NUMERIC(6,2)    DEFAULT 000000.00,
    default_original_circ_modifier  TEXT    REFERENCES config.circ_modifier (code)  ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
    default_original_location       INTEGER    REFERENCES asset.copy_location (id)  ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
    reserves_email                  TEXT    NOT NULL    DEFAULT 'na'
);


COMMIT;


