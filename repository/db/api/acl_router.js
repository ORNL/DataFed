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
                case 'l': result.val |= g_lib.PERM_REC_LIST; break;
                case 'v': result.val |= g_lib.PERM_REC_VIEW; break;
                case 'u': result.val |= g_lib.PERM_REC_UPDATE; break;
                case 'a': result.val |= g_lib.PERM_REC_ADMIN; break;
                case 't': result.val |= g_lib.PERM_REC_TAG; break;
                case 'n': result.val |= g_lib.PERM_REC_NOTE; break;
                case 'r': result.val |= g_lib.PERM_DAT_READ; break;
                case 'w': result.val |= g_lib.PERM_DAT_WRITE; break;
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

router.post('/update', function (req, res) {
    try {
        g_db._executeTransaction({
            collections: {
                read: ["u","x","d","c","a","admin","alias"],
                write: ["c","d","acl"]
            },
            action: function() {
                const client = g_lib.getUserFromCert( req.queryParams.client );
                var object = g_lib.getObject( req.queryParams.object, client );
                var owner_id = g_db.owner.firstExample({ _from: object._id })._to.substr(2);

                //console.log("obj:",object);

                var is_coll;
                if ( object._id[0] == "c" )
                    is_coll = true;
                else
                    is_coll = false;

                if ( !is_coll && object._id[0] != "d" )
                    throw g_lib.ERR_INVALID_ID;

                g_lib.ensureAdminPermObject( client, object._id );

                if ( req.queryParams.acls ) {
                    var rule,erule;
                    var g,ig,d,id;
                    var obj;
                    var update = false;

                    for ( var i in req.queryParams.acls ) {
                        rule = req.queryParams.acls[i];
                        g = parsePermAction( rule.grant );
                        ig = parsePermAction( rule.inh_grant );
                        d = parsePermAction( rule.deny );
                        id = parsePermAction( rule.inh_deny );

                        if ( rule.id == "default" ) {
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
                            if ( rule.id[0] == "g" ){
                                console.log("group:",rule.id);
                                rule.id = "g/" + owner_id + ":" + rule.id.substr(2);
                                console.log("new group:",rule.id);
                            }
                            if ( !g_db._exists( rule.id ))
                                throw g_lib.ERR_OBJ_NOT_FOUND;

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
            }
        });
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client certificate")
.queryParam('object', joi.string().required(), "ID or alias of data record or collection")
.queryParam('acls', joi.array().items(g_lib.acl_schema).optional(), "User and/or group ACL rules to create")
.summary('Update ACL(s) on a data record or collection')
.description('Update access control list(s) (ACLs) on a data record or collection. Default access permissions are set using ACLs with id of "default". Inherited permissions can only be set on collections.');


router.get('/view', function (req, res) {
    try {
        const client = g_lib.getUserFromCert( req.queryParams.client );
        var object = g_lib.getObject( req.queryParams.object, client );

        if ( object._id[0] != "c" && object._id[0] != "d" )
            throw g_lib.ERR_INVALID_ID;

        if ( !g_lib.hasAdminPermObject( client, object._id )) {
            if ( !g_lib.hasPermission( client, object, g_lib.PERM_REC_ADMIN ))
                throw g_lib.ERR_PERM_DENIED;
        }

        var idx;
        var rule;
        var rules = g_db._query( "for v, e in 1..1 outbound @object acl return { id: v._id, grant: e.grant, deny: e.deny, inh_grant: e.inh_grant, inh_deny: e.inh_deny }", { object: object._id }).toArray();

        for ( var i in rules ) {
            rule = rules[i];

            if ( rule.id[0] == "g" ) {
                idx = rule.id.indexOf(":");
                if ( idx != -1 )
                    rule.id = "g/" + rule.id.substr( idx + 1 );
            }

            if ( rule.grant == null )
                delete rule.grant;

            if ( rule.deny == null )
                delete rule.deny;

            if ( rule.inh_grant == null )
                delete rule.inh_grant;

            if ( rule.inh_deny == null )
                delete rule.inh_deny;
        }

        if ( object.deny || object.grant || object.inh_deny || object.inh_grant ) {
            rule = { id: 'default' };
            if ( object.grant != null )
                rule.grant = object.grant;
            if ( object.deny != null )
                rule.deny = object.deny;
            if ( object.inh_grant != null )
                rule.inh_grant = object.inh_grant;
            if ( object.inh_deny != null )
                rule.inh_deny = object.inh_deny;
            
            rules.push( rule );
        }


        res.send( rules );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client certificate")
.queryParam('object', joi.string().required(), "ID or alias of data record or collection")
.summary('View current ACL on an object')
.description('View current ACL on an object (data record or collection)');


