/*
 * Copyright (C) 2004-2008  Georgia Public Library Service
 * Copyright (C) 2007-2008  Equinox Software, Inc.
 * Mike Rylander <miker@esilibrary.com> 
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License
 * as published by the Free Software Foundation; either version 2
 * of the License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 */

DROP SCHEMA metabib CASCADE;

BEGIN;
CREATE SCHEMA metabib;

CREATE TABLE metabib.metarecord (
	id		BIGSERIAL	PRIMARY KEY,
	fingerprint	TEXT		NOT NULL,
	master_record	BIGINT,
	mods		TEXT
);
CREATE INDEX metabib_metarecord_master_record_idx ON metabib.metarecord (master_record);
CREATE INDEX metabib_metarecord_fingerprint_idx ON metabib.metarecord (fingerprint);

CREATE TABLE metabib.title_field_entry (
	id		BIGSERIAL	PRIMARY KEY,
	source		BIGINT		NOT NULL,
	field		INT		NOT NULL,
	value		TEXT		NOT NULL,
	index_vector	tsvector	NOT NULL
);
CREATE TRIGGER metabib_title_field_entry_fti_trigger
	BEFORE UPDATE OR INSERT ON metabib.title_field_entry
	FOR EACH ROW EXECUTE PROCEDURE oils_tsearch2('title');

CREATE INDEX metabib_title_field_entry_index_vector_idx ON metabib.title_field_entry USING GIST (index_vector);


CREATE TABLE metabib.author_field_entry (
	id		BIGSERIAL	PRIMARY KEY,
	source		BIGINT		NOT NULL,
	field		INT		NOT NULL,
	value		TEXT		NOT NULL,
	index_vector	tsvector	NOT NULL
);
CREATE TRIGGER metabib_author_field_entry_fti_trigger
	BEFORE UPDATE OR INSERT ON metabib.author_field_entry
	FOR EACH ROW EXECUTE PROCEDURE oils_tsearch2('author');

CREATE INDEX metabib_author_field_entry_index_vector_idx ON metabib.author_field_entry USING GIST (index_vector);


CREATE TABLE metabib.subject_field_entry (
	id		BIGSERIAL	PRIMARY KEY,
	source		BIGINT		NOT NULL,
	field		INT		NOT NULL,
	value		TEXT		NOT NULL,
	index_vector	tsvector	NOT NULL
);
CREATE TRIGGER metabib_subject_field_entry_fti_trigger
	BEFORE UPDATE OR INSERT ON metabib.subject_field_entry
	FOR EACH ROW EXECUTE PROCEDURE oils_tsearch2('subject');

CREATE INDEX metabib_subject_field_entry_index_vector_idx ON metabib.subject_field_entry USING GIST (index_vector);
CREATE INDEX metabib_subject_field_entry_source_idx ON metabib.subject_field_entry (source);


CREATE TABLE metabib.keyword_field_entry (
	id		BIGSERIAL	PRIMARY KEY,
	source		BIGINT		NOT NULL,
	field		INT		NOT NULL,
	value		TEXT		NOT NULL,
	index_vector	tsvector	NOT NULL
);
CREATE TRIGGER metabib_keyword_field_entry_fti_trigger
	BEFORE UPDATE OR INSERT ON metabib.keyword_field_entry
	FOR EACH ROW EXECUTE PROCEDURE oils_tsearch2('keyword');

CREATE INDEX metabib_keyword_field_entry_index_vector_idx ON metabib.keyword_field_entry USING GIST (index_vector);


CREATE TABLE metabib.series_field_entry (
	id		BIGSERIAL	PRIMARY KEY,
	source		BIGINT		NOT NULL,
	field		INT		NOT NULL,
	value		TEXT		NOT NULL,
	index_vector	tsvector	NOT NULL
);
CREATE TRIGGER metabib_series_field_entry_fti_trigger
	BEFORE UPDATE OR INSERT ON metabib.series_field_entry
	FOR EACH ROW EXECUTE PROCEDURE oils_tsearch2('series');

CREATE INDEX metabib_series_field_entry_index_vector_idx ON metabib.series_field_entry USING GIST (index_vector);


