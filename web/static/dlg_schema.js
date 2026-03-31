import * as settings from "./settings.js";
import * as util from "./util.js";
import * as api from "./api.js";
import * as dialogs from "./dialogs.js";

export const mode_view = 0;
export const mode_edit = 1;
export const mode_new = 2;
export const mode_rev = 3;

const dlg_title = ["View", "Edit", "Create New", "Create Revision of "];
const btn_title = ["Close", "Save", "Create", "Create"];

/**
 * Strip version suffix from a composite schema ID (e.g. "foo:0" -> "foo").
 * @param {string} id - Composite schema ID.
 * @returns {string} Schema name without version suffix.
 */
function schemaName(id) {
    var idx = id.indexOf(":");
    return idx !== -1 ? id.substring(0, idx) : id;
}

/**
 * Ensure a schema ID has the :version suffix.
 * @param {string} id - Schema ID, possibly without version.
 * @param {string|number} ver - Version to append if missing.
 * @returns {string} Schema ID with version suffix.
 */
function schemaId(id, ver) {
    return id.indexOf(":") !== -1 ? id : id + ":" + ver;
}

/**
 * Return the Ace editor mode string for a given schema type.
 * @param {string} type - "json-schema" or "linkml"
 * @returns {string} Ace mode path
 */
function aceMode(type) {
    return type === "linkml" ? "ace/mode/yaml" : "ace/mode/json";
}

/**
 * Return a human label for the definition tab header.
 * @param {string} type - "json-schema" or "linkml"
 * @returns {string}
 */
function defLabel(type) {
    return type === "linkml" ? "Schema Definition (YAML):" : "Schema Definition (JSON):";
}

/**
 * Return the schema format string for the API.
 * @param {string} type - "json-schema" or "linkml"
 * @returns {string} "json" or "yaml"
 */
function schemaFormat(type) {
    return type === "linkml" ? "yaml" : "json";
}

/**
 * Return a default template for a new schema definition.
 * @param {string} type - "json-schema" or "linkml"
 * @returns {string}
 */
function defaultTemplate(type) {
    if (type === "linkml") {
        return [
            "id: https://example.org/schemas/my_schema",
            "name: my_schema",
            "title: My Schema",
            "description: Description of this schema",
            "",
            "prefixes:",
            "  linkml: https://w3id.org/linkml/",
            "",
            "default_range: string",
            "",
            "imports:",
            "  - linkml:types",
            "",
            "classes:",
            "  MyClass:",
            "    description: A sample class",
            "    attributes:",
            "      name:",
            "        required: true",
            "      value:",
            "        range: float",
        ].join("\n");
    }
    return JSON.stringify(
        {
            properties: { example: { type: "string" } },
            required: ["example"],
            type: "object",
        },
        null,
        4,
    );
}

