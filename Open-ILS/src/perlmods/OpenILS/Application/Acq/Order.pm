package OpenILS::Application::Acq::BatchManager;
use OpenSRF::AppSession;
use OpenSRF::EX qw/:try/;
use strict; use warnings;

sub new {
    my($class, %args) = @_;
    my $self = bless(\%args, $class);
    $self->{args} = {
        lid => 0,
        li => 0,
        copies => 0,
        bibs => 0,
        progress => 0,
        debits_accrued => 0,
        purchase_order => undef,
        picklist => undef,
        complete => 0,
        indexed => 0,
        total => 0
    };
    $self->{ingest_queue} = [];
    $self->{cache} = {};
    return $self;
}

sub conn {
    my($self, $val) = @_;
    $self->{conn} = $val if $val;
    return $self->{conn};
}
sub throttle {
    my($self, $val) = @_;
    $self->{throttle} = $val if $val;
    return $self->{throttle};
}
sub respond {
    my($self, %other_args) = @_;
    if($self->throttle and not %other_args) {
        return unless (
            ($self->{args}->{progress} - $self->{last_respond_progress}) >= $self->throttle
        );
    }
    $self->conn->respond({ %{$self->{args}}, %other_args });
    $self->{last_respond_progress} = $self->{args}->{progress};
}
sub respond_complete {
    my($self, %other_args) = @_;
    $self->complete;
    $self->conn->respond_complete({ %{$self->{args}}, %other_args });
    return undef;
}
sub total {
    my($self, $val) = @_;
    $self->{args}->{total} = $val if defined $val;
    return $self->{args}->{total};
}
sub purchase_order {
    my($self, $val) = @_;
    $self->{args}->{purchase_order} = $val if $val;
    return $self;
}
sub picklist {
    my($self, $val) = @_;
    $self->{args}->{picklist} = $val if $val;
    return $self;
}
sub add_lid {
    my $self = shift;
    $self->{args}->{lid} += 1;
    $self->{args}->{progress} += 1;
    return $self;
}
sub add_li {
    my $self = shift;
    $self->{args}->{li} += 1;
    $self->{args}->{progress} += 1;
    return $self;
}
sub add_copy {
    my $self = shift;
    $self->{args}->{copies} += 1;
    $self->{args}->{progress} += 1;
    return $self;
}
sub add_bib {
    my $self = shift;
    $self->{args}->{bibs} += 1;
    $self->{args}->{progress} += 1;
    return $self;
}
sub add_debit {
    my($self, $amount) = @_;
    $self->{args}->{debits_accrued} += $amount;
    $self->{args}->{progress} += 1;
    return $self;
}
sub editor {
    my($self, $editor) = @_;
    $self->{editor} = $editor if defined $editor;
    return $self->{editor};
}
sub complete {
    my $self = shift;
    $self->{args}->{complete} = 1;
    return $self;
}

sub ingest_ses {
    my($self, $val) = @_;
    $self->{ingest_ses} = $val if $val;
    return $self->{ingest_ses};
}

sub push_ingest_queue {
    my($self, $rec_id) = @_;

    $self->ingest_ses(OpenSRF::AppSession->connect('open-ils.ingest'))
        unless $self->ingest_ses;

    my $req = $self->ingest_ses->request('open-ils.ingest.full.biblio.record', $rec_id);

    push(@{$self->{ingest_queue}}, $req);
}

sub process_ingest_records {
    my $self = shift;

    for my $req (@{$self->{ingest_queue}}) {

        try { 
            $req->gather(1); 
            $self->{args}->{indexed} += 1;
            $self->{args}->{progress} += 1;
        } otherwise {};

        $self->respond;
    }
    $self->ingest_ses->disconnect;
}


sub cache {
    my($self, $org, $key, $val) = @_;
    $self->{cache}->{$org} = {} unless $self->{cache}->{org};
    $self->{cache}->{$org}->{$key} = $val if defined $val;
    return $self->{cache}->{$org}->{$key};
}