CREATE TABLE metabib.rec_descriptor (
	id		BIGSERIAL PRIMARY KEY,
	record		BIGINT,
	item_type	TEXT,
	item_form	TEXT,
	bib_level	TEXT,
	control_type	TEXT,
	char_encoding	TEXT,
	enc_level	TEXT,
	audience	TEXT,
	lit_form	TEXT,
	type_mat	TEXT,
	cat_form	TEXT,
	pub_status	TEXT,
	item_lang	TEXT,
	vr_format	TEXT,
	date1		TEXT,
	date2		TEXT
);
CREATE INDEX metabib_rec_descriptor_record_idx ON metabib.rec_descriptor (record);
/* We may not need these...

CREATE INDEX metabib_rec_descriptor_item_type_idx ON metabib.rec_descriptor (item_type);
CREATE INDEX metabib_rec_descriptor_item_form_idx ON metabib.rec_descriptor (item_form);
CREATE INDEX metabib_rec_descriptor_bib_level_idx ON metabib.rec_descriptor (bib_level);
CREATE INDEX metabib_rec_descriptor_control_type_idx ON metabib.rec_descriptor (control_type);
CREATE INDEX metabib_rec_descriptor_char_encoding_idx ON metabib.rec_descriptor (char_encoding);
CREATE INDEX metabib_rec_descriptor_enc_level_idx ON metabib.rec_descriptor (enc_level);
CREATE INDEX metabib_rec_descriptor_audience_idx ON metabib.rec_descriptor (audience);
CREATE INDEX metabib_rec_descriptor_lit_form_idx ON metabib.rec_descriptor (lit_form);
CREATE INDEX metabib_rec_descriptor_cat_form_idx ON metabib.rec_descriptor (cat_form);
CREATE INDEX metabib_rec_descriptor_pub_status_idx ON metabib.rec_descriptor (pub_status);
CREATE INDEX metabib_rec_descriptor_item_lang_idx ON metabib.rec_descriptor (item_lang);
CREATE INDEX metabib_rec_descriptor_vr_format_idx ON metabib.rec_descriptor (vr_format);

*/

-- Use a sequence that matches previous version, for easier upgrading.
CREATE SEQUENCE metabib.full_rec_id_seq;

CREATE TABLE metabib.real_full_rec (
	id		    BIGINT	NOT NULL DEFAULT NEXTVAL('metabib.full_rec_id_seq'::REGCLASS),
	record		BIGINT		NOT NULL,
	tag		CHAR(3)		NOT NULL,
	ind1		TEXT,
	ind2		TEXT,
	subfield	TEXT,
	value		TEXT		NOT NULL,
	index_vector	tsvector	NOT NULL
);
ALTER TABLE metabib.real_full_rec ADD PRIMARY KEY (id);

CREATE INDEX metabib_full_rec_tag_subfield_idx ON metabib.real_full_rec (tag,subfield);
CREATE INDEX metabib_full_rec_value_idx ON metabib.real_full_rec (substring(value,1,1024));
/* Enable LIKE to use an index for database clusters with locales other than C or POSIX */
CREATE INDEX metabib_full_rec_value_tpo_index ON metabib.real_full_rec (substring(value,1,1024) text_pattern_ops);
CREATE INDEX metabib_full_rec_record_idx ON metabib.real_full_rec (record);
CREATE INDEX metabib_full_rec_index_vector_idx ON metabib.real_full_rec USING GIST (index_vector);

CREATE TRIGGER metabib_full_rec_fti_trigger
	BEFORE UPDATE OR INSERT ON metabib.real_full_rec
	FOR EACH ROW EXECUTE PROCEDURE oils_tsearch2('default');

CREATE OR REPLACE VIEW metabib.full_rec AS
    SELECT  id,
            record,
            tag,
            ind1,
            ind2,
            subfield,
            SUBSTRING(value,1,1024) AS value,
            index_vector
      FROM  metabib.real_full_rec;

CREATE OR REPLACE RULE metabib_full_rec_insert_rule
    AS ON INSERT TO metabib.full_rec
    DO INSTEAD
    INSERT INTO metabib.real_full_rec VALUES (
        COALESCE(NEW.id, NEXTVAL('metabib.full_rec_id_seq'::REGCLASS)),
        NEW.record,
        NEW.tag,
        NEW.ind1,
        NEW.ind2,
        NEW.subfield,
        NEW.value,
        NEW.index_vector
    );

CREATE OR REPLACE RULE metabib_full_rec_update_rule
    AS ON UPDATE TO metabib.full_rec
    DO INSTEAD
    UPDATE  metabib.real_full_rec SET
        id = NEW.id,
        record = NEW.record,
        tag = NEW.tag,
        ind1 = NEW.ind1,
        ind2 = NEW.ind2,
        subfield = NEW.subfield,
        value = NEW.value,
        index_vector = NEW.index_vector
      WHERE id = OLD.id;

CREATE OR REPLACE RULE metabib_full_rec_delete_rule
    AS ON DELETE TO metabib.full_rec
    DO INSTEAD
    DELETE FROM metabib.real_full_rec WHERE id = OLD.id;

