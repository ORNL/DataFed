import * as api from "/api.js";

$(".btn-help").on("click", function () {
    window.open("https://ornl.github.io/DataFed/", "datafed-docs");
});

$(".btn-login").on("click", function () {
    location.href = "/ui/login";
});

$(document).ready(function () {
    window.name = "DataFed Welcome";
    $(".btn").button();

    api.getDailyMessage(function (ok, reply) {
        if (ok && reply.message) {
            $("#msg_daily").text(reply.message);
            $("#msg_daily_div").show();
        }
    });

    var tmpl_data = JSON.parse(document.getElementById("template_data").innerHTML);
    if (tmpl_data.test_mode == "true") {
        $("#devmode").show();
    }
});
