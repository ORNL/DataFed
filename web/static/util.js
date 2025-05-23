import * as settings from "./settings.js";
import * as model from "./model.js";
import * as api from "./api.js";
import * as dialogs from "./dialogs.js";
import { transferDialog } from "./components/transfer/index.js";

var status_timer;

export function isObjEmpty(a_obj) {
    for (var i in a_obj) {
        return false;
    }
    return true;
}

export function inputTheme(a_objs) {
    a_objs.addClass("ui-widget ui-widget-content");
    return a_objs;
}

export function tooltipTheme(a_objs) {
    a_objs.tooltip({
        items: ":hover",
        //items: ".tooltip:not(:focus)",
        show: { effect: "fade", duration: 100, delay: 1500 },
        classes: { "ui-tooltip": "note ui-corner-all tooltip-style" },
        position: { my: "left+5 top+5", at: "left bottom", collision: "flipfit" },
    });
}

export function inputDisable(a_objs) {
    a_objs.prop("disabled", true).addClass("ui-state-disabled");
    return a_objs;
}

export function inputEnable(a_objs) {
    a_objs.prop("disabled", false).removeClass("ui-state-disabled");
    return a_objs;
}

// Examines input value to determine if an update has been made
// and if so, set the value in the updated object (only works for strings)
export function getUpdatedValue(a_new_val, a_old_obj, a_new_obj, a_field) {
    var tmp = a_new_val.trim(),
        old = a_old_obj[a_field];
    if ((old === undefined && tmp.length) || (old !== undefined && tmp != old))
        a_new_obj[a_field] = tmp;
}

// NOTE: values are strings containing JSON, not actual JSON objects
export function getUpdatedValueJSON(a_new_val, a_old_obj, a_new_obj, a_field) {
    var tmp = a_new_val.trim(),
        old = a_old_obj[a_field];
    if (old === undefined && tmp.length) {
        a_new_obj[a_field] = tmp;
    } else if (tmp.length) {
        // Must compare values - have to restringify both b/c formats may differ with same content
        // TODO - This should be a deep compare due to possibly inconsistent object arrangement
        var oldjs = JSON.stringify(JSON.parse(old)),
            newjs = JSON.stringify(JSON.parse(tmp));

        if (oldjs != newjs) {
            a_new_obj[a_field] = tmp;
        }
    }
}

export function sizeToString(a_bytes) {
    if (a_bytes == 0) return "0";
    else if (a_bytes < 1024) return a_bytes + " B";
    else if (a_bytes < 1048576) return Math.floor(a_bytes / 102.4) / 10 + " KB";
    else if (a_bytes < 1073741824) return Math.floor(a_bytes / 104857.6) / 10 + " MB";
    else if (a_bytes < 1099511627776) return Math.floor(a_bytes / 107374182.4) / 10 + " GB";
    else return Math.floor(a_bytes / 109951162777.6) / 10 + " TB";
}

export function countToString(a_bytes) {
    if (a_bytes < 1000) return a_bytes;
    else if (a_bytes < 1000000) return (a_bytes / 1000).toPrecision(3) + "K";
    else if (a_bytes < 1000000000) return (a_bytes / 1000000).toPrecision(3) + "M";
    else return (a_bytes / 1000000000).toPrecision(3) + "B";
}

export function parseSize(a_size_str) {
    var result = null,
        val;
    var tokens = a_size_str.toUpperCase().trim().split(" ");

    for (var i in tokens) {
        if (tokens[i].length == 0) {
            tokens.splice(i, 1);
        }
    }

    if (tokens.length == 2) {
        val = parseFloat(tokens[0]);
        if (!isNaN(val)) {
            switch (tokens[1]) {
                case "PB":
                    val *= 1024;
                /* falls through */
                case "TB":
                    val *= 1024;
                /* falls through */
                case "GB":
                    val *= 1024;
                /* falls through */
                case "MB":
                    val *= 1024;
                /* falls through */
                case "KB":
                    val *= 1024;
                /* falls through */
                case "B":
                    result = val;
                    break;
            }
        }
    } else if (tokens.length == 1) {
        if (tokens[0].endsWith("B")) {
            var len = tokens[0].length;
            var numchar = "0123456789.";
            if (numchar.indexOf(tokens[0][len - 2]) != -1) {
                val = parseFloat(tokens[0].substr(0, len - 1));
                if (!isNaN(val)) result = val;
            } else {
                val = parseFloat(tokens[0].substr(0, len - 2));
                if (!isNaN(val)) {
                    switch (tokens[0][len - 2]) {
                        case "P":
                            val *= 1024;
                        /* falls through */
                        case "T":
                            val *= 1024;
                        /* falls through */
                        case "G":
                            val *= 1024;
                        /* falls through */
                        case "M":
                            val *= 1024;
                        /* falls through */
                        case "K":
                            val *= 1024;
                            result = val;
                            break;
                    }
                }
            }
        } else {
            val = parseFloat(tokens[0]);
            if (!isNaN(val)) result = val;
        }
    }
    if (result != null) result = Math.ceil(result);
    return result;
}