package OpenILS::Application::Acq::Order;
use base qw/OpenILS::Application/;
use strict; use warnings;
# ----------------------------------------------------------------------------
# Break up each component of the order process and pieces into managable
# actions that can be shared across different workflows
# ----------------------------------------------------------------------------
use OpenILS::Event;
use OpenSRF::Utils::Logger qw(:logger);
use OpenSRF::Utils::JSON;
use OpenILS::Utils::Fieldmapper;
use OpenILS::Utils::CStoreEditor q/:funcs/;
use OpenILS::Const qw/:const/;
use OpenSRF::EX q/:try/;
use OpenILS::Application::AppUtils;
use OpenILS::Application::Cat::BibCommon;
use OpenILS::Application::Cat::AssetCommon;
use MARC::Record;
use MARC::Batch;
use MARC::File::XML;
my $U = 'OpenILS::Application::AppUtils';


# ----------------------------------------------------------------------------
# Lineitem
# ----------------------------------------------------------------------------
sub create_lineitem {
    my($mgr, %args) = @_;
    my $li = Fieldmapper::acq::lineitem->new;
    $li->creator($mgr->editor->requestor->id);
    $li->selector($li->creator);
    $li->editor($li->creator);
    $li->create_time('now');
    $li->edit_time('now');
    $li->state('new');
    $li->$_($args{$_}) for keys %args;
    if($li->picklist) {
        return 0 unless update_picklist($mgr, $li->picklist);
    }
    $mgr->add_li;
    return $mgr->editor->create_acq_lineitem($li);
}

sub update_lineitem {
    my($mgr, $li) = @_;
    $li->edit_time('now');
    $li->editor($mgr->editor->requestor->id);
    return $li if $mgr->editor->update_acq_lineitem($li);
    $mgr->add_lid;
    return undef;
}

sub delete_lineitem {
    my($mgr, $li) = @_;
    $li = $mgr->editor->retrieve_acq_lineitem($li) unless ref $li;

    if($li->picklist) {
        return 0 unless update_picklist($mgr, $li->picklist);
    }

    if($li->purchase_order) {
        return 0 unless update_purchase_order($mgr, $li->purchase_order);
    }

    # delete the attached lineitem_details
    my $lid_ids = $mgr->editor->search_acq_lineitem_detail({lineitem => $li->id}, {idlist=>1});
    for my $lid_id (@$lid_ids) {
        return 0 unless delete_lineitem_detail($mgr, undef, $lid_id);
    }

    return $mgr->editor->delete_acq_lineitem($li);
}

# ----------------------------------------------------------------------------
# Lineitem Detail
# ----------------------------------------------------------------------------
sub create_lineitem_detail {
    my($mgr, %args) = @_;
    my $lid = Fieldmapper::acq::lineitem_detail->new;
    $lid->$_($args{$_}) for keys %args;
    $mgr->editor->create_acq_lineitem_detail($lid) or return 0;
    $mgr->add_lid;

    # create some default values
    unless($lid->barcode) {
        my $pfx = $U->ou_ancestor_setting_value($lid->owning_lib, 'acq.tmp_barcode_prefix') || 'ACQ';
        $lid->barcode($pfx.$lid->id);
    }

    unless($lid->cn_label) {
        my $pfx = $U->ou_ancestor_setting_value($lid->owning_lib, 'acq.tmp_callnumber_prefix') || 'ACQ';
        $lid->cn_label($pfx.$lid->id);
    }

    if(!$lid->location and my $loc = $U->ou_ancestor_setting_value($lid->owning_lib, 'acq.default_copy_location')) {
        $lid->location($loc);
    }

    if(!$lid->circ_modifier and my $mod = get_default_circ_modifier($mgr, $lid->owning_lib)) {
        $lid->circ_modifier($mod);
    }

    $mgr->editor->update_acq_lineitem_detail($lid) or return 0;
    my $li = $mgr->editor->retrieve_acq_lineitem($lid->lineitem) or return 0;
    update_lineitem($mgr, $li) or return 0;
    return $lid;
}

sub get_default_circ_modifier {
    my($mgr, $org) = @_;
    my $mod = $mgr->cache($org, 'def_circ_mod');
    return $mod if $mod;
    $mod = $U->ou_ancestor_setting_value($org, 'acq.default_circ_modifier');
    return $mgr->cache($org, 'def_circ_mod', $mod) if $mod;
    return undef;
}

sub delete_lineitem_detail {
    my($mgr, $lid) = @_;
    $lid = $mgr->editor->retrieve_acq_lineitem_detail($lid) unless ref $lid;
    return $mgr->editor->delete_acq_lineitem_detail($lid);
}


