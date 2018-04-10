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

router.get('/create', function (req, res) {
    try {
        var result = [];

        g_db._executeTransaction({
            collections: {
                read: ["u","uid","admin"],
                write: ["g","owner","member"]
            },
            action: function() {
                const client = g_lib.getUserFromClientID( req.queryParams.client );
                var uid;

                if ( req.queryParams.subject ) {
                    uid = req.queryParams.subject;
                    g_lib.ensureAdminPermUser( client, "u/" + uid );
                } else {
                    uid = client._key;
                }

                var group = g_db.g.save({ uid: uid, gid: req.queryParams.id, title: req.queryParams.title, desc: req.queryParams.desc }, { returnNew: true });

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

                group.members = g_db._query( "for v in 1..1 outbound @group member return v._key", { group: group._id }).toArray();

                delete group._id;
                delete group._key;
                delete group._rev;

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
.queryParam('id', joi.string().required(), "Group ID")
.queryParam('title', joi.string().optional(), "Title")
.queryParam('desc', joi.string().optional(), "Description")
.queryParam('members', joi.array(joi.string()).optional(), "Array of member UIDs")
.summary('Creates a new group')
.description('Creates a new group owned by client (or subject), with optional members');


router.get('/update', function (req, res) {
    try {
        var result = [];

        g_db._executeTransaction({
            collections: {
                read: ["u","uid","admin"],
                write: ["g","owner","member"]
            },
            action: function() {
                const client = g_lib.getUserFromClientID( req.queryParams.client );
                var group;

                if ( req.queryParams.subject ) {
                    group = g_db.g.firstExample({ uid: req.queryParams.subject, gid: req.queryParams.id });
                    if ( !group )
                        throw g_lib.ERR_GROUP_NOT_FOUND;
                    g_lib.ensureAdminPermObject( req.queryParams.client, group._id );
                } else {
                    group = g_db.g.firstExample({ uid: client._key, gid: req.queryParams.id });
                    if ( !group )
                        throw g_lib.ERR_GROUP_NOT_FOUND;
                }

                var obj = {};
                var upd = false;

                if ( req.queryParams.title ) {
                    obj.title = req.queryParams.title;
                    upd = true;
                }

                if ( req.queryParams.desc ) {
                    obj.desc = req.queryParams.desc;
                    upd = true;
                }

                if ( upd ) {
                    group = g_db._update( group._id, obj, { returnNew: true });
                    group = group.new;
                }

                var mem;
                var i;

                if ( req.queryParams.add ) {
                    for ( i in req.queryParams.add ) {
                        mem = req.queryParams.add[i];

                        if ( !g_db._exists( "u/" + mem ))
                            throw g_lib.ERR_USER_NOT_FOUND;

                        if ( !g_db.member.firstExample({ _from: group._id, _to: "u/" + mem  }) )
                            g_db.member.save({ _from: group._id, _to: "u/" + mem });
                    }
                }

                if ( req.queryParams.rem ) {
                    var edge;

                    for ( i in req.queryParams.rem ) {
                        mem = req.queryParams.rem[i];

                        edge = g_db.member.firstExample({ _from: group._id, _to: "u/" + mem  });
                        if ( edge )
                            g_db._remove( edge );
                    }
                }

                group.members = g_db._query( "for v in 1..1 outbound @group member return v._key", { group: group._id }).toArray();

                delete group._id;
                delete group._key;
                delete group._rev;

                result.push( group );
            }
        });

        res.send( result );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client crtificate")
.queryParam('subject', joi.string().optional(), "UID of subject user (optional)")
.queryParam('id', joi.string().required(), "Group ID")
.queryParam('title', joi.string().optional(), "New title")
.queryParam('desc', joi.string().optional(), "New description")
.queryParam('add', joi.array(joi.string()).optional(), "Array of member UIDs to add to group")
.queryParam('rem', joi.array(joi.string()).optional(), "Array of member UIDs to remove from group")
.summary('Updates an existing group')
.description('Updates an existing group owned by client (or subject)');


router.get('/delete', function (req, res) {
    try {
        g_db._executeTransaction({
            collections: {
                read: ["u","uid","owner","admin"],
                write: ["g","owner","member","acl"]
            },
            action: function() {
                const client = g_lib.getUserFromClientID( req.queryParams.client );
                var group;

                if ( req.queryParams.subject ) {
                    group = g_db.g.firstExample({ uid: req.queryParams.subject, gid: req.queryParams.id });
                    if ( !group )
                        throw g_lib.ERR_GROUP_NOT_FOUND;
                    g_lib.ensureAdminPermObject( req.queryParams.client, group._id );
                } else {
                    group = g_db.g.firstExample({ uid: client._key, gid: req.queryParams.id });
                    if ( !group )
                        throw g_lib.ERR_GROUP_NOT_FOUND;
                }

                g_graph.g.remove( group._id );
            }
        });
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client crtificate")
.queryParam('subject', joi.string().optional(), "UID of subject user (optional)")
.queryParam('id', joi.string().required(), "Group ID")
.summary('Deletes an existing group')
.description('Deletes an existing group owned by client or subject');


router.get('/list', function (req, res) {
    try {
        const client = g_lib.getUserFromClientID( req.queryParams.client );
        var owner_id;

        if ( req.queryParams.subject ) {
            owner_id = "u/" + req.queryParams.subject;
            g_lib.ensureAdminPermUser( client, owner_id );
        } else {
            owner_id = client._id;
        }

        var groups = g_db._query( "for v in 1..1 inbound @client owner filter IS_SAME_COLLECTION('g', v) return { gid: v.gid, title: v.title }", { client: owner_id }).toArray();

        res.send( groups );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client UID")
.queryParam('subject', joi.string().optional(), "UID of subject user (optional)")
.summary('List groups')
.description('List groups owned by client or subject');


router.get('/view', function (req, res) {
    try {
        const client = g_lib.getUserFromClientID( req.queryParams.client );
        var group;

        if ( req.queryParams.subject ) {
            group = g_db.g.firstExample({ uid: req.queryParams.subject, gid: req.queryParams.id });
            if ( !group )
                throw g_lib.ERR_GROUP_NOT_FOUND;

            g_lib.ensureAdminPermUser( client, group._id );
        } else {
            group = g_db.g.firstExample({ uid: client._key, gid: req.queryParams.id });
            if ( !group )
                throw g_lib.ERR_GROUP_NOT_FOUND;
        }

        var result = { gid: group.gid, title: group.title, desc: group.desc };
        result.members = g_db._query( "for v in 1..1 outbound @group member return v._key", { group: group._id }).toArray();
        res.send( [result] );

    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client UID")
.queryParam('subject', joi.string().optional(), "UID of subject user (optional)")
.queryParam('id', joi.string().required(), "Group ID")
.summary('View group details')
.description('View group details');



