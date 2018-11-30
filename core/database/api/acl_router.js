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

const PERM_SET = 0;
const PERM_ADD = 1;
const PERM_DEL = 2;
const PERM_NC  = 3;

function parsePermAction( a_perm_str ) {
    var result = {};

    if ( a_perm_str == null ) {
        result.act = PERM_NC;
        return result;
    }

    var pstr = a_perm_str.trim().toLowerCase();

    if ( pstr.length == 0 ) {
        result.act = PERM_NC;
        return result;
    } else if ( pstr[0] == "+" ) {
        result.act = PERM_ADD;
        pstr = pstr.substr(1).trimLeft();
    } else if ( pstr[0] == "-" ) {
        result.act = PERM_DEL;
        pstr = pstr.substr(1).trimLeft();
    } else {
        result.act = PERM_SET;
    }

    if ( isNaN( pstr )) {
        result.val = 0;

        for ( var i in pstr ) {
            switch( pstr[i] ) {
                case 'v': result.val |= g_lib.PERM_VIEW; break;
                case 'r': result.val |= (g_lib.PERM_RD_META|g_lib.PERM_RD_DATA); break;
                case 'w': result.val |= (g_lib.PERM_WR_META|g_lib.PERM_WR_DATA); break;
                case 'a': result.val |= g_lib.PERM_ADMIN; break;
                case 't': result.val |= g_lib.PERM_TAG; break;
                case 'n': result.val |= g_lib.PERM_NOTE; break;
                default: throw g_lib.ERR_INVALID_PERM;
            }
        }
    } else {
        result.val = parseInt( pstr, 16 );
    }

    if ( result.val != result.val )
        throw g_lib.ERR_INVALID_PERM;

    return result;
}

//==================== ACL API FUNCTIONS

