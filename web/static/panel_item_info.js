import * as util from "./util.js";
import * as model from "./model.js";
import * as settings from "./settings.js";
import * as api from "./api.js";
import * as dlgAnnotation from "./dlg_annotation.js";

var form = $("#sel_info_form"),
    info_tabs = $("#info-tabs"),
    tabs_parent = $("#info-tabs-parent"),
    tabs_parent_vis = true,
    title_div = $("#sel_info_title"),
    desc_div = $("#sel_info_desc"),
    note_div = $("#note-div"),
    note_details = $("#note-details"),
    schema_val_err_div = $("#schema_val_err_div"),
    schema_val_err = $("#schema_val_err"),
    data_md_tree = null,
    data_md_empty = true,
    tree_empty_src = [{ title: "(none)", icon: false }],
    data_md_exp = {},
    note_active_tree = null,
    note_open_tree = null,
    note_closed_tree = null,
    note_icon = ["circle-help", "circle-info", "alert", "flag"],
    cur_item_id = null,
    cur_note = null,
    cur_note_node = null,
    ignore_call = false;

jQuery.fn.extend({
    onFirst: function (name, fn) {
        var elem, handlers, i, _len;

        this.on(name, fn);

        for (i = 0, _len = this.length; i < _len; i++) {
            elem = this[i];
            handlers = jQuery._data(elem).events[name.split(".")[0]];
            handlers.unshift(handlers.pop());
        }
    },
});

export function showSelectedInfo(node, cb) {
    if (ignore_call) {
        ignore_call = false;
        return;
    }

    /*if ( node ){
        console.log( "node key:", node.key, "scope:", node.data?node.data.scope:"n/a" );
    }*/

    var key;

    if (!node) {
        showSelectedItemInfo();
        return;
    } else if (typeof node == "string") key = node;
    else if (node.key == "shared_proj" && node.data.scope) key = node.data.scope;
    //else if ( node.key.startsWith( "t/" ) && node.data.scope )
    //    key = node.data.scope;
    else if (node.data.key_pfx) key = node.key.substr(node.data.key_pfx.length);
    else key = node.key;

    cur_item_id = key;

    if (key[0] == "c") {
        api.collView(key, function (item) {
            showSelectedItemInfo(item);
            if (cb) cb(item, node);
        });
    } else if (key[0] == "d") {
        api.dataView(key, function (data) {
            showSelectedItemInfo(data);
            if (cb) cb(data, node);
        });
    } else if (key.startsWith("task/")) {
        api.taskView(key, function (data) {
            //console.log("task view:",data );
            showSelectedItemInfo(data);
            if (cb) cb(data, node);
        });
    } else if (key.startsWith("t/")) {
        console.log("show topic", key);
        api.topicView(key, function (data) {
            console.log("show topic info", data);
            showSelectedItemInfo(data);
            if (cb) cb(data, node);
        });
    } else if (key == "mydata") {
        showGeneralInfo(key, "Data data owned by you");
    } else if (key == "projects") {
        showGeneralInfo(key, "Accessible projects and associated data");
    } else if (key == "shared_all") {
        showGeneralInfo(key, "Data shared with you");
    } else if (key == "shared_user") {
        showGeneralInfo(key, "Data shared with you by users.");
    } else if (key == "shared_proj") {
        showGeneralInfo(key, "Data shared with you by projects.");
    } else if (key == "queries") {
        showGeneralInfo(key, "Saved queries created by you");
    } else if (key.startsWith("p/")) {
        showSelectedProjInfo(key, node, cb);
    } else if (key.startsWith("q/")) {
        api.queryView(key, function (ok, item) {
            console.log("qryView:", ok, item);
            showSelectedItemInfo(item);
            if (cb) cb(item, node);
        });
    } else if (key.startsWith("u/")) {
        showSelectedUserInfo(key, node, cb);
    } else if (key.startsWith("shared_user_") && node.data.scope) {
        showSelectedUserInfo(node.data.scope, node, cb);
    } else if (key.startsWith("shared_proj_") && node.data.scope) {
        showSelectedProjInfo(node.data.scope, node, cb);
    } else if (key == "allocs") {
        showGeneralInfo(key, "Data allocations and associated data records");
    } else if (key.startsWith("published")) {
        showGeneralInfo(key, "Collections published in DataFed catalog");
    } else if (key.startsWith("repo/")) {
        showSelectedAllocInfo(node.data.repo, node.data.scope, node, cb);
    } else {
        showSelectedItemInfo();
    }
}

