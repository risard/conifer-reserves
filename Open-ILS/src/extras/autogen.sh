#!/bin/bash

CONFIG="$1";

[ -z "$CONFIG" ] && echo "usage: $0 <bootstrap_config>" && exit;


JSDIR="/openils/var/web/opac/common/js/";

echo "Updating fieldmapper";
perl fieldmapper.pl		> "$JSDIR/fmall.js";

echo "Updating web_fieldmapper";
perl fieldmapper.pl "web_core"	> "$JSDIR/fmcore.js";

echo "Updating web_fieldmapper";
perl fieldmapper.pl "web"	> "$JSDIR/fmextcore.js";

echo "Updating OrgTree";
perl org_tree_js.pl "$CONFIG" > "$JSDIR/OrgTree.js";

echo "Done";

