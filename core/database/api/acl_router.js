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
                case 'l': result.val |= g_lib.PERM_LIST; break;
                case 'v': result.val |= g_lib.PERM_VIEW; break;
                case 'u': result.val |= g_lib.PERM_UPDATE; break;
                case 'a': result.val |= g_lib.PERM_ADMIN; break;
                case 't': result.val |= g_lib.PERM_TAG; break;
                case 'n': result.val |= g_lib.PERM_NOTE; break;
                case 'r': result.val |= g_lib.PERM_READ; break;
                case 'w': result.val |= g_lib.PERM_WRITE; break;
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

                g_lib.ensureAdminPermObject( client, object._id );

                // Delete existing ACL rules for this object
                g_db.acl.removeByExample({ _from: object._id });

                var rule,erule;
                var obj;

                for ( var i in req.queryParams.rules ) {
                    rule = req.queryParams.rules[i];

                    if ( !is_coll && ( rule.inhgrant || rule.inhdeny ))
                        throw g_lib.ERR_INVALID_PERM;

                    if ( rule.id == "default" || rule.id == "def" ) {
                        object.grant = rule.grant;
                        object.deny = rule.deny;

                        if ( object.grant == 0 )
                            object.grant = null;

                        if ( object.deny == 0 )
                            object.deny = null;

                        object.inhgrant = rule.inhgrant;
                        object.inhdeny = rule.inhdeny;

                        if ( object.inhgrant == 0 )
                            object.inhgrant = null;

                        if ( object.inhdeny == 0 )
                            object.inhdeny = null;

                        g_db._update( object._id, object, { keepNull: false } );
                    } else {
                        if ( rule.id.startsWith("g/")){
                            var group = g_db.g.firstExample({ uid: owner_id, gid: rule.id.substr(2) });

                            if ( !group )
                                throw g_lib.ERR_GROUP_NOT_FOUND;

                            rule.id = group._id;

                        } else {
                            if ( !rule.id.startsWith("u/"))
                                rule.id = "u/" + rule.id;

                            if ( !g_db._exists( rule.id ))
                                throw g_lib.ERR_USER_NOT_FOUND;
                        }

                        obj = { _from : object._id, _to:rule.id };
                        if ( rule.grant )
                            obj.grant = rule.grant;
                        if ( rule.deny )
                            obj.deny = rule.deny;
                        if ( rule.inhgrant )
                            obj.inhgrant = rule.inhgrant;
                        if ( rule.inhdeny )
                            obj.inhdeny = rule.inhdeny;

                        g_db.acl.save( obj );
                    }
                }

                result = g_db._query( "for v, e in 1..1 outbound @object acl return { id: v._id, gid: v.gid, grant: e.grant, deny: e.deny, inhgrant: e.inhgrant, inhdeny: e.inhdeny }", { object: object._id }).toArray();
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
.queryParam('rules', joi.array().items(g_lib.acl_schema).required(), "User and/or group ACL rules to create")
.summary('Update ACL(s) on a data record or collection')
.description('Update access control list(s) (ACLs) on a data record or collection. Default access permissions are set using ACLs with id of "default". Inherited permissions can only be set on collections.');