CREATE TABLE metabib.metarecord_source_map (
	id		BIGSERIAL	PRIMARY KEY,
	metarecord	BIGINT		NOT NULL,
	source		BIGINT		NOT NULL
);
CREATE INDEX metabib_metarecord_source_map_metarecord_idx ON metabib.metarecord_source_map (metarecord);
CREATE INDEX metabib_metarecord_source_map_source_record_idx ON metabib.metarecord_source_map (source);

CREATE TYPE metabib.field_entry_template AS (
        field_class     TEXT,
        field           INT,
        source          BIGINT,
        value           TEXT
);

CREATE OR REPLACE FUNCTION biblio.extract_metabib_field_entry ( rid BIGINT, default_joiner TEXT ) RETURNS SETOF metabib.field_entry_template AS $func$
DECLARE
	bib		biblio.record_entry%ROWTYPE;
	idx		config.metabib_field%ROWTYPE;
	xfrm		config.xml_transform%ROWTYPE;
	prev_xfrm	TEXT;
	transformed_xml	TEXT;
	xml_node	TEXT;
	xml_node_list	TEXT[];
	raw_text	TEXT;
	joiner		TEXT := default_joiner; -- XXX will index defs supply a joiner?
	output_row	metabib.field_entry_template%ROWTYPE;
BEGIN

	-- Get the record
	SELECT INTO bib * FROM biblio.record_entry WHERE id = rid;

	-- Loop over the indexing entries
	FOR idx IN SELECT * FROM config.metabib_field ORDER BY format LOOP

		SELECT INTO xfrm * from config.xml_transform WHERE name = idx.format;

		-- See if we can skip the XSLT ... it's expensive
		IF prev_xfrm IS NULL OR prev_xfrm <> xfrm.name THEN
			-- Can't skip the transform
			IF xfrm.xslt <> '---' THEN
				transformed_xml := oils_xslt_process(bib.marc,xfrm.xslt);
			ELSE
				transformed_xml := bib.marc;
			END IF;

			prev_xfrm := xfrm.name;
		END IF;

		xml_node_list := oils_xpath( idx.xpath, transformed_xml, ARRAY[ARRAY[xfrm.prefix, xfrm.namespace_uri]] );

		raw_text := NULL;
		FOR xml_node IN SELECT x FROM explode_array(xml_node_list) AS x LOOP
			IF raw_text IS NOT NULL THEN
				raw_text := raw_text || joiner;
			END IF;
			raw_text := COALESCE(raw_text,'') || ARRAY_TO_STRING(oils_xpath( '//text()', xml_node ), ' ');
		END LOOP;

		CONTINUE WHEN raw_text IS NULL;

		output_row.field_class = idx.field_class;
		output_row.field = idx.id;
		output_row.source = rid;
		output_row.value = BTRIM(REGEXP_REPLACE(raw_text, E'\\s+', ' ', 'g'));

		RETURN NEXT output_row;

	END LOOP;

END;
$func$ LANGUAGE PLPGSQL;

-- default to a space joiner
CREATE OR REPLACE FUNCTION biblio.extract_metabib_field_entry ( BIGINT ) RETURNS SETOF metabib.field_entry_template AS $func$
	SELECT * FROM biblio.extract_metabib_field_entry($1, ' ');
$func$ LANGUAGE SQL;

CREATE OR REPLACE FUNCTION biblio.flatten_marc ( rid BIGINT ) RETURNS SETOF metabib.full_rec AS $func$
DECLARE
	bib	biblio.record_entry%ROWTYPE;
	output	metabib.full_rec%ROWTYPE;
	field	RECORD;
BEGIN
	SELECT INTO bib * FROM biblio.record_entry WHERE id = rid;

	FOR field IN SELECT * FROM biblio.flatten_marc( bib.marc ) LOOP
		output.record := rid;
		output.ind1 := field.ind1;
		output.ind2 := field.ind2;
		output.tag := field.tag;
		output.subfield := field.subfield;
		IF field.subfield IS NOT NULL AND field.tag NOT IN ('020','022','024') THEN -- exclude standard numbers and control fields
			output.value := naco_normalize(field.value, field.subfield);
		ELSE
			output.value := field.value;
		END IF;

		RETURN NEXT output;
	END LOOP;
END;
$func$ LANGUAGE PLPGSQL;

