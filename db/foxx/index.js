/*jshint strict: global */
/*jshint esversion: 6 */
/* globals require */
/* globals module */
/* globals console */

'use strict';

const   createRouter = require('@arangodb/foxx/router');
const   router = createRouter();
const   joi = require('joi');
const   db = require('@arangodb').db;
const   graph = require('@arangodb/general-graph')._graph('sdmsg');

const PERM_NONE     = 0x00;
const PERM_VIEW     = 0x01;
const PERM_CREATE   = 0x02;
const PERM_READ     = 0x04;
const PERM_UPDATE   = 0x08;
const PERM_WRITE    = 0x10;
const PERM_DELETE   = 0x20;
const PERM_TAG      = 0x40;
const PERM_ANNOTATE = 0x80;
const PERM_ALL      = 0xFF;


const ERR_INVALID_CERT          = -1;
const ERR_PERM_DENIED           = -2;
const ERR_CERT_IN_USE           = -3;
const ERR_INVALID_ALIAS         = -4;
const ERR_ITEM_ALREADY_LINKED   = -5;
const ERR_DATA_NOT_FOUND        = -6;
const ERR_COLL_NOT_FOUND        = -7;
const ERR_CANNOT_DEL_ROOT       = -8;
const ERR_ALIAS_NOT_FOUND       = -9;

module.context.use(router);

function getUserFromCert( a_cert_subject ) {
    var result = db._query( "for c in cert filter c.subject == @cert_subject for u in inbound c._id ident return u", { 'cert_subject': a_cert_subject } ).toArray();

    if ( result.length != 1 )
        throw ERR_INVALID_CERT;

    return result[0];
}


function getAliasID( a_alias, a_client ) {
    if ( a_alias.startsWith( "data/" ) || a_alias.startsWith( "coll/" ) ) 
        return null;

    if ( a_alias.indexOf(":") == -1 )
        return "aliases/" + a_client._key + ":" + a_alias;
    else
        return "aliases/" + a_alias;
}