# ----------------------------------------------------------------------------
# Lineitem Attr
# ----------------------------------------------------------------------------
sub set_lineitem_attr {
    my($mgr, %args) = @_;
    my $attr_type = $args{attr_type};

    # first, see if it's already set.  May just need to overwrite it
    my $attr = $mgr->editor->search_acq_lineitem_attr({
        lineitem => $args{lineitem},
        attr_type => $args{attr_type},
        attr_name => $args{attr_name}
    })->[0];

    if($attr) {
        $attr->attr_value($args{attr_value});
        return $attr if $mgr->editor->update_acq_lineitem_attr($attr);
        return undef;

    } else {

        $attr = Fieldmapper::acq::lineitem_attr->new;
        $attr->$_($args{$_}) for keys %args;
        
        unless($attr->definition) {
            my $find = "search_acq_$attr_type";
            my $attr_def_id = $mgr->editor->$find({code => $attr->attr_name}, {idlist=>1})->[0] or return 0;
            $attr->definition($attr_def_id);
        }
        return $mgr->editor->create_acq_lineitem_attr($attr);
    }
}

sub get_li_price {
    my $li = shift;
    my $attrs = $li->attributes;
    my ($marc_estimated, $local_estimated, $local_actual, $prov_estimated, $prov_actual);

    for my $attr (@$attrs) {
        if($attr->attr_name eq 'estimated_price') {
            $local_estimated = $attr->attr_value 
                if $attr->attr_type eq 'lineitem_local_attr_definition';
            $prov_estimated = $attr->attr_value 
                if $attr->attr_type eq 'lineitem_prov_attr_definition';
            $marc_estimated = $attr->attr_value
                if $attr->attr_type eq 'lineitem_marc_attr_definition';

        } elsif($attr->attr_name eq 'actual_price') {
            $local_actual = $attr->attr_value     
                if $attr->attr_type eq 'lineitem_local_attr_definition';
            $prov_actual = $attr->attr_value 
                if $attr->attr_type eq 'lineitem_prov_attr_definition';
        }
    }

    return ($local_actual, 1) if $local_actual;
    return ($prov_actual, 2) if $prov_actual;
    return ($local_estimated, 1) if $local_estimated;
    return ($prov_estimated, 2) if $prov_estimated;
    return ($marc_estimated, 3);
}


# ----------------------------------------------------------------------------
# Lineitem Debits
# ----------------------------------------------------------------------------
sub create_lineitem_debits {
    my($mgr, $li, $price, $ptype) = @_; 

    ($price, $ptype) = get_li_price($li) unless $price;

    unless($price) {
        $mgr->editor->event(OpenILS::Event->new('ACQ_LINEITEM_NO_PRICE', payload => $li->id));
        $mgr->editor->rollback;
        return 0;
    }

    unless($li->provider) {
        $mgr->editor->event(OpenILS::Event->new('ACQ_LINEITEM_NO_PROVIDER', payload => $li->id));
        $mgr->editor->rollback;
        return 0;
    }

    my $lid_ids = $mgr->editor->search_acq_lineitem_detail(
        {lineitem => $li->id}, 
        {idlist=>1}
    );

    for my $lid_id (@$lid_ids) {

        my $lid = $mgr->editor->retrieve_acq_lineitem_detail([
            $lid_id,
            {   flesh => 1, 
                flesh_fields => {acqlid => ['fund']}
            }
        ]);

        create_lineitem_detail_debit($mgr, $li, $lid, $price, $ptype) or return 0;
    }

    return 1;
}


# flesh li->provider
# flesh lid->fund
# ptype 1=local, 2=provider, 3=marc
sub create_lineitem_detail_debit {
    my($mgr, $li, $lid, $price, $ptype) = @_;

    unless(ref $li and ref $li->provider) {
       $li = $mgr->editor->retrieve_acq_lineitem([
            $li,
            {   flesh => 1,
                flesh_fields => {jub => ['provider']},
            }
        ]);
    }

    unless(ref $lid and ref $lid->fund) {
        $lid = $mgr->editor->retrieve_acq_lineitem_detail([
            $lid,
            {   flesh => 1, 
                flesh_fields => {acqlid => ['fund']}
            }
        ]);
    }

    my $ctype = $lid->fund->currency_type;
    my $amount = $price;

    if($ptype == 2) { # price from vendor
        $ctype = $li->provider->currency_type;
        $amount = currency_conversion($mgr, $ctype, $lid->fund->currency_type, $price);
    }

    my $debit = create_fund_debit(
        $mgr, 
        fund => $lid->fund->id,
        origin_amount => $price,
        origin_currency_type => $ctype,
        amount => $amount
    ) or return 0;

    $lid->fund_debit($debit->id);
    $lid->fund($lid->fund->id);
    $mgr->editor->update_acq_lineitem_detail($lid) or return 0;
    return $debit;
}