export function showSelectedItemInfo(item) {
    var disabled = [];

    //console.log("show info",item);

    if (item && item.id) {
        if (!tabs_parent_vis) {
            tabs_parent.show();
            tabs_parent_vis = true;

            // Recompute jquery-ui tabs height
            var h = tabs_parent.height(),
                hdr_h = $(".ui-tabs-nav", info_tabs).outerHeight();

            info_tabs.outerHeight(h);
            $("#info-tabs > .ui-tabs-panel").outerHeight(h - hdr_h);
        }

        cur_item_id = item.id;

        if (item.desc) {
            desc_div.html(marked(util.escapeHTML(item.desc)));
            desc_div.show();
        } else {
            //disabled.push(0);
            desc_div.hide();
        }

        showSelectedItemForm(item);

        if (
            (item.id.startsWith("d/") || item.id.startsWith("c/")) &&
            item.notes & model.NOTE_MASK_ALL
        ) {
            setupAnnotationTab(item.id);
        } else {
            note_div.hide();
            disabled.push(2);
        }

        if (item.metadata) {
            showSelectedMetadata(item.metadata, item.mdErrMsg);
        } else {
            disabled.push(1);
            showSelectedMetadata();
        }

        $("#info-tabs").tabs("option", "disabled", disabled);
    } else {
        cur_item_id = null;
        showGeneralInfo(null, "Select an item in left-hand panels to view additional information.");
    }
}

export function getActiveItemID() {
    return cur_item_id;
}

function showGeneralInfo(a_key, a_title) {
    $("#sel_info_icon")
        .removeClass()
        .addClass("ui-icon ui-icon-" + (a_key ? util.getKeyIcon(a_key) : "circle-help"));
    // SEC: title does NOT need to be escaped - built in strings only
    title_div.html(a_title);
    if (tabs_parent_vis) {
        tabs_parent.hide();
        tabs_parent_vis = false;
    }
}

function showSelectedUserInfo(key, node, cb) {
    api.userView(key, true, function (ok, item) {
        if ((ok, item)) {
            //console.log("userView:",item);
            item.id = item.uid;
            showSelectedItemInfo(item);
            if (cb) cb(item, node);
        } else {
            showSelectedItemInfo();
        }
    });
}

function showSelectedProjInfo(key, node, cb) {
    api.projView(key, function (item) {
        showSelectedItemInfo(item);
        if (cb) cb(item, node);
    });
}

