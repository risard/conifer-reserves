package MFHD::Holding;
use strict;
use integer;
use Carp;

use DateTime;

use Data::Dumper;

use base 'MARC::Field';

sub new {
    my $proto = shift;
    my $class = ref($proto) || $proto;
    my $seqno = shift;
    my $self = shift;
    my $caption = shift;
    my $last_enum = undef;

    $self->{_mfhdh_SEQNO} = $seqno;
    $self->{_mfhdh_CAPTION} = $caption;
    $self->{_mfhdh_DESCR} = {};
    $self->{_mfhdh_COPY} = undef;
    $self->{_mfhdh_BREAK} = undef;
    $self->{_mfhdh_NOTES} = {};
    $self->{_mfhdh_COPYRIGHT} = [];

    foreach my $subfield ($self->subfields) {
	my ($key, $val) = @$subfield;
	if ($key =~ /[a-h]/) {
	    # Enumeration details of holdings
	    $self->{_mfhdh_SUBFIELDS}->{$key} = {HOLDINGS => $val,
						 UNIT     => undef,};
	    $last_enum = $key;
	} elsif ($key =~ /[i-m]/) {
	    $self->{_mfhdh_SUBFIELDS}->{$key} = $val;
	    if (!$caption->capstr($key)) {
		warn "Holding '$seqno' specified enumeration level '$key' not included in caption $caption->{LINK}";
	    }
	} elsif ($key eq 'o') {
	    warn '$o specified prior to first enumeration'
	      unless defined($last_enum);
	    $self->{_mfhdh_SUBFIELDS}->{$last_enum}->{UNIT} = $val;
	    $last_enum = undef;
	} elsif ($key =~ /[npq]/) {
	    $self->{_mfhdh_DESCR}->{$key} = $val;
	} elsif ($key eq 's') {
	    push @{$self->{_mfhdh_COPYRIGHT}}, $val;
	} elsif ($key eq 't') {
	    $self->{_mfhdh_COPY} = $val;
	} elsif ($key eq 'w') {
	    carp "Unrecognized break indicator '$val'"
	      unless $val =~ /^[gn]$/;
	    $self->{_mfhdh_BREAK} = $val;
	}
    }

    bless ($self, $class);
    return $self;
}

sub seqno {
    my $self = shift;

    return $self->{_mfhdh_SEQNO};
}

sub caption {
    my $self = shift;

    return $self->{_mfhdh_CAPTION};
}

sub format_chron {
    my $self = shift;
    my $caption = $self->{_mfhdh_CAPTION};
    my @keys;
    my $str = '';
    my %month = ( '01' => 'Jan.', '02' => 'Feb.', '03' => 'Mar.',
		  '04' => 'Apr.', '05' => 'May ', '06' => 'Jun.',
		  '07' => 'Jul.', '08' => 'Aug.', '09' => 'Sep.',
		  '10' => 'Oct.', '11' => 'Nov.', '12' => 'Dec.',
		  '21' => 'Spring', '22' => 'Summer',
		  '23' => 'Autumn', '24' => 'Winter' );

    @keys = @_;
    foreach my $i (0 .. @keys) {
	my $key = $keys[$i];
	my $capstr;
	my $chron;
	my $sep;

	last if !defined $caption->capstr($key);

	$capstr = $caption->capstr($key);
	if (substr($capstr,0,1) eq '(') {
	    # a caption enclosed in parentheses is not displayed
	    $capstr = '';
	}

	# If this is the second level of chronology, then it's
	# likely to be a month or season, so we should use the
	# string name rather than the number given.
	if (($i == 1) && exists $month{$self->{_mfhdh_SUBFIELDS}->{$key}}) {
	    $chron = $month{$self->{_mfhdh_SUBFIELDS}->{$key}};
	} else {
	    $chron = $self->{_mfhdh_SUBFIELDS}->{$key};
	}


	$str .= (($i == 0 || $str =~ /[. ]$/) ? '' : ':') . $capstr . $chron;
    }

    return $str;
}

