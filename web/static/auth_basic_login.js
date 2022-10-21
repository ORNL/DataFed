import * as api from "/api.js";

$(".btn-help").on( "click", function(){
    window.open('https://ornl.github.io/DataFed/','datafed-docs');
});

$(".btn-login").on( "click", function(){
    console.log("Login");
    //location.href = "/ui/login";
});

$(".btn-register").on( "click", function(){
    console.log("register");
    //location.href = "/ui/login";
});

$(document).ready(function(){
    window.name = 'DataFed Login (basic)';
    $(".btn").button();

    var tmpl_data = JSON.parse(document.getElementById('template_data').innerHTML);
    console.log("template data:",tmpl_data);
    if ( tmpl_data.test_mode == "true" ){
        $("#test_mode").show();
    }
});


