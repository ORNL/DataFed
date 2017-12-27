/*jshint strict: global */
/*jshint esversion: 6 */
/*jshint multistr: true */
/* globals require */
/* globals module */
/* globals console */

'use strict';

const   joi = require('joi');


module.exports = ( function() {
    var obj = {};

    obj.db = require('@arangodb').db;
    obj.graph = require('@arangodb/general-graph')._graph('sdmsg');

    obj.PERM_NONE     = 0x00;
    obj.PERM_VIEW     = 0x01;
    obj.PERM_CREATE   = 0x02;
    obj.PERM_READ     = 0x04;
    obj.PERM_UPDATE   = 0x08;
    obj.PERM_WRITE    = 0x10;
    obj.PERM_DELETE   = 0x20;
    obj.PERM_TAG      = 0x40;
    obj.PERM_ANNOTATE = 0x80;
    obj.PERM_ALL      = 0xFF;

    obj.acl_schema = joi.object().keys({
        subject: joi.string().required(),
        grant: joi.number().optional(),
        deny: joi.number().optional()
    });

    obj.ERR_INFO = [];
    obj.ERR_COUNT = 0;

    obj.ERR_PERM_DENIED           = obj.ERR_COUNT++; obj.ERR_INFO.push([ 400, "Permission denied" ]);
    obj.ERR_CERT_IN_USE           = obj.ERR_COUNT++; obj.ERR_INFO.push([ 400, "Certificate is in use" ]);
    obj.ERR_INVALID_ALIAS         = obj.ERR_COUNT++; obj.ERR_INFO.push([ 400, "Invalid alias" ]);
    obj.ERR_ITEM_ALREADY_LINKED   = obj.ERR_COUNT++; obj.ERR_INFO.push([ 400, "Item already in collection" ]);
    obj.ERR_CERT_NOT_FOUND        = obj.ERR_COUNT++; obj.ERR_INFO.push([ 400, "Certificate not found" ]);
    obj.ERR_OBJ_NOT_FOUND         = obj.ERR_COUNT++; obj.ERR_INFO.push([ 400, "Object not found" ]);
    obj.ERR_ALIAS_NOT_FOUND       = obj.ERR_COUNT++; obj.ERR_INFO.push([ 400, "Alias not found" ]);
    obj.ERR_USER_NOT_FOUND        = obj.ERR_COUNT++; obj.ERR_INFO.push([ 400, "User not found" ]);
    obj.ERR_DATA_NOT_FOUND        = obj.ERR_COUNT++; obj.ERR_INFO.push([ 400, "Data record not found" ]);
    obj.ERR_COLL_NOT_FOUND        = obj.ERR_COUNT++; obj.ERR_INFO.push([ 400, "Collection not found" ]);
    obj.ERR_CANNOT_DEL_ROOT       = obj.ERR_COUNT++; obj.ERR_INFO.push([ 400, "Cannot delete root collection" ]);
    obj.ERR_MISSING_REQ_OPTION    = obj.ERR_COUNT++; obj.ERR_INFO.push([ 400, "Missing one or more required options" ]);

    obj.isInteger = function( x ) {
        return (typeof x === 'number') && (x % 1 === 0);
    };

    obj.handleException = function( e, res ) {
        if ( obj.isInteger( e ) && e >= 0 && e < obj.ERR_COUNT ) {
            res.throw( obj.ERR_INFO[e][0], obj.ERR_INFO[e][1] );
        } else if ( e.hasOwnProperty( "errorNum" )) {
            switch ( e.errorNum ) {
                case 1202:
                    res.throw( 404, "Record does not exist" );
                    break;
                default:
                    res.throw( 500, "Unexpected DB exception: " + e );
                    break;
            }
        } else {
            res.throw( 500, "Unexpected exception: " + e );
        }
    };

    obj.getUserFromCert = function( a_cert_subject ) {
        var result = obj.db._query( "for c in cert filter c.subject == @cert_subject for u in inbound c._id ident return u", { 'cert_subject': a_cert_subject } ).toArray();

        if ( result.length != 1 )
            throw obj.ERR_CERT_NOT_FOUND;

        return result[0];
    };

    obj.getObject = function( a_obj_id, a_client ) {
        var alias = obj.getAliasID( a_obj_id, a_client );
        //console.log('alias:',alias);
        if ( alias ) {
            var result = obj.db._query( "for v in 1..1 inbound @alias alias return v", { alias: alias }).toArray();
            //console.log( 'alias res:', result );
            if ( result.length != 1 )
                throw obj.ERR_OBJ_NOT_FOUND;

            return result[0];
        } else {
            try {
                //console.log( 'trying:', a_obj_id );
                return obj.db.document( a_obj_id );
            } catch( e ) {
                throw obj.ERR_OBJ_NOT_FOUND;
            }
        }

    };

    obj.hasAdminPermUser = function( a_client, a_user_id ) {
        console.log("hasAdminPermUser:",a_client, "user_id:", a_user_id);
        console.log( obj.db.admin );

        if ( a_client._id != a_user_id && !a_client.is_admin && !obj.db.admin.firstExample({ _from: a_user_id, _to: a_client._id }))  { 
            return false;
        } else {
            return true;
        }
    };

    obj.hasAdminPermObject = function( a_client, a_object_id ) {
        if ( a_client.is_admin )
            return true;

        var owner_id = obj.db.owner.firstExample({ _from: a_object_id })._to;
        if ( owner_id == a_client._id )
            return true;

        if ( obj.db.admin.firstExample({ _from: owner_id, _to: a_client._id }))
            return true;

        return false;
    };

    obj.ensureAdminPermUser = function( a_client, a_user_id ) {
        if ( !obj.hasAdminPermUser( a_client, a_user_id ))
            throw obj.ERR_PERM_DENIED;
    };

    obj.ensureAdminPermObject = function( a_client, a_object_id ) {
        if ( !obj.hasAdminPermObject( a_client, a_object_id ))
            throw obj.ERR_PERM_DENIED;
    };

    obj.getAliasID = function( a_alias, a_client ) {
        if ( a_alias.startsWith( "data/" ) || a_alias.startsWith( "coll/" ) ) 
            return null;

        if ( a_alias.indexOf(":") == -1 )
            return "aliases/" + a_client._key + ":" + a_alias;
        else
            return "aliases/" + a_alias;
    };

    obj.hasPermission = function( a_client, a_object, a_req_perm ) {
        if ( a_client.is_admin )
            return true;

        var owner = obj.db.owner.firstExample({ _from: a_object._id });
        if ( !owner )
            throw obj.ERR_OBJ_NOT_FOUND;

        if ( a_client._id == owner._id || obj.db.admin.firstExample({ _from: owner._id, _to: a_client._id }))
            return true;

        var perm_found = 0;
        var perm_deny  = 0;
        var acl;
        var result;
        var mask;

        // Evaluate user permissions on object

        var acls = obj.db._query( "for v, e in 1..1 outbound @object acl filter v._id == @client return e", { object: a_object._id, client: a_client._id } ).toArray();
        for ( var i in acls ) {
            acl = acls[i];
            console.log("user_perm:",acl);
            perm_found |= ( acl.perm_grant | acl.perm_deny );
            perm_deny |= acl.perm_deny;
        }
        console.log("perm_req:", a_req_perm, "perm_found:", perm_found, "perm_deny:", perm_deny );
        result = obj.evalPermissions( a_req_perm, perm_found, perm_deny );
        console.log("eval res:", result );
        if ( result != null )
            return result;

        // Evaluate group permissions on object

        acls = obj.db._query( "for v, e, p in 2..2 outbound @object acl, outbound member filter p.vertices[2]._id == @client return p.edges[0]", { object: a_object._id, client: a_client._id } ).toArray();

        console.log("eval group", acls );

        mask = ~perm_found;
        for ( i in acls ) {
            acl = acls[i];
            console.log("group_perm:",acl);
            if ( mask & ( acl.perm_grant | acl.perm_deny ) > 0 ) {
                perm_found |= ( acl.perm_grant | acl.perm_deny );
                perm_deny |= ( acl.perm_deny & mask );
            }
        }

        console.log("perm_req:", a_req_perm, "perm_found:", perm_found, "perm_deny:", perm_deny );

        result = obj.evalPermissions( a_req_perm, perm_found, perm_deny );

        console.log("eval res:", result );
        if ( result != null )
            return result;

        // Evaluate default permissions on object

        mask = ~perm_found;
        if ( mask & ( a_object.perm_grant | a_object.perm_deny ) > 0 ) {
            perm_found |= ( a_object.perm_grant | a_object.perm_deny );
            perm_deny |= ( a_object.perm_deny & mask );

            result = obj.evalPermissions( a_req_perm, perm_found, perm_deny );
            if ( result != null )
                return result;
        }

        // TODO Eval inherited permissions
        return false;
    };

    obj.evalPermissions = function( a_req_perm, a_perm_found, a_perm_deny ) {
        if (( a_perm_found & a_req_perm ) != a_req_perm )
            return null;

        if (( a_req_perm & a_perm_deny ) != 0 )
            return false;
        else
            return true;
    };

    return obj;
}() );


        
//----- GET PERMISSION BY DATA ID

    /* Check if calling user has requested permissions:
     * - Owners have all permissions.
     * - Non-owners can be granted permission (by owner) via user ACLs, group ACLs, and default permissions attached to
     *   data, or collections containing data, or collections of collections, etc.
     * - Permission priority is data user-ACL > data group-ACL > default data permission > collection
     *   (user/group/default) > parent collection, etc
     * - The first ACL found (for a given collection path) defines the permissions for the calling user and the search
     *   stops for that path.
     * - The final permission for a user is the union of permissions from all collection paths to the requested data.
     * - Permissions (for a given collection path) are inherited from parent collections only if more specific and
     *   applicable permissions are not set (a default permission will stop inheritence).
     * - Only permissions of collections owned by the owner of the data in question apply.
     */

