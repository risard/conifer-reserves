dump('entering util/date.js\n');

if (typeof util == 'undefined') var util = {};
util.date = {};

util.date.EXPORT_OK	= [ 
	'check', 'timer_init', 'timer_elapsed', 'db_date2Date', 'formatted_date', 'interval_to_seconds'
];
util.date.EXPORT_TAGS	= { ':all' : util.date.EXPORT_OK };

util.date.check = function(format,date) {
	if (format != 'YYYY-MM-DD') { throw('I only understand YYYY-MM-DD.  Fix me if you want.'); }
	if (date.length != format.length) { return false; }
	if ((date.substr(4,1) != '-') || (date.substr(7,1) != '-')) { return false; }
	var yyyy = date.substr(0,4); var mm = date.substr(5,2); var dd = date.substr(8,2);
	var d = new Date( yyyy, mm - 1, dd );
	if (d.toString() == 'Invalid Date') { return false; }
	if (d.getMonth() != mm -1) { return false; }
	if (d.getFullYear() != yyyy) { return false; }
	if (dd.substr(0,1)=='0') { dd = dd.substr(1,1); }
	if (d.getDate() != dd) { return false; }
	return true;
}

util.date.check_past = function(format,date) {
	if (format != 'YYYY-MM-DD') { throw('I only understand YYYY-MM-DD.  Fix me if you want.'); }
	var yyyy = date.substr(0,4); var mm = date.substr(5,2); var dd = date.substr(8,2);
	var test_date = new Date( yyyy, mm - 1, dd );
	date = util.date.formatted_date(new Date(),'%F');
	yyyy = date.substr(0,4); mm = date.substr(5,2); dd = date.substr(8,2);
	var today = new Date( yyyy, mm - 1, dd );
	return test_date < today;
}

util.date.timer_init = function (id) {
	if (typeof util.date.timer_init.prototype.timer == 'undefined') {
		util.date.timer_init.prototype.timer = {};
	}
	util.date.timer_init.prototype.timer[id] = (new Date).getTime();
}

util.date.timer_elapsed = function (id) {
	if (! util.date.timer_init.prototype.timer[id]) { util.date.timer_init(id); }
	var ms = (new Date).getTime() - util.date.timer_init.prototype.timer[id];
	return( ms + 'ms (' + ms/1000 + 's)' );
}

util.date.db_date2Date = function (date) {
	var y  = date.substr(0,4);
	var mo = date.substr(5,2);
	var d  = date.substr(8,2);
	var h  = date.substr(11,2);
	var mi = date.substr(14,2);
	var s  = date.substr(17,2);
	return new Date(y,mo-1,d,h,mi,s);
}

util.date.formatted_date = function (date,format) {
	// pass in a Date object or epoch seconds or a postgres style date string (2005-07-19 10:38:25.211964-04)
	if (typeof(date) == 'string') {
		if (date.match(/:/) || date.match(/-/)) {
			date = util.date.db_date2Date(date);
		} else {
			date = new Date( Number( date + '000' ) );
		}
	} else if (typeof(date) == 'undefined') {
		date = new Date( Number( date + '000' ) );
	} else if (date == null) {
		return '';
	}

	var mm = date.getMonth() + 1; mm = mm.toString(); if (mm.length == 1) mm = '0' +mm;
	var dd = date.getDate().toString(); if (dd.length == 1) dd = '0' +dd;
	var yyyy = date.getFullYear().toString();
	var yy = yyyy.substr(2);
	var H = date.getHours(); H = H.toString(); if (H.length == 1) H = '0' + H;
	var I = date.getHours(); if (I > 12) I -= 12; I = I.toString();
	var M = date.getMinutes(); M = M.toString(); if (M.length == 1) M = '0' + M;
	var sec = date.getSeconds(); sec = sec.toString(); if (sec.length == 1) sec = '0' + sec;

	var s = format;
	if (s == '') { s = '%F %H:%M'; }
	if (typeof date.iso8601Format != 'function') {
		
		var js = JSAN._loadJSFromUrl( urls.isodate_lib );
		try { eval( js ); } catch(E) { alert('Problem loading ISO8601 date extension:' + E); }

	}
	if (typeof date.iso8601Format == 'function') {
		s = s.replace( /%\{iso8601\}/g, date.iso8601Format("YMDHMS") );
	}
	s = s.replace( /%m/g, mm );
	s = s.replace( /%d/g, dd );
	s = s.replace( /%Y/g, yyyy );
	s = s.replace( /%D/g, mm + '/' + dd + '/' + yy );
	s = s.replace( /%F/g, yyyy + '-' + mm + '-' + dd );
	s = s.replace( /%H/g, H );
	s = s.replace( /%I/g, I );
	s = s.replace( /%M/g, M );
	s = s.replace( /%s/g, sec );
	return s;
}

util.date.interval_to_seconds = function ( $interval ) {

        $interval = $interval.replace( /and/, ',' );
        $interval = $interval.replace( /,/, ' ' );

        var $amount = 0;
	var results = $interval.match( /\s*\+?\s*(\d+)\s*(\w{1})\w*\s*/g);  
	for (var i in results) {
		var result = results[i].match( /\s*\+?\s*(\d+)\s*(\w{1})\w*\s*/ );
		if (result[2] == 's') $amount += result[1] ;
		if (result[2] == 'm') $amount += 60 * result[1] ;
		if (result[2] == 'h') $amount += 60 * 60 * result[1] ;
		if (result[2] == 'd') $amount += 60 * 60 * 24 * result[1] ;
		if (result[2] == 'w') $amount += 60 * 60 * 24 * 7 * result[1] ;
		if (result[2] == 'M') $amount += ((60 * 60 * 24 * 365)/12) * result[1] ;
		if (result[2] == 'y') $amount += 60 * 60 * 24 * 365 * result[1] ;
        }
        return $amount;
}

dump('exiting util/date.js\n');