export function strToIntStrict(value) {
    if (typeof value === "string") {
        var inp = value.trim();
        if (inp.length) {
            var res = Number(value);
            if (Number.isInteger(res)) return res;
        }
    }

    return NaN;
}

export function strToNumStrict(value) {
    if (typeof value === "string") {
        var inp = value.trim();
        if (inp.length) {
            return Number(value);
        }
    }

    return NaN;
}

var escapeMap = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
    "/": "&#x2F;",
    "`": "&#x60;",
    "=": "&#x3D;",
};

export function escapeHTML(string) {
    return String(string).replace(/[&<>"'`=\/]/g, function (s) {
        return escapeMap[s];
    });
}

export function checkDlgOpen(a_id) {
    var dlg = $("#" + a_id.replace("/", "_"));
    if (dlg.length) {
        dlg.dialog("moveToTop");
        return true;
    }

    return false;
}

export function getKeyIcon(a_key) {
    if (a_key.startsWith("c/")) return "folder";
    else if (a_key.startsWith("u/")) return "person";
    else if (a_key.startsWith("p/")) return "box";
    else if (a_key.startsWith("q/")) return "zoom";
    else if (a_key.startsWith("t/")) return "structure";
    else if (a_key == "mydata") return "person";
    else if (a_key == "projects" || a_key == "shared_proj") return "view-icons";
    else if (a_key == "shared_all") return "circle-plus";
    else if (a_key == "shared_user") return "persons";
    else if (a_key == "allocs") return "databases";
    else if (a_key.startsWith("repo/")) return "database";
    else if (a_key.startsWith("queries")) return "view-list";
    else if (a_key.startsWith("published")) return "book";

    console.log("getKeyIcon - not found", a_key);
}

export function getDataIcon(a_data) {
    if (a_data.external) return "ui-icon ui-icon-linkext";
    else if (a_data.size) return "ui-icon ui-icon-file-text";
    else return "ui-icon ui-icon-file";
}

export function getItemIcon(a_item) {
    if (a_item.id.startsWith("d/")) return getDataIcon(a_item);
    else return getKeyIcon(a_item.id);
}

export function generateNoteSpan(item, codes) {
    var res = "";

    if (item.notes) {
        // Show icon for most critical note only - err > warn > info
        if (item.notes & model.NOTE_MASK_LOC_ERR) {
            if (codes) res += " &#xe6e9;";
            else res += "<span class='ui-icon ui-icon-flag'></span>";
        } else if (item.notes & model.NOTE_MASK_LOC_WARN) {
            if (codes) res += " &#xe65f;";
            else res += "<span class='ui-icon ui-icon-alert'></span>";
        } else if (item.notes & model.NOTE_MASK_LOC_INFO) {
            if (codes) res += " &#xe665;";
            else res += "<span class='ui-icon ui-icon-circle-info'></span>";
        }

        // Show separate question icon
        if (item.notes & model.NOTE_MASK_LOC_QUES) {
            if (codes) res += " &#xe662;";
            else res += "<span class='ui-icon ui-icon-circle-help'></span>";
        }

        // Show separate icon for most critical inhererited note - err > warn
        if (item.notes & model.NOTE_MASK_INH_ERR) {
            if (codes) res += " (&#xe6e9;)";
            else
                res +=
                    " <span class='inh-err-title'>(<span class='ui-icon ui-icon-flag inh-err-title'></span>)</span> ";
        } else if (item.notes & model.NOTE_MASK_INH_WARN) {
            if (codes) res += " (&#xe65f;)";
            else
                res +=
                    " <span class='inh-warn-title'>(<span class='ui-icon ui-icon-alert inh-warn-title'></span>)</span> ";
        }

        // Show metadata error icon
        if (item.notes & model.NOTE_MASK_MD_ERR) {
            if (codes) res += " &#xe662;";
            else res += "<span class='ui-icon ui-icon-wrench'></span>";
        }
    }

    return res;
}