export function show(a_mode, a_schema, a_cb) {
    var ele = document.createElement("div");
    ele.id = "dlg_schema_" + (a_schema ? schemaName(a_schema.id) + "_" + a_schema.ver : "new");

    var frame = $(ele),
        dlg_inst,
        json_val,
        schName = a_schema ? schemaName(a_schema.id) : null;

    // Determine current schema type from existing schema or default
    var curType = a_schema && a_schema.type ? a_schema.type : "json-schema";

    frame.html(
        "<div id='dlg-tabs' style='height:100%;padding:0' class='tabs-no-header no-border'>\
            <ul>\
                <li><a href='#tab-dlg-gen'>General</a></li>\
                <li><a href='#tab-dlg-def'>Definition</a></li>\
                <li><a href='#tab-dlg-ref'>References</a></li>\
            </ul>\
            <div id='tab-dlg-gen' style='padding:0.5em 1em'>\
                <div class='col-flex' style='height:100%'>\
                    <div style='flex:none'><table style='width:100%'>\
                        <tr><td>ID: <span class='note'>*</span></td><td colspan='5'><input title='Schema ID' type='text' id='sch_id' maxlength='120' style='width:100%'></input></td></tr>\
                        <tr>\
                            <td>Version:</td><td><input type='text' title='Version number' id='sch_ver' style='width:95%'></input></td>\
                            <td>Uses:</td><td><input type='text' title='Number of records using this schema' id='sch_cnt' style='width:95%'></input></td>\
                            <td>Refs:</td><td><input type='text' title='Number of references to this schema' id='sch_refs' style='width:100%'></input></td>\
                        </tr>\
                        <tr><td>Type:</td><td colspan='5'>\
                            <select title='Schema engine type' id='sch_type' style='width:100%'>\
                                <option value='json-schema'>JSON Schema</option>\
                                <option value='linkml'>LinkML</option>\
                            </select>\
                        </td></tr>\
                        <tr><td>Owner:</td><td colspan='5'><input type='text' title='Owner name/ID' id='sch_own' style='width:100%'></input></td></tr>\
                        <tr><td>Access:</td><td colspan='5'>\
                            <label for='sch_priv'><input type='radio' id='sch_priv' name='sch_acc' value='private' checked/>Private</label>&nbsp;&nbsp;\
                            <label for='sch_pub'><input type='radio' id='sch_pub' name='sch_acc' value='public'/>Public</label>&nbsp;&nbsp;\
                            <label for='sch_sys'><input type='radio' id='sch_sys' name='sch_acc' value='system'/>System</label>\
                        </td></tr>\
                    </table></div>\
                    <div style='flex:none;padding:1em 0 0.25em .2em'>Description: <span class='note'>*</span></div>\
                    <div style='flex:1 1 auto'>\
                        <textarea title='Description text (include keywords)' id='sch_desc' maxlength='2000' rows=8 style='width:100%;height:100%;box-sizing: border-box;'></textarea>\
                    </div>\
                </div>\
            </div>\
            <div id='tab-dlg-def' style='padding:.5em 1em'>\
                <div class='col-flex' style='height:100%'>\
                    <div style='flex:none;padding-bottom:0.25em'>\
                        <span id='sch_def_label'>" +
            defLabel(curType) +
            "</span> <span style='float:right'><a href='https://github.com/ajaxorg/ace/wiki/Default-Keyboard-Shortcuts' target='_blank'>editor help</a></span>\
                    </div>\
                    <div class='ui-widget ui-widget-content' style='flex:1 1 100%;padding:0'>\
                        <div id='sch_def' style='height:100%;width:100%'></div>\
                    </div>\
                </div>\
            </div>\
            <div id='tab-dlg-ref' style='padding:.5em 1em'>\
                <div class='col-flex' style='height:100%'>\
                    <div>Other schemas that reference this schema:</div>\
                    <div id='sch_uses' class='ui-widget ui-widget-content content' style='flex: 1 1 50%;overflow:auto;margin-top:0.5em;padding:0.25em'></div>\
                    <div style='padding-top:0.5em'>Schemas referenced by this schema:</div>\
                    <div id='sch_used_by' class='ui-widget ui-widget-content content' style='flex: 1 1 50%;overflow:auto;margin-top:0.5em;padding:0.25em'></div>\
                </div>\
            </div>\
        </div>",
    );

    var jsoned = ace.edit($("#sch_def", frame).get(0), {
        theme: settings.theme == "light" ? "ace/theme/light" : "ace/theme/dark",
        mode: aceMode(curType),
        fontSize: 16,
        autoScrollEditorIntoView: true,
        wrap: true,
    });

    // --- Type selector change handler ---
    $("#sch_type", frame).on("change", function () {
        var newType = $(this).val();
        var session = jsoned.getSession();

        // Switch editor mode
        session.setMode(aceMode(newType));

        // Update definition tab label
        $("#sch_def_label", frame).text(defLabel(newType));

        // If the editor still has the default template (or is empty),
        // replace it with the new type's template
        var curVal = jsoned.getValue().trim();
        var jsonDefault = defaultTemplate("json-schema").trim();
        var linkmlDefault = defaultTemplate("linkml").trim();

        if (!curVal || curVal === jsonDefault || curVal === linkmlDefault) {
            jsoned.setValue(defaultTemplate(newType), -1);
        }

        curType = newType;
    });

    function handleSubmit(ok, reply) {
        if (ok) {
            if (a_cb) a_cb();
            dlg_inst.dialog("close");
        } else {
            dialogs.dlgAlert("Schema Update Error", util.escapeHTML(reply));
        }
    }

    var dlg_opts = {
        title: dlg_title[a_mode] + " Schema",
        modal: false,
        width: 600,
        height: 500,
        resizable: true,
        resizeStop: function (ev, ui) {
            $("#dlg-tabs", frame).tabs("refresh");
        },
        buttons: [],
        open: function () {
            dlg_inst = $(this);

            $(this).css("padding", "0");

            var widget = frame.dialog("widget");

            if (a_mode != mode_view) {
                $(".ui-dialog-buttonpane", widget).append(
                    "<span class='note' style='padding:1em;line-height:200%'>* Required fields</span>",
                );
            }

            $(".btn", frame).button();
            $("#dlg-tabs", frame).tabs({ heightStyle: "fill" });

            if (a_schema) {
                $("#sch_id", frame).val(schName);
                $("#sch_desc", frame).val(a_schema.desc);
                $("#sch_type", frame).val(curType);

                if (a_mode == mode_rev) {
                    $("#sch_ver", frame).val(a_schema.ver + 1);
                    $("#sch_cnt", frame).val(0);
                    $("#sch_refs", frame).val(0);
                } else {
                    $("#sch_ver", frame).val(a_schema.ver + (a_schema.depr ? " (deprecated)" : ""));
                    $("#sch_cnt", frame).val(a_schema.cnt);
                    $("#sch_refs", frame).val(a_schema.usedBy ? a_schema.usedBy.length : 0);
                }

                if (a_schema.ownNm) {
                    $("#sch_own", frame).val(
                        a_schema.ownNm + " (" + a_schema.ownId.substr(2) + ")",
                    );
                    if (a_schema.pub) {
                        $("#sch_pub", frame).attr("checked", true);
                    } else {
                        $("#sch_priv", frame).attr("checked", true);
                    }
                } else {
                    $("#sch_own", frame).val("System");
                    $("#sch_sys", frame).attr("checked", true);
                }

                // Display the definition based on type
                if (curType === "linkml") {
                    // LinkML definitions are stored as YAML strings
                    json_val = a_schema.def;
                    jsoned.setValue(json_val, -1);
                } else {
                    // JSON Schema definitions — pretty-print
                    var def = JSON.parse(a_schema.def);
                    json_val = JSON.stringify(def, null, 4);
                    jsoned.setValue(json_val, -1);
                }

                if (a_mode != mode_rev) {
                    var i, dep, html;
                    if (a_schema.uses) {
                        html = "";
                        for (i in a_schema.uses) {
                            dep = a_schema.uses[i];
                            html += schemaName(dep.id) + ":" + dep.ver + "<br>";
                        }
                        $("#sch_uses", frame).html(html);
                    }

                    if (a_schema.usedBy) {
                        html = "";
                        for (i in a_schema.usedBy) {
                            dep = a_schema.usedBy[i];
                            html += schemaName(dep.id) + ":" + dep.ver + "<br>";
                        }
                        $("#sch_used_by", frame).html(html);
                    }
                }
            } else {
                $("#sch_ver", frame).val(0);
                $("#sch_cnt", frame).val(0);
                $("#sch_refs", frame).val(0);
                $("#sch_own", frame).val(settings.user.uid);
                $("#sch_type", frame).val("json-schema");
                jsoned.setValue(defaultTemplate("json-schema"), -1);
            }

            jsoned.resize();

            util.inputDisable($("#sch_ver,#sch_cnt,#sch_refs,#sch_own", frame));

            // Type is immutable after creation — lock in view, edit, and revise modes
            if (a_mode != mode_new) {
                $("#sch_type", frame).prop("disabled", true);
            }

            if (a_mode == mode_view) {
                util.inputDisable($("#sch_id,#sch_desc", frame));
                $(":radio:not(:checked)").attr("disabled", true);
                jsoned.setReadOnly(true);
                jsoned.container.style.opacity = 0.45;
            } else if (a_mode == mode_rev) {
                util.inputDisable($("#sch_id", frame));
            } else if (a_mode == mode_edit) {
                if (a_schema.depr || a_schema.ver > 0) util.inputDisable($("#sch_id", frame));
                // If in use or referenced, do not allow definition to be changed
                if (a_schema.cnt || (a_schema.usedBy && a_schema.usedBy.length)) {
                    jsoned.setReadOnly(true);
                    jsoned.container.style.opacity = 0.45;
                }
            }

            if (!settings.user.isAdmin && a_mode != mode_view) {
                $("#sch_sys", frame).attr("disabled", true);
                $("#sch_sys", frame).parent().hide();
            }
        },
        close: function () {
            $(this).dialog("destroy").remove();
        },
    };

    if (a_mode != mode_view) {
        dlg_opts.buttons.push({
            text: "Cancel",
            click: function () {
                $(this).dialog("close");
            },
        });
    }

    dlg_opts.buttons.push({
        id: "ok_btn",
        text: btn_title[a_mode],
        click: function () {
            if (a_mode == mode_view) {
                dlg_inst.dialog("close");
                return;
            }

            var selType = $("#sch_type", frame).val();

            // Only check Ace annotations for JSON mode — YAML mode
            // annotations are less reliable and not a hard gate
            if (selType === "json-schema") {
                var anno = jsoned.getSession().getAnnotations();
                if (anno && anno.length) {
                    dialogs.dlgAlert("Schema Error", "Schema has unresolved JSON syntax errors.");
                    return;
                }
            }

            var obj = {},
                acc = $("input[name=sch_acc]:checked", frame).val();

            if (acc == "public") {
                obj.pub = true;
            } else if (acc == "private") {
                obj.pub = false;
            } else {
                obj.pub = true;
                obj.sys = true;
            }

            obj.desc = $("#sch_desc", frame).val().trim();
            obj.def = jsoned.getValue();

            if (a_mode == mode_new) {
                obj.id = $("#sch_id", frame).val().trim();
                obj.type = selType;
                obj.format = schemaFormat(selType);

                console.log("new", obj);
                api.schemaCreate(obj, handleSubmit);
            } else if (a_mode == mode_rev) {
                obj.id = schemaId(a_schema.id, a_schema.ver);

                console.log("rev", obj);
                api.schemaRevise(obj, handleSubmit);
            } else {
                // edit mode
                obj.id = schemaId(a_schema.id, a_schema.ver);

                var tmp = $("#sch_id", frame).val().trim();
                if (tmp != schName) obj.idNew = tmp;

                if (obj.desc == a_schema.desc) delete obj.desc;

                if (obj.def == json_val) delete obj.def;

                if (obj.pub == a_schema.pub) delete obj.pub;

                if (!a_schema.ownNm && obj.sys) delete obj.sys;

                console.log("upd", obj);
                api.schemaUpdate(obj, handleSubmit);
            }
        },
    });

    util.inputTheme($("input:text", frame));
    util.inputTheme($("textarea", frame));

    frame.dialog(dlg_opts);
}
