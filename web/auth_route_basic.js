module.exports=function(app, opts ){

    app.get('/ui/login', (a_req, a_resp) => {
        if ( a_req.session && a_req.session.uid && a_req.session.reg ){
            a_resp.redirect( '/ui/main' );
        } else {
            console.log( "User login BASIC AUTH", opts );

            var theme = a_req.cookies['datafed-theme'] || "light";
            a_resp.render( 'auth_basic_login',{ theme:theme, version:opts.version, test_mode:opts.test_mode });
        }
    });

}
