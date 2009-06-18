package MFHD::Caption;
use strict;
use integer;
use Carp;

use Data::Dumper;

use DateTime;

use base 'MARC::Field';

sub new
{
    my $proto = shift;
    my $class = ref($proto) || $proto;
    my $self = shift;
    my $last_enum = undef;

    $self->{_mfhdc_ENUMS} = {};
    $self->{_mfhdc_CHRONS} = {};
    $self->{_mfhdc_PATTERN} = {};
    $self->{_mfhdc_COPY} = undef;
    $self->{_mfhdc_UNIT} = undef;
    $self->{_mfhdc_COMPRESSIBLE} = 1;	# until proven otherwise

    foreach my $subfield ($self->subfields) {
	my ($key, $val) = @$subfield;
	if ($key eq '8') {
	    $self->{LINK} = $val;
	} elsif ($key =~ /[a-h]/) {
	    # Enumeration Captions
	    $self->{_mfhdc_ENUMS}->{$key} = {CAPTION => $val,
					     COUNT => undef,
					     RESTART => undef};
	    if ($key =~ /[ag]/) {
		$last_enum = undef;
	    } else {
		$last_enum = $key;
	    }
	} elsif ($key =~ /[i-m]/) {
	    # Chronology captions
	    $self->{_mfhdc_CHRONS}->{$key} = $val;
	} elsif ($key eq 'u') {
	    # Bib units per next higher enumeration level
	    carp('$u specified for top-level enumeration')
	      unless defined($last_enum);
	    $self->{_mfhdc_ENUMS}->{$last_enum}->{COUNT} = $val;
	} elsif ($key eq 'v') {
	    carp '$v specified for top-level enumeration'
	      unless defined($last_enum);
	    $self->{_mfhdc_ENUMS}->{$last_enum}->{RESTART} = ($val eq 'r');
	} elsif ($key =~ /[npwz]/) {
	    # Publication Pattern info ('o' == type of unit, 'q'..'t' undefined)
	    $self->{_mfhdc_PATTERN}->{$key} = $val;
	} elsif ($key =~ /x/) {
	    # Calendar change can have multiple comma-separated values
	    $self->{_mfhdc_PATTERN}->{x} = [split /,/, $val];
	} elsif ($key eq 'y') {
	    $self->{_mfhdc_PATTERN}->{y} = {}
	      unless exists $self->{_mfhdc_PATTERN}->{y};
	    update_pattern($self, $val);
	} elsif ($key eq 'o') {
	    # Type of unit
	    $self->{_mfhdc_UNIT} = $val;
	} elsif ($key eq 't') {
	    $self->{_mfhdc_COPY} = $val;
	} else {
	    carp "Unknown caption subfield '$key'";
	}
    }

    # subsequent levels of enumeration (primary and alternate)
    # If an enumeration level doesn't document the number
    # of "issues" per "volume", or whether numbering of issues
    # restarts, then we can't compress.
    foreach my $key ('b', 'c', 'd', 'e', 'f', 'h') {
	if (exists $self->{_mfhdc_ENUMS}->{$key}) {
	    my $pattern = $self->{_mfhdc_ENUMS}->{$key};
	    if (!$pattern->{RESTART} || !$pattern->{COUNT}
		|| ($pattern->{COUNT} eq 'var')
		|| ($pattern->{COUNT} eq 'und')) {
		$self->{_mfhdc_COMPRESSIBLE} = 0;
		last;
	    }
	}
    }

    my $pat = $self->{_mfhdc_PATTERN};

    # Sanity check publication frequency vs publication pattern:
    # if the frequency is a number, then the pattern better
    # have that number of values associated with it.
    if (exists($pat->{w}) && ($pat->{w} =~ /^\d+$/)
	&& ($pat->{w} != scalar(@{$pat->{y}->{p}}))) {
	carp("Caption::new: publication frequency '$pat->{w}' != publication pattern @{$pat->{y}->{p}}");
    }


    # If there's a $x subfield and a $j, then it's compressible
    if (exists $pat->{x} && exists $self->{_mfhdc_CHRONS}->{'j'}) {
	$self->{_mfhdc_COMPRESSIBLE} = 1;
    }

    bless ($self, $class);

    return $self;
}

