
//  ----------------------------------------------------------------
// Class: acp
//  ----------------------------------------------------------------

function acp(array) {
	if(array) { this.array = array; } 
	else { this.array = []; }
}

acp.prototype._is_array = function() {
	return true;
}
acp.prototype.call_number = function(new_value) {
	if(new_value) { this.array[4] = new_value; }
	return this.array[4];
}
acp.prototype.edit_date = function(new_value) {
	if(new_value) { this.array[3] = new_value; }
	return this.array[3];
}
acp.prototype.creator = function(new_value) {
	if(new_value) { this.array[6] = new_value; }
	return this.array[6];
}
acp.prototype.fine_level = function(new_value) {
	if(new_value) { this.array[5] = new_value; }
	return this.array[5];
}
acp.prototype.status = function(new_value) {
	if(new_value) { this.array[8] = new_value; }
	return this.array[8];
}
acp.prototype.circulate = function(new_value) {
	if(new_value) { this.array[7] = new_value; }
	return this.array[7];
}
acp.prototype.audience = function(new_value) {
	if(new_value) { this.array[9] = new_value; }
	return this.array[9];
}
acp.prototype.isnew = function(new_value) {
	if(new_value) { this.array[0] = new_value; }
	return this.array[0];
}
acp.prototype.editor = function(new_value) {
	if(new_value) { this.array[10] = new_value; }
	return this.array[10];
}
acp.prototype.ischanged = function(new_value) {
	if(new_value) { this.array[1] = new_value; }
	return this.array[1];
}
acp.prototype.id = function(new_value) {
	if(new_value) { this.array[11] = new_value; }
	return this.array[11];
}
acp.prototype.isdeleted = function(new_value) {
	if(new_value) { this.array[2] = new_value; }
	return this.array[2];
}
acp.prototype.deposit = function(new_value) {
	if(new_value) { this.array[12] = new_value; }
	return this.array[12];
}
acp.prototype.loan_duration = function(new_value) {
	if(new_value) { this.array[13] = new_value; }
	return this.array[13];
}
acp.prototype.shelving_loc = function(new_value) {
	if(new_value) { this.array[14] = new_value; }
	return this.array[14];
}
acp.prototype.ref = function(new_value) {
	if(new_value) { this.array[15] = new_value; }
	return this.array[15];
}
acp.prototype.create_date = function(new_value) {
	if(new_value) { this.array[16] = new_value; }
	return this.array[16];
}
acp.prototype.barcode = function(new_value) {
	if(new_value) { this.array[17] = new_value; }
	return this.array[17];
}
acp.prototype.genre = function(new_value) {
	if(new_value) { this.array[19] = new_value; }
	return this.array[19];
}
acp.prototype.deposit_amount = function(new_value) {
	if(new_value) { this.array[18] = new_value; }
	return this.array[18];
}
acp.prototype.copy_number = function(new_value) {
	if(new_value) { this.array[21] = new_value; }
	return this.array[21];
}
acp.prototype.opac_visible = function(new_value) {
	if(new_value) { this.array[20] = new_value; }
	return this.array[20];
}
acp.prototype.price = function(new_value) {
	if(new_value) { this.array[23] = new_value; }
	return this.array[23];
}
acp.prototype.home_lib = function(new_value) {
	if(new_value) { this.array[22] = new_value; }
	return this.array[22];
}

//  ----------------------------------------------------------------
// Class: au
//  ----------------------------------------------------------------

function au(array) {
	if(array) { this.array = array; } 
	else { this.array = []; }
}

