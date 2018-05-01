var g_user = null;

function loadUser() {
    console.log( "loadUser" );

    var user = sessionStorage.getItem( "user" );

    if ( user ) {
        // TODO Verify that user is still active
        g_user = JSON.parse( user );
    } else {
        g_user = null;
    }
    console.log( "user: ", g_user );
}

function saveUser( a_user ) {
    console.log( "saveUser" );

    g_user = a_user;
    sessionStorage.setItem( "user", JSON.stringify( a_user ));
}

function logout() {
    console.log( "logout");
    g_user = null;
    sessionStorage.clear();
}

console.log( "main.js loaded");