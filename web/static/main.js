var g_user = null;

function loadUser() {
    console.log( "loadUser" );
    //console.log( "user:", );

    var user = Cookies.get( 'sdms-user' );

    if ( user ) {
        // TODO Verify that user is still active
        g_user = JSON.parse( user );
    } else {
        g_user = null;
    }

    console.log( "user: ", g_user );
}

function logout() {
    console.log( "logout");
    g_user = null;
    Cookies.remove( 'sdms-user' );
    window.location = "/";
}

function getData( a_callback ) {
    a_callback(["data1","data2","data3","data4","data1","data2","data3","data4","data1","data2","data3","data4","data1","data2","data3","data4","data1","data2","data3","data4","data1","data2","data3","data4","data1","data2","data3","data4","data1","data2","data3","data4","data1","data2","data3","data4"]);
}

console.log( "main.js loaded");