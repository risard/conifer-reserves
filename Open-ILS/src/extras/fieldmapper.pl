#!/usr/bin/perl
use strict; use warnings;
use Data::Dumper; 
use OpenILS::Utils::Fieldmapper;  

my $map = $Fieldmapper::fieldmap;

# if a true value is provided, we generate the web (light) version of the fieldmapper
my $web = $ARGV[0];
# List of classes needed by the opac
my @web_hints = ("ex", "mvr", "au", "aou","aout", "asv", "asva", "asvr", "asvq");

print <<JS;

//  ----------------------------------------------------------------
// Autogenerated by fieldmapper.pl
// Requires JSON.js
//  ----------------------------------------------------------------

function Fieldmapper() {}

Fieldmapper.prototype.clone = function() {
	var obj = new this.constructor();

	for( var i in this.array ) {
		var thing = this.array[i];
		if(thing == null) continue;

		if( thing._isfieldmapper ) {
			obj.array[i] = thing.clone();
		} else {

			if(instanceOf(thing, Array)) {
				obj.array[i] = new Array();

				for( var j in thing ) {

					if( thing[j]._isfieldmapper )
						obj.array[i][j] = thing[j].clone();
					else
						obj.array[i][j] = thing[j];
				}
			} else {
				obj.array[i] = thing;
			}
		}
	}
	return obj;
}



function FieldmapperException(message) {
	this.message = message;
}

FieldmapperException.toString = function() {
	return "FieldmapperException: " + this.message + "\\n";

}


JS

for my $object (keys %$map) {

	if($web) {
		my $hint = $map->{$object}->{hint};
		next unless (grep { $_ eq $hint } @web_hints );
		#next unless( $hint eq "mvr" or $hint eq "aou" or $hint eq "aout" );
	}

my $short_name = $map->{$object}->{hint};

print <<JS;

//  ----------------------------------------------------------------
// Class: $short_name
//  ----------------------------------------------------------------

JS

print	<<JS;

$short_name.prototype					= new Fieldmapper();
$short_name.prototype.constructor	= $short_name;
$short_name.baseClass					= Fieldmapper.constructor;

function $short_name(array) {

	this.classname = "$short_name";
	this._isfieldmapper = true;

	if(array) { 
		if( array.constructor == Array) 
			this.array = array;  

		else
			throw new FieldmapperException(
				"Attempt to build fieldmapper object with non-array");

	} else { this.array = []; }

}

$short_name._isfieldmapper = true;


JS

for my $field (keys %{$map->{$object}->{fields}}) {

my $position = $map->{$object}->{fields}->{$field}->{position};

print <<JS;
$short_name.prototype.$field = function(new_value) {
	if(arguments.length == 1) { this.array[$position] = new_value; }
	return this.array[$position];
}
JS

}
}

