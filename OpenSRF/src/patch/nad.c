/*
 * jabberd - Jabber Open Source Server
 * Copyright (c) 2002 Jeremie Miller, Thomas Muldowney,
 *                    Ryan Eatmon, Robert Norris
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 59 Temple Place, Suite 330, Boston, MA02111-1307USA
 */


/** ! ! ! Patched version to fix segfault issue for jabberd-2.0s4 ! ! ! */

/**
 * !!! Things to do (after 2.0)
 *
 * - make nad_find_scoped_namespace() take an element index, and only search
 *   the scope on that element (currently, it searchs all elements from
 *   end to start, which isn't really correct, though it works in most cases
 *
 * - new functions:
 *     * insert one nad (or part thereof) into another nad
 *     * clear a part of a nad (like xmlnode_hide)
 *
 * - audit use of depth array and parent (see j2 bug #792)
 */

#include "util.h"

#ifdef HAVE_EXPAT
#include "expat/expat.h"
#endif

/* define NAD_DEBUG to get pointer tracking - great for weird bugs that you can't reproduce */
#ifdef NAD_DEBUG

static xht _nad_alloc_tracked = NULL;
static xht _nad_free_tracked = NULL;

static void _nad_ptr_check(const char *func, nad_t nad) {
    char loc[24];
    snprintf(loc, sizeof(loc), "%x", (int) nad);

    if(xhash_get(_nad_alloc_tracked, loc) == NULL) {
        fprintf(stderr, ">>> NAD OP %s: 0x%x not allocated!\n", func, (int) nad);
        abort();
    }

    if(xhash_get(_nad_free_tracked, loc) != NULL) {
        fprintf(stderr, ">>> NAD OP %s: 0x%x previously freed!\n", func, (int) nad);
        abort();
    }

    fprintf(stderr, ">>> NAD OP %s: 0x%x\n", func, (int) nad);
}
#else
#define _nad_ptr_check(func,nad)
#endif

#define BLOCKSIZE 1024

/** internal: do and return the math and ensure it gets realloc'd */
int _nad_realloc(void **oblocks, int len)
{
    void *nblocks;
    int nlen;

    /* round up to standard block sizes */
    nlen = (((len-1)/BLOCKSIZE)+1)*BLOCKSIZE;

    /* keep trying till we get it */
    while((nblocks = realloc(*oblocks, nlen)) == NULL) sleep(1);
    *oblocks = nblocks;
    return nlen;
}

/** this is the safety check used to make sure there's always enough mem */
#define NAD_SAFE(blocks, size, len) if((size) > len) len = _nad_realloc((void**)&(blocks),(size));

/** internal: append some cdata and return the index to it */
int _nad_cdata(nad_t nad, const char *cdata, int len)
{
    NAD_SAFE(nad->cdata, nad->ccur + len, nad->clen);

    memcpy(nad->cdata + nad->ccur, cdata, len);
    nad->ccur += len;
    return nad->ccur - len;
}

/** internal: create a new attr on any given elem */
int _nad_attr(nad_t nad, int elem, int ns, const char *name, const char *val, int vallen)
{
    int attr;

    /* make sure there's mem for us */
    NAD_SAFE(nad->attrs, (nad->acur + 1) * sizeof(struct nad_attr_st), nad->alen);

    attr = nad->acur;
    nad->acur++;
    nad->attrs[attr].next = nad->elems[elem].attr;
    nad->elems[elem].attr = attr;
    nad->attrs[attr].lname = strlen(name);
    nad->attrs[attr].iname = _nad_cdata(nad,name,nad->attrs[attr].lname);
    if(vallen > 0)
        nad->attrs[attr].lval = vallen;
    else
        nad->attrs[attr].lval = strlen(val);
    nad->attrs[attr].ival = _nad_cdata(nad,val,nad->attrs[attr].lval);    
    nad->attrs[attr].my_ns = ns;

    return attr;
}

/** create a new cache, simple pointer to a list of nads */
nad_cache_t nad_cache_new(void)
{
    nad_cache_t cache;
    while((cache = malloc(sizeof(nad_cache_t))) == NULL) sleep(1);
    *cache = NULL;

#ifdef NAD_DEBUG
    if(_nad_alloc_tracked == NULL) _nad_alloc_tracked = xhash_new(501);
    if(_nad_free_tracked == NULL) _nad_free_tracked = xhash_new(501);
#endif
    
    return cache;
}


/** free the cache and any nads in it */
void nad_cache_free(nad_cache_t cache)
{
    nad_t cur;
    while((cur = *cache) != NULL)
    {
        *cache = cur->next;
        free(cur->elems);
        free(cur->attrs);
        free(cur->nss);
        free(cur->cdata);
        free(cur->depths);
        free(cur);
    }
    free(cache);
}