sub format {
    my $self = shift;
    my $caption = $self->{_mfhdh_CAPTION};
    my $str = '';

    if ($caption->enumeration_is_chronology) {
	# if issues are identified by chronology only, then the
	# chronology data is stored in the enumeration subfields,
	# so format those fields as if they were chronological.
	$str = $self->format_chron('a'..'f');
    } else {
	# OK, there is enumeration data and maybe chronology
	# data as well, format both parts appropriately

	# Enumerations
	foreach my $key ('a'..'f') {
	    my $capstr;
	    my $chron;
	    my $sep;

	    last if !defined $caption->capstr($key);

	    # 	printf("fmt %s: '%s'\n", $key, $caption->capstr($key));

	    $capstr = $caption->capstr($key);
	    if (substr($capstr, 0, 1) eq '(') {
		# a caption enclosed in parentheses is not displayed
		$capstr = '';
	    }
	    $str .= ($key eq 'a' ? '' : ':') . $capstr . $self->{_mfhdh_SUBFIELDS}->{$key}->{HOLDINGS};
	}

	# Chronology
	if (defined $caption->capstr('i')) {
	    $str .= '(';
	    $str .= $self->format_chron('i'..'l');
	    $str .= ')';
	}

	if ($caption->capstr('g')) {
	    # There's at least one level of alternative enumeration
	    $str .= '=';
	    foreach my $key ('g', 'h') {
		$str .= ($key eq 'g' ? '' : ':') . $caption->capstr($key) . $self->{_mfhdh_SUBFIELDS}->{$key}->{HOLDINGS};
	    }

	    # This assumes that alternative chronology is only ever
	    # provided if there is an alternative enumeration.
	    if ($caption->capstr('m')) {
		# Alternative Chronology
		$str .= '(';
		$str .= $caption->capstr('m') . $self->{_mfhdh_SUBFIELDS}->{m}->{HOLDINGS};
		$str .= ')';
	    }
	}
    }

    # Public Note
    $str .= ' '. $caption->capstr('z') if (defined $caption->capstr('z'));

    # Breaks in the sequence
    if ($self->{_mfhdh_BREAK} eq 'n') {
	$str .= ' non-gap break';
    } elsif ($self->{_mfhdh_BREAK} eq 'g') {
	$str .= ' gap';
    } elsif ($self->{_mfhdh_BREAK}) {
	warn "unrecognized break indicator '$self->{_mfhdh_BREAK}'";
    }

    return $str;
}

my %increments = {
		  a => {years => 1}, # annual
		  b => {months => 2}, # bimonthly
		  c => {days => 3}, # semiweekly
		  d => {days => 1}, # daily
		  e => {weeks => 2}, # biweekly
		  f => {months => 6}, # semiannual
		  g => {years => 2},  # biennial
		  h => {years => 3},  # triennial
		  i => {days => 2}, # three times / week
		  j => {days => 10}, # three times /month
		  # k => continuous
		  m => {months => 1}, # monthly
		  q => {months => 3}, # quarterly
		  s => {days => 15},  # semimonthly
		  t => {months => 4}, # three times / year
		  w => {weeks => 1},  # weekly
		  # x => completely irregular
};

sub is_combined {
    my $str = shift;

    return $str =~ m;.+/.+;
}

sub incr_date {
    my $incr = shift;
    my @new = @_;

    if (scalar(@new) == 1) {
	# only a year is specified. Next date is easy
	$new[0] += $incr->{years} || 1;
    } elsif (scalar(@new) == 2) {
	# Year and month or season
	if ($new[1] > 20) {
	    # season
	    $new[1] += ($incr->{months}/3) || 1;
	    if ($new[1] > 24) {
		# carry
		$new[0] += 1;
		$new[1] -= 24;
	    }
	} else {
	    # month
	    $new[1] += $incr->{months} || 1;
	    if ($new[1] > 12) {
		# carry
		$new[0] += 1;
		$new[1] -= 12;
	    }
	}
    } elsif (scalar(@new) == 3) {
	# Year, Month, Day: now it gets complicated.

	if ($new[2] =~ /^[0-9]+$/) {
	    # A single number for the day of month, relatively simple
	    my $dt = DateTime->new(year => $new[0],
				   month=> $new[1],
				   day  => $new[2]);
	    $dt->add(%{$incr});
	    $new[0] = $dt->year;
	    $new[1] = $dt->month;
	    $new[2] = $dt->day;
	}
    } else {
	warn("Don't know how to cope with @new");
    }

    return @new;
}

sub next_date {
    my $self = shift;
    my $next = shift;
    my @keys = @_;
    my @cur;
    my @new;
    my $incr;

    my $caption = $self->{_mfhdh_CAPTION};
    my $reg = $caption->{REGULARITY};
    my $pattern = $caption->{PATTERN};
    my $freq = $pattern->{w};

    foreach my $i (0..@keys) {
	$new[$i] = $cur[$i] = $self->{_mfhdh_SUBFIELDS}->{$keys[$i]}
	  if exists $self->{_mfhdh_SUBFIELDS}->{$keys[$i]};
    }

    if (is_combined($new[-1])) {
	$new[-1] =~ s/^[^\/]+//;
    }

    # If $frequency is not one of the standard codes defined in %increments
    # then there has to be a $yp publication regularity pattern that
    # lists the dates of publication. Use that that list to find the next
    # date following the current one.
    # XXX: the code doesn't handle this case yet.

    if (defined $freq && exists $increments{$freq}) {
	@new = incr_date($increments{$freq}, @new);

	while ($caption->is_omitted(@new)) {
	    @new = incr_date($increments{$freq}, @new);
	}
    }
}