au.prototype._is_array = function() {
	return true;
}
au.prototype.usrgroup = function(new_value) {
	if(new_value) { this.array[3] = new_value; }
	return this.array[3];
}
au.prototype.usrname = function(new_value) {
	if(new_value) { this.array[4] = new_value; }
	return this.array[4];
}
au.prototype.super_user = function(new_value) {
	if(new_value) { this.array[5] = new_value; }
	return this.array[5];
}
au.prototype.isnew = function(new_value) {
	if(new_value) { this.array[0] = new_value; }
	return this.array[0];
}
au.prototype.family_name = function(new_value) {
	if(new_value) { this.array[6] = new_value; }
	return this.array[6];
}
au.prototype.email = function(new_value) {
	if(new_value) { this.array[7] = new_value; }
	return this.array[7];
}
au.prototype.first_given_name = function(new_value) {
	if(new_value) { this.array[8] = new_value; }
	return this.array[8];
}
au.prototype.ischanged = function(new_value) {
	if(new_value) { this.array[1] = new_value; }
	return this.array[1];
}
au.prototype.suffix = function(new_value) {
	if(new_value) { this.array[9] = new_value; }
	return this.array[9];
}
au.prototype.address = function(new_value) {
	if(new_value) { this.array[11] = new_value; }
	return this.array[11];
}
au.prototype.id = function(new_value) {
	if(new_value) { this.array[10] = new_value; }
	return this.array[10];
}
au.prototype.isdeleted = function(new_value) {
	if(new_value) { this.array[2] = new_value; }
	return this.array[2];
}
au.prototype.gender = function(new_value) {
	if(new_value) { this.array[12] = new_value; }
	return this.array[12];
}
au.prototype.active = function(new_value) {
	if(new_value) { this.array[13] = new_value; }
	return this.array[13];
}
au.prototype.home_ou = function(new_value) {
	if(new_value) { this.array[14] = new_value; }
	return this.array[14];
}
au.prototype.last_xact_id = function(new_value) {
	if(new_value) { this.array[15] = new_value; }
	return this.array[15];
}
au.prototype.dob = function(new_value) {
	if(new_value) { this.array[17] = new_value; }
	return this.array[17];
}
au.prototype.passwd = function(new_value) {
	if(new_value) { this.array[16] = new_value; }
	return this.array[16];
}
au.prototype.second_given_name = function(new_value) {
	if(new_value) { this.array[18] = new_value; }
	return this.array[18];
}
au.prototype.master_account = function(new_value) {
	if(new_value) { this.array[19] = new_value; }
	return this.array[19];
}
au.prototype.usrid = function(new_value) {
	if(new_value) { this.array[21] = new_value; }
	return this.array[21];
}
au.prototype.prefix = function(new_value) {
	if(new_value) { this.array[20] = new_value; }
	return this.array[20];
}

//  ----------------------------------------------------------------
// Class: acpn
//  ----------------------------------------------------------------

function acpn(array) {
	if(array) { this.array = array; } 
	else { this.array = []; }
}

acpn.prototype._is_array = function() {
	return true;
}
acpn.prototype.creator = function(new_value) {
	if(new_value) { this.array[4] = new_value; }
	return this.array[4];
}
acpn.prototype.value = function(new_value) {
	if(new_value) { this.array[5] = new_value; }
	return this.array[5];
}
acpn.prototype.create_date = function(new_value) {
	if(new_value) { this.array[6] = new_value; }
	return this.array[6];
}
acpn.prototype.isnew = function(new_value) {
	if(new_value) { this.array[0] = new_value; }
	return this.array[0];
}
acpn.prototype.owning_copy = function(new_value) {
	if(new_value) { this.array[3] = new_value; }
	return this.array[3];
}
acpn.prototype.ischanged = function(new_value) {
	if(new_value) { this.array[1] = new_value; }
	return this.array[1];
}
acpn.prototype.id = function(new_value) {
	if(new_value) { this.array[8] = new_value; }
	return this.array[8];
}
acpn.prototype.title = function(new_value) {
	if(new_value) { this.array[7] = new_value; }
	return this.array[7];
}
acpn.prototype.isdeleted = function(new_value) {
	if(new_value) { this.array[2] = new_value; }
	return this.array[2];
}

//  ----------------------------------------------------------------
// Class: mfr
//  ----------------------------------------------------------------

function mfr(array) {
	if(array) { this.array = array; } 
	else { this.array = []; }
}