/* Old form of biblio.flatten_marc() relied on contrib/xml2 functions that got all crashy in PostgreSQL 8.4 */
-- CREATE OR REPLACE FUNCTION biblio.flatten_marc ( TEXT, BIGINT ) RETURNS SETOF metabib.full_rec AS $func$
--     SELECT  NULL::bigint AS id, NULL::bigint, 'LDR'::char(3), NULL::TEXT, NULL::TEXT, NULL::TEXT, oils_xpath_string( '//*[local-name()="leader"]', $1 ), NULL::tsvector AS index_vector
--         UNION
--     SELECT  NULL::bigint AS id, NULL::bigint, x.tag::char(3), NULL::TEXT, NULL::TEXT, NULL::TEXT, x.value, NULL::tsvector AS index_vector
--       FROM  oils_xpath_table(
--                 'id',
--                 'marc',
--                 'biblio.record_entry',
--                 '//*[local-name()="controlfield"]/@tag|//*[local-name()="controlfield"]',
--                 'id=' || $2::TEXT
--             )x(record int, tag text, value text)
--         UNION
--     SELECT  NULL::bigint AS id, NULL::bigint, x.tag::char(3), x.ind1, x.ind2, x.subfield, x.value, NULL::tsvector AS index_vector
--       FROM  oils_xpath_table(
--                 'id',
--                 'marc',
--                 'biblio.record_entry',
--                 '//*[local-name()="datafield"]/@tag|' ||
--                 '//*[local-name()="datafield"]/@ind1|' ||
--                 '//*[local-name()="datafield"]/@ind2|' ||
--                 '//*[local-name()="datafield"]/*/@code|' ||
--                 '//*[local-name()="datafield"]/*[@code]',
--                 'id=' || $2::TEXT
--             )x(record int, tag text, ind1 text, ind2 text, subfield text, value text);
-- $func$ LANGUAGE SQL;

CREATE OR REPLACE FUNCTION biblio.flatten_marc ( TEXT ) RETURNS SETOF metabib.full_rec AS $func$

use MARC::Record;
use MARC::File::XML (BinaryEncoding => 'UTF-8');

my $xml = shift;
my $r = MARC::Record->new_from_xml( $xml );

return_next( { tag => 'LDR', value => $r->leader } );

for my $f ( $r->fields ) {
	if ($f->is_control_field) {
		return_next({ tag => $f->tag, value => $f->data });
	} else {
		for my $s ($f->subfields) {
			return_next({
				tag      => $f->tag,
				ind1     => $f->indicator(1),
				ind2     => $f->indicator(2),
				subfield => $s->[0],
				value    => $s->[1]
			});

			if ( $f->tag eq '245' and $s->[0] eq 'a' ) {
				my $trim = $f->indicator(2) || 0;
				return_next({
					tag      => 'tnf',
					ind1     => $f->indicator(1),
					ind2     => $f->indicator(2),
					subfield => 'a',
					value    => substr( $s->[1], $trim )
				});
			}
		}
	}
}

return undef;

$func$ LANGUAGE PLPERLU;

CREATE OR REPLACE FUNCTION biblio.marc21_record_type( rid BIGINT ) RETURNS config.marc21_rec_type_map AS $func$
DECLARE
	ldr         RECORD;
	tval        TEXT;
	tval_rec    RECORD;
	bval        TEXT;
	bval_rec    RECORD;
    retval      config.marc21_rec_type_map%ROWTYPE;
BEGIN
    SELECT * INTO ldr FROM metabib.full_rec WHERE record = rid AND tag = 'LDR' LIMIT 1;

    IF ldr.id IS NULL THEN
        SELECT * INTO retval FROM config.marc21_rec_type_map WHERE code = 'BKS';
        RETURN retval;
    END IF;

    SELECT * INTO tval_rec FROM config.marc21_ff_pos_map WHERE fixed_field = 'Type' LIMIT 1; -- They're all the same
    SELECT * INTO bval_rec FROM config.marc21_ff_pos_map WHERE fixed_field = 'BLvl' LIMIT 1; -- They're all the same


    tval := SUBSTRING( ldr.value, tval_rec.start_pos + 1, tval_rec.length );
    bval := SUBSTRING( ldr.value, bval_rec.start_pos + 1, bval_rec.length );

    -- RAISE NOTICE 'type %, blvl %, ldr %', tval, bval, ldr.value;

    SELECT * INTO retval FROM config.marc21_rec_type_map WHERE type_val LIKE '%' || tval || '%' AND blvl_val LIKE '%' || bval || '%';


    IF retval.code IS NULL THEN
        SELECT * INTO retval FROM config.marc21_rec_type_map WHERE code = 'BKS';
    END IF;

    RETURN retval;
END;
$func$ LANGUAGE PLPGSQL;

CREATE OR REPLACE FUNCTION biblio.marc21_extract_fixed_field( rid BIGINT, ff TEXT ) RETURNS TEXT AS $func$
DECLARE
    rtype       TEXT;
    ff_pos      RECORD;
    tag_data    RECORD;
    val         TEXT;