export function generateNoteSpan2(item, codes) {
    var res = "";

    if (item.notes) {
        // Show icon for most critical note only - err > warn > info
        if (item.notes & model.NOTE_MASK_LOC_ERR) {
            if (codes) res += " &#xe6e9;";
            else res += "<i class='ui-icon ui-icon-flag' style='margin: 0 1px 1px -4px'></i>";
        } else if (item.notes & model.NOTE_MASK_LOC_WARN) {
            if (codes) res += " &#xe65f;";
            else res += "<i class='ui-icon ui-icon-alert' style='margin: 0 1px 1px -4px'></i>";
        } else if (item.notes & model.NOTE_MASK_LOC_INFO) {
            if (codes) res += " &#xe665;";
            else
                res += "<i class='ui-icon ui-icon-circle-info' style='margin: 0 1px 1px -4px'></i>";
        }

        // Show separate question icon
        if (item.notes & model.NOTE_MASK_LOC_QUES) {
            if (codes) res += " &#xe662;";
            else
                res +=
                    "<i class='ui-icon ui-icon-circle-help' style='margin: 0 1px 1px " +
                    (res.length > 0 ? "0" : "-4px") +
                    "'></i>";
        }

        // Show separate icon for most critical nhererited note - err > warn
        if (item.notes & model.NOTE_MASK_INH_ERR) {
            if (codes) res += " (&#xe6e9;)";
            else
                res +=
                    " <span class='inh-err-title'>(<i class='ui-icon ui-icon-flag inh-err-title' style='margin: 0 0 1px 0'>></i>)</span> ";
        } else if (item.notes & model.NOTE_MASK_INH_WARN) {
            if (codes) res += " (&#xe65f;)";
            else
                res +=
                    " <span class='inh-warn-title'>(<i class='ui-icon ui-icon-alert inh-warn-title' style='margin: 0 0 1px 0'>></i>)</span> ";
        }
    }

    return res;
}

export function generateTitle(item, refresh, unstruct = false) {
    var title = "",
        uid = settings.user ? "u/" + settings.user.uid : null;

    if (item.locked) title += "<i class='ui-icon ui-icon-locked'></i> ";

    title += generateNoteSpan(item);

    title +=
        "<span class='fancytree-title data-tree-title'>" +
        escapeHTML(item.title) +
        "</span><span class='data-tree-subtitle'>";
    title += "<span class='data-tree-id'>" + item.id + "</span>&nbsp;";
    if (item.alias)
        title +=
            "<span class='data-tree-alias'>[" +
            item.alias.substr(item.alias.lastIndexOf(":") + 1) +
            "]</span>";
    else title += "<span class='data-tree-alias'></span>";

    // Only apply owner/creator labels to data records
    if (item.id.startsWith("d/") && item.owner && item.creator) {
        if (unstruct) {
            // No tree structure to convey owner of data, so show owner when user is not owner/creator
            if (item.owner != uid && item.creator != uid) {
                title +=
                    "&nbsp;<span class='data-tree-owner-other'>" + item.owner.substr(2) + "</span>";
            } else if (item.owner != uid && item.creator == uid) {
                title +=
                    "&nbsp;<span class='data-tree-creator-self'>(" + settings.user.uid + ")</span>";
            } else if (item.owner == uid && item.creator != uid) {
                title +=
                    "&nbsp;<span class='data-tree-creator-other'>(" +
                    item.creator.substr(2) +
                    ")</span>";
            }
        } else {
            if (item.owner != uid) {
                if (item.creator == uid) {
                    title +=
                        "&nbsp;<span class='data-tree-creator-self'>(" +
                        settings.user.uid +
                        ")</span>";
                } else if (item.creator != item.owner) {
                    title +=
                        "&nbsp;<span class='data-tree-creator-other'>(" +
                        item.creator.substr(2) +
                        ")</span>";
                }
            } else {
                if (item.creator != uid) {
                    title +=
                        "&nbsp;<span class='data-tree-creator-other'>(" +
                        item.creator.substr(2) +
                        ")</span>";
                }
            }
        }
    }

    if (item.id.startsWith("p/")) {
        if (item.owner != uid) {
            if (item.creator == uid) {
                title +=
                    "&nbsp;<span class='data-tree-creator-self'>(" + settings.user.uid + ")</span>";
            } else {
                title +=
                    "&nbsp;<span class='data-tree-creator-other'>(" +
                    item.owner.substr(2) +
                    ")</span>";
            }
        }
    }

    title += "</span>";

    return title;
}

export function refreshNodeTitle(a_node, a_data, a_reload) {
    a_node.title = generateTitle(a_data);

    if (a_data.id.startsWith("d/")) {
        a_node.icon = getDataIcon(a_data);
    }

    a_node.renderTitle();

    if (a_reload) reloadNode(a_node);
}