mfr.prototype._is_array = function() {
	return true;
}
mfr.prototype.value = function(new_value) {
	if(new_value) { this.array[5] = new_value; }
	return this.array[5];
}
mfr.prototype.isnew = function(new_value) {
	if(new_value) { this.array[0] = new_value; }
	return this.array[0];
}
mfr.prototype.ischanged = function(new_value) {
	if(new_value) { this.array[1] = new_value; }
	return this.array[1];
}
mfr.prototype.ind1 = function(new_value) {
	if(new_value) { this.array[3] = new_value; }
	return this.array[3];
}
mfr.prototype.record = function(new_value) {
	if(new_value) { this.array[4] = new_value; }
	return this.array[4];
}
mfr.prototype.ind2 = function(new_value) {
	if(new_value) { this.array[6] = new_value; }
	return this.array[6];
}
mfr.prototype.id = function(new_value) {
	if(new_value) { this.array[9] = new_value; }
	return this.array[9];
}
mfr.prototype.tag = function(new_value) {
	if(new_value) { this.array[8] = new_value; }
	return this.array[8];
}
mfr.prototype.subfield = function(new_value) {
	if(new_value) { this.array[7] = new_value; }
	return this.array[7];
}
mfr.prototype.isdeleted = function(new_value) {
	if(new_value) { this.array[2] = new_value; }
	return this.array[2];
}

//  ----------------------------------------------------------------
// Class: mmr
//  ----------------------------------------------------------------

function mmr(array) {
	if(array) { this.array = array; } 
	else { this.array = []; }
}

mmr.prototype._is_array = function() {
	return true;
}
mmr.prototype.ischanged = function(new_value) {
	if(new_value) { this.array[1] = new_value; }
	return this.array[1];
}
mmr.prototype.mods = function(new_value) {
	if(new_value) { this.array[3] = new_value; }
	return this.array[3];
}
mmr.prototype.id = function(new_value) {
	if(new_value) { this.array[5] = new_value; }
	return this.array[5];
}
mmr.prototype.fingerprint = function(new_value) {
	if(new_value) { this.array[4] = new_value; }
	return this.array[4];
}
mmr.prototype.isnew = function(new_value) {
	if(new_value) { this.array[0] = new_value; }
	return this.array[0];
}
mmr.prototype.master_record = function(new_value) {
	if(new_value) { this.array[6] = new_value; }
	return this.array[6];
}
mmr.prototype.isdeleted = function(new_value) {
	if(new_value) { this.array[2] = new_value; }
	return this.array[2];
}

//  ----------------------------------------------------------------
// Class: mkfe
//  ----------------------------------------------------------------

function mkfe(array) {
	if(array) { this.array = array; } 
	else { this.array = []; }
}

mkfe.prototype._is_array = function() {
	return true;
}
mkfe.prototype.ischanged = function(new_value) {
	if(new_value) { this.array[1] = new_value; }
	return this.array[1];
}
mkfe.prototype.value = function(new_value) {
	if(new_value) { this.array[3] = new_value; }
	return this.array[3];
}
mkfe.prototype.id = function(new_value) {
	if(new_value) { this.array[4] = new_value; }
	return this.array[4];
}
mkfe.prototype.isnew = function(new_value) {
	if(new_value) { this.array[0] = new_value; }
	return this.array[0];
}
mkfe.prototype.isdeleted = function(new_value) {
	if(new_value) { this.array[2] = new_value; }
	return this.array[2];
}
mkfe.prototype.field = function(new_value) {
	if(new_value) { this.array[5] = new_value; }
	return this.array[5];
}

//  ----------------------------------------------------------------
// Class: mafe
//  ----------------------------------------------------------------

function mafe(array) {
	if(array) { this.array = array; } 
	else { this.array = []; }
}

mafe.prototype._is_array = function() {
	return true;
}
mafe.prototype.ischanged = function(new_value) {
	if(new_value) { this.array[1] = new_value; }
	return this.array[1];
}
mafe.prototype.value = function(new_value) {
	if(new_value) { this.array[3] = new_value; }
	return this.array[3];
}
mafe.prototype.id = function(new_value) {
	if(new_value) { this.array[4] = new_value; }
	return this.array[4];
}
mafe.prototype.isnew = function(new_value) {
	if(new_value) { this.array[0] = new_value; }
	return this.array[0];
}
mafe.prototype.isdeleted = function(new_value) {
	if(new_value) { this.array[2] = new_value; }
	return this.array[2];
}
mafe.prototype.field = function(new_value) {
	if(new_value) { this.array[5] = new_value; }
	return this.array[5];
}