router.get('/update', function (req, res) {
    try {
        var result = [];

        g_db._executeTransaction({
            collections: {
                read: ["u","p","uuid","accn","d","c","a","admin","alias"],
                write: ["c","d","acl"]
            },
            action: function() {
                const client = g_lib.getUserFromClientID( req.queryParams.client );
                var object = g_lib.getObject( req.queryParams.id, client );
                var owner_id = g_db.owner.firstExample({ _from: object._id })._to;
                //var owner = g_db._document( owner_id );
                //owner_id = owner_id.substr(2);

                //console.log("obj:",object);

                var is_coll;

                if ( object._id[0] == "c" )
                    is_coll = true;
                else
                    is_coll = false;

                if ( !is_coll && object._id[0] != "d" )
                    throw g_lib.ERR_INVALID_ID;

                if ( !g_lib.hasAdminPermObject( client, object._id )){
                    if ( !g_lib.hasPermissions( client, object, g_lib.PERM_ADMIN ))
                        throw g_lib.ERR_PERM_DENIED;
                }

                var acl_mode = 0;
                var new_obj = {};

                if ( req.queryParams.rules ){

                    // Delete existing ACL rules for this object
                    g_db.acl.removeByExample({ _from: object._id });

                    var rule;
                    var obj;

                    for ( var i in req.queryParams.rules ) {
                        rule = req.queryParams.rules[i];

                        if ( !is_coll && rule.inhgrant )
                            throw g_lib.ERR_INVALID_PERM;

                        if ( rule.id == "default" || rule.id == "def" ) {
                            new_obj.grant = rule.grant;

                            if ( new_obj.grant == 0 )
                                new_obj.grant = null;

                            new_obj.inhgrant = rule.inhgrant;

                            if ( new_obj.inhgrant == 0 )
                                new_obj.inhgrant = null;

                        } else {
                            if ( rule.id.startsWith("g/")){
                                acl_mode |= 2;
                                var group = g_db.g.firstExample({ uid: owner_id, gid: rule.id.substr(2) });

                                if ( !group )
                                    throw g_lib.ERR_GROUP_NOT_FOUND;

                                rule.id = group._id;

                            } else {
                                acl_mode |= 1;
                                if ( !g_db._exists( rule.id ))
                                    throw g_lib.ERR_USER_NOT_FOUND;
                            }

                            obj = { _from : object._id, _to:rule.id };
                            if ( rule.grant )
                                obj.grant = rule.grant;
                            if ( rule.inhgrant )
                                obj.inhgrant = rule.inhgrant;

                            g_db.acl.save( obj );
                        }
                    }
                }

                new_obj.acls = acl_mode;

                if ( req.queryParams.public != undefined ){
                    if ( req.queryParams.public )
                        new_obj.public = true;
                    else
                        new_obj.public = null;
                }

                g_db._update( object._id, new_obj, { keepNull: false } );

                result = g_db._query( "for v, e in 1..1 outbound @object acl return { id: v._id, gid: v.gid, grant: e.grant, inhgrant: e.inhgrant }", { object: object._id }).toArray();
                postProcACLRules( result, object );
            }
        });

        res.send( result );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('id', joi.string().required(), "ID or alias of data record or collection")
.queryParam('rules', joi.array().items(g_lib.acl_schema).optional(), "User and/or group ACL rules to create")
.queryParam('public', joi.boolean().optional(), "Enable public access")
.summary('Update ACL(s) and/or public access on a data record or collection')
.description('Update access control list(s) (ACLs) and/or public access on a data record or collection. Default access permissions are set using ACLs with id of "default". Inherited permissions can only be set on collections.');

router.get('/view', function (req, res) {
    try {
        const client = g_lib.getUserFromClientID( req.queryParams.client );
        var object = g_lib.getObject( req.queryParams.id, client );

        if ( object._id[0] != "c" && object._id[0] != "d" )
            throw g_lib.ERR_INVALID_ID;

        if ( !g_lib.hasAdminPermObject( client, object._id )) {
            if ( !g_lib.hasPermissions( client, object, g_lib.PERM_ADMIN ))
                throw g_lib.ERR_PERM_DENIED;
        }

        var rules = g_db._query( "for v, e in 1..1 outbound @object acl return { id: v._id, gid: v.gid, grant: e.grant, inhgrant: e.inhgrant }", { object: object._id }).toArray();
        postProcACLRules( rules, object );

        res.send( rules );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('id', joi.string().required(), "ID or alias of data record or collection")
.summary('View current ACL on an object')
.description('View current ACL on an object (data record or collection)');


router.get('/by_user', function (req, res) {
    try {
        const client = g_lib.getUserFromClientID( req.queryParams.client );

        res.send( g_lib.usersWithClientACLs( client._id ));
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.summary('List users that have shared data or collections with client')
.description('List users that have shared data or collections with client');


router.get('/by_user/list', function (req, res) {
    try {
        const client = g_lib.getUserFromClientID( req.queryParams.client );
        const owner_id = req.queryParams.owner;
        var result = g_db._query("for v in 1..2 inbound @client member, acl filter v.owner == @owner return {id:v._id,title:v.title,locked:v.locked}", { client: client._id, owner: owner_id });
        res.send( result );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('owner', joi.string().required(), "Owner ID")
.summary('Lists data and collections shared with client by owner')
.description('Lists data and collections shared with client by owner');

router.get('/by_proj', function (req, res) {
    try {
        const client = g_lib.getUserFromClientID( req.queryParams.client );
        var result = g_lib.projectsWithClientACLs( client._id );
        res.send( result );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.summary('List users that have shared data or collections with client')
.description('List users that have shared data or collections with client');

router.get('/by_proj/list', function (req, res) {
    try {
        const client = g_lib.getUserFromClientID( req.queryParams.client );
        const owner_id = req.queryParams.owner;
        var result = g_db._query("for v in 1..2 inbound @client member, acl filter v.owner == @owner return {id:v._id,title:v.title,locked:v.locked}", { client: client._id, owner: owner_id });
        res.send( result );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('owner', joi.string().required(), "Owner ID")
.summary('Lists data and collections shared with client by owner')
.description('Lists data and collections shared with client by owner');

function postProcACLRules( rules, object ) {
    var rule;

    for ( var i in rules ) {
        rule = rules[i];

        if ( rule.gid != null ) {
            rule.id = "g/"+rule.gid;
        } else
            delete rule.gid;

        if ( rule.grant == null )
            delete rule.grant;

        if ( rule.inhgrant == null )
            delete rule.inhgrant;
    }

    if ( object.grant || object.inhgrant ) {
        rule = { id: 'default' };
        if ( object.grant != null )
            rule.grant = object.grant;
        if ( object.inhgrant != null )
            rule.inhgrant = object.inhgrant;
        
        rules.push( rule );
    }
}
