# ---------------------------------------------------------------
# Copyright (C) 2005  Georgia Public Library Service 
# Bill Erickson <billserickson@gmail.com>

# This program is free software; you can redistribute it and/or
# modify it under the terms of the GNU General Public License
# as published by the Free Software Foundation; either version 2
# of the License, or (at your option) any later version.

# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
# ---------------------------------------------------------------


package OpenILS::Application::Circ::Money;
use base qw/OpenILS::Application/;
use strict; use warnings;
use OpenILS::Application::AppUtils;
my $apputils = "OpenILS::Application::AppUtils";
my $U = "OpenILS::Application::AppUtils";

use OpenSRF::EX qw(:try);
use OpenILS::Perm;
use Data::Dumper;
use OpenILS::Event;
use OpenSRF::Utils::Logger qw/:logger/;
use OpenILS::Utils::CStoreEditor qw/:funcs/;

__PACKAGE__->register_method(
	method	=> "make_payments",
	api_name	=> "open-ils.circ.money.payment",
	notes		=> <<"	NOTE");
	Pass in a structure like so:
		{ 
			cash_drawer: <string>, 
			payment_type : <string>, 
			note : <string>, 
			userid : <id>,
			payments: [ 
				[trans_id, amt], 
				[...]
			], 
			patron_credit : <credit amt> 
		}
	login must have CREATE_PAYMENT priveleges.
	If any payments fail, all are reverted back.
	NOTE

sub make_payments {

	my( $self, $client, $login, $payments ) = @_;

	my( $user, $trans, $evt );

	( $user, $evt ) = $apputils->checkses($login);
	return $evt if $evt;
	$evt = $apputils->check_perms($user->id, $user->ws_ou, 'CREATE_PAYMENT');
	return $evt if $evt;

	my $e = new_editor(); # at this point, just for convenience

	$logger->info("Creating payment objects: " . Dumper($payments) );

	my $session = $apputils->start_db_session;
	my $type		= $payments->{payment_type};
	my $credit	= $payments->{patron_credit} || 0;
	my $drawer	= $user->wsid;
	my $userid	= $payments->{userid};
	my $note		= $payments->{note};
	my $cc_type = $payments->{cc_type} || 'n/a';
	my $cc_number		= $payments->{cc_number} || 'n/a';
	my $expire_month	= $payments->{expire_month};
	my $expire_year	= $payments->{expire_year};
	my $approval_code = $payments->{approval_code} || 'n/a';
	my $check_number	= $payments->{check_number} || 'n/a';

	my $total_paid = 0;

	for my $pay (@{$payments->{payments}}) {

		my $transid = $pay->[0];
		my $amount = $pay->[1];
		$amount =~ s/\$//og; # just to be safe

		$total_paid += $amount;

		$trans = fetch_mbts($self, $client, $login, $transid);
		return $trans if $U->event_code($trans);

		$logger->info("payment: processing transaction [$transid] with balance_owed = ". 
			$trans->balance_owed. ",  payment amount = $amount, and payment type = $type");

		if($trans->usr != $userid) { # Do we need to restrict this in some way ??
			$logger->info( " * User $userid is making a payment for " . 
				"a different user: " .  $trans->usr . ' for transaction ' . $trans->id  );
		}

		if($type eq 'credit_payment') {
			$credit -= $amount;
			$logger->activity("user ".$user->id." reducing patron credit by ".
				"$credit for making a credit_payment on transaction ".$trans->id);
		}

		# A negative payment is a refund.  
		if( $amount < 0 ) {
			
			$logger->info("payment: received a negative payment (refund) of $amount");

			# If the refund causes the transaction balance to exceed 0 dollars, 
			# we are in effect loaning the patron money.  This is not allowed.
			if( ($trans->balance_owed - $amount) > 0 ) {
				return OpenILS::Event->new('REFUND_EXCEEDS_BALANCE');
			}

			# Otherwise, make sure the refund does not exceed desk payments
			# This is also not allowed
			my $desk_total = 0;
			my $desk_payments = $e->search_money_desk_payment(
				{ xact => $transid, voided => 'f' });
			$desk_total += $_->amount for @$desk_payments;

			if( (-$amount) > $desk_total ) {
				return OpenILS::Event->new(
					'REFUND_EXCEEDS_DESK_PAYMENTS', 
					payload => { allowed_refund => $desk_total, submitted_refund => -$amount } );
			}
		}

		my $payobj = "Fieldmapper::money::$type";
		$payobj = $payobj->new;

		$payobj->amount($amount);
		$payobj->amount_collected($amount);
		$payobj->xact($transid);
		$payobj->note($note);

		if ($payobj->has_field('accepting_usr')) { $payobj->accepting_usr($user->id); }
		if ($payobj->has_field('cash_drawer')) { $payobj->cash_drawer($drawer); }
		if ($payobj->has_field('cc_type')) { $payobj->cc_type($cc_type); }
		if ($payobj->has_field('cc_number')) { $payobj->cc_number($cc_number); }
		if ($payobj->has_field('expire_month')) { $payobj->expire_month($expire_month); }
		if ($payobj->has_field('expire_year')) { $payobj->expire_year($expire_year); }
		if ($payobj->has_field('approval_code')) { $payobj->approval_code($approval_code); }
		if ($payobj->has_field('check_number')) { $payobj->check_number($check_number); }
		
		# update the transaction if it's done 
		if( (my $cred = ($trans->balance_owed - $amount)) <= 0 ) {

			# Any overpay on this transaction goes directly into patron credit 
			$cred = -$cred;

			$logger->info("payment: amount ($amount) exceeds transaction balance of ".
				$trans->balance_owed.".  Applying patron credit of $cred");

			$credit += $cred;

			$trans = $session->request(
				"open-ils.storage.direct.money.billable_transaction.retrieve", $transid )->gather(1);

			# If this is a circulation, we can't close the transaction unless stop_fines is set
			my $circ = $session->request(
				'open-ils.storage.direct.action.circulation.retrieve', $transid )->gather(1);

			if( !$circ || $circ->stop_fines ) {

				$trans->xact_finish("now");
				my $s = $session->request(
					"open-ils.storage.direct.money.billable_transaction.update", $trans )->gather(1);
	
				if(!$s) { throw OpenSRF::EX::ERROR 
					("Error updating billable_xact in circ.money.payment"); }
			}
		}

		my $s = $session->request(
			"open-ils.storage.direct.money.$type.create", $payobj )->gather(1);
		if(!$s) { throw OpenSRF::EX::ERROR ("Error creating new $type"); }

	}


	my $uid = $user->id;
	$logger->info("user $uid applying total ".
		"credit of $credit to user $userid") if $credit != 0;

	$logger->info("user $uid applying total payment of $total_paid to user $userid");

	$evt = _update_patron_credit( $session, $userid, $credit );
	return $evt if $evt;

	$apputils->commit_db_session($session);

	# ------------------------------------------------------------------------------
	# Update the patron penalty info in the DB
	# ------------------------------------------------------------------------------
	$U->update_patron_penalties( 
		authtoken => $login,
		patronid  => $userid,
	);

	$client->respond_complete(1);	

	return undef;
}