//  ----------------------------------------------------------------
// Class: mtfe
//  ----------------------------------------------------------------

function mtfe(array) {
	if(array) { this.array = array; } 
	else { this.array = []; }
}

mtfe.prototype._is_array = function() {
	return true;
}
mtfe.prototype.ischanged = function(new_value) {
	if(new_value) { this.array[1] = new_value; }
	return this.array[1];
}
mtfe.prototype.value = function(new_value) {
	if(new_value) { this.array[3] = new_value; }
	return this.array[3];
}
mtfe.prototype.id = function(new_value) {
	if(new_value) { this.array[4] = new_value; }
	return this.array[4];
}
mtfe.prototype.isnew = function(new_value) {
	if(new_value) { this.array[0] = new_value; }
	return this.array[0];
}
mtfe.prototype.isdeleted = function(new_value) {
	if(new_value) { this.array[2] = new_value; }
	return this.array[2];
}
mtfe.prototype.field = function(new_value) {
	if(new_value) { this.array[5] = new_value; }
	return this.array[5];
}

//  ----------------------------------------------------------------
// Class: aout
//  ----------------------------------------------------------------

function aout(array) {
	if(array) { this.array = array; } 
	else { this.array = []; }
}

aout.prototype._is_array = function() {
	return true;
}
aout.prototype.parent = function(new_value) {
	if(new_value) { this.array[4] = new_value; }
	return this.array[4];
}
aout.prototype.name = function(new_value) {
	if(new_value) { this.array[5] = new_value; }
	return this.array[5];
}
aout.prototype.can_have_users = function(new_value) {
	if(new_value) { this.array[6] = new_value; }
	return this.array[6];
}
aout.prototype.children = function(new_value) {
	if(new_value) { this.array[3] = new_value; }
	return this.array[3];
}
aout.prototype.isnew = function(new_value) {
	if(new_value) { this.array[0] = new_value; }
	return this.array[0];
}
aout.prototype.depth = function(new_value) {
	if(new_value) { this.array[8] = new_value; }
	return this.array[8];
}
aout.prototype.ischanged = function(new_value) {
	if(new_value) { this.array[1] = new_value; }
	return this.array[1];
}
aout.prototype.id = function(new_value) {
	if(new_value) { this.array[7] = new_value; }
	return this.array[7];
}
aout.prototype.isdeleted = function(new_value) {
	if(new_value) { this.array[2] = new_value; }
	return this.array[2];
}

//  ----------------------------------------------------------------
// Class: cbs
//  ----------------------------------------------------------------

function cbs(array) {
	if(array) { this.array = array; } 
	else { this.array = []; }
}

cbs.prototype._is_array = function() {
	return true;
}
cbs.prototype.source = function(new_value) {
	if(new_value) { this.array[3] = new_value; }
	return this.array[3];
}
cbs.prototype.ischanged = function(new_value) {
	if(new_value) { this.array[1] = new_value; }
	return this.array[1];
}
cbs.prototype.id = function(new_value) {
	if(new_value) { this.array[4] = new_value; }
	return this.array[4];
}
cbs.prototype.isnew = function(new_value) {
	if(new_value) { this.array[0] = new_value; }
	return this.array[0];
}
cbs.prototype.quality = function(new_value) {
	if(new_value) { this.array[5] = new_value; }
	return this.array[5];
}
cbs.prototype.isdeleted = function(new_value) {
	if(new_value) { this.array[2] = new_value; }
	return this.array[2];
}

//  ----------------------------------------------------------------
// Class: acnn
//  ----------------------------------------------------------------

function acnn(array) {
	if(array) { this.array = array; } 
	else { this.array = []; }
}

