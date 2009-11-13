dump('entering util.list.js\n');

if (typeof main == 'undefined') main = {};
util.list = function (id) {

    this.node = document.getElementById(id);

    this.row_count = { 'total' : 0, 'fleshed' : 0 };

    this.unique_row_counter = 0;

    if (!this.node) throw('Could not find element ' + id);
    switch(this.node.nodeName) {
        case 'listbox' : 
        case 'tree' : break;
        case 'richlistbox' :
            throw(this.node.nodeName + ' not yet supported'); break;
        default: throw(this.node.nodeName + ' not supported'); break;
    }

    JSAN.use('util.error'); this.error = new util.error();

    return this;
};

util.list.prototype = {

    'init' : function (params) {

        var obj = this;

        JSAN.use('util.widgets');

        if (typeof params.map_row_to_column == 'function') obj.map_row_to_column = params.map_row_to_column;
        if (typeof params.map_row_to_columns == 'function') {
            obj.map_row_to_columns = params.map_row_to_columns;
        } else {
            obj.map_row_to_columns = obj.std_map_row_to_columns();
        }
        if (typeof params.retrieve_row == 'function') obj.retrieve_row = params.retrieve_row;

        obj.prebuilt = false;
        if (typeof params.prebuilt != 'undefined') obj.prebuilt = params.prebuilt;

        if (typeof params.columns == 'undefined') throw('util.list.init: No columns');
        obj.columns = [];
        for (var i = 0; i < params.columns.length; i++) {
            if (typeof params.columns[i] == 'object') {
                obj.columns.push( params.columns[i] );
            } else {
                var cols = obj.fm_columns( params.columns[i] );
                for (var j = 0; j < cols.length; j++) {
                    obj.columns.push( cols[j] );
                }
            }
        }

        switch(obj.node.nodeName) {
            case 'tree' : obj._init_tree(params); break;
            case 'listbox' : obj._init_listbox(params); break;
            default: throw('NYI: Need ._init() for ' + obj.node.nodeName); break;
        }
    },

    '_init_tree' : function (params) {
        var obj = this;
        if (this.prebuilt) {
        
            this.treechildren = this.node.lastChild;    
        
        } else {
            var treecols = document.createElement('treecols');
            this.node.appendChild(treecols);
            this.treecols = treecols;

            for (var i = 0; i < this.columns.length; i++) {
                var treecol = document.createElement('treecol');
                for (var j in this.columns[i]) {
                    treecol.setAttribute(j,this.columns[i][j]);
                }
                treecols.appendChild(treecol);
                if (this.columns[i].type == 'checkbox') {
                    treecol.addEventListener(
                        'click',
                        function(ev) {
                            setTimeout(
                                function() {
                                    var toggle = ev.target.getAttribute('toggleAll') || 'on';
                                    if (toggle == 'off') toggle = 'on'; else toggle = 'off';
                                    ev.target.setAttribute('toggleAll',toggle);
                                    obj._toggle_checkbox_column(ev.target,toggle);
                                }, 0
                            );
                        },
                        false
                    );
                } else {
                    treecol.addEventListener(
                        'click', 
                        function(ev) {
                            function do_it() {
                                var sortDir = ev.target.getAttribute('sortDir') || 'desc';
                                if (sortDir == 'desc') sortDir = 'asc'; else sortDir = 'desc';
                                ev.target.setAttribute('sortDir',sortDir);
                                obj._sort_tree(ev.target,sortDir);
                            }

                            if (obj.row_count.total != obj.row_count.fleshed && (obj.row_count.total - obj.row_count.fleshed) > 50) {
                                var r = window.confirm(document.getElementById('offlineStrings').getFormattedString('list.row_fetch_warning',[obj.row_count.fleshed,obj.row_count.total]));

                                if (r) {
                                    setTimeout( do_it, 0 );
                                }
                            } else {
                                    setTimeout( do_it, 0 );
                            }
                        },
                        false
                    );
                }
                var splitter = document.createElement('splitter');
                splitter.setAttribute('class','tree-splitter');
                treecols.appendChild(splitter);
            }

            var treechildren = document.createElement('treechildren');
            this.node.appendChild(treechildren);
            this.treechildren = treechildren;
        }
        if (typeof params.on_sort == 'function') {
            this.on_sort = params.on_sort;
        }
        if (typeof params.on_checkbox_toggle == 'function') {
            this.on_checkbox_toggle = params.on_checkbox_toggle;
        }
        this.node.addEventListener(
            'select',
            function(ev) {
                if (typeof params.on_select == 'function') {
                    params.on_select(ev);
                }
                var x = document.getElementById(obj.node.id + '_clipfield');
                if (x) {
                    var sel = obj.retrieve_selection();
                    x.setAttribute('disabled', sel.length == 0);
                }
            },
            false
        );
        if (typeof params.on_click == 'function') {
            this.node.addEventListener(
                'click',
                params.on_click,
                false
            );
        }
        /*
        this.node.addEventListener(
            'mousemove',
            function(ev) { obj.detect_visible(); },
            false
        );
        */
        this.node.addEventListener(
            'keypress',
            function(ev) { obj.auto_retrieve(); },
            false
        );
        this.node.addEventListener(
            'click',
            function(ev) { obj.auto_retrieve(); },
            false
        );
        window.addEventListener(
            'resize',
            function(ev) { obj.auto_retrieve(); },
            false
        );
        /* FIXME -- find events on scrollbar to trigger this */
        obj.detect_visible_polling();    
        /*
        var scrollbar = document.getAnonymousNodes( document.getAnonymousNodes(this.node)[1] )[1];
        var slider = document.getAnonymousNodes( scrollbar )[2];
        alert('scrollbar = ' + scrollbar.nodeName + ' grippy = ' + slider.nodeName);
        scrollbar.addEventListener('click',function(){alert('sb click');},false);
        scrollbar.addEventListener('command',function(){alert('sb command');},false);
        scrollbar.addEventListener('scroll',function(){alert('sb scroll');},false);
        slider.addEventListener('click',function(){alert('slider click');},false);
        slider.addEventListener('command',function(){alert('slider command');},false);
        slider.addEventListener('scroll',function(){alert('slider scroll');},false);
        */
        this.node.addEventListener('scroll',function(){ obj.auto_retrieve(); },false);

        this.restores_columns(params);
    },

    '_init_listbox' : function (params) {
        if (this.prebuilt) {
        } else {
            var listhead = document.createElement('listhead');
            this.node.appendChild(listhead);

            var listcols = document.createElement('listcols');
            this.node.appendChild(listcols);

            for (var i = 0; i < this.columns.length; i++) {
                var listheader = document.createElement('listheader');
                listhead.appendChild(listheader);
                var listcol = document.createElement('listcol');
                listcols.appendChild(listcol);
                for (var j in this.columns[i]) {
                    listheader.setAttribute(j,this.columns[i][j]);
                    listcol.setAttribute(j,this.columns[i][j]);
                };
            }
        }
    },

    'save_columns' : function (params) {
        var obj = this;
        switch (this.node.nodeName) {
            case 'tree' : this._save_columns_tree(params); break;
            default: throw('NYI: Need .save_columns() for ' + this.node.nodeName); break;
        }
    },

    '_save_columns_tree' : function (params) {
        var obj = this;
        try {
            var id = obj.node.getAttribute('id'); if (!id) {
                alert("FIXME: The columns for this list cannot be saved because the list has no id.");
                return;
            }
            var my_cols = {};
            var nl = obj.node.getElementsByTagName('treecol');
            for (var i = 0; i < nl.length; i++) {
                var col = nl[i];
                var col_id = col.getAttribute('id');
                if (!col_id) {
                    alert('FIXME: A column in this list does not have an id and cannot be saved');
                    continue;
                }
                var col_hidden = col.getAttribute('hidden'); 
                var col_width = col.getAttribute('width'); 
                var col_ordinal = col.getAttribute('ordinal'); 
                my_cols[ col_id ] = { 'hidden' : col_hidden, 'width' : col_width, 'ordinal' : col_ordinal };
            }
            netscape.security.PrivilegeManager.enablePrivilege('UniversalXPConnect');
            JSAN.use('util.file'); var file = new util.file('tree_columns_for_'+window.escape(id));
            file.set_object(my_cols);
            file.close();
            alert(document.getElementById('offlineStrings').getString('list.columns_saved'));
        } catch(E) {
            obj.error.standard_unexpected_error_alert('_save_columns_tree',E);
        }
    },

    'restores_columns' : function (params) {
        var obj = this;
        switch (this.node.nodeName) {
            case 'tree' : this._restores_columns_tree(params); break;
            default: throw('NYI: Need .restores_columns() for ' + this.node.nodeName); break;
        }
    },

    '_restores_columns_tree' : function (params) {
        var obj = this;
        try {
            var id = obj.node.getAttribute('id'); if (!id) {
                alert("FIXME: The columns for this list cannot be restored because the list has no id.");
                return;
            }

            netscape.security.PrivilegeManager.enablePrivilege('UniversalXPConnect');
            JSAN.use('util.file'); var file = new util.file('tree_columns_for_'+window.escape(id));
            if (file._file.exists()) {
                var my_cols = file.get_object(); file.close();
                var nl = obj.node.getElementsByTagName('treecol');
                for (var i = 0; i < nl.length; i++) {
                    var col = nl[i];
                    var col_id = col.getAttribute('id');
                    if (!col_id) {
                        alert('FIXME: A column in this list does not have an id and cannot be saved');
                        continue;
                    }
                    if (typeof my_cols[col_id] != 'undefined') {
                        col.setAttribute('hidden',my_cols[col_id].hidden); 
                        col.setAttribute('width',my_cols[col_id].width); 
                        col.setAttribute('ordinal',my_cols[col_id].ordinal); 
                    } else {
                        obj.error.sdump('D_ERROR','WARNING: Column ' + col_id + ' did not have a saved state.');
                    }
                }
            }
        } catch(E) {
            obj.error.standard_unexpected_error_alert('_restore_columns_tree',E);
        }
    },

    'clear' : function (params) {
        var obj = this;
        switch (this.node.nodeName) {
            case 'tree' : this._clear_tree(params); break;
            case 'listbox' : this._clear_listbox(params); break;
            default: throw('NYI: Need .clear() for ' + this.node.nodeName); break;
        }
        this.error.sdump('D_LIST','Clearing list ' + this.node.getAttribute('id') + '\n');
        this.row_count.total = 0;
        this.row_count.fleshed = 0;
        setTimeout( function() { obj.exec_on_all_fleshed(); }, 0 );
    },

    '_clear_tree' : function(params) {
        var obj = this;
        if (obj.error.sdump_levels.D_LIST_DUMP_ON_CLEAR) {
            obj.error.sdump('D_LIST_DUMP_ON_CLEAR',obj.dump());
        }
        if (obj.error.sdump_levels.D_LIST_DUMP_WITH_KEYS_ON_CLEAR) {
            obj.error.sdump('D_LIST_DUMP_WITH_KEYS_ON_CLEAR',obj.dump_with_keys());
        }
        while (obj.treechildren.lastChild) obj.treechildren.removeChild( obj.treechildren.lastChild );
    },

    '_clear_listbox' : function(params) {
        var obj = this;
        var items = [];
        var nl = this.node.getElementsByTagName('listitem');
        for (var i = 0; i < nl.length; i++) {
            items.push( nl[i] );
        }
        for (var i = 0; i < items.length; i++) {
            this.node.removeChild(items[i]);
        }
    },

    'append' : function (params) {
        var rnode;
        var obj = this;
        switch (this.node.nodeName) {
            case 'tree' : rparams = this._append_to_tree(params); break;
            case 'listbox' : rparams = this._append_to_listbox(params); break;
            default: throw('NYI: Need .append() for ' + this.node.nodeName); break;
        }
        if (rparams && params.attributes) {
            for (var i in params.attributes) {
                rparams.my_node.setAttribute(i,params.attributes[i]);
            }
        }
        this.row_count.total++;
        if (this.row_count.fleshed == this.row_count.total) {
            setTimeout( function() { obj.exec_on_all_fleshed(); }, 0 );
        }
        rparams.my_node.setAttribute('unique_row_counter',obj.unique_row_counter);
        rparams.unique_row_counter = obj.unique_row_counter++;
        if (typeof params.on_append == 'function') {
            params.on_append(rparams);
        }
        return rparams;
    },
    
    'refresh_row' : function (params) {
        var rnode;
        var obj = this;
        switch (this.node.nodeName) {
            case 'tree' : rparams = this._refresh_row_in_tree(params); break;
            default: throw('NYI: Need .refresh_row() for ' + this.node.nodeName); break;
        }
        if (rparams && params.attributes) {
            for (var i in params.attributes) {
                rparams.my_node.setAttribute(i,params.attributes[i]);
            }
        }
        this.row_count.fleshed--;
        return rparams;
    },


    '_append_to_tree' : function (params) {

        var obj = this;

        if (typeof params.row == 'undefined') throw('util.list.append: Object must contain a row');

        var s = ('util.list.append: params = ' + (params) + '\n');

        var treechildren_node = this.treechildren;

        if (params.node && params.node.nodeName == 'treeitem') {
            params.node.setAttribute('container','true'); /* params.node.setAttribute('open','true'); */
            if (params.node.lastChild.nodeName == 'treechildren') {
                treechildren_node = params.node.lastChild;
            } else {
                treechildren_node = document.createElement('treechildren');
                params.node.appendChild(treechildren_node);
            }
        }

        var treeitem = document.createElement('treeitem');
        treeitem.setAttribute('retrieve_id',params.retrieve_id);
        if (typeof params.to_bottom != 'undefined') {
            treechildren_node.appendChild( treeitem );
            if (typeof params.no_auto_select == 'undefined') {
                if (!obj.auto_select_pending) {
                    obj.auto_select_pending = true;
                    setTimeout(function() {
                        dump('auto-selecting\n');
                        var idx = Number(obj.node.view.rowCount)-1;
                        try { obj.node.view.selection.select(idx); } catch(E) { obj.error.sdump('D_WARN','tree auto select: ' + E + '\n'); }
                        try { if (typeof params.on_select == 'function') params.on_select(); } catch(E) { obj.error.sdump('D_WARN','tree auto select, on_select: ' + E + '\n'); }
                        obj.auto_select_pending = false;
                        try { util.widgets.dispatch('flesh',obj.node.contentView.getItemAtIndex(idx).firstChild); } catch(E) { obj.error.sdump('D_WARN','tree auto select, flesh: ' + E + '\n'); }
                    }, 1000);
                }
            }
        } else {
            if (treechildren_node.firstChild) {
                treechildren_node.insertBefore( treeitem, treechildren_node.firstChild );
            } else {
                treechildren_node.appendChild( treeitem );
            }
            if (typeof params.no_auto_select == 'undefined') {
                if (!obj.auto_select_pending) {
                    obj.auto_select_pending = true;
                    setTimeout(function() {
                        try { obj.node.view.selection.select(0); } catch(E) { obj.error.sdump('D_WARN','tree auto select: ' + E + '\n'); }
                        try { if (typeof params.on_select == 'function') params.on_select(); } catch(E) { obj.error.sdump('D_WARN','tree auto select, on_select: ' + E + '\n'); }
                        obj.auto_select_pending = false;
                        try { util.widgets.dispatch('flesh',obj.node.contentView.getItemAtIndex(0).firstChild); } catch(E) { obj.error.sdump('D_WARN','tree auto select, flesh: ' + E + '\n'); }
                    }, 1000);
                }
            }
        }
        var treerow = document.createElement('treerow');
        treeitem.appendChild( treerow );
        treerow.setAttribute('retrieve_id',params.retrieve_id);
        if (params.row_properties) treerow.setAttribute('properties',params.row_properties);

        s += ('tree = ' + this.node + '  treechildren = ' + treechildren_node + '\n');
        s += ('treeitem = ' + treeitem + '  treerow = ' + treerow + '\n');

        if (typeof params.retrieve_row == 'function' || typeof this.retrieve_row == 'function') {

            obj.put_retrieving_label(treerow);
            treerow.addEventListener(
                'flesh',
                function() {

                    if (treerow.getAttribute('retrieved') == 'true') return; /* already running */

                    treerow.setAttribute('retrieved','true');

                    //dump('fleshing = ' + params.retrieve_id + '\n');

                    function inc_fleshed() {
                        if (treerow.getAttribute('fleshed') == 'true') return; /* already fleshed */
                        treerow.setAttribute('fleshed','true');
                        obj.row_count.fleshed++;
                        if (obj.row_count.fleshed >= obj.row_count.total) {
                            setTimeout( function() { obj.exec_on_all_fleshed(); }, 0 );
                        }
                    }

                    params.row_node = treeitem;
                    params.on_retrieve = function(p) {
                        try {
                            p.row = params.row;
                            obj._map_row_to_treecell(p,treerow);
                            inc_fleshed();
                            var idx = obj.node.contentView.getIndexOfItem( params.row_node );
                            dump('idx = ' + idx + '\n');
                            // if current row is selected, send another select event to re-sync data that the client code fetches on selects
                            if ( obj.node.view.selection.isSelected( idx ) ) {
                                dump('dispatching select event for on_retrieve for idx = ' + idx + '\n');
                                util.widgets.dispatch('select',obj.node);
                            }
                        } catch(E) {
                            // Let's not alert on this for now.  Getting contentView has no properties in record buckets under certain conditions
                            dump('fixme2: ' + E + '\n');
                        }
                    }

                    if (typeof params.retrieve_row == 'function') {

                        params.retrieve_row( params );

                    } else if (typeof obj.retrieve_row == 'function') {

                            obj.retrieve_row( params );

                    } else {
                    
                            inc_fleshed();
                    }
                },
                false
            );
            /*
            setTimeout(
                function() {
                    util.widgets.dispatch('flesh',treerow);
                }, 0
            );
            */
        } else {
            obj.put_retrieving_label(treerow);
            treerow.addEventListener(
                'flesh',
                function() {
                    //dump('fleshing anon\n');
                    if (treerow.getAttribute('fleshed') == 'true') return; /* already fleshed */
                    obj._map_row_to_treecell(params,treerow);
                    treerow.setAttribute('retrieved','true');
                    treerow.setAttribute('fleshed','true');
                    obj.row_count.fleshed++;
                    if (obj.row_count.fleshed >= obj.row_count.total) {
                        setTimeout( function() { obj.exec_on_all_fleshed(); }, 0 );
                    }
                },
                false
            );
            /*
            setTimeout(
                function() {
                    util.widgets.dispatch('flesh',treerow);
                }, 0
            );
            */
        }
        this.error.sdump('D_LIST',s);

            try {

                if (obj.trim_list && obj.row_count.total >= obj.trim_list) {
                    // Remove oldest row
                    //if (typeof params.to_bottom != 'undefined') 
                    if (typeof params.to_top == 'undefined') {
                        if (typeof params.on_delete == 'function') { params.on_delete( treechildren_node.firstChild.getAttribute('unique_row_counter') ); }
                        treechildren_node.removeChild( treechildren_node.firstChild );
                    } else {
                        if (typeof params.on_delete == 'function') { params.on_delete( treechildren_node.lastChild.getAttribute('unique_row_counter') ); }
                        treechildren_node.removeChild( treechildren_node.lastChild );
                    }
                }
            } catch(E) {
            }

        setTimeout( function() { obj.auto_retrieve(); }, 0 );

        params.my_node = treeitem;
        return params;
    },

    '_refresh_row_in_tree' : function (params) {

        var obj = this;

        if (typeof params.row == 'undefined') throw('util.list.refresh_row: Object must contain a row');
        if (typeof params.my_node == 'undefined') throw('util.list.refresh_row: Object must contain a my_node');
        if (params.my_node.nodeName != 'treeitem') throw('util.list.refresh_rwo: my_node must be a treeitem');

        var s = ('util.list.refresh_row: params = ' + (params) + '\n');

        var treeitem = params.my_node;
        treeitem.setAttribute('retrieve_id',params.retrieve_id);
        if (typeof params.to_bottom != 'undefined') {
            if (typeof params.no_auto_select == 'undefined') {
                if (!obj.auto_select_pending) {
                    obj.auto_select_pending = true;
                    setTimeout(function() {
                        dump('auto-selecting\n');
                        var idx = Number(obj.node.view.rowCount)-1;
                        try { obj.node.view.selection.select(idx); } catch(E) { obj.error.sdump('D_WARN','tree auto select: ' + E + '\n'); }
                        try { if (typeof params.on_select == 'function') params.on_select(); } catch(E) { obj.error.sdump('D_WARN','tree auto select, on_select: ' + E + '\n'); }
                        obj.auto_select_pending = false;
                        try { util.widgets.dispatch('flesh',obj.node.contentView.getItemAtIndex(idx).firstChild); } catch(E) { obj.error.sdump('D_WARN','tree auto select, flesh: ' + E + '\n'); }
                    }, 1000);
                }
            }
        }
        var delete_me = [];
        for (var i in treeitem.childNodes) if (treeitem.childNodes[i].nodeName == 'treerow') delete_me.push(treeitem.childNodes[i]);
        for (var i = 0; i < delete_me.length; i++) treeitem.removeChild(delete_me[i]);
        var treerow = document.createElement('treerow');
        treeitem.appendChild( treerow );
        treerow.setAttribute('retrieve_id',params.retrieve_id);
        if (params.row_properties) treerow.setAttribute('properties',params.row_properties);

        s += ('tree = ' + this.node.nodeName + '\n');
        s += ('treeitem = ' + treeitem.nodeName + '  treerow = ' + treerow.nodeName + '\n');

        if (typeof params.retrieve_row == 'function' || typeof this.retrieve_row == 'function') {

            s += 'found a retrieve_row function\n';

            obj.put_retrieving_label(treerow);
            treerow.addEventListener(
                'flesh',
                function() {

                    if (treerow.getAttribute('retrieved') == 'true') return; /* already running */

                    treerow.setAttribute('retrieved','true');

                    //dump('fleshing = ' + params.retrieve_id + '\n');

                    function inc_fleshed() {
                        if (treerow.getAttribute('fleshed') == 'true') return; /* already fleshed */
                        treerow.setAttribute('fleshed','true');
                        obj.row_count.fleshed++;
                        if (obj.row_count.fleshed >= obj.row_count.total) {
                            setTimeout( function() { obj.exec_on_all_fleshed(); }, 0 );
                        }
                    }

                    params.row_node = treeitem;
                    params.on_retrieve = function(p) {
                        try {
                            p.row = params.row;
                            obj._map_row_to_treecell(p,treerow);
                            inc_fleshed();
                            var idx = obj.node.contentView.getIndexOfItem( params.row_node );
                            dump('idx = ' + idx + '\n');
                            // if current row is selected, send another select event to re-sync data that the client code fetches on selects
                            if ( obj.node.view.selection.isSelected( idx ) ) {
                                dump('dispatching select event for on_retrieve for idx = ' + idx + '\n');
                                util.widgets.dispatch('select',obj.node);
                            }
                        } catch(E) {
                            // Let's not alert on this for now.  Getting contentView has no properties in record buckets under certain conditions
                            dump('fixme2: ' + E + '\n');
                        }
                    }

                    if (typeof params.retrieve_row == 'function') {

                        params.retrieve_row( params );

                    } else if (typeof obj.retrieve_row == 'function') {

                            obj.retrieve_row( params );

                    } else {
                    
                            inc_fleshed();
                    }
                },
                false
            );
            /*
            setTimeout(
                function() {
                    util.widgets.dispatch('flesh',treerow);
                }, 0
            );
            */
        } else {

            s += 'did not find a retrieve_row function\n';

            obj.put_retrieving_label(treerow);
            treerow.addEventListener(
                'flesh',
                function() {
                    //dump('fleshing anon\n');
                    if (treerow.getAttribute('fleshed') == 'true') return; /* already fleshed */
                    obj._map_row_to_treecell(params,treerow);
                    treerow.setAttribute('retrieved','true');
                    treerow.setAttribute('fleshed','true');
                    obj.row_count.fleshed++;
                    if (obj.row_count.fleshed >= obj.row_count.total) {
                        setTimeout( function() { obj.exec_on_all_fleshed(); }, 0 );
                    }
                },
                false
            );
            /*
            setTimeout(
                function() {
                    util.widgets.dispatch('flesh',treerow);
                }, 0
            );
            */
        }

            try {

                if (obj.trim_list && obj.row_count.total >= obj.trim_list) {
                    // Remove oldest row
                    //if (typeof params.to_bottom != 'undefined') 
                    if (typeof params.to_top == 'undefined') {
                        treechildren_node.removeChild( treechildren_node.firstChild );
                    } else {
                        treechildren_node.removeChild( treechildren_node.lastChild );
                    }
                }
            } catch(E) {
            }

        setTimeout( function() { obj.auto_retrieve(); }, 0 );

        JSAN.use('util.widgets'); util.widgets.dispatch('select',obj.node);

        this.error.sdump('D_LIST',s);

        return params;
    },

    'put_retrieving_label' : function(treerow) {
        var obj = this;
        try {
            /*
            var cols_idx = 0;
            dump('put_retrieving_label.  columns = ' + js2JSON(obj.columns) + '\n');
            while( obj.columns[cols_idx] && obj.columns[cols_idx].hidden && obj.columns[cols_idx].hidden == 'true') {
                dump('\t' + cols_idx);
                var treecell = document.createElement('treecell');
                treerow.appendChild(treecell);
                cols_idx++;
            }
            */
            for (var i = 0; i < obj.columns.length; i++) {
            var treecell = document.createElement('treecell'); treecell.setAttribute('label',document.getElementById('offlineStrings').getString('list.row_retrieving'));
            treerow.appendChild(treecell);
            }
            /*
            dump('\t' + cols_idx + '\n');
            */
        } catch(E) {
            alert(E);
        }
    },

    'detect_visible' : function() {
        var obj = this;
        try {
            //dump('detect_visible  obj.node = ' + obj.node + '\n');
            /* FIXME - this is a hack.. if the implementation of tree changes, this could break */
            try {
                /*var s = ''; var A = document.getAnonymousNodes(obj.node);
                for (var i in A) {
                    var B = A[i];
                    s += '\t' + (typeof B.nodeName != 'undefined' ? B.nodeName : B ) + '\n'; 
                    if (typeof B.childNodes != 'undefined') for (var j = 0; j < B.childNodes.length; j++) {
                        var C = B.childNodes[j];
                        s += '\t\t' + C.nodeName + '\n';
                    }
                }
                obj.error.sdump('D_XULRUNNER','document.getAnonymousNodes(' + obj.node.nodeName + ') = \n' + s + '\n');*/
                var scrollbar = document.getAnonymousNodes(obj.node)[2].firstChild;
                var curpos = scrollbar.getAttribute('curpos');
                var maxpos = scrollbar.getAttribute('maxpos');
                //alert('curpos = ' + curpos + ' maxpos = ' + maxpos + ' obj.curpos = ' + obj.curpos + ' obj.maxpos = ' + obj.maxpos + '\n');
                if ((curpos != obj.curpos) || (maxpos != obj.maxpos)) {
                    if ( obj.auto_retrieve() > 0 ) {
                        obj.curpos = curpos; obj.maxpos = maxpos;
                    }
                }
            } catch(E) {
                obj.error.sdump('D_XULRUNNER', 'List implementation changed? ' + E);
            }
        } catch(E) { obj.error.sdump('D_ERROR',E); }
    },

    'detect_visible_polling' : function() {
        try {
            //alert('detect_visible_polling');
            var obj = this;
            obj.detect_visible();
            setTimeout(function() { try { obj.detect_visible_polling(); } catch(E) { alert(E); } },2000);
        } catch(E) {
            alert(E);
        }
    },


    'auto_retrieve' : function(params) {
        var obj = this;
        switch (this.node.nodeName) {
            case 'tree' : obj._auto_retrieve_tree(params); break;
            default: throw('NYI: Need .auto_retrieve() for ' + obj.node.nodeName); break;
        }
    },

    '_auto_retrieve_tree' : function (params) {
        var obj = this;
        if (!obj.auto_retrieve_in_progress) {
            obj.auto_retrieve_in_progress = true;
            setTimeout(
                function() {
                    try {
                            //alert('auto_retrieve\n');
                            var count = 0;
                            var startpos = obj.node.treeBoxObject.getFirstVisibleRow();
                            var endpos = obj.node.treeBoxObject.getLastVisibleRow();
                            if (startpos > endpos) endpos = obj.node.treeBoxObject.getPageLength();
                            //dump('startpos = ' + startpos + ' endpos = ' + endpos + '\n');
                            for (var i = startpos; i < endpos + 4; i++) {
                                try {
                                    //dump('trying index ' + i + '\n');
                                    var item = obj.node.contentView.getItemAtIndex(i).firstChild;
                                    if (item && item.getAttribute('retrieved') != 'true' ) {
                                        //dump('\tgot an unfleshed item = ' + item + ' = ' + item.nodeName + '\n');
                                        util.widgets.dispatch('flesh',item); count++;
                                    }
                                } catch(E) {
                                    //dump(i + ' : ' + E + '\n');
                                }
                            }
                            obj.auto_retrieve_in_progress = false;
                            return count;
                    } catch(E) { alert(E); }
                }, 1
            );
        }
    },

    'exec_on_all_fleshed' : function() {
        var obj = this;
        try {
            if (obj.on_all_fleshed) {
                if (typeof obj.on_all_fleshed == 'function') {
                    dump('exec_on_all_fleshed == function\n');
                    setTimeout( 
                        function() { 
                            try { obj.on_all_fleshed(); } catch(E) { obj.error.standard_unexpected_error_alert('_full_retrieve_tree callback',obj.on_all_fleshed); }
                        }, 0 
                    );
                } else if (typeof obj.on_all_fleshed.length != 'undefined') {
                    dump('exec_on_all_fleshed == array\n');
                    setTimeout(
                        function() {
                            try {
                                dump('exec_on_all_fleshed, processing on_all_fleshed array, length = ' + obj.on_all_fleshed.length + '\n');
                                var f = obj.on_all_fleshed.pop();
                                if (typeof f == 'function') { 
                                    try { f(); } catch(E) { obj.error.standard_unexpected_error_alert('_full_retrieve_tree callback',f); } 
                                }
                                if (obj.on_all_fleshed.length > 0) arguments.callee(); 
                            } catch(E) {
                                obj.error.standard_unexpected_error_alert('exec_on_all_fleshed callback error',E);
                            }
                        }, 0
                    ); 
                } else {
                    obj.error.standard_unexpected_error_alert('unexpected on_all_fleshed object: ', obj.on_all_fleshed);
                }
            }
        } catch(E) {
            obj.error.standard_unexpected_error_alert('exec_on_all-fleshed error',E);
        }
    },

    'full_retrieve' : function(params) {
        var obj = this;
        switch (this.node.nodeName) {
            case 'tree' : obj._full_retrieve_tree(params); break;
            default: throw('NYI: Need .full_retrieve() for ' + obj.node.nodeName); break;
        }
    },

    '_full_retrieve_tree' : function(params) {
        var obj = this;
        try {
            if (obj.row_count.fleshed >= obj.row_count.total) {
                dump('Full retrieve... tree seems to be in sync\n' + js2JSON(obj.row_count) + '\n');
                obj.exec_on_all_fleshed();
            } else {
                dump('Full retrieve... syncing tree' + js2JSON(obj.row_count) + '\n');
                JSAN.use('util.widgets');
                var nodes = obj.treechildren.childNodes;
                for (var i = 0; i < nodes.length; i++) {
                    util.widgets.dispatch('flesh',nodes[i].firstChild);
                }
            }
        } catch(E) {
            obj.error.standard_unexpected_error_alert('_full_retrieve_tree',E);
        }
    },

    '_append_to_listbox' : function (params) {

        var obj = this;

        if (typeof params.row == 'undefined') throw('util.list.append: Object must contain a row');

        var s = ('util.list.append: params = ' + (params) + '\n');

        var listitem = document.createElement('listitem');

        s += ('listbox = ' + this.node + '  listitem = ' + listitem + '\n');

        if (typeof params.retrieve_row == 'function' || typeof this.retrieve_row == 'function') {

            setTimeout(
                function() {
                    listitem.setAttribute('retrieve_id',params.retrieve_id);
                    //FIXME//Make async and fire when row is visible in list
                    var row;

                    params.row_node = listitem;
                    params.on_retrieve = function(row) {
                        params.row = row;
                        obj._map_row_to_listcell(params,listitem);
                        obj.node.appendChild( listitem );
                        util.widgets.dispatch('select',obj.node);
                    }

                    if (typeof params.retrieve_row == 'function') {

                        row = params.retrieve_row( params );

                    } else {

                        if (typeof obj.retrieve_row == 'function') {

                            row = obj.retrieve_row( params );

                        }
                    }
                }, 0
            );
        } else {
            this._map_row_to_listcell(params,listitem);
            this.node.appendChild( listitem );
        }

        this.error.sdump('D_LIST',s);
        params.my_node = listitem;
        return params;

    },

    '_map_row_to_treecell' : function(params,treerow) {
        var obj = this;
        var s = '';
        util.widgets.remove_children(treerow);

        if (typeof params.map_row_to_column == 'function' || typeof this.map_row_to_column == 'function') {

            for (var i = 0; i < this.columns.length; i++) {
                var treecell = document.createElement('treecell');
                if ( this.columns[i].editable == false ) { treecell.setAttribute('editable','false'); }
                var label = '';
                if (params.skip_columns && (params.skip_columns.indexOf(i) != -1)) {
                    treecell.setAttribute('label',label);
                    treerow.appendChild( treecell );
                    s += ('treecell = ' + treecell + ' with label = ' + label + '\n');
                    continue;
                }
                if (params.skip_all_columns_except && (params.skip_all_columns_except.indexOf(i) == -1)) {
                    treecell.setAttribute('label',label);
                    treerow.appendChild( treecell );
                    s += ('treecell = ' + treecell + ' with label = ' + label + '\n');
                    continue;
                }
    
                if (typeof params.map_row_to_column == 'function')  {
    
                    label = params.map_row_to_column(params.row,this.columns[i]);
    
                } else if (typeof this.map_row_to_column == 'function') {
    
                    label = this.map_row_to_column(params.row,this.columns[i]);
    
                }
                if (this.columns[i].type == 'checkbox') { treecell.setAttribute('value',label); } else { treecell.setAttribute('label',label ? label : ''); }
                treerow.appendChild( treecell );
                s += ('treecell = ' + treecell + ' with label = ' + label + '\n');
            }
        } else if (typeof params.map_row_to_columns == 'function' || typeof this.map_row_to_columns == 'function') {

            var labels = [];

            if (typeof params.map_row_to_columns == 'function') {

                labels = params.map_row_to_columns(params.row,this.columns);

            } else if (typeof this.map_row_to_columns == 'function') {

                labels = this.map_row_to_columns(params.row,this.columns);

            }
            for (var i = 0; i < labels.length; i++) {
                var treecell = document.createElement('treecell');
                if ( this.columns[i].editable == false ) { treecell.setAttribute('editable','false'); }
                if ( this.columns[i].type == 'checkbox') {
                    treecell.setAttribute('value', labels[i]);
                } else {
                    treecell.setAttribute('label',typeof labels[i] == 'string' || typeof labels[i] == 'number' ? labels[i] : '');
                }
                treerow.appendChild( treecell );
                s += ('treecell = ' + treecell + ' with label = ' + labels[i] + '\n');
            }

        } else {

            throw('No row to column mapping function.');
        }
        this.error.sdump('D_LIST',s);
    },

    '_map_row_to_listcell' : function(params,listitem) {
        var obj = this;
        var s = '';
        for (var i = 0; i < this.columns.length; i++) {
            var value = '';
            if (typeof params.map_row_to_column == 'function')  {

                value = params.map_row_to_column(params.row,this.columns[i]);

            } else {

                if (typeof this.map_row_to_column == 'function') {

                    value = this.map_row_to_column(params.row,this.columns[i]);
                }
            }
            if (typeof value == 'string' || typeof value == 'number') {
                var listcell = document.createElement('listcell');
                listcell.setAttribute('label',value);
                listitem.appendChild(listcell);
                s += ('listcell = ' + listcell + ' with label = ' + value + '\n');
            } else {
                listitem.appendChild(value);
                s += ('listcell = ' + value + ' is really a ' + value.nodeName + '\n');
            }
        }
        this.error.sdump('D_LIST',s);
    },

    'select_all' : function(params) {
        var obj = this;
        switch(this.node.nodeName) {
            case 'tree' : return this._select_all_from_tree(params); break;
            default: throw('NYI: Need ._select_all_from_() for ' + this.node.nodeName); break;
        }
    },

    '_select_all_from_tree' : function(params) {
        var obj = this;
        this.node.view.selection.selectAll();
    },

    'retrieve_selection' : function(params) {
        var obj = this;
        switch(this.node.nodeName) {
            case 'tree' : return this._retrieve_selection_from_tree(params); break;
            default: throw('NYI: Need ._retrieve_selection_from_() for ' + this.node.nodeName); break;
        }
    },

    '_retrieve_selection_from_tree' : function(params) {
        var obj = this;
        var list = [];
        var start = new Object();
        var end = new Object();
        var numRanges = this.node.view.selection.getRangeCount();
        for (var t=0; t<numRanges; t++){
            this.node.view.selection.getRangeAt(t,start,end);
            for (var v=start.value; v<=end.value; v++){
                var i = this.node.contentView.getItemAtIndex(v);
                list.push( i );
            }
        }
        return list;
    },

    'dump' : function(params) {
        var obj = this;
        switch(this.node.nodeName) {
            case 'tree' : return this._dump_tree(params); break;
            default: throw('NYI: Need .dump() for ' + this.node.nodeName); break;
        }
    },

    '_dump_tree' : function(params) {
        var obj = this;
        var dump = [];
        for (var i = 0; i < this.treechildren.childNodes.length; i++) {
            var row = [];
            var treeitem = this.treechildren.childNodes[i];
            var treerow = treeitem.firstChild;
            for (var j = 0; j < treerow.childNodes.length; j++) {
                row.push( treerow.childNodes[j].getAttribute('label') );
            }
            dump.push( row );
        }
        return dump;
    },

    'dump_with_keys' : function(params) {
        var obj = this;
        switch(this.node.nodeName) {
            case 'tree' : return this._dump_tree_with_keys(params); break;
            default: throw('NYI: Need .dump_with_keys() for ' + this.node.nodeName); break;
        }

    },

    '_dump_tree_with_keys' : function(params) {
        var obj = this;
        var dump = [];
        for (var i = 0; i < this.treechildren.childNodes.length; i++) {
            var row = {};
            var treeitem = this.treechildren.childNodes[i];
            var treerow = treeitem.firstChild;
            for (var j = 0; j < treerow.childNodes.length; j++) {
                row[ obj.columns[j].id ] = treerow.childNodes[j].getAttribute('label');
            }
            dump.push( row );
        }
        return dump;
    },

    'dump_csv' : function(params) {
        var obj = this;
        switch(this.node.nodeName) {
            case 'tree' : return this._dump_tree_csv(params); break;
            default: throw('NYI: Need .dump_csv() for ' + this.node.nodeName); break;
        }

    },

    '_dump_tree_csv' : function(params) {
        var obj = this;
        var dump = '';
        for (var j = 0; j < obj.columns.length; j++) {
            if (obj.node.treeBoxObject.columns.getColumnAt(j).element.getAttribute('hidden') == 'true') {
                /* skip */
            } else {
                if (dump) dump += ',';
                dump += '"' + obj.columns[j].label.replace(/"/g, '""') + '"';
            }
        }
        dump += '\r\n';
        for (var i = 0; i < this.treechildren.childNodes.length; i++) {
            var row = '';
            var treeitem = this.treechildren.childNodes[i];
            var treerow = treeitem.firstChild;
            for (var j = 0; j < treerow.childNodes.length; j++) {
                if (obj.node.treeBoxObject.columns.getColumnAt(j).element.getAttribute('hidden') == 'true') {
                    /* skip */
                } else {
                    if (row) row += ',';
                    row += '"' + treerow.childNodes[j].getAttribute('label').replace(/"/g, '""') + '"';
                }
            }
            dump +=  row + '\r\n';
        }
        return dump;
    },

    'dump_csv_to_clipboard' : function(params) {
        var obj = this;
        if (typeof params == 'undefined') params = {};
        if (params.no_full_retrieve) {
            copy_to_clipboard( obj.dump_csv( params ) );
        } else {
            obj.wrap_in_full_retrieve( function() { copy_to_clipboard( obj.dump_csv( params ) ); } );
        }
    },

    'dump_csv_to_printer' : function(params) {
        var obj = this;
        JSAN.use('util.print'); var print = new util.print();
        if (typeof params == 'undefined') params = {};
        if (params.no_full_retrieve) {
            print.simple( obj.dump_csv( params ), {'content_type':'text/plain'} );
        } else {
            obj.wrap_in_full_retrieve( 
                function() { 
                    print.simple( obj.dump_csv( params ), {'content_type':'text/plain'} );
                }
            );
        }
    },

    'dump_csv_to_file' : function(params) {
        var obj = this;
        JSAN.use('util.file'); var f = new util.file();
        if (typeof params == 'undefined') params = {};
        if (params.no_full_retrieve) {
            params.data = obj.dump_csv( params );
            params.not_json = true;
            if (!params.title) params.title = document.getElementById('offlineStrings').getString('list.save_csv_as');
            f.export_file( params );
        } else {
            obj.wrap_in_full_retrieve( 
                function() { 
                    params.data = obj.dump_csv( params );
                    params.not_json = true;
                    if (!params.title) params.title = document.getElementById('offlineStrings').getString('list.save_csv_as');
                    f.export_file( params );
                }
            );
        }
    },

    'print' : function(params) {
        if (!params) params = {};
        switch(this.node.nodeName) {
            case 'tree' : return this._print_tree(params); break;
            default: throw('NYI: Need ._print() for ' + this.node.nodeName); break;
        }
    },

    '_print_tree' : function(params) {
        var obj = this;
        try {
            JSAN.use('OpenILS.data'); var data = new OpenILS.data(); data.stash_retrieve();
            if (!params.staff && data.list.au && data.list.au[0]) {
                params.staff = data.list.au[0];
            }
            if (!params.lib && data.list.au && data.list.au[0] && data.list.au[0].ws_ou() && data.hash.aou && data.hash.aou[ data.list.au[0].ws_ou() ]) {
                params.lib = data.hash.aou[ data.list.au[0].ws_ou() ];
                params.lib.children(null);
            }
            if (params.template && data.print_list_templates[ params.template ]) {
                var template = data.print_list_templates[ params.template ];
                for (var i in template) params[i] = template[i];
            }
            obj.wrap_in_full_retrieve(
                function() {
                    try {
                        if (!params.list) params.list = obj.dump_with_keys();
                        JSAN.use('util.print'); var print = new util.print();
                        print.tree_list( params );
                        if (typeof params.callback == 'function') params.callback();
                    } catch(E) {
                        obj.error.standard_unexpected_error_alert('inner _print_tree',E);
                    }
                }
            );
            
        } catch(E) {
            obj.error.standard_unexpected_error_alert('_print_tree',E);
        }
    },

    'dump_selected_with_keys' : function(params) {
        var obj = this;
        switch(this.node.nodeName) {
            case 'tree' : return this._dump_tree_selection_with_keys(params); break;
            default: throw('NYI: Need .dump_selection_with_keys() for ' + this.node.nodeName); break;
        }

    },

    '_dump_tree_selection_with_keys' : function(params) {
        var obj = this;
        var dump = [];
        var list = obj._retrieve_selection_from_tree();
        for (var i = 0; i < list.length; i++) {
            var row = {};
            var treeitem = list[i];
            var treerow = treeitem.firstChild;
            for (var j = 0; j < treerow.childNodes.length; j++) {
                var value = treerow.childNodes[j].getAttribute('label');
                if (params.skip_hidden_columns) if (obj.node.treeBoxObject.columns.getColumnAt(j).element.getAttribute('hidden') == 'true') continue;
                var id = obj.columns[j].id; if (params.labels_instead_of_ids) id = obj.columns[j].label;
                row[ id ] = value;
            }
            dump.push( row );
        }
        return dump;
    },

    'clipboard' : function(params) {
        try {
            var obj = this;
            var dump = obj.dump_selected_with_keys({'skip_hidden_columns':true,'labels_instead_of_ids':true});
            JSAN.use('OpenILS.data'); var data = new OpenILS.data(); data.stash_retrieve();
            data.list_clipboard = dump; data.stash('list_clipboard');
            JSAN.use('util.window'); var win = new util.window();
            win.open(urls.XUL_LIST_CLIPBOARD,'list_clipboard','chrome,resizable,modal');
            window.focus(); // sometimes the main window will lower after a clipboard action
        } catch(E) {
            this.error.standard_unexpected_error_alert('clipboard',E);
        }
    },

    'dump_retrieve_ids' : function(params) {
        var obj = this;
        switch(this.node.nodeName) {
            case 'tree' : return this._dump_retrieve_ids_tree(params); break;
            default: throw('NYI: Need .dump_retrieve_ids() for ' + this.node.nodeName); break;
        }
    },

    '_dump_retrieve_ids_tree' : function(params) {
        var obj = this;
        var dump = [];
        for (var i = 0; i < this.treechildren.childNodes.length; i++) {
            var treeitem = this.treechildren.childNodes[i];
            dump.push( treeitem.getAttribute('retrieve_id') );
        }
        return dump;
    },

    'wrap_in_full_retrieve' : function(f) {
        var obj = this;
        if (typeof obj.on_all_fleshed == 'function') { // legacy
            obj.on_all_fleshed = [ obj.on_all_fleshed ];
        }
        if (! obj.on_all_fleshed) obj.on_all_fleshed = [];
        obj.on_all_fleshed.push(f);
        obj.full_retrieve();
    },

    '_sort_tree' : function(col,sortDir) {
        var obj = this;
        try {
            if (obj.node.getAttribute('no_sort')) {
                return;
            }
            var col_pos;
            for (var i = 0; i < obj.columns.length; i++) { 
                if (obj.columns[i].id == col.id) col_pos = function(a){return a;}(i); 
            }
            obj.wrap_in_full_retrieve(
                function() {
                    try {
                        JSAN.use('util.money');
                        var rows = [];
                        var treeitems = obj.treechildren.childNodes;
                        for (var i = 0; i < treeitems.length; i++) {
                            var treeitem = treeitems[i];
                            var treerow = treeitem.firstChild;
                            var treecell = treerow.childNodes[ col_pos ];
                            value = ( { 'value' : treecell ? treecell.getAttribute('label') : '', 'node' : treeitem } );
                            rows.push( value );
                        }
                        rows = rows.sort( function(a,b) { 
                            a = a.value; b = b.value; 
                            if (col.getAttribute('sort_type')) {
                                switch(col.getAttribute('sort_type')) {
                                    case 'number' :
                                        a = Number(a); b = Number(b);
                                    break;
                                    case 'money' :
                                        a = util.money.dollars_float_to_cents_integer(a);
                                        b = util.money.dollars_float_to_cents_integer(b);
                                    break;
                                    case 'title' : /* special case for "a" and "the".  doesn't use marc 245 indicator */
                                        a = String( a ).toUpperCase().replace( /^\s*(THE|A|AN)\s+/, '' );
                                        b = String( b ).toUpperCase().replace( /^\s*(THE|A|AN)\s+/, '' );
                                    break;
                                    default:
                                        a = String( a ).toUpperCase();
                                        b = String( b ).toUpperCase();
                                    break;
                                }
                            } else {
                                if (typeof a == 'string' || typeof b == 'string') {
                                    a = String( a ).toUpperCase();
                                    b = String( b ).toUpperCase();
                                }
                            }
                            if (a < b) return -1; 
                            if (a > b) return 1; 
                            return 0; 
                        } );
                        if (sortDir == 'asc') rows = rows.reverse();
                        while(obj.treechildren.lastChild) obj.treechildren.removeChild( obj.treechildren.lastChild );
                        for (var i = 0; i < rows.length; i++) {
                            obj.treechildren.appendChild( rows[i].node );
                        }
                        if (typeof obj.on_sort == 'function') obj.on_sort();
                    } catch(E) {
                        obj.error.standard_unexpected_error_alert('sorting',E); 
                    }
                }
            );
        } catch(E) {
            obj.error.standard_unexpected_error_alert('pre sorting', E);
        }
    },

    '_toggle_checkbox_column' : function(col,toggle) {
        var obj = this;
        try {
            if (obj.node.getAttribute('no_toggle')) {
                return;
            }
            var col_pos;
            for (var i = 0; i < obj.columns.length; i++) { 
                if (obj.columns[i].id == col.id) col_pos = function(a){return a;}(i); 
            }
            var treeitems = obj.treechildren.childNodes;
            for (var i = 0; i < treeitems.length; i++) {
                var treeitem = treeitems[i];
                var treerow = treeitem.firstChild;
                var treecell = treerow.childNodes[ col_pos ];
                treecell.setAttribute('value',(toggle == 'on'));
            }
            if (typeof obj.on_checkbox_toggle == 'function') obj.on_checkbox_toggle(toggle);
        } catch(E) {
            obj.error.standard_unexpected_error_alert('pre toggle', E);
        }
    },

    'render_list_actions' : function(params) {
        var obj = this;
        switch(this.node.nodeName) {
            case 'tree' : return this._render_list_actions_for_tree(params); break;
            default: throw('NYI: Need ._render_list_actions() for ' + this.node.nodeName); break;
        }
    },

    '_render_list_actions_for_tree' : function(params) {
        var obj = this;
        try {
            var btn = document.createElement('button');
            btn.setAttribute('id',obj.node.id + '_list_actions');
            btn.setAttribute('type','menu');
            btn.setAttribute('allowevents','true');
            //btn.setAttribute('oncommand','this.firstChild.showPopup();');
            btn.setAttribute('label',document.getElementById('offlineStrings').getString('list.actions.menu.label'));
            btn.setAttribute('accesskey',document.getElementById('offlineStrings').getString('list.actions.menu.accesskey'));
            var mp = document.createElement('menupopup');
            btn.appendChild(mp);
            var mi = document.createElement('menuitem');
            mi.setAttribute('id',obj.node.id + '_clipfield');
            mi.setAttribute('disabled','true');
            mi.setAttribute('label',document.getElementById('offlineStrings').getString('list.actions.field_to_clipboard.label'));
            mi.setAttribute('accesskey',document.getElementById('offlineStrings').getString('list.actions.field_to_clipboard.accesskey'));
            mp.appendChild(mi);
            mi = document.createElement('menuitem');
            mi.setAttribute('id',obj.node.id + '_csv_to_clipboard');
            mi.setAttribute('label',document.getElementById('offlineStrings').getString('list.actions.csv_to_clipboard.label'));
            mi.setAttribute('accesskey',document.getElementById('offlineStrings').getString('list.actions.csv_to_clipboard.accesskey'));
            mp.appendChild(mi);
            mi = document.createElement('menuitem');
            mi.setAttribute('id',obj.node.id + '_csv_to_printer');
            mi.setAttribute('label',document.getElementById('offlineStrings').getString('list.actions.csv_to_printer.label'));
            mi.setAttribute('accesskey',document.getElementById('offlineStrings').getString('list.actions.csv_to_printer.accesskey'));
            mp.appendChild(mi);
            mi = document.createElement('menuitem');
            mi.setAttribute('id',obj.node.id + '_csv_to_file');
            mi.setAttribute('label',document.getElementById('offlineStrings').getString('list.actions.csv_to_file.label'));
            mi.setAttribute('accesskey',document.getElementById('offlineStrings').getString('list.actions.csv_to_file.accesskey'));
            mp.appendChild(mi);
            mi = document.createElement('menuitem');
            mi.setAttribute('id',obj.node.id + '_save_columns');
            mi.setAttribute('label',document.getElementById('offlineStrings').getString('list.actions.save_column_configuration.label'));
            mi.setAttribute('accesskey',document.getElementById('offlineStrings').getString('list.actions.save_column_configuration.accesskey'));
            mp.appendChild(mi);
            return btn;
        } catch(E) {
            obj.error.standard_unexpected_error_alert('rendering list actions',E);
        }
    },

    'set_list_actions' : function(params) {
        var obj = this;
        switch(this.node.nodeName) {
            case 'tree' : return this._set_list_actions_for_tree(params); break;
            default: throw('NYI: Need ._set_list_actions() for ' + this.node.nodeName); break;
        }
    },

    '_set_list_actions_for_tree' : function(params) {
        // This should be called after the button element from render_list_actions has been appended to the DOM
        var obj = this;
        try {
            var x = document.getElementById(obj.node.id + '_clipfield');
            if (x) {
                x.addEventListener(
                    'command',
                    function() {
                        obj.clipboard(params);
                        if (params && typeof params.on_complete == 'function') {
                            params.on_complete(params);
                        }
                    },
                    false
                );
            }
            x = document.getElementById(obj.node.id + '_csv_to_clipboard');
            if (x) {
                x.addEventListener(
                    'command',
                    function() {
                        obj.dump_csv_to_clipboard(params);
                        if (params && typeof params.on_complete == 'function') {
                            params.on_complete(params);
                        }
                    },
                    false
                );
            }
            x = document.getElementById(obj.node.id + '_csv_to_printer');
            if (x) {
                x.addEventListener(
                    'command',
                    function() {
                        obj.dump_csv_to_printer(params);
                        if (params && typeof params.on_complete == 'function') {
                            params.on_complete(params);
                        }
                    },
                    false
                );
            }
            x = document.getElementById(obj.node.id + '_csv_to_file');
            if (x) {
                x.addEventListener(
                    'command',
                    function() {
                        obj.dump_csv_to_file(params);
                        if (params && typeof params.on_complete == 'function') {
                            params.on_complete(params);
                        }
                    },
                    false
                );
            }
            x = document.getElementById(obj.node.id + '_save_columns');
            if (x) {
                x.addEventListener(
                    'command',
                    function() {
                        obj.save_columns(params);
                        if (params && typeof params.on_complete == 'function') {
                            params.on_complete(params);
                        }
                    },
                    false
                );
            }

        } catch(E) {
            obj.error.standard_unexpected_error_alert('setting list actions',E);
        }
    },

    // Takes fieldmapper class name and attempts to spit out column definitions suitable for .init
    'fm_columns' : function(hint,column_extras) {
        var obj = this;
        var columns = [];
        try {
            // requires the dojo library fieldmapper.autoIDL
            if (typeof fieldmapper == 'undefined') { throw 'fieldmapper undefined'; }
            if (typeof fieldmapper.IDL == 'undefined') { throw 'fieldmapper.IDL undefined'; }
            if (typeof fieldmapper.IDL.fmclasses == 'undefined') { throw 'fieldmapper.IDL.fmclasses undefined'; }
            if (typeof fieldmapper.IDL.fmclasses[hint] == 'undefined') { throw 'fieldmapper.IDL.fmclasses.' + hint + ' undefined'; }
            var my_class = fieldmapper.IDL.fmclasses[hint]; 

            function col_def(my_field) {
                var col_id = hint + '_' + my_field.name;
                var def = {
                    'id' : col_id,
                    'label' : my_field.label || my_field.name,
                    'sort_type' : [ 'int', 'float', 'id', 'number' ].indexOf(my_field.datatype) > -1 ? 'number' : ( my_field.datatype == 'money' ? 'money' : 'default'),
                    'hidden' : [ 'isnew', 'ischanged', 'isdeleted' ].indexOf(my_field.name) > -1,
                    'flex' : 1
                };                    
                // my_field.datatype => bool float id int interval link money number org_unit text timestamp
                def.render = function(my) { return my[hint][my_field.name](); }
                if (my_field.datatype == 'timestamp') {
                    dojo.require('dojo.date.locale');
                    dojo.require('dojo.date.stamp');
                    def.render = function(my) {
                        return dojo.date.locale.format( dojo.date.stamp.fromISOString(my[hint][my_field.name]()) );
                    }
                }
                if (my_field.datatype == 'org_unit') {
                    def.render = function(my) {
                        return typeof my[hint][my_field.name]() == 'object' ? my[hint][my_field.name]().shortname() : data.hash.aou[ my[hint][my_field.name]() ].shortname();
                    }
                }
                if (my_field.datatype == 'money') {
                    JSAN.use('util.money');
                    def.render = function(my) {
                        return util.money.sanitize( my[hint][my_field.name]() );
                    }
                }
                if (column_extras) {
                    if (column_extras['*']) {
                        for (var attr in column_extras['*']) {
                            def[attr] = column_extras['*'][attr];
                        }
                        if (column_extras['*']['expanded_label']) {
                            def.label = my_class.label + ': ' + def.label;
                        }
                    }
                    if (column_extras[col_id]) {
                        for (var attr in column_extras[col_id]) {
                            def[attr] = column_extras[col_id][attr];
                        }
                    }
                }
                return def;
            }
 
            for (var i = 0; i < my_class.fields.length; i++) {
                var my_field = my_class.fields[i];
                columns.push( col_def(my_field) );
            }

        } catch(E) {
            obj.error.standard_unexpected_error_alert('fm_columns()',E);
        }
        return columns;
    },
    // Default for the map_row_to_columns function for .init
    'std_map_row_to_columns' : function(error_value) {
        return function(row,cols) {
            // row contains { 'my' : { 'acp' : {}, 'circ' : {}, 'mvr' : {} } }
            // cols contains all of the objects listed above in columns

            var obj = {};
            JSAN.use('util.error'); obj.error = new util.error();
            JSAN.use('OpenILS.data'); obj.data = new OpenILS.data(); obj.data.init({'via':'stash'});
            JSAN.use('util.network'); obj.network = new util.network();
            JSAN.use('util.money');

            var my = row.my;
            var values = [];
            var cmd = '';
            try {
                for (var i = 0; i < cols.length; i++) {
                    switch (typeof cols[i].render) {
                        case 'function': try { values[i] = cols[i].render(my); } catch(E) { values[i] = error_value; obj.error.sdump('D_COLUMN_RENDER_ERROR',E); } break;
                        case 'string' : cmd += 'try { ' + cols[i].render + '; values['+i+'] = v; } catch(E) { values['+i+'] = error_value; }'; break;
                        default: cmd += 'values['+i+'] = "??? '+(typeof cols[i].render)+'"; ';
                    }
                }
                if (cmd) eval( cmd );
            } catch(E) {
                obj.error.sdump('D_WARN','map_row_to_column: ' + E);
                if (error_value) { value = error_value; } else { value = '   ' };
            }
            return values;
        }
    }
}
dump('exiting util.list.js\n');
