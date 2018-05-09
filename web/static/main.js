var g_user = null;

function loadUser() {
    console.log( "loadUser" );

    var user = Cookies.get( 'sdms-user' );

    if ( user ) {
        g_user = JSON.parse( user );
    } else {
        g_user = null;
    }

    console.log( "user: ", g_user );
}

function logout() {
    console.log( "logout");
    g_user = null;
    //Cookies.remove( 'sdms-user', { path: "/ui" });
    window.location = "/ui/logout";
}

function _asyncGet( a_path, a_raw_json_data, a_callback ) {
    $.ajax({
        url : a_path,
        global : false,
        type : 'get',
        data: a_raw_json_data,
        dataType: 'json',
        success : function( a_data ) {
            if ( a_callback )
                a_callback( true, a_data );
        },
        error : function( a_xhr, a_status, a_thrownError ) {
            //console.log( 'asyncGet error: ', a_xhr );
            //console.log( 'asyncGet error: ', a_status );
            //console.log( 'asyncGet error: ', a_thrownError );
            //console.log( 'asyncGet error: ', a_xhr.responseText );
            if ( a_callback ) {
                if ( a_xhr.responseText )
                    a_callback( false, a_xhr.responseText );
                else if ( a_thrownError )
                    a_callback( false, a_thrownError );
                else if ( a_status )
                    a_callback( false, a_status );
                else
                    a_callback( false, "Unknown error" );
            }
        },
        timeout: 5000
    });
}

function getData( a_coll_id, a_callback ) {
    _asyncGet( "/col/read?id=" + a_coll_id, null, function( ok, data ){
        if ( ok )
            a_callback( data );
        else {
            console.log("getData failed:", data );
            a_callback();
        }
    });

    /*a_callback(["data1","data2","data3","data4","data1","data2","data3","data4","data1","data2","data3","data4","data1","data2","data3","data4","data1","data2","data3","data4","data1","data2","data3","data4","data1","data2","data3","data4","data1","data2","data3","data4","data1","data2","data3","data4"]);*/
}

console.log( "main.js loaded");