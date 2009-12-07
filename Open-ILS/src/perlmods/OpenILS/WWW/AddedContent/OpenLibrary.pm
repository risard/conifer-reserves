# ---------------------------------------------------------------
# Copyright (C) 2009 David Christensen <david.a.christensen@gmail.com>
# Copyright (C) 2009 Dan Scott <dscott@laurentian.ca>
#
# This program is free software; you can redistribute it and/or
# modify it under the terms of the GNU General Public License
# as published by the Free Software Foundation; either version 2
# of the License, or (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
# ---------------------------------------------------------------

package OpenILS::WWW::AddedContent::OpenLibrary;
use strict; use warnings;
use OpenSRF::Utils::Logger qw/$logger/;
use OpenSRF::Utils::SettingsParser;
use OpenILS::WWW::AddedContent;
use OpenSRF::Utils::JSON;
use OpenSRF::EX qw/:try/;
use Data::Dumper;

# Edit the <added_content> section of /openils/conf/opensrf.xml
# Change <module> to:
#   <module>OpenILS::WWW::AddedContent::OpenLibrary</module>

my $AC = 'OpenILS::WWW::AddedContent';

# These URLs are always the same for OpenLibrary, so there's no advantage to
# pulling from opensrf.xml; we hardcode them here
my $base_url = 'http://openlibrary.org/api/books?details=true&bibkeys=ISBN:';
my $cover_base_url = 'http://covers.openlibrary.org/b/isbn/';

sub new {
    my( $class, $args ) = @_;
    $class = ref $class || $class;
    return bless($args, $class);
}

# --------------------------------------------------------------------------
sub jacket_small {
    my( $self, $key ) = @_;
    return $self->send_img(
        $self->fetch_cover_response('-S.jpg', $key));
}

sub jacket_medium {
    my( $self, $key ) = @_;
    return $self->send_img(
        $self->fetch_cover_response('-M.jpg', $key));

}
sub jacket_large {
    my( $self, $key ) = @_;
    return $self->send_img(
        $self->fetch_cover_response('-L.jpg', $key));
}

# --------------------------------------------------------------------------

=head1

OpenLibrary returns a JSON hash of zero or more book responses matching our
request. Each response may contain a table of contents within the details
section of the response.

For now, we check only the first response in the hash for a table of
contents, and if we find a table of contents, we transform it to a simple
HTML table.

=cut

sub toc_html {
    my( $self, $key ) = @_;
    my $book_details_json = $self->fetch_response($key)->content();


    # Trim the "var _OlBookInfo = " declaration that makes this
    # invalid JSON
    $book_details_json =~ s/^.+?({.*?});$/$1/s;

    $logger->debug("$key: " . $book_details_json);

    my $toc_html;
    
    my $book_details = OpenSRF::Utils::JSON->JSON2perl($book_details_json);
    my $book_key = (keys %$book_details)[0];

    # We didn't find a matching book; short-circuit our response
    if (!$book_key) {
        $logger->debug("$key: no found book");
        return 0;
    }

    my $toc_json = $book_details->{$book_key}->{details}->{table_of_contents};

    # No table of contents is available for this book; short-circuit
    if (!$toc_json or !scalar(@$toc_json)) {
        $logger->debug("$key: no TOC");
        return 0;
    }

    # Build a basic HTML table containing the section number, section title,
    # and page number. Some rows may not contain section numbers, we should
    # protect against empty page numbers too.
    foreach my $chapter (@$toc_json) {
	my $label = $chapter->{label};
        if ($label) {
            $label .= '. ';
        }
        my $title = $chapter->{title} || '';
        my $page_number = $chapter->{pagenum} || '';
 
        $toc_html .= '<tr>' .
            "<td style='text-align: right;'>$label</td>" .
            "<td style='text-align: left; padding-right: 2em;'>$title</td>" .
            "<td style='text-align: right;'>$page_number</td>" .
            "</tr>\n";
    }

    $logger->debug("$key: $toc_html");
    $self->send_html("<table>$toc_html</table>");
}

sub toc_json {
    my( $self, $key ) = @_;
    my $toc = $self->send_json(
        $self->fetch_response($key)
    );
}

sub send_img {
    my($self, $response) = @_;
    return { 
        content_type => $response->header('Content-type'),
        content => $response->content, 
        binary => 1 
    };
}

sub send_json {
    my( $self, $content ) = @_;
    return 0 unless $content;

    return { content_type => 'text/plain', content => $content };
}

sub send_html {
    my( $self, $content ) = @_;
    return 0 unless $content;

    # Hide anything that might contain a link since it will be broken
    my $HTML = <<"    HTML";
        <div>
            <style type='text/css'>
                div.ac input, div.ac a[href],div.ac img, div.ac button { display: none; visibility: hidden }
            </style>
            <div class='ac'>
                $content
            </div>
        </div>
    HTML

    return { content_type => 'text/html', content => $HTML };
}

# returns the HTTP response object from the URL fetch
sub fetch_response {
    my( $self, $key ) = @_;
    my $url = $base_url . "$key";
    my $response = $AC->get_url($url);
    return $response;
}

# returns the HTTP response object from the URL fetch
sub fetch_cover_response {
    my( $self, $size, $key ) = @_;
    my $url = $cover_base_url . "$key$size";
    return $AC->get_url($url);
}


1;
