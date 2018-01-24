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


//========== GROUP API FUNCTIONS ==========

router.post('/create', function (req, res) {
    try {
        var result = [];

        g_db._executeTransaction({
            collections: {
                read: ["u","x","admin"],
                write: ["g","owner","member"]
            },
            action: function() {
                const client = g_lib.getUserFromCert( req.queryParams.client );
                var uid;

                if ( req.queryParams.subject ) {
                    uid = req.queryParams.subject;
                    g_lib.ensureAdminPermUser( client, "u/" + uid );
                } else {
                    uid = client._key;
                }

                var group = g_db.g.save({ _key: uid + ":" + req.queryParams.gid, gid: req.queryParams.gid, descr: req.queryParams.descr }, { returnNew: true });

                g_db.owner.save({ _from: group._id, _to: "u/" + uid });

                if ( req.queryParams.members ) {
                    var mem;
                    for ( var i in req.queryParams.members ) {
                        mem = req.queryParams.members[i];
                        if ( !g_db._exists( "u/" + mem ))
                            throw g_lib.ERR_USER_NOT_FOUND;

                        g_db.member.save({ _from: group._id, _to: "u/" + mem });
                    }
                }

                result.push( group.new );
            }
        });

        res.send( result );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client crtificate")
.queryParam('subject', joi.string().optional(), "UID of subject user (optional)")
.queryParam('gid', joi.string().required(), "Group ID")
.queryParam('descr', joi.string().optional(), "Description")
.queryParam('members', joi.array(joi.string()).optional(), "Array of member UIDs")
.summary('Creates a new group')
.description('Creates a new group owned by client (or subject), with optional members');



router.post('/delete', function (req, res) {
    try {
        g_db._executeTransaction({
            collections: {
                read: ["u","x","owner","admin"],
                write: ["g","owner","member","acl"]
            },
            action: function() {
                const client = g_lib.getUserFromCert( req.queryParams.client );
                var group_id;

                if ( req.queryParams.subject ) {
                    group_id = "g/" + req.queryParams.subject + ":" + req.queryParams.gid;
                } else {
                    group_id = "g/" + client._key + ":" + req.queryParams.gid;
                }

                g_lib.ensureAdminPermObject( req.queryParams.client, group_id );
                g_graph.g.remove( group_id );
            }
        });
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client crtificate")
.queryParam('subject', joi.string().optional(), "UID of subject user (optional)")
.queryParam('gid', joi.string().required(), "Group ID")
.summary('Deletes an existing group')
.description('Deletes an existing group owned by client or subject');


router.get('/list', function (req, res) {
    try {
        const client = g_lib.getUserFromCert( req.queryParams.client );
        var owner_id;
        var offset;

        if ( req.queryParams.subject ) {
            owner_id = "u/" + req.queryParams.subject;
            offset = req.queryParams.subject.length + 1;
            g_lib.ensureAdminPermUser( client, owner_id );
        } else {
            owner_id = client._id;
            offset = client._key.length + 1;
        }

        var groups = g_db._query( "for v in 1..1 inbound @client owner filter IS_SAME_COLLECTION('g', v) return { id: v._key, descr: v.descr }", { client: owner_id }).toArray();
        for ( var i in groups ) {
            groups[i].id = groups[i].id.substr( offset );
        }
        res.send( groups );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client certificate")
.queryParam('subject', joi.string().optional(), "UID of subject user (optional)")
.summary('List groups')
.description('List groups owned by client or subject');


router.get('/view', function (req, res) {
    try {
        const client = g_lib.getUserFromCert( req.queryParams.client );
        var group_id = "g/";
        var offset;

        if ( req.queryParams.subject ) {
            group_id += req.queryParams.subject + ":" + req.queryParams.id;
            offset = req.queryParams.subject.length + 1;
            g_lib.ensureAdminPermUser( client, group_id );
        } else {
            group_id += client._key + ":" + req.queryParams.id;
            offset = client._key.length + 1;
        }

        var group = g_db.g.document( group_id );
        var result = { id: group._key.substr( offset ), descr: group.descr };
        result.members = g_db._query( "for v in 1..1 outbound @group member return { id: v._key, name_last: v.name_last, name_first: v.name_first }", { group: group_id }).toArray();
        
        res.send( result );

    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client certificate")
.queryParam('subject', joi.string().optional(), "UID of subject user (optional)")
.queryParam('id', joi.string().required(), "Group ID")
.summary('View group details')
.description('View group details');



