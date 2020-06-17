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
                write: ["d","n","note"]
            },
            action: function() {
                const client = g_lib.getUserFromClientID( req.queryParams.client );
                var id = g_lib.resolveDataCollID( req.queryParams.subject, client ),
                    doc = g_db._document( id );
        
                if ( !g_lib.hasAdminPermObject( client, id )) {
                    if (( g_lib.getPermissions( client, doc, g_lib.PERM_RD_REC ) & g_lib.PERM_RD_REC ) == 0 ){
                        throw g_lib.ERR_PERM_DENIED;
                    }
                    if ( req.queryParams.activate ){
                        throw [g_lib.ERR_PERM_DENIED,"Only owner or admin may create a new annotaion in active state."];
                    }
                }

                var time = Math.floor( Date.now()/1000 );
                var obj = { state: req.queryParams.activate?g_lib.NOTE_ACTIVE:g_lib.NOTE_OPEN, type: req.queryParams.type,
                    subject: id, ct: time, ut: time, creator: client._id },
                    updates = {};
            
                g_lib.procInputParam( req.queryParams, "title", false, obj );
                obj.comments = [{ user: client._id, action: obj.state, time:time }];
                g_lib.procInputParam( req.queryParams, "comment", false, obj.comments[0] );
            
                var note = g_db.n.save( obj, { returnNew: true });
                g_db.note.save({ _from: id, _to: note._id });

                // Update notes bits on associated doc
                g_lib.updateAnnotationField( doc );

                // Further process activated errors on data records (set loc_err, propagate downstream)
                if ( req.queryParams.type == g_lib.NOTE_ERROR && req.queryParams.activate && doc._id.startsWith( "d/" )){
                    if ( !doc.loc_err ){
                        // local err state has chnaged, update record
                        g_db.d.update( doc._id, { loc_err: true });
                    }

                    if ( !doc.inh_err && !doc.loc_err ){
                        // Combined inh & loc err state has changed, recalc inh_err for dependent records
                        g_lib.recalcInhErrorDeps( doc._id, true, updates );
                    }
                }
        
                res.send({ results: [note.new], updates: Array.from( updates )});
            }
        });
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client UID")
.queryParam('subject', joi.string().required(), "ID or alias of data record or collection")
.queryParam('type', joi.number().min(0).max(3).required(), "Type of annotation (see SDMS.proto for NOTE_TYPE enum)")
.queryParam('title', joi.string().required(), "Title of annotaion")
.queryParam('comment', joi.string().required(), "Comments")
.queryParam('activate', joi.boolean().optional(), "Make new annotation active on create")
.summary('Create an annotation on an object')
.description('Create an annotation on an object');