/** get the next nad from the cache, or create some */
nad_t nad_new(nad_cache_t cache)
{
    nad_t nad;

#ifndef NAD_DEBUG
    /* If cache==NULL, then this NAD is not in a cache */

    if ((cache!=NULL) && (*cache != NULL))
    {
        nad = *cache;
        *cache = nad->next;
        nad->ccur = nad->ecur = nad->acur = nad->ncur = 0;
        nad->scope = -1;
        nad->cache = cache;
        nad->next = NULL;
        return nad;
    }
#endif

    while((nad = malloc(sizeof(struct nad_st))) == NULL) sleep(1);
    memset(nad,0,sizeof(struct nad_st));

    nad->scope = -1;
    nad->cache = cache;

#ifdef NAD_DEBUG
    {
    char loc[24];
    snprintf(loc, sizeof(loc), "%x", (int) nad);
    xhash_put(_nad_alloc_tracked, pstrdup(xhash_pool(_nad_alloc_tracked), loc), (void *) 1);
    }
    _nad_ptr_check(__func__, nad);
#endif

    return nad;
}

nad_t nad_copy(nad_t nad)
{
    nad_t copy;

    _nad_ptr_check(__func__, nad);

    if(nad == NULL) return NULL;

    /* create a new nad not participating in a cache */
    copy = nad_new(NULL);

    /* if it's not large enough, make bigger */
    NAD_SAFE(copy->elems, nad->elen, copy->elen);
    NAD_SAFE(copy->attrs, nad->alen, copy->alen);
    NAD_SAFE(copy->nss, nad->nlen, copy->nlen);
    NAD_SAFE(copy->cdata, nad->clen, copy->clen);

    /* copy all data */
    memcpy(copy->elems, nad->elems, nad->elen);
    memcpy(copy->attrs, nad->attrs, nad->alen);
    memcpy(copy->nss, nad->nss, nad->nlen);
    memcpy(copy->cdata, nad->cdata, nad->clen);

    /* sync data */
    copy->ecur = nad->ecur;
    copy->acur = nad->acur;
    copy->ncur = nad->ncur;
    copy->ccur = nad->ccur;

    copy->scope = nad->scope;

    return copy;
}

/** free nad, or plug nad back in the cache */
void nad_free(nad_t nad)
{
    if(nad == NULL) return;

#ifdef NAD_DEBUG
    _nad_ptr_check(__func__, nad);
    {
    char loc[24];
    snprintf(loc, sizeof(loc), "%x", (int) nad);
    xhash_zap(_nad_alloc_tracked, loc);
    xhash_put(_nad_free_tracked, pstrdup(xhash_pool(_nad_free_tracked), loc), (void *) nad);
    }
#else
    /* If nad->cache != NULL, then put back into cache, otherwise this nad is not in a cache */

    if (nad->cache != NULL) {
       nad->next = *(nad->cache);
       *(nad->cache) = nad;
       return;
    } 
#endif

    /* Free nad */
    free(nad->elems);
    free(nad->attrs);
    free(nad->cdata);
    free(nad->nss);
    free(nad->depths);
}

/** locate the next elem at a given depth with an optional matching name */
int nad_find_elem(nad_t nad, int elem, int ns, const char *name, int depth)
{
    int my_ns;
    int lname = 0;

    _nad_ptr_check(__func__, nad);

    /* make sure there are valid args */
    if(elem >= nad->ecur || name == NULL) return -1;

    /* set up args for searching */
    depth = nad->elems[elem].depth + depth;
    if(name != NULL) lname = strlen(name);

    /* search */
    for(elem++;elem < nad->ecur;elem++)
    {
        /* if we hit one with a depth less than ours, then we don't have the
         * same parent anymore, bail */
        if(nad->elems[elem].depth < depth)
            return -1;

        if(nad->elems[elem].depth == depth && (lname <= 0 || (lname == nad->elems[elem].lname && strncmp(name,nad->cdata + nad->elems[elem].iname, lname) == 0)) &&
          (ns < 0 || ((my_ns = nad->elems[elem].my_ns) >= 0 && NAD_NURI_L(nad, ns) == NAD_NURI_L(nad, my_ns) && strncmp(NAD_NURI(nad, ns), NAD_NURI(nad, my_ns), NAD_NURI_L(nad, ns)) == 0)))
            return elem;
    }

    return -1;
}

/** get a matching attr on this elem, both name and optional val */
int nad_find_attr(nad_t nad, int elem, int ns, const char *name, const char *val)
{
    int attr, my_ns;
    int lname, lval = 0;

    _nad_ptr_check(__func__, nad);

    /* make sure there are valid args */
    if(elem >= nad->ecur || name == NULL) return -1;

    attr = nad->elems[elem].attr;
    lname = strlen(name);
    if(val != NULL) lval = strlen(val);

    while(attr >= 0)
    {
        /* hefty, match name and if a val, also match that */
        if(lname == nad->attrs[attr].lname && strncmp(name,nad->cdata + nad->attrs[attr].iname, lname) == 0 && 
          (lval <= 0 || (lval == nad->attrs[attr].lval && strncmp(val,nad->cdata + nad->attrs[attr].ival, lval) == 0)) &&
          (ns < 0 || ((my_ns = nad->attrs[attr].my_ns) >= 0 && NAD_NURI_L(nad, ns) == NAD_NURI_L(nad, my_ns) && strncmp(NAD_NURI(nad, ns), NAD_NURI(nad, my_ns), NAD_NURI_L(nad, ns)) == 0)))
            return attr;
        attr = nad->attrs[attr].next;
    }
    return -1;
}