/*
router.get('/check_perm/data/by_id', function (req, res) {
    
    var valid = false;

    try {
        var     done = false;
        var     perm = 0;
        const   client = getUserFromCert( req.queryParams.cert_subject );
        const   data_id = req.queryParams.data_id;
        var     i;
        var     result;

        console.log("client:", client, "data_id:", data_id );

        if ( db.owner.firstExample({ _from: data_id, _to: client._id }) != null ) {
            console.log("is owner" );
            // client is owner, thus has all permissions
            valid = true;
        } else {
            console.log("is NOT owner" );
            // Client is not owner, check acls

            // Check user-acl on data
            var acl = db.acl.firstExample({ _from: data_id, _to: client._id });
            if ( acl ) {
                if (( acl.permission & req.queryParams.req_perm ) == req.queryParams.req_perm )
                    valid = true;
                done = true;
            } else {
                // check group-acl(s) on data
                result = db._query( "for v, e, p in 2..2 outbound @data acl, outbound member filter v._id == @client return p.edges[0]", { data: data_id, client: client._id } ).toArray();
                if ( result.length > 0 ) {
                    perm = 0;
                    for ( i in result ) {
                        perm |= result[i].permission;
                    }
                    if (( perm & req.queryParams.req_perm ) == req.queryParams.req_perm )
                        valid = true;
                    done = true;
                }
            }

            if ( !done ) {
                // No ACLs found, check data default permission
                var data = db._query( "let d = document(@data) return { def_perm : d.def_perm }", { data : data_id }).toArray();
                if ( data.length == 1 && data[0].def_perm ) {
                    if (( data[0].def_perm & req.queryParams.req_perm ) == req.queryParams.req_perm )
                        valid = true;
                    done = 1;
                }
            }

            if ( !done ) {
                // No data-level permissions found, evaulate all collection paths (owned by data owner)
                // This process is a breadth-first search, pruned early if requested permissions are found

                // Union of permissions from all collection paths
                var perm_union = 0;

                // Get the data owner's ID
                var owner_id = db.owner.firstExample({ _from: data_id })._id;

                // Get all owner's collections containing this data (including default permission)
                var collections = db._query( "for v, e, p in 2..2 inbound @data item, outbound owner filter v._id == @owner return { _id: p.vertices[1]._id, def_perm: p.vertices[1].def_perm }", { data : data_id, owner: owner_id }).toArray();

                while ( collections.length > 0 ) {
                    var next = [];
                    for ( var c in collections ) {
                        var coll = collections[c];
                        perm = 0;
                        done = false;

                        acl = db.acl.firstExample({ _from: coll._id, _to: client._id });
                        if ( acl ) {
                            perm = acl.permission;
                            done = true;
                        } else {
                            // check group-acl(s) on data
                            result = db._query( "for v, e, p in 2..2 outbound @coll acl, outbound member filter v._id == @client return p.edges[0]", { coll: coll._id, client: client._id }).toArray();
                            if ( result.length > 0 ) {
                                for ( i in result ) {
                                    perm |= result[i].permission;
                                }
                                done = true;
                            }
                        }

                        if ( !done && coll.def_perm )
                            perm = coll.def_perm;

                        perm_union |= perm;

                        if (( perm_union & req.queryParams.req_perm ) == req.queryParams.req_perm ) {
                            valid = true;
                            break;
                        }

                        if ( !done )
                            next.push( coll._id );
                    }

                    if ( valid || next.length == 0 )
                        break;

                    collections = db._query( "for vert in @start_vertices for v, e, p in 2..2 inbound vert item, outbound owner filter v._id == @owner return { _id: p.vertices[1]._id, def_perm: p.vertices[1].def_perm }", { start_vertices : next, owner: owner_id }).toArray();
                }
            }
        }
    } catch( e ) {
        handleException( e, res );
    }

    res.send({ "valid" : valid });
})
.queryParam('cert_subject', joi.string().required(), "Certificate subject string")
.queryParam('data_id', joi.string().required(), "Data id")
.queryParam('req_perm', joi.number().integer().required(), "Requested permission mask")
.summary('Checks for data permission by id')
.description('Checks for data permission by id');
 */
 

