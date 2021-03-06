dojo.require("dojo.date.stamp");
dojo.require("dojox.encoding.base64");
dojo.require("openils.widget.AutoGrid");
dojo.require("openils.widget.AutoWidget");
dojo.require("openils.widget.XULTermLoader");
dojo.require("openils.PermaCrud");

var termSelectorFactory;
var termManager;
var resultManager;
var uriManager;
var pcrud = new openils.PermaCrud();
var cgi = new openils.CGI();

/* typing save: add {get,set}Value() to all HTML <select> elements */
HTMLSelectElement.prototype.getValue = function() {
    return this.options[this.selectedIndex].value;
}

/* only sets the selected value if such an option is actually available */
HTMLSelectElement.prototype.setValue = function(s) {
    for (var i = 0; i < this.options.length; i++) {
        if (s == this.options[i].value) {
            this.selectedIndex = i;
            break;
        }
    }
}

/* quickly find elements by the value of a "name" attribute */
function nodeByName(name, root) {
    return dojo.query("[name='" + name + "']", root)[0];
}

function hideForm() {
    openils.Util.hide("acq-unified-hide-form");
    openils.Util.show("acq-unified-reveal-form", "inline");
    openils.Util.hide("acq-unified-form");
}

function revealForm() {
    openils.Util.hide("acq-unified-reveal-form");
    openils.Util.show("acq-unified-hide-form", "inline");
    openils.Util.show("acq-unified-form");
}

/* The TermSelectorFactory will be instantiated by the TermManager. It
 * provides HTML select controls whose options are all the searchable
 * fields.  Selecting a field from one of these controls will create the
 * appopriate type of corresponding widget for the user to enter a search
 * term against the selected field.
 */
function TermSelectorFactory(terms) {
    var self = this;
    this.terms = terms;

    this.template = dojo.create("select");
    this.template.appendChild(
        dojo.create("option", {
            "disabled": "disabled",
            "selected": "selected",
            "value": "",
            "innerHTML": "Select Search Field" // XXX i18n
        })
    );

    /* Create abbreviations for class names to make field categories
     * more readable in field selector control. */
    this._abbreviate = function(s) {
        var last, result;
        for (var i = 0; i < s.length; i++) {
            if (s[i] != " ") {
                if (!i) result = s[i];
                else if (last == " ") result += s[i];
            }
            last = s[i];
        }
        return result;
    };

    var selectorMethods = {
        /* Important: within the following functions, "this" refers to one
         * HTMLSelect object, and "self" refers to the TermSelectorFactory. */
        "getTerm": function() {
            var parts = this.getValue().split(":");
            return {
                "hint": parts[0],
                "field": parts[1],
                "datatype": self.terms[parts[0]][parts[1]].datatype
            };
        },
        "makeWidget": function(
            parentNode, wStore, matchHow, value, noFocus, callback
        ) {
            var term = this.getTerm();
            var widgetKey = this.uniq;
            if (matchHow.getValue() == "__in") {
                new openils.widget.XULTermLoader({
                    "parentNode": parentNode
                }).build(
                    function(w) {
                        wStore[widgetKey] = w;
                        if (typeof(callback) == "function")
                            callback(term, widgetKey);
                        if (typeof(value) != "undefined")
                            w.attr("value", value);
                        /* I would love for the following call not to be
                         * necessary, so that updating the value of the dijit
                         * would lead to this automatically, but I can't yet
                         * figure out the correct way to do this in Dojo.
                         */
                        w.updateCount();
                    }
                );
            } else if (term.hint == "acqlia") {
                wStore[widgetKey] = dojo.create(
                    "input", {"type": "text"}, parentNode, "only"
                );
                if (typeof(value) != "undefined")
                    wStore[widgetKey].value = value;
                if (!noFocus)
                    wStore[widgetKey].focus();
                if (typeof(callback) == "function")
                    callback(term, widgetKey);
            } else {
                new openils.widget.AutoFieldWidget({
                    "fmClass": term.hint,
                    "fmField": term.field,
                    "noDisablePkey": true,
                    "parentNode": dojo.create("span", null, parentNode, "only")
                }).build(
                    function(w) {
                        wStore[widgetKey] = w;
                        if (typeof(value) != "undefined")
                            w.attr("value", value);
                        if (!noFocus)
                            w.focus();
                        if (typeof(callback) == "function")
                            callback(term, widgetKey);
                    }
                );
            }
        }
    }

    for (var hint in this.terms) {
        var optgroup = dojo.create(
            "optgroup", {"value": "", "label": this.terms[hint].__label}
        );
        var prefix = this._abbreviate(this.terms[hint].__label);

        for (var field in this.terms[hint]) {
            if (!/^__/.test(field)) {
                optgroup.appendChild(
                    dojo.create("option", {
                        "class": "acq-unified-option-regular",
                        "value": hint + ":" + field,
                        "innerHTML": prefix + " - " +
                            this.terms[hint][field].label
                    })
                );
            }
        }

        this.template.appendChild(optgroup);
    }

    this.make = function(n) {
        var node = dojo.clone(this.template);
        node.uniq = n;
        dojo.attr(node, "id", "term-" + n);
        for (var name in selectorMethods)
            node[name] = selectorMethods[name];
        return node;
    };
}