acnn.prototype._is_array = function() {
	return true;
}
acnn.prototype.owning_call_number = function(new_value) {
	if(new_value) { this.array[4] = new_value; }
	return this.array[4];
}
acnn.prototype.creator = function(new_value) {
	if(new_value) { this.array[3] = new_value; }
	return this.array[3];
}
acnn.prototype.value = function(new_value) {
	if(new_value) { this.array[5] = new_value; }
	return this.array[5];
}
acnn.prototype.create_date = function(new_value) {
	if(new_value) { this.array[6] = new_value; }
	return this.array[6];
}
acnn.prototype.isnew = function(new_value) {
	if(new_value) { this.array[0] = new_value; }
	return this.array[0];
}
acnn.prototype.ischanged = function(new_value) {
	if(new_value) { this.array[1] = new_value; }
	return this.array[1];
}
acnn.prototype.id = function(new_value) {
	if(new_value) { this.array[8] = new_value; }
	return this.array[8];
}
acnn.prototype.title = function(new_value) {
	if(new_value) { this.array[7] = new_value; }
	return this.array[7];
}
acnn.prototype.isdeleted = function(new_value) {
	if(new_value) { this.array[2] = new_value; }
	return this.array[2];
}

//  ----------------------------------------------------------------
// Class: brm
//  ----------------------------------------------------------------

function brm(array) {
	if(array) { this.array = array; } 
	else { this.array = []; }
}

brm.prototype._is_array = function() {
	return true;
}
brm.prototype.ischanged = function(new_value) {
	if(new_value) { this.array[1] = new_value; }
	return this.array[1];
}
brm.prototype.mods = function(new_value) {
	if(new_value) { this.array[3] = new_value; }
	return this.array[3];
}
brm.prototype.id = function(new_value) {
	if(new_value) { this.array[4] = new_value; }
	return this.array[4];
}
brm.prototype.isnew = function(new_value) {
	if(new_value) { this.array[0] = new_value; }
	return this.array[0];
}
brm.prototype.isdeleted = function(new_value) {
	if(new_value) { this.array[2] = new_value; }
	return this.array[2];
}

//  ----------------------------------------------------------------
// Class: brn
//  ----------------------------------------------------------------

function brn(array) {
	if(array) { this.array = array; } 
	else { this.array = []; }
}

brn.prototype._is_array = function() {
	return true;
}
brn.prototype.node_type = function(new_value) {
	if(new_value) { this.array[6] = new_value; }
	return this.array[6];
}
brn.prototype.value = function(new_value) {
	if(new_value) { this.array[8] = new_value; }
	return this.array[8];
}
brn.prototype.name = function(new_value) {
	if(new_value) { this.array[9] = new_value; }
	return this.array[9];
}
brn.prototype.children = function(new_value) {
	if(new_value) { this.array[3] = new_value; }
	return this.array[3];
}
brn.prototype.isnew = function(new_value) {
	if(new_value) { this.array[0] = new_value; }
	return this.array[0];
}
brn.prototype.namespace_uri = function(new_value) {
	if(new_value) { this.array[11] = new_value; }
	return this.array[11];
}
brn.prototype.last_xact_id = function(new_value) {
	if(new_value) { this.array[12] = new_value; }
	return this.array[12];
}
brn.prototype.intra_doc_id = function(new_value) {
	if(new_value) { this.array[4] = new_value; }
	return this.array[4];
}
brn.prototype.owner_doc = function(new_value) {
	if(new_value) { this.array[5] = new_value; }
	return this.array[5];
}
brn.prototype.ischanged = function(new_value) {
	if(new_value) { this.array[1] = new_value; }
	return this.array[1];
}
brn.prototype.parent_node = function(new_value) {
	if(new_value) { this.array[7] = new_value; }
	return this.array[7];
}
brn.prototype.id = function(new_value) {
	if(new_value) { this.array[10] = new_value; }
	return this.array[10];
}
brn.prototype.isdeleted = function(new_value) {
	if(new_value) { this.array[2] = new_value; }
	return this.array[2];
}

//  ----------------------------------------------------------------
// Class: cmf
//  ----------------------------------------------------------------

function cmf(array) {
	if(array) { this.array = array; } 
	else { this.array = []; }
}