# ----------------------------------------------------------------------------
# Fund Debit
# ----------------------------------------------------------------------------
sub create_fund_debit {
    my($mgr, %args) = @_;
    my $debit = Fieldmapper::acq::fund_debit->new;
    $debit->debit_type('purchase');
    $debit->encumbrance('t');
    $debit->$_($args{$_}) for keys %args;
    $mgr->add_debit($debit->amount);
    return $mgr->editor->create_acq_fund_debit($debit);
}

sub currency_conversion {
    my($mgr, $src_currency, $dest_currency, $amount) = @_;
    my $result = $mgr->editor->json_query(
        {from => ['acq.exchange_ratio', $src_currency, $dest_currency, $amount]});
    return $result->[0]->{'acq.exchange_ratio'};
}


# ----------------------------------------------------------------------------
# Picklist
# ----------------------------------------------------------------------------
sub create_picklist {
    my($mgr, %args) = @_;
    my $picklist = Fieldmapper::acq::picklist->new;
    $picklist->creator($mgr->editor->requestor->id);
    $picklist->owner($picklist->creator);
    $picklist->editor($picklist->creator);
    $picklist->create_time('now');
    $picklist->edit_time('now');
    $picklist->org_unit($mgr->editor->requestor->ws_ou);
    $picklist->owner($mgr->editor->requestor->id);
    $picklist->$_($args{$_}) for keys %args;
    $mgr->picklist($picklist);
    return $mgr->editor->create_acq_picklist($picklist);
}

sub update_picklist {
    my($mgr, $picklist) = @_;
    $picklist = $mgr->editor->retrieve_acq_picklist($picklist) unless ref $picklist;
    $picklist->edit_time('now');
    $picklist->editor($mgr->editor->requestor->id);
    $mgr->picklist($picklist);
    return $picklist if $mgr->editor->update_acq_picklist($picklist);
    return undef;
}

sub delete_picklist {
    my($mgr, $picklist) = @_;
    $picklist = $mgr->editor->retrieve_acq_picklist($picklist) unless ref $picklist;

    # delete all 'new' lineitems
    my $lis = $mgr->editor->search_acq_lineitem({picklist => $picklist->id, state => 'new'});
    for my $li (@$lis) {
        return 0 unless delete_lineitem($mgr, $li);
    }

    # detach all non-'new' lineitems
    $lis = $mgr->editor->search_acq_lineitem({picklist => $picklist->id, state => {'!=' => 'new'}});
    for my $li (@$lis) {
        $li->clear_picklist;
        return 0 unless update_lineitem($li);
    }

    # remove any picklist-specific object perms
    my $ops = $mgr->editor->search_permission_usr_object_perm_map({object_type => 'acqpl', object_id => ''.$picklist->id});
    for my $op (@$ops) {
        return 0 unless $mgr->editor->delete_usr_object_perm_map($op);
    }

    return $mgr->editor->delete_acq_picklist($picklist);
}

# ----------------------------------------------------------------------------
# Purchase Order
# ----------------------------------------------------------------------------
sub update_purchase_order {
    my($mgr, $po) = @_;
    $po = $mgr->editor->retrieve_acq_purchase_order($po) unless ref $po;
    $po->editor($mgr->editor->requestor->id);
    $po->edit_time('now');
    $mgr->purchase_order($po);
    return $po if $mgr->editor->update_acq_purchase_order($po);
    return undef;
}

sub create_purchase_order {
    my($mgr, %args) = @_;
    my $po = Fieldmapper::acq::purchase_order->new;
    $po->creator($mgr->editor->requestor->id);
    $po->editor($mgr->editor->requestor->id);
    $po->owner($mgr->editor->requestor->id);
    $po->edit_time('now');
    $po->create_time('now');
    $po->ordering_agency($mgr->editor->requestor->ws_ou);
    $po->$_($args{$_}) for keys %args;
    $mgr->purchase_order($po);
    return $mgr->editor->create_acq_purchase_order($po);
}


# ----------------------------------------------------------------------------
# Bib, Callnumber, and Copy data
# ----------------------------------------------------------------------------