BEGIN
    rtype := (biblio.marc21_record_type( rid )).code;
    FOR ff_pos IN SELECT * FROM config.marc21_ff_pos_map WHERE fixed_field = ff AND rec_type = rtype ORDER BY tag DESC LOOP
        FOR tag_data IN SELECT * FROM metabib.full_rec WHERE tag = UPPER(ff_pos.tag) AND record = rid LOOP
            val := SUBSTRING( tag_data.value, ff_pos.start_pos + 1, ff_pos.length );
            RETURN val;
        END LOOP;
        val := REPEAT( ff_pos.default_val, ff_pos.length );
        RETURN val;
    END LOOP;

    RETURN NULL;
END;
$func$ LANGUAGE PLPGSQL;

CREATE TYPE biblio.marc21_physical_characteristics AS ( id INT, record BIGINT, ptype TEXT, subfield INT, value INT );
CREATE OR REPLACE FUNCTION biblio.marc21_physical_characteristics( rid BIGINT ) RETURNS SETOF biblio.marc21_physical_characteristics AS $func$
DECLARE
    rowid   INT := 0;
    _007    RECORD;
    ptype   config.marc21_physical_characteristic_type_map%ROWTYPE;
    psf     config.marc21_physical_characteristic_subfield_map%ROWTYPE;
    pval    config.marc21_physical_characteristic_value_map%ROWTYPE;
    retval  biblio.marc21_physical_characteristics%ROWTYPE;
BEGIN

    SELECT * INTO _007 FROM metabib.full_rec WHERE record = rid AND tag = '007' LIMIT 1;

    IF _007.id IS NOT NULL THEN
        SELECT * INTO ptype FROM config.marc21_physical_characteristic_type_map WHERE ptype_key = SUBSTRING( _007.value, 1, 1 );

        IF ptype.ptype_key IS NOT NULL THEN
            FOR psf IN SELECT * FROM config.marc21_physical_characteristic_subfield_map WHERE ptype_key = ptype.ptype_key LOOP
                SELECT * INTO pval FROM config.marc21_physical_characteristic_value_map WHERE ptype_subfield = psf.id AND value = SUBSTRING( _007.value, psf.start_pos + 1, psf.length );

                IF pval.id IS NOT NULL THEN
                    rowid := rowid + 1;
                    retval.id := rowid;
                    retval.record := rid;
                    retval.ptype := ptype.ptype_key;
                    retval.subfield := psf.id;
                    retval.value := pval.id;
                    RETURN NEXT retval;
                END IF;

            END LOOP;
        END IF;
    END IF;

    RETURN;
END;
$func$ LANGUAGE PLPGSQL;

CREATE OR REPLACE FUNCTION biblio.extract_quality ( marc TEXT, best_lang TEXT, best_type TEXT ) RETURNS INT AS $func$
DECLARE
    qual        INT;
    ldr         TEXT;
    tval        TEXT;
    tval_rec    RECORD;
    bval        TEXT;
    bval_rec    RECORD;
    type_map    RECORD;
    ff_pos      RECORD;
    ff_tag_data TEXT;
BEGIN

    IF marc IS NULL OR marc = '' THEN
        RETURN NULL;
    END IF;

    -- First, the count of tags
    qual := ARRAY_UPPER(oils_xpath('*[local-name()="datafield"]', marc), 1);

    -- now go through a bunch of pain to get the record type
    IF best_type IS NOT NULL THEN
        ldr := (oils_xpath('//*[local-name()="leader"]/text()', marc))[1];

        IF ldr IS NOT NULL THEN
            SELECT * INTO tval_rec FROM config.marc21_ff_pos_map WHERE fixed_field = 'Type' LIMIT 1; -- They're all the same
            SELECT * INTO bval_rec FROM config.marc21_ff_pos_map WHERE fixed_field = 'BLvl' LIMIT 1; -- They're all the same


            tval := SUBSTRING( ldr, tval_rec.start_pos + 1, tval_rec.length );
            bval := SUBSTRING( ldr, bval_rec.start_pos + 1, bval_rec.length );

            -- RAISE NOTICE 'type %, blvl %, ldr %', tval, bval, ldr;

            SELECT * INTO type_map FROM config.marc21_rec_type_map WHERE type_val LIKE '%' || tval || '%' AND blvl_val LIKE '%' || bval || '%';

            IF type_map.code IS NOT NULL THEN
                IF best_type = type_map.code THEN
                    qual := qual + qual / 2;
                END IF;

                FOR ff_pos IN SELECT * FROM config.marc21_ff_pos_map WHERE fixed_field = 'Lang' AND rec_type = type_map.code ORDER BY tag DESC LOOP
                    ff_tag_data := SUBSTRING((oils_xpath('//*[@tag="' || ff_pos.tag || '"]/text()',marc))[1], ff_pos.start_pos + 1, ff_pos.length);
                    IF ff_tag_data = best_lang THEN
                            qual := qual + 100;
                    END IF;
                END LOOP;
            END IF;
        END IF;
    END IF;

    -- Now look for some quality metrics
    -- DCL record?
    IF ARRAY_UPPER(oils_xpath('//*[@tag="040"]/*[@code="a" and contains(.,"DLC")]', marc), 1) = 1 THEN
        qual := qual + 10;
    END IF;

    -- From OCLC?
    IF (oils_xpath('//*[@tag="003"]/text()', marc))[1] ~* E'oclo?c' THEN
        qual := qual + 10;
    END IF;

    RETURN qual;