/** get a matching ns on this elem, both uri and optional prefix */
int nad_find_namespace(nad_t nad, int elem, const char *uri, const char *prefix)
{
    int check, ns;

    _nad_ptr_check(__func__, nad);

    if(uri == NULL)
        return -1;

    /* work backwards through our parents, looking for our namespace on each one.
     * if we find it, link it. if not, the namespace is undeclared - for now, just drop it */
    check = elem;
    while(check >= 0)
    {
        ns = nad->elems[check].ns;
        while(ns >= 0)
        {
            if(strlen(uri) == NAD_NURI_L(nad, ns) && strncmp(uri, NAD_NURI(nad, ns), NAD_NURI_L(nad, ns)) == 0 && (prefix == NULL || (nad->nss[ns].iprefix >= 0 && strlen(prefix) == NAD_NPREFIX_L(nad, ns) && strncmp(prefix, NAD_NPREFIX(nad, ns), NAD_NPREFIX_L(nad, ns)) == 0)))
                return ns;
            ns = nad->nss[ns].next;
        }
        check = nad->elems[check].parent;
    }

    return -1;
}

/** find a namespace in scope */
int nad_find_scoped_namespace(nad_t nad, const char *uri, const char *prefix)
{
    int ns;

    _nad_ptr_check(__func__, nad);

    if(uri == NULL)
        return -1;

    for(ns = 0; ns < nad->ncur; ns++)
    {
        if(strlen(uri) == NAD_NURI_L(nad, ns) && strncmp(uri, NAD_NURI(nad, ns), NAD_NURI_L(nad, ns)) == 0 &&
           (prefix == NULL ||
             (nad->nss[ns].iprefix >= 0 &&
              strlen(prefix) == NAD_NPREFIX_L(nad, ns) && strncmp(prefix, NAD_NPREFIX(nad, ns), NAD_NPREFIX_L(nad, ns)) == 0)))
            return ns;
    }

    return -1;
}

/** create, update, or zap any matching attr on this elem */
void nad_set_attr(nad_t nad, int elem, int ns, const char *name, const char *val, int vallen)
{
    int attr;

    _nad_ptr_check(__func__, nad);

    /* find one to replace first */
    if((attr = nad_find_attr(nad, elem, ns, name, NULL)) < 0)
    {
        /* only create new if there's a value to store */
        if(val != NULL)
            _nad_attr(nad, elem, ns, name, val, vallen);
        return;
    }

    /* got matching, update value or zap */
    if(val == NULL)
    {
        nad->attrs[attr].lval = nad->attrs[attr].lname = 0;
    }else{
        if(vallen > 0)
            nad->attrs[attr].lval = vallen;
        else
            nad->attrs[attr].lval = strlen(val);
        nad->attrs[attr].ival = _nad_cdata(nad,val,nad->attrs[attr].lval);
    }

}

/** shove in a new child elem after the given one */
int nad_insert_elem(nad_t nad, int parent, int ns, const char *name, const char *cdata)
{
    int elem = parent + 1;

    _nad_ptr_check(__func__, nad);

    NAD_SAFE(nad->elems, (nad->ecur + 1) * sizeof(struct nad_elem_st), nad->elen);

    /* relocate all the rest of the elems (unless we're at the end already) */
    if(nad->ecur != elem)
        memmove(&nad->elems[elem + 1], &nad->elems[elem], (nad->ecur - elem) * sizeof(struct nad_elem_st));
    nad->ecur++;

    /* set up req'd parts of new elem */
    nad->elems[elem].parent = parent;
    nad->elems[elem].lname = strlen(name);
    nad->elems[elem].iname = _nad_cdata(nad,name,nad->elems[elem].lname);
    nad->elems[elem].attr = -1;
    nad->elems[elem].ns = nad->scope; nad->scope = -1;
    nad->elems[elem].itail = nad->elems[elem].ltail = 0;
    nad->elems[elem].my_ns = ns;

    /* add cdata if given */
    if(cdata != NULL)
    {
        nad->elems[elem].lcdata = strlen(cdata);
        nad->elems[elem].icdata = _nad_cdata(nad,cdata,nad->elems[elem].lcdata);
    }else{
        nad->elems[elem].icdata = nad->elems[elem].lcdata = 0;
    }

    /* parent/child */
    nad->elems[elem].depth = nad->elems[parent].depth + 1;

    return elem;
}