router.post('/update', function (req, res) {
    try {
        g_db._executeTransaction({
            collections: {
                read: ["u","uuid","accn"],
                write: ["d","n","note"]
            },
            action: function() {
                const client = g_lib.getUserFromClientID( req.queryParams.client );

                if ( !req.queryParams.id.startsWith( "n/" ))
                    throw [g_lib.ERR_INVALID_PARAM,"Invalid annotaion ID '" + req.queryParams.id + "'"];

                if ( !g_db._exists( req.queryParams.id ))
                    throw [g_lib.ERR_INVALID_PARAM,"Annotaion ID '" + req.queryParams.id + "' does not exist."];

                var note = g_db.n.document( req.queryParams.id ),
                    ne = g_db.note.firstExample({ _to: note._id }),
                    old_state = note.state,
                    doc = g_db._document( ne._from ),
                    updates = {};

                // new_state requirements:
                // None (comment) - If open: only note creator or subject admin, if active: anyone with read access to subject
                // Open (must not be open) - Must be note creator or subject admin
                // Close (must not be closed) - Must be note creator or subject admin
                // Activate (must not be active) - Must be subject admin

                if ( req.queryParams.new_state === note.state ){
                    throw [g_lib.ERR_INVALID_PARAM,"Invalid new state for annotaion."];
                }

                if ( client._id != note.creator ){
                    if ( req.queryParams.new_state === g_lib.NOTE_ACTIVE )
                        throw [g_lib.ERR_PERM_DENIED,"Insufficient permissions to activate annotaion."];

                    if ( !g_lib.hasAdminPermObject( client, ne._from )) {
                        if ( req.queryParams.new_state === undefined && note.state == g_lib.NOTE_ACTIVE ){
                            // Anyone with read permission to subject doc can comment on active notes
                            if (( g_lib.getPermissions( client, doc, g_lib.PERM_RD_REC ) & g_lib.PERM_RD_REC ) == 0 ){
                                throw g_lib.ERR_PERM_DENIED;
                            }
                        }else{
                            throw [g_lib.ERR_PERM_DENIED,"Insufficient permissions to update annotaion."];
                        }
                    }
                }

                var time = Math.floor( Date.now()/1000 ),
                    obj = { ut: time, comments: note.comments },
                    comment = { user: client._id, time:time };

                if ( req.queryParams.new_state !== undefined ){
                    obj.state = req.queryParams.new_state;
                    comment.action = req.queryParams.new_state;
                }

                g_lib.procInputParam( req.queryParams, "comment", false, comment );

                obj.comments.push(comment);

                note = g_db.n.update( note._id, obj, { returnNew: true } ).new;

                // Further process activated errors on data records (set loc_err, propagate downstream)
                console.log("check for error upd/prop",note,doc._id.startsWith( "d/" ));
                if (( note.type == g_lib.NOTE_ERROR ) && doc._id.startsWith( "d/" )){
                    console.log("is an error on data",old_state,note.state,doc.loc_err,doc.inh_err);
                    var loc_err;
                    if ( old_state == g_lib.NOTE_ACTIVE && note.state != g_lib.NOTE_ACTIVE ){
                        console.log("deactivate err");
                        // Deactived an error, reclac & update loc_err
                        // Any other active errors?
                        var notes = g_db._query("for v in 1..1 outbound @id note filter v.state == 2 && v.type == 3 && v._id != @nid return true",{id:doc._id,nid:note._id});
                        console.log("no loc err, notes next:",notes.hasNext());
                        if ( !notes.hasNext()){
                            // Deactived only active error, update loc_err
                            loc_err = false;
                        }
                    }else if( old_state != g_lib.NOTE_ACTIVE && note.state == g_lib.NOTE_ACTIVE ){
                        if ( !doc.loc_err ){
                            // Actived an error, update loc_err
                            loc_err = true;
                        }
                    }

                    if ( loc_err != undefined ){
                        console.log("upd loc_err:",loc_err);
                        g_db.d.update( doc._id, { loc_err: loc_err });

                        if ( !doc.inh_err ){
                            console.log("recalc inh err");
                            // Combined inh & loc err state has changed, recalc inh_err for dependent records
                            g_lib.recalcInhErrorDeps( doc._id, loc_err, updates );
                        }
                    }
                }

                console.log("updates:",Object.values(updates));
                res.send({ results: [note], updates: Object.values(updates)});
            }
        });
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client UID")
.queryParam('id', joi.string().required(), "ID of annotation")
.queryParam('comment', joi.string().required(), "Comments")
.queryParam('new_state', joi.number().min(0).max(2).optional(), "New state (omit for comment)")
.summary('Update an annotation')
.description('Update an annotation with new comment and optional new state');


router.post('/comment/edit', function (req, res) {
    try {
        g_db._executeTransaction({
            collections: {
                read: ["u","uuid","accn"],
                write: ["n"]
            },
            action: function() {
                const client = g_lib.getUserFromClientID( req.queryParams.client );

                if ( !req.queryParams.id.startsWith( "n/" ))
                    throw [g_lib.ERR_INVALID_PARAM,"Invalid annotaion ID '" + req.queryParams.id + "'"];

                if ( !g_db._exists( req.queryParams.id ))
                    throw [g_lib.ERR_INVALID_PARAM,"Annotaion ID '" + req.queryParams.id + "' does not exist."];

                var note = g_db.n.document( req.queryParams.id );

                if ( req.queryParams.comment_idx >= note.comments.length )
                    throw [g_lib.ERR_INVALID_PARAM,"Comment index out of range."];

                if ( req.queryParams.title && req.queryParams.comment_idx > 0 )
                    throw [g_lib.ERR_INVALID_PARAM,"Title can only be changed with first comment."];

                var obj = { ut: Math.floor( Date.now()/1000 ) }, comment = note.comments[req.queryParams.comment_idx];

                if ( client._id != comment.user ){
                    throw [g_lib.ERR_PERM_DENIED,"Only original commentor may edit comments."];
                }

                if ( req.queryParams.comment != comment.comment ){
                    g_lib.procInputParam( req.queryParams, "comment", false, comment );
                    obj.comments = note.comments;
                }

                if ( req.queryParams.title && req.queryParams.title != note.title ){
                    g_lib.procInputParam( req.queryParams, "title", false, obj );
                }

                note = g_db.n.update( note._id, obj, { returnNew: true } );

                res.send({ results: [note.new] });
            }
        });
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client UID")
.queryParam('id', joi.string().required(), "ID of annotation")
.queryParam('comment', joi.string().required(), "New description / comments")
.queryParam('comment_idx', joi.number().min(0).required(), "Comment index number to edit")
.queryParam('title', joi.string().optional(), "New title (only valid for comment idx 0)")
.summary('Edit an annotation comment')
.description('Edit a specific comment within an annotation and/or title (replaces existing comment with that provided).');


router.get('/view', function (req, res) {
    try {
        const client = g_lib.getUserFromClientID( req.queryParams.client );

        if ( !req.queryParams.id.startsWith( "n/" ))
            throw [g_lib.ERR_INVALID_PARAM,"Invalid annotaion ID '" + req.queryParams.id + "'"];

        if ( !g_db._exists( req.queryParams.id ))
            throw [g_lib.ERR_INVALID_PARAM,"Annotaion ID '" + req.queryParams.id + "' does not exist."];

        var note = g_db.n.document( req.queryParams.id );

        if ( client._id != note.creator ){
            var ne = g_db.note.firstExample({ _to: note._id });
            if ( !g_lib.hasAdminPermObject( client, ne._from )) {
                if ( note.state == g_lib.NOTE_ACTIVE ){
                    // Anyone with read permission to subject doc can comment on active notes
                    var doc = g_db._document( ne._from );
                    if (( g_lib.getPermissions( client, doc, g_lib.PERM_RD_REC ) & g_lib.PERM_RD_REC ) == 0 ){
                        throw g_lib.ERR_PERM_DENIED;
                    }
                }else{
                    throw g_lib.ERR_PERM_DENIED;
                }
            }
        }

        res.send({ results: [note] });
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client UID")
.queryParam('id', joi.string().required(), "ID of annotation")
.summary('View annotation')
.description('View annotation');


router.get('/list/by_subject', function (req, res) {
    try {
        const client = g_lib.getUserFromClientID( req.queryParams.client );
        var results, qry, id = g_lib.resolveDataCollID( req.queryParams.subject, client );

        if ( g_lib.hasAdminPermObject( client, id )) {
            qry = "for v in 1..1 outbound @subj note sort v.ut desc return {_id:v._id,state:v.state,type:v.type,subject:v.subject,title:v.title,creator:v.creator,ct:v.ct,ut:v.ut}";
            results = g_db._query( qry, { subj: id });
        }else{
            qry = "for v in 1..1 outbound @subj note filter v.state == 2 || v.creator == @client sort v.ut desc return {_id:v._id,state:v.state,type:v.type,subject:v.subject,title:v.title,creator:v.creator,ct:v.ct,ut:v.ut}";
            results = g_db._query( qry, { subj: id, client: client._id });
        }

        res.send({ results: results.toArray() });
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client UID")
.queryParam('subject', joi.string().required(), "ID/alias of subject")
.summary('List annotations by subject')
.description('List annotations attached to subject data record or colelction');


router.get('/purge', function (req, res) {
    try {
        g_db._executeTransaction({
            collections: {
                read: ["u","uuid","accn"],
                write: ["n","note"]
            },
            action: function() {
                console.log("note purge, age:", req.queryParams.age_sec );

                var t = (Date.now()/1000) - req.queryParams.age_sec;
                var id, notes = g_db._query( "for i in n filter i.state == " + g_lib.NOTE_CLOSED + " && i.ut < " + t + " return i._id" );
                while ( notes.hasNext() ){
                    id = notes.next();
                    console.log("purging",id);
                    g_lib.graph.n.remove(id);
                }
            }
        });
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('age_sec', joi.number().integer().min(0).required(), "Purge age (seconds)")
.summary('Purge old closed annotations')
.description('Purge old closed annotations');