sub update_pattern {
    my $self = shift;
    my $val = shift;
    my $pathash = $self->{_mfhdc_PATTERN}->{y};
    my ($pubcode, $pat) = unpack("a1a*", $val);

    $pathash->{$pubcode} = [] unless exists $pathash->{$pubcode};
    push @{$pathash->{$pubcode}}, $pat;
}

sub decode_pattern {
    my $self = shift;
    my $pattern = $self->{_mfhdc_PATTERN}->{y};

    # XXX WRITE ME (?)
}

sub compressible {
    my $self = shift;

    return $self->{_mfhdc_COMPRESSIBLE};
}

sub chrons {
    my $self = shift;
    my $key = shift;

    if (exists $self->{_mfhdc_CHRONS}->{$key}) {
	return $self->{_mfhdc_CHRONS}->{$key};
    } else {
	return undef;
    }
}

sub capfield {
    my $self = shift;
    my $key = shift;

    if (exists $self->{_mfhdc_ENUMS}->{$key}) {
	return $self->{_mfhdc_ENUMS}->{$key};
    } elsif (exists $self->{_mfhdc_CHRONS}->{$key}) {
	return $self->{_mfhdc_CHRONS}->{$key};
    } else {
	return undef;
    }
}

sub capstr {
    my $self = shift;
    my $key = shift;
    my $val = $self->capfield($key);

    if (ref $val) {
	return $val->{CAPTION};
    } else {
	return $val;
    }
}

sub calendar_change {
    my $self = shift;

    return $self->{_mfhdc_PATTERN}->{x};
}

# If items are identified by chronology only, with no separate
# enumeration (eg, a newspaper issue), then the chronology is
# recorded in the enumeration subfields $a - $f.  We can tell
# that this is the case if there are $a - $f subfields and no
# chronology subfields ($i-$k), and none of the $a-$f subfields
# have associated $u or $v subfields, but there's a $w and no $x

sub enumeration_is_chronology {
    my $self = shift;

    # There is always a '$a' subfield in well-formed fields.
    return 0 if exists $self->{_mfhdc_CHRONS}->{i}
      || exists $self->{_mfhdc_PATTERN}->{x};

    foreach my $key ('a' .. 'f') {
	my $enum;

	last if !exists $self->{_mfhdc_ENUMS}->{$key};

	$enum = $self->{_mfhdc_ENUMS}->{$key};
	return 0 if defined $enum->{COUNT} || defined $enum->{RESTART};
    }

    return (exists $self->{_mfhdc_PATTERN}->{w});
}

my %daynames = (
		'mo' => 1,
		'tu' => 2,
		'we' => 3,
		'th' => 4,
		'fr' => 5,
		'sa' => 6,
		'su' => 7,
	       );

my $daypat = '(mo|tu|we|th|fr|sa|su)';
my $weekpat = '(99|98|97|00|01|02|03|04|05)';
my $weeknopat;
my $monthpat = '(01|02|03|04|05|06|07|08|09|10|11|12)';
my $seasonpat = '(21|22|23|24)';

# Initialize $weeknopat to be '(01|02|03|...|51|52|53)'
$weeknopat = '(';
foreach my $weekno (1..52) {
    $weeknopat .= sprintf('%02d|', $weekno);
}
$weeknopat .= '53)';

sub match_day {
    my $pat = shift;
    my @date = @_;
    # Translate daynames into day of week for DateTime
    # also used to check if dayname is valid.

    if (exists $daynames{$pat}) {
	# dd
	# figure out day of week for date and compare
	my $dt = DateTime->new(year  => $date[0],
			       month => $date[1],
			       day   => $date[2]);
	return ($dt->day_of_week == $daynames{$pat});
    } elsif (length($pat) == 2) {
	# DD
	return $pat == $date[2];
    } elsif (length($pat) == 4) {
	# MMDD
	my ($mon, $day) = unpack("a2a2", $pat);

	return (($mon == $date[1]) && ($day == $date[2]));
    } else {
	carp "Invalid day pattern '$pat'";
	return 0;
    }
}