sub create_lineitem_assets {
    my($mgr, $li_id) = @_;
    my $evt;

    my $li = $mgr->editor->retrieve_acq_lineitem([
        $li_id,
        {   flesh => 1,
            flesh_fields => {jub => ['purchase_order', 'attributes']}
        }
    ]) or return 0;

    # -----------------------------------------------------------------
    # first, create the bib record if necessary
    # -----------------------------------------------------------------
    my $new_bib = 0;
    unless($li->eg_bib_id) {
        create_bib($mgr, $li) or return 0;
        $new_bib = 1;
    }

    my $li_details = $mgr->editor->search_acq_lineitem_detail({lineitem => $li_id}, {idlist=>1});

    # -----------------------------------------------------------------
    # for each lineitem_detail, create the volume if necessary, create 
    # a copy, and link them all together.
    # -----------------------------------------------------------------
    for my $lid_id (@{$li_details}) {

        my $lid = $mgr->editor->retrieve_acq_lineitem_detail($lid_id) or return 0;
        next if $lid->eg_copy_id;

        my $org = $lid->owning_lib;
        my $label = $lid->cn_label;
        my $bibid = $li->eg_bib_id;

        my $volume = $mgr->cache($org, "cn.$bibid.$label");
        unless($volume) {
            $volume = create_volume($mgr, $li, $lid) or return 0;
            $mgr->cache($org, "cn.$bibid.$label", $volume);
        }
        create_copy($mgr, $volume, $lid) or return 0;
    }

    return { li => $li, new_bib => $new_bib };
}

sub create_bib {
    my($mgr, $li) = @_;

    my $record = OpenILS::Application::Cat::BibCommon->biblio_record_xml_import(
        $mgr->editor, 
        $li->marc, 
        undef, 
        undef, 
        1, # override tcn collisions
        1, # no-ingest
        undef # $rec->bib_source
    ); 

    if($U->event_code($record)) {
        $mgr->editor->event($record);
        $mgr->editor->rollback;
        return 0;
    }

    $li->eg_bib_id($record->id);
    $mgr->add_bib;
    return update_lineitem($mgr, $li);
}

sub create_volume {
    my($mgr, $li, $lid) = @_;

    my ($volume, $evt) = 
        OpenILS::Application::Cat::AssetCommon->find_or_create_volume(
            $mgr->editor, 
            $lid->cn_label, 
            $li->eg_bib_id, 
            $lid->owning_lib
        );

    if($evt) {
        $mgr->editor->event($evt);
        return 0;
    }

    return $volume;
}

sub create_copy {
    my($mgr, $volume, $lid) = @_;
    my $copy = Fieldmapper::asset::copy->new;
    $copy->isnew(1);
    $copy->loan_duration(2);
    $copy->fine_level(2);
    $copy->status(OILS_COPY_STATUS_ON_ORDER);
    $copy->barcode($lid->barcode);
    $copy->location($lid->location);
    $copy->call_number($volume->id);
    $copy->circ_lib($volume->owning_lib);
    $copy->circ_modifier($lid->circ_modifier);

    my $evt = OpenILS::Application::Cat::AssetCommon->create_copy($mgr->editor, $volume, $copy);
    if($evt) {
        $mgr->editor->event($evt);
        return 0;
    }

    $mgr->add_copy;
    $lid->eg_copy_id($copy->id);
    $mgr->editor->update_acq_lineitem_detail($lid) or return 0;
}






# ----------------------------------------------------------------------------
# Workflow: Build a selection list from a Z39.50 search
# ----------------------------------------------------------------------------

__PACKAGE__->register_method(
	method => 'zsearch',
	api_name => 'open-ils.acq.picklist.search.z3950',
    stream => 1,
	signature => {
        desc => 'Performs a z3950 federated search and creates a picklist and associated lineitems',
        params => [
            {desc => 'Authentication token', type => 'string'},
            {desc => 'Search definition', type => 'object'},
            {desc => 'Picklist name, optional', type => 'string'},
        ]
    }
);

