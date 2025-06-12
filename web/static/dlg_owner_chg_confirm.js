import * as util from "./util.js";

export function show(a_cur_owner, a_new_owner, a_reply, cb) {
    var content =
        "<p>This operation will initiate a background task to transfer ownership of " +
        a_reply.totCnt +
        " record(s) with " +
        util.sizeToString(a_reply.actSize) +
        " of raw data from current the owner, '" +
        a_cur_owner +
        "', to the new owner, '" +
        a_new_owner +
        "'.</p>";

    content += "Select destination allocation:<br><select id='alloc_sel'>";

    var alloc, free;
    for (var i in a_reply.alloc) {
        alloc = a_reply.alloc[i];
        free = Math.max(
            Math.floor((10000 * (alloc.dataLimit - alloc.dataSize)) / alloc.dataLimit) / 100,
            0,
        );
        content +=
            "<option value='" +
            alloc.repo +
            "'>" +
            alloc.repo.substr(5) +
            " -- " +
            util.sizeToString(alloc.dataSize) +
            " used of " +
            util.sizeToString(alloc.dataLimit) +
            " total, " +
            free +
            "% free</option>";
    }

    content += "</select>";

    content +=
        "</p><p class='note'>Note: pending transfers may impact space available on destination allocation.</p>";

    var frame = $(document.createElement("div"));
    frame.html(content);

    var options = {
        title: "Confirm Record Owner Change",
        modal: true,
        width: "32em",
        height: "auto",
        resizable: true,
        buttons: [
            {
                text: "Cancel",
                click: function () {
                    $(this).dialog("close");
                },
            },
            {
                text: "Ok",
                click: function () {
                    cb($("select", frame).val());
                    $(this).dialog("close");
                },
            },
        ],
        open: function (event, ui) {
            $("select", frame).selectmenu({ width: "auto" });
        },
        close: function (ev, ui) {
            $(this).dialog("destroy").remove();
        },
    };

    frame.dialog(options);
}