sub subsequent_day {
    my $pat = shift;
    my @cur = @_;
    my $dt = DateTime->new(year  => $cur[0],
			   month => $cur[1],
			   day   => $cur[2]);

    if (exists $daynames{$pat}) {
	# dd: published on the given weekday
	my $dow = $dt->day_of_week;
	my $corr = ($dow - $daynames{$pat} + 7) % 7;

	if ($dow == $daynames{$pat}) {
	    # the next one is one week hence
	    $dt->add(days => 7);
	} else {
	    # the next one is later this week,
	    # or it is next week (ie, on or after next Monday)
	    # $corr will take care of it.
	    $dt->add(days => $corr);
	}
    } elsif (length($pat) == 2) {
	# DD: published on the give day of every month
	if ($dt->day >= $pat) {
	    # current date is on or after $pat: next one is next month
	    $dt->set(day => $pat);
	    $dt->add(months => 1);
	    $cur[0] = $dt->year;
	    $cur[1] = $dt->month;
	    $cur[2] = $dt->day;
	} else {
	    # current date is before $pat: set day to pattern
	    $cur[2] = $pat;
	}
    } elsif (length($pat) == 4) {
	# MMDD: published on the given day of the given month
	my ($mon, $day) = unpack("a2a2", $pat);

	if (on_or_after($mon, $day, $cur[1], $cur[2])) {
	    # Current date is on or after pattern; next one is next year
	    $cur[0] += 1;
	}
	# Year is now right. Either it's next year (because of on_or_after)
	# or it's this year, because the current date is NOT on or after
	# the pattern. Just fix the month and day
	$cur[1] = $mon;
	$cur[2] = $day;
    } else {
	carp "Invalid day pattern '$pat'";
	return undef;
    }

    foreach my $i (0..$#cur) {
	$cur[$i] = '0' . (0+$cur[$i]) if $cur[$i] < 10;
    }

    return @cur;
}


# Calculate date of 3rd Friday of the month (for example)
# 1-5: count from beginning of month
# 99-97: count back from end of month
sub nth_week_of_month {
    my $dt = shift;
    my $week = shift;
    my $day = shift;
    my ($nth_day, $dow, $day);

    $day = $daynames{$day};

    if (0 < $week && $week <= 5) {
	$nth_day = DateTime->clone($dt)->set(day => 1);
    } elsif ($week >= 97) {
	$nth_day = DateTime->last_day_of_month(year  => $dt->year,
					       month => $dt->month);
    } else {
	return undef;
    }

    $dow = $nth_day->day_of_week();

    if ($week <= 5) {
	# count forwards
	$nth_day->add(days => ($day - $dow + 7) % 7,
		      weeks=> $week - 1);
    } else {
	# count backwards
	$nth_day->subtract(days => ($day - $nth_day->day_of_week + 7) % 7);

	# 99: last week of month, 98: second last, etc.
	for (my $i = 99 - $week; $i > 0; $i--) {
	    $nth_day->subtract(weeks => 1);
	}
    }

    # There is no nth "day" in the month!
    return undef if ($dt->month != $nth_day->month);

    return $nth_day;
}

#
# Internal utility function to match the various different patterns
# of month, week, and day
#
sub check_date {
    my $dt = shift;
    my $month = shift;
    my $weekno = shift;
    my $day = shift;

    if (!defined $day) {
	# MMWW
	return (($dt->month == $month)
		&& (($dt->week_of_month == $weekno)
		    || ($weekno >= 97
			&& ($dt->week_of_month == nth_week_of_month($dt, $weekno, $day)->week_of_month))));
    }

    # simple cases first
    if ($daynames{$day} != $dt->day_of_week) {
	# if it's the wrong day of the week, rest doesn't matter
	return 0;
    }

    if (!defined $month) {
	# WWdd
	return (($weekno == 0)	# Every week
		|| ($dt->weekday_of_month == $weekno) # this week
		|| (($weekno >= 97) && ($dt->weekday_of_month == nth_week_of_month($dt, $weekno, $day)->weekday_of_month)));
    }

    # MMWWdd
    if ($month != $dt->month) {
	# If it's the wrong month, then we're done
	return 0;
    }

    # It's the right day of the week
    # It's the right month

    if (($weekno == 0) ||($weekno == $dt->weekday_of_month)) {
	# If this matches, then we're counting from the beginning
	# of the month and it matches and we're done.
	return 1;
    }

    # only case left is that the week number is counting from
    # the end of the month: eg, second last wednesday
    return (($weekno >= 97)
	    && (nth_week_of_month($dt, $weekno, $day)->weekday_of_month == $dt->weekday_of_month));
}

