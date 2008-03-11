# vim:et:ts=4:sw=4:

package OpenILS::Application::PermaCrud;
use OpenILS::Application;
use base qw/OpenILS::Application/;

use Unicode::Normalize;
use OpenSRF::EX qw/:try/;

use OpenSRF::AppSession;
use OpenSRF::Utils::SettingsClient;
use OpenSRF::Utils::Logger qw/:level/;

use OpenILS::Utils::Fieldmapper;
use OpenSRF::Utils::JSON;

use OpenILS::Utils::CStoreEditor qw/:funcs/;

use XML::LibXML;
use XML::LibXML::XPathContext;
use XML::LibXSLT;

our %namespace_map = (
    oils_persist=> {ns => 'http://open-ils.org/spec/opensrf/IDL/persistence/v1'},
    oils_obj    => {ns => 'http://open-ils.org/spec/opensrf/IDL/objects/v1'},
    idl         => {ns => 'http://opensrf.org/spec/IDL/base/v1'},
    reporter    => {ns => 'http://open-ils.org/spec/opensrf/IDL/reporter/v1'},
    perm        => {ns => 'http://open-ils.org/spec/opensrf/IDL/permacrud/v1'},
);


my $log = 'OpenSRF::Utils::Logger';

my $parser = XML::LibXML->new();
my $xslt = XML::LibXSLT->new();

my $xpc = XML::LibXML::XPathContext->new();
$xpc->registerNs($_, $namespace_map{$_}{ns}) for ( keys %namespace_map );

my $idl;

sub initialize {

    my $conf = OpenSRF::Utils::SettingsClient->new;
    my $idl_file = $conf->config_value( 'IDL' );

    $idl = $parser->parse_file( $idl_file );

    $log->debug( 'IDL XML file loaded' );

    generate_methods();

}
sub child_init {}

sub CRUD_action_object_permcheck {
    my $self = shift;
    my $client = shift;
    my $auth = shift;
    my $obj = shift;

    my $e = new_editor(authtoken => $auth, xact => 1);
    return $e->event unless $e->checkauth;

    unless ($obj->json_hint eq $self->{class_hint}) {
        throw OpenSRF::DomainObject::oilsException->new(
            statusCode => 500,
            status => "Class missmatch: $self->{class_hint} method called with " . $obj->json_hint,
        );
    }

    my ($class_node) = $xpc->findnodes( "//idl:class[\@id='$self->{class_hint}']", $idl->documentElement );
    my ($action_node) = $xpc->findnodes( "perm:permacrud/perm:actions/perm:$action", $class_node );
    my $all_perms = $xpc->getAttribute( 'all_perms', $action_node );

    if (!ref($obj)) {
        my $retrieve_method = 'retrieve_' . $xpc->findvalue( '@oils_obj:fieldmapper', $class_node );
        $retrieve_method =~ s/::/_/go;
        $obj = $e->retrieve_method( $obj )->gather(1);
    }

    my $action = $self->api_name =~ s/^open-ils\.admin\.([^\.])\..+$/$1/o;
    my $o_type = $obj->cdbi =~ s/::/./go;
    my $id_field = $obj->Identity;

    my $perm_field_value = $aciton_node->getAttribute('permission');

    if (defined($perm_field_value)) {
        my @perms = split '|', $aciton_node->getAttribute('permission');

        my @context_ous;
        if ($aciton_node->getAttribute('global_required')) {
            push @context_ous, $e->search_actor_org_unit( { parent_ou => undef } )->[0]->id;

        } else {
            my $context_field_value = $aciton_node->getAttribute('context_field');

            if (defined($context_field_value)) {
                push @context_ous, $obj->$_ for ( split '|', $context_field_value );
            } else {  
                for my $context_node ( $xpc->findnodes( "perm:context", $action_node ) ) {
                    my $context_field = $context_node->getAttribute('field');
                    my $link_field = $context_node->getAttribute('link');

                    if ($link_field) {

                        my ($link_node) = $xpc->findnodes( "idl:links/idl:link[\@field='$link_field']", $class_node );
                        my $link_class_hint = $link_node->getAttribute('class');
                        my $remote_field = $link_node->getAttribute('key');

                        my ($remote_class_node) = $xpc->findnodes( "//idl:class[\@id='$self->{class_hint}']", $idl->documentElement );
                        my $search_method = 'search_' . $xpc->findvalue( '@oils_obj:fieldmapper', $remote_class_node );
                        $search_method =~ s/::/_/go;

                        for my $remote_object ( @{$e->$search_method( { $key => $obj->$link_field } )} ) {
                            push @context_ous, $remote_object->$context_field;
                        }
                    } else {
                        push @context_ous, $obj->$_ for ( split '|', $context_field );
                    }
                }
            }
        }

        my $pok = 0;
        for my $perm (@perms) {
            if (@context_ous) {
                for my $c_ou (@context_ous) {
                    if ($e->allowed($perm => $c_ou => $obj)) {
                        $pok++;
                        last;
                    }
                }
            } else {
                $pok++ if ($e->allowed($perm => undef => $obj));
            }
        }

        if ((lc($all_perms) eq 'true' && @perms != $pok) or !$pok) {
            throw OpenSRF::DomainObject::oilsException->new(
                statusCode => 500,
                status => "Perm failure -- action: $action, object type: $self->{json_hint}",
            );
        }
    }

    return $obj if ($action eq 'retrieve');

    return $e->session->request("open-ils.cstore.direct.$o_type.$action" => $obj )->gather(1);
}

sub search_permacrud {
    my $self = shift;
    my $client = shift;
    my $auth = shift;
    my @args = @_;

    my $e = new_editor(authtoken => $auth);
    return $e->event unless $e->checkauth;
 
    my ($class_node) = $xpc->findnodes( "//idl:class[\@id='$self->{class_hint}']", $idl->documentElement );
    my $search_method = 'search_' . $xpc->findvalue( '@oils_obj:fieldmapper', $remote_class_node );
    $search_method =~ s/::/_/go;

    my $retriever = $self->method_lookup( $self->{retriever} );
    my $obj_list = $e->$search_method( @args );

    for my $o ( @$obj_list ) {
        my ($o) = $retriever->run( $o );
        $client->respond( $o ) if ($o);
    }

    return undef;
}

sub generate_methods {
    try {
        for my $class_node ( $xpc->findnodes( '//idl:class[perm:permacrud]', $idl->documentElement ) ) {
            my $hint = $class_node->getAttribute('id');
            $log->debug("permacrud class_node $hint");
        
            for my $action_node ( $xpc->findnodes( "perm:permacrud/perm:actions/perm:*", $class_node ) ) {
                (my $method = $action_node->localname) =~ s/^.+:(.+)$/$1/o;
                $log->internal("permacrud method = $method");
        
                __PACKAGE__->register_method(
                    method          => 'CRUD_action_object_permcheck',
                    api_name        => 'open-ils.permacrud.' . $method . '.' . $hint,
                    authoritative   => 1,
                    class_hint      => $hint,
                );
        
                if ($method eq 'retrieve') {
                    __PACKAGE__->register_method(
                        method      => 'search_permcheck',
                        api_name    => 'open-ils.permacrud.search.' . $hint,
                        class_hint  => $hint,
                        retriever   => 'open-ils.permacrud.retrieve.' . $hint,
                        stream      => 1
                    );
                }
            }
        }
    } catch Error with {
        my $e = shift;
        $log->error("error generating permacrud methods: $e");
    };
}


1;

