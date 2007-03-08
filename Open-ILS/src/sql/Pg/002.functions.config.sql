BEGIN;

CREATE OR REPLACE FUNCTION oils_xml_transform ( TEXT, TEXT ) RETURNS TEXT AS $_$
	SELECT	CASE	WHEN (SELECT COUNT(*) FROM config.xml_transform WHERE name = $2 AND xslt = '---') > 0 THEN $1
			ELSE xslt_process($1, (SELECT xslt FROM config.xml_transform WHERE name = $2))
		END;
$_$ LANGUAGE SQL STRICT IMMUTABLE;



CREATE TYPE biblio_field_vtype AS ( record BIGINT, field INT, content TEXT );
CREATE OR REPLACE FUNCTION biblio_field_table ( record BIGINT, field_list INT[] ) RETURNS SETOF biblio_field_vtype AS $_$
DECLARE
	i INT;
	rec biblio_field_vtype%ROWTYPE;
BEGIN
	FOR i IN ARRAY_LOWER(field_list,1) .. ARRAY_UPPER(field_list,1) LOOP
		FOR rec IN      SELECT	DISTINCT r, field_list[i], BTRIM(REGEXP_REPLACE(REGEXP_REPLACE(f, E'\n', ' ', 'g'), '[ ]+', ' ', 'g'))
				  FROM	xpath_table_ns(
						'id',
						$$oils_xml_transform(marc,'$$ || (SELECT format FROM config.metabib_field WHERE id = field_list[i]) || $$')$$,
						'biblio.record_entry',
						(SELECT xpath FROM config.metabib_field WHERE id = field_list[i]),
						'id = ' || record,
						(SELECT x.prefix FROM config.xml_transform x JOIN config.metabib_field m ON (m.format = x.name) WHERE m.id = field_list[i]),
						(SELECT x.namespace_uri FROM config.xml_transform x JOIN config.metabib_field m ON (m.format = x.name) WHERE m.id = field_list[i])
					) AS t( r bigint, f text)
				  WHERE f IS NOT NULL LOOP
			RETURN NEXT rec;
		END LOOP;
	END LOOP;
END;
$_$ LANGUAGE PLPGSQL;



CREATE OR REPLACE FUNCTION biblio_field_table ( record BIGINT, field INT ) RETURNS SETOF biblio_field_vtype AS $_$
	SELECT * FROM biblio_field_table( $1, ARRAY[$2] )
$_$ LANGUAGE SQL;

COMMIT;