/*
router.get('/update', function (req, res) {
    try {
        var result = [];

        g_db._executeTransaction({
            collections: {
                read: ["u","uuid","accn","d","c","a","admin","alias"],
                write: ["c","d","acl"]
            },
            action: function() {
                const client = g_lib.getUserFromClientID( req.queryParams.client );
                var object = g_lib.getObject( req.queryParams.id, client );
                var owner_id = g_db.owner.firstExample({ _from: object._id })._to.substr(2);

                var is_coll;
                if ( object._id[0] == "c" )
                    is_coll = true;
                else
                    is_coll = false;

                if ( !is_coll && object._id[0] != "d" )
                    throw g_lib.ERR_INVALID_ID;

                g_lib.ensureAdminPermObject( client, object._id );

                if ( req.queryParams.rules ) {
                    var rule,erule;
                    var g,ig,d,id;
                    var obj;
                    var update = false;

                    for ( var i in req.queryParams.rules ) {
                        rule = req.queryParams.rules[i];
                        g = parsePermAction( rule.grant );
                        ig = parsePermAction( rule.inh_grant );
                        d = parsePermAction( rule.deny );
                        id = parsePermAction( rule.inh_deny );

                        if ( rule.id == "default" || rule.id == "def" ) {
                            switch ( g.act ) {
                                case PERM_ADD:
                                    object.grant |= g.val;
                                    break;
                                case PERM_DEL:
                                    object.grant &= ~g.val;
                                    break;
                                case PERM_SET:
                                    object.grant = g.val;
                                    break;
                            }

                            switch ( d.act ) {
                                case PERM_ADD:
                                    object.deny |= d.val;
                                    break;
                                case PERM_DEL:
                                    object.deny &= ~d.val;
                                    break;
                                case PERM_SET:
                                    object.deny = d.val;
                                    break;
                            }

                            if ( object.grant == 0 )
                                object.grant = null;

                            if ( object.deny == 0 )
                                object.deny = null;

                            if ( !is_coll && ( ig.act != PERM_NC || id.act != PERM_NC ))
                                throw g_lib.ERR_INVALID_PERM;

                            switch ( ig.act ) {
                                case PERM_ADD:
                                    object.inh_grant |= ig.val;
                                    break;
                                case PERM_DEL:
                                    object.inh_grant &= ~ig.val;
                                    break;
                                case PERM_SET:
                                    object.inh_grant = ig.val;
                                    break;
                            }

                            switch ( id.act ) {
                                case PERM_ADD:
                                    object.inh_deny |= id.val;
                                    break;
                                case PERM_DEL:
                                    object.inh_deny &= ~id.val;
                                    break;
                                case PERM_SET:
                                    object.inh_deny = id.val;
                                    break;
                            }

                            if ( object.inh_grant == 0 )
                                object.inh_grant = null;

                            if ( object.inh_deny == 0 )
                                object.inh_deny = null;

                            update = true;
                        } else {
                            if ( rule.id.startsWith("g/")){
                                var group = g_db.g.firstExample({ uid: owner_id, gid: rule.id.substr(2) });

                                if ( !group )
                                    throw g_lib.ERR_GROUP_NOT_FOUND;

                                rule.id = group._id;
                              
                            } else {
                                if ( !rule.id.startsWith("u/"))
                                    rule.id = "u/" + rule.id;

                                if ( !g_db._exists( rule.id ))
                                    throw g_lib.ERR_OBJ_NOT_FOUND;
                            }


                            erule = g_db.acl.firstExample({ _from: object._id, _to: rule.id });

                            if ( !erule )
                                erule = { grant: 0, inh_grant: 0, deny: 0, inh_deny: 0 };

                            switch ( g.act ) {
                                case PERM_ADD:
                                    erule.grant |= g.val;
                                    break;
                                case PERM_DEL:
                                    erule.grant &= ~g.val;
                                    break;
                                case PERM_SET:
                                    erule.grant = g.val;
                                    break;
                            }

                            switch ( d.act ) {
                                case PERM_ADD:
                                    erule.deny |= d.val;
                                    break;
                                case PERM_DEL:
                                    erule.deny &= ~d.val;
                                    break;
                                case PERM_SET:
                                    erule.deny = d.val;
                                    break;
                            }

                            if ( !is_coll && ( ig.act != PERM_NC || id.act != PERM_NC ))
                                throw g_lib.ERR_INVALID_PERM;

                            switch ( ig.act ) {
                                case PERM_ADD:
                                    erule.inh_grant |= ig.val;
                                    break;
                                case PERM_DEL:
                                    erule.inh_grant &= ~ig.val;
                                    break;
                                case PERM_SET:
                                    erule.inh_grant = ig.val;
                                    break;
                            }

                            switch ( id.act ) {
                                case PERM_ADD:
                                    erule.inh_deny |= id.val;
                                    break;
                                case PERM_DEL:
                                    erule.inh_deny &= ~id.val;
                                    break;
                                case PERM_SET:
                                    erule.inh_deny = id.val;
                                    break;
                            }

                            if ( erule._id ) {
                                if ( erule.grant == 0 )
                                    erule.grant = null;

                                if ( erule.deny == 0 )
                                    erule.deny = null;

                                if ( erule.inh_grant == 0 )
                                    erule.inh_grant = null;

                                if ( erule.inh_deny == 0 )
                                    erule.inh_deny = null;

                                if ( erule.grant || erule.deny || erule.inh_grant || erule.inh_deny ) {
                                    g_db.acl.update( erule, erule, { keepNull: false });
                                } else {
                                    g_db.acl.remove( erule );
                                }
                            } else if ( erule.grant || erule.deny || erule.inh_grant || erule.inh_deny ) {
                                obj = { _from: object._id, _to: rule.id };
                                if ( erule.grant )
                                    obj.grant = erule.grant;
                                if ( erule.deny )
                                    obj.deny = erule.deny;
                                if ( erule.inh_grant )
                                    obj.inh_grant = erule.inh_grant;
                                if ( erule.inh_deny )
                                    obj.inh_deny = erule.inh_deny;

                                g_db.acl.save( obj );
                            }
                        }
                    }

                    if ( update )
                        g_db._update( object._id, object, { keepNull: false } );
                    }

                    result = g_db._query( "for v, e in 1..1 outbound @object acl return { id: v._id, gid: v.gid, grant: e.grant, deny: e.deny, inh_grant: e.inh_grant, inh_deny: e.inh_deny }", { object: object._id }).toArray();
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
.summary('Update ACL(s) on a data record or collection')
.description('Update access control list(s) (ACLs) on a data record or collection. Default access permissions are set using ACLs with id of "default". Inherited permissions can only be set on collections.');
*/