function handleException( e, res ) {
    if ( e ) {
        switch ( e ) {
            case ERR_INVALID_CERT:
                res.throw( 400, "Invalid certificate" );
                break;
            case ERR_PERM_DENIED:
                res.throw( 400, "Permission denied" );
                break;
            case ERR_CERT_IN_USE:
                res.throw( 400, "Certificate is in use" );
                break;
            case ERR_ALIAS_NOT_FOUND:
                res.throw( 400, "Alias not found" );
                break;
            default:
                res.throw( 500, "Unexpected KNOWN exception: " + e );
                break;
        }
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
}

//===== USER API FUNCTIONS =====


router.post('/user/create', function (req, res) {
    try {
        db._executeTransaction({
            collections: {
                read: ["user","cert"],
                write: ["user","cert","coll","owner","ident","alias","aliases"]
            },
            action: function ( params ) {
                const db = require("@arangodb").db;

                var user = db.user.save({ _key: params[0], name_last: params[2], name_first: params[3], email: params[4], is_admin: params[5], is_project: params[6] }, { returnNew: true });

                var cert = db.cert.save({ subject: params[1] }, { returnNew: true });
                var root = db.coll.save({ _key: params[0] + "_root", is_root: true, title: "root", desc: "Root collection for user " + params[2] + " " + params[3] + " (" + params[0] +")" }, { returnNew: true });
                var alias = db.aliases.save({ _key: params[0] + ":root" }, { returnNew: true });

                db.alias.save({ _from: root._id, _to: alias._id });
                db.ident.save({ _from: user._id, _to: cert._id });
                db.owner.save({ _from: root._id, _to: user._id });

                // TODO must check referential integrity for admins

                if ( params[7] ) {
                    for ( var i in params[7] ) {
                        db.admin.save({ _from: user._id, _to: "user/" + params[7] });
                    }
                }
            },
            params: [ req.queryParams.uid, req.queryParams.cert, req.queryParams.name_first, req.queryParams.name_last, req.queryParams.email, req.queryParams.is_admin, req.queryParams.is_project, req.queryParams.admins ]
        });
    } catch( e ) {
        handleException( e, res );
    }
})
.queryParam('uid', joi.string().required(), "User ID for new user")
.queryParam('name_first', joi.string().required(), "First name")
.queryParam('name_last', joi.string().required(), "Last name")
.queryParam('email', joi.string().required(), "Email")
//.queryParam('org', joi.string().required(), "User's home organization")
.queryParam('cert', joi.string().required(), "New user certificate subject string")
.queryParam('is_admin', joi.boolean().optional(), "New account is a system administrator")
.queryParam('is_project', joi.boolean().optional(), "New account is a project")
.queryParam('admins', joi.array().items(joi.string()).optional(), "Account administrators (uids)")
.summary('Create new user entry')
.description('Create new user entry. Requires admin permissions.');


router.get('/user/view', function (req, res) {
    if ( req.queryParams.uid ) {
        res.send( db._query( "for u in user filter u._key == @uid return u", { 'uid': req.queryParams.uid } ));
    } else if ( req.queryParams.cert ) {
        res.send( db._query( "for c in cert filter c.subject == @cert for u in inbound c._id ident return u", { 'cert': req.queryParams.cert } ));
    } else {
        res.throw( 400, "No user specified" );
    }
})
.queryParam('uid', joi.string().optional(), "UID of user to view")
.queryParam('cert', joi.string().optional(), "Certificate of user to view")
.summary('View user information')
.description('View user information');


router.get('/user/list', function (req, res) {
    res.send( db._query( "for u in user return u" ));
})
.summary('List users')
.description('List users');


router.post('/user/update', function (req, res) {
    res.throw( 400, "NOT IMPLEMENTED" );
})
.queryParam('client', joi.string().required(), "Client certificate")
.summary('Update user information')
.description('Update user information');


router.post('/user/delete', function (req, res) {
    try {
        db._executeTransaction({
            collections: {
                read: ["user","cert"],
                write: ["user","cert","coll","data","acl","owner","ident"]
            },
            action: function ( params ) {
                const db = require("@arangodb").db;
                //const graph = require('@arangodb/general-graph')._graph('sdmsg');

                const client = getUserFromCert( params[0] );
                if ( client._key != params[1] || !client.is_admin || !db.admin.firstExample({ _from: "user/" + params[1], _to: client._id }))
                    throw ERR_PERM_DENIED;

                var user = db.user.document({ _id: "user/" + params[1] });

                // TODO This MUST use graph engine to ensure all edges are removed

                // Delete ALL certificates
                db._query( "for v in 1..1 outbound @user ident remove v", { user: user._id } );

                // Delete ALL collections and data
                db._query( "for v in 1..1 inbound @user owner remove v", { user: user._id } );

                // Delete ALL edges
                db.removeByExample({ _from: user._id });
                db.removeByExample({ _to: user._id });

                db.user.remove({ _id: user._id });
            },
            params: [ req.queryParams.client, req.queryParams.uid ]
        });
    } catch( e ) {
        handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client certificate")
.queryParam('uid', joi.string().required(), "User ID of user to remove")
.summary('Remove existing user entry')
.description('Remove existing user entry. Requires admin permissions.');


router.post('/user/cert/create', function (req, res) {
    try {
        db._executeTransaction({
            collections: {
                read: ["user","cert"],
                write: ["cert","ident"]
            },
            action: function ( params ) {
                const db = require("@arangodb").db;
                const client = getUserFromCert( params[0] );
                var cert;

                if ( params[2] ) {
                    const user = db.user.document( "user/" + params[2] );

                    if ( client._key != user._key || !client.is_admin || !db.admin.firstExample({ _from: user._id, _to: client._id }))
                        throw ERR_PERM_DENIED;

                    cert = db.cert.save({ subject: params[1] }, { returnNew: true });
                    db.ident.save({ _from: user._id, _to: cert._id });
                } else {
                    cert = db.cert.save({ subject: params[1] }, { returnNew: true });
                    db.ident.save({ _from: client._id, _to: cert._id });
                }
            },
            params: [ req.queryParams.client, req.queryParams.cert, req.queryParams.uid ]
        });
    } catch( e ) {
        handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client certificate")
.queryParam('cert', joi.string().required(), "Certificate to add (subject)")
.queryParam('uid', joi.string().optional(), "UID of user to associate with certificate")
.summary('Add new certificate to user account')
.description('Add new certificate to user account');


router.get('/user/cert/list', function (req, res) {
    res.throw( 400, "NOT IMPLEMENTED" );
})
.queryParam('client', joi.string().required(), "Client certificate")
.summary('List user certificates');


router.post('/user/cert/update', function (req, res) {
    res.throw( 400, "NOT IMPLEMENTED" );
})
.queryParam('client', joi.string().required(), "Client certificate")
.queryParam('cert', joi.string().required(), "Certificate to update")
.summary('List user certificates');


router.post('/user/cert/delete', function (req, res) {
    try {
        db._executeTransaction({
            collections: {
                read: ["user","cert"],
                write: ["cert","ident"]
            },
            action: function ( params ) {
                const db = require("@arangodb").db;
                if ( params[0] == params[1] )
                    throw ERR_CERT_IN_USE;

                const client = getUserFromCert( params[0] );
                const owner = getUserFromCert( params[1] );

                if ( client._id != owner._id || !client.is_admin || !db.admin.firstExample({ _from: owner._id, _to: client._id }))
                    throw ERR_PERM_DENIED;

                const cert = db.cert.firstExample({ subject: params[1] });

                db.ident.removeByExample({ _to: cert._id });
                db.cert.remove({ _id: cert._id });
            },
            params: [ req.queryParams.client, req.queryParams.cert, req.queryParams.uid ]
        });
    } catch( e ) {
        handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client certificate")
.queryParam('cert', joi.string().required(), "Certificate to delete")
.summary('Remove certificate from user account')
.description('Remove certificate from user account');


//===== DATA API FUNCTIONS =====


router.post('/data/create', function (req, res) {
    try {
        var result = [];

        db._executeTransaction({
            collections: {
                read: ["user","cert"],
                write: ["data","owner"]
            },
            action: function ( params ) {
                const db = require("@arangodb").db;

                const client = getUserFromCert( params[0] );

                var alias_id = getAliasID( params[3], client );
                if ( alias_id && !alias_id.startsWith( client._key + ":" ))
                    throw ERR_INVALID_ALIAS;

                var data = db.data.save({ title: params[1], desc: params[2], metadata: params[4] }, { returnNew: true });
                db.owner.save({ _from: data._id, _to: client._id });

                if ( alias_id ) {
                    db.aliases.save({ _id: alias_id });
                    db.alias.save({ _from: data._id, _to: alias_id });
                }

                params[5].push( data.new );
            },
            params: [ req.queryParams.client, req.queryParams.title, req.queryParams.desc, req.queryParams.alias, req.queryParams.metadata, result ]
        });

        res.send( result );
    } catch( e ) {
        handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client certificate subject string")
.queryParam('title', joi.string().optional(), "Title")
.queryParam('desc', joi.string().optional(), "Description")
.queryParam('alias', joi.string().optional(), "Alias")
.queryParam('metadata', joi.string().optional(), "Metadata (JSON)")
.summary('Creates a new data record')
.description('Creates a new data record');

router.post('/data/delete', function (req, res) {
    try {
        db._executeTransaction({
            collections: {
                read: ["user","cert","data"],
                write: ["data","owner","meta","acl","item"]
            },
            action: function ( params ) {
                const db = require("@arangodb").db;

                const client = getUserFromCert( params[0] );

                // TODO Check permissions
                var data;
                var alias = getAliasID( params[1], client );

                if ( alias ) {
                    // FIXME
                    data = db._query("for d in data filter d.alias == @alias return d", { alias: alias }).toArray();
                    if ( data.length == 1 )
                        data = data[0];
                    else
                        throw ERR_DATA_NOT_FOUND;
                } else {
                    data = db.data.document({ _key: params[1] });
                }

                // TODO Need to delete attached notes

                db.owner.removeByExample({ _from: data._id });
                db.meta.removeByExample({ _from: data._id });
                db.item.removeByExample({ _to: data._id });
                db.acl.removeByExample({ _from: data._id });
                db.data.remove({ _id: data._id });
            },
            params: [ req.queryParams.client, req.queryParams.id ]
        });
    } catch( e ) {
        handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client certificate subject string")
.queryParam('id', joi.string().required(), "Data ID or alias")
.summary('Deletes an existing data record')
.description('Deletes an existing data record');

router.get('/data/all', function (req, res) {
    try {
        const client = getUserFromCert( req.queryParams.client );

        const result = db._query( "for v in 1..1 inbound @client owner filter IS_SAME_COLLECTION('data', v) return v", { client: client._id} );

        res.send( result );
    } catch( e ) {
        handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client certificate subject string")
.summary('Get all data owned by client')
.description('Get all data owned by client');

router.get('/data', function (req, res) {
    try {
        const client = getUserFromCert( req.queryParams.client );

        // TODO Check permissions
        var result;
        var alias = getAliasID( req.queryParams.id, client );

        if ( alias ) {
            // FIXME
            result = db._query("for d in data filter d.alias == @alias return d", { alias: alias });
        } else {
            result = [db.data.document({ _key: req.queryParams.id })];
        }

        res.send( result );
    } catch( e ) {
        handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client certificate subject string")
.queryParam('id', joi.string().required(), "Data ID or alias")
.summary('Get data by ID or alias')
.description('Get data by ID or alias');



//===== COLLECTION API FUNCTIONS =====

router.post('/collection/create', function (req, res) {
    try {
        var result = [];

        db._executeTransaction({
            collections: {
                read: ["user","cert"],
                write: ["coll","owner","item"]
            },
            action: function ( params ) {
                const db = require("@arangodb").db;
                const graph = require('@arangodb/general-graph')._graph('sdmsg');

                const client = getUserFromCert( params[0] );

                var obj = { title: params[1] };
                if ( params[2] )
                    obj.desc = params[2];
                    
                var alias_id = getAliasID( params[3], client );
                if ( alias_id && !alias_id.startsWith( client._key + ":" ))
                    throw ERR_INVALID_ALIAS;

                var coll = db.coll.save( obj, { returnNew: true });
                db.owner.save({ _from: coll._id, _to: client._id });

                var parent = null;
                if ( params[4] )
                    parent = "coll/" + params[4];
                else
                    parent = "coll/" + client._key + "_root";

                // Arango bug requires this
                if ( !db._exists({ _id: parent }) )
                    throw ERR_COLL_NOT_FOUND;

                graph.item.save({ _from: parent, _to: coll._id });

                if ( alias_id ) {
                    db.aliases.save({ _id: alias_id });
                    db.alias.save({ _from: coll._id, _to: alias_id });
                }

                params[5].push( coll.new );
            },
            params: [ req.queryParams.client, req.queryParams.title, req.queryParams.desc, req.queryParams.alias, req.queryParams.parent_coll_id, result ]
        });

        res.send( result );
    } catch( e ) {
        handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client crtificate subject string")
.queryParam('title', joi.string().required(), "Title")
.queryParam('desc', joi.string().optional(), "Description")
.queryParam('alias', joi.string().optional(), "Alias")
.queryParam('parent_coll_id', joi.string().optional(), "Parent collection ID (default = root)")
.summary('Creates a new data collection')
.description('Creates a new data collection');


router.post('/collection/delete', function (req, res) {
    try {
        db._executeTransaction({
            collections: {
                read: ["user","cert"],
                write: ["coll","owner","item","acl","meta"]
            },
            action: function ( params ) {
                const db = require("@arangodb").db;
                const graph = require('@arangodb/general-graph')._graph('sdmsg');

                const client = getUserFromCert( params[0] );

                // TODO Check permissions

                var coll;
                var alias = getAliasID( params[1], client );

                if ( alias ) {
                    coll = db._query("for c in coll filter c.alias == @alias return c", { alias: alias }).toArray();
                    if ( coll.length == 1 )
                        coll = coll[0];
                    else
                        throw ERR_COLL_NOT_FOUND;
                } else {
                    coll = db.coll.document({ _key: params[1] });
                }

                if ( coll.is_root )
                    throw ERR_CANNOT_DEL_ROOT;

                // TODO Need to delete attached notes

                db.owner.removeByExample({ _from: coll._id });
                db.meta.removeByExample({ _from: coll._id });
                db.item.removeByExample({ _to: coll._id });
                db.item.removeByExample({ _from: coll._id });
                db.acl.removeByExample({ _from: coll._id });
                db.coll.remove({ _id: coll._id });
            },
            params: [ req.queryParams.client, req.queryParams.id ]
        });
    } catch( e ) {
        handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client crtificate subject string")
.queryParam('id', joi.string().required(), "Collection ID or alias")
.summary('Deletes an existing data collection')
.description('Deletes an existing data collection');


router.get('/collection/list', function (req, res) {
    try {
        const client = getUserFromCert( req.queryParams.client );

        const result = db._query( "for v in 1..1 inbound @client owner filter IS_SAME_COLLECTION('coll', v) return v", { client: client._id} );

        res.send( result );
    } catch( e ) {
        handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client certificate subject string")
.summary('Get all data collections owned by client')
.description('Get all data collections owned by client');


router.get('/collection/view', function (req, res) {
    try {
        const client = getUserFromCert( req.queryParams.client );

        // TODO Check permissions

        var result;
        var alias_id = getAliasID( req.queryParams.id, client );

        if ( alias_id ) {
            result = db._query("for v in 1..1 inbound @alias_id alias filter is_same_collection('coll', v) return v", { alias_id: alias_id });
        } else {
            result = db.coll.document({ _key: req.queryParams.id });
        }

        res.send( result );
    } catch( e ) {
        handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client certificate subject string")
.queryParam('id', joi.string().required(), "Collection ID or alias")
.summary('Get a data collection by ID or alias')
.description('Get a data collection by ID or alias');


router.get('/collection/read', function (req, res) {
    try {
        const client = getUserFromCert( req.queryParams.client );

        var result;
        var alias_id = getAliasID( req.queryParams.id, client );
        if ( alias_id ) {
            var alias = db.alias.firstExample({ _to: alias_id });
            if ( !alias )
                throw ERR_ALIAS_NOT_FOUND;
            result = db._query("for v in 1..1 outbound @coll item return v", { coll: alias._to });
            //result = db._query("for v in 1..1 inbound @alias_id alias filter is_same_collection('coll', v) for v2 in 1..1 outbound v item return v2", { alias_id: alias_id });
        } else {
            result = db._query( "for v in 1..1 outbound @coll_id item return v", { coll_id: "coll/" + req.queryParams.id } );
        }

        res.send( result );
    } catch( e ) {
        handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client certificate subject string")
.queryParam('id', joi.string().required(), "Collection ID or alias to list")
.summary('List content of a collection')
.description('List content of a collection');

/*
router.post('/collection/data/add', function (req, res) {
    try {
        db._executeTransaction({
            collections: {
                read: ["user","cert","data","coll"],
                write: ["item"]
            },
            action: function ( params ) {
                const db = require("@arangodb").db;

                const client = getUserFromCert( params[0] );
                var coll_id;
                var data_id;
                var alias = checkAlias( params[1], client );

                if ( alias ) {
                    coll_id = db.coll.firstExample({ alias: alias })._id;
                } else
                    coll_id = "coll/" + params[1];

                alias = checkAlias( params[2], client );
                if ( alias ) {
                    data_id = db.data.firstExample({ alias: alias })._id;
                } else
                    data_id = "data/" + params[2];

                if ( db.item.firstExample({ _from: coll_id, _to: data_id }) == null )
                    db.item.save({ _from: coll_id, _to: data_id });
                else
                    throw ERR_ITEM_ALREADY_LINKED;
            },
            params: [ req.queryParams.client, req.queryParams.coll_id, req.queryParams.data_id ]
        });
    } catch( e ) {
        handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client certificate subject string")
.queryParam('coll_id', joi.string().required(), "Collection ID or alias")
.queryParam('data_id', joi.string().required(), "Data ID or alias")
.summary('Add data to collection')
.description('Add data to collection by id or alias (must specify ID OR alias for collection and data)');


router.post('/collection/data/remove', function (req, res) {
    try {
        db._executeTransaction({
            collections: {
                read: ["user","cert","data","coll"],
                write: ["item"]
            },
            action: function ( params ) {
                const db = require("@arangodb").db;

                const client = getUserFromCert( params[0] );
                var coll_id;
                var data_id;

                if ( params[1] )
                    coll_id = "coll/" + params[1];
                else if ( params[2] ) {
                    var coll = null;
                    if ( params[2].indexOf( "." ) > -1 )
                        coll = db.coll.firstExample({ alias: params[2] });
                    else
                        coll = db.coll.firstExample({ alias: client._key + "." + params[2] });
                    if ( coll )
                        coll_id = coll._id;
                    else
                        throw -3;
                } else
                    throw -2;

                if ( params[3] )
                    data_id = "data/" + params[3];
                else if ( params[4] ) {
                    var data = null;
                    if ( params[4].indexOf( "." ) > -1 )
                        data = db.data.firstExample({ alias: params[4] });
                    else
                        data = db.data.firstExample({ alias: client._key + "." + params[4] });
                    if ( data )
                        data_id = data._id;
                    else
                        throw -5;
                } else
                    throw -4;

                if ( db.item.firstExample({ _from: coll_id, _to: data_id }) == null )
                    throw -6;
                else
                    db.item.removeByExample({ _from: coll_id, _to: data_id });
            },
            params: [ req.queryParams.client, req.queryParams.coll_id, req.queryParams.coll_alias, req.queryParams.data_id, req.queryParams.data_alias ]
        });
    } catch( e ) {
        handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client certificate subject string")
.queryParam('coll_id', joi.string().optional(), "Collection ID")
.queryParam('coll_alias', joi.string().optional(), "Collection alias")
.queryParam('data_id', joi.string().optional(), "Data ID")
.queryParam('data_alias', joi.string().optional(), "Data alias")
.summary('Add data to collection')
.description('Add data to collection by id or alias (must specify ID OR alias for collection and data)');
*/


//----- GET PERMISSION BY DATA ID

router.get('/check_perm/data/by_id', function (req, res) {
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