sub zsearch {
    my($self, $conn, $auth, $search, $name, $options) = @_;
    my $e = new_editor(authtoken=>$auth);
    return $e->event unless $e->checkauth;
    return $e->event unless $e->allowed('CREATE_PICKLIST');

    $search->{limit} ||= 10;
    $options ||= {};

    my $ses = OpenSRF::AppSession->create('open-ils.search');
    my $req = $ses->request('open-ils.search.z3950.search_class', $auth, $search);

    my $first = 1;
    my $picklist;
    my $mgr;
    while(my $resp = $req->recv(timeout=>60)) {

        if($first) {
            my $e = new_editor(requestor=>$e->requestor, xact=>1);
            $mgr = OpenILS::Application::Acq::BatchManager->new(editor => $e, conn => $conn);
            $picklist = zsearch_build_pl($mgr, $name);
            $first = 0;
        }

        my $result = $resp->content;
        my $count = $result->{count};
        $mgr->total( (($count < $search->{limit}) ? $count : $search->{limit})+1 );

        for my $rec (@{$result->{records}}) {

            my $li = create_lineitem($mgr, 
                picklist => $picklist->id,
                source_label => $result->{service},
                marc => $rec->{marcxml},
                eg_bib_id => $rec->{bibid}
            );

            if($$options{respond_li}) {
                $li->attributes($mgr->editor->search_acq_lineitem_attr({lineitem => $li->id}))
                    if $$options{flesh_attrs};
                $li->clear_marc if $$options{clear_marc};
                $mgr->respond(lineitem => $li);
            } else {
                $mgr->respond;
            }
        }
    }

    $mgr->editor->commit;
    return $mgr->respond_complete;
}

sub zsearch_build_pl {
    my($mgr, $name) = @_;
    $name ||= '';

    my $picklist = $mgr->editor->search_acq_picklist({
        owner => $mgr->editor->requestor->id, 
        name => $name
    })->[0];

    if($name eq '' and $picklist) {
        return 0 unless delete_picklist($mgr, $picklist);
        $picklist = undef;
    }

    return update_picklist($mgr, $picklist) if $picklist;
    return create_picklist($mgr, name => $name);
}


# ----------------------------------------------------------------------------
# Workflow: Build a selection list / PO by importing a batch of MARC records
# ----------------------------------------------------------------------------

__PACKAGE__->register_method(
    method => 'upload_records',
    api_name => 'open-ils.acq.process_upload_records',
    stream => 1,
);

sub upload_records {
    my($self, $conn, $auth, $key) = @_;

	my $e = new_editor(authtoken => $auth, xact => 1);
    return $e->die_event unless $e->checkauth;

    my $mgr = OpenILS::Application::Acq::BatchManager->new(
        editor => $e, 
        conn => $conn, 
        throttle => 5
    );

    my $cache = OpenSRF::Utils::Cache->new;

    my $data = $cache->get_cache("vandelay_import_spool_$key");
	my $purpose = $data->{purpose};
    my $filename = $data->{path};
    my $provider = $data->{provider};
    my $picklist = $data->{picklist};
    my $create_po = $data->{create_po};
    my $ordering_agency = $data->{ordering_agency};
    my $create_assets = $data->{create_assets};
    my $po;
    my $evt;

    unless(-r $filename) {
        $logger->error("unable to read MARC file $filename");
        $e->rollback;
        return OpenILS::Event->new('FILE_UPLOAD_ERROR', payload => {filename => $filename});
    }

    $provider = $e->retrieve_acq_provider($provider) or return $e->die_event;

    if($picklist) {
        $picklist = $e->retrieve_acq_picklist($picklist) or return $e->die_event;
        if($picklist->owner != $e->requestor->id) {
            return $e->die_event unless 
                $e->allowed('CREATE_PICKLIST', $picklist->org_unit, $picklist);
        }
    }

    if($create_po) {
        $po = create_purchase_order($mgr, 
            ordering_agency => $ordering_agency,
            provider => $provider->id
        ) or return $mgr->editor->die_event;
    }

    $logger->info("acq processing MARC file=$filename");

    my $marctype = 'USMARC'; # ?
	my $batch = new MARC::Batch ($marctype, $filename);
	$batch->strict_off;

	my $count = 0;
    my @li_list;

	while(1) {

	    my $err;
        my $xml;
		$count++;
        my $r;

		try {
            $r = $batch->next;
        } catch Error with {
            $err = shift;
			$logger->warn("Proccessing of record $count in set $key failed with error $err.  Skipping this record");
        };

        next if $err;
        last unless $r;

		try {
            ($xml = $r->as_xml_record()) =~ s/\n//sog;
            $xml =~ s/^<\?xml.+\?\s*>//go;
            $xml =~ s/>\s+</></go;
            $xml =~ s/\p{Cc}//go;
            $xml = $U->entityize($xml);
            $xml =~ s/[\x00-\x1f]//go;

		} catch Error with {
			$err = shift;
			$logger->warn("Proccessing XML of record $count in set $key failed with error $err.  Skipping this record");
		};

        next if $err or not $xml;

        my %args = (
            source_label => $provider->code,
            provider => $provider->id,
            marc => $xml,
        );

        $args{picklist} = $picklist->id if $picklist;
        if($po) {
            $args{purchase_order} = $po->id;
            $args{state} = 'on-order';
        }

        my $li = create_lineitem($mgr, %args) or return $mgr->editor->die_event;
        $mgr->respond;
        $li->provider($provider); # flesh it, we'll need it later

        import_lineitem_details($mgr, $ordering_agency, $li) or return $mgr->editor->die_event;
        $mgr->respond;

        push(@li_list, $li->id);
        $mgr->respond;
	}

	$e->commit;
    unlink($filename);
    $cache->delete_cache('vandelay_import_spool_' . $key);

    if($create_assets) {
        # create the bibs/volumes/copies and ingest the records
        for my $li_id (@li_list) {
            $e->xact_begin;
            my $data = create_lineitem_assets($mgr, $li_id) or return $e->die_event;
            $e->xact_commit;
            $mgr->push_ingest_queue($data->{li}->eg_bib_id) if $data->{new_bib};
            $mgr->respond;
        }
        $mgr->process_ingest_records;
    }

    return $mgr->respond_complete;
}