/** wrap an element with another element */
void nad_wrap_elem(nad_t nad, int elem, int ns, const char *name)
{
    int cur;

    _nad_ptr_check(__func__, nad);

    if(elem >= nad->ecur) return;

    NAD_SAFE(nad->elems, (nad->ecur + 1) * sizeof(struct nad_elem_st), nad->elen);

    /* relocate all the rest of the elems after us */
    memmove(&nad->elems[elem + 1], &nad->elems[elem], (nad->ecur - elem) * sizeof(struct nad_elem_st));
    nad->ecur++;

    /* set up req'd parts of new elem */
    nad->elems[elem].lname = strlen(name);
    nad->elems[elem].iname = _nad_cdata(nad,name,nad->elems[elem].lname);
    nad->elems[elem].attr = -1;
    nad->elems[elem].ns = nad->scope; nad->scope = -1;
    nad->elems[elem].itail = nad->elems[elem].ltail = 0;
    nad->elems[elem].icdata = nad->elems[elem].lcdata = 0;
    nad->elems[elem].my_ns = ns;

    /* raise the bar on all the children */
    nad->elems[elem+1].depth++;
    for(cur = elem + 2; cur < nad->ecur && nad->elems[cur].depth > nad->elems[elem].depth; cur++) nad->elems[cur].depth++;

    /* relink the parents */
    nad->elems[elem].parent = nad->elems[elem + 1].parent;
    nad->elems[elem + 1].parent = elem;
}

/** create a new elem on the list */
int nad_append_elem(nad_t nad, int ns, const char *name, int depth)
{
    int elem;

    _nad_ptr_check(__func__, nad);

    /* make sure there's mem for us */
    NAD_SAFE(nad->elems, (nad->ecur + 1) * sizeof(struct nad_elem_st), nad->elen);

    elem = nad->ecur;
    nad->ecur++;
    nad->elems[elem].lname = strlen(name);
    nad->elems[elem].iname = _nad_cdata(nad,name,nad->elems[elem].lname);
    nad->elems[elem].icdata = nad->elems[elem].lcdata = 0;
    nad->elems[elem].itail = nad->elems[elem].ltail = 0;
    nad->elems[elem].attr = -1;
    nad->elems[elem].ns = nad->scope; nad->scope = -1;
    nad->elems[elem].depth = depth;
    nad->elems[elem].my_ns = ns;

    /* make sure there's mem in the depth array, then track us */
    NAD_SAFE(nad->depths, (depth + 1) * sizeof(int), nad->dlen);
    nad->depths[depth] = elem;

    /* our parent is the previous guy in the depth array */
    if(depth <= 0)
        nad->elems[elem].parent = -1;
    else
        nad->elems[elem].parent = nad->depths[depth - 1];

    return elem;
}

/** attach new attr to the last elem */
int nad_append_attr(nad_t nad, int ns, const char *name, const char *val)
{
    _nad_ptr_check(__func__, nad);

    return _nad_attr(nad, nad->ecur - 1, ns, name, val, 0);
}

/** append new cdata to the last elem */
void nad_append_cdata(nad_t nad, const char *cdata, int len, int depth)
{
    int elem = nad->ecur - 1;

    _nad_ptr_check(__func__, nad);

    /* make sure this cdata is the child of the last elem to append */
    if(nad->elems[elem].depth == depth - 1)
    {
        if(nad->elems[elem].icdata == 0)
            nad->elems[elem].icdata = nad->ccur;
        _nad_cdata(nad,cdata,len);
        nad->elems[elem].lcdata += len;
        return;
    }

    /* otherwise, pin the cdata on the tail of the last element at this depth */
    elem = nad->depths[depth];
    if(nad->elems[elem].itail == 0)
        nad->elems[elem].itail = nad->ccur;
    _nad_cdata(nad,cdata,len);
    nad->elems[elem].ltail += len;
}

/** bring a new namespace into scope */
int nad_add_namespace(nad_t nad, const char *uri, const char *prefix)
{
    int ns;

    _nad_ptr_check(__func__, nad);

    /* only add it if its not already in scope */
    ns = nad_find_scoped_namespace(nad, uri, NULL);
    if(ns >= 0)
        return ns;

    /* make sure there's mem for us */
    NAD_SAFE(nad->nss, (nad->ncur + 1) * sizeof(struct nad_ns_st), nad->nlen);

    ns = nad->ncur;
    nad->ncur++;
    nad->nss[ns].next = nad->scope;
    nad->scope = ns;

    nad->nss[ns].luri = strlen(uri);
    nad->nss[ns].iuri = _nad_cdata(nad, uri, nad->nss[ns].luri);
    if(prefix != NULL)
    {
        nad->nss[ns].lprefix = strlen(prefix);
        nad->nss[ns].iprefix = _nad_cdata(nad, prefix, nad->nss[ns].lprefix);    
    }
    else
        nad->nss[ns].iprefix = -1;

    return ns;
}

/** declare a namespace on an already-existing element */
int nad_append_namespace(nad_t nad, int elem, const char *uri, const char *prefix) {
    int ns;

    _nad_ptr_check(__func__, nad);

    /* see if its already scoped on this element */
    ns = nad_find_namespace(nad, elem, uri, NULL);
    if(ns >= 0)
        return ns;

    /* make some room */
    NAD_SAFE(nad->nss, (nad->ncur + 1) * sizeof(struct nad_ns_st), nad->nlen);

    ns = nad->ncur;
    nad->ncur++;
    nad->nss[ns].next = nad->elems[elem].ns;
    nad->elems[elem].ns = ns;

    nad->nss[ns].luri = strlen(uri);
    nad->nss[ns].iuri = _nad_cdata(nad, uri, nad->nss[ns].luri);
    if(prefix != NULL)
    {
        nad->nss[ns].lprefix = strlen(prefix);
        nad->nss[ns].iprefix = _nad_cdata(nad, prefix, nad->nss[ns].lprefix);    
    }
    else
        nad->nss[ns].iprefix = -1;

    return ns;
}

