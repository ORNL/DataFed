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


//==================== TOPIC API FUNCTIONS

router.get('/list', function (req, res) {
    try {
        var topics = g_db._query("for v in 1..1 outbound @par top return {id:v._id,name:v.name,title:v.title}",{par: req.queryParams.parent?req.queryParams.parent:"t/root" });

        res.send( topics );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('parent', joi.string().optional(), "ID of parent topic")
.summary('List topics')
.description('List topics with optional parent');

router.get('/link', function (req, res) {
    try {
        g_db._executeTransaction({
            collections: {
                read: ["d"],
                write: ["t","top"]
            },
            action: function() {
                if ( !g_db.d.exists( req.queryParams.id ))
                    throw g_lib.ERR_INVALID_ID;

                var i,topic,parent = "t/root";

                for ( i = 0; i < req.queryParams.topic.length; i++ ){
                    topic = g_db._query("for v in 1..1 outbound @par top filter v.name == @name return v",{par:parent,name:req.queryParams.topic[i]});
                    if ( topic.hasNext() ){
                        parent = topic.next()._id;
                    }else{
                        for ( ; i < req.queryParams.topic.length; i++ ){
                            topic = g_db.t.save({name:req.queryParams.topic[i]},{returnNew:true});
                            g_db.top.save({_from:parent,_to:topic._id});
                            parent = topic._id;
                        }
                        break;
                    }
                }

                if ( !g_db.top.firstExample({_from:parent,_to:req.queryParams.id})){
                    g_db.top.save({_from:parent,_to:req.queryParams.id});
                }
            }
        });
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('topic', joi.array().items(joi.string()).required(), "Topic path")
.queryParam('id', joi.string().required(), "Data ID to link")
.summary('Link topic to data')
.description('Link topic to data');

router.get('/unlink', function (req, res) {
    try {
        g_db._executeTransaction({
            collections: {
                read: ["d"],
                write: ["t","top"]
            },
            action: function() {
                if ( !g_db.d.exists( req.queryParams.id ))
                    throw g_lib.ERR_INVALID_ID;

                var i,topic,parent = "t/root";
                var path = [];

                for ( i = 0; i < req.queryParams.topic.length; i++ ){
                    topic = g_db._query("for v in 1..1 outbound @par top filter v.name == @name return v",{par:parent,name:req.queryParams.topic[i]});
                    if ( topic.hasNext() ){
                        parent = topic.next()._id;
                        path.push(parent);
                    }else{
                        throw g_lib.ERR_INVALID_TOPIC;
                    }
                }

                g_db.top.removeByExample({_from:parent,_to:req.queryParams.id});
                const graph = require('@arangodb/general-graph')._graph('sdmsg');

                // Unwind path, deleting orphaned topics along the way
                for ( i = path.length - 1; i >= 0; i-- ){
                    // Get link count
                    if ( g_db.top.firstExample({_from:path[i]}))
                        break;
                    else
                        graph.t.remove( path[i] );
                }
            }
        });
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('topic', joi.array().items(joi.string()).required(), "Topic path")
.queryParam('id', joi.string().required(), "Data ID or alias to unlink")
.summary('Unlink topic from data')
.description('Unlink topic from data');
