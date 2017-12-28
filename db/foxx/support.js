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
    obj.bad_chars = "/:\" ";

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
    obj.ERR_INVALID_ID            = obj.ERR_COUNT++; obj.ERR_INFO.push([ 400, "Invalid ID" ]);
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

    obj.getUserFromCert = function( a_cert ) {
        var result = obj.db._query( "for i in x filter i.subject == @cert for j in inbound i._id ident return j", { 'cert': a_cert } ).toArray();

        if ( result.length != 1 )
            throw obj.ERR_CERT_NOT_FOUND;

        return result[0];
    };

    obj.getObject = function( a_obj_id, a_client ) {
        try {
            return obj.db.document( obj.resolveID( a_obj_id, a_client ));
        } catch( e ) {
            throw obj.ERR_OBJ_NOT_FOUND;
        }
    };

    obj.hasAdminPermUser = function( a_client, a_user_id ) {
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
/*
    obj.getAliasID = function( a_alias, a_client ) {
        if ( a_alias.startsWith( "data/" ) || a_alias.startsWith( "coll/" ) ) 
            return null;

        if ( a_alias.indexOf(":") == -1 )
            return "aliases/" + a_client._key + ":" + a_alias;
        else
            return "aliases/" + a_alias;
    };
*/
    obj.validateAlias = function( a_alias, a_client ) {
        for ( var i = 0; i < a_alias.length; ++i ) {
            if ( obj.bad_chars.indexOf( a_alias[i] ) != -1 )
                throw obj.ERR_INVALID_ALIAS;
        }
    };

    obj.resolveID = function( a_id, a_client ) {
        if ( a_id[1] == '/' ) {
            return a_id;
        } else {
            var alias_id = "a/";
            if ( a_id.indexOf(":") == -1 )
                alias_id += a_client._key + ":" + a_id;
            else
                alias_id += a_id;

            var alias = obj.db.alias.firstExample({ _to: alias_id });
            if ( !alias )
                throw obj.ERR_ALIAS_NOT_FOUND;

            return alias._from;
        }
    };

    /* Check if calling user has requested permissions:
     * - Owners, admins, and admin delegates have all permissions (this must be checked outside of this function).
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
    obj.hasPermission = function( a_client, a_object, a_req_perm ) {
        console.log("check perm:", a_req_perm, "client:", a_client._id, "object:", a_object._id );

        var perm_found  = 0;
        var perm_deny   = 0;
        var acl;
        var result;
        var mask;

        // Evaluate user permissions on object

        var acls = obj.db._query( "for v, e in 1..1 outbound @object acl filter v._id == @client return e", { object: a_object._id, client: a_client._id } ).toArray();
        for ( var i in acls ) {
            acl = acls[i];
            //console.log("user_perm:",acl);
            perm_found |= ( acl.perm_grant | acl.perm_deny );
            perm_deny |= acl.perm_deny;
        }
        //console.log("perm_req:", a_req_perm, "perm_found:", perm_found, "perm_deny:", perm_deny );
        result = obj.evalPermissions( a_req_perm, perm_found, perm_deny );
        //console.log("eval res:", result );
        if ( result != null ) {
            console.log("result (usr acl):", result );
            return result;
        }

        // Evaluate group permissions on object

        acls = obj.db._query( "for v, e, p in 2..2 outbound @object acl, outbound member filter p.vertices[2]._id == @client return p.edges[0]", { object: a_object._id, client: a_client._id } ).toArray();

        //console.log("eval group", acls );

        mask = ~perm_found;
        for ( i in acls ) {
            acl = acls[i];
            //console.log("group_perm:",acl);
            if ( mask & ( acl.perm_grant | acl.perm_deny ) > 0 ) {
                perm_found |= ( acl.perm_grant | acl.perm_deny );
                perm_deny |= ( acl.perm_deny & mask );
            }
        }

        //console.log("perm_req:", a_req_perm, "perm_found:", perm_found, "perm_deny:", perm_deny );

        result = obj.evalPermissions( a_req_perm, perm_found, perm_deny );

        //console.log("eval res:", result );
        if ( result != null ) {
            console.log("result (grp acl):", result );
            return result;
        }

        // Evaluate default permissions on object
        console.log("check default, perm_found:", perm_found );

        mask = ~perm_found;
        if ( mask & ( a_object.def_grant | a_object.def_deny ) > 0 ) {
            perm_found |= ( a_object.def_grant | a_object.def_deny );
            perm_deny |= ( a_object.def_deny & mask );

            result = obj.evalPermissions( a_req_perm, perm_found, perm_deny );
            if ( result != null ) {
                console.log("result (def perm):", result );
                return result;
            }
        }

        // If not all requested permissions have been found, evaluate permissions inherited from parent (owned) containers

        var owner_id = obj.db.owner.firstExample({ _from: a_object._id })._to;
        var children = [a_object];
        var parents;
        var parent;
        var usr_perm_found, usr_perm_deny;
        var grp_perm_found, grp_perm_deny;
        var def_perm_found, def_perm_deny;

        while ( 1 ) {
            // Find all parent collections owned by object owner

            parents = obj.db._query( "for i in @children for v, e, p in 2..2 inbound i item, outbound owner filter v._id == @owner return p.vertices[1]", { children : children, owner: owner_id }).toArray();
            if ( parents.length == 0 )
                break;

            // Gather user, group, and default permissions collectively over all parents

            usr_perm_found = 0; usr_perm_deny = 0;
            grp_perm_found = 0; grp_perm_deny = 0;
            def_perm_found = 0; def_perm_deny = 0;

            for ( i in parents ) {
                parent = parents[i];

                // User ACL first
                acls = obj.db._query( "for v, e in 1..1 outbound @object acl filter v._id == @client return e", { object: parent._id, client: a_client._id } ).toArray();
                for ( i in acls ) {
                    acl = acls[i];
                    usr_perm_found |= ( acl.perm_grant | acl.perm_deny );
                    usr_perm_deny |= acl.perm_deny;
                }

                // Group ACL next
                acls = obj.db._query( "for v, e, p in 2..2 outbound @object acl, outbound member filter p.vertices[2]._id == @client return p.edges[0]", { object: parent._id, client: a_client._id } ).toArray();
                for ( i in acls ) {
                    acl = acls[i];
                    grp_perm_found |= ( acl.perm_grant | acl.perm_deny );
                    grp_perm_deny |= acl.perm_deny;
                }

                // Default permissions next
                if ( parent.def_grant ) {
                    def_perm_found |= parent.def_grant;
                }

                if ( parent.def_deny ) {
                    def_perm_found |= parent.def_deny;
                    def_perm_deny |= parent.def_deny;
                }
            }

            // Eval collective user permissions found
            mask = ~perm_found;
            if (( mask & usr_perm_found ) > 0 ) {
                perm_found |= usr_perm_found;
                perm_deny |= ( usr_perm_deny & mask );

                result = obj.evalPermissions( a_req_perm, perm_found, perm_deny );
                if ( result != null ) {
                    console.log("result (prnt usr acl):", result );
                    return result;
                }
            }

            // Eval collective group permissions found
            mask = ~perm_found;
            if (( mask & grp_perm_found ) > 0 ) {
                perm_found |= grp_perm_found;
                perm_deny |= ( grp_perm_deny & mask );

                result = obj.evalPermissions( a_req_perm, perm_found, perm_deny );
                if ( result != null ) {
                    console.log("result (prnt grp acl):", result );
                    return result;
                }
            }

            mask = ~perm_found;
            if (( mask & def_perm_found ) > 0 ) {
                perm_found |= def_perm_found;
                perm_deny |= ( def_perm_deny & mask );

                result = obj.evalPermissions( a_req_perm, perm_found, perm_deny );
                if ( result != null ) {
                    console.log("result (prnt def perm):", result );
                    return result;
                }
            }

            // If there are still missing require permissions...
            // Determine which parents are candidates for further evaluation (have req bits not set in def permissions)
            children = [];

            // Set mask to required perm bits still not found
            mask = (~perm_found) & a_req_perm;
            for ( i in parents ) {
                parent = parents[i];
                if ( parent.def_grant == null || parent.def_deny == null || ( ~( parent.def_grant | parent.def_deny ) & mask )) {
                    children.push( parent );
                }
            }

            if ( children.length == 0 )
                break;
        }

        console.log("result (last): false" );

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


        