var tree_opts1 = {
    extensions: ["themeroller"],
    themeroller: {
        activeClass: "my-fancytree-active",
        hoverClass: "",
    },
    source: [],
    nodata: false,
    selectMode: 1,
    activate: function (ev, data) {
        showSelectedNoteInfo(data.node);
    },
    lazyLoad: function (ev, data) {
        data.result = { url: api.annotationView_url(data.node.data.parentId), cache: false };
    },
    postProcess: function (ev, data) {
        //console.log("postproc:",data);

        data.result = [];
        var note, nt, entry, resp;

        if (Array.isArray(data.response)) resp = data.response;
        else resp = data.response.note;

        for (var i in resp) {
            note = resp[i];
            (nt = model.NoteTypeFromString[note.type]),
                (entry = { icon: false, key: note.id, subject_id: note.subject_id });

            if (note.parentId) {
                //entry.title = "<span class='inh-"+(nt == model.NOTE_ERROR?"err":"warn")+"-title'>(<i class='ui-icon ui-icon-" + note_icon[nt] + " inh-"+(nt == model.NOTE_ERROR?"err":"warn")+"-title'></i>)</span> ";
                entry.title =
                    "<span class='ui-icon ui-icon-" + note_icon[nt] + "'></span> [inherited] ";
                // Only allow viewing ancestor notes if note is open or active
                if (model.NoteStateFromString[note.state] != model.NOTE_CLOSED) {
                    entry.parentId = note.parentId;
                    entry.folder = true;
                    entry.lazy = true;
                }
            } else {
                entry.title = "<span class='ui-icon ui-icon-" + note_icon[nt] + "'></span> ";
            }

            entry.title += util.escapeHTML(note.title);

            data.result.push(entry);
        }
    },
};

$("#note_active_tree").fancytree(tree_opts1);
note_active_tree = $.ui.fancytree.getTree("#note_active_tree");

$("#note_open_tree").fancytree(tree_opts1);
note_open_tree = $.ui.fancytree.getTree("#note_open_tree");

$("#note_closed_tree").fancytree(tree_opts1);
note_closed_tree = $.ui.fancytree.getTree("#note_closed_tree");

function setupAnnotationTab(a_subject_id, a_cb) {
    note_details.html("");
    note_div.hide();
    cur_note = null;
    cur_note_node = null;

    $(".btn-note-comment").button("option", "disabled", true);
    $(".btn-note-edit").button("option", "disabled", true);
    $(".btn-note-activate")
        .button("option", "disabled", true)
        .button("option", "label", "Activate");
    $(".btn-note-open").button("option", "disabled", true).button("option", "label", "Open");

    api.annotationListBySubject(a_subject_id, function (ok, data) {
        if (ok) {
            //console.log("data:",data);
            var note_active = [],
                note_open = [],
                note_closed = [],
                note,
                ns;

            if (data.note) {
                for (var i = 0; i < data.note.length; i++) {
                    note = data.note[i];
                    ns = model.NoteStateFromString[note.state];

                    if (ns == model.NOTE_ACTIVE) {
                        note_active.push(note);
                    } else if (ns == model.NOTE_OPEN) {
                        note_open.push(note);
                    } else {
                        note_closed.push(note);
                    }
                }
            }

            if (note_active.length) {
                note_active_tree.reload(note_active);
            } else {
                note_active_tree.reload(tree_empty_src);
            }

            if (note_open.length) {
                note_open_tree.reload(note_open);
            } else {
                note_open_tree.reload(tree_empty_src);
            }

            if (note_closed.length) {
                note_closed_tree.reload(note_closed);
            } else {
                note_closed_tree.reload(tree_empty_src);
            }

            var disabled = [];
            if (note_active.length == 0) disabled.push(0);
            if (note_open.length == 0) disabled.push(1);
            if (note_closed.length == 0) disabled.push(2);

            $("#note-tabs").tabs("option", "disabled", disabled);
            note_div.show();

            if (a_cb) a_cb();
        }
    });
}

