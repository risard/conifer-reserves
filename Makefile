# vim:noet:ts=4
# --------------------------------------------------------------------
# Copyright (C) 2005  Georgia Public Library Service 
# Bill Erickson <highfalutin@gmail.com>
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
# --------------------------------------------------------------------

SHELL=/bin/bash

all: build

verbose:	oldconfig
	@./install.sh build verbose

config:	
	@./config.sh

default_config:	
	@./config.sh default

oldconfig:	install.conf

install.conf:	
	@./config.sh

build:	oldconfig
	@./install.sh build

install:
	@./install.sh install

clean:
	@./install.sh clean
	
test:
	@./install.sh test
