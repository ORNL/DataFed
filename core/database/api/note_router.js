'use strict';

const   createRouter = require('@arangodb/foxx/router');
const   router = createRouter();
const   joi = require('joi');

const   g_db = require('@arangodb').db;
const   g_lib = require('./support');

module.exports = router;


//==================== ACL API FUNCTIONS

router.post('/create', function (req, res) {
    try {
        g_db._executeTransaction({
            collections: {
                read: ["u","uuid","accn"],
                write: ["n","note"]
            },
            action: function() {
                const client = g_lib.getUserFromClientID( req.queryParams.client );

            }
        });
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client UID")
.queryParam('object', joi.string().required(), "ID or alias of data record or collection")
.queryParam('type', joi.number().min(0).max(4).required(), "Type of annotation (see SDMS.proto for NOTE_TYPE enum)")
.summary('Create an annotation on an object')
.description('Create an annotation on an object');