cmf.prototype._is_array = function() {
	return true;
}
cmf.prototype.ischanged = function(new_value) {
	if(new_value) { this.array[1] = new_value; }
	return this.array[1];
}
cmf.prototype.name = function(new_value) {
	if(new_value) { this.array[3] = new_value; }
	return this.array[3];
}
cmf.prototype.id = function(new_value) {
	if(new_value) { this.array[5] = new_value; }
	return this.array[5];
}
cmf.prototype.xpath = function(new_value) {
	if(new_value) { this.array[4] = new_value; }
	return this.array[4];
}
cmf.prototype.isnew = function(new_value) {
	if(new_value) { this.array[0] = new_value; }
	return this.array[0];
}
cmf.prototype.isdeleted = function(new_value) {
	if(new_value) { this.array[2] = new_value; }
	return this.array[2];
}
cmf.prototype.field_class = function(new_value) {
	if(new_value) { this.array[6] = new_value; }
	return this.array[6];
}

//  ----------------------------------------------------------------
// Class: acn
//  ----------------------------------------------------------------

function acn(array) {
	if(array) { this.array = array; } 
	else { this.array = []; }
}

acn.prototype._is_array = function() {
	return true;
}
acn.prototype.edit_date = function(new_value) {
	if(new_value) { this.array[4] = new_value; }
	return this.array[4];
}
acn.prototype.creator = function(new_value) {
	if(new_value) { this.array[5] = new_value; }
	return this.array[5];
}
acn.prototype.create_date = function(new_value) {
	if(new_value) { this.array[6] = new_value; }
	return this.array[6];
}
acn.prototype.copies = function(new_value) {
	if(new_value) { this.array[3] = new_value; }
	return this.array[3];
}
acn.prototype.isnew = function(new_value) {
	if(new_value) { this.array[0] = new_value; }
	return this.array[0];
}
acn.prototype.editor = function(new_value) {
	if(new_value) { this.array[8] = new_value; }
	return this.array[8];
}
acn.prototype.ischanged = function(new_value) {
	if(new_value) { this.array[1] = new_value; }
	return this.array[1];
}
acn.prototype.record = function(new_value) {
	if(new_value) { this.array[7] = new_value; }
	return this.array[7];
}
acn.prototype.owning_lib = function(new_value) {
	if(new_value) { this.array[11] = new_value; }
	return this.array[11];
}
acn.prototype.label = function(new_value) {
	if(new_value) { this.array[10] = new_value; }
	return this.array[10];
}
acn.prototype.id = function(new_value) {
	if(new_value) { this.array[9] = new_value; }
	return this.array[9];
}
acn.prototype.isdeleted = function(new_value) {
	if(new_value) { this.array[2] = new_value; }
	return this.array[2];
}

//  ----------------------------------------------------------------
// Class: aou
//  ----------------------------------------------------------------

function aou(array) {
	if(array) { this.array = array; } 
	else { this.array = []; }
}

aou.prototype._is_array = function() {
	return true;
}
aou.prototype.shortname = function(new_value) {
	if(new_value) { this.array[4] = new_value; }
	return this.array[4];
}
aou.prototype.ou_type = function(new_value) {
	if(new_value) { this.array[5] = new_value; }
	return this.array[5];
}
aou.prototype.parent_ou = function(new_value) {
	if(new_value) { this.array[6] = new_value; }
	return this.array[6];
}
aou.prototype.name = function(new_value) {
	if(new_value) { this.array[7] = new_value; }
	return this.array[7];
}
aou.prototype.children = function(new_value) {
	if(new_value) { this.array[3] = new_value; }
	return this.array[3];
}
aou.prototype.isnew = function(new_value) {
	if(new_value) { this.array[0] = new_value; }
	return this.array[0];
}
aou.prototype.ischanged = function(new_value) {
	if(new_value) { this.array[1] = new_value; }
	return this.array[1];
}
aou.prototype.id = function(new_value) {
	if(new_value) { this.array[9] = new_value; }
	return this.array[9];
}
aou.prototype.address = function(new_value) {
	if(new_value) { this.array[8] = new_value; }
	return this.array[8];
}
aou.prototype.isdeleted = function(new_value) {
	if(new_value) { this.array[2] = new_value; }
	return this.array[2];
}

//  ----------------------------------------------------------------
// Class: bre
//  ----------------------------------------------------------------

