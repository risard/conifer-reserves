/*
Copyright (C) 2005  Georgia Public Library Service 
Bill Erickson <highfalutin@gmail.com>
Mike Rylander <mrylander@gmail.com>

This program is free software; you can redistribute it and/or
modify it under the terms of the GNU General Public License
as published by the Free Software Foundation; either version 2
of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.
*/

#ifndef UTILS_H
#define UTILS_H

#include <stdio.h>
#include <stdarg.h>
#include <fcntl.h>
#include <unistd.h>
#include <sys/time.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <sys/types.h>
#include <stdlib.h>
#include <string.h>
//#include <sys/timeb.h>

#include "md5.h"

#define OSRF_UTF8_IS_ASCII(_c) 		((_c) <  0x80)
#define OSRF_UTF8_IS_START(_c)		((_c) >= 0xc0 && ((_c) <= 0xfd))
#define OSRF_UTF8_IS_CONTINUATION(_c)		((_c) >= 0x80 && ((_c) <= 0xbf))
#define OSRF_UTF8_IS_CONTINUED(_c) 		((_c) &  0x80)

#define OSRF_UTF8_CONTINUATION_MASK		(0x3f)
#define OSRF_UTF8_ACCUMULATION_SHIFT		6
#define OSRF_UTF8_ACCUMULATE(_o, _n)	(((_o) << OSRF_UTF8_ACCUMULATION_SHIFT) | ((_n) & OSRF_UTF8_CONTINUATION_MASK))

#define OSRF_MALLOC(ptr, size) \
	ptr = (void*) malloc( size ); \
	if( ptr == NULL ) { \
		perror("OSRF_MALLOC(): Out of Memory" );\
		exit(99); \
	} \
	memset( ptr, 0, size ); 


#define OSRF_BUFFER_ADD(gb, data) \
	do {\
		int __tl; \
		if(gb && data) {\
			__tl = strlen(data) + gb->n_used;\
			if( __tl < gb->size ) {\
				strcat(gb->buf, data);\
				gb->n_used = __tl; \
			} else { buffer_add(gb, data); }\
		}\
	} while(0)

#define OSRF_BUFFER_ADD_CHAR(gb, c)\
	do {\
		if(gb) {\
			if(gb->n_used < gb->size - 1)\
				gb->buf[gb->n_used++] = c;\
			else\
				buffer_add_char(gb, c);\
		}\
	}while(0)

	


/* turns a va_list into a string */
#define VA_LIST_TO_STRING(x) \
	unsigned long __len = 0;\
	va_list args; \
	va_list a_copy;\
	va_copy(a_copy, args); \
	va_start(args, x); \
	__len = vsnprintf(NULL, 0, x, args); \
	va_end(args); \
	__len += 2; \
	char _b[__len]; \
	bzero(_b, __len); \
	va_start(a_copy, x); \
	vsnprintf(_b, __len - 1, x, a_copy); \
	va_end(a_copy); \
	char* VA_BUF = _b; \

/* turns a long into a string */
#define LONG_TO_STRING(l) \
	unsigned int __len = snprintf(NULL, 0, "%ld", l) + 2;\
	char __b[__len]; \
	bzero(__b, __len); \
	snprintf(__b, __len - 1, "%ld", l); \
	char* LONGSTR = __b;

#define DOUBLE_TO_STRING(l) \
	unsigned int __len = snprintf(NULL, 0, "%lf", l) + 2; \
	char __b[__len]; \
	bzero(__b, __len); \
	snprintf(__b, __len - 1, "%lf", l); \
	char* DOUBLESTR = __b;

#define LONG_DOUBLE_TO_STRING(l) \
	unsigned int __len = snprintf(NULL, 0, "%Lf", l) + 2; \
	char __b[__len]; \
	bzero(__b, __len); \
	snprintf(__b, __len - 1, "%Lf", l); \
	char* LONGDOUBLESTR = __b;


#define INT_TO_STRING(l) \
	unsigned int __len = snprintf(NULL, 0, "%d", l) + 2; \
	char __b[__len]; \
	bzero(__b, __len); \
	snprintf(__b, __len - 1, "%d", l); \
	char* INTSTR = __b;


/*
#define MD5SUM(s) \
	struct md5_ctx ctx; \
	unsigned char digest[16];\
	MD5_start (&ctx);\
	int i;\
	for ( i=0 ; i != strlen(text) ; i++ ) MD5_feed (&ctx, text[i]);\
	MD5_stop (&ctx, digest);\
	char buf[16];\
	memset(buf,0,16);\
	char final[256];\
	memset(final,0,256);\
	for ( i=0 ; i<16 ; i++ ) {\
		sprintf(buf, "%02x", digest[i]);\
		strcat( final, buf );\
	}\
	char* MD5STR = final;
	*/


	


#define BUFFER_MAX_SIZE 10485760 

/* these are evil and should be condemned 
	! Only use these if you are done with argv[].
	call init_proc_title() first, then call
	set_proc_title. 
	the title is only allowed to be as big as the
	initial process name of the process (full size of argv[]).
	truncation may occurr.
 */
int init_proc_title( int argc, char* argv[] );
int set_proc_title( char* format, ... );


int daemonize();

void* safe_malloc(int size);

// ---------------------------------------------------------------------------------
// Generic growing buffer. Add data all you want
// ---------------------------------------------------------------------------------
struct growing_buffer_struct {
	char *buf;
	int n_used;
	int size;
};
typedef struct growing_buffer_struct growing_buffer;

growing_buffer* buffer_init( int initial_num_bytes);

// XXX This isn't defined in utils.c!! removing for now...
//int buffer_addchar(growing_buffer* gb, char c);

int buffer_add(growing_buffer* gb, char* c);
int buffer_fadd(growing_buffer* gb, const char* format, ... );
int buffer_reset( growing_buffer* gb);
char* buffer_data( growing_buffer* gb);
int buffer_free( growing_buffer* gb );
int buffer_add_char(growing_buffer* gb, char c);

/* returns the size needed to fill in the vsnprintf buffer.  
	* ! this calls va_end on the va_list argument*
	*/
long va_list_size(const char* format, va_list);

/* turns a va list into a string, caller must free the 
	allocated char */
char* va_list_to_string(const char* format, ...);


/* string escape utility method.  escapes unicode embeded characters.
	escapes the usual \n, \t, etc. 
	for example, if you provide a string like so:

	hello,
		you

	you would get back:
	hello,\n\tyou
 
 */
char* uescape( const char* string, int size, int full_escape );

/* utility methods */
int set_fl( int fd, int flags );
int clr_fl( int fd, int flags );



// Utility method
double get_timestamp_millis();


/* returns true if the whole string is a number */
int stringisnum(char* s);

/* reads a file and returns the string version of the file
	user is responsible for freeing the returned char*
	*/
char* file_to_string(const char* filename);



/** 
  Calculates the md5 of the text provided.
  The returned string must be freed by the caller.
  */
char* md5sum( char* text, ... );


/**
  Checks the validity of the file descriptor
  returns -1 if the file descriptor is invalid
  returns 0 if the descriptor is OK
  */
int osrfUtilsCheckFileDescriptor( int fd );

#endif