/* The term manager retrieves information from the IDL about all the fields
 * in the classes that we consider searchable for our purpose.  It maintains
 * a dynamic HTML table of search terms, using the TermSelectorFactory
 * to generate search field selectors, which in turn provide appropriate
 * widgets for entering search terms.  The TermManager provides search term
 * modifiers (fuzzy searching, not searching). The TermManager also handles
 * adding and removing rows of search terms, as well as building the search
 * query to pass to the middle layer from the search term widgets.
 */
function TermManager() {
    var self = this;

    this.terms = {};
    ["jub", "acqpl", "acqpo", "acqinv"].forEach(
        function(hint) {
            var o = {};
            o.__label = fieldmapper.IDL.fmclasses[hint].label;
            fieldmapper.IDL.fmclasses[hint].fields.forEach(
                function(field) {
                    if (!field.virtual) {
                        o[field.name] = {
                            "label": field.label, "datatype": field.datatype
                        };
                    }
                }
            );
            self.terms[hint] = o;
        }
    );

    this.terms.acqlia = {"__label": fieldmapper.IDL.fmclasses.acqlia.label};
    pcrud.retrieveAll("acqliad", {"order_by": {"acqliad": "id"}}).forEach(
        function(def) {
            self.terms.acqlia[def.id()] =
                {"label": def.description(), "datatype": "text"}
        }
    );

    this.selectorFactory = new TermSelectorFactory(this.terms);
    this.template = dojo.byId("acq-unified-terms-tbody").
        removeChild(dojo.byId("acq-unified-terms-row-tmpl"));
    dojo.attr(this.template, "id");

    this.rowId = 0;
    this.widgets = {};

    this._row = function(id) { return dojo.byId("term-row-" + id); };
    this._selector = function(id) { return dojo.byId("term-" + id); };
    this._match_how = function(id) { return dojo.byId("term-match-" + id); };

    this._updateMatchHowForField = function(term, key) {
        /* NOTE important to use self, not this, in this function.
         *
         * Based on the selected field (its datatype and the kind of widget
         * that AutoFieldWidget provides for it) we update the possible
         * choices in the mach_how selector.
         */
        var w = self.widgets[key];
        var can_do_fuzzy, can_do_in;
        if (term.datatype == "id") {
            can_do_fuzzy = false;
            can_do_in = true;
        } else if (term.datatype == "link") {
            can_do_fuzzy = (self.getLinkTarget(term) == "au");
            can_do_in = false; /* XXX might revise later */
        } else if (typeof(w.declaredClass) != "undefined") {
            can_do_fuzzy = can_do_in =
                Boolean(w.declaredClass.match(/form\.Text/));
        } else {
            var type = dojo.attr(w, "type");
            if (type)
                can_do_fuzzy = can_do_in = (type == "text");
            else
                can_do_fuzzy = can_do_in = false;
        }

        self.matchHowAllow(key, "__fuzzy", can_do_fuzzy);
        self.matchHowAllow(key, "__in", can_do_in);

        var inequalities = (term.datatype == "timestamp");
        self.matchHowAllow(key, "__gte", inequalities);
        self.matchHowAllow(key, "__lte", inequalities);
    };

    this.removerButton = function(n) {
        return dojo.create("button", {
            "innerHTML": "X",
            "class": "acq-unified-remover",
            "onclick": function() { self.removeRow(n); }
        });
    };

    this.matchHowAllow = function(id, what, which) {
        dojo.query(
            "option[value*='" + what + "']", this._match_how(id)
        ).forEach(function(o) { o.disabled = !which; });
    };

    this.getLinkTarget = function(term) {
        return fieldmapper.IDL.fmclasses[term.hint].
            field_map[term.field]["class"];
    };

    this.updateRowWidget = function(id, value, noFocus) {
        var where = nodeByName("widget", this._row(id));

        delete this.widgets[id];
        dojo.empty(where);

        this._selector(id).makeWidget(
            where, this.widgets, this._match_how(id), value, noFocus,
            this._updateMatchHowForField
        );
    };

    /* this method is particularly kludgy... puts back together a string
     * based on object properties that might arrive in indeterminate order. */
    this._term_reverse_match_how = function(term) {
        /* only two-key combination we use */
        if (term.__not && term.__fuzzy)
            return "__not,__fuzzy";

        /* only other possibilities are single-key or no key */
        for (var key in term) {
            if (/^__/.test(key))
                return key;
        }

        return null;
    };


    this._term_reverse_selector_field = function(term) {
        for (var key in term) {
            if (!/^__/.test(key))
                return key;
        }
        return null;
    };

    this._term_reverse_selector_value = function(term) {
        for (var key in term) {
            if (!/^__/.test(key))
                return term[key];
        }
        return null;
    };

    this.addRow = function(term, hint) {
        var uniq = (this.rowId)++;

        var row = dojo.clone(this.template);
        dojo.attr(row, "id", "term-row-" + uniq);

        var selector = this.selectorFactory.make(uniq);
        dojo.attr(
            selector, "onchange", function() { self.updateRowWidget(uniq); }
        );

        var match_how = dojo.query("select", nodeByName("match", row))[0];
        dojo.attr(match_how, "id", "term-match-" + uniq);
        dojo.attr(match_how, "selectedIndex", 0);
        dojo.attr(
            match_how, "onchange",
            function() {
                if (this.getValue() == "__in") {
                    self.updateRowWidget(uniq);
                    this.was_in = true;
                } else if (this.was_in) {
                    self.updateRowWidget(uniq);
                    this.was_in = false;
                }
                if (self.widgets[uniq]) self.widgets[uniq].focus();
            }
        );

        nodeByName("selector", row).appendChild(selector);
        nodeByName("remove", row).appendChild(this.removerButton(uniq));

        dojo.place(row, "acq-unified-terms-tbody", "last");

        if (term && hint) {
            var attr = this._term_reverse_selector_field(term);
            var field = hint + ":" + attr;
            selector.setValue(field);

            var match_how_value = this._term_reverse_match_how(term);
            if (match_how_value)
                match_how.setValue(match_how_value);

            var value = this._term_reverse_selector_value(term);
            if (this.terms[hint][attr].datatype == "timestamp")
                value = dojo.date.stamp.fromISOString(value);
            this.updateRowWidget(uniq, value, /* noFocus */ true);

        }
    }

    this.removeRow = function(id) {
        delete this.widgets[id];
        dojo.destroy(this._row(id));
    };

    this.reflect = function(search_object) {
        for (var hint in search_object) {
            search_object[hint].forEach(
                function(term) { self.addRow(term, hint); }
            );
        }
    };

    this.buildSearchObject = function() {
        var so = {};

        for (var id in this.widgets) {
            var attr_parts = this._selector(id).getValue().split(":");
            if (attr_parts.length != 2)
                continue;

            var hint = attr_parts[0];
            var attr = attr_parts[1];
            var match_how =
                this._match_how(id).getValue().split(",").filter(Boolean);

            var value;
            if (typeof(this.widgets[id].declaredClass) != "undefined") {
                if (this.widgets[id].declaredClass.match(/Date/)) {
                    value =
                        dojo.date.stamp.toISOString(this.widgets[id].value).
                            split("T")[0];
                } else {
                    value = this.widgets[id].attr("value");
                }
            } else {
                value = this.widgets[id].value;
            }

            if (!so[hint])
                so[hint] = [];

            var unit = {};
            unit[attr] = value;
            match_how.forEach(function(key) { unit[key] = true; });
            if (this.terms[hint][attr].datatype == "timestamp")
                unit.__castdate = true;

            so[hint].push(unit);
        }
        return so;
    };
}

