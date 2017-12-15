'use strict';

const   createRouter = require('@arangodb/foxx/router');
const   router = createRouter();
const   joi = require('joi');
const   db = require('@arangodb').db;
const   graph = require('@arangodb/general-graph')._graph('sdmsg');

const PERM_NONE     = 0x01;
const PERM_LIST     = 0x01;
const PERM_CREATE   = 0x02;
const PERM_READ     = 0x04;
const PERM_WRITE    = 0x08;
const PERM_DELETE   = 0x10;
const PERM_ALL      = 0x1F;

module.context.use(router);

function getUserFromCert( a_cert_subject ) {
    console.log("getUserFromCert:", a_cert_subject );
    var query = "for c in cert filter c.subject == @cert_subject for u in inbound c._id ident return u";

    var result = db._query( query, { 'cert_subject': a_cert_subject } ).toArray();
    console.log("res:", result );

    if ( result.length != 1 ) {
        console.log("res len:", result.length );

        throw -1;
    }

    return result[0];
}


//----- GET USER BY CERT ID

router.get('/user/by_cert', function (req, res) {
    var query = "for c in cert filter c.subject == @cert_subject for u in inbound c._id ident return u";

    res.send( db._query( query, { 'cert_subject': req.queryParams.cert_subject } ));
})
.queryParam('cert_subject', joi.string().required(), "Certificate subject string")
.summary('Gets user by a certificate identity')
.description('Gets user by a certificate identity');


router.post('/data/create', function (req, res) {
    try {
        var data;

        db._executeTransaction({
            collections: {
                read: ["user","cert"],
                write: ["data","owner"]
            },
            action: function ( params ) {
                const db = require("@arangodb").db;

                const client = getUserFromCert( params[0] );
                var data = db.data.save({ _key: params[1].toString() }, { returnNew: true });
                db.owner.save({ _from: data._id, _to: client._id });
                params[1] = data;
            },
            params: [ req.queryParams.cert_subject, data ]
        });

        res.send( data );
    } catch( e ) {
        console.log( "exception", e );
        throw e;
    }
})
.queryParam('cert_subject', joi.string().required(), "Certificate subject string")
.summary('Creates a new data record')
.description('Creates a new data record');

router.get('/collection/list', function (req, res) {
    try {
        const client = getUserFromCert( req.queryParams.cert_subject );

        if ( req.queryParams.coll_id ) {
            result = db._query( "for c in collection filter c._id == @coll_id for v in 1..1 outbound item filter IS_SAME_COLLECTION('collection',v) return v", { coll_id: req.queryParams.coll_id } );
        } else {
            result = db._query( "for v in 1..1 inbound @client owner filter IS_SAME_COLLECTION('collection',v) and v.is_root == true return v", { client: client._id } );
        }

        res.send( result );
    } catch( e ) {
        console.log( "exception", e );
        throw e;
    }
})
.queryParam('cert_subject', joi.string().required(), "Certificate subject string")
.queryParam('coll_id', joi.string().optional(), "Base collection ID (default = root)")
.summary('List data collections')
.description('List data collections');


router.post('/collection/create', function (req, res) {
    try {
        var new_coll;

        db._executeTransaction({
            collections: {
                read: ["user","cert"],
                write: ["collection","owner"]
            },
            action: function ( params ) {
                const db = require("@arangodb").db;
                const graph = require('@arangodb/general-graph')._graph('sdmsg');

                const client = getUserFromCert( params[0] );
                var obj = { name: params[1] };
                if ( params[2] )
                    obj.desc = params[2];
                if ( params[3] )
                    obj.def_perm = params[3];
                if ( !params[4] )
                    obj.is_root = true;

                var coll = db.collection.save( obj, { returnNew: true });
                db.owner.save({ _from: coll._id, _to: client._id });

                if ( params[4] ) {
                    // Arango bug requires this
                    if ( !db._exists({ _id: params[4] }) )
                        throw -1;
                    
                    graph.item.save({ _from: params[4], _to: coll._id });
                }

                params[5] = coll;
            },
            params: [ req.queryParams.cert_subject, req.queryParams.name, req.queryParams.desc, req.queryParams.def_perm, req.queryParams.coll_id, new_coll ]
        });

        res.send( new_coll );
    } catch( e ) {
        console.log( "exception", e );
        throw e;
    }
})
.queryParam('cert_subject', joi.string().required(), "Certificate subject string")
.queryParam('name', joi.string().required(), "Name")
.queryParam('desc', joi.string().optional(), "Description")
.queryParam('def_perm', joi.number().integer().optional(), "Default permission mask")
.queryParam('coll_id', joi.string().optional(), "Parent collection ID (default = root)")
.summary('Creates a new data collection')
.description('Creates a new data collection');


router.post('/collection/data/add', function (req, res) {
    try {
        db._executeTransaction({
            collections: {
                read: ["user","cert"],
                write: ["item"]
            },
            action: function ( params ) {
                const db = require("@arangodb").db;

                const client = getUserFromCert( params[0] );
                if ( db.item.firstExample({ _from: params[1], _to: params[2] }) == null )
                    db.item.save({ _from: params[1], _to: params[2] });
            },
            params: [ req.queryParams.cert_subject, req.queryParams.coll_id, req.queryParams.data_id ]
        });
    } catch( e ) {
        console.log( "exception", e );
        throw e;
    }
})
.queryParam('cert_subject', joi.string().required(), "Certificate subject string")
.queryParam('coll_id', joi.string().required(), "Collection ID")
.queryParam('data_id', joi.string().required(), "Data ID")
.summary('Add data to collection')
.description('Add data to collection');


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
        var done = false;
        const client = getUserFromCert( req.queryParams.cert_subject );
        const data_id = req.queryParams.data_id;

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
                var result = db._query( "for v, e, p in 2..2 outbound @data acl, outbound member filter v._id == @client return p.edges[0]", { data: data_id, client: client._id } ).toArray();
                if ( result.length > 0 ) {
                    var perm = 0;
                    for ( var i in result ) {
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
                    for ( c in collections ) {
                        var coll = collections[c];
                        var perm = 0;
                        done = false;

                        var acl = db.acl.firstExample({ _from: coll._id, _to: client._id });
                        if ( acl ) {
                            perm = acl.permission;
                            done = true;
                        } else {
                            // check group-acl(s) on data
                            var result = db._query( "for v, e, p in 2..2 outbound @coll acl, outbound member filter v._id == @client return p.edges[0]", { coll: coll._id, client: client._id }).toArray();
                            if ( result.length > 0 ) {
                                for ( var i in result ) {
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
        console.log( "exception", e );
        valid = false;
    }

    res.send({ "valid" : valid });
})
.queryParam('cert_subject', joi.string().required(), "Certificate subject string")
.queryParam('data_id', joi.string().required(), "Data id")
.queryParam('req_perm', joi.number().integer().required(), "Requested permission mask")
.summary('Checks for data permission by id')
.description('Checks for data permission by id');