void _nad_escape(nad_t nad, int data, int len, int flag)
{
    char *c;
    int ic;

    if(len <= 0) return;

    /* first, if told, find and escape ' */
    while(flag >= 3 && (c = memchr(nad->cdata + data,'\'',len)) != NULL)
    {
        /* get offset */
        ic = c - nad->cdata;

        /* cute, eh?  handle other data before this normally */
        _nad_escape(nad, data, ic - data, 2);

        /* ensure enough space, and add our escaped &apos; */
        NAD_SAFE(nad->cdata, nad->ccur + 6, nad->clen);
        memcpy(nad->cdata + nad->ccur, "&apos;", 6);
        nad->ccur += 6;

        /* just update and loop for more */
        len -= (ic+1) - data;
        data = ic+1;
    }

    /* next look for < */
    while(flag >= 2 && (c = memchr(nad->cdata + data,'<',len)) != NULL)
    {
        ic = c - nad->cdata;
        _nad_escape(nad, data, ic - data, 1);

        /* ensure enough space, and add our escaped &lt; */
        NAD_SAFE(nad->cdata, nad->ccur + 4, nad->clen);
        memcpy(nad->cdata + nad->ccur, "&lt;", 4);
        nad->ccur += 4;

        /* just update and loop for more */
        len -= (ic+1) - data;
        data = ic+1;
    }

    /* check for ]]>, we need to escape the > */
	/* WE DID THIS  (add the '0' as the first test to the while loop 
		because the loops dies 3 lines in... (and we don't reall
		need this)) ...
	 */
    while( 0 && flag >= 1 && (c = memchr(nad->cdata + data, '>', len)) != NULL)
    {
        ic = c - nad->cdata;

        _nad_escape(nad, data, ic - data, 0);

        /* check for the sequence */

        if( c >= nad->cdata + 2 && c[-1] == ']' && c[-2] == ']')
        {
            /* ensure enough space, and add our escaped &gt; */
            NAD_SAFE(nad->cdata, nad->ccur + 4, nad->clen);
            memcpy(nad->cdata + nad->ccur, "&gt;", 4);
            nad->ccur += 4;
        }

        /* otherwise, just plug the > in as-is */
        else
        {
            NAD_SAFE(nad->cdata, nad->ccur + 1, nad->clen);
            *(nad->cdata + nad->ccur) = '>';
            nad->ccur++;
        }

        /* just update and loop for more */
        len -= (ic+1) - data;
        data = ic+1;
    }

    /* if & is found, escape it */
    while((c = memchr(nad->cdata + data,'&',len)) != NULL)
    {
        ic = c - nad->cdata;

        /* ensure enough space */
        NAD_SAFE(nad->cdata, nad->ccur + 5 + (ic - data), nad->clen);

        /* handle normal data */
        memcpy(nad->cdata + nad->ccur, nad->cdata + data, (ic - data));
        nad->ccur += (ic - data);

        /* append escaped &lt; */
        memcpy(nad->cdata + nad->ccur, "&amp;", 5);
        nad->ccur += 5;

        /* just update and loop for more */
        len -= (ic+1) - data;
        data = ic+1;
    }

    /* nothing exciting, just append normal cdata */
    NAD_SAFE(nad->cdata, nad->ccur + len, nad->clen);
    memcpy(nad->cdata + nad->ccur, nad->cdata + data, len);
    nad->ccur += len;
}