router.get('/view', function (req, res) {
    try {
        const client = g_lib.getUserFromClientID( req.queryParams.client );
        var object = g_lib.getObject( req.queryParams.id, client );

        if ( object._id[0] != "c" && object._id[0] != "d" )
            throw g_lib.ERR_INVALID_ID;

        if ( !g_lib.hasAdminPermObject( client, object._id )) {
            //console.log( "hasAdminPermObject = false");
            if ( !g_lib.hasPermission( client, object, g_lib.PERM_ADMIN ))
                throw g_lib.ERR_PERM_DENIED;
            //console.log( "hasPerm(admin) = true");
        }//else
            //console.log( "hasAdminPermObject = true");

        var rules = g_db._query( "for v, e in 1..1 outbound @object acl return { id: v._id, gid: v.gid, grant: e.grant, deny: e.deny, inhgrant: e.inhgrant, inhdeny: e.inhdeny }", { object: object._id }).toArray();
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

function postProcACLRules( rules, object ) {
    var rule;
    var idx;

    for ( var i in rules ) {
        rule = rules[i];

        if ( rule.gid != null ) {
            rule.id = "g/"+rule.gid;
        } else
            delete rule.gid;

        if ( rule.grant == null )
            delete rule.grant;

        if ( rule.deny == null )
            delete rule.deny;

        if ( rule.inhgrant == null )
            delete rule.inhgrant;

        if ( rule.inhdeny == null )
            delete rule.inhdeny;
    }

    if ( object.deny || object.grant || object.inhdeny || object.inhgrant ) {
        rule = { id: 'default' };
        if ( object.grant != null )
            rule.grant = object.grant;
        if ( object.deny != null )
            rule.deny = object.deny;
        if ( object.inhgrant != null )
            rule.inhgrant = object.inhgrant;
        if ( object.inhdeny != null )
            rule.inhdeny = object.inhdeny;
        
        rules.push( rule );
    }
}
