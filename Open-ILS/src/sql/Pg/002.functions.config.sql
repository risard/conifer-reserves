BEGIN;

/*
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

*/

CREATE OR REPLACE FUNCTION oils_i18n_xlate ( keytable TEXT, keycol TEXT, identcol TEXT, keyvalue TEXT, raw_locale TEXT ) RETURNS TEXT AS $func$
DECLARE
    locale      TEXT := LOWER( REGEXP_REPLACE( REGEXP_REPLACE( raw_locale, E'[;, ].+$', '' ), E'-', '_', 'g' ) );
    language    TEXT := REGEXP_REPLACE( locale, E'_.+$', '' );
    result      config.i18n_core%ROWTYPE;
    fallback    TEXT;
    keyfield    TEXT := keytable || '.' || keycol;
BEGIN

    -- Try the full locale
    SELECT  * INTO result
      FROM  config.i18n_core
      WHERE fq_field = keyfield
            AND identity_value = keyvalue
            AND translation = locale;

    -- Try just the language
    IF NOT FOUND THEN
        SELECT  * INTO result
          FROM  config.i18n_core
          WHERE fq_field = keyfield
                AND identity_value = keyvalue
                AND translation = language;
    END IF;

    -- Fall back to the string we passed in in the first place
    IF NOT FOUND THEN
	EXECUTE
            'SELECT ' ||
                keycol ||
            ' FROM ' || keytable ||
            ' WHERE ' || identcol || ' = ' || quote_literal(keyvalue)
                INTO fallback;
        RETURN fallback;
    END IF;

    RETURN result.string;
END;
$func$ LANGUAGE PLPGSQL;

-- Function for marking translatable strings in SQL statements
CREATE OR REPLACE FUNCTION oils_i18n_gettext( TEXT ) RETURNS TEXT AS $$
    SELECT $1;
$$ LANGUAGE SQL;

CREATE OR REPLACE FUNCTION public.first_word ( TEXT ) RETURNS TEXT AS $$
        SELECT SUBSTRING( $1 FROM $_$^\S+$_$);
$$ LANGUAGE SQL;

COMMIT;