/** internal recursive printing function */
int _nad_lp0(nad_t nad, int elem)
{
    int attr;
    int ndepth;
    int ns;

    /* there's a lot of code in here, but don't let that scare you, it's just duplication in order to be a bit more efficient cpu-wise */

    /* this whole thing is in a big loop for processing siblings */
    while(elem != nad->ecur)
    {

    /* make enough space for the opening element */
    ns = nad->elems[elem].my_ns;
    if(ns >= 0 && nad->nss[ns].iprefix >= 0)
    {
        NAD_SAFE(nad->cdata, nad->ccur + nad->elems[elem].lname + nad->nss[ns].lprefix + 2, nad->clen);
    } else {
        NAD_SAFE(nad->cdata, nad->ccur + nad->elems[elem].lname + 1, nad->clen);
    }

    /* opening tag */
    *(nad->cdata + nad->ccur++) = '<';

    /* add the prefix if necessary */
    if(ns >= 0 && nad->nss[ns].iprefix >= 0)
    {
        memcpy(nad->cdata + nad->ccur, nad->cdata + nad->nss[ns].iprefix, nad->nss[ns].lprefix);
        nad->ccur += nad->nss[ns].lprefix;
        *(nad->cdata + nad->ccur++) = ':';
    }
    
    /* copy in the name */
    memcpy(nad->cdata + nad->ccur, nad->cdata + nad->elems[elem].iname, nad->elems[elem].lname);
    nad->ccur += nad->elems[elem].lname;

    /* add the namespaces */
    for(ns = nad->elems[elem].ns; ns >= 0; ns = nad->nss[ns].next)
    {
        /* never explicitly declare the implicit xml namespace */
        if(nad->nss[ns].luri == strlen(uri_XML) && strncmp(uri_XML, nad->cdata + nad->nss[ns].iuri, nad->nss[ns].luri) == 0)
            continue;

        /* make space */
        if(nad->nss[ns].iprefix >= 0)
        {
            NAD_SAFE(nad->cdata, nad->ccur + nad->nss[ns].luri + nad->nss[ns].lprefix + 10, nad->clen);
        } else {
            NAD_SAFE(nad->cdata, nad->ccur + nad->nss[ns].luri + 9, nad->clen);
        }

        /* start */
        memcpy(nad->cdata + nad->ccur, " xmlns", 6);
        nad->ccur += 6;

        /* prefix if necessary */
        if(nad->nss[ns].iprefix >= 0)
        {
            *(nad->cdata + nad->ccur++) = ':';
            memcpy(nad->cdata + nad->ccur, nad->cdata + nad->nss[ns].iprefix, nad->nss[ns].lprefix);
            nad->ccur += nad->nss[ns].lprefix;
        }

        *(nad->cdata + nad->ccur++) = '=';
        *(nad->cdata + nad->ccur++) = '\'';

        /* uri */
        memcpy(nad->cdata + nad->ccur, nad->cdata + nad->nss[ns].iuri, nad->nss[ns].luri);
        nad->ccur += nad->nss[ns].luri;

        *(nad->cdata + nad->ccur++) = '\'';
    }

    for(attr = nad->elems[elem].attr; attr >= 0; attr = nad->attrs[attr].next)
    {
        if(nad->attrs[attr].lname <= 0) continue;

        /* make enough space for the wrapper part */
        ns = nad->attrs[attr].my_ns;
        if(ns >= 0 && nad->nss[ns].iprefix >= 0)
        {
            NAD_SAFE(nad->cdata, nad->ccur + nad->attrs[attr].lname + nad->nss[ns].lprefix + 4, nad->clen);
        } else {
            NAD_SAFE(nad->cdata, nad->ccur + nad->attrs[attr].lname + 3, nad->clen);
        }

        *(nad->cdata + nad->ccur++) = ' ';

        /* add the prefix if necessary */
        if(ns >= 0 && nad->nss[ns].iprefix >= 0)
        {
            memcpy(nad->cdata + nad->ccur, nad->cdata + nad->nss[ns].iprefix, nad->nss[ns].lprefix);
            nad->ccur += nad->nss[ns].lprefix;
            *(nad->cdata + nad->ccur++) = ':';
        }
    
        /* copy in the name parts */
        memcpy(nad->cdata + nad->ccur, nad->cdata + nad->attrs[attr].iname, nad->attrs[attr].lname);
        nad->ccur += nad->attrs[attr].lname;
        *(nad->cdata + nad->ccur++) = '=';
        *(nad->cdata + nad->ccur++) = '\'';

        /* copy in the escaped value */
        _nad_escape(nad, nad->attrs[attr].ival, nad->attrs[attr].lval, 3);

        /* make enough space for the closing quote and add it */
        NAD_SAFE(nad->cdata, nad->ccur + 1, nad->clen);
        *(nad->cdata + nad->ccur++) = '\'';
    }

    /* figure out what's next */
    if(elem+1 == nad->ecur)
        ndepth = -1;
    else
        ndepth = nad->elems[elem+1].depth;

    /* handle based on if there are children, update nelem after done */
    if(ndepth <= nad->elems[elem].depth)
    {
        /* make sure there's enough for what we could need */
        NAD_SAFE(nad->cdata, nad->ccur + 2, nad->clen);
        if(nad->elems[elem].lcdata == 0)
        {
            memcpy(nad->cdata + nad->ccur, "/>", 2);
            nad->ccur += 2;
        }else{
            *(nad->cdata + nad->ccur++) = '>';

            /* copy in escaped cdata */
            _nad_escape(nad, nad->elems[elem].icdata, nad->elems[elem].lcdata,2);

            /* make room */
            ns = nad->elems[elem].my_ns;
            if(ns >= 0 && nad->nss[ns].iprefix >= 0)
            {
                NAD_SAFE(nad->cdata, nad->ccur + 4 + nad->elems[elem].lname + nad->nss[ns].lprefix, nad->clen);
            } else {
                NAD_SAFE(nad->cdata, nad->ccur + 3 + nad->elems[elem].lname, nad->clen);
            }

            /* close tag */
            memcpy(nad->cdata + nad->ccur, "</", 2);
            nad->ccur += 2;
    
            /* add the prefix if necessary */
            if(ns >= 0 && nad->nss[ns].iprefix >= 0)
            {
                memcpy(nad->cdata + nad->ccur, nad->cdata + nad->nss[ns].iprefix, nad->nss[ns].lprefix);
                nad->ccur += nad->nss[ns].lprefix;
                *(nad->cdata + nad->ccur++) = ':';
            }
    
            memcpy(nad->cdata + nad->ccur, nad->cdata + nad->elems[elem].iname, nad->elems[elem].lname);
            nad->ccur += nad->elems[elem].lname;
            *(nad->cdata + nad->ccur++) = '>';
        }

        /* always try to append the tail */
        _nad_escape(nad, nad->elems[elem].itail, nad->elems[elem].ltail,2);

        /* if no siblings either, bail */
        if(ndepth < nad->elems[elem].depth)
            return elem+1;

        /* next sibling */
        elem++;
    }else{
        int nelem;
        /* process any children */

        /* close ourself and append any cdata first */
        NAD_SAFE(nad->cdata, nad->ccur + 1, nad->clen);
        *(nad->cdata + nad->ccur++) = '>';
        _nad_escape(nad, nad->elems[elem].icdata, nad->elems[elem].lcdata,2);

        /* process children */
        nelem = _nad_lp0(nad,elem+1);

        /* close and tail up */
        ns = nad->elems[elem].my_ns;
        if(ns >= 0 && nad->nss[ns].iprefix >= 0)
        {
            NAD_SAFE(nad->cdata, nad->ccur + 4 + nad->elems[elem].lname + nad->nss[ns].lprefix, nad->clen);
        } else {
            NAD_SAFE(nad->cdata, nad->ccur + 3 + nad->elems[elem].lname, nad->clen);
        }
        memcpy(nad->cdata + nad->ccur, "</", 2);
        nad->ccur += 2;
        if(ns >= 0 && nad->nss[ns].iprefix >= 0)
        {
            memcpy(nad->cdata + nad->ccur, nad->cdata + nad->nss[ns].iprefix, nad->nss[ns].lprefix);
            nad->ccur += nad->nss[ns].lprefix;
            *(nad->cdata + nad->ccur++) = ':';
        }
        memcpy(nad->cdata + nad->ccur, nad->cdata + nad->elems[elem].iname, nad->elems[elem].lname);
        nad->ccur += nad->elems[elem].lname;
        *(nad->cdata + nad->ccur++) = '>';
        _nad_escape(nad, nad->elems[elem].itail, nad->elems[elem].ltail,2);

        /* if the next element is not our sibling, we're done */
        if(nelem < nad->ecur && nad->elems[nelem].depth < nad->elems[elem].depth)
            return nelem;

        /* for next sibling in while loop */
        elem = nelem;
    }

    /* here's the end of that big while loop */
    }

    return elem;
}