sub _update_patron_credit {
	my( $session, $userid, $credit ) = @_;
	#return if $credit <= 0;

	my $patron = $session->request( 
		'open-ils.storage.direct.actor.user.retrieve', $userid )->gather(1);

	$patron->credit_forward_balance( 
		$patron->credit_forward_balance + $credit);

	if( $patron->credit_forward_balance < 0 ) {
		return OpenILS::Event->new('NEGATIVE_PATRON_BALANCE');
	}
	
	$logger->info("Total patron credit for $userid is now " . $patron->credit_forward_balance );

	$session->request( 
		'open-ils.storage.direct.actor.user.update', $patron )->gather(1);

	return undef;
}


__PACKAGE__->register_method(
	method	=> "retrieve_payments",
	api_name	=> "open-ils.circ.money.payment.retrieve.all_",
	notes		=> "Returns a list of payments attached to a given transaction"
	);
	
sub retrieve_payments {
	my( $self, $client, $login, $transid ) = @_;

	my( $staff, $evt ) =  
		$apputils->checksesperm($login, 'VIEW_TRANSACTION');
	return $evt if $evt;

	# XXX the logic here is wrong.. we need to check the owner of the transaction
	# to make sure the requestor has access

	# XXX grab the view, for each object in the view, grab the real object

	return $apputils->simplereq(
		'open-ils.cstore',
		'open-ils.cstore.direct.money.payment.search.atomic', { xact => $transid } );
}



__PACKAGE__->register_method(
	method	=> "retrieve_payments2",
    authoritative => 1,
	api_name	=> "open-ils.circ.money.payment.retrieve.all",
	notes		=> "Returns a list of payments attached to a given transaction"
	);
	
sub retrieve_payments2 {
	my( $self, $client, $login, $transid ) = @_;

	my $e = new_editor(authtoken=>$login);
	return $e->event unless $e->checkauth;
	return $e->event unless $e->allowed('VIEW_TRANSACTION');

	my @payments;
	my $pmnts = $e->search_money_payment({ xact => $transid });
	for( @$pmnts ) {
		my $type = $_->payment_type;
		my $meth = "retrieve_money_$type";
		my $p = $e->$meth($_->id) or return $e->event;
		$p->payment_type($type);
		$p->cash_drawer($e->retrieve_actor_workstation($p->cash_drawer))
			if $p->has_field('cash_drawer');
		push( @payments, $p );
	}

	return \@payments;
}