sub import_lineitem_details {
    my($mgr, $ordering_agency, $li) = @_;

    my $holdings = $mgr->editor->json_query({from => ['acq.extract_provider_holding_data', $li->id]});
    return 1 unless @$holdings;
    my $org_path = $U->get_org_ancestors($ordering_agency);
    $org_path = [ reverse (@$org_path) ];
    my $price;

    my $idx = 1;
    while(1) {
        # create a lineitem detail for each copy in the data

        my $compiled = extract_lineitem_detail_data($mgr, $org_path, $holdings, $idx);
        last unless defined $compiled;
        return 0 unless $compiled;

        # this takes the price of the last copy and uses it as the lineitem price
        # need to determine if a given record would include different prices for the same item
        $price = $$compiled{price};

        for(1..$$compiled{quantity}) {
            my $lid = create_lineitem_detail($mgr, 
                lineitem => $li->id,
                owning_lib => $$compiled{owning_lib},
                cn_label => $$compiled{call_number},
                fund => $$compiled{fund},
                circ_modifier => $$compiled{circ_modifier},
                note => $$compiled{note},
                location => $$compiled{copy_location}
            ) or return 0;
        }

        $mgr->respond;
        $idx++;
    }

    # set the price attr so we'll know the source of the price
    set_lineitem_attr(
        $mgr, 
        attr_name => 'estimated_price',
        attr_type => 'lineitem_local_attr_definition',
        attr_value => $price,
        lineitem => $li->id
    ) or return 0;

    # if we're creating a purchase order, create the debits
    if($li->purchase_order) {
        create_lineitem_debits($mgr, $li, $price, 2) or return 0;
        $mgr->respond;
    }

    return 1;
}

