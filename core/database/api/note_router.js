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
                read: ["u","x"],
                write: []
            },
            action: function() {
            }
        });
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client UID")
.queryParam('object', joi.string().required(), "ID or alias of data record or collection")
.summary('Create an annotation on an object')
.description('Create an annotation on an object');