function showSelectedNoteInfo(node) {
    console.log("showSelectedNoteInfo", node.key);
    if (!node.key.startsWith("n/")) {
        note_details.html("");
        return;
    }

    api.annotationView(node.key, function (ok, data) {
        if (ok && data.note) {
            var note = data.note[0],
                html,
                comm,
                date_ct = new Date(),
                date_ut = new Date();

            cur_note = note;
            cur_note_node = node;

            //console.log("note:",note);

            date_ct.setTime(note.ct * 1000);
            date_ut.setTime(note.ut * 1000);

            // >>>>>>>>>>>>>>>> CYBERSEC: ALL user-sourced data MUST be escaped <<<<<<<<<<<<<<<<

            html = "<div style='height:100%;overflow:auto'>";

            //var has_admin = ( note.comment[0].user == "u/"+settings.user.uid );

            for (var i in note.comment) {
                comm = note.comment[i];
                date_ut.setTime(comm.time * 1000);
                html +=
                    "<div style='padding:1em 0 0 .2em'>" +
                    date_ut.toLocaleDateString("en-US", settings.date_opts) +
                    ", user <b>" +
                    comm.user.substr(2) +
                    "</b>";

                if (comm.type) {
                    if (i == 0) {
                        html += " created annotation as <b>";
                    } else {
                        html += " changed annotation to <b>";
                    }

                    switch (comm.type) {
                        case "NOTE_QUESTION":
                            html += "QUESTION";
                            break;
                        case "NOTE_INFO":
                            html += "INFORMATION";
                            break;
                        case "NOTE_WARN":
                            html += "WARNING";
                            break;
                        case "NOTE_ERROR":
                            html += "ERROR";
                            break;
                    }

                    html += "</b>";
                }

                if (comm.state) {
                    if (i == 0) {
                        html += " in state <b>";
                    } else if (comm.state) {
                        html += " and set state to <b>";
                    } else {
                        html += " set state to <b>";
                    }

                    switch (comm.state) {
                        case "NOTE_OPEN":
                            html += "OPEN";
                            break;
                        case "NOTE_CLOSED":
                            html += "CLOSED";
                            break;
                        case "NOTE_ACTIVE":
                            html += "ACTIVE";
                            break;
                    }

                    html += "</b>";
                }

                if (comm.type === undefined && comm.state === undefined) {
                    html += " commented on annotation";
                }

                html += ".<br>";

                if (settings.user && comm.user == "u/" + settings.user.uid) {
                    html +=
                        "<div class='row-flex' style='padding:.5em;align-items:flex-end'><div class='ui-widget-content' style='flex:1 1 auto;padding:0.5em;white-space:pre-wrap'>" +
                        util.escapeHTML(comm.comment) +
                        "</div>";
                    html +=
                        "<div style='flex:none;padding:0 0 0 1em'><button class='btn btn-note-edit-comment' id='btn_note_edit_" +
                        i +
                        "'>Edit</button></div></div>";
                } else {
                    html +=
                        "<div class='ui-widget-content' style='margin:0.5em;padding:0.5em;white-space:pre-wrap'>" +
                        util.escapeHTML(comm.comment) +
                        "</div>";
                }

                html += "</div>";
            }
            html += "</div>";

            note_details.html(html);
            $(".btn", note_details).button();

            $(".btn-note-edit-comment", note_details).on("click", function () {
                console.log("edit comment");
                if (cur_note) {
                    var idx = parseInt(this.id.substr(this.id.lastIndexOf("_") + 1));
                    dlgAnnotation.show(
                        cur_note.subjectId,
                        cur_note,
                        null,
                        idx,
                        function (new_note) {
                            if (new_note) {
                                showSelectedNoteInfo(cur_note_node);
                            }
                        },
                    );
                }
            });

            if (cur_note.state == "NOTE_ACTIVE") {
                $(".btn-note-comment").button("option", "disabled", false);
                $(".btn-note-edit").button("option", "disabled", false);
                $(".btn-note-activate")
                    .button("option", "disabled", false)
                    .button("option", "label", "Deactivate");
                $(".btn-note-open")
                    .button("option", "disabled", false)
                    .button("option", "label", "Close");
            } else if (cur_note.state == "NOTE_OPEN") {
                $(".btn-note-comment").button("option", "disabled", false);
                $(".btn-note-edit").button("option", "disabled", false);
                $(".btn-note-activate")
                    .button("option", "disabled", false)
                    .button("option", "label", "Activate");
                $(".btn-note-open")
                    .button("option", "disabled", false)
                    .button("option", "label", "Close");
            } else {
                $(".btn-note-comment").button("option", "disabled", true);
                $(".btn-note-edit").button("option", "disabled", true);
                $(".btn-note-activate")
                    .button("option", "disabled", true)
                    .button("option", "label", "Activate");
                $(".btn-note-open")
                    .button("option", "disabled", false)
                    .button("option", "label", "Reopen");
            }
        }
    });
}