# return hash on success, 0 on error, undef on no more holdings
sub extract_lineitem_detail_data {
    my($mgr, $org_path, $holdings, $index) = @_;

    my @data_list = grep { $_->{holding} eq $index } @$holdings;
    return undef unless @data_list;

    my %compiled = map { $_->{attr} => $_->{data} } @data_list;
    my $base_org = $$org_path[0];

    my $killme = sub {
        my $msg = shift;
        $logger->error("Item import extraction error: $msg");
        $logger->error('Holdings Data: ' . OpenSRF::Utils::JSON->perl2JSON(\%compiled));
        $mgr->editor->rollback;
        $mgr->editor->event(OpenILS::Event->new('ACQ_IMPORT_ERROR', payload => $msg));
        return 0;
    };

    $compiled{quantity} ||= 1;

    # ---------------------------------------------------------------------
    # Fund
    my $code = $compiled{fund_code};
    return $killme->('no fund code provided') unless $code;

    my $fund = $mgr->cache($base_org, "fund.$code");
    unless($fund) {
        # search up the org tree for the most appropriate fund
        for my $org (@$org_path) {
            $fund = $mgr->editor->search_acq_fund(
                {org => $org, code => $code, year => DateTime->now->year}, {idlist => 1})->[0];
            last if $fund;
        }
    }
    return $killme->("no fund with code $code at orgs [@$org_path]") unless $fund;
    $compiled{fund} = $fund;
    $mgr->cache($base_org, "fund.$code", $fund);


    # ---------------------------------------------------------------------
    # Owning lib
    my $sn = $compiled{owning_lib};
    return $killme->('no owning_lib defined') unless $sn;
    my $org_id = 
        $mgr->cache($base_org, "orgsn.$sn") ||
            $mgr->editor->search_actor_org_unit({shortname => $sn}, {idlist => 1})->[0];
    return $killme->("invalid owning_lib defined: $sn") unless $org_id;
    $compiled{owning_lib} = $org_id;
    $mgr->cache($$org_path[0], "orgsn.$sn", $org_id);


    # ---------------------------------------------------------------------
    # Circ Modifier
    my $mod;
    $code = $compiled{circ_modifier};

    if($code) {

        $mod = $mgr->cache($base_org, "mod.$code") ||
            $mgr->editor->retrieve_config_circ_modifier($code);
        return $killme->("invlalid circ_modifier $code") unless $mod;
        $mgr->cache($base_org, "mod.$code", $mod);

    } else {
        # try the default
        $mod = get_default_circ_modifier($mgr, $base_org)
            or return $killme->('no circ_modifier defined');
    }

    $compiled{circ_modifier} = $mod;


    # ---------------------------------------------------------------------
    # Shelving Location
    my $name = $compiled{copy_location};
    return $killme->('no copy_location defined') unless $name;
    my $loc = $mgr->cache($base_org, "copy_loc.$name");
    unless($loc) {
        for my $org (@$org_path) {
            $loc = $mgr->editor->search_asset_copy_location(
                {owning_lib => $org, name => $name}, {idlist => 1})->[0];
            last if $loc;
        }
    }
    return $killme->("Invalid copy location $name") unless $loc;
    $compiled{copy_location} = $loc;
    $mgr->cache($base_org, "copy_loc.$name", $loc);

    return \%compiled;
}



# ----------------------------------------------------------------------------
# Workflow: Given an existing purchase order, import/create the bibs, 
# callnumber and copy objects
# ----------------------------------------------------------------------------

__PACKAGE__->register_method(
	method => 'create_po_assets',
	api_name	=> 'open-ils.acq.purchase_order.assets.create',
	signature => {
        desc => q/Creates assets for each lineitem in the purchase order/,
        params => [
            {desc => 'Authentication token', type => 'string'},
            {desc => 'The purchase order id', type => 'number'},
        ],
        return => {desc => 'Streams a total versus completed counts object, event on error'}
    }
);

sub create_po_assets {
    my($self, $conn, $auth, $po_id) = @_;
    my $e = new_editor(authtoken=>$auth, xact=>1);
    return $e->die_event unless $e->checkauth;

    my $mgr = OpenILS::Application::Acq::BatchManager->new(
        editor => $e, 
        conn => $conn, 
        throttle => 5
    );

    my $po = $e->retrieve_acq_purchase_order($po_id) or return $e->die_event;
    return $e->die_event unless $e->allowed('IMPORT_PURCHASE_ORDER_ASSETS', $po->ordering_agency);

    my $li_ids = $e->search_acq_lineitem({purchase_order => $po_id}, {idlist => 1});

    # it's ugly, but it's fast.  Get the total count of lineitem detail objects to process
    my $lid_total = $e->json_query({
        select => { acqlid => [{aggregate => 1, transform => 'count', column => 'id'}] }, 
        from => {
            acqlid => {
                jub => {
                    fkey => 'lineitem', 
                    field => 'id', 
                    join => {acqpo => {fkey => 'purchase_order', field => 'id'}}
                }
            }
        }, 
        where => {'+acqpo' => {id => $po_id}}
    })->[0]->{id};

    $mgr->total(scalar(@$li_ids) + $lid_total);

    for my $li_id (@$li_ids) {
        return $e->die_event unless create_lineitem_assets($mgr, $li_id);
        $mgr->respond;
    }

    return $e->die_event unless update_purchase_order($mgr, $po);

    $e->commit;
    $mgr->process_ingest_records;

    return $mgr->respond_complete;
}


1;