void nad_print(nad_t nad, int elem, char **xml, int *len)
{
    int ixml = nad->ccur;

    _nad_ptr_check(__func__, nad);

    _nad_lp0(nad,elem);
    *len = nad->ccur - ixml;
    *xml = nad->cdata + ixml;
}

/**
 * nads serialize to a buffer of this form:
 *
 * [buflen][ecur][acur][ncur][ccur][elems][attrs][nss][cdata]
 *
 * nothing is done with endianness or word length, so the nad must be
 * serialized and deserialized on the same platform
 *
 * buflen is not actually used by deserialize(), but is provided as a
 * convenience to the application so it knows how many bytes to read before
 * passing them in to deserialize()
 *
 * the depths array is not stored, so after deserialization
 * nad_append_elem() and nad_append_cdata() will not work. this is rarely
 * a problem
 */

void nad_serialize(nad_t nad, char **buf, int *len) {
    char *pos;

    _nad_ptr_check(__func__, nad);

    *len = sizeof(int) * 5 + /* 4 ints in nad_t, plus one for len */
           sizeof(struct nad_elem_st) * nad->ecur +
           sizeof(struct nad_attr_st) * nad->acur +
           sizeof(struct nad_ns_st) * nad->ncur +
           sizeof(char) * nad->ccur;

    *buf = (char *) malloc(*len);
    pos = *buf;

    * (int *) pos = *len;       pos += sizeof(int);
    * (int *) pos = nad->ecur;  pos += sizeof(int);
    * (int *) pos = nad->acur;  pos += sizeof(int);
    * (int *) pos = nad->ncur;  pos += sizeof(int);
    * (int *) pos = nad->ccur;  pos += sizeof(int);

    memcpy(pos, nad->elems, sizeof(struct nad_elem_st) * nad->ecur);    pos += sizeof(struct nad_elem_st) * nad->ecur;
    memcpy(pos, nad->attrs, sizeof(struct nad_attr_st) * nad->acur);    pos += sizeof(struct nad_attr_st) * nad->acur;
    memcpy(pos, nad->nss, sizeof(struct nad_ns_st) * nad->ncur);        pos += sizeof(struct nad_ns_st) * nad->ncur;
    memcpy(pos, nad->cdata, sizeof(char) * nad->ccur);
}

