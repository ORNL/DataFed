'use strict';

const   createRouter = require('@arangodb/foxx/router');
const   router = createRouter();
const   joi = require('joi');

const   g_db = require('@arangodb').db;
const   g_lib = require('./support');

module.exports = router;


//==================== ACL API FUNCTIONS

router.post('/create', function (req, res) {
    try {
        g_db._executeTransaction({
            collections: {
                read: ["u","uuid","accn","d","c"],
                write: ["n","note"]
            },
            action: function() {
                const client = g_lib.getUserFromClientID( req.queryParams.client );
                var id = g_lib.resolveDataCollID( req.queryParams.id, client );
        
                if ( !g_lib.hasAdminPermObject( client, id )) {
                    var doc = g_db._document( id );
                    if (( g_lib.getPermissions( client, doc, g_lib.PERM_RD_REC ) & g_lib.PERM_RD_REC ) == 0 ){
                        throw g_lib.ERR_PERM_DENIED;
                    }
                    if ( req.queryParams.activate ){
                        throw [g_lib.ERR_PERM_DENIED,"Only owner or admin may create a new annotaion in active state."];
                    }
                }

                var time = Math.floor( Date.now()/1000 );
                var obj = { state: req.queryParams.activate?g_lib.NOTE_ACTIVE:g_lib.NOTE_OPEN, ct: time, ut: time, creator: client._id };
            
                g_lib.procInputParam( req.queryParams, "title", false, obj );
                g_lib.procInputParam( req.queryParams, "desc", false, obj );
                obj.comments = [{ user: client._id, action: obj.state, time:time, comment: obj.desc }];
                delete obj.desc;
            
                var note = g_db.n.save( obj, { returnNew: true });
                g_db.note.save({ _from: id, _to: note._id });

                note.id = note.new._id;
                delete note.new._id;
                delete note.new._key;
                delete note.new._rev;

                res.send( [note.new] );
            }
        });
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client UID")
.queryParam('id', joi.string().required(), "ID or alias of data record or collection")
.queryParam('type', joi.number().min(0).max(3).required(), "Type of annotation (see SDMS.proto for NOTE_TYPE enum)")
.queryParam('title', joi.string().required(), "Title of annotaion")
.queryParam('desc', joi.string().required(), "Description / comments")
.queryParam('activate', joi.boolean().optional(), "Make new annotation active on create")
.summary('Create an annotation on an object')
.description('Create an annotation on an object');


router.post('/update', function (req, res) {
    try {
        g_db._executeTransaction({
            collections: {
                read: ["u","uuid","accn"],
                write: ["n","note"]
            },
            action: function() {
                const client = g_lib.getUserFromClientID( req.queryParams.client );

                if ( !req.queryParams.id.startsWith( "n/" ))
                    throw [g_lib.ERR_INVALID_PARAM,"Invalid annotaion ID '" + req.queryParams.id + "'"];

                if ( !g_db._exists( req.queryParams.id ))
                    throw [g_lib.ERR_INVALID_PARAM,"Annotaion ID '" + req.queryParams.id + "' does not exist."];

                var note = g_db.n.document( req.queryParams.id );

                // Action requirements:
                // None (comment) - If open: only note creator or subject admin, if active: anyone with read access to subject
                // Open (must not be open) - Must be note creator or subject admin
                // Close (must not be closed) - Must be note creator or subject admin
                // Activate (must not be active) - Must be subject admin

                if ( req.queryParams.action === note.state ){
                    throw [g_lib.ERR_INVALID_PARAM,"Invalid annotaion action."];
                }

                if ( client._id != note.creator ){
                    if ( req.queryParams.action === g_lib.NOTE_ACTIVE )
                        throw [g_lib.ERR_PERM_DENIED,"Insufficient permissions to activate annotaion."];

                    var ne = g_db.note.firstExample({ _to: note._id });
                    if ( !g_lib.hasAdminPermObject( client, ne._from )) {
                        if ( req.queryParams.action === undefined && note.state == g_lib.NOTE_ACTIVE ){
                            // Anyone with read permission to subject doc can comment on active notes
                            var doc = g_db._document( ne._from );
                            if (( g_lib.getPermissions( client, doc, g_lib.PERM_RD_REC ) & g_lib.PERM_RD_REC ) == 0 ){
                                throw g_lib.ERR_PERM_DENIED;
                            }
                        }else{
                            throw [g_lib.ERR_PERM_DENIED,"Insufficient permissions to update annotaion."];
                        }
                    }
                }

                var time = Math.floor( Date.now()/1000 );
                var obj = { ut: time, comments: note.comments };

                if ( req.queryParams.action !== undefined )
                    obj.state = req.queryParams.action;

                g_lib.procInputParam( req.queryParams, "desc", false, obj );
                obj.comments.push({ user: client._id, action: req.queryParams.action!==undefined?req.queryParams.action:null, time:time, comment: obj.desc });
                delete obj.desc;

                note = g_db.n.update( note._id, obj, { returnNew: true } );

                note.id = note.new._id;
                delete note.new._id;
                delete note.new._key;
                delete note.new._rev;

                res.send( [note.new] );
            }
        });
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client UID")
.queryParam('id', joi.string().required(), "ID of annotation")
.queryParam('desc', joi.string().required(), "Description / comments")
.queryParam('action', joi.number().min(0).max(2).optional(), "Action (new state), omit for comment")
.summary('Close an annotation')
.description('Close an annotation');




