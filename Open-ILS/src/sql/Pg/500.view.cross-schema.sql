BEGIN;

CREATE OR REPLACE VIEW money.open_billable_xact_summary AS
	SELECT	xact.id AS id,
		xact.usr AS usr,
		COALESCE(circ.circ_lib,groc.billing_location) AS billing_location,
		xact.xact_start AS xact_start,
		xact.xact_finish AS xact_finish,
		SUM(credit.amount) AS total_paid,
		MAX(credit.payment_ts) AS last_payment_ts,
		LAST(credit.note) AS last_payment_note,
		LAST(credit.payment_type) AS last_payment_type,
		SUM(debit.amount) AS total_owed,
		MAX(debit.billing_ts) AS last_billing_ts,
		LAST(debit.note) AS last_billing_note,
		LAST(debit.billing_type) AS last_billing_type,
		COALESCE(SUM(debit.amount),0) - COALESCE(SUM(credit.amount),0) AS balance_owed,
		p.relname AS xact_type
	  FROM	money.billable_xact xact
	  	JOIN pg_class p ON (xact.tableoid = p.oid)
		LEFT JOIN "action".circulation circ ON (circ.id = xact.id)
		LEFT JOIN money.grocery groc ON (groc.id = xact.id)
	  	LEFT JOIN (
			SELECT	billing.xact,
				billing.voided,
				sum(billing.amount) AS amount,
				max(billing.billing_ts) AS billing_ts,
				last(billing.note) AS note,
				last(billing.billing_type) AS billing_type
			  FROM	money.billing
			  WHERE	billing.voided IS FALSE
			  GROUP BY billing.xact, billing.voided
		) debit ON (xact.id = debit.xact AND debit.voided IS FALSE)
	  	LEFT JOIN (
			SELECT	payment_view.xact,
				payment_view.voided,
				sum(payment_view.amount) AS amount,
				max(payment_view.payment_ts) AS payment_ts,
				last(payment_view.note) AS note,
				last(payment_view.payment_type) AS payment_type
			  FROM	money.payment_view
			  WHERE	payment_view.voided IS FALSE
			  GROUP BY payment_view.xact, payment_view.voided
		) credit ON (xact.id = credit.xact AND credit.voided IS FALSE)
	  WHERE	xact.xact_finish IS NULL
	  GROUP BY 1,2,3,4,5,15
	  ORDER BY MAX(debit.billing_ts), MAX(credit.payment_ts);


CREATE OR REPLACE VIEW money.open_usr_summary AS
	SELECT	usr,
		SUM(total_paid) AS total_paid,
		SUM(total_owed) AS total_owed, 
		SUM(balance_owed) AS balance_owed
	  FROM money.open_billable_xact_summary
	  GROUP BY 1;

CREATE OR REPLACE VIEW money.open_usr_circulation_summary AS
	SELECT	usr,
		SUM(total_paid) AS total_paid,
		SUM(total_owed) AS total_owed, 
		SUM(balance_owed) AS balance_owed
	  FROM	money.open_billable_xact_summary
	  WHERE	xact_type = 'circulation'
	  GROUP BY 1;

COMMIT;

