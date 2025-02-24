import * as api from "./api.js";
import * as util from "./util.js";
import * as model from "./model.js";
import * as settings from "./settings.js";
import * as query_builder from "./query_builder.js";
import * as dlgPickUser from "./dlg_pick_user.js";
import * as dlgPickProj from "./dlg_pick_proj.js";
import * as dlgSchemaList from "./dlg_schema_list.js";
import * as dlgQueryBuild from "./dlg_query_builder.js";

export function newSearchPanel(a_frame, a_key, a_parent, a_opts) {
    return new SearchPanel(a_frame, a_key, a_parent, a_opts);
}

function _makeSelTree(a_tree) {
    var html = "",
        item;

    for (var id in a_tree) {
        item = a_tree[id];
        if (item.ch && !util.isObjEmpty(item.ch)) {
            html += _makeSelTree(item.ch);
        } else {
            html +=
                "<div class='srch-sel-item' data='" +
                id +
                "' title='" +
                id +
                "'><div class='row-flex' style='width:100%'><div style='flex:1 1 auto;white-space:nowrap;overflow:hidden'>" +
                item._title +
                "</div><div class='srch-sel-btn-div' style='flex:none'><button class='srch-sel-rem-btn btn btn-icon'><span class='ui-icon ui-icon-close'></span></button></div></div></div>";
        }
    }

    return html;
}

/*
Adds new selection to existing.
Only leaf nodes in a_tree matter: if a leaf node is not already in the old tree, it is added. If it
is in the existing tree, then all nodes below that node are pruned.
*/
function _addSelTree(a_old, a_new) {
    for (var id in a_new) {
        if (id in a_old && !util.isObjEmpty(a_new[id].ch)) {
            _addSelTree(a_old[id].ch, a_new[id].ch);
        } else {
            a_old[id] = a_new[id];
        }
    }
}

function _remSelTree(a_old, a_rem_id) {
    if (util.isObjEmpty(a_old)) {
        return 0;
    }

    if (a_rem_id in a_old) {
        delete a_old[a_rem_id];
        // Return true if empty = prune this node
        if (util.isObjEmpty(a_old)) {
            return 1;
        } else {
            return -1;
        }
    } else {
        var res;
        for (var i in a_old) {
            res = _remSelTree(a_old[i].ch, a_rem_id);

            if (res > 0) {
                delete a_old[i];
                // Return true if empty = prune this node
                if (util.isObjEmpty(a_old)) {
                    return 1;
                } else {
                    return -1;
                }
            } else if (res < 0) {
                return -1;
            }
        }

        return 0;
    }
}

function _getSelTreeColl(a_sel, a_res) {
    if (util.isObjEmpty(a_sel.ch)) {
        // Leaf node
        return true;
    } else {
        for (var id in a_sel.ch) {
            if (_getSelTreeColl(a_sel.ch[id], a_res) && id.startsWith("c/")) {
                a_res.push(id);
            }
        }
        return false;
    }
}