nad_t nad_deserialize(nad_cache_t cache, const char *buf) {
    nad_t nad = nad_new(cache);
    const char *pos = buf + sizeof(int);  /* skip len */

    _nad_ptr_check(__func__, nad);

    nad->ecur = * (int *) pos; pos += sizeof(int);
    nad->acur = * (int *) pos; pos += sizeof(int);
    nad->ncur = * (int *) pos; pos += sizeof(int);
    nad->ccur = * (int *) pos; pos += sizeof(int);
    nad->elen = nad->ecur;
    nad->alen = nad->acur;
    nad->nlen = nad->ncur;
    nad->clen = nad->ccur;

    if(nad->ecur > 0)
    {
        nad->elems = (struct nad_elem_st *) malloc(sizeof(struct nad_elem_st) * nad->ecur);
        memcpy(nad->elems, pos, sizeof(struct nad_elem_st) * nad->ecur);
        pos += sizeof(struct nad_elem_st) * nad->ecur;
    }

    if(nad->acur > 0)
    {
        nad->attrs = (struct nad_attr_st *) malloc(sizeof(struct nad_attr_st) * nad->acur);
        memcpy(nad->attrs, pos, sizeof(struct nad_attr_st) * nad->acur);
        pos += sizeof(struct nad_attr_st) * nad->acur;
    }

    if(nad->ncur > 0)
    {
        nad->nss = (struct nad_ns_st *) malloc(sizeof(struct nad_ns_st) * nad->ncur);
        memcpy(nad->nss, pos, sizeof(struct nad_ns_st) * nad->ncur);
        pos += sizeof(struct nad_ns_st) * nad->ncur;
    }

    if(nad->ccur > 0)
    {
        nad->cdata = (char *) malloc(sizeof(char) * nad->ccur);
        memcpy(nad->cdata, pos, sizeof(char) * nad->ccur);
    }

    return nad;
}

#ifdef HAVE_EXPAT

/** parse a buffer into a nad */

struct build_data {
    nad_t               nad;
    int                 depth;
};

static void _nad_parse_element_start(void *arg, const char *name, const char **atts) {
    struct build_data *bd = (struct build_data *) arg;
    char buf[1024];
    char *uri, *elem, *prefix;
    const char **attr;
    int ns;

    /* make a copy */
    strncpy(buf, name, 1024);
    buf[1023] = '\0';

    /* expat gives us:
         prefixed namespaced elem: uri|elem|prefix
          default namespaced elem: uri|elem
               un-namespaced elem: elem
     */

    /* extract all the bits */
    uri = buf;
    elem = strchr(uri, '|');
    if(elem != NULL) {
        *elem = '\0';
        elem++;
        prefix = strchr(elem, '|');
        if(prefix != NULL) {
            *prefix = '\0';
            prefix++;
        }
        ns = nad_add_namespace(bd->nad, uri, prefix);
    } else {
        /* un-namespaced, just take it as-is */
        uri = NULL;
        elem = buf;
        prefix = NULL;
        ns = -1;
    }

    /* add it */
    nad_append_elem(bd->nad, ns, elem, bd->depth);

    /* now the attributes, one at a time */
    attr = atts;
    while(attr[0] != NULL) {

        /* make a copy */
        strncpy(buf, attr[0], 1024);
        buf[1023] = '\0';

        /* extract all the bits */
        uri = buf;
        elem = strchr(uri, '|');
        if(elem != NULL) {
            *elem = '\0';
            elem++;
            prefix = strchr(elem, '|');
            if(prefix != NULL) {
                *prefix = '\0';
                prefix++;
            }
            ns = nad_add_namespace(bd->nad, uri, prefix);
        } else {
            /* un-namespaced, just take it as-is */
            uri = NULL;
            elem = buf;
            prefix = NULL;
            ns = -1;
        }

        /* add it */
        nad_append_attr(bd->nad, ns, elem, (char *) attr[1]);

        attr += 2;
    }

    bd->depth++;
}

static void _nad_parse_element_end(void *arg, const char *name) {
    struct build_data *bd = (struct build_data *) arg;

    bd->depth--;
}

static void _nad_parse_cdata(void *arg, const char *str, int len) {
    struct build_data *bd = (struct build_data *) arg;

    /* go */
    nad_append_cdata(bd->nad, (char *) str, len, bd->depth);
}

static void _nad_parse_namespace_start(void *arg, const char *prefix, const char *uri) {
    struct build_data *bd = (struct build_data *) arg;

    nad_add_namespace(bd->nad, (char *) uri, (char *) prefix);
}

nad_t nad_parse(nad_cache_t cache, const char *buf, int len) {
    struct build_data bd;
    XML_Parser p;

    if(len == 0)
        len = strlen(buf);

    p = XML_ParserCreateNS(NULL, '|');
    if(p == NULL)
        return NULL;

    bd.nad = nad_new(cache);
    bd.depth = 0;

    XML_SetUserData(p, (void *) &bd);
    XML_SetElementHandler(p, _nad_parse_element_start, _nad_parse_element_end);
    XML_SetCharacterDataHandler(p, _nad_parse_cdata);
    XML_SetStartNamespaceDeclHandler(p, _nad_parse_namespace_start);

    if(!XML_Parse(p, buf, len, 1)) {
        XML_ParserFree(p);
        nad_free(bd.nad);
        return NULL;
    }

    XML_ParserFree(p);

    if(bd.depth != 0)
        return NULL;

    return bd.nad;
}

#endif
