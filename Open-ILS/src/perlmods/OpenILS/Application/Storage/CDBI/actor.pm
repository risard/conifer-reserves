package OpenILS::Application::Storage::CDBI::actor;
our $VERSION = 1;

#-------------------------------------------------------------------------------
package actor;
use base qw/OpenILS::Application::Storage::CDBI/;
#-------------------------------------------------------------------------------
package actor::user;
use base qw/actor/;

__PACKAGE__->table( 'actor_usr' );
__PACKAGE__->columns( Primary => qw/id/ );
__PACKAGE__->columns( Others => qw/id usrid usrname email prefix first_given_name
				second_given_name family_name suffix address
				home_ou gender dob active master_account
				super_user usrgroup passwd last_xact_id/ );

#-------------------------------------------------------------------------------
package actor::org_unit_type;
use base qw/actor/;

__PACKAGE__->table( 'actor_org_unit_type' );
__PACKAGE__->columns( Primary => qw/id/);
__PACKAGE__->columns( Others => qw/name depth parent can_have_users/);

#-------------------------------------------------------------------------------
package actor::org_unit;
use base qw/actor/;

__PACKAGE__->table( 'actor_org_unit' );
__PACKAGE__->columns( Primary => qw/id/);
__PACKAGE__->columns( Others => qw/parent_ou ou_type address shortname name/);

#-------------------------------------------------------------------------------
package actor::stat_cat;
use base qw/actor/;

__PACKAGE__->table( 'actor_stat_cat' );
__PACKAGE__->columns( Primary => qw/id/ );
__PACKAGE__->columns( Others => qw/owner name opac_visible/ );

#-------------------------------------------------------------------------------
package actor::stat_cat_entry;
use base qw/actor/;

__PACKAGE__->table( 'actor_stat_cat_entry' );
__PACKAGE__->columns( Primary => qw/id/ );
__PACKAGE__->columns( Others => qw/owner value/ );

#-------------------------------------------------------------------------------
package actor::stat_cat_entry_user_map;
use base qw/actor/;

__PACKAGE__->table( 'actor_stat_cat_entry_usr_map' );
__PACKAGE__->columns( Primary => qw/id/ );
__PACKAGE__->columns( Others => qw/stat_cat_entry target_user/ );

#-------------------------------------------------------------------------------
package actor::card;
use base qw/actor/;

__PACKAGE__->table( 'actor_card' );
__PACKAGE__->columns( Primary => qw/id/ );
__PACKAGE__->columns( Others => qw/usr barcode active/ );

#-------------------------------------------------------------------------------
package actor::user_access_entry;
use base qw/actor/;
#-------------------------------------------------------------------------------
package actor::perm_group;
use base qw/actor/;
#-------------------------------------------------------------------------------
package actor::permission;
use base qw/actor/;
#-------------------------------------------------------------------------------
package actor::perm_group_permission_map;
use base qw/actor/;
#-------------------------------------------------------------------------------
package actor::perm_group_user_map;
use base qw/actor/;
#-------------------------------------------------------------------------------
package actor::user_address;
use base qw/actor/;
#-------------------------------------------------------------------------------
1;