function bre(array) {
	if(array) { this.array = array; } 
	else { this.array = []; }
}

bre.prototype._is_array = function() {
	return true;
}
bre.prototype.edit_date = function(new_value) {
	if(new_value) { this.array[5] = new_value; }
	return this.array[5];
}
bre.prototype.source = function(new_value) {
	if(new_value) { this.array[4] = new_value; }
	return this.array[4];
}
bre.prototype.call_numbers = function(new_value) {
	if(new_value) { this.array[3] = new_value; }
	return this.array[3];
}
bre.prototype.tcn_value = function(new_value) {
	if(new_value) { this.array[6] = new_value; }
	return this.array[6];
}
bre.prototype.creator = function(new_value) {
	if(new_value) { this.array[7] = new_value; }
	return this.array[7];
}
bre.prototype.create_date = function(new_value) {
	if(new_value) { this.array[9] = new_value; }
	return this.array[9];
}
bre.prototype.active = function(new_value) {
	if(new_value) { this.array[8] = new_value; }
	return this.array[8];
}
bre.prototype.deleted = function(new_value) {
	if(new_value) { this.array[10] = new_value; }
	return this.array[10];
}
bre.prototype.isnew = function(new_value) {
	if(new_value) { this.array[0] = new_value; }
	return this.array[0];
}
bre.prototype.last_xact_id = function(new_value) {
	if(new_value) { this.array[11] = new_value; }
	return this.array[11];
}
bre.prototype.editor = function(new_value) {
	if(new_value) { this.array[12] = new_value; }
	return this.array[12];
}
bre.prototype.ischanged = function(new_value) {
	if(new_value) { this.array[1] = new_value; }
	return this.array[1];
}
bre.prototype.id = function(new_value) {
	if(new_value) { this.array[13] = new_value; }
	return this.array[13];
}
bre.prototype.isdeleted = function(new_value) {
	if(new_value) { this.array[2] = new_value; }
	return this.array[2];
}
bre.prototype.tcn_source = function(new_value) {
	if(new_value) { this.array[14] = new_value; }
	return this.array[14];
}

//  ----------------------------------------------------------------
// Class: brx
//  ----------------------------------------------------------------

function brx(array) {
	if(array) { this.array = array; } 
	else { this.array = []; }
}

brx.prototype._is_array = function() {
	return true;
}
brx.prototype.marc = function(new_value) {
	if(new_value) { this.array[3] = new_value; }
	return this.array[3];
}
brx.prototype.ischanged = function(new_value) {
	if(new_value) { this.array[1] = new_value; }
	return this.array[1];
}
brx.prototype.id = function(new_value) {
	if(new_value) { this.array[4] = new_value; }
	return this.array[4];
}
brx.prototype.isnew = function(new_value) {
	if(new_value) { this.array[0] = new_value; }
	return this.array[0];
}
brx.prototype.isdeleted = function(new_value) {
	if(new_value) { this.array[2] = new_value; }
	return this.array[2];
}
brx.prototype.last_xact_id = function(new_value) {
	if(new_value) { this.array[5] = new_value; }
	return this.array[5];
}

//  ----------------------------------------------------------------
// Class: msfe
//  ----------------------------------------------------------------

function msfe(array) {
	if(array) { this.array = array; } 
	else { this.array = []; }
}

msfe.prototype._is_array = function() {
	return true;
}
msfe.prototype.ischanged = function(new_value) {
	if(new_value) { this.array[1] = new_value; }
	return this.array[1];
}
msfe.prototype.value = function(new_value) {
	if(new_value) { this.array[3] = new_value; }
	return this.array[3];
}
msfe.prototype.id = function(new_value) {
	if(new_value) { this.array[4] = new_value; }
	return this.array[4];
}
msfe.prototype.isnew = function(new_value) {
	if(new_value) { this.array[0] = new_value; }
	return this.array[0];
}
msfe.prototype.isdeleted = function(new_value) {
	if(new_value) { this.array[2] = new_value; }
	return this.array[2];
}
msfe.prototype.field = function(new_value) {
	if(new_value) { this.array[5] = new_value; }
	return this.array[5];
}