$(".btn-note-comment").on("click", function () {
    if (cur_note) {
        ignore_call = true;
        dlgAnnotation.show(cur_note.subjectId, cur_note, null, null, function (new_note) {
            if (new_note) {
                showSelectedNoteInfo(cur_note_node);
                //setupAnnotationTab( cur_note.subjectId );
            }
        });
    }
});

$(".btn-note-edit").on("click", function () {
    if (cur_note) {
        ignore_call = true;
        dlgAnnotation.show(cur_note.subjectId, cur_note, null, -1, function (new_note) {
            if (new_note) {
                setupAnnotationTab(cur_note.subjectId);
            }
        });
    }
});

$(".btn-note-open").on("click", function () {
    if (cur_note) {
        ignore_call = true;
        console.log("note state:", cur_note.state);
        // Close/Reopen
        dlgAnnotation.show(
            cur_note.subjectId,
            cur_note,
            cur_note.state != "NOTE_CLOSED" ? model.NOTE_CLOSED : model.NOTE_OPEN,
            null,
            function (new_note) {
                if (new_note) {
                    setupAnnotationTab(cur_note.subjectId);
                }
            },
        );
    }
});

/*$(".btn-note-close",note_details).on("click",function(){
    dlgAnnotation.show( note.subjectId, note, model.NOTE_CLOSED, null, function( new_note ){
        if ( new_note ){
            setupAnnotationTab( note.subjectId );
        }
    });
});*/

$(".btn-note-activate").on("click", function () {
    if (cur_note) {
        ignore_call = true;
        console.log("note state:", cur_note.state);
        // Activate/deactivate
        dlgAnnotation.show(
            cur_note.subjectId,
            cur_note,
            cur_note.state == "NOTE_ACTIVE" ? model.NOTE_OPEN : model.NOTE_ACTIVE,
            null,
            function (new_note) {
                if (new_note) {
                    setupAnnotationTab(cur_note.subjectId);
                }
            },
        );
    }
});

/*$(".btn-note-deactivate",note_details).on("click",function(){
    dlgAnnotation.show( note.subjectId, note, model.NOTE_OPEN, null, function( new_note ){
        if ( new_note ){
            setupAnnotationTab( note.subjectId );
        }
    });
});*/

$("#note-tabs").tabs({
    heightStyle: "content",
    active: 0,
    activate: function (ev, ui) {
        //console.log("tab act:",ui);
        var node;

        if (ui.newPanel[0].id == "tab-note-active") {
            node = note_active_tree.getActiveNode();
        } else if (ui.newPanel[0].id == "tab-note-open") {
            node = note_open_tree.getActiveNode();
        } else {
            node = note_closed_tree.getActiveNode();
        }

        if (node) showSelectedNoteInfo(node);
        else note_details.html("");
    },
});

function showSelectedAllocInfo(repo, user, node, cb) {
    api.allocView(repo, user, function (ok, data) {
        if (ok) {
            var item = data.alloc[0];
            item.user = item.id;
            item.id = item.repo;
            showSelectedItemInfo(item);
            if (cb) cb(item, node);
        } else {
            showSelectedItemInfo();
        }
    });
}

