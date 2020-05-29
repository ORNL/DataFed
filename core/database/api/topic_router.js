'use strict';

const   createRouter = require('@arangodb/foxx/router');
const   router = createRouter();
const   joi = require('joi');

const   g_db = require('@arangodb').db;
const   g_lib = require('./support');

module.exports = router;


//==================== TOPIC API FUNCTIONS

router.get('/list', function (req, res) {
    try {
        const client = g_lib.getUserFromClientID( req.queryParams.client );
        var qry = "for v in 1..1 inbound @par top";
        var result;

        if ( !req.queryParams.data ){
            qry += " filter is_same_collection('t',v) sort v.title";
        }else{
            qry += " sort is_same_collection('t',v) DESC, v.title";
        }

        qry += " let ann = (for n in 1..1 outbound v._id note filter n.state == 2 || ( n.state == 1 && ( @client == v.owner || @client == v.creator || @client == n.creator )) return distinct n.type)";

        if ( req.queryParams.offset != undefined && req.queryParams.count != undefined ){
            qry += " limit " + req.queryParams.offset + ", " + req.queryParams.count + " return {id:v._id,title:v.title,owner:v.owner,doi:v.doi,alias:v.alias,notes:ann}";
            result = g_db._query( qry, { client: client._id, par: req.queryParams.id?req.queryParams.id:"t/root" },{},{fullCount:true});
            var tot = result.getExtra().stats.fullCount;
            result = result.toArray();
            result.push({paging:{off:req.queryParams.offset,cnt:req.queryParams.count,tot:tot}});
        }
        else{
            qry += " return {id:v._id,title:v.title,owner:v.owner,alias:v.alias,doi:v.doi,notes:ann}";
            result = g_db._query( qry, { client: client._id, par: req.queryParams.id?req.queryParams.id:"t/root" });
        }

        res.send( result );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('id', joi.string().optional(), "ID of topic to list (omit for top-level)")
.queryParam('data', joi.boolean().default(true), "Include data records (default)")
.queryParam('offset', joi.number().optional(), "Offset")
.queryParam('count', joi.number().optional(), "Count")
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
                    throw [g_lib.ERR_NOT_FOUND,"Data record, "+req.queryParams.id+", not found"];

                g_lib.topicLink( req.queryParams.topic.toLowerCase(), req.queryParams.id );
            }
        });
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('topic', joi.string().required(), "Topic path")
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
                    throw [g_lib.ERR_NOT_FOUND,"Data record, "+req.queryParams.id+", not found"];

                g_lib.topicUnlink( req.queryParams.id );
            }
        });
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('id', joi.string().required(), "Data ID or alias to unlink")
.summary('Unlink topic from data')
.description('Unlink topic from data');