__PACKAGE__->register_method(
	method	=> "create_grocery_bill",
	api_name	=> "open-ils.circ.money.grocery.create",
	notes		=> <<"	NOTE");
	Creates a new grocery transaction using the transaction object provided
	PARAMS: (login_session, money.grocery (mg) object)
	NOTE

sub create_grocery_bill {
	my( $self, $client, $login, $transaction ) = @_;

	my( $staff, $evt ) = $apputils->checkses($login);
	return $evt if $evt;
	$evt = $apputils->check_perms($staff->id, 
		$transaction->billing_location, 'CREATE_TRANSACTION' );
	return $evt if $evt;


	$logger->activity("Creating grocery bill " . Dumper($transaction) );

	$transaction->clear_id;
	my $session = $apputils->start_db_session;
	my $transid = $session->request(
		'open-ils.storage.direct.money.grocery.create', $transaction)->gather(1);

	throw OpenSRF::EX ("Error creating new money.grocery") unless defined $transid;

	$logger->debug("Created new grocery transaction $transid");
	
	$apputils->commit_db_session($session);

    my $e = new_editor(xact=>1);
    $evt = _check_open_xact($e, $transid);
    return $evt if $evt;
    $e->commit;

	return $transid;
}


__PACKAGE__->register_method(
	method => 'fetch_grocery',
	api_name => 'open-ils.circ.money.grocery.retrieve'
);

sub fetch_grocery {
	my( $self, $conn, $auth, $id ) = @_;
	my $e = new_editor(authtoken=>$auth);
	return $e->event unless $e->checkauth;
	return $e->event unless $e->allowed('VIEW_TRANSACTION'); # eh.. basically the same permission
	my $g = $e->retrieve_money_grocery($id)
		or return $e->event;
	return $g;
}


__PACKAGE__->register_method(
	method	=> "billing_items",
    authoritative => 1,
	api_name	=> "open-ils.circ.money.billing.retrieve.all",
	notes		=><<"	NOTE");
	Returns a list of billing items for the given transaction.
	PARAMS( login, transaction_id )
	NOTE

sub billing_items {
	my( $self, $client, $login, $transid ) = @_;

	my( $trans, $evt ) = $U->fetch_billable_xact($transid);
	return $evt if $evt;

	my $staff;
	($staff, $evt ) = $apputils->checkses($login);
	return $evt if $evt;

	if($staff->id ne $trans->usr) {
		$evt = $U->check_perms($staff->id, $staff->home_ou, 'VIEW_TRANSACTION');
		return $evt if $evt;
	}
	
	return $apputils->simplereq( 'open-ils.cstore',
		'open-ils.cstore.direct.money.billing.search.atomic', { xact => $transid } )
}


__PACKAGE__->register_method(
	method	=> "billing_items_create",
	api_name	=> "open-ils.circ.money.billing.create",
	notes		=><<"	NOTE");
	Creates a new billing line item
	PARAMS( login, bill_object (mb) )
	NOTE

sub billing_items_create {
	my( $self, $client, $login, $billing ) = @_;

	my $e = new_editor(authtoken => $login, xact => 1);
	return $e->event unless $e->checkauth;
	return $e->event unless $e->allowed('CREATE_BILL');

	my $xact = $e->retrieve_money_billable_transaction($billing->xact)
		or return $e->event;

	# if the transaction was closed, re-open it
	if($xact->xact_finish) {
		$xact->clear_xact_finish;
		$e->update_money_billable_transaction($xact)
			or return $e->event;
	}

	my $amt = $billing->amount;
	$amt =~ s/\$//og;
	$billing->amount($amt);

	$e->create_money_billing($billing) or return $e->event;
	$e->commit;

	# ------------------------------------------------------------------------------
	# Update the patron penalty info in the DB
	# ------------------------------------------------------------------------------
	$U->update_patron_penalties(
		authtoken => $login,
		patronid  => $xact->usr,
	);

	return $billing->id;
}

__PACKAGE__->register_method(
	method		=>	'void_bill',
	api_name		=> 'open-ils.circ.money.billing.void',
	signature	=> q/
		Voids a bill
		@param authtoken Login session key
		@param billid The id of the bill to void
		@return 1 on success, Event on error
	/
);