function SearchPanel(a_frame, a_key, a_parent, a_opts = {}) {
    $("#srch_date_from", a_frame).attr("id", "srch_date_from_" + a_key);
    $("#srch_date_from_ts", a_frame).attr("id", "srch_date_from_ts_" + a_key);
    $("#srch_date_to", a_frame).attr("id", "srch_date_to_" + a_key);
    $("#srch_date_to_ts", a_frame).attr("id", "srch_date_to_ts_" + a_key);

    var inst = this,
        tags_div = $("#srch_tags", a_frame),
        user_tags = [],
        date_from = $("#srch_date_from_" + a_key, a_frame),
        date_from_ts = $("#srch_date_from_ts_" + a_key, a_frame),
        date_to = $("#srch_date_to_" + a_key, a_frame),
        date_to_ts = $("#srch_date_to_ts_" + a_key, a_frame),
        srch_sel_div = $("#srch_sel", a_frame),
        srch_sel,
        qry_doc = null,
        suppress_run = false;

    this.setSearchSelect = function (a_sel_info) {
        if (a_sel_info) {
            if (srch_sel && srch_sel.owner == a_sel_info.owner) {
                // Merge with existing selection
                // Note: existing methods (assign, extend, ...) do NOT actually merge - existing fields are overwriten
                _addSelTree(srch_sel.ch, a_sel_info.ch);
            } else {
                srch_sel = a_sel_info;
            }
        } else {
            srch_sel = null;
        }

        inst._updateSelectionHTML();
        inst._runSearch();
    };

    this._updateSelectionHTML = function () {
        var html = "";

        if (srch_sel) {
            html = _makeSelTree(srch_sel.ch);
        }

        srch_sel_div.html(html);
        $(".btn", srch_sel_div).button();
    };

    this.addSelected = function () {
        var sel = a_parent.searchPanel_GetSelection();
        if (sel) {
            inst.setSearchSelect(sel);
        }
    };

    this.setQuery = function (query) {
        // Protobuf Enums returned as string names, not integers
        var sm = model.SearchModeFromString[query.mode];
        $(".srch-mode", a_frame).val(sm).selectmenu("refresh");
        $(".srch-sort", a_frame)
            .val(
                query.sortRev
                    ? -model.SortFromString[query.sort]
                    : model.SortFromString[query.sort],
            )
            .selectmenu("refresh");

        $("#srch_id", a_frame).val(query.id ? query.id : "");
        $("#srch_id_div").accordion("option", "active", query.id ? 0 : false);

        $("#srch_text", a_frame).val(query.text ? query.text : "");
        $("#srch_text_div").accordion("option", { active: query.text ? 0 : false });

        if (query.tags) {
            suppress_run = true;
            tags_div.tagit("removeAll");
            for (var i in query.tags) {
                tags_div.tagit("createTag", query.tags[i]);
            }
            suppress_run = false;
            $("#srch_tags_div").accordion("option", { active: 0 });
        } else {
            suppress_run = true;
            tags_div.tagit("removeAll");
            suppress_run = false;
            $("#srch_tags_div").accordion("option", { active: false });
        }

        if (query.from || query.to) {
            date_from.datepicker("setDate", query.from ? new Date(query.from * 1000) : null);
            date_to.datepicker("setDate", query.to ? new Date(query.to * 1000) : null);
            $("#srch_date_div").accordion("option", { active: 0 });
        } else {
            date_from.datepicker("setDate", null);
            date_to.datepicker("setDate", null);
            $("#srch_date_div").accordion("option", { active: false });
        }

        $("#srch_creator", a_frame).val(query.creator ? query.creator : "");
        $("#srch_creator_div").accordion("option", "active", query.creator ? 0 : false);

        if (sm == model.SM_DATA) {
            $("#srch_sch_id", a_frame).val(query.schId ? query.schId : "");
            $("#srch_meta", a_frame).val(query.meta ? query.meta : "");
            $("#srch_meta_err", a_frame).prop("checked", query.metaErr ? true : false);
            $("#srch_meta_div").accordion("option", {
                active: query.schId || query.meta || query.metaErr ? 0 : false,
            });
            $(".srch-data-options", a_frame).show();
        } else {
            $(".srch-data-options", a_frame).hide();
            $("#srch_sch_id", a_frame).val("");
            $("#srch_meta", a_frame).val("");
            $("#srch_meta_err", a_frame).prop("checked", false);
        }
    };

    this.getQuery = function () {
        var tmp,
            query = { empty: true };

        if (!a_opts.no_select && srch_sel) {
            query.owner = srch_sel.owner;

            // Add any/all leaf nodes that are collections in sel tree as coll entries in query
            var coll = [];
            _getSelTreeColl(srch_sel, coll);
            if (coll.length) {
                query.coll = coll;
            }
        }

        query.mode = parseInt($(".srch-mode", a_frame).val());

        query.sort = parseInt($(".srch-sort", a_frame).val());

        if (query.sort < 0) {
            query.sort = -query.sort;
            query.sortRev = true;
        } else {
            query.sortRev = false;
        }

        tmp = $("#srch_id", a_frame).val();
        if (tmp) {
            query.id = tmp;
            query.empty = false;
        }

        tmp = $("#srch_text", a_frame).val();
        if (tmp) {
            query.text = tmp;
            query.empty = false;
        }

        query.tags = user_tags;
        if (query.tags.length) {
            query.empty = false;
        }

        if (date_from.val()) {
            query.from = parseInt(date_from_ts.val()) / 1000;
            query.empty = false;
        }

        if (date_to.val()) {
            query.to = parseInt(date_to_ts.val()) / 1000;
            query.empty = false;
        }

        if (a_opts.no_select) {
            tmp = $("#srch_owner", a_frame).val().trim();
            if (tmp) {
                query.owner = tmp;
                query.empty = false;
            }
        }

        tmp = $("#srch_creator", a_frame).val().trim();
        if (tmp) {
            query.creator = tmp;
            query.empty = false;
        }

        if (query.mode == model.SM_DATA) {
            tmp = $("#srch_sch_id", a_frame).val();
            if (tmp) {
                query.schId = tmp;
                query.empty = false;
            }

            tmp = $("#srch_meta", a_frame).val();
            if (tmp) {
                query.meta = tmp;
                query.empty = false;
            }

            if ($("#srch_meta_err", a_frame).prop("checked")) {
                query.metaErr = true;
                query.empty = false;
            }
        }

        return query;
    };

    this._setMetaQuery = function (a_qry) {
        var expr = query_builder.queryToExpression(a_qry);
        if (expr) {
            qry_doc = a_qry;
            $("#srch_meta", a_frame).val(expr);
        }
    };

    this._runSearch = function () {
        a_parent.searchPanel_Run(inst.getQuery());
    };

    // ----- Run query button -----

    if (a_opts.no_run_btn) {
        $("#srch_run_btn", a_frame).hide();
    } else {
        $("#srch_run_btn", a_frame).on("click", function () {
            inst._runSearch();
        });
    }

    // ----- Search mode -----

    $(".srch-mode", a_frame).on("selectmenuchange", function () {
        var cur_mode = parseInt($(".srch-mode", a_frame).val());
        if (cur_mode == model.SM_DATA) {
            $(".srch-data-options", a_frame).show();
        } else {
            $(".srch-data-options", a_frame).hide();
        }
    });

    // ----- Search Selection -----

    if (a_opts.no_select) {
        $("#srch_sel_div", a_frame).hide();
    } else {
        $("#srch_sel", a_frame).on("click", ".srch-sel-rem-btn", function () {
            var el = $(this),
                item = el.closest(".srch-sel-item"),
                id = item.attr("data");

            _remSelTree(srch_sel.ch, id);

            if (util.isObjEmpty(srch_sel.ch)) {
                srch_sel = null;
            }

            inst._updateSelectionHTML();
            inst._runSearch();
        });

        $("#srch_sel", a_frame).on("dragover", function (ev) {
            ev.preventDefault();
        });

        $("#srch_sel", a_frame).on("drop", function (ev) {
            console.log("sel drop!");
            ev.preventDefault();
            inst.addSelected();
        });

        $("#srch_sel_add", a_frame).on("click", function () {
            inst.addSelected();
        });

        $("#srch_sel_clear", a_frame).on("click", function () {
            inst.setSearchSelect();
        });
    }

    // ----- Tag input setup -----

    tags_div.tagit({
        autocomplete: {
            delay: 500,
            minLength: 3,
            source: "/api/tag/autocomp",
        },
        caseSensitive: false,
        removeConfirmation: true,
        afterTagAdded: function (ev, ui) {
            console.log("tag add");
            user_tags.push(ui.tagLabel);
            if (!suppress_run) {
                inst._runSearch();
            }
        },
        beforeTagRemoved: function (ev, ui) {
            var idx = user_tags.indexOf(ui.tagLabel);
            if (idx != -1) user_tags.splice(idx, 1);
        },
        afterTagRemoved: function () {
            if (!suppress_run) {
                inst._runSearch();
            }
        },
    });

    $(".tagit-new", a_frame).css("clear", "left");

    $("#srch_tags_clear", a_frame).on("click", function () {
        if (user_tags.length) {
            suppress_run = true;
            tags_div.tagit("removeAll");
            suppress_run = false;
            inst._runSearch();
        }
    });

    // ----- Search ID setup -----

    $("#srch_id_clear", a_frame).on("click", function () {
        if ($("#srch_id", a_frame).val().trim().length) {
            $("#srch_id", a_frame).val("");
            inst._runSearch();
        }
    });

    // ----- Text fields input setup -----

    // Trigger timer on input to run search after pause
    // Does not include metadata input as this would cause DB errors if the user pauses while typing

    var textTimer = null;

    $("#srch_id,#srch_text,#srch_owner,#srch_creator,#srch_sch_id", a_frame).on(
        "input",
        function (ev) {
            if (textTimer) {
                clearTimeout(textTimer);
            }

            textTimer = setTimeout(function () {
                textTimer = null;
                inst._runSearch();
            }, 1000);
        },
    );

    $("#srch_id,#srch_text,#srch_owner,#srch_creator,#srch_sch_id", a_frame).on(
        "keypress",
        function (ev) {
            if (ev.keyCode == 13) {
                if (textTimer) {
                    clearTimeout(textTimer);
                }

                ev.preventDefault();
                inst._runSearch();
            } else {
                qry_doc = null;
            }
        },
    );

    $("#srch_text_clear", a_frame).on("click", function () {
        if ($("#srch_text", a_frame).val().trim().length) {
            $("#srch_text", a_frame).val("");
            if (textTimer) {
                clearTimeout(textTimer);
            }

            inst._runSearch();
        }
    });

    // ----- Schema input setup -----

    $("#srch_sch_pick", a_frame).on("click", function () {
        dlgSchemaList.show(true, false, function (schema) {
            var id = schema.id + ":" + schema.ver;
            if ($("#srch_sch_id", a_frame).val() != id) {
                $("#srch_sch_id", a_frame).val(id);
                if (textTimer) {
                    clearTimeout(textTimer);
                }

                inst._runSearch();
            }
        });
    });

    // ----- Metadata input setup -----

    $("#srch_meta", a_frame).on("keypress", function (ev) {
        if (ev.keyCode == 13) {
            ev.preventDefault();
            inst._runSearch();
        } else {
            qry_doc = null;
        }
    });

    $("#srch_meta_build", a_frame).on("click", function () {
        var sch_id = $("#srch_sch_id", a_frame).val().trim();
        if (sch_id) {
            api.schemaView(sch_id, true, function (ok, reply) {
                if (!ok) {
                    util.setStatusText(reply, true);
                }
                dlgQueryBuild.show(ok ? reply.schema[0] : null, qry_doc, function (qry) {
                    inst._setMetaQuery(qry);
                    inst._runSearch();
                });
            });
        } else {
            dlgQueryBuild.show(null, qry_doc, function (qry) {
                inst._setMetaQuery(qry);
                inst._runSearch();
            });
        }
    });

    $("#srch_meta_clear", a_frame).on("click", function () {
        if (
            $("#srch_meta", a_frame).val().trim().length ||
            $("#srch_sch_id", a_frame).val().trim().length
        ) {
            $("#srch_meta,#srch_sch_id", a_frame).val("");
            qry_doc = null;
            inst._runSearch();
        }
    });

    $("#srch_meta_err", a_frame).on("change", function () {
        inst._runSearch();
    });

    // ----- Owner input setup -----

    if (!a_opts.no_select) {
        $("#srch_owner_div", a_frame).hide();
    } else {
        $("#srch_owner_pick_user", a_frame).on("click", function () {
            dlgPickUser.show("u/" + settings.user.uid, [], true, function (users) {
                if ($("#srch_owner", a_frame).val().trim() != users[0]) {
                    $("#srch_owner", a_frame).val(users[0]);
                    inst._runSearch();
                }
            });
        });

        $("#srch_owner_pick_proj", a_frame).on("click", function () {
            dlgPickProj.show([], true, function (projs) {
                if ($("#srch_owner", a_frame).val().trim() != projs[0]) {
                    $("#srch_owner", a_frame).val(projs[0]);
                    inst._runSearch();
                }
            });
        });

        $("#srch_owner_clear", a_frame).on("click", function () {
            if ($("#srch_owner", a_frame).val().trim().length) {
                $("#srch_owner", a_frame).val("");
                inst._runSearch();
            }
        });
    }

    // ----- Creator input setup -----

    $("#srch_creator_pick_user", a_frame).on("click", function () {
        dlgPickUser.show("u/" + settings.user.uid, [], true, function (users) {
            if ($("#srch_creator", a_frame).val().trim() != users[0]) {
                $("#srch_creator", a_frame).val(users[0]);
                inst._runSearch();
            }
        });
    });

    $("#srch_creator_clear", a_frame).on("click", function () {
        if ($("#srch_creator", a_frame).val().trim().length) {
            $("#srch_creator", a_frame).val("");
            inst._runSearch();
        }
    });

    // ----- Date input setup -----

    date_from.datepicker({
        altField: date_from_ts, //$("#srch_date_from_ts",a_frame),
        altFormat: "@",
        beforeShow: function () {
            var _to = date_to.val();
            if (_to) {
                date_from.datepicker("option", "maxDate", _to);
            }
        },
        onClose: function (date) {
            if (date) {
                inst._runSearch();
            }
        },
    });

    date_to.datepicker({
        altField: date_to_ts, //$("#srch_date_to_ts",a_frame),
        altFormat: "@",
        beforeShow: function (input, picker) {
            var _from = date_from.val();
            if (_from) {
                date_to.datepicker("option", "minDate", _from);
            }
        },
        onClose: function (date) {
            if (date) {
                inst._runSearch();
            }
        },
    });

    $("#srch_datetime_clear", a_frame).on("click", function () {
        date_from.val("");
        date_to.val("");
        inst._runSearch();
    });

    util.inputTheme($("input,textarea", a_frame));

    $(".srch-mode", a_frame).selectmenu({ width: false });
    $(".srch-sort", a_frame).selectmenu({ width: false });

    $(".srch-mode,.srch-sort", a_frame).on("selectmenuchange", function () {
        inst._runSearch();
    });

    $(".accordion.acc-act", a_frame).accordion({
        header: "h3",
        collapsible: true,
        heightStyle: "content",
        create: function (ev, ui) {
            ui.header.removeClass("ui-state-active");
        },
        activate: function (ev, ui) {
            ui.newHeader.removeClass("ui-state-active");
        },
    });

    $(".accordion:not(.acc-act)", a_frame).accordion({
        header: "h3",
        collapsible: true,
        heightStyle: "content",
        active: false,
        activate: function (ev, ui) {
            ui.newHeader.removeClass("ui-state-active");
        },
    });

    return this;
}