sub next_alt_enum {
    my $self = shift;
    my $next = shift;
    my $caption = $self->{_mfhdh_CAPTION};

    # First handle any "alternative enumeration", since they're
    # a lot simpler, and don't depend on the the calendar
    foreach my $key ('h', 'g') {
	next if !exists $next->{$key};
	if (!$caption->capstr($key)) {
	    warn "Holding data exists for $key, but no caption specified";
	    $next->{$key} += 1;
	    last;
	}

	my $cap = $caption->capfield($key);
	if ($cap->{RESTART} && $cap->{COUNT}
	    && ($next->{$key} == $cap->{COUNT})) {
	    $next->{$key} = 1;
	} else {
	    $next->{$key} += 1;
	    last;
	}
    }
}

sub next_enum {
    my $self = shift;
    my $next = shift;
    my $caption = $self->{_mfhdh_CAPTION};
    my $carry;

    # $carry keeps track of whether we need to carry into the next
    # higher level of enumeration. It's not actually necessary except
    # for when the loop ends: if we need to carry from $b into $a
    # then $carry will be set when the loop ends.
    #
    # We need to keep track of this because there are two different
    # reasons why we might increment the highest level of enumeration ($a)
    # 1) we hit the correct number of items in $b (ie, 5th iss of quarterly)
    # 2) it's the right time of the year.
    #
    $carry = 0;
    foreach my $key (reverse('b'.. 'f')) {
	next if !exists $next->{$key};
	if (!$caption->capstr($key)) {
	    # Just assume that it increments continuously and give up
	    warn "Holding data exists for $key, but no caption specified";
	    $next->{$key} += 1;
	    $carry = 0;
	    last;
	}

	my $cap = $caption->capfield($key);
	if ($cap->{RESTART} && $cap->{COUNT}
	    && ($next->{$key} eq $cap->{COUNT})) {
	    $next->{$key} = 1;
	    $carry = 1;
	} else {
	    # If I don't need to "carry" beyond here, then I just increment
	    # this level of the enumeration and stop looping, since the
	    # "next" hash has been initialized with the current values

	    # NOTE: This DOES NOT take into account the incrementing
	    # of enumerations based on the calendar. (eg: The Economist)
	    $next->{$key} += 1;
	    $carry = 0;
	    last;
	}
    }

    # The easy part is done. There are two things left to do:
    # 1) Calculate the date of the next issue, if necessary
    # 2) Increment the highest level of enumeration (either by date
    #    or because $carry is set because of the above loop

    if (!%{$caption->{_mfhdc_CHRONS}}) {
	# The simple case: if there is no chronology specified
	# then just check $carry and return
	$next->{'a'} += $carry;
    } else {
	# Figure out date of next issue, then decide if we need
	# to adjust top level enumeration based on that
	$self->next_date($next, ('i'..'m'));
    }
}


# next: Given a holding statement, return a hash containing the 
# enumeration values for the next issues, whether we hold it or not
#
sub next {
    my $self = shift;
    my $caption = $self->{_mfhdh_CAPTION};
    my $next = {};
    my $carry;

    # Initialize $next with current enumeration & chronology, then
    # we can just operate on $next, based on the contents of the caption
    foreach my $key ('a' .. 'h') {
	$next->{$key} = $self->{_mfhdh_SUBFIELDS}->{$key}->{HOLDINGS}
	  if exists $self->{_mfhdh_SUBFIELDS}->{$key};
    }

    foreach my $key ('i'..'m') {
	$next->{$key} = $self->{_mfhdh_SUBFIELDS}->{$key}
	  if exists $self->{_mfhdh_SUBFIELDS}->{$key};
    }

    if ($caption->enumeration_is_chronology) {
	$self->next_date($next, ('a'..'h'));
    } else {
	if (exists $next->{'h'}) {
	    $self->next_alt_enum($next);
	}

	$self->next_enum($next);
    }

    return($next);
}

# match($pat): check to see if $self matches the enumeration passed
# in as $pat. This is expected to be used in conjunction with the next()
# function defined above.
#
#
#
sub match {
    my $self = shift;
    my $pat = shift;
    my $caption = $self->{_mfhdh_CAPTION};

    foreach my $key ('a'..'f') {
	my $nextkey;

	($nextkey = $key)++;
	# If the next smaller enumeration exists, and is numbered
	# continuously, then we don't need to check this one, because
	# gaps in issue numbering matter, not changes in volume numbering
	next if (exists $self->{_mfhdh_SUBFIELDS}->{$nextkey}
		 && !$caption->capfield($nextkey)->{RESTART});

	# If a subfield exists in $self but not in $pat, or vice versa
	# or if the field has different values, then fail
	if (exists($self->{_mfhdh_SUBFIELDS}->{$key}) != exists($pat->{$key})
	    || (exists $pat->{$key}
		&& ($self->{_mfhdh_SUBFIELDS}->{$key}->{HOLDINGS} ne $pat->{$key}))) {
	    return 0;
	}
    }
    return 1;
}

# 
# Check that all the fields in a holdings statement are
# included in the corresponding caption.
# 
sub validate {
    my $self = shift;

    foreach my $key (keys %{$self->{_mfhdh_SUBFIELDS}}) {
	if (!$self->{_mfhdh_CAPTION}->capfield($key)) {
	    return 0;
	}
    }
    return 1;
}
1;