sub match_week {
    my $pat = shift;
    my @date = @_;
    my $dt = DateTime->new(year  => $date[0],
			   month => $date[1],
			   day   => $date[2]);

    if ($pat =~ m/^$weekpat$daypat$/) {
	# WWdd: 03we = Third Wednesday
	return check_date($dt, undef, $1, $2);
    } elsif ($pat =~ m/^$monthpat$weekpat$daypat$/) {
	# MMWWdd: 0599tu Last Tuesday in May XXX WRITE ME
	return check_date($dt, $1, $2, $3);
    } elsif ($pat =~ m/^$monthpat$weekpat$/) {
	# MMWW: 1204: Fourth week in December XXX WRITE ME
	return check_date($dt, $1, $2, undef);
    } else {
	carp "invalid week pattern '$pat'";
	return 0;
    }
}

#
# Use $pat to calcuate the date of the issue following $cur
#
sub subsequent_week {
    my $pat = shift;
    my @cur = @_;
    my $candidate;
    my $dt = DateTime->new(year => $cur[0],
			   month=> $cur[1],
			   day  => $cur[2]);

    if ($pat =~ m/^$weekpat$daypat$/) {
	# WWdd: published on given weekday of given week of every month
	my ($week, $day) = ($1, $2);

	if ($week eq '00') {
	    # Every week
	    $candidate = DateTime->clone($dt);
	    if ($dt->day_of_week == $daynames{$day}) {
		# Current is right day, next one is a week hence
		$candidate->add(days => 7);
	    } else {
		$candidate->add(days => ($dt->day_of_week - $daynames{$day} + 7) % 7);
	    }
	} else {
	    # 3rd Friday of the month (eg)
	    $candidate = nth_week_of_month($dt, $week, $day);
	}

	if ($candidate < $dt) {
	    # If the n'th week of the month happens before the
	    # current issue, then the next issue is published next
	    # month, otherwise, it's published this month.
	    # This will never happen for the "00: every week" pattern
	    $candidate = DateTime->clone($dt)->add(months => 1)->set(day => 1);
	    $candidate = nth_week_of_month($dt, $week, $day);
	}
    } elsif ($pat =~ m/^$monthpat$weekpat$daypat$/) {
	# MMWWdd: published on given weekday of given week of given month
	my ($month, $week, $day) = ($1, $2, $3);

	$candidate = DateTime->new(year => $dt->year,
				   month=> $month,
				   day  => 1);
	$candidate = nth_week_of_month($candidate, $week, $day);
	if ($candidate < $dt) {
	    # We've missed it for this year, next one that matches
	    # will be next year
	    $candidate->add(years => 1)->set(day => 1);
	    $candidate = nth_week_of_month($candidate, $week, $day);
	}
    } elsif ($pat =~ m/^$monthpat$weekpat$/) {
	# MMWW: published during given week of given month
	my ($month, $week) = ($1, $2);

	$candidate = nth_week_of_month(DateTime->new(year => $dt->year,
						     month=> $month,
						     day  => 1),
				       $week,
				       'th');
	if ($candidate < $dt) {
	    # Already past the pattern date this year, move to next year
	    $candidate->add(years => 1)->set(day => 1);
	    $candidate = nth_week_of_month($candidate, $week, 'th');
	}
    } else {
	carp "invalid week pattern '$pat'";
	return undef;
    }

    $cur[0] = $candidate->year;
    $cur[1] = $candidate->month;
    $cur[2] = $candidate->day;

    foreach my $i (0..$#cur) {
	$cur[$i] = '0' . (0+$cur[$i]) if $cur[$i] < 10;
    }

    return @cur;
}

sub match_month {
    my $pat = shift;
    my @date = @_;

    return ($pat eq $date[1]);
}

