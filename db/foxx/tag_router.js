/*jshint strict: global */
/*jshint esversion: 6 */
/*jshint multistr: true */
/* globals require */
/* globals module */
/* globals console */

'use strict';

const   createRouter = require('@arangodb/foxx/router');
const   router = createRouter();
const   joi = require('joi');

const   g_db = require('@arangodb').db;
const   g_graph = require('@arangodb/general-graph')._graph('sdmsg');
const   g_lib = require('./support');

module.exports = router;


//==================== TAG API FUNCTIONS

router.post('/update', function (req, res) {
    try {
        g_db._executeTransaction({
            collections: {
                read: ["u","x","d","c","admin","alias","a"],
                write: ["acl","c","d"]
            },
            action: function() {
            }
        });
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client certificate")
.queryParam('object', joi.string().required(), "ID or alias of data record or collection")
.summary('Update tags on an object')
.description('Update tags on an object (data record or collection)');


