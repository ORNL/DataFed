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

router.get('/check', function (req, res) {
    try {
        var result = {};

        g_db._executeTransaction({
            collections: {
                read: ["u","p"],
                write: []
            },
            action: function() {
                var edges = ["owner","member","item","acl","ident","admin","alias","alloc","loc"];
                var ecoll;
                var subres;
                var count = 0;

                // Check for dangling edges
                for ( var e in edges ){
                    ecoll = edges[e];
                    subres = g_db._query( "for i in @@coll let a = document(i._from)._id let b = document(i._to)._id filter a == null or b == null return {edge:i._id,fr:a,to:b}",{"@coll":ecoll}).toArray();
                    count += subres.length;
                    result[ecoll] = subres;
                }
                result.ecount = count;

                // Check for correct structure per vertex type
                count = 0;

                subres = g_db._query("for i in d let x = (for v in 1..1 outbound i._id owner return v) filter length(x) == 0 return i._id").toArray();
                count += subres.length;
                result.d_own = subres;

                subres = g_db._query("for i in d let x = (for v in 1..1 outbound i._id loc return v) filter length(x) == 0 return i._id").toArray();
                count += subres.length;
                result.d_loc = subres;

                subres = g_db._query("for i in d let x = (for v in 1..1 inbound i._id item return v) filter length(x) == 0 return i._id").toArray();
                count += subres.length;
                result.d_item = subres;

                subres = g_db._query("for i in c let x = (for v in 1..1 outbound i._id owner return v) filter length(x) == 0 return i._id").toArray();
                count += subres.length;
                result.c = subres;

                subres = g_db._query("for i in c let x = (for v in 1..1 inbound i._id item return v) filter i.is_root != true and length(x) == 0 return i._id").toArray();
                count += subres.length;
                result.c_item = subres;

                subres = g_db._query("for i in g let x = (for v in 1..1 outbound i._id owner return v) filter length(x) == 0 return i._id").toArray();
                count += subres.length;
                result.g = subres;

                subres = g_db._query("for i in a let x = (for v in 1..1 outbound i._id owner return v) filter length(x) == 0 return i._id").toArray();
                count += subres.length;
                result.a_own = subres;

                subres = g_db._query("for i in a let x = (for v in 1..1 inbound i._id alias return v) filter length(x) == 0 return i._id").toArray();
                count += subres.length;
                result.a_alias = subres;

                subres = g_db._query("for i in p let x = (for v in 1..1 outbound i._id owner return v) filter length(x) == 0 return i._id").toArray();
                count += subres.length;
                result.p = subres;

                result.vcount = count;
            }
        });

        res.send( result );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('fix', joi.bool().optional(), "Automatically fix dangling edges.")
.summary('Database integrity check')
.description('Database integrity check.');