END;
$func$ LANGUAGE PLPGSQL;

CREATE OR REPLACE FUNCTION biblio.extract_fingerprint ( marc text ) RETURNS TEXT AS $func$
DECLARE
	idx		config.biblio_fingerprint%ROWTYPE;
	xfrm		config.xml_transform%ROWTYPE;
	prev_xfrm	TEXT;
	transformed_xml	TEXT;
	xml_node	TEXT;
	xml_node_list	TEXT[];
	raw_text	TEXT;
    output_text TEXT := '';
BEGIN

    IF marc IS NULL OR marc = '' THEN
        RETURN NULL;
    END IF;

	-- Loop over the indexing entries
	FOR idx IN SELECT * FROM config.biblio_fingerprint ORDER BY format, id LOOP

		SELECT INTO xfrm * from config.xml_transform WHERE name = idx.format;

		-- See if we can skip the XSLT ... it's expensive
		IF prev_xfrm IS NULL OR prev_xfrm <> xfrm.name THEN
			-- Can't skip the transform
			IF xfrm.xslt <> '---' THEN
				transformed_xml := oils_xslt_process(marc,xfrm.xslt);
			ELSE
				transformed_xml := marc;
			END IF;

			prev_xfrm := xfrm.name;
		END IF;

		raw_text := COALESCE(
            naco_normalize(
                ARRAY_TO_STRING(
                    oils_xpath(
                        '//text()',
                        (oils_xpath(
                            idx.xpath,
                            transformed_xml,
                            ARRAY[ARRAY[xfrm.prefix, xfrm.namespace_uri]] 
                        ))[1]
                    ),
                    ''
                )
            ),
            ''
        );

        raw_text := REGEXP_REPLACE(raw_text, E'\\[.+?\\]', E'');
        raw_text := REGEXP_REPLACE(raw_text, E'\\mthe\\M|\\man?d?d\\M', E'', 'g'); -- arg! the pain!

        IF idx.first_word IS TRUE THEN
            raw_text := REGEXP_REPLACE(raw_text, E'^(\\w+).*?$', E'\\1');
        END IF;

		output_text := output_text || REGEXP_REPLACE(raw_text, E'\\s+', '', 'g');

	END LOOP;

    RETURN output_text;

END;
$func$ LANGUAGE PLPGSQL;

-- BEFORE UPDATE OR INSERT trigger for biblio.record_entry
CREATE OR REPLACE FUNCTION biblio.fingerprint_trigger () RETURNS TRIGGER AS $func$
BEGIN

    -- For TG_ARGV, first param is language (like 'eng'), second is record type (like 'BKS')

    IF NEW.deleted IS TRUE THEN -- we don't much care, then, do we?
        RETURN NEW;
    END IF;

    NEW.fingerprint := biblio.extract_fingerprint(NEW.marc);
    NEW.quality := biblio.extract_quality(NEW.marc, TG_ARGV[0], TG_ARGV[1]);

    RETURN NEW;

END;
$func$ LANGUAGE PLPGSQL;

-- AFTER UPDATE OR INSERT trigger for biblio.record_entry
CREATE OR REPLACE FUNCTION biblio.indexing_ingest_or_delete () RETURNS TRIGGER AS $func$
DECLARE
    ind_data        metabib.field_entry_template%ROWTYPE;
    old_mr          INT;
    tmp_mr          metabib.metarecord%ROWTYPE;
    source_count    INT;
    deleted_mrs     INT[];
    uris            TEXT[];
    uri_xml         TEXT;
    uri_label       TEXT;
    uri_href        TEXT;
    uri_use         TEXT;
    uri_owner       TEXT;
    uri_owner_id    INT;
    uri_id          INT;
    uri_cn_id       INT;
    uri_map_id      INT;
