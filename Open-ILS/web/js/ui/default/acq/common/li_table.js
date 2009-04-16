dojo.require('dojo.date.locale');
dojo.require('dojo.date.stamp');
dojo.require('dijit.form.Button');
dojo.require('dijit.form.TextBox');
dojo.require('dijit.form.FilteringSelect');
dojo.require('dijit.form.Textarea');
dojo.require('dijit.ProgressBar');
dojo.require('openils.User');
dojo.require('openils.Util');
dojo.require('openils.acq.Lineitem');
dojo.require('openils.acq.PO');
dojo.require('openils.acq.Picklist');
dojo.require('openils.widget.AutoFieldWidget');
dojo.require('dojo.data.ItemFileReadStore');
dojo.require('openils.widget.ProgressDialog');
dojo.requireLocalization('openils.acq', 'acq');
var localeStrings = dojo.i18n.getLocalization('openils.acq', 'acq');

function AcqLiTable() {

    var self = this;
    this.liCache = {};
    this.toggleState = false;
    this.tbody = dojo.byId('acq-lit-tbody');
    this.selectors = [];
    this.authtoken = openils.User.authtoken;
    this.rowTemplate = this.tbody.removeChild(dojo.byId('acq-lit-row'));
    this.copyTbody = dojo.byId('acq-lit-li-details-tbody');
    this.copyRow = this.copyTbody.removeChild(dojo.byId('acq-lit-li-details-row'));
    this.copyBatchRow = dojo.byId('acq-lit-li-details-batch-row');
    this.copyBatchWidgets = {};
    this.liNotesTbody = dojo.byId('acq-lit-notes-tbody');
    this.liNotesRow = this.liNotesTbody.removeChild(dojo.byId('acq-lit-notes-row'));

    dojo.connect(acqLitLiActionsSelector, 'onChange', 
        function() { 
            self.applySelectedLiAction(this.attr('value')) 
            acqLitLiActionsSelector.attr('value', '_');
        });

    acqLitCreatePoSubmit.onClick = function() {
        acqLitPoCreateDialog.hide();
        self._createPO(acqLitPoCreateDialog.getValues());
    }

    acqLitSavePlButton.onClick = function() {
        acqLitSavePlDialog.hide();
        self._savePl(acqLitSavePlDialog.getValues());
    }

    dojo.byId('acq-lit-notes-new-button').onclick = function(){acqLitCreateLiNoteDialog.show();}

    dojo.byId('acq-lit-select-toggle').onclick = function(){self.toggleSelect()};
    dojo.byId('acq-lit-info-back-button').onclick = function(){self.show('list')};
    dojo.byId('acq-lit-copies-back-button').onclick = function(){self.show('list')};
    dojo.byId('acq-lit-notes-back-button').onclick = function(){self.show('list')};

    this.reset = function() {
        while(self.tbody.childNodes[0])
            self.tbody.removeChild(self.tbody.childNodes[0]);
        self.selectors = [];
    };
    
    this.setNext = function(handler) {
        var link = dojo.byId('acq-lit-next');
        if(handler) {
            dojo.style(link, 'visibility', 'visible');
            link.onclick = handler;
        } else {
            dojo.style(link, 'visibility', 'hidden');
        }
    };

    this.setPrev = function(handler) {
        var link = dojo.byId('acq-lit-prev');
        if(handler) {
            dojo.style(link, 'visibility', 'visible'); 
            link.onclick = handler; 
        } else {
            dojo.style(link, 'visibility', 'hidden');
        }
    };

    this.show = function(div) {
        openils.Util.hide('acq-lit-table-div');
        openils.Util.hide('acq-lit-info-div');
        openils.Util.hide('acq-lit-li-details');
        openils.Util.hide('acq-lit-notes-div');
        switch(div) {
            case 'list':
                openils.Util.show('acq-lit-table-div');
                break;
            case 'info':
                openils.Util.show('acq-lit-info-div');
                break;
            case 'copies':
                openils.Util.show('acq-lit-li-details');
                break;
            case 'notes':
                openils.Util.show('acq-lit-notes-div');
                break;
            default:
                if(div) 
                    openils.Util.show(div);
        }
    }

    this.hide = function() {
        this.show(null);
    }

    this.toggleSelect = function() {
        if(self.toggleState) 
            dojo.forEach(self.selectors, function(i){i.checked = false});
        else 
            dojo.forEach(self.selectors, function(i){i.checked = true});
        self.toggleState = !self.toggleState;
    };


    /** @param all If true, assume all are selected */
    this.getSelected = function(all) {
        var selected = [];
        dojo.forEach(self.selectors, 
            function(i) { 
                if(i.checked || all)
                    selected.push(self.liCache[i.parentNode.parentNode.getAttribute('li')]);
            }
        );
        return selected;
    };

    this.setRowAttr = function(td, liWrapper, field, type) {
        var val = liWrapper.findAttr(field, type || 'lineitem_marc_attr_definition') || '';
        td.appendChild(document.createTextNode(val));
    };

    this.addLineitem = function(li) {
        this.liCache[li.id()] = li;

        // sort the lineitem notes on edit_time
        if(!li.lineitem_notes()) li.lineitem_notes([]);

        var liWrapper = new openils.acq.Lineitem({lineitem:li});
        var row = self.rowTemplate.cloneNode(true);
        row.setAttribute('li', li.id());
        var tds = dojo.query('[attr]', row);
        dojo.forEach(tds, function(td) {self.setRowAttr(td, liWrapper, td.getAttribute('attr'), td.getAttribute('attr_type'));});
        dojo.query('[name=source_label]', row)[0].appendChild(document.createTextNode(li.source_label()));

        var isbn = liWrapper.findAttr('isbn', 'lineitem_marc_attr_definition');
        if(isbn) {
            // XXX media prefix for added content
            dojo.query('[name=jacket]', row)[0].setAttribute('src', '/opac/extras/ac/jacket/small/' + isbn);
        }

        dojo.query('[attr=title]', row)[0].onclick = function() {self.drawInfo(li.id())};
        dojo.query('[name=copieslink]', row)[0].onclick = function() {self.drawCopies(li.id())};
        dojo.query('[name=count]', row)[0].innerHTML = li.item_count();
        dojo.query('[name=notes_count]', row)[0].innerHTML = li.lineitem_notes().length;
        dojo.query('[name=noteslink]', row)[0].onclick = function() {self.drawLiNotes(li)};

        var priceInput = dojo.query('[name=estimated_price]', row)[0];
        var priceData = liWrapper.getPrice();
        priceInput.value = (priceData) ? priceData.price : '';
        priceInput.onchange = function() { self.updateLiPrice(priceInput, li) };

        self.tbody.appendChild(row);
        self.selectors.push(dojo.query('[name=selectbox]', row)[0]);
    };

    this.drawLiNotes = function(li) {
        var self = this;

        li.lineitem_notes(
            li.lineitem_notes().sort(
                function(a, b) { 
                    if(a.edit_time() < b.edit_time()) return 1;
                    return -1;
                }
            )
        );

        while(this.liNotesTbody.childNodes[0])
            this.liNotesTbody.removeChild(this.liNotesTbody.childNodes[0]);
        this.show('notes');

        acqLitCreateLiNoteSubmit.onClick = function() {
            acqLitCreateLiNoteDialog.hide();
            var value = acqLitCreateLiNoteDialog.getValues().note;
            if(!value) return;
            var note = new fieldmapper.acqlin();
            note.isnew(true);
            note.value(value);
            li.lineitem_notes().push(note);
            note.lineitem(li.id());
            self.addLiNote(li, note);
        }

        dojo.byId('acq-lit-notes-save-button').onclick = function() {
            self.updateLiNotes(li);
        }

        dojo.forEach(li.lineitem_notes(), function(note) { self.addLiNote(li, note) });
    }

    this.addLiNote = function(li, note) {
        var self = this;
        var row = self.liNotesRow.cloneNode(true);
        dojo.query('[name=creator]', row)[0].innerHTML = note.creator() || ''; /* XXX */
        dojo.query('[name=editor]', row)[0].innerHTML = note.editor() || ''; /* XXX */

        if(note.create_time()) {
            dojo.query('[name=create_time]', row)[0].innerHTML = 
                dojo.date.locale.format(
                    dojo.date.stamp.fromISOString(note.create_time()), 
                    {formatLength:'short'});
        }

        if(note.edit_time()) {
            dojo.query('[name=edit_time]', row)[0].innerHTML = 
                dojo.date.locale.format(
                    dojo.date.stamp.fromISOString(note.edit_time()), 
                    {formatLength:'short'});
        }

        new openils.widget.AutoFieldWidget({
            fmField : 'value',
            fmObject : note,
            parentNode : dojo.query('[name=value]', row)[0],
            widgetClass : 'dijit.form.Textarea',
        }).build(
            function(w) {
                dojo.connect(w, 'onChange', 
                    function() {
                        note.value(this.attr('value')); 
                        note.ischanged(true);
                    }
                );
            }
        );

        dojo.query('[name=delete]', row)[0].onclick = function() {
            note.isdeleted(true);
            self.liNotesTbody.removeChild(row);
        };

        self.liNotesTbody.appendChild(row);
    }

    this.updateLiNotes = function(li) {
        progressDialog.show();

        var notes = li.lineitem_notes().filter(
            function(note) {
                if(note.ischanged() || note.isnew() || note.isdeleted())
                    return note;
            }
        );

        fieldmapper.standardRequest(
            ['open-ils.acq', 'open-ils.acq.lineitem_note.cud.batch'],
            {   async : true,
                params : [this.authtoken, notes],
                onresponse : function(r) {
                    var resp = openils.Util.readResponse(r);

                    if(resp.complete) {
                        progressDialog.hide();
                        self.drawLiNotes(li);
                        return;
                    }

                    progressDialog.update(resp);

                    var newnote = resp.note;
                    var oldnote = li.lineitem_notes().filter(function(n) { return (n.value() == newnote.value()) })[0];
                    var notes = li.lineitem_notes().filter(function(n) { return (n.value() != newnote.value()) });

                    if(!openils.Util.isTrue(oldnote.isdeleted())) 
                        notes.push(newnote);
                    li.lineitem_notes(notes);
                },
            }
        );
    }

    this.updateLiPrice = function(input, li) {

        var price = input.value;
        var liWrapper = new openils.acq.Lineitem({lineitem:li});
        var oldPrice = liWrapper.getPrice() || null;

        if(oldPrice) oldPrice = oldPrice.price;
        if(price == oldPrice) return;

        fieldmapper.standardRequest(
            ['open-ils.acq', 'open-ils.acq.lineitem_local_attr.set'],
            {   async : true,
                params : [this.authtoken, li.id(), 'estimated_price', price],
                oncomplete : function(r) {
                    openils.Util.readResponse(r);
                }
            }
        );
    }

    this.removeLineitem = function(liId) {
        this.tbody.removeChild(dojo.query('[li='+liId+']', this.tbody)[0]);
        delete this.liCache[liId];
    }

    this.drawInfo = function(liId) {
        this.show('info');
        openils.acq.Lineitem.fetchAttrDefs(
            function() { 
                self._fetchLineitem(liId, function(li){self._drawInfo(li);}); 
            } 
        );
    };

    this._fetchLineitem = function(liId, handler) {

        var li = this.liCache[liId];
        if(li && li.marc() && li.lineitem_details())
            return handler(li);
        
        fieldmapper.standardRequest(
            ['open-ils.acq', 'open-ils.acq.lineitem.retrieve'],
            {   async: true,

                params: [self.authtoken, liId, {
                    flesh_attrs: true,
                    flesh_li_details: true,
                    flesh_fund_debit: true }],

                oncomplete: function(r) {
                    var li = openils.Util.readResponse(r);
                    handler(li)
                }
            }
        );
    };

    this._drawInfo = function(li) {

        acqLitEditMarc.onClick = function() { self.editMarc(li); }
        this.drawMarcHTML(li);
        this.infoTbody = dojo.byId('acq-lit-info-tbody');

        if(!this.infoRow)
            this.infoRow = this.infoTbody.removeChild(dojo.byId('acq-lit-info-row'));
        while(this.infoTbody.childNodes[0])
            this.infoTbody.removeChild(this.infoTbody.childNodes[0]);

        for(var i = 0; i < li.attributes().length; i++) {
            var attr = li.attributes()[i];
            var row = this.infoRow.cloneNode(true);

            var type = attr.attr_type().replace(/lineitem_(.*)_attr_definition/, '$1');
            var name = openils.acq.Lineitem.attrDefs[type].filter(
                function(a) {
                    return (a.code() == attr.attr_name());
                }
            ).pop().description();

            dojo.query('[name=label]', row)[0].appendChild(document.createTextNode(name));
            dojo.query('[name=value]', row)[0].appendChild(document.createTextNode(attr.attr_value()));
            this.infoTbody.appendChild(row);
        }

        if(li.eg_bib_id()) {
            openils.Util.show('acq-lit-info-cat-link');
            var link = dojo.byId('acq-lit-info-cat-link').getElementsByTagName('a')[0];
            var href = link.getAttribute('href');
            if(href.match(/=$/))
                link.setAttribute('href',  href + li.eg_bib_id());
        } else {
            openils.Util.hide('acq-lit-info-cat-link');
        }
    };

    this.drawMarcHTML = function(li) {
        fieldmapper.standardRequest(
            ['open-ils.search', 'open-ils.search.biblio.record.html'],
            {   async: true,
                params: [null, true, li.marc()],
                oncomplete: function(r) {
                    dojo.byId('acq-lit-marc-div').innerHTML = 
                        openils.Util.readResponse(r);
                }
            }
        );
    }

    this.drawCopies = function(liId) {
        this.show('copies');
        var self = this;
        this.copyCache = {};
        this.copyWidgetCache = {};

        acqLitSaveCopies.onClick = function() { self.saveCopyChanges(liId) };
        acqLitBatchUpdateCopies.onClick = function() { self.batchCopyUpdate() };

        while(this.copyTbody.childNodes[0])
            this.copyTbody.removeChild(this.copyTbody.childNodes[0]);

        this._drawBatchCopyWidgets();

        this._fetchDistribFormulas(
            function() {
                openils.acq.Lineitem.fetchAttrDefs(
                    function() { 
                        self._fetchLineitem(liId, function(li){self._drawCopies(li);}); 
                    } 
                );
            }
        );
    };

    this._fetchDistribFormulas = function(onload) {
        if(this.distribForms) {
            onload();
        } else {
            var self = this;
            fieldmapper.standardRequest(
                ['open-ils.acq', 'open-ils.acq.distribution_formula.ranged.retrieve.atomic'],
                {   async: true,
                    params: [openils.User.authtoken],
                    oncomplete: function(r) {
                        self.distribForms = openils.Util.readResponse(r);
                        self.distribFormulaStore = 
                            new dojo.data.ItemFileReadStore(
                                {data:acqdf.toStoreData(self.distribForms)});
                        onload();
                    }
                }
            );
        }
    }

    this._drawBatchCopyWidgets = function() {
        var row = this.copyBatchRow;
        dojo.forEach(['fund', 'owning_lib', 'location', 'circ_modifier', 'cn_label'],
            function(field) {
                if(self.copyBatchRowDrawn) {
                    self.copyBatchWidgets[field].attr('value', null);
                } else {
                    var widget = new openils.widget.AutoFieldWidget({
                        fmField : field,
                        fmClass : 'acqlid',
                        parentNode : dojo.query('[name='+field+']', row)[0],
                        orgLimitPerms : ['CREATE_PICKLIST'],
                        dijitArgs : {required:false}
                    });
                    widget.build();
                    self.copyBatchWidgets[field] = widget.widget;
                }
            }
        );
        this.copyBatchRowDrawn = true;
    };

    this.batchCopyUpdate = function() {
        var self = this;
        var fields = ['fund', 'owning_lib', 'location', 'circ_modifier', 'cn_label'];
        for(var k in this.copyWidgetCache) {
            var cache = this.copyWidgetCache[k];
            dojo.forEach(fields, function(f) {
                var newval = self.copyBatchWidgets[f].attr('value');
                if(newval) cache[f].attr('value', newval);
            });
        }
    };

    this._drawCopies = function(li) {
        acqLitAddCopyCount.onClick = function() { 
            var count = acqLitCopyCountInput.attr('value');
            for(var i = 0; i < count; i++)
                self.addCopy(li); 
        }
        if(li.lineitem_details().length > 0) {
            dojo.forEach(li.lineitem_details(),
                function(copy) {
                    self.addCopy(li, copy);
                }
            );
        } else {
            self.addCopy(li);
        }
    };

    this.virtCopyId = -1;
    this.addCopy = function(li, copy) {
        var row = this.copyRow.cloneNode(true);
        this.copyTbody.appendChild(row);
        var self = this;

        if(!copy) {
            copy = new fieldmapper.acqlid();
            copy.isnew(true);
            copy.id(this.virtCopyId--);
            copy.lineitem(li.id());
        }

        this.copyCache[copy.id()] = copy;
        row.setAttribute('copy_id', copy.id());
        self.copyWidgetCache[copy.id()] = {};

        dojo.forEach(['fund', 'owning_lib', 'location', 'barcode', 'cn_label', 'circ_modifier', 'note'],
            function(field) {
                var widget = new openils.widget.AutoFieldWidget({
                    fmObject : copy,
                    fmField : field,
                    fmClass : 'acqlid',
                    parentNode : dojo.query('[name='+field+']', row)[0],
                    orgLimitPerms : ['CREATE_PICKLIST'],
                    readOnly : self.isPO
                });
                widget.build(
                    // make sure we capture the value from any async widgets
                    function(w, ww) { copy[field](ww.getFormattedValue()) }
                );
                dojo.connect(widget.widget, 'onChange', 
                    function(val) { 
                        if(copy.isnew() || val != copy[field]()) {
                            // prevent setting ischanged() automatically on widget load for existing copies
                            copy[field](widget.getFormattedValue()) 
                            copy.ischanged(true);
                        }
                    }
                );
                self.copyWidgetCache[copy.id()][field] = widget.widget;
            }
        );

        if(this.isPO) {
            openils.Util.hide(dojo.query('[name=delete]', row)[0].parentNode);
        } else {
            dojo.query('[name=delete]', row)[0].onclick = 
                function() { self.deleteCopy(row) };
        }
    };

    this.deleteCopy = function(row) {
        var copy = this.copyCache[row.getAttribute('copy_id')];
        copy.isdeleted(true);
        if(copy.isnew())
            delete this.copyCache[copy.id()];
        this.copyTbody.removeChild(row);
    }

    this.saveCopyChanges = function(liId) {
        var self = this;
        var copies = [];

        openils.Util.show('acq-lit-update-copies-progress');

        for(var id in this.copyCache) {
            var c = this.copyCache[id];
            if(c.isnew() || c.ischanged() || c.isdeleted()) {
                if(c.id() < 0) c.id(null);
                copies.push(c);
            }
        }

        if(copies.length == 0)
            return;

        fieldmapper.standardRequest(
            ['open-ils.acq', 'open-ils.acq.lineitem_detail.cud.batch'],
            {   async: true,
                params: [openils.User.authtoken, copies],
                onresponse: function(r) {
                    var res = openils.Util.readResponse(r);
                    litUpdateCopiesProgress.update(res);
                },
                oncomplete: function() {
                    openils.Util.hide('acq-lit-update-copies-progress');
                    self.drawCopies(liId); 
                }
            }
        );
    }

    this.applySelectedLiAction = function(action) {
        var self = this;
        switch(action) {

            case 'delete_selected':
                this._deleteLiList(self.getSelected());
                break;

            case 'create_order':

                if(!this.createPoProviderSelector) {
                    var widget = new openils.widget.AutoFieldWidget({
                        fmField : 'provider',
                        fmClass : 'acqpo',
                        parentNode : dojo.byId('acq-lit-po-provider'),
                        orgLimitPerms : ['CREATE_PURCHASE_ORDER'],
                    });
                    widget.build(
                        function(w) { self.createPoProviderSelector = w; }
                    );
                }
         
                acqLitPoCreateDialog.show();
                break;

            case 'save_picklist':
                this._loadPLSelect();
                acqLitSavePlDialog.show();
                break;

            case 'print_po':
                this.printPO();
                break;

            case 'receive_po':
                this.receivePO();
                break;

            case 'rollback_receive_po':
                this.rollbackPoReceive();
                break;

            case 'create_assets':
                this.createAssets();
                break;
        }
    }

    this.createAssets = function() {
        if(!this.isPO) return;
        if(!confirm(localeStrings.CREATE_PO_ASSETS_CONFIRM)) return;
        this.show('acq-lit-progress-numbers');
        var self = this;
        fieldmapper.standardRequest(
            ['open-ils.acq', 'open-ils.acq.purchase_order.assets.create'],
            {   async: true,
                params: [this.authtoken, this.isPO],
                onresponse: function(r) {
                    var resp = openils.Util.readResponse(r);
                    self._updateProgressNumbers(resp, true);
                }
            }
        );
    }

    this.printPO = function() {
        if(!this.isPO) return;
        progressDialogInd.show();
        fieldmapper.standardRequest(
            ['open-ils.acq', 'open-ils.acq.purchase_order.format'],
            {   async: true,
                params: [this.authtoken, this.isPO, 'html'],
                oncomplete: function(r) {
                    progressDialogInd.hide();
                    var evt = openils.Util.readResponse(r);
                    if(evt && evt.template_output()) {
                        win = window.open('','', 'resizable,width=800,height=600,scrollbars=1');
                        win.document.body.innerHTML = evt.template_output().data();
                    }
                }
            }
        );
    }


    this.receivePO = function() {
        if(!this.isPO) return;
        this.show('acq-lit-progress-numbers');
        var self = this;
        fieldmapper.standardRequest(
            ['open-ils.acq', 'open-ils.acq.purchase_order.receive'],
            {   async: true,
                params: [this.authtoken, this.isPO],
                onresponse : function(r) {
                    var resp = openils.Util.readResponse(r);
                    self._updateProgressNumbers(resp, true);
                },
            }
        );
    }

    this.rollbackPoReceive = function() {
        if(!this.isPO) return;
        if(!confirm(localeStrings.ROLLBACK_PO_RECEIVE_CONFIRM)) return;
        this.show('acq-lit-progress-numbers');
        var self = this;
        fieldmapper.standardRequest(
            ['open-ils.acq', 'open-ils.acq.purchase_order.receive.rollback'],
            {   async: true,
                params: [this.authtoken, this.isPO],
                onresponse : function(r) {
                    var resp = openils.Util.readResponse(r);
                    self._updateProgressNumbers(resp, true);
                },
            }
        );
    }

    this._updateProgressNumbers = function(resp, reloadOnComplete) {
        if(!resp) return;
        dojo.byId('acq-pl-lit-li-processed').innerHTML = resp.li;
        dojo.byId('acq-pl-lit-lid-processed').innerHTML = resp.lid;
        dojo.byId('acq-pl-lit-debits-processed').innerHTML = resp.debits_accrued;
        dojo.byId('acq-pl-lit-bibs-processed').innerHTML = resp.bibs;
        dojo.byId('acq-pl-lit-indexed-processed').innerHTML = resp.indexed;
        dojo.byId('acq-pl-lit-copies-processed').innerHTML = resp.copies;
        if(resp.complete && reloadOnComplete) 
            location.href = location.href;
    }


    this._createPO = function(fields) {
        this.show('acq-lit-progress-numbers');
        var po = new fieldmapper.acqpo();
        po.provider(this.createPoProviderSelector.attr('value'));

        var selected = this.getSelected( (fields.create_from == 'all') );
        if(selected.length == 0) return;

        var max = selected.length * 3;

        var self = this;
        fieldmapper.standardRequest(
            ['open-ils.acq', 'open-ils.acq.purchase_order.create'],
            {   async: true,
                params: [
                    openils.User.authtoken, 
                    po, 
                    {
                        lineitems : selected.map(function(li) { return li.id() }),
                        create_assets : fields.create_assets[0],
                    }
                ],

                onresponse : function(r) {
                    var resp = openils.Util.readResponse(r);
                    self._updateProgressNumbers(resp);
                    if(resp.complete) 
                        location.href = oilsBasePath + '/eg/acq/po/view/' + resp.purchase_order.id();
                }
            }
        );
    }

    this._deleteLiList = function(list, idx) {
        if(idx == null) idx = 0;
        if(idx >= list.length) return;
        var liId = list[idx].id();
        fieldmapper.standardRequest(
            ['open-ils.acq', 'open-ils.acq.lineitem.delete'],
            {   async: true,
                params: [openils.User.authtoken, liId],
                oncomplete: function(r) {
                    self.removeLineitem(liId);
                    self._deleteLiList(list, ++idx);
                }
            }
        );
    }

    this.editMarc = function(li) {

        /*  To run in Firefox directly, must set signed.applets.codebase_principal_support
            to true in about:config */

        netscape.security.PrivilegeManager.enablePrivilege('UniversalXPConnect');
        win = window.open('/xul/server/cat/marcedit.xul'); // XXX version?

        var self = this;
        win.xulG = {
            record : {marc : li.marc()},
            save : {
                label: 'Save Record', // XXX I18N
                func: function(xmlString) {
                    li.marc(xmlString);
                    fieldmapper.standardRequest(
                        ['open-ils.acq', 'open-ils.acq.lineitem.update'],
                        {   async: true,
                            params: [openils.User.authtoken, li],
                            oncomplete: function(r) {
                                openils.Util.readResponse(r);
                                win.close();
                                self.drawInfo(li.id())
                            }
                        }
                    );
                },
            }
        };
    }


    this._savePl = function(values) {
        var self = this;
        var selected = this.getSelected( (values.which == 'all') );
        openils.Util.show('acq-lit-generic-progress');

        if(values.new_name) {
            openils.acq.Picklist.create(
                {name: values.new_name}, 
                function(id) {
                    self._updateLiList(id, selected, 0, 
                        function(){
                            location.href = oilsBasePath + '/eg/acq/picklist/view/' + id;
                        });
                }
            );
        } else if(values.existing_pl) {
            // update lineitems to use an existing picklist
            self._updateLiList(values.existing_pl, selected, 0, 
                function(){
                    location.href = oilsBasePath + '/eg/acq/picklist/view/' + values.existing_pl;
                });
        }
    }

    this._updateLiList = function(pl, list, idx, oncomplete) {
        if(idx >= list.length) return oncomplete();
        var li = list[idx];
        li.picklist(pl);
        litGenericProgress.update({maximum: list.length, progress: idx});
        new openils.acq.Lineitem({lineitem:li}).update(
            function(r) {
                self._updateLiList(pl, list, ++idx, oncomplete);
            }
        );
    }

    this._loadPLSelect = function() {
        if(this._plSelectLoaded) return;
        var plList = [];
        function handleResponse(r) {
            plList.push(r.recv().content());
        }
        var method = 'open-ils.acq.picklist.user.retrieve';
        fieldmapper.standardRequest(
            ['open-ils.acq', method],
            {   async: true,
                params: [this.authtoken],
                onresponse: handleResponse,
                oncomplete: function() {
                    self._plSelectLoaded = true;
                    acqLitAddExistingSelect.store = 
                        new dojo.data.ItemFileReadStore({data:acqpl.toStoreData(plList)});
                    acqLitAddExistingSelect.setValue();
                }
            }
        );
    }
}



