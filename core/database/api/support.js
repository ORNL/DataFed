'use strict';

const   joi = require('joi');


module.exports = ( function() {
    var obj = {};

    obj.db = require('@arangodb').db;
    obj.graph = require('@arangodb/general-graph')._graph('sdmsg');

    obj.PERM_RD_REC         = 0x0001; // Read record info (description, keywords, details)
    obj.PERM_RD_META        = 0x0002; // Read structured metadata
    obj.PERM_RD_DATA        = 0x0004; // Read raw data
    obj.PERM_WR_REC         = 0x0008; // Write record info (description, keywords, details)
    obj.PERM_WR_META        = 0x0010; // Write structured metadata
    obj.PERM_WR_DATA        = 0x0020; // Write raw data
    obj.PERM_LIST           = 0x0040; // Find record and view ID, alias, title, and owner
    obj.PERM_LINK           = 0x0080; // Link/unlink child records (collections only)
    obj.PERM_CREATE         = 0x0100; // Create new child records (collections only)
    obj.PERM_DELETE         = 0x0200; // Delete record
    obj.PERM_SHARE          = 0x0400; // View/set ACLs
    obj.PERM_LOCK           = 0x0800; // Lock record
    obj.PERM_LABEL          = 0x1000; // Label record
    obj.PERM_TAG            = 0x2000; // Tag record
    obj.PERM_ANNOTATE       = 0x4000; // Annotate record

    obj.PERM_NONE           = 0x0000;
    obj.PERM_RD_ALL         = 0x0007; // Read all
    obj.PERM_WR_ALL         = 0x0038; // Write all
    obj.PERM_ALL            = 0x7FFF;
    obj.PERM_MEMBER         = 0x0047; // Project record perms
    obj.PERM_MANAGER        = 0x0407; // Project record perms
    obj.PERM_PUBLIC         = 0x0047;

    obj.MAX_COLL_ITEMS      = 1000;
    obj.MAX_MD_SIZE         = 102400;

    obj.TT_DATA_GET         = 0;
    obj.TT_DATA_PUT         = 1;
    obj.TT_DATA_DEL         = 2;
    obj.TT_REC_ALLOC_CHG    = 3;
    obj.TT_REC_OWNER_CHG    = 4;
    obj.TT_REC_DEL          = 5;
    obj.TT_ALLOC_CREATE     = 6;
    obj.TT_ALLOC_DEL        = 7;
    obj.TT_USER_DEL         = 8;
    obj.TT_PROJ_DEL         = 9;
    obj.TT_DATA_EXPORT      = 10;

    obj.TS_BLOCKED          = 0;
    obj.TS_READY            = 1;
    obj.TS_RUNNING          = 2;
    obj.TS_SUCCEEDED        = 3;
    obj.TS_FAILED           = 4;
    obj.TS_COUNT            = 5;

    obj.TC_STOP                 = 0;
    obj.TC_RAW_DATA_TRANSFER    = 1;
    obj.TC_RAW_DATA_DELETE      = 2;
    obj.TC_RAW_DATA_UPDATE_SIZE = 3;
    obj.TC_ALLOC_CREATE         = 4;
    obj.TC_ALLOC_DELETE         = 5;

    obj.XS_INIT             = 0;
    obj.XS_ACTIVE           = 1;
    obj.XS_INACTIVE         = 2;
    obj.XS_SUCCEEDED        = 3;
    obj.XS_FAILED           = 4;

    obj.XM_GET              = 0;
    obj.XM_PUT              = 1;
    obj.XM_COPY             = 2;

    obj.DEP_IS_DERIVED_FROM     = 0;
    obj.DEP_IS_COMPONENT_OF     = 1;
    obj.DEP_IS_NEW_VERSION_OF   = 2;

    obj.DEP_IN              = 0;
    obj.DEP_OUT             = 1;

    obj.SORT_ID             = 0;
    obj.SORT_TITLE          = 1;
    obj.SORT_TIME_CREATE    = 2;
    obj.SORT_TIME_UPDATE    = 3;

    obj.PROJ_NO_ROLE        = 0;    // No permissions
    obj.PROJ_MEMBER         = 1;    // Data/collection Permissions derived from "members" group and other ACLs
    obj.PROJ_MANAGER        = 2;    // Adds permission to manage groups and grants ADMIN permission on all data/collections
    obj.PROJ_ADMIN          = 3;    // Grants all permissions (edit and delete project)

    obj.NOTE_QUESTION       = 0;
    obj.NOTE_INFO           = 1;
    obj.NOTE_WARN           = 2;
    obj.NOTE_ERROR          = 3;

    obj.NOTE_CLOSED         = 0;
    obj.NOTE_OPEN           = 1;
    obj.NOTE_ACTIVE         = 2;

    obj.SS_MY_DATA          = 0x01;
    obj.SS_MY_PROJ          = 0x02;
    obj.SS_TEAM_PROJ        = 0x04;
    obj.SS_USER_SHARE       = 0x08;
    obj.SS_PROJ_SHARE       = 0x10;
    obj.SS_PUBLIC           = 0x20;

    obj.acl_schema = joi.object().keys({
        id: joi.string().required(),
        grant: joi.number().optional(),
        inhgrant: joi.number().optional()
    });

    obj.ERR_INFO = [];
    obj.ERR_COUNT = 0;

    obj.ERR_AUTHN_FAILED          = obj.ERR_COUNT++; obj.ERR_INFO.push([ 400, "Authentication Failed" ]);
    obj.ERR_PERM_DENIED           = obj.ERR_COUNT++; obj.ERR_INFO.push([ 400, "Permission Denied" ]);
    obj.ERR_INVALID_PARAM         = obj.ERR_COUNT++; obj.ERR_INFO.push([ 400, "Invalid Parameter" ]);
    obj.ERR_INPUT_TOO_LONG        = obj.ERR_COUNT++; obj.ERR_INFO.push([ 400, "Input value too long" ]);
    obj.ERR_INVALID_CHAR          = obj.ERR_COUNT++; obj.ERR_INFO.push([ 400, "Invalid character" ]);
    obj.ERR_NOT_FOUND             = obj.ERR_COUNT++; obj.ERR_INFO.push([ 400, "Record Not Found" ]);
    obj.ERR_IN_USE                = obj.ERR_COUNT++; obj.ERR_INFO.push([ 400, "Value In Use" ]);
    obj.ERR_LINK                  = obj.ERR_COUNT++; obj.ERR_INFO.push([ 400, "Collection Link Error" ]);
    obj.ERR_UNLINK                = obj.ERR_COUNT++; obj.ERR_INFO.push([ 400, "Collection Unlink Error" ]);
    obj.ERR_MISSING_REQ_PARAM     = obj.ERR_COUNT++; obj.ERR_INFO.push([ 400, "Missing one or more required parameters" ]);
    obj.ERR_NO_RAW_DATA           = obj.ERR_COUNT++; obj.ERR_INFO.push([ 400, "Record has no raw data" ]);
    obj.ERR_XFR_CONFLICT          = obj.ERR_COUNT++; obj.ERR_INFO.push([ 400, "Data transfer conflict" ]);
    obj.ERR_INTERNAL_FAULT        = obj.ERR_COUNT++; obj.ERR_INFO.push([ 400, "Internal server fault" ]);
    obj.ERR_NO_ALLOCATION         = obj.ERR_COUNT++; obj.ERR_INFO.push([ 400, "No storage allocation available" ]);
    obj.ERR_ALLOCATION_EXCEEDED   = obj.ERR_COUNT++; obj.ERR_INFO.push([ 400, "Storage allocation exceeded" ]);


    obj.CHARSET_ID      = 0;
    obj.CHARSET_ALIAS   = 1;
    obj.CHARSET_TOPIC   = 2;
    obj.CHARSET_URL     = 3;
    obj.CHARSET_DOI     = 4;

    obj.extra_chars = ["_-.","_-.","_-.","-._~:/?#[]@!$&'()*+,;=","/_-:.@()+,=;$!*'%"];

    obj.field_reqs = {
        title: { required: true, update: true, max_len: 80, label: 'title' },
        alias: { required: false, update: true, max_len: 40, lower: true, charset: obj.CHARSET_ALIAS, label: 'alias' },
        desc: { required: false, update: true, max_len: 2000, label: 'description' },
        summary: { required: false, update: true, max_len: 500, in_field: "desc", out_field: "desc", label: 'description' },
        comment: { required: true, update: true, max_len: 2000, in_field: "comment", out_field: "comment", label: 'comment' },
        keyw: { required: false, update: true, max_len: 200, lower: true, label: 'keywords' },
        topic: { required: false, update: true, max_len: 30, lower: true, charset: obj.CHARSET_TOPIC, label: 'topic' },
        domain: { required: false, update: true, max_len: 40, lower: true, charset: obj.CHARSET_ID, label: 'domain' },
        source: { required: false, update: true, max_len: 300, lower: false, label: 'source' },
        ext: { required: false, update: true, max_len: 40, lower: false, label: 'extension' },
        gid: { required: true, update: false, max_len: 40, lower: true, charset: obj.CHARSET_ID, label: 'group ID' },
        id: { required: true, update: false, max_len: 40, lower: true, charset: obj.CHARSET_ID, out_field: "_key", label: 'ID' },
        doi: { required: false, update: true, max_len: 40, lower: true, charset: obj.CHARSET_DOI, label: 'doi' },
        data_url: { required: false, update: true, max_len: 200, lower: false, charset: obj.CHARSET_URL, label: 'data URL' },
    };

    obj.DEF_MAX_COLL    = 50;
    obj.DEF_MAX_PROJ    = 10;
    obj.DEF_MAX_SAV_QRY = 20;

    //obj.GLOB_MAX_XFR_SIZE = 10000000000; // ~10GB
    obj.GLOB_MAX_XFR_SIZE = 2000000;

    obj.procInputParam = function( a_in, a_field, a_update, a_out ){
        var val, spec = obj.field_reqs[a_field];

        //console.log("procInput",a_field,",update:",a_update);

        if ( !spec ){
            throw [obj.ERR_INTERNAL_FAULT,"Input specification for '" + a_field + "' not found. Please contact system administrator."];
        }

        if ( spec.in_field )
            val = a_in[spec.in_field];
        else
            val = a_in[a_field];

        //console.log("init val",val);

        // Ignore param updates when not allowed to be updated
        if ( a_update && !spec.update ){
            //console.log("stop b/c no update allowed");
            return;
        }

        if ( val && val.length )
            val = val.trim();

        if ( val && val.length ){
            // Check length if specified
            if ( spec.max_len && ( val.length > spec.max_len ))
                throw [obj.ERR_INPUT_TOO_LONG,"'" + spec.label + "' field is too long. Maximum length is " + spec.max_len + "." ];

            if ( spec.lower )
                val = val.toLowerCase();

            if ( spec.charset != undefined ){
                var extra = obj.extra_chars[spec.charset];
                var code, i, len;

                for (i = 0, len = val.length; i < len; i++) {
                    code = val.charCodeAt(i);
                    if (!(code > 47 && code < 58) && // numeric (0-9)
                        !(code > 64 && code < 91) && // upper alpha (A-Z)
                        !(code > 96 && code < 123)) { // lower alpha (a-z)
                        if ( extra.indexOf( val.charAt( i )) == -1 )
                            throw [obj.ERR_INVALID_CHAR,"Invalid character(s) in '" + spec.label + "' field."];
                    }
                }
            }
            //console.log("save new val:",val);

            if ( spec.out_field )
                a_out[spec.out_field] = val;
            else
                a_out[a_field] = val;
        }else{
            // Required params must have a value
            if ( a_update ){
                if ( val === "" ){
                    if ( spec.required )
                        throw [obj.ERR_MISSING_REQ_PARAM,"Required field '" + spec.label + "' cannot be deleted."];

                    if ( spec.out_field )
                        a_out[spec.out_field] = null;
                    else
                        a_out[a_field] = null;
                }
            }else if ( spec.required )
                throw [obj.ERR_MISSING_REQ_PARAM,"Missing required field '" + spec.label + "'."];
            }
    };

    obj.isInteger = function( x ) {
        return (typeof x === 'number') && (x % 1 === 0);
    };

    /*
    obj.isAlphaNumeric = function(str) {
        var code, i, len;

        for (i = 0, len = str.length; i < len; i++) {
            code = str.charCodeAt(i);
            if (!(code > 47 && code < 58) && // numeric (0-9)
                !(code > 64 && code < 91) && // upper alpha (A-Z)
                !(code > 96 && code < 123)) { // lower alpha (a-z)
            return false;
            }
        }
        return true;
    };*/

    obj.handleException = function( e, res ) {
        console.log( "Service exception:", e );

        if ( obj.isInteger( e ) && e >= 0 && e < obj.ERR_COUNT ) {
            res.throw( obj.ERR_INFO[e][0], obj.ERR_INFO[e][1] );
        } else if ( Array.isArray( e )) {
            res.throw( obj.ERR_INFO[e[0]][0], e[1] );
        //} else if ( e.hasOwnProperty( "errorNum" )) {
        } else if ( Object.prototype.hasOwnProperty.call( e, "errorNum" )){
            switch ( e.errorNum ) {
                case 1202:
                    res.throw( 404, "Record does not exist" );
                    break;
                case 1205:
                case 1213:
                    res.throw( 404, "Invalid ID" );
                    break;
                case 1210:
                    res.throw( 409, "Conflicting ID or alias" );
                    break;
                case 1200:
                    res.throw( 500, "Conflict: " + e );
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
        // TODO This needs to have a test that doesn't conflict with email-style uids

        /*if ( a_client_id.indexOf( "." ) != -1 )
            return true;
        else*/
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

        if ( a_client_id.startsWith("u/")){
            if ( !obj.db.u.exists( a_client_id ))
                throw [ obj.ERR_INVALID_PARAM, "No such user '" + a_client_id + "'" ];

            return obj.db._document({ _id: a_client_id });
        } else if ( obj.isDomainAccount( a_client_id )) {
            // Account
            params = { 'id': 'accn/' + a_client_id };
        } else if ( obj.isUUID( a_client_id  )) {
            // UUID
            params = { 'id': 'uuid/' + a_client_id };
        } else {
            if ( !obj.db.u.exists( "u/" + a_client_id ))
                throw [ obj.ERR_INVALID_PARAM, "No such user 'u/" + a_client_id + "'" ];
            return obj.db._document({ _id: "u/" + a_client_id });
        }

        var result = obj.db._query( "for j in inbound @id ident return j", params, { cache: true } ).toArray();

        if ( result.length != 1 ){
            //console.log("Client", a_client_id, "not found, params:", params );
            throw [obj.ERR_NOT_FOUND,"Account/Identity '"+a_client_id+"' not found"];
        }

        return result[0];
    };

    obj.findUserFromUUIDs = function( a_uuids ) {
        var result = obj.db._query( "for i in ident filter i._to in @ids return distinct document(i._from)", { ids: a_uuids }).toArray();

        if ( result.length != 1 )
            throw [obj.ERR_NOT_FOUND,"No user matching Globus IDs found"];

        return result[0];
    };

    obj.uidFromPubKey = function( a_pub_key ) {
        //var result = obj.db._query( "for i in accn filter i.pub_key == @key let u = (for v in inbound i._id ident return v._key) return u[0]", { key: a_pub_key }).toArray();
        var result = obj.db._query( "for i in u filter i.pub_key == @key return i._id", { key: a_pub_key }).toArray();

        if ( result.length != 1 )
            throw [obj.ERR_NOT_FOUND,"No user matching authentication key found"];

        return result[0];
    };

    obj.findUserFromPubKey = function( a_pub_key ) {
        var result = obj.db._query( "for i in accn filter i.pub_key == @key let u = (for v in inbound i._id ident return v) return u[0]", { key: a_pub_key }).toArray();

        //console.log( "key res:", result );
        if ( result.length != 1 )
            throw [obj.ERR_NOT_FOUND,"No user matching authentication key found"];

        return result[0];
    };

    obj.getAccessToken = function( a_user_id ) {
        var user = obj.db.u.document( a_user_id );
        var exp_in = user.expiration - Math.floor(Date.now()/1000);
        var result = {
            acc_tok: user.access,
            ref_tok: user.refresh,
            acc_tok_exp_in: (exp_in > 0 ? exp_in : 0)
        };

        return result;
    };

    obj.getProjectRole = function( a_client_id, a_proj_id ){
        if ( obj.db.owner.firstExample({ _from: a_proj_id, _to: a_client_id }))
            return obj.PROJ_ADMIN;

        if ( obj.db.admin.firstExample({ _from: a_proj_id, _to: a_client_id }))
            return obj.PROJ_MANAGER;

        var grp = obj.db.g.firstExample({ uid: a_proj_id, gid: "members" });
        if ( !grp )
            return obj.PROJ_NO_ROLE;

        if ( obj.db.member.firstExample({ _from: grp._id, _to: a_client_id }))
            return obj.PROJ_MEMBER;
        else
            return obj.PROJ_NO_ROLE;
    };

    obj.sortAllocations = function( allocs ){
        allocs.sort(function(a,b){
            if ( a.is_def )
                return -1;
            else if ( b.is_def )
                return 1;
            else
                return a._to < b._to?-1:1;
        });
    };

    obj.assignRepo = function( a_user_id ){
        var alloc, allocs = obj.db.alloc.byExample({ _from: a_user_id }).toArray();

        obj.sortAllocations( allocs );

        for ( var i in allocs ){
            alloc = allocs[i];

            if ( alloc.data_size < alloc.data_limit && alloc.rec_count < alloc.rec_limit ){
                return alloc;
            }
        }

        return null;
    };

    obj.verifyRepo = function( a_user_id, a_repo_id ){
        var alloc = obj.db.alloc.firstExample({ _from: a_user_id, _to: a_repo_id });
        if ( !alloc )
            throw [obj.ERR_NO_ALLOCATION,"No allocation on repo " + a_repo_id];

        if ( alloc.data_size >= alloc.data_limit )
            throw [obj.ERR_ALLOCATION_EXCEEDED,"Allocation data size exceeded (max: "+alloc.data_limit+")"];

        if ( alloc.rec_count >= alloc.rec_limit )
            throw [obj.ERR_ALLOCATION_EXCEEDED,"Allocation record count exceeded (max: "+alloc.rec_limit+")"];

        return alloc;
    };

    obj.getRootID = function( owner_id ){
        return "c/"+owner_id[0]+"_"+owner_id.substr(2)+"_root";
    };

    obj.computeDataPath = function( a_loc, a_export ){
        var repo = obj.db._document( a_loc._to );
        var repo_path = a_export?repo.export_path:repo.path;

        if ( a_loc.uid.charAt(0) == 'u' ){
            return repo_path + "user" + a_loc.uid.substr(1) + a_loc._from.substr(1);
        }else{
            return repo_path + "project" + a_loc.uid.substr(1) + a_loc._from.substr(1);
        }
    };

    obj.computeDataPathPrefix = function( a_repo_id, a_owner_id ){
        var repo = obj.db._document( a_repo_id );

        if ( a_owner_id.charAt(0) == 'u' ){
            return repo.path + "user" + a_owner_id.substr(1) + "/";
        }else{
            return repo.path + "project" + a_owner_id.substr(1) + "/";
        }
    };

    obj.getObject = function( a_obj_id, a_client ) {
        var id = obj.resolveID( a_obj_id, a_client );

        if ( !obj.db._exists( id ))
            throw [ obj.ERR_INVALID_PARAM, "Record '" + id + "' does not exist." ];

        var doc = obj.db._document( id );

        return doc;
    };

    obj.getDataCollectionLinkCount = function( id ){
        return obj.db._query( "for v in 1..1 inbound @id item return v._id", { id: id }).count();
    };

    obj.hasAdminPermUser = function( a_client, a_user_id ) {
        //if ( a_client._id != a_user_id && !a_client.is_admin && !obj.db.owner.firstExample({ _from: a_user_id, _to: a_client._id }) && !obj.db.admin.firstExample({ _from: a_user_id, _to: a_client._id })){ 
        if ( a_client._id != a_user_id && !a_client.is_admin ){ 
            return false;
        } else {
            return true;
        }
    };

    obj.hasAdminPermProj = function( a_client, a_proj_id ) {
        if ( !a_client.is_admin && !obj.db.owner.firstExample({ _from: a_proj_id, _to: a_client._id }))  { 
            return false;
        } else {
            return true;
        }
    };

    obj.hasManagerPermProj = function( a_client, a_proj_id ) {
        if ( !a_client.is_admin && !obj.db.owner.firstExample({ _from: a_proj_id, _to: a_client._id }) && !obj.db.admin.firstExample({ _from: a_proj_id, _to: a_client._id }))  { 
            return false;
        } else {
            return true;
        }
    };

    obj.hasAdminPermObjectLoaded = function( a_client, a_object ) {
        // TODO Should collection creator have admin rights?
        if ( a_object.owner == a_client._id || a_object.creator == a_client._id || a_client.is_admin )
            return true;

        if ( a_object.owner.charAt(0) == 'p' ){
            if ( obj.db.owner.firstExample({ _from: a_object.owner, _to: a_client._id }))
                return true;

            if ( obj.db.admin.firstExample({ _from: a_object.owner, _to: a_client._id }))
                return true;
        }

        return false;
    };

    obj.hasAdminPermObject = function( a_client, a_object_id ) {
        if ( a_client.is_admin )
            return true;

        var owner_id = obj.db.owner.firstExample({ _from: a_object_id })._to;
        if ( owner_id == a_client._id )
            return true;

        if ( owner_id[0] == "p" ){
            // Object owned by a project
            if ( obj.db.admin.firstExample({ _from: owner_id, _to: a_client._id }))
                return true;

            if ( obj.db.owner.firstExample({ _from: owner_id, _to: a_client._id }))
                return true;
        }

        if ( a_object_id[0] == 'd' ){
            var data = obj.db._query("for i in d filter i._id == @id return i.creator",{id:a_object_id});
            if ( !data.hasNext() ){
                throw [obj.ERR_NOT_FOUND,"Data record " + a_object_id + " not found." ];
            }
            data = data.next();
            if ( a_client._id == data )
                return true;
        }
        return false;
    };

    obj.hasAdminPermRepo = function( a_client, a_repo_id ) {
        if ( !a_client.is_admin && !obj.db.admin.firstExample({ _from: a_repo_id, _to: a_client._id }))  { 
            return false;
        } else {
            return true;
        }
    };

    obj.ensureAdminPermUser = function( a_client, a_user_id ) {
        if ( !obj.hasAdminPermUser( a_client, a_user_id ))
            throw obj.ERR_PERM_DENIED;
    };

    obj.ensureAdminPermProj = function( a_client, a_user_id ) {
        if ( !obj.hasAdminPermProj( a_client, a_user_id ))
            throw obj.ERR_PERM_DENIED;
    };

    obj.ensureManagerPermProj = function( a_client, a_user_id ) {
        if ( !obj.hasManagerPermProj( a_client, a_user_id ))
            throw obj.ERR_PERM_DENIED;
    };

    obj.ensureAdminPermObject = function( a_client, a_object_id ) {
        if ( !obj.hasAdminPermObject( a_client, a_object_id ))
            throw obj.ERR_PERM_DENIED;
    };

    obj.ensureAdminPermRepo = function( a_client, a_repo_id ) {
        if ( !obj.hasAdminPermRepo( a_client, a_repo_id ))
            throw obj.ERR_PERM_DENIED;
    };

    obj.isSrcParentOfDest = function( a_src_id, a_dest_id ){
        var parent;
        var child_id = a_dest_id;
        for(;;){
            parent = obj.db.item.firstExample({_to: child_id});
            if ( !parent )
                return false;
            if ( parent._from == a_src_id )
                return true;
            child_id = parent._from;
        }
    };

    // Data or Collection ID or alias
    obj.resolveID = function( a_id, a_client ) {
        var id,i=a_id.indexOf('/');

        if ( i != -1 ) {
            if ( !a_id.startsWith('d/') && !a_id.startsWith('c/') && !a_id.startsWith('p/'))
                throw [ obj.ERR_INVALID_PARAM, "Invalid ID '" + a_id + "'" ];
            id = a_id;
        } else {
            var alias_id = "a/";
            if ( a_id.indexOf(":") == -1 )
                alias_id += "u:"+a_client._key + ":" + a_id;
            else
                alias_id += a_id;

            var alias = obj.db.alias.firstExample({ _to: alias_id });
            if ( !alias )
                throw [obj.ERR_NOT_FOUND,"Alias '" + a_id + "' does not exist"];

            id = alias._from;
        }

        if ( !obj.db._exists( id ) ){
            throw [ obj.ERR_INVALID_PARAM, "Record '" + id + "' does not exist." ];
        }

        return id;
    };

    obj.resolveDataID = function( a_id, a_client ) {
        var alias, id;

        if ( a_id.startsWith( 'doi:' )){
            id = "a/" + (a_id.substr(4).split("/").join("_"));
            alias = obj.db.alias.firstExample({ _to: id });
            if ( !alias )
                throw [obj.ERR_NOT_FOUND,"DOI '" + a_id + "' does not exist " + id];

            return alias._from;
        }

        var i=a_id.indexOf('/');

        if ( i != -1 ) {
            if ( !a_id.startsWith('d/'))
                throw [ obj.ERR_INVALID_PARAM, "Invalid data record ID '" + a_id + "'" ];
            id = a_id;
        } else {
            var alias_id = "a/";
            if ( a_id.indexOf(":") == -1 )
                alias_id += "u:"+a_client._key + ":" + a_id;
            else
                alias_id += a_id;

            alias = obj.db.alias.firstExample({ _to: alias_id });
            if ( !alias )
                throw [obj.ERR_NOT_FOUND,"Alias '" + a_id + "' does not exist"];

            id = alias._from;

            if ( !id.startsWith('d/'))
                throw [ obj.ERR_INVALID_PARAM, "Alias '" + a_id + "' does not identify a data record" ];
        }

        if ( !obj.db.d.exists( id ) ){
            throw [ obj.ERR_INVALID_PARAM, "Data record '" + id + "' does not exist." ];
        }

        return id;
    };

    obj.resolveCollID = function( a_id, a_client ) {
        var id,i=a_id.indexOf('/');

        if ( i != -1 ) {
            if ( !a_id.startsWith('c/'))
                throw [ obj.ERR_INVALID_PARAM, "Invalid collection ID '" + a_id + "'" ];
            id = a_id;
        } else {
            var alias_id = "a/";
            if ( a_id.indexOf(":") == -1 )
                alias_id += "u:"+a_client._key + ":" + a_id;
            else
                alias_id += a_id;

            var alias = obj.db.alias.firstExample({ _to: alias_id });
            if ( !alias )
                throw [obj.ERR_NOT_FOUND,"Alias '" + a_id + "' does not exist"];

            id = alias._from;

            if ( !id.startsWith('c/'))
                throw [ obj.ERR_INVALID_PARAM, "Alias '" + a_id + "' does not identify a collection" ];
        }

        if ( !obj.db.c.exists( id ) ){
            throw [ obj.ERR_INVALID_PARAM, "Collection '" + id + "' does not exist." ];
        }

        return id;
    };

    obj.resolveDataCollID = function( a_id, a_client ) {
        var id,i=a_id.indexOf('/');

        if ( i != -1 ) {
            if ( !a_id.startsWith('d/') && !a_id.startsWith('c/'))
                throw [ obj.ERR_INVALID_PARAM, "Invalid ID '" + a_id + "'" ];
            id = a_id;
        } else {
            var alias_id = "a/";
            if ( a_id.indexOf(":") == -1 )
                alias_id += "u:"+a_client._key + ":" + a_id;
            else
                alias_id += a_id;

            var alias = obj.db.alias.firstExample({ _to: alias_id });
            if ( !alias )
                throw [obj.ERR_NOT_FOUND,"Alias '" + a_id + "' does not exist"];

            id = alias._from;
        }

        if ( !obj.db._exists( id ) ){
            throw [ obj.ERR_INVALID_PARAM, (id.charAt(0)=='d'?"Data record '":"Collection '") + id + "' does not exist." ];
        }

        return id;
    };

    obj.topicLink = function( a_topic, a_coll_id, a_owner_id ){
        //var top_ar = obj.parseTopic( a_topic );
        var top_ar = a_topic.split(".");
        var i,topic,parent = "t/root";

        top_ar.push(a_owner_id);

        for ( i = 0; i < top_ar.length; i++ ){
            topic = obj.db._query("for v in 1..1 inbound @par top filter v.title == @title filter is_same_collection('t',v) return v",{par:parent,title:top_ar[i]});
            if ( topic.hasNext() ){
                parent = topic.next()._id;
            }else{
                for ( ; i < top_ar.length; i++ ){
                    topic = obj.db.t.save({title:top_ar[i]},{returnNew:true});
                    obj.db.top.save({_from:topic._id,_to:parent});
                    parent = topic._id;
                }
                break;
            }
        }

        if ( !obj.db.top.firstExample({_from:a_coll_id,_to:parent})){
            obj.db.top.save({_from:a_coll_id,_to:parent});
        }
    };

    obj.topicUnlink = function( a_coll_id ){
        //console.log("topicUnlink");
        var top = obj.db.top.firstExample({_from: a_coll_id});
        if ( !top ){
            return;
        }

        var parent = top._to;
        obj.db.top.remove(top);

        // Unwind path, deleting orphaned topics along the way
        while ( parent != "t/root" ){
            if ( obj.db.top.firstExample({ _to: parent }))
                break;
            else {
                top = obj.db.top.firstExample({ _from: parent });
                parent = top._to;
                obj.graph.t.remove( top._from );
            }
        }
    };

    obj.getParents = function( item_id ){
        var p, idx = 0, parents,results=[];

        parents = obj.db.item.byExample({_to: item_id });
        if ( !parents.hasNext() )
            return [[]];

        while ( parents.hasNext() ){
            p = parents.next();
            p = obj.db.c.document(p._from);

            results.push([{id:p._id,title:p.title,alias:p.alias}]);

            p = obj.db.item.firstExample({_to: p._id });
            while ( p ){
                p = obj.db.c.document(p._from);
                results[idx].push({id:p._id,title:p.title,alias:p.alias});
                p = obj.db.item.firstExample({_to: p._id });
            }
            idx ++;
        }

        /*
        parents = obj.db._query( "for v in 1..1 inbound @item item return {id:v._id,title:v.title,alias:v.alias}", { item : item_id }).toArray();
        if ( !parents.length )
            return [[]];

        for ( i in parents ){
            results.push([parents[i]]);
        }

        for ( i in results ){
            var res = obj.db._query( "for v in 1..50 inbound @item item return {id:v._id,title:v.title,alias:v.alias}", { item : results[i][0].id }).toArray();
            //console.log("par:",res);
            results[i] = results[i].concat( res );
        }*/

        return results;
    };


    obj.makeTitleUnique = function( a_parent_id, a_doc ){
        var conflicts = obj.db._query( "for v in 1..1 outbound @coll item filter is_same_collection(@type,v) and v.title == @title return {id:v._id}", { coll : a_parent_id, title: a_doc.title, type: a_doc._id.charAt(0) });

        if ( conflicts.hasNext() ){
            obj.db._update( a_doc._id, { title:a_doc.title + "_" + a_doc._key });
        }
    };


    obj.hasAnyCommonAccessScope = function( src_item_id, dst_coll_id ){
        console.log("hasAnyCommonAccessScope",src_item_id, dst_coll_id);

        if ( src_item_id[0] == 'c' ){
            // Collections can only be linked in one place, can use hasCommonAccessScope on parent
            var parent = obj.db.item.firstExample({ _to: src_item_id });
            if ( !parent )
                return false;
            else{
                return obj.hasCommonAccessScope( parent._from, dst_coll_id );
            }
        }else{
            var parents = obj.db.item.byExample({ _to: src_item_id });
            while ( parents.hasNext() ){
                if ( obj.hasCommonAccessScope( parents.next()._from, dst_coll_id ))
                    return true;
            }
        }

        return false;
    };

    obj.hasCommonAccessScope = function( src_coll_id, dst_coll_id ){
        console.log("hasCommonAccessScope",src_coll_id, dst_coll_id);
        var p1 = [src_coll_id], p2 = [dst_coll_id];
        var parent, child = src_coll_id;

        for(;;){
            parent = obj.db.item.firstExample({_to: child});
            if ( !parent )
                break;
            p1.unshift( parent._from );
            child = parent._from;
        }

        child = dst_coll_id;

        for(;;){
            parent = obj.db.item.firstExample({_to: child});
            if ( !parent )
                break;
            p2.unshift( parent._from );
            child = parent._from;
        }

        var i, len = Math.min(p1.length,p2.length);

        for ( i = 0; i < len; i++ ){
            if ( p1[i] != p2[i] )
                break;
        }
        console.log("hasCommonAccessScope",p1, p2,i);

        if ( i == 0 ){
            return false;
        }

        // If ANY ACLs or default permissions are set from here down, they differ in scope
        var j;

        for ( j = i; j < p1.length; j++ ){
            if ( obj.db.acl.firstExample({ _from: p1[j] })){
                return false;
            }
        }

        for ( j = i; j < p2.length; j++ ){
            if ( obj.db.acl.firstExample({ _from: p2[j] })){
                return false;
            }
        }

        return true;
    };

    /* Test if client has requested permission(s) for specified object. Note: this call does NOT check for
     * ownership or admin privilege - the hasAdminPermObject function performs these checks and should be
     * called first if needed. This function is typically used when filtering a list of objects that are
     * known not to be owned by the client (and that the client is not an admin). In this case, those checks
     * would add performance cost for no benefit.
     */
    obj.hasPermissions = function( a_client, a_object, a_req_perm, a_inherited = false, any = false ) {
        //console.log("check perm:", a_req_perm, "client:", a_client._id, "object:", a_object._id, "any:", any );
        //console.log("grant:", a_object.grant );

        var perm_found=0,acl,acls,result,i;

        // If object is marked "public", everyone is granted VIEW, and READ permissions
        // The current implementation allows users to be denied access to public data (maybe wrong?)

        if ( a_object.topic ){
            perm_found = obj.PERM_PUBLIC;

            result = obj.evalPermissions( a_req_perm, perm_found, any );
            if ( result != null )
                return result;
        }

        // Evaluate user permissions set directly on object
        if ( a_object.acls & 1 ){
            acls = obj.db._query( "for v, e in 1..1 outbound @object acl filter v._id == @client return e", { object: a_object._id, client: a_client._id } ).toArray();

            if ( acls.length ){
                for ( i in acls ) {
                    acl = acls[i];
                    //console.log("user_perm:",acl);
                    perm_found |= acl.grant;
                    if ( a_inherited && acl.inhgrant )
                        perm_found |= acl.inhgrant;
                }

                result = obj.evalPermissions( a_req_perm, perm_found, any );
                if ( result != null )
                    return result;
            }
        }

        // Evaluate group permissions on object
        if ( a_object.acls & 2 ){
            acls = obj.db._query( "for v, e, p in 2..2 outbound @object acl, outbound member filter p.vertices[2]._id == @client return p.edges[0]", { object: a_object._id, client: a_client._id } ).toArray();
            if ( acls.length ){
                for ( i in acls ) {
                    acl = acls[i];
                    //console.log("group_perm:",acl);
                    perm_found |= acl.grant;
                    if ( a_inherited && acl.inhgrant )
                        perm_found |= acl.inhgrant;
                }

                result = obj.evalPermissions( a_req_perm, perm_found, any );
                if ( result != null )
                    return result;
            }
        }

        // If not all requested permissions have been found, evaluate permissions inherited from parent collections
        // Note that items can only be linked to containers that share the same owner
        // This evaluation is implemented as a manually guided breadth-first search

        var children = [a_object];
        var parents,parent;

        for(;;){
            // Find all parent collections owned by object owner

            parents = obj.db._query( "for i in @children for v in 1..1 inbound i item return {_id:v._id,topic:v.topic,acls:v.acls}", { children : children }).toArray();

            if ( parents.length == 0 )
                break;

            for ( i in parents ) {
                parent = parents[i];

                if ( parent.topic ){
                    perm_found |= obj.PERM_PUBLIC;

                    result = obj.evalPermissions( a_req_perm, perm_found, any );
                    if ( result != null )
                        return result;
                }

                // User ACL first
                if ( parent.acls && (( parent.acls & 1 ) != 0 )){
                    acls = obj.db._query( "for v, e in 1..1 outbound @object acl filter v._id == @client return e", { object: parent._id, client: a_client._id } ).toArray();
                    if ( acls.length ){
                        for ( i in acls ) {
                            acl = acls[i];
                            perm_found |= acl.inhgrant;
                        }

                        result = obj.evalPermissions( a_req_perm, perm_found, any );
                        if ( result != null )
                            return result;
                    }
                }

                // Group ACL next
                if ( parent.acls && (( parent.acls & 2 ) != 0 )){
                    acls = obj.db._query( "for v, e, p in 2..2 outbound @object acl, outbound member filter is_same_collection('g',p.vertices[1]) and p.vertices[2]._id == @client return p.edges[0]", { object: parent._id, client: a_client._id } ).toArray();
                    if ( acls.length ){
                        for ( i in acls ) {
                            acl = acls[i];
                            perm_found |= acl.inhgrant;
                        }

                        result = obj.evalPermissions( a_req_perm, perm_found, any );
                        if ( result != null )
                            return result;
                    }
                }
            }

            // If there are still missing require permissions...
            // Determine which parents are candidates for further evaluation (have req bits not set in inherited permissions)
            children = parents;
        }

        //console.log("perm (last): false" );
        return false;
    };

    obj.evalPermissions = function( a_req_perm, a_perm_found, any ) {
        if ( any ){
            // If any requested permission have been found, return true (granted)
            if ( a_perm_found & a_req_perm )
                return true;
            else
                return null; // Else, keep looking
        } else {
            // If not all requested permissions have been found return NULL (keep looking)
            if (( a_perm_found & a_req_perm ) != a_req_perm )
                return null;
            else
                return true; // Else, permission granted
        }
    };

    obj.getPermissions = function( a_client, a_object, a_req_perm, a_inherited = false ) {
        //console.log("get perm:", a_req_perm, "client:", a_client._id, "object:", a_object._id, "any:", any );
        //console.log("grant:", a_object.grant );

        var perm_found=0,acl,acls,i;

        // If object has a topic (collections only), everyone is granted VIEW, and READ permissions
        // The current implementation allows users to be denied access to public data (maybe wrong?)

        if ( a_object.topic ){
            perm_found = obj.PERM_PUBLIC;

            if (( a_req_perm & perm_found ) == a_req_perm )
                return a_req_perm;
        }

        // Evaluate permissions set directly on object

        if ( a_object.acls && ((a_object.acls & 1 ) != 0 )){
            acls = obj.db._query( "for v, e in 1..1 outbound @object acl filter v._id == @client return e", { object: a_object._id, client: a_client._id } ).toArray();

            if ( acls.length ){
                for ( i in acls ) {
                    acl = acls[i];
                    //console.log("user_perm:",acl);
                    perm_found |= acl.grant;
                    if ( a_inherited && acl.inhgrant )
                        perm_found |= acl.inhgrant;
                }

                if (( a_req_perm & perm_found ) == a_req_perm )
                    return a_req_perm;
            }
        }

        // Evaluate group permissions on object

        if ( a_object.acls && ((a_object.acls & 2 ) != 0 )){
            acls = obj.db._query( "for v, e, p in 2..2 outbound @object acl, outbound member filter p.vertices[2]._id == @client return p.edges[0]", { object: a_object._id, client: a_client._id } ).toArray();

            if ( acls.length ){
                for ( i in acls ) {
                    acl = acls[i];
                    //console.log("group_perm:",acl);
                    perm_found |= acl.grant;
                    if ( a_inherited && acl.inhgrant )
                        perm_found |= acl.inhgrant;
                }

                if (( a_req_perm & perm_found ) == a_req_perm )
                    return a_req_perm;
            }
        }

        // If not all requested permissions have been found, evaluate permissions inherited from parent collections
        // Note that items can only be linked to containers that share the same owner

        var children = [a_object];
        var parents,parent;

        for(;;){
            // Find all parent collections owned by object owner

            parents = obj.db._query( "for i in @children for v in 1..1 inbound i item return {_id:v._id,topic:v.topic,acls:v.acls}", { children : children }).toArray();

            if ( parents.length == 0 )
                break;

            for ( i in parents ) {
                parent = parents[i];

                if ( parent.topic ){
                    perm_found |= obj.PERM_PUBLIC;

                    if (( a_req_perm & perm_found ) == a_req_perm )
                        return a_req_perm;
                }

                // User ACL
                if ( parent.acls && (( parent.acls & 1 ) != 0 )){
                    acls = obj.db._query( "for v, e in 1..1 outbound @object acl filter v._id == @client return e", { object: parent._id, client: a_client._id } ).toArray();
                    if ( acls.length ){
                        for ( i in acls ) {
                            acl = acls[i];
                            perm_found |= acl.inhgrant;
                        }

                        if (( a_req_perm & perm_found ) == a_req_perm )
                            return a_req_perm;
                    }
                }

                // Group ACL
                if ( parent.acls && (( parent.acls & 2 ) != 0 )){
                    acls = obj.db._query( "for v, e, p in 2..2 outbound @object acl, outbound member filter is_same_collection('g',p.vertices[1]) and p.vertices[2]._id == @client return p.edges[0]", { object: parent._id, client: a_client._id } ).toArray();
                    if ( acls.length ){
                        for ( i in acls ) {
                            acl = acls[i];
                            perm_found |= acl.inhgrant;
                        }

                        if (( a_req_perm & perm_found ) == a_req_perm )
                            return a_req_perm;
                    }
                }
            }

            // If there are still missing require permissions...
            // Determine which parents are candidates for further evaluation (have req bits not set in inherited permissions)
            children = parents;
        }

        return perm_found & a_req_perm;
    };

    obj.getPermissionsLocal = function( a_client_id, a_object, a_get_inherited, a_req_perm ) {
        var perm={grant:0,inhgrant:0,inherited:0},acl,acls,i;

        if ( a_object.acls & 1 ){
            acls = obj.db._query( "for v, e in 1..1 outbound @object acl filter v._id == @client return e", { object: a_object._id, client: a_client_id } ).toArray();

            for ( i in acls ) {
                acl = acls[i];
                perm.grant |= acl.grant;
                perm.inhgrant |= acl.inhgrant;
            }
        }

        // Evaluate group permissions on object
        if ( a_object.acls & 2 ){
            acls = obj.db._query( "for v, e, p in 2..2 outbound @object acl, outbound member filter p.vertices[2]._id == @client return p.edges[0]", { object: a_object._id, client: a_client_id } ).toArray();
            for ( i in acls ) {
                acl = acls[i];
                perm.grant |= acl.grant;
                perm.inhgrant |= acl.inhgrant;
            }
        }

        if ( a_get_inherited ){
            var children = [a_object];
            var parents,parent;

            for(;;){
                // Find all parent collections owned by object owner

                parents = obj.db._query( "for i in @children for v in 1..1 inbound i item return {_id:v._id,topic:v.topic,acls:v.acls}", { children : children }).toArray();

                if ( parents.length == 0 )
                    break;

                for ( i in parents ) {
                    parent = parents[i];

                    // User ACL
                    if ( parent.acls && (( parent.acls & 1 ) != 0 )){
                        acls = obj.db._query( "for v, e in 1..1 outbound @object acl filter v._id == @client return e", { object: parent._id, client: a_client_id } ).toArray();
                        if ( acls.length ){
                            for ( i in acls ) {
                                acl = acls[i];
                                perm.inherited |= acl.inhgrant;
                            }

                            if (( a_req_perm & perm.inherited ) == a_req_perm )
                                break;
                        }
                    }

                    // Group ACL
                    if ( parent.acls && (( parent.acls & 2 ) != 0 )){
                        acls = obj.db._query( "for v, e, p in 2..2 outbound @object acl, outbound member filter is_same_collection('g',p.vertices[1]) and p.vertices[2]._id == @client return p.edges[0]", { object: parent._id, client: a_client_id } ).toArray();
                        if ( acls.length ){
                            for ( i in acls ) {
                                acl = acls[i];
                                perm.inherited |= acl.inhgrant;
                            }

                            if (( a_req_perm & perm.inherited ) == a_req_perm )
                                break;
                        }
                    }
                }

                // If there are still missing require permissions...
                // Determine which parents are candidates for further evaluation (have req bits not set in inherited permissions)
                children = parents;
            }
        }

        return perm;
    };

    obj.getACLOwnersBySubject = function( subject, inc_users, inc_projects ){
        var results = [];

        /* Get users and projects that have shared data or collections with subject:
        - Any user that shares a record or collection directly with the subject, or with a group that the subject is a member 
        - Any non-associated project that shares a record or collection directly with the subject, or with a group that the subject is a member
        - Non-associated projects are prejects where the subject is not the owner, an admin, or a member
        */

        if ( inc_users || inc_projects ){
            var ids = new Set(), ignore = new Set(), owner_id, acl, acls = obj.db.acl.byExample({ _to: subject });

            // Find direct ACLs (not through a group)
            while( acls.hasNext() ){
                acl = acls.next();
                owner_id = obj.db.owner.firstExample({_from: acl._from })._to;

                if ( owner_id.charAt(0) == 'p' ){
                    if ( inc_projects ){
                        if ( ids.has( owner_id ) || ignore.has( owner_id ))
                            continue;

                        if ( obj.getProjectRole( subject, owner_id ) == obj.PROJ_NO_ROLE ){
                            ids.add( owner_id );
                        }else{
                            ignore.add( owner_id );
                        }
                    }
                }else if ( inc_users ){
                    ids.add( owner_id );
                }
            }

            // Find indirect ACLs (through a group)
            var mem, members = obj.db.member.byExample({ _to: subject });
            while ( members.hasNext() ){
                mem = members.next();
                // Group must have at least one ACL set; otherwise ignore it
                if ( obj.db.acl.firstExample({ _to: mem._from })){
                    owner_id = obj.db.owner.firstExample({ _from: mem._from })._to;

                    if ( owner_id.charAt(0) == 'p' ){
                        if ( inc_projects ){
                            if ( ids.has( owner_id ) || ignore.has( owner_id ))
                                continue;

                            if ( obj.getProjectRole( subject, owner_id ) == obj.PROJ_NO_ROLE ){
                                ids.add( owner_id );
                            }else{
                                ignore.add( owner_id );
                            }
                        }
                    }else if ( inc_users ){
                        ids.add( owner_id );
                    }
                }
            }

            var doc,title;

            ids.forEach( function( id ){
                doc = obj.db._document( id );
                if ( doc.title )
                    title = doc.title;
                else
                    title = doc.name_last + ", " + doc.name_first;
                results.push({ id:doc._id, title: title, owner: doc.owner });
            });

            results.sort( function( a, b ){
                if ( a.id < b.id )
                    return -1;
                else if ( a.id > b.id )
                    return 1;
                else
                    return 0;
            });
        }

        return results;
    };

    obj.usersWithClientACLs = function( client_id, id_only ){
        var result;
        if ( id_only ){
            result = obj.db._query("for x in union_distinct((for v in 2..2 inbound @user acl, outbound owner filter is_same_collection('u',v) return v._id),(for v,e,p in 3..3 inbound @user member, acl, outbound owner filter is_same_collection('g',p.vertices[1]) and is_same_collection('acl',p.edges[1]) and is_same_collection('u',v) return v._id)) return x", { user: client_id }).toArray();
        }else{
            result = obj.db._query("for x in union_distinct((for v in 2..2 inbound @user acl, outbound owner filter is_same_collection('u',v) return {uid:v._id,name:v.name}),(for v,e,p in 3..3 inbound @user member, acl, outbound owner filter is_same_collection('g',p.vertices[1]) and is_same_collection('acl',p.edges[1]) and is_same_collection('u',v) return {uid:v._id,name:v.name})) sort x.name return x", { user: client_id }).toArray();
        }
        //console.log("usersWithACLs:",result);
        return result;
    };

    obj.projectsWithClientACLs = function( client_id, id_only ){
        // Get projects that have ACLs set for client AND where client is not owner, admin, or member of project
        var result;
        if ( id_only ){
            result = obj.db._query("for i in minus((for v in 2..2 inbound @user member, acl, outbound owner filter is_same_collection('p',v) return v._id),(for v,e,p in 2..2 inbound @user member, outbound owner filter p.vertices[1].gid == 'members' and is_same_collection('p',v) return v._id)) return i",{user:client_id});
        }else{
            result = obj.db._query("for i in minus((for v in 2..2 inbound @user member, acl, outbound owner filter is_same_collection('p',v) return {id:v._id,title:v.title}),(for v,e,p in 2..2 inbound @user member, outbound owner filter p.vertices[1].gid == 'members' and is_same_collection('p',v) return {id:v._id,title:v.title})) return i",{user:client_id});
        }
        //console.log("projectsWithACLs:",result);
        return result.toArray();
    };

    obj.checkDependencies = function(id,src,depth){
        console.log("checkdep ",id,src,depth);

        var dep,deps = obj.db._query("for v in 1..1 outbound @id dep return v._id",{id:id});
        if ( !depth || depth < 50 ){
            console.log("checkdep depth ok");
            while( deps.hasNext() ){
                console.log("has next");
                dep = deps.next();
                if ( dep == src )
                    throw [obj.ERR_INVALID_PARAM,"Circular dependency detected in references, from "+id];
                obj.checkDependencies( dep, src?src:id, depth + 1 );
            }
        }
    };

    obj.calcInhError = function( id, depth ){
        console.log("calcInhError ",id);

        //var dep,deps = obj.db._query("for v,e in 1..1 inbound @id dep filter e.type < 2 let err = (for n in 1..1 outbound v note filter n.state == 2 && n.type == 3 return distinct true) return {id:v._id,inh_err:v.inh_err,err:err}",{id:id});
        var dep,deps = obj.db._query("for v,e in 1..1 inbound @id dep filter e.type < 2 return {id:v._id,loc_err:v.loc_err,inh_err:v.inh_err}",{id:id});
        if ( !depth || depth < 50 ){
            while( deps.hasNext() ){
                dep = deps.next();
                if ( dep.inh_err || dep.loc_err )
                    return true;

                obj.checkDependencies( dep.id, depth + 1 );
            }
        }

        return false;
    };

    obj.recalcInhErrorDeps = function( id, has_err ){
        console.log("recalcInhErrorDeps",id,has_err);
        // local or inherited error at source has changed, recalc & update dependents inh_err

        var update,dep,deps = obj.db._query("for v,e in 1..1 inbound @id dep filter e.type < 2 return {id:v._id,loc_err:v.loc_err,inh_err:v.inh_err}",{id:id});
        while( deps.hasNext() ){
            dep = deps.next();
            console.log("- dep:",dep.id,dep.inh_err);

            if ( has_err ){
                if ( !dep.inh_err ){
                    update = true;
                }else{
                    update = false;
                }
            }else{
                if ( dep.inh_err ){
                    // Must determine if inherits error from any other sources
                    var ud,up_deps = obj.db._query("for v,e in 1..1 inbound @id dep filter e.type < 2 && v._id != @src return {id:v._id,err:v.loc_err||v.inh_err}",{id:dep.id,src:id});

                    update = true;
                    while( up_deps.hasNext() ){
                        ud = up_deps.next();
                        console.log("-- ud:",ud.id,ud.err);
                        if ( ud.err ){
                            update = false;
                            break;
                        }
                    }
                }else{
                    update = false;
                }
            }

            if ( update ){
                console.log("- do update");
                // Update inh_err
                obj.db.d.update( dep.id, { inh_err: has_err });

                if ( !dep.loc_err ){
                    // combined err state changed, must update dependents
                    obj.recalcInhErrorDeps( dep.id, has_err );
                }
            }
        }
    };

    obj.saveRecentGlobusPath = function( a_client, a_path, a_mode ){
        var path = a_path, idx = a_path.lastIndexOf("/");

        if ( a_mode == obj.TT_DATA_PUT ){
            // For PUT, strip off filename but keep last slash
            if ( idx > 0 )
                path = a_path.substr(0,idx+1);
        }else{
            // For GET, make sure path ends in a slash
            if ( idx != a_path.length - 1 )
                path += "/";
        }

        if ( a_client.eps && a_client.eps.length ){
            idx = a_client.eps.indexOf( path );
            if ( idx == -1 ){
                if ( a_client.eps.unshift( path ) > 20 ){
                    a_client.eps.length = 20;
                }
            }else{
                a_client.eps.splice( idx, 1 );
                a_client.eps.unshift( path );
            }
        }else{
            a_client.eps = [path];
        }

        obj.db._update( a_client._id, { eps: a_client.eps });
    };

    return obj;
}() );