function showSelectedItemForm(item) {
    var i,
        tmp,
        date = new Date(),
        t = item.id.charAt(0),
        text,
        cls,
        title,
        type,
        icon;

    switch (t) {
        case "d":
            type = "Data Record";
            icon = "";
            title = item.title;
            cls = item.doi ? ".sidp" : ".sid";
            break;
        case "c":
            type = "Collection";
            title = item.title;
            cls = ".sic";
            break;
        case "u":
            type = "User";
            title = util.escapeHTML(item.nameFirst) + " " + util.escapeHTML(item.nameLast);
            cls = ".siu";
            break;
        case "p":
            type = "Project";
            title = item.title;
            cls = ".sip";
            break;
        case "r":
            type = "Allocation";
            title =
                "Allocation for " +
                (item.user.startsWith("u/") ? " user " : " project ") +
                item.user;
            cls = ".sia";
            break;
        case "q":
            type = "Saved Query";
            title = item.title;
            cls = ".siq";
            break;
        case "t":
            if (item.id.charAt(1) == "/") {
                type = "Catalog Category";
                title = item.title.charAt(0).toUpperCase() + item.title.substr(1);
                cls = ".sitp";
            } else {
                type = "Background Task";
                title = "Background Task";
                cls = ".sit";
            }
            break;
        default:
            return;
    }

    $("#sel_info_icon")
        .removeClass()
        .addClass(
            item.id.startsWith("d/")
                ? util.getDataIcon(item)
                : "ui-icon ui-icon-" + util.getKeyIcon(item.id),
        );

    title_div.text(title);

    $(".sel-info-table td:nth-child(2)", form)
        .not(".ignore")
        .html("<span style='color:#808080'>(none)</span>");

    $("#sel_info_type", form).text(type);

    if (cls == ".sitp") $("#sel_info_id", form).text(item.title);
    else $("#sel_info_id", form).text(item.id);

    if (item.alias && cls != ".sidp") $("#sel_info_alias", form).text(item.alias);

    if (item.doi) $("#sel_info_doi", form).text(item.doi);

    if (item.dataUrl) $("#sel_info_url", form).text(item.dataUrl);

    if (item.tags) {
        tmp = "";
        for (i in item.tags) {
            if (tmp) tmp += ", ";
            tmp += item.tags[i];
        }
        $("#sel_info_tags", form).text(tmp);
    }

    if (item.schId) $("#sel_info_schema", form).text(item.schId);

    if (item.topic) $("#sel_info_topic", form).text(item.topic);

    if (item.owner) $("#sel_info_owner", form).text(item.owner);

    if (item.creator) $("#sel_info_creator", form).text(item.creator);

    if (cls == ".sid") {
        $("#sel_info_loc", form).text(item.external ? "External" : item.repoId.substr(5));
        $("#sel_info_size", form).text(item.external ? "Unknown" : util.sizeToString(item.size));
        if (item.source) $("#sel_info_src", form).text(item.source);

        $("#sel_info_ext", form).text(
            item.external
                ? "(auto)"
                : (item.ext ? item.ext + " " : "") + (item.extAuto ? "(auto)" : ""),
        );
    }

    if (cls == ".siq") {
        $("#sel_info_qry_mode", form).text(item.query.mode == "SM_DATA" ? "Data" : "Collections");

        $("#sel_info_qry_pub", form).text(item.query.published ? "Yes" : "No");

        if (item.query.catTags) {
            $("#sel_info_qry_cat", form).text(item.query.catTags.join("."));
        }

        if (item.query.coll) {
            tmp = "";
            for (i in item.query.coll) {
                if (tmp) {
                    tmp += ", ";
                }
                tmp += item.query.coll[i];
            }
        } else {
            tmp = "All data";
        }

        $("#sel_info_qry_sel", form).text(tmp);

        if (item.query.id) {
            $("#sel_info_qry_id", form).text(item.query.id);
        }

        if (item.query.text) {
            $("#sel_info_qry_text", form).text(item.query.text);
        }

        if (item.query.tags) {
            tmp = "";
            for (i in item.query.tags) {
                if (tmp) tmp += ", ";
                tmp += item.query.tags[i];
            }
            $("#sel_info_qry_tags", form).text(tmp);
        }

        if (item.query.owner) {
            $("#sel_info_qry_owner", form).text(item.query.owner);
        }

        if (item.query.creator) {
            $("#sel_info_qry_creator", form).text(item.query.creator);
        }

        if (item.query.from) {
            date.setTime(item.query.from * 1000);
            $("#sel_info_qry_from", form).text(
                date.toLocaleDateString("en-US", settings.date_opts),
            );
        }

        if (item.query.to) {
            date.setTime(item.query.to * 1000);
            $("#sel_info_qry_to", form).text(date.toLocaleDateString("en-US", settings.date_opts));
        }

        if (item.query.schId) {
            $("#sel_info_qry_sch_id", form).text(item.query.schId);
        }

        if (item.query.meta) {
            $("#sel_info_qry_meta", form).text(item.query.meta);
        }

        if (item.query.metaErr) {
            $("#sel_info_qry_meta_err", form).text("Yes");
        }

        //repeated string             coll        = 11;
    }

    if (cls == ".sia") {
        //var is_user = item.user.startsWith("u/");
        //$("#sel_info_title",form).text( "Allocation for " + (is_user?" user ":" project ") + item.user );
        //$("#sel_info_desc",form).text( "Browse data records by allocation." );

        $("#sel_info_data_lim", form).text(util.sizeToString(item.dataLimit));
        var used = Math.max(Math.floor((10000 * item.dataSize) / item.dataLimit) / 100, 0);
        $("#sel_info_data_sz", form).text(util.sizeToString(item.dataSize) + " (" + used + " %)");
        $("#sel_info_rec_lim", form).text(item.recLimit);
        $("#sel_info_rec_cnt", form).text(item.recCount);
    }

    if (item.email) $("#sel_info_email", form).text(item.email);

    if (item.ct) {
        date.setTime(item.ct * 1000);
        $("#sel_info_ct", form).text(date.toLocaleDateString("en-US", settings.date_opts));
    }

    if (item.ut) {
        date.setTime(item.ut * 1000);
        $("#sel_info_ut", form).text(date.toLocaleDateString("en-US", settings.date_opts));
    }

    if (item.dt) {
        date.setTime(item.dt * 1000);
        $("#sel_info_dt", form).text(date.toLocaleDateString("en-US", settings.date_opts));
    }

    if (item.deps && item.deps.length) {
        var dep, id;
        text = "";
        for (i in item.deps) {
            dep = item.deps[i];
            id = dep.id + (dep.alias ? " (" + dep.alias + ")" : "");

            if (dep.dir == "DEP_OUT") {
                switch (dep.type) {
                    case "DEP_IS_DERIVED_FROM":
                        text += "Derived from " + id + "<br>";
                        break;
                    case "DEP_IS_COMPONENT_OF":
                        text += "Component of " + id + "<br>";
                        break;
                    case "DEP_IS_NEW_VERSION_OF":
                        text += "New version of " + id + "<br>";
                        break;
                }
            } else {
                switch (dep.type) {
                    case "DEP_IS_DERIVED_FROM":
                        text += "Precursor of " + id + "<br>";
                        break;
                    case "DEP_IS_COMPONENT_OF":
                        text += "Container of " + id + "<br>";
                        break;
                    case "DEP_IS_NEW_VERSION_OF":
                        text += "Old version of " + id + "<br>";
                        break;
                }
            }

            $("#sel_info_prov", form).html(text);
        }
    }

    if (cls == ".sip") {
        text = "";
        if (item.admin && item.admin.length) {
            for (i in item.admin) text += item.admin[i].substr(2) + " ";
            $("#sel_info_admins", form).text(text);
        }

        if (item.member && item.member.length) {
            text = "";
            for (i in item.member) text += item.member[i].substr(2) + " ";
            $("#sel_info_members", form).text(text);
        }
    }

    if (item.alloc && item.alloc.length) {
        var alloc, free;
        text = "";
        for (i = 0; i < item.alloc.length; i++) {
            alloc = item.alloc[i];
            free = Math.max((100 * (alloc.dataLimit - alloc.dataSize)) / alloc.dataLimit, 0);
            text +=
                alloc.repo +
                ": " +
                util.sizeToString(alloc.dataSize) +
                " of " +
                util.sizeToString(alloc.dataLimit) +
                " used (" +
                free.toFixed(1) +
                "% free)" +
                (i == 0 ? " (default)" : "") +
                "<br>";
        }
        $("#sel_info_allocs", form).html(text);
    }

    if (cls == ".sit") {
        $("#sel_info_subtype", form).text(model.TaskTypeLabel[item.type]);
        $("#sel_info_status", form).text(model.TaskStatusLabel[item.status]);

        if (item.status == "TS_FAILED" && item.msg) $("#sel_info_msg", form).text(item.msg);

        if (item.source) $("#sel_info_source", form).text(item.source);

        if (item.dest) $("#sel_info_dest", form).text(item.dest);
    }

    $(".sid,.sidp,.sic,.sip,.siu,.siq,.sia,.sit", form).hide();
    $(cls, form).show();

    form.show();
}

