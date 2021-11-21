$(".btn-help").on( "click", function(){
    window.open('https://ornl.github.io/DataFed/','datafed-docs');
});

$(".btn-login").on( "click", function(){
    location.href = "/ui/login";
});

$(document).ready(function(){
    window.name = 'DataFed Welcome';
    $(".btn").button();

    var tmpl_data = JSON.parse(document.getElementById('template_data').innerHTML);

    if ( tmpl_data.test_mode ){
        $("#devmode").show();
    }
});