sub void_bill {
	my( $s, $c, $authtoken, @billids ) = @_;

	my $e = new_editor( authtoken => $authtoken, xact => 1 );
	return $e->event unless $e->checkauth;
	return $e->event unless $e->allowed('VOID_BILLING');

    my %users;
    for my $billid (@billids) {

	    my $bill = $e->retrieve_money_billing($billid)
		    or return $e->event;

        my $xact = $e->retrieve_money_billable_transaction($bill->xact)
            or return $e->event;

        $users{$xact->usr} = 1;
    
	    return OpenILS::Event->new('BILL_ALREADY_VOIDED', payload => $bill) 
		    if $bill->voided and $bill->voided =~ /t/io;
    
	    $bill->voided('t');
	    $bill->voider($e->requestor->id);
	    $bill->void_time('now');
    
	    $e->update_money_billing($bill) or return $e->event;
	    my $evt = _check_open_xact($e, $bill->xact, $xact);
	    return $evt if $evt;
    }

	$e->commit;
    # update the penalties for each affected user
	$U->update_patron_penalties( authtoken => $authtoken, patronid  => $_ ) for keys %users;
	return 1;
}


sub _check_open_xact {
	my( $editor, $xactid, $xact ) = @_;

	# Grab the transaction
	$xact ||= $editor->retrieve_money_billable_transaction($xactid);
    return $editor->event unless $xact;
    $xactid ||= $xact->id;

	# grab the summary and see how much is owed on this transaction
	my ($summary) = $U->fetch_mbts($xactid, $editor);

	# grab the circulation if it is a circ;
	my $circ = $editor->retrieve_action_circulation($xactid);

	# If nothing is owed on the transaction but it is still open
	# and this transaction is not an open circulation, close it
	if( 
		( $summary->balance_owed == 0 and ! $xact->xact_finish ) and
		( !$circ or $circ->stop_fines )) {

		$logger->info("closing transaction ".$xact->id. ' becauase balance_owed == 0');
		$xact->xact_finish('now');
		$editor->update_money_billable_transaction($xact)
			or return $editor->event;
		return undef;
	}

	# If money is owed or a refund is due on the xact and xact_finish
	# is set, clear it (to reopen the xact) and update
	if( $summary->balance_owed != 0 and $xact->xact_finish ) {
		$logger->info("re-opening transaction ".$xact->id. ' becauase balance_owed != 0');
		$xact->clear_xact_finish;
		$editor->update_money_billable_transaction($xact)
			or return $editor->event;
		return undef;
	}

	return undef;
}



__PACKAGE__->register_method (
	method => 'fetch_mbts',
    authoritative => 1,
	api_name => 'open-ils.circ.money.billable_xact_summary.retrieve'
);
sub fetch_mbts {
	my( $self, $conn, $auth, $id) = @_;

	my $e = new_editor(xact => 1, authtoken=>$auth);
	return $e->event unless $e->checkauth;
	my ($mbts) = $U->fetch_mbts($id, $e);

	my $user = $e->retrieve_actor_user($mbts->usr)
		or return $e->die_event;

	return $e->die_event unless $e->allowed('VIEW_TRANSACTION', $user->home_ou);
	$e->rollback;
	return $mbts
}



__PACKAGE__->register_method(
	method => 'desk_payments',
	api_name => 'open-ils.circ.money.org_unit.desk_payments'
);

sub desk_payments {
	my( $self, $conn, $auth, $org, $start_date, $end_date ) = @_;
	my $e = new_editor(authtoken=>$auth);
	return $e->event unless $e->checkauth;
	return $e->event unless $e->allowed('VIEW_TRANSACTION', $org);
	my $data = $U->storagereq(
		'open-ils.storage.money.org_unit.desk_payments.atomic',
		$org, $start_date, $end_date );

	$_->workstation( $_->workstation->name ) for(@$data);
	return $data;
}


__PACKAGE__->register_method(
	method => 'user_payments',
	api_name => 'open-ils.circ.money.org_unit.user_payments'
);

sub user_payments {
	my( $self, $conn, $auth, $org, $start_date, $end_date ) = @_;
	my $e = new_editor(authtoken=>$auth);
	return $e->event unless $e->checkauth;
	return $e->event unless $e->allowed('VIEW_TRANSACTION', $org);
	my $data = $U->storagereq(
		'open-ils.storage.money.org_unit.user_payments.atomic',
		$org, $start_date, $end_date );
	for(@$data) {
		$_->usr->card(
			$e->retrieve_actor_card($_->usr->card)->barcode);
		$_->usr->home_ou(
			$e->retrieve_actor_org_unit($_->usr->home_ou)->shortname);
	}
	return $data;
}




1;