export function reloadNode(a_node, a_cb) {
    if (!a_node || (a_node.isLazy() && !a_node.isLoaded())) return;

    var save_exp = a_node.isExpanded();
    var paths = {};

    if (save_exp) {
        saveExpandedPaths(a_node, paths);
    }

    a_node.load(true).always(function () {
        if (save_exp) {
            restoreExpandedPaths(a_node, paths[a_node.key], a_cb);
        }
    });
}

function saveExpandedPaths(node, paths) {
    var subp = {};
    if (node.children) {
        var child;
        for (var i in node.children) {
            child = node.children[i];
            if (child.isExpanded()) {
                saveExpandedPaths(child, subp);
            }
        }
    }
    paths[node.key] = subp;
}

function restoreExpandedPaths(a_node, a_paths, a_cb) {
    var num_nodes = 0;

    function done() {
        if (a_cb) {
            if (--num_nodes == 0) {
                a_cb();
            }
        }
    }

    function recurseExpPaths(node, paths) {
        num_nodes += 1;

        node.setExpanded(true).always(function () {
            if (node.children) {
                var child;
                for (var i in node.children) {
                    child = node.children[i];
                    if (child.key in paths) {
                        recurseExpPaths(child, paths[child.key]);
                    }
                }
            }

            done();
        });
    }

    recurseExpPaths(a_node, a_paths);
}

export function treeSelectRange(a_tree, a_node) {
    /*if ( a_node.parent != selectScope.parent || a_node.data.scope != selectScope.data.scope ){
        util.setStatusText("Cannot select across collections or categories",1);
        return;
    }*/

    var act_node = a_tree.activeNode;
    if (act_node) {
        var parent = act_node.parent;
        if (parent == a_node.parent) {
            var n,
                sel = false;
            for (var i in parent.children) {
                n = parent.children[i];
                if (sel) {
                    n.setSelected(true);
                    if (n.key == act_node.key || n.key == a_node.key) break;
                } else {
                    if (n.key == act_node.key || n.key == a_node.key) {
                        n.setSelected(true);
                        sel = true;
                    }
                }
            }
        } else {
            setStatusText("Range select only supported within a single collection.", 1);
        }
    }
}

export function buildObjSrcTree(obj, base, md_exp) {
    //console.log("buildObjSrcTree",base, md_exp);
    var src = [],
        k2,
        o,
        i,
        v,
        skip,
        val,
        vs,
        is_arr = Array.isArray(obj),
        fkey,
        kbase;

    if (is_arr) kbase = (base ? base : "") + "[";
    else kbase = base ? base + "." : "";

    Object.keys(obj).forEach(function (k) {
        k2 = escapeHTML(k);
        fkey = kbase + k + (is_arr ? "]" : "");

        if (Array.isArray(obj[k])) {
            // Test for POD arrays (no objects) - If POD, put all values in title of this node; otherwise, add as children
            o = obj[k];
            skip = true;

            for (i in o) {
                if (typeof o[i] === "object" && o[i] !== null) {
                    skip = false;
                    break;
                }
            }
        } else {
            skip = false;
        }

        if (!skip && typeof obj[k] === "object" && obj[k] !== null) {
            if (md_exp) {
                //console.log("expanded:",md_exp[fkey]);
                if (md_exp[fkey]) {
                    md_exp[fkey] = 10;
                }
                i =
                    "<span class='md_tree_div md_tree_key' title='" +
                    fkey +
                    "' draggable='true' ondragstart='md_key_drag(event)'>" +
                    k2 +
                    " :";
                src.push({
                    key: fkey,
                    title: i,
                    icon: false,
                    folder: true,
                    expanded: md_exp[fkey] ? true : false,
                    children: buildObjSrcTree(obj[k], fkey, md_exp),
                });
            } else {
                src.push({
                    key: fkey,
                    title: i,
                    icon: false,
                    folder: true,
                    children: buildObjSrcTree(obj[k], fkey),
                });
            }
        } else {
            if (typeof obj[k] === "string") {
                val = '"' + escapeHTML(obj[k]) + '"';
            } else if (Array.isArray(obj[k])) {
                val = "[";
                var comma = false;

                for (i in o) {
                    v = o[i];

                    if (comma) {
                        val += ", ";
                    } else {
                        comma = true;
                    }

                    if (typeof v === "string") {
                        vs = '"' + escapeHTML(v) + '"';
                    } else {
                        vs = String(v);
                    }
                    val += vs;
                }

                val += "]";
            } else {
                val = String(obj[k]);
            }

            if (k2.length + val.length > 60) {
                src.push({
                    key: fkey,
                    title:
                        "<div class='md_tree_div'><div class='md_tree_key' title='" +
                        fkey +
                        "' draggable='true' ondragstart='md_key_drag(event)'>" +
                        k2 +
                        " :</div><div class='md_tree_val md_tree_val_indent'>" +
                        val +
                        "</div></div>",
                    icon: false,
                });
            } else {
                src.push({
                    key: fkey,
                    title:
                        "<span class='md_tree_div md_tree_key' title='" +
                        fkey +
                        "' draggable='true' ondragstart='md_key_drag(event)'>" +
                        k2 +
                        " : </span><span class='md_tree_div md_tree_val'>" +
                        val +
                        "</span>",
                    icon: false,
                });
            }
        }
    });

    return src;
}