function showSelectedMetadata(md_str, md_err) {
    //console.log("showSelectedMetadata, inst:",inst);
    if (md_str) {
        for (var i in data_md_exp) {
            if (data_md_exp[i] == 1) delete data_md_exp[i];
            else data_md_exp[i]--;
        }

        var md = JSON.parse(md_str);
        var src = util.buildObjSrcTree(md, "md", data_md_exp);
        data_md_tree.reload(src);

        if (md_err) {
            schema_val_err.text(md_err);
            schema_val_err_div.show();
        } else {
            schema_val_err_div.hide();
        }

        if (data_md_empty) {
            data_md_empty = false;
            $("#md_div").show();
        }
    } else if (!data_md_empty) {
        data_md_tree.reload(tree_empty_src);
        schema_val_err.text("");
        data_md_empty = true;
        $("#md_div").hide();
    }
}

$("#data_md_tree").fancytree({
    extensions: ["themeroller", "filter"],
    themeroller: {
        activeClass: "my-fancytree-active",
        hoverClass: "",
    },
    filter: {
        autoExpand: true,
        mode: "hide",
    },
    source: tree_empty_src,
    nodata: false,
    selectMode: 1,
    beforeExpand: function (event, data) {
        // Handle auto-expansion
        if (data.node.isExpanded()) {
            delete data_md_exp[data.node.key];
        } else {
            data_md_exp[data.node.key] = 10;
        }
    },
});

data_md_tree = $.ui.fancytree.getTree("#data_md_tree");

function stopPropFunc(ev) {
    ev.stopPropagation();
}

$("#data_md_tree .fancytree-container")
    .on("selectstart", ".md_tree_val", stopPropFunc)
    .on("selectionchange", ".md_tree_val", stopPropFunc)
    .on("mousedown", ".md_tree_val", stopPropFunc)
    .on("mousemove", ".md_tree_val", stopPropFunc)
    .on("mouseup", ".md_tree_val", stopPropFunc);

$("#md_filter_text").on("keypress", function (e) {
    if (e.keyCode == 13) {
        var text = $("#md_filter_text").val();
        data_md_tree.filterNodes(text);
    }
});

$("#md_filter_apply").on("click", function (e) {
    var text = $("#md_filter_text").val();
    data_md_tree.filterNodes(text);
});

$("#md_filter_reset").on("click", function (e) {
    $("#md_filter_text").val("");
    data_md_tree.clearFilter();
    var node = data_md_tree.getActiveNode();
    if (node) {
        node.li.scrollIntoView();
    }
});

window.md_key_drag = function (ev) {
    var node = data_md_tree.getNodeByKey(ev.target.title);
    ev.dataTransfer.setData("text", node.key);
};
