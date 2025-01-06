import * as dialogs from "./dialogs.js";
import * as util from "./util.js";
import * as dlgSchemaList from "./dlg_schema_list.js";

export function show(a_schema, a_query, a_cb) {
    //console.log("show query builder dialog");
    //console.log( a_schema );

    var frame = $(document.createElement("div"));

    frame.html(
        "<div class='col-flex' style='height:100%'>\
            <div class='row-flex input-row'><div>Schema ID: </div><div style='flex: 1 1 auto'><input id='dlg_qry_bld_sch_id' type='text' readonly style='width:100%'></input></div>\
                <div><button id='dlg_qry_bld_sch_pick' class='btn btn-icon'><span class='ui-icon ui-icon-structure'></span></button></div>\
            </div>\
            <div style='flex:1 1 100%;padding-top:0.5em;overflow:auto'>\
                <div id='dlg_qry_bld_msg'><br><br><center>Select a schema to begin building a query.</center></div>\
                <query-builder style='display:none'></query-builder>\
            </div>\
        </div>",
    );

    var qb = $("query-builder", frame)[0],
        _schema;

    var options = {
        title: "Metadata Query Builder",
        modal: true,
        width: 835,
        height: 500,
        resizable: true,
        buttons: [
            {
                text: "Cancel",
                click: function () {
                    $(this).dialog("close");
                },
            },
            {
                id: "ok_btn",
                text: "Save",
                click: function () {
                    if (qb.hasErrors()) {
                        dialogs.dlgAlert(
                            "Query Builder Error",
                            "Query errors must be resolved before saving.",
                        );
                        return;
                    }

                    var qry = qb.getQuery();

                    //console.log("query:",qry);

                    if (a_cb) a_cb(qry);

                    $(this).dialog("close");
                },
            },
        ],
        open: function (event, ui) {
            $(".btn", frame).button();
            util.inputTheme($("input", frame));

            if (a_schema) {
                _schema = a_schema;
                $("#dlg_qry_bld_sch_id", frame).val(_schema.id + "-" + _schema.ver);
                $("#dlg_qry_bld_msg", frame).hide();
                $("query-builder", frame).show();
                qb.init(_schema, a_query);
            }
        },
        close: function (ev, ui) {
            $(this).dialog("destroy").remove();
        },
    };

    $("#dlg_qry_bld_sch_pick", frame).on("click", function () {
        dlgSchemaList.show(true, true, function (schema) {
            _schema = schema;
            $("#dlg_qry_bld_sch_id", frame).val(_schema.id + "-" + _schema.ver);
            $("#dlg_qry_bld_msg", frame).hide();
            $("query-builder", frame).show();
            qb.init(_schema);
        });
    });

    // TODO handle manual schema input

    frame.dialog(options);
}