BEGIN

    DELETE FROM metabib.metarecord_source_map WHERE source = NEW.id; -- Rid ourselves of the search-estimate-killing linkage

    IF NEW.deleted IS TRUE THEN
        RETURN NEW; -- and we're done
    END IF;

    IF TG_OP = 'UPDATE' THEN -- Clean out the cruft
        DELETE FROM metabib.title_field_entry WHERE source = NEW.id;
        DELETE FROM metabib.author_field_entry WHERE source = NEW.id;
        DELETE FROM metabib.subject_field_entry WHERE source = NEW.id;
        DELETE FROM metabib.keyword_field_entry WHERE source = NEW.id;
        DELETE FROM metabib.series_field_entry WHERE source = NEW.id;
        DELETE FROM metabib.full_rec WHERE record = NEW.id;
        DELETE FROM metabib.rec_descriptor WHERE record = NEW.id;

    END IF;

    -- Shove the flattened MARC in
    INSERT INTO metabib.full_rec (record, tag, ind1, ind2, subfield, value)
        SELECT record, tag, ind1, ind2, subfield, value FROM biblio.flatten_marc( NEW.id );

    -- And now the indexing data
    FOR ind_data IN SELECT * FROM biblio.extract_metabib_field_entry( NEW.id ) LOOP
        IF ind_data.field_class = 'title' THEN
            INSERT INTO metabib.title_field_entry (field, source, value)
                VALUES (ind_data.field, ind_data.source, ind_data.value);
        ELSIF ind_data.field_class = 'author' THEN
            INSERT INTO metabib.author_field_entry (field, source, value)
                VALUES (ind_data.field, ind_data.source, ind_data.value);
        ELSIF ind_data.field_class = 'subject' THEN
            INSERT INTO metabib.subject_field_entry (field, source, value)
                VALUES (ind_data.field, ind_data.source, ind_data.value);
        ELSIF ind_data.field_class = 'keyword' THEN
            INSERT INTO metabib.keyword_field_entry (field, source, value)
                VALUES (ind_data.field, ind_data.source, ind_data.value);
        ELSIF ind_data.field_class = 'series' THEN
            INSERT INTO metabib.series_field_entry (field, source, value)
                VALUES (ind_data.field, ind_data.source, ind_data.value);
        END IF;
    END LOOP;

    -- Then, the rec_descriptor
    INSERT INTO metabib.rec_descriptor (record, item_type, item_form, bib_level, control_type, enc_level, audience, lit_form, type_mat, cat_form, pub_status, item_lang, vr_format, date1, date2)
        SELECT  NEW.id,
                biblio.marc21_extract_fixed_field( NEW.id, 'Type' ),
                biblio.marc21_extract_fixed_field( NEW.id, 'Form' ),
                biblio.marc21_extract_fixed_field( NEW.id, 'BLvl' ),
                biblio.marc21_extract_fixed_field( NEW.id, 'Ctrl' ),
                biblio.marc21_extract_fixed_field( NEW.id, 'ELvl' ),
                biblio.marc21_extract_fixed_field( NEW.id, 'Audn' ),
                biblio.marc21_extract_fixed_field( NEW.id, 'LitF' ),
                biblio.marc21_extract_fixed_field( NEW.id, 'TMat' ),
                biblio.marc21_extract_fixed_field( NEW.id, 'Desc' ),
                biblio.marc21_extract_fixed_field( NEW.id, 'DtSt' ),
                biblio.marc21_extract_fixed_field( NEW.id, 'Lang' ),
                (   SELECT  v.value
                      FROM  biblio.marc21_physical_characteristics( NEW.id) p
                            JOIN config.marc21_physical_characteristic_subfield_map s ON (s.id = p.subfield)
                            JOIN config.marc21_physical_characteristic_value_map v ON (v.id = p.value)
                      WHERE p.ptype = 'v' AND s.subfield = 'e'    ),
                biblio.marc21_extract_fixed_field( NEW.id, 'Date1'),
                biblio.marc21_extract_fixed_field( NEW.id, 'Date2');

    -- On to URIs ...
    uris := oils_xpath('//*[@tag="856" and (@ind1="4" or @ind1="1") and (@ind2="0" or @ind2="1")]',NEW.marc);
    IF ARRAY_UPPER(uris,1) > 0 THEN
        FOR i IN 1 .. ARRAY_UPPER(uris, 1) LOOP
            -- First we pull infot out of the 856
            uri_xml     := uris[i];

            uri_href    := (oils_xpath('//*[@code="u"]/text()',uri_xml))[1];
            CONTINUE WHEN uri_href IS NULL;

            uri_label   := (oils_xpath('//*[@code="y"]/text()|//*[@code="3"]/text()|//*[@code="u"]/text()',uri_xml))[1];
            CONTINUE WHEN uri_label IS NULL;

            uri_owner   := (oils_xpath('//*[@code="9"]/text()|//*[@code="w"]/text()|//*[@code="n"]/text()',uri_xml))[1];
            CONTINUE WHEN uri_owner IS NULL;
    
            uri_use     := (oils_xpath('//*[@code="z"]/text()|//*[@code="2"]/text()|//*[@code="n"]/text()',uri_xml))[1];

            uri_owner := REGEXP_REPLACE(uri_owner, $re$^.*?\((\w+)\).*$$re$, E'\\1');
    
            SELECT id INTO uri_owner_id FROM actor.org_unit WHERE shortname = uri_owner;
            CONTINUE WHEN NOT FOUND;
    
            -- now we look for a matching uri
            SELECT id INTO uri_id FROM asset.uri WHERE label = uri_label AND href = uri_href AND use_restriction = uri_use AND active;
            IF NOT FOUND THEN -- create one
                INSERT INTO asset.uri (label, href, use_restriction) VALUES (uri_label, uri_href, uri_use);
                SELECT id INTO uri_id FROM asset.uri WHERE label = uri_label AND href = uri_href AND use_restriction = uri_use AND active;
            END IF;
    
            -- we need a call number to link through
            SELECT id INTO uri_cn_id FROM asset.call_number WHERE owning_lib = uri_owner_id AND record = NEW.id AND label = '##URI##' AND NOT deleted;
            IF NOT FOUND THEN
                INSERT INTO asset.call_number (owning_lib, record, create_date, edit_date, creator, editor, label)
                    VALUES (uri_owner_id, NEW.id, 'now', 'now', NEW.editor, NEW.editor, '##URI##');
                SELECT id INTO uri_cn_id FROM asset.call_number WHERE owning_lib = uri_owner_id AND record = NEW.id AND label = '##URI##' AND NOT deleted;
            END IF;
    
            -- now, link them if they're not already
            SELECT id INTO uri_map_id FROM asset.uri_call_number_map WHERE call_number = uri_cn_id AND uri = uri_id;
            IF NOT FOUND THEN
                INSERT INTO asset.uri_call_number_map (call_number, uri) VALUES (uri_cn_id, uri_id);
            END IF;
    
        END LOOP;
    END IF;

    -- And, finally, metarecord mapping!

    FOR tmp_mr IN SELECT  m.* FROM  metabib.metarecord m JOIN metabib.metarecord_source_map s ON (s.metarecord = m.id) WHERE s.source = NEW.id LOOP

        IF old_mr IS NULL AND NEW.fingerprint = tmp_mr.fingerprint THEN -- Find the first fingerprint-matching
            old_mr := tmp_mr.id;
        ELSE
            SELECT COUNT(*) INTO source_count FROM metabib.metarecord_source_map WHERE metarecord = tmp_mr.id;
            IF source_count = 0 THEN -- No other records
                deleted_mrs := ARRAY_APPEND(deleted_mrs, tmp_mr.id);
                DELETE FROM metabib.metarecord WHERE id = tmp_mr.id;
            END IF;
        END IF;

    END LOOP;

    IF old_mr IS NULL THEN -- we found no suitable, preexisting MR based on old source maps
        SELECT id INTO old_mr FROM metabib.metarecord WHERE fingerprint = NEW.fingerprint; -- is there one for our current fingerprint?
        IF old_mr IS NULL THEN -- nope, create one and grab its id
            INSERT INTO metabib.metarecord ( fingerprint, master_record ) VALUES ( NEW.fingerprint, NEW.id );
            SELECT id INTO old_mr FROM metabib.metarecord WHERE fingerprint = NEW.fingerprint;
        ELSE -- indeed there is. update it with a null cache and recalcualated master record
            UPDATE  metabib.metarecord
              SET   mods = NULL,
                    master_record = ( SELECT id FROM biblio.record_entry WHERE fingerprint = NEW.fingerprint ORDER BY quality DESC LIMIT 1)
              WHERE id = old_mr;
        END IF;
    ELSE -- there was one we already attached to, update its mods cache and master_record
        UPDATE  metabib.metarecord
          SET   mods = NULL,
                master_record = ( SELECT id FROM biblio.record_entry WHERE fingerprint = NEW.fingerprint ORDER BY quality DESC LIMIT 1)
          WHERE id = old_mr;
    END IF;

    INSERT INTO metabib.metarecord_source_map (metarecord, source) VALUES (old_mr, NEW.id); -- new source mapping

    UPDATE action.hold_request SET target = old_mr WHERE target IN ( SELECT explode_array(deleted_mrs) ) AND hold_type = 'M'; -- if we had to delete any MRs above, make sure their holds are moved

    RETURN NEW;

END;
$func$ LANGUAGE PLPGSQL;

COMMIT;