/* The result manager is used primarily when the users submits a search.  It
 * consults the termManager to get the search query to send to the middl
 * layer, and it chooses which ML method to call as well as what widgets to use
 * to display the results.
 */
function ResultManager(liTable, poGrid, plGrid, invGrid) {
    var self = this;

    this.liTable = liTable;
    this.poGrid = poGrid;
    this.plGrid = plGrid;
    this.invGrid = invGrid;
    this.poCache = {};
    this.plCache = {};
    this.invCache = {};

    this.result_types = {
        "lineitem": {
            "search_options": {
                "flesh_attrs": true,
                "flesh_cancel_reason": true,
                "flesh_notes": true
            },
            "revealer": function() {
                self.liTable.reset();
                self.liTable.show("list");
            }
        },
        "purchase_order": {
            "search_options": {
                "no_flesh_cancel_reason": true
            },
            "revealer": function() {
                self.poGrid.resetStore();
                self.poCache = {};
            }
        },
        "picklist": {
            "search_options": {
                "flesh_lineitem_count": true,
                "flesh_owner": true
            },
            "revealer": function() {
                self.plGrid.resetStore();
                self.plCache = {};
            }
        },
        "invoice": {
            "search_options": {
                "no_flesh_misc": true
            },
            "revealer": function() {
                self.invGrid.resetStore();
                self.invCache = {};
            }
        },
        "no_results": {
            "revealer": function() { alert(localeStrings.NO_RESULTS); }
        }
    };

    this._add_lineitem = function(li) {
        this.liTable.addLineitem(li);
    };

    this._add_purchase_order = function(po) {
        this.poCache[po.id()] = po;
        this.poGrid.store.newItem(acqpo.toStoreItem(po));
    };

    this._add_picklist = function(pl) {
        this.plCache[pl.id()] = pl;
        this.plGrid.store.newItem(acqpl.toStoreItem(pl));
    };

    this._add_invoice = function(inv) {
        this.invCache[inv.id()] = inv;
        this.invGrid.store.newItem(acqinv.toStoreItem(inv));
    };

    this._finish_purchase_order = function() {
        this.poGrid.hideLoadProgressIndicator();
    };

    this._finish_picklist = function() {
        this.plGrid.hideLoadProgressIndicator();
    };

    this._finish_invoice = function() {
        this.invGrid.hideLoadProgressIndicator();
    };

    this.add = function(which, what) {
        var name = "_add_" + which;
        if (this[name]) this[name](what);
    };

    this.finish = function(which) {
        var name = "_finish_" + which;
        if (this[name]) this[name]();
    };

    this.show = function(which) {
        openils.Util.objectProperties(this.result_types).forEach(
            function(rt) {
                openils.Util[rt == which ? "show" : "hide"](
                    "acq-unified-results-" + rt
                );
            }
        );
        this.result_types[which].revealer();
    };

    this.go = function(search_object) {
        location.href = oilsBasePath + "/acq/search/unified?" +
            "so=" + base64Encode(search_object) +
            "&rt=" + dojo.byId("acq-unified-result-type").getValue() +
            "&c=" + dojo.byId("acq-unified-conjunction").getValue();
    };

    this.search = function(search_object) {
        var count_results = 0;
        var result_type = dojo.byId("acq-unified-result-type").getValue();
        var conjunction = dojo.byId("acq-unified-conjunction").getValue();

        /* XXX TODO when result_type can be "lineitem_and_bib" there may be a
         * totally different ML method to call; not sure how that will work
         * yet. */
        var method_name = "open-ils.acq." + result_type + ".unified_search";
        var params = [
            openils.User.authtoken,
            null, null, null,
            this.result_types[result_type].search_options
        ];

        params[conjunction == "and" ? 1 : 2] = search_object;

        fieldmapper.standardRequest(
            ["open-ils.acq", method_name], {
                "params": params,
                "async": true,
                "onresponse": function(r) {
                    if (r = openils.Util.readResponse(r)) {
                        if (!count_results++)
                            self.show(result_type);
                        self.add(result_type, r);
                    }
                },
                "oncomplete": function() {
                    if (!count_results)
                        self.show("no_results");
                    else
                        self.finish(result_type);
                }
            }
        );
    }
}

function URIManager() {
    var self = this;

    this.search_object = cgi.param("so");
    if (this.search_object)
        this.search_object = base64Decode(this.search_object);

    this.result_type = cgi.param("rt");
    if (this.result_type)
        dojo.byId("acq-unified-result-type").setValue(this.result_type);

    this.conjunction = cgi.param("c");
    if (this.conjunction)
        dojo.byId("acq-unified-conjunction").setValue(this.conjunction);
}

/* onload */
openils.Util.addOnLoad(
    function() {
        termManager = new TermManager();
        resultManager = new ResultManager(
            new AcqLiTable(),
            dijit.byId("acq-unified-po-grid"),
            dijit.byId("acq-unified-pl-grid"),
            dijit.byId("acq-unified-inv-grid")
        );

        uriManager = new URIManager();
        if (uriManager.search_object) {
            hideForm();
            openils.Util.show("acq-unified-body");
            termManager.reflect(uriManager.search_object);
            resultManager.search(uriManager.search_object);
        } else {
            termManager.addRow();
            openils.Util.show("acq-unified-body");
        }
    }
);
