var g_user = null;

function loadUser() {
    console.log( "loadUser" );

    var user = sessionStorage.getItem( "user" );

    if ( user ) {
        // TODO Verify that user is still active
        g_user = user;
    } else {
        g_user = null;
    }
    console.log( "user: ", g_user );
}

console.log( "main.js loaded");