sub match_season {
    my $pat = shift;
    my @date = @_;

    return ($pat eq $date[1]);
}

sub subsequent_season {
    my $pat = shift;
    my @cur = @_;

    if (($pat < 21) || ($pat > 24)) {
	carp "Unexpected season '$pat'";
	return undef;
    }

    if ($cur[1] >= $pat) {
	# current season is on or past pattern season in this year,
	# advance to next year
	$cur[0] += 1;
    }
    # Either we've advanced to the next year or the current season
    # is before the pattern season in the current year. Either way,
    # all that remains is to set the season properly
    $cur[1] = $pat;

    return @cur;
}

sub match_year {
    my $pat = shift;
    my @date = @_;

    # XXX WRITE ME
    return 0;
}

sub subsequent_year {
    my $pat = shift;
    my $cur = shift;

    # XXX WRITE ME
    return undef;
}

sub match_issue {
    my $pat = shift;
    my @date = @_;

    # We handle enumeration patterns separately. This just
    # ensures that when we're processing chronological patterns
    # we don't match an enumeration pattern.
    return 0;
}

sub subsequent_issue {
    my $pat = shift;
    my $cur = shift;

    # Issue generation is handled separately
    return undef;
}

my %dispatch = (
		d => \&match_day,
		e => \&match_issue, # not really a "chron" code
		w => \&match_week,
		m => \&match_month,
		s => \&match_season,
		y => \&match_year,
);

my %generators = (
		  d => \&subsequent_day,
		  e => \&subsequent_issue, # not really a "chron" code
		  w => \&subsequent_week,
		  m => \&subsequent_month,
		  s => \&subsequent_season,
		  y => \&subsequent_year,
);

sub regularity_match {
    my $self = shift;
    my $pubcode = shift;
    my @date = @_;

    # we can't match something that doesn't exist.
    return 0 if !exists $self->{_mfhdc_PATTERN}->{y}->{$pubcode};

    foreach my $regularity (@{$self->{_mfhdc_PATTERN}->{y}->{$pubcode}}) {
	my $chroncode= substr($regularity, 0, 1);
	my @pats = split(/,/, substr($regularity, 1));

	if (!exists $dispatch{$chroncode}) {
	    carp "Unrecognized chroncode '$chroncode'";
	    return 0;
	}

	# XXX WRITE ME
	foreach my $pat (@pats) {
	    $pat =~ s|/.+||;	# If it's a combined date, match the start
	    if ($dispatch{$chroncode}->($pat, @date)) {
		return 1;
	    }
	}
    }

    return 0;
}

sub is_omitted {
    my $self = shift;
    my @date = @_;

#     printf("# is_omitted: testing date %s: %d\n", join('/', @date),
# 	   $self->regularity_match('o', @date));
    return $self->regularity_match('o', @date);
}

sub is_published {
    my $self = shift;
    my @date = @_;

    return $self->regularity_match('p', @date);
}

sub is_combined {
    my $self = shift;
    my @date = @_;

    return $self->regularity_match('c', @date);
}

sub enum_is_combined {
    my $self = shift;
    my $subfield = shift;
    my $iss = shift;
    my $level = ord($subfield) - ord('a') + 1;

    return 0 if !exists $self->{_mfhdc_PATTERN}->{y}->{c};

    foreach my $regularity (@{$self->{_mfhdc_PATTERN}->{y}->{c}}) {
	next unless $regularity =~ m/^e$level/o;

	my @pats = split(/,/, substr($regularity, 2));

	foreach my $pat (@pats) {
	    $pat =~ s|/.+||;	# if it's a combined issue, match the start
	    return 1 if ($iss eq $pat);
	}
    }

    return 0;
}


my %increments = (
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
);

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
		$new[1] -= 4;	# 25 - 4 == 21 == Spring after Winter
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

    foreach my $i (0..$#new) {
	$new[$i] = '0' . (0+$new[$i]) if $new[$i] < 10;
    }

    return @new;
}

# Test to see if $m1/$d1 is on or after $m2/$d2
# if $d2 is undefined, test is based on just months
sub on_or_after {
    my ($m1, $d1, $m2, $d2) = @_;

    return (($m1 > $m2)
	    || ($m1 == $m2 && ((!defined $d2) || ($d1 >= $d2))));
}