export function addTreePagingNode(a_data, a_no_last, a_pfx = "page") {
    if (
        a_data.response.offset > 0 ||
        a_data.response.total > a_data.response.offset + a_data.response.count
    ) {
        var page_mx = Math.ceil(a_data.response.total / settings.opts.page_sz) - 1,
            page = Math.floor(a_data.response.offset / settings.opts.page_sz);

        a_data.result.push({
            title:
                "<button class='btn btn-icon-tiny " +
                a_pfx +
                "-first''" +
                (page == 0 ? " disabled" : "") +
                "><span class='ui-icon ui-icon-triangle-1-w-stop'></span></button> \
            <button class='btn btn-icon-tiny " +
                a_pfx +
                "-prev'" +
                (page == 0 ? " disabled" : "") +
                "><span class='ui-icon ui-icon-triangle-1-w'></span></button> \
            Page " +
                (page + 1) +
                " of " +
                (page_mx + 1) +
                " <button class='btn btn-icon-tiny " +
                a_pfx +
                "-next'" +
                (page >= page_mx ? " disabled" : "") +
                "><span class='ui-icon ui-icon-triangle-1-e'></span></button>" +
                (a_no_last
                    ? ""
                    : "<button class='btn btn-icon-tiny " +
                      a_pfx +
                      "-last'" +
                      (page >= page_mx ? " disabled" : "") +
                      " page='" +
                      page_mx +
                      "'><span class='ui-icon ui-icon-triangle-1-e-stop'></span></button>"),
            folder: false,
            icon: false,
            checkbox: false,
            hasBtn: true,
        });
    }
}

export function setStatusText(text, err) {
    if (status_timer) {
        clearTimeout(status_timer);
    }

    var bar = $("#status_text");

    if (err) {
        bar.addClass("blink-background");
        bar.html(
            "<span class='ui-icon ui-icon-alert' style='color:yellow;font-size:115%'></span>&nbsp;" +
                text,
        );
    } else {
        bar.removeClass("blink-background");
        bar.html(text);
    }

    status_timer = setTimeout(function () {
        status_timer = null;
        bar.html(" ");
        bar.removeClass("blink-background");
    }, 8000);
}

export function saveFile(filename, text) {
    var element = document.createElement("a");
    element.setAttribute("href", "data:text/plain;charset=utf-8," + encodeURIComponent(text));
    element.setAttribute("download", filename);

    element.style.display = "none";
    document.body.appendChild(element);

    element.click();

    document.body.removeChild(element);
}

export function dataGet(a_ids, a_cb) {
    api.dataGetCheck(a_ids, function (ok, data) {
        if (ok) {
            //console.log("data get check:",data);
            var i,
                internal = false;

            if (!data.item || !data.item.length) {
                dialogs.dlgAlert("Data Get Error", "Selection contains no raw data.");
                return;
            }

            for (i in data.item) {
                if (data.item[i].locked) {
                    dialogs.dlgAlert(
                        "Data Get Error",
                        "One or more data records are currently locked.",
                    );
                    return;
                }

                if (data.item[i].size <= 0) {
                    dialogs.dlgAlert(
                        "Data Get Error",
                        "One or more data records have no raw data.",
                    );
                    return;
                } else {
                    internal = true;
                }
            }

            transferDialog.show(model.TT_DATA_GET, data.item, a_cb);

            /* unused http xfr
                for ( i in data.item ){
                    //console.log("download ", data.item[i].url )
                    var link = document.createElement("a");
                    var idx = data.item[i].url.lastIndexOf("/");
                    link.download = data.item[i].url.substr(idx);
                    link.href = data.item[i].url;
                    link.target = "_blank";
                    link.click();
                }
            */
        } else {
            dialogs.dlgAlert("Data Get Error", data);
        }
    });
}
