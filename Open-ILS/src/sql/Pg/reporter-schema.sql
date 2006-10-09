DROP SCHEMA reporter CASCADE;

BEGIN;

CREATE SCHEMA reporter;

CREATE TABLE reporter.template_folder (
	id		SERIAL				PRIMARY KEY,
	parent		INT				REFERENCES reporter.template_folder (id) DEFERRABLE INITIALLY DEFERRED,
	owner		INT				NOT NULL REFERENCES actor.usr (id) DEFERRABLE INITIALLY DEFERRED,
	create_time	TIMESTAMP WITH TIME ZONE	NOT NULL DEFAULT NOW(),
	name		TEXT				NOT NULL,
	shared		BOOL				NOT NULL DEFAULT FALSE,
	share_with	INT				REFERENCES actor.org_unit (id) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX rpt_tmpl_fldr_owner_idx ON reporter.template_folder (owner);
CREATE UNIQUE INDEX rpt_template_folder_once_parent_idx ON reporter.template_folder (name,parent);
CREATE UNIQUE INDEX rpt_template_folder_once_idx ON reporter.template_folder (name,owner) WHERE parent IS NULL;

CREATE TABLE reporter.report_folder (
	id		SERIAL				PRIMARY KEY,
	parent		INT				REFERENCES reporter.report_folder (id) DEFERRABLE INITIALLY DEFERRED,
	owner		INT				NOT NULL REFERENCES actor.usr (id) DEFERRABLE INITIALLY DEFERRED,
	create_time	TIMESTAMP WITH TIME ZONE	NOT NULL DEFAULT NOW(),
	name		TEXT				NOT NULL,
	shared		BOOL				NOT NULL DEFAULT FALSE,
	share_with	INT				REFERENCES actor.org_unit (id) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX rpt_rpt_fldr_owner_idx ON reporter.report_folder (owner);
CREATE UNIQUE INDEX rpt_report_folder_once_parent_idx ON reporter.report_folder (name,parent);
CREATE UNIQUE INDEX rpt_report_folder_once_idx ON reporter.report_folder (name,owner) WHERE parent IS NULL;

CREATE TABLE reporter.output_folder (
	id		SERIAL				PRIMARY KEY,
	parent		INT				REFERENCES reporter.output_folder (id) DEFERRABLE INITIALLY DEFERRED,
	owner		INT				NOT NULL REFERENCES actor.usr (id) DEFERRABLE INITIALLY DEFERRED,
	create_time	TIMESTAMP WITH TIME ZONE	NOT NULL DEFAULT NOW(),
	name		TEXT				NOT NULL,
	shared		BOOL				NOT NULL DEFAULT FALSE,
	share_with	INT				REFERENCES actor.org_unit (id) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX rpt_output_fldr_owner_idx ON reporter.output_folder (owner);
CREATE UNIQUE INDEX rpt_output_folder_once_parent_idx ON reporter.output_folder (name,parent);
CREATE UNIQUE INDEX rpt_output_folder_once_idx ON reporter.output_folder (name,owner) WHERE parent IS NULL;


CREATE TABLE reporter.template (
	id		SERIAL				PRIMARY KEY,
	owner		INT				NOT NULL REFERENCES actor.usr (id) DEFERRABLE INITIALLY DEFERRED,
	create_time	TIMESTAMP WITH TIME ZONE	NOT NULL DEFAULT NOW(),
	name		TEXT				NOT NULL,
	description	TEXT				NOT NULL,
	data		TEXT				NOT NULL,
	folder		INT				NOT NULL REFERENCES reporter.template_folder (id)
);
CREATE INDEX rpt_tmpl_owner_idx ON reporter.template (owner);
CREATE INDEX rpt_tmpl_fldr_idx ON reporter.template (folder);
CREATE UNIQUE INDEX rtp_template_folder_once_idx ON reporter.template (name,folder);

CREATE TABLE reporter.report (
	id		SERIAL				PRIMARY KEY,
	owner		INT				NOT NULL REFERENCES actor.usr (id) DEFERRABLE INITIALLY DEFERRED,
	create_time	TIMESTAMP WITH TIME ZONE	NOT NULL DEFAULT NOW(),
	name		TEXT				NOT NULL DEFAULT '',
	description	TEXT				NOT NULL DEFAULT '',
	template	INT				NOT NULL REFERENCES reporter.template (id) DEFERRABLE INITIALLY DEFERRED,
	data		TEXT				NOT NULL,
	folder		INT				NOT NULL REFERENCES reporter.report_folder (id),
	recur		BOOL				NOT NULL DEFAULT FALSE,
	recurance	INTERVAL
);
CREATE INDEX rpt_rpt_owner_idx ON reporter.report (owner);
CREATE INDEX rpt_rpt_fldr_idx ON reporter.report (folder);
CREATE UNIQUE INDEX rtp_report_folder_once_idx ON reporter.report (name,folder);

CREATE TABLE reporter.schedule (
	id		SERIAL				PRIMARY KEY,
	report		INT				NOT NULL REFERENCES reporter.report (id) DEFERRABLE INITIALLY DEFERRED,
	folder		INT				NOT NULL REFERENCES reporter.output_folder (id),
	runner		INT				NOT NULL REFERENCES actor.usr (id) DEFERRABLE INITIALLY DEFERRED,
	run_time	TIMESTAMP WITH TIME ZONE	NOT NULL DEFAULT NOW(),
	start_time	TIMESTAMP WITH TIME ZONE,
	complete_time	TIMESTAMP WITH TIME ZONE,
	email		TEXT,
	excel_format	BOOL				NOT NULL DEFAULT TRUE,
	html_format	BOOL				NOT NULL DEFAULT TRUE,
	csv_format	BOOL				NOT NULL DEFAULT TRUE,
	chart_pie	BOOL				NOT NULL DEFAULT FALSE,
	chart_bar	BOOL				NOT NULL DEFAULT FALSE,
	chart_line	BOOL				NOT NULL DEFAULT FALSE,
	error_code	INT,
	error_text	TEXT
);
CREATE INDEX rpt_sched_runner_idx ON reporter.schedule (runner);
CREATE INDEX rpt_sched_folder_idx ON reporter.schedule (folder);

CREATE OR REPLACE VIEW reporter.simple_record AS
SELECT	r.id,
	s.metarecord,
	r.fingerprint,
	r.quality,
	r.tcn_source,
	r.tcn_value,
	title.value AS title,
	uniform_title.value AS uniform_title,
	author.value AS author,
	publisher.value AS publisher,
	SUBSTRING(pubdate.value FROM $$\d+$$) AS pubdate,
	series_title.value AS series_title,
	series_statement.value AS series_statement,
	summary.value AS summary,
	ARRAY_ACCUM( SUBSTRING(isbn.value FROM $$^\S+$$) ) AS isbn,
	ARRAY_ACCUM( SUBSTRING(issn.value FROM $$^\S+$$) ) AS issn,
	ARRAY((SELECT DISTINCT value FROM metabib.full_rec WHERE tag = '650' AND subfield = 'a' AND record = r.id)) AS topic_subject,
	ARRAY((SELECT DISTINCT value FROM metabib.full_rec WHERE tag = '651' AND subfield = 'a' AND record = r.id)) AS geographic_subject,
	ARRAY((SELECT DISTINCT value FROM metabib.full_rec WHERE tag = '655' AND subfield = 'a' AND record = r.id)) AS genre,
	ARRAY((SELECT DISTINCT value FROM metabib.full_rec WHERE tag = '600' AND subfield = 'a' AND record = r.id)) AS name_subject,
	ARRAY((SELECT DISTINCT value FROM metabib.full_rec WHERE tag = '610' AND subfield = 'a' AND record = r.id)) AS corporate_subject,
	ARRAY((SELECT value FROM metabib.full_rec WHERE tag = '856' AND subfield IN ('3','y','u') AND record = r.id ORDER BY CASE WHEN subfield IN ('3','y') THEN 0 ELSE 1 END)) AS external_uri
  FROM	biblio.record_entry r
	JOIN metabib.metarecord_source_map s ON (s.source = r.id)
	LEFT JOIN metabib.full_rec uniform_title ON (r.id = uniform_title.record AND uniform_title.tag = '240' AND uniform_title.subfield = 'a')
	LEFT JOIN metabib.full_rec title ON (r.id = title.record AND title.tag = '245' AND title.subfield = 'a')
	LEFT JOIN metabib.full_rec author ON (r.id = author.record AND author.tag = '100' AND author.subfield = 'a')
	LEFT JOIN metabib.full_rec publisher ON (r.id = publisher.record AND publisher.tag = '260' AND publisher.subfield = 'b')
	LEFT JOIN metabib.full_rec pubdate ON (r.id = pubdate.record AND pubdate.tag = '260' AND pubdate.subfield = 'c')
	LEFT JOIN metabib.full_rec isbn ON (r.id = isbn.record AND isbn.tag IN ('024', '020') AND isbn.subfield IN ('a','z'))
	LEFT JOIN metabib.full_rec issn ON (r.id = issn.record AND issn.tag = '022' AND issn.subfield = 'a')
	LEFT JOIN metabib.full_rec series_title ON (r.id = series_title.record AND series_title.tag IN ('830','440') AND series_title.subfield = 'a')
	LEFT JOIN metabib.full_rec series_statement ON (r.id = series_statement.record AND series_statement.tag = '490' AND series_statement.subfield = 'a')
	LEFT JOIN metabib.full_rec summary ON (r.id = summary.record AND summary.tag = '520' AND summary.subfield = 'a')
  WHERE	r.deleted IS FALSE
  GROUP BY 1,2,3,4,5,6,7,8,9,10,11,12,13,14;

CREATE OR REPLACE VIEW reporter.demographic AS
SELECT	u.id,
	u.dob,
	CASE
		WHEN u.dob IS NULL
			THEN 'Adult'
		WHEN AGE(u.dob) > '18 years'::INTERVAL
			THEN 'Adult'
		ELSE 'Juvenile'
	END AS general_division
  FROM	actor.usr u;

COMMIT;