sub calendar_increment {
    my $self = shift;
    my $cur = shift;
    my @new = @_;
    my $cal_change = $self->calendar_change;
    my $month;
    my $day;
    my $cur_before;
    my $new_on_or_after;

    # A calendar change is defined, need to check if it applies
    if ((scalar(@new) == 2 && $new[1] > 20) || (scalar(@new) == 1)) {
	carp "Can't calculate date change for ", $self->as_string;
	return;
    }

    foreach my $change (@{$cal_change}) {
	my $incr;

	if (length($change) == 2) {
	    $month = $change;
	} elsif (length($change) == 4) {
	    ($month, $day) = unpack("a2a2", $change);
	}

	if ($cur->[0] == $new[0]) {
	    # Same year, so a 'simple' month/day comparison will be fine
	    $incr = (!on_or_after($cur->[1], $cur->[2], $month, $day)
		     && on_or_after($new[1], $new[2], $month, $day));
	} else {
	    # @cur is in the year before @new. There are
	    # two possible cases for the calendar change date that
	    # indicate that it's time to change the volume:
	    # (1) the change date is AFTER @cur in the year, or
	    # (2) the change date is BEFORE @new in the year.
	    # 
	    #  -------|------|------X------|------|
	    #       @cur    (1)   Jan 1   (2)   @new

	    $incr = (on_or_after($new[1], $new[2], $month, $day)
		     || !on_or_after($cur->[1], $cur->[2], $month, $day));
	}
	return $incr if $incr;
    }
}

sub next_date {
    my $self = shift;
    my $next = shift;
    my $carry = shift;
    my @keys = @_;
    my @cur;
    my @new;
    my $incr;
    my @candidate;

    my $reg = $self->{_mfhdc_REGULARITY};
    my $pattern = $self->{_mfhdc_PATTERN};
    my $freq = $pattern->{w};

    foreach my $i (0..$#keys) {
	$cur[$i] = $next->{$keys[$i]} if exists $next->{$keys[$i]};
    }

    # If the current issue has a combined date (eg, May/June)
    # get rid of the first date and base the calculation
    # on the final date in the combined issue.
    $cur[-1] =~ s|^[^/]+/||;

    if (defined $pattern->{y}->{p}) {
	# There is a $y publication pattern defined in the record:
	# use it to calculate the next issue date.

	# XXX TODO: need to handle combined and omitted issues.
	foreach my $pubpat (@{$pattern->{y}->{p}}) {
	    my $chroncode = substr($pubpat, 0, 1);
	    my @pats = split(/,/, substr($pubpat, 1));

	    if (!exists $generators{$chroncode}) {
		carp "Unrecognized chroncode '$chroncode'";
		return undef;
	    }

	    foreach my $pat (@pats) {
		@candidate = $generators{$chroncode}->($pat, @cur);
		while ($self->is_omitted(@candidate)) {
# 		    printf("# pubpat omitting date '%s'\n",
# 			   join('/', @candidate));
		    @candidate = $generators{$chroncode}->($pat, @candidate);
		}

# 		printf("# testing candidate date '%s'\n", join('/', @candidate));
		if (!defined($new[0])
		    || !on_or_after($candidate[0], $candidate[1], $new[0], $new[1])) {
		    # first time through the loop
		    # or @candidate is before @new => @candidate is the next
		    # issue.
		    @new = @candidate;
# 		    printf("# selecting candidate date '%s'\n", join('/', @new));
		}
	    }
	}
    } else {
	# There is no $y publication pattern defined, so use
	# the $w frequency to figure out the next date

	if (!defined($freq)) {
	    carp "Undefined frequency in next_date!";
	} elsif (!exists $increments{$freq}) {
	    carp "Don't know how to deal with frequency '$freq'!";
	} else {
	    #
	    # One of the standard defined issue frequencies
	    #
	    @new = incr_date($increments{$freq}, @cur);

	    while ($self->is_omitted(@new)) {
		@new = incr_date($increments{$freq}, @new);
	    }

	    if ($self->is_combined(@new)) {
		my @second_date = incr_date($increments{$freq}, @new);

		# I am cheating: This code assumes that only the smallest
		# time increment is combined. So, no "Apr 15/May 1" allowed.
		$new[-1] = $new[-1] . '/' . $second_date[-1];
	    }
	}
    }

    for my $i (0..$#new) {
	$next->{$keys[$i]} = $new[$i];
    }
    # Figure out if we need to adust volume number
    # right now just use the $carry that was passed in.
    # in long run, need to base this on ($carry or date_change)
    if ($carry) {
	# if $carry is set, the date doesn't matter: we're not
	# going to increment the v. number twice at year-change.
	$next->{a} += $carry;
    } elsif (defined $pattern->{x}) {
	$next->{a} += $self->calendar_increment(\@cur, @new);
    }
}

