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

    obj.PERM_NONE           = 0x000;
    obj.PERM_LIST           = 0x001;   // Find record by browsing
    obj.PERM_VIEW           = 0x002;   // Read public record fields (not collection items or raw data)
    obj.PERM_UPDATE         = 0x004;   // Update public record fields
    obj.PERM_ADMIN          = 0x008;   // Read, write admin fields, delete record
    obj.PERM_TAG            = 0x010;   // Add/remove tags on record
    obj.PERM_NOTE           = 0x020;   // Add, remove, edit annotations on record
    obj.PERM_READ           = 0x040;   // Read raw data or list collection items
    obj.PERM_WRITE          = 0x080;   // Write raw data or add/remove collection items
    obj.PERM_ALL            = 0x0FF;

    obj.XS_INIT             = 0;
    obj.XS_ACTIVE           = 1;
    obj.XS_INACTIVE         = 2;
    obj.XS_SUCCEEDED        = 3;
    obj.XS_FAILED           = 4;

    obj.XM_GET              = 0;
    obj.XM_PUT              = 1;

    obj.acl_schema = joi.object().keys({
        id: joi.string().required(),
        grant: joi.string().optional(),
        inh_grant: joi.string().optional(),
        deny: joi.string().optional(),
        inh_deny: joi.string().optional()
    });

    obj.ERR_INFO = [];
    obj.ERR_COUNT = 0;

    obj.ERR_AUTHN_FAILED          = obj.ERR_COUNT++; obj.ERR_INFO.push([ 400, "Authentication failed" ]);
    obj.ERR_PERM_DENIED           = obj.ERR_COUNT++; obj.ERR_INFO.push([ 400, "Permission denied" ]);
    obj.ERR_INVALID_ID            = obj.ERR_COUNT++; obj.ERR_INFO.push([ 400, "Invalid ID" ]);
    obj.ERR_INVALID_IDENT         = obj.ERR_COUNT++; obj.ERR_INFO.push([ 400, "Invalid client identity" ]);
    obj.ERR_INVALID_ALIAS         = obj.ERR_COUNT++; obj.ERR_INFO.push([ 400, "Invalid alias" ]);
    obj.ERR_INVALID_PARAM         = obj.ERR_COUNT++; obj.ERR_INFO.push([ 400, "Invalid parameter(s)" ]);
    obj.ERR_ITEM_ALREADY_LINKED   = obj.ERR_COUNT++; obj.ERR_INFO.push([ 400, "Item already in collection" ]);
    obj.ERR_CLIENT_NOT_FOUND      = obj.ERR_COUNT++; obj.ERR_INFO.push([ 400, "Client not found" ]);
    obj.ERR_UID_NOT_FOUND         = obj.ERR_COUNT++; obj.ERR_INFO.push([ 400, "UID not found" ]);
    obj.ERR_GROUP_NOT_FOUND       = obj.ERR_COUNT++; obj.ERR_INFO.push([ 400, "Group not found" ]);
    obj.ERR_OBJ_NOT_FOUND         = obj.ERR_COUNT++; obj.ERR_INFO.push([ 400, "Object not found" ]);
    obj.ERR_ALIAS_NOT_FOUND       = obj.ERR_COUNT++; obj.ERR_INFO.push([ 400, "Alias not found" ]);
    obj.ERR_USER_NOT_FOUND        = obj.ERR_COUNT++; obj.ERR_INFO.push([ 400, "User not found" ]);
    obj.ERR_DATA_NOT_FOUND        = obj.ERR_COUNT++; obj.ERR_INFO.push([ 400, "Data record not found" ]);
    obj.ERR_COLL_NOT_FOUND        = obj.ERR_COUNT++; obj.ERR_INFO.push([ 400, "Collection not found" ]);
    obj.ERR_KEYS_NOT_DEFINED      = obj.ERR_COUNT++; obj.ERR_INFO.push([ 400, "Keys not defined" ]);
    obj.ERR_TOKEN_NOT_DEFINED     = obj.ERR_COUNT++; obj.ERR_INFO.push([ 400, "Token not defined" ]);
    obj.ERR_CANNOT_DEL_ROOT       = obj.ERR_COUNT++; obj.ERR_INFO.push([ 400, "Cannot delete root collection" ]);
    obj.ERR_MISSING_REQ_OPTION    = obj.ERR_COUNT++; obj.ERR_INFO.push([ 400, "Missing one or more required options" ]);
    obj.ERR_INVALID_PERM          = obj.ERR_COUNT++; obj.ERR_INFO.push([ 400, "Invalid permission" ]);
    obj.ERR_INVALID_ACTION        = obj.ERR_COUNT++; obj.ERR_INFO.push([ 400, "Invalid gridftp action" ]);
    obj.ERR_XFR_NO_RAW_DATA       = obj.ERR_COUNT++; obj.ERR_INFO.push([ 400, "Record has no raw data to transfer" ]);
    obj.ERR_XFR_CONFLICT          = obj.ERR_COUNT++; obj.ERR_INFO.push([ 400, "Data transfer conflict" ]);

    obj.isInteger = function( x ) {
        return (typeof x === 'number') && (x % 1 === 0);
    };

    obj.handleException = function( e, res ) {
        console.log( "Service exception:", e );

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

    obj.isDomainAccount = function( a_client_id ) {
        if ( a_client_id.indexOf( "." ) != -1 )
            return true;
        else
            return false;
    };

    obj.isUUID = function( a_client_id ) {
        if ( a_client_id.length == 36 && a_client_id.charAt(8) == "-" )
            return true;
        else
            return false;
    };

    obj.getUserFromClientID = function( a_client_id ) {
        // Client ID can be an SDMS uname (xxxxx...), a UUID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx), or an account (domain.uname)
        // UUID are defined by length and format, accounts have a "." (and known domains), SDMS unames have no "." or "-" characters

        var params;

        if ( obj.isDomainAccount( a_client_id )) {
            // Account
            params = { 'id': 'accn/' + a_client_id };
        } else if ( obj.isUUID( a_client_id  )) {
            // UUID
            params = { 'id': 'uuid/' + a_client_id };
        } else {
            return obj.db._document({ _id: "u/" + a_client_id });
        }

        var result = obj.db._query( "for j in inbound @id ident return j", params, { cache: true } ).toArray();

        if ( result.length != 1 )
            throw obj.ERR_CLIENT_NOT_FOUND;

        return result[0];
    };

    obj.findUserFromUUIDs = function( a_uuids ) {
        var result = obj.db._query( "for i in ident filter i._to in @ids return distinct document(i._from)", { ids: a_uuids }).toArray();

        if ( result.length != 1 )
            throw obj.ERR_USER_NOT_FOUND;

        return result[0];
    };

    obj.uidFromPubKey = function( a_pub_key ) {
        //var result = obj.db._query( "for i in accn filter i.pub_key == @key let u = (for v in inbound i._id ident return v._key) return u[0]", { key: a_pub_key }).toArray();
        var result = obj.db._query( "for i in u filter i.pub_key == @key return i._key", { key: a_pub_key }).toArray();

        if ( result.length != 1 )
            throw obj.ERR_USER_NOT_FOUND;

        return result[0];
    };

    obj.findUserFromPubKey = function( a_pub_key ) {
        var result = obj.db._query( "for i in accn filter i.pub_key == @key let u = (for v in inbound i._id ident return v) return u[0]", { key: a_pub_key }).toArray();

        console.log( "key res:", result );
        if ( result.length != 1 )
            throw obj.ERR_USER_NOT_FOUND;

        return result[0];
    };

    obj.getObject = function( a_obj_id, a_client ) {
        var id = obj.resolveID( a_obj_id, a_client );

        try {
            return obj.db._document( id );
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


    obj.hasLocalPermission = function( a_client, a_object, a_req_perm ) {
        //console.log("check perm:", a_req_perm, "client:", a_client._id, "object:", a_object._id );

        var perm_found  = 0;
        var perm_deny   = 0;
        var acl;
        var result;
        var mask;

        // Evaluate permissions set directly on object

        var acls = obj.db._query( "for v, e in 1..1 outbound @object acl filter v._id == @client return e", { object: a_object._id, client: a_client._id } ).toArray();
        for ( var i in acls ) {
            acl = acls[i];
            //console.log("user_perm:",acl);
            perm_found |= ( acl.grant | acl.deny );
            perm_deny |= acl.deny;
        }
        //console.log("perm_req:", a_req_perm, "perm_found:", perm_found, "perm_deny:", perm_deny );
        result = obj.evalPermissions( a_req_perm, perm_found, perm_deny );
        //console.log("eval res:", result );
        if ( result != null ) {
            //console.log("result (usr acl):", result );
            return result;
        }

        // Evaluate group permissions on object

        acls = obj.db._query( "for v, e, p in 2..2 outbound @object acl, outbound member filter p.vertices[2]._id == @client return p.edges[0]", { object: a_object._id, client: a_client._id } ).toArray();

        //console.log("eval group", acls );

        mask = ~perm_found;
        for ( i in acls ) {
            acl = acls[i];
            //console.log("group_perm:",acl);
            if ( mask & ( acl.grant | acl.deny ) > 0 ) {
                perm_found |= ( acl.grant | acl.deny );
                perm_deny |= ( acl.deny & mask );
            }
        }

        //console.log("perm_req:", a_req_perm, "perm_found:", perm_found, "perm_deny:", perm_deny );

        result = obj.evalPermissions( a_req_perm, perm_found, perm_deny );

        //console.log("eval res:", result );
        if ( result != null ) {
            //console.log("result (grp acl):", result );
            return result;
        }

        // Evaluate default permissions on object
        //console.log("check default, perm_found:", perm_found );

        mask = ~perm_found;
        if ( mask & ( a_object.grant | a_object.deny ) > 0 ) {
            //console.log("default perm has bits", a_object.grant, a_object.deny );
            perm_found |= ( a_object.grant | a_object.deny );
            perm_deny |= ( a_object.deny & mask );

            //console.log("def perm_founf:", perm_found, "perm_deny:", perm_deny );
            result = obj.evalPermissions( a_req_perm, perm_found, perm_deny );
            if ( result != null ) {
                //console.log("result (def perm):", result );
                return result;
            }
        }

        return false;
    };

    // Only works for a single permission - not a mask
    obj.hasLocalDeny = function( a_client, a_object, a_req_perm ) {
        //console.log("check perm:", a_req_perm, "client:", a_client._id, "object:", a_object._id );

        var acl;

        // Evaluate permissions set directly on object
        var acls = obj.db._query( "for v, e in 1..1 outbound @object acl filter v._id == @client return e", { object: a_object._id, client: a_client._id } ).toArray();
        for ( var i in acls ) {
            acl = acls[i];
            if (( acl.deny & a_req_perm ) == a_req_perm )
                return true;
            else if (( acl.grant & a_req_perm ) == a_req_perm )
                return false;
        }

        var grant = 0;

        // Evaluate group permissions on object
        acls = obj.db._query( "for v, e, p in 2..2 outbound @object acl, outbound member filter p.vertices[2]._id == @client return p.edges[0]", { object: a_object._id, client: a_client._id } ).toArray();
        for ( i in acls ) {
            acl = acls[i];
            grant |= acl.grant;
            if (( acl.deny & a_req_perm ) == a_req_perm )
                return true;
        }

        if (( grant & a_req_perm ) == a_req_perm )
            return false;

        if (( a_object.deny & a_req_perm ) == a_req_perm )
            return true;

        return false;
    };

    /* Test if client has requested permission(s) for specified object. Note: this call does NOT check for
     * ownership or admin privelege - the hasAdminPermObject function performs these checks and should be
     * called first if needed. This function is typically used when filtering a list of objects that are
     * known not to be owned by the client (and that the client is not an admin). In this case, those checks
     * would add performance cost for no benefit.
     */
    obj.hasPermission = function( a_client, a_object, a_req_perm ) {
        //console.log("check perm:", a_req_perm, "client:", a_client._id, "object:", a_object._id );

        var perm_found  = 0;
        var perm_deny   = 0;
        var acl;
        var result;
        var mask;

        // Evaluate permissions set directly on object

        var acls = obj.db._query( "for v, e in 1..1 outbound @object acl filter v._id == @client return e", { object: a_object._id, client: a_client._id } ).toArray();
        for ( var i in acls ) {
            acl = acls[i];
            //console.log("user_perm:",acl);
            perm_found |= ( acl.grant | acl.deny );
            perm_deny |= acl.deny;
        }
        //console.log("perm_req:", a_req_perm, "perm_found:", perm_found, "perm_deny:", perm_deny );
        result = obj.evalPermissions( a_req_perm, perm_found, perm_deny );
        //console.log("eval res:", result );
        if ( result != null ) {
            //console.log("result (usr acl):", result );
            return result;
        }

        // Evaluate group permissions on object

        acls = obj.db._query( "for v, e, p in 2..2 outbound @object acl, outbound member filter p.vertices[2]._id == @client return p.edges[0]", { object: a_object._id, client: a_client._id } ).toArray();

        //console.log("eval group", acls );

        mask = ~perm_found;
        for ( i in acls ) {
            acl = acls[i];
            //console.log("group_perm:",acl);
            if ( mask & ( acl.grant | acl.deny ) > 0 ) {
                perm_found |= ( acl.grant | acl.deny );
                perm_deny |= ( acl.deny & mask );
            }
        }

        //console.log("perm_req:", a_req_perm, "perm_found:", perm_found, "perm_deny:", perm_deny );

        result = obj.evalPermissions( a_req_perm, perm_found, perm_deny );

        //console.log("eval res:", result );
        if ( result != null ) {
            //console.log("result (grp acl):", result );
            return result;
        }

        // Evaluate default permissions on object
        //console.log("check default, perm_found:", perm_found );

        mask = ~perm_found;
        if ( mask & ( a_object.grant | a_object.deny ) > 0 ) {
            //console.log("default perm has bits", a_object.grant, a_object.deny );
            perm_found |= ( a_object.grant | a_object.deny );
            perm_deny |= ( a_object.deny & mask );

            //console.log("def perm_founf:", perm_found, "perm_deny:", perm_deny );
            result = obj.evalPermissions( a_req_perm, perm_found, perm_deny );
            if ( result != null ) {
                //console.log("result (def perm):", result );
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

            parents = obj.db._query( "for i in @children for v, e, p in 2..2 inbound i item, outbound owner filter is_same_collection('c',p.vertices[1]) and v._id == @owner return p.vertices[1]", { children : children, owner: owner_id }).toArray();
            if ( parents.length == 0 )
                break;

            // Gather INHERITED user, group, and default permissions collectively over all parents

            usr_perm_found = 0; usr_perm_deny = 0;
            grp_perm_found = 0; grp_perm_deny = 0;
            def_perm_found = 0; def_perm_deny = 0;

            for ( i in parents ) {
                parent = parents[i];

                // User ACL first
                acls = obj.db._query( "for v, e in 1..1 outbound @object acl filter v._id == @client return e", { object: parent._id, client: a_client._id } ).toArray();
                for ( i in acls ) {
                    acl = acls[i];
                    usr_perm_found |= ( acl.inh_grant | acl.inh_deny );
                    usr_perm_deny |= acl.inh_deny;
                }

                // Group ACL next
                acls = obj.db._query( "for v, e, p in 2..2 outbound @object acl, outbound member filter is_same_collection('g',p.vertices[1]) and p.vertices[2]._id == @client return p.edges[0]", { object: parent._id, client: a_client._id } ).toArray();
                for ( i in acls ) {
                    acl = acls[i];
                    grp_perm_found |= ( acl.inh_grant | acl.inh_deny );
                    grp_perm_deny |= acl.inh_deny;
                }

                if ( parent.inh_grant ) {
                    def_perm_found |= parent.inh_grant;
                }

                if ( parent.inh_deny ) {
                    def_perm_found |= parent.inh_deny;
                    def_perm_deny |= parent.inh_deny;
                }
            }

            // Eval collective user permissions found
            mask = ~perm_found;
            if (( mask & usr_perm_found ) > 0 ) {
                perm_found |= usr_perm_found;
                perm_deny |= ( usr_perm_deny & mask );

                result = obj.evalPermissions( a_req_perm, perm_found, perm_deny );
                if ( result != null ) {
                    //console.log("result (prnt usr acl):", result );
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
                    //console.log("result (prnt grp acl):", result );
                    return result;
                }
            }

            mask = ~perm_found;
            if (( mask & def_perm_found ) > 0 ) {
                perm_found |= def_perm_found;
                perm_deny |= ( def_perm_deny & mask );

                result = obj.evalPermissions( a_req_perm, perm_found, perm_deny );
                if ( result != null ) {
                    //console.log("result (prnt def perm):", result );
                    return result;
                }
            }

            // If there are still missing require permissions...
            // Determine which parents are candidates for further evaluation (have req bits not set in inherited permissions)
            children = parents;
        }

        //console.log("result (last): false" );

        return false;
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
    obj.hasPermission_old = function( a_client, a_object, a_req_perm ) {
        //console.log("check perm:", a_req_perm, "client:", a_client._id, "object:", a_object._id );

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
            perm_found |= ( acl.grant | acl.deny );
            perm_deny |= acl.deny;
        }
        //console.log("perm_req:", a_req_perm, "perm_found:", perm_found, "perm_deny:", perm_deny );
        result = obj.evalPermissions( a_req_perm, perm_found, perm_deny );
        //console.log("eval res:", result );
        if ( result != null ) {
            //console.log("result (usr acl):", result );
            return result;
        }

        // Evaluate group permissions on object

        acls = obj.db._query( "for v, e, p in 2..2 outbound @object acl, outbound member filter p.vertices[2]._id == @client return p.edges[0]", { object: a_object._id, client: a_client._id } ).toArray();

        //console.log("eval group", acls );

        mask = ~perm_found;
        for ( i in acls ) {
            acl = acls[i];
            //console.log("group_perm:",acl);
            if ( mask & ( acl.grant | acl.deny ) > 0 ) {
                perm_found |= ( acl.grant | acl.deny );
                perm_deny |= ( acl.deny & mask );
            }
        }

        //console.log("perm_req:", a_req_perm, "perm_found:", perm_found, "perm_deny:", perm_deny );

        result = obj.evalPermissions( a_req_perm, perm_found, perm_deny );

        //console.log("eval res:", result );
        if ( result != null ) {
            //console.log("result (grp acl):", result );
            return result;
        }

        // Evaluate default permissions on object
        //console.log("check default, perm_found:", perm_found );

        mask = ~perm_found;
        if ( mask & ( a_object.grant | a_object.deny ) > 0 ) {
            //console.log("default perm has bits", a_object.grant, a_object.deny );
            perm_found |= ( a_object.grant | a_object.deny );
            perm_deny |= ( a_object.deny & mask );

            //console.log("def perm_founf:", perm_found, "perm_deny:", perm_deny );
            result = obj.evalPermissions( a_req_perm, perm_found, perm_deny );
            if ( result != null ) {
                //console.log("result (def perm):", result );
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

            parents = obj.db._query( "for i in @children for v, e, p in 2..2 inbound i item, outbound owner filter is_same_collection('c',p.vertices[1]) and v._id == @owner return p.vertices[1]", { children : children, owner: owner_id }).toArray();
            if ( parents.length == 0 )
                break;

            // Gather INHERITED user, group, and default permissions collectively over all parents

            usr_perm_found = 0; usr_perm_deny = 0;
            grp_perm_found = 0; grp_perm_deny = 0;
            def_perm_found = 0; def_perm_deny = 0;

            for ( i in parents ) {
                parent = parents[i];

                // User ACL first
                acls = obj.db._query( "for v, e in 1..1 outbound @object acl filter v._id == @client return e", { object: parent._id, client: a_client._id } ).toArray();
                for ( i in acls ) {
                    acl = acls[i];
                    usr_perm_found |= ( acl.inh_grant | acl.inh_deny );
                    usr_perm_deny |= acl.inh_deny;
                }

                // Group ACL next
                acls = obj.db._query( "for v, e, p in 2..2 outbound @object acl, outbound member filter is_same_collection('g',p.vertices[1]) and p.vertices[2]._id == @client return p.edges[0]", { object: parent._id, client: a_client._id } ).toArray();
                for ( i in acls ) {
                    acl = acls[i];
                    grp_perm_found |= ( acl.inh_grant | acl.inh_deny );
                    grp_perm_deny |= acl.inh_deny;
                }

                if ( parent.inh_grant ) {
                    def_perm_found |= parent.inh_grant;
                }

                if ( parent.inh_deny ) {
                    def_perm_found |= parent.inh_deny;
                    def_perm_deny |= parent.inh_deny;
                }
            }

            // Eval collective user permissions found
            mask = ~perm_found;
            if (( mask & usr_perm_found ) > 0 ) {
                perm_found |= usr_perm_found;
                perm_deny |= ( usr_perm_deny & mask );

                result = obj.evalPermissions( a_req_perm, perm_found, perm_deny );
                if ( result != null ) {
                    //console.log("result (prnt usr acl):", result );
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
                    //console.log("result (prnt grp acl):", result );
                    return result;
                }
            }

            mask = ~perm_found;
            if (( mask & def_perm_found ) > 0 ) {
                perm_found |= def_perm_found;
                perm_deny |= ( def_perm_deny & mask );

                result = obj.evalPermissions( a_req_perm, perm_found, perm_deny );
                if ( result != null ) {
                    //console.log("result (prnt def perm):", result );
                    return result;
                }
            }

            // If there are still missing require permissions...
            // Determine which parents are candidates for further evaluation (have req bits not set in inherited permissions)
            children = parents;
        }

        //console.log("result (last): false" );

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


        