sub next_alt_enum {
    my $self = shift;
    my $next = shift;

    # First handle any "alternative enumeration", since they're
    # a lot simpler, and don't depend on the the calendar
    foreach my $key ('h', 'g') {
	next if !exists $next->{$key};
	if (!$self->capstr($key)) {
	    warn "Holding data exists for $key, but no caption specified";
	    $next->{$key} += 1;
	    last;
	}

	my $cap = $self->capfield($key);
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
    foreach my $key (reverse('b'..'f')) {
	next if !exists $next->{$key};

	if (!$self->capstr($key)) {
	    # Just assume that it increments continuously and give up
	    warn "Holding data exists for $key, but no caption specified";
	    $next->{$key} += 1;
	    $carry = 0;
	    last;
	}

	# If the current issue has a combined issue number (eg, 2/3)
	# get rid of the first issue number and base the calculation
	# on the final issue number in the combined issue.
	if ($next->{$key} =~ m|/|) {
	    $next->{$key} =~ s|^[^/]+/||;
	}

	my $cap = $self->capfield($key);
	if ($cap->{RESTART} && $cap->{COUNT}
	    && ($next->{$key} eq $cap->{COUNT})) {
	    $next->{$key} = 1;
	    $carry = 1;
	} else {
	    # If I don't need to "carry" beyond here, then I just increment
	    # this level of the enumeration and stop looping, since the
	    # "next" hash has been initialized with the current values

	    $next->{$key} += 1;
	    $carry = 0;
	}

	# You can't have a combined issue that spans two volumes: no.12/1
	# is forbidden
	if ($self->enum_is_combined($key, $next->{$key})) {
	    $next->{$key} .= '/' . ($next->{$key} + 1);
	}

	last if !$carry;
    }

    # The easy part is done. There are two things left to do:
    # 1) Calculate the date of the next issue, if necessary
    # 2) Increment the highest level of enumeration (either by date
    #    or because $carry is set because of the above loop

    if (!$self->subfield('i')) {
	# The simple case: if there is no chronology specified
	# then just check $carry and return
	$next->{'a'} += $carry;
    } else {
	# Figure out date of next issue, then decide if we need
	# to adjust top level enumeration based on that
	$self->next_date($next, $carry, ('i'..'m'));
    }
}

sub next {
    my $self = shift;
    my $holding = shift;
    my $next = {};

    # Initialize $next with current enumeration & chronology, then
    # we can just operate on $next, based on the contents of the caption

    if ($self->enumeration_is_chronology) {
	foreach my $key ('a' .. 'h') {
	    $next->{$key} = $holding->{_mfhdh_SUBFIELDS}->{$key}
	      if defined $holding->{_mfhdh_SUBFIELDS}->{$key};
	}
	$self->next_date($next, 0, ('a' .. 'h'));

	return $next;
    }

    foreach my $key ('a' .. 'h') {
	$next->{$key} = $holding->{_mfhdh_SUBFIELDS}->{$key}->{HOLDINGS}
	  if defined $holding->{_mfhdh_SUBFIELDS}->{$key};
    }

    foreach my $key ('i'..'m') {
	$next->{$key} = $holding->{_mfhdh_SUBFIELDS}->{$key}
	  if defined $holding->{_mfhdh_SUBFIELDS}->{$key};
    }

    if (exists $next->{'h'}) {
	$self->next_alt_enum($next);
    }

    $self->next_enum($next);

    return($next);
}

1;
