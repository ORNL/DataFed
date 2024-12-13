'use strict';

const createRouter = require('@arangodb/foxx/router');
const router = createRouter();
const joi = require('joi');
const g_db = require('@arangodb').db;
const g_lib = require('./support');
const pathModule = require('./posix_path'); // Replace with the actual file name
const dataModule = require('./data'); // Replace with the actual file name
const authzModule = require('./authz'); // Replace with the actual file name

module.exports = router;


router.get('/gridftp', function(req, res) {
        try {
            console.log("/gridftp start authz client", req.queryParams.client, "repo", req.queryParams.repo, "file", req.queryParams.file, "act", req.queryParams.act);

						// Client will contain the following information
						// {
						//   "_key" : "bob",
						//   "_id" : "u/bob",
						//   "name" : "bob junior ",
						//   "name_first" : "bob",
						//   "name_last" : "jones",
						//   "is_admin" : true,
						//   "max_coll" : 50,
						//   "max_proj" : 10,
						//   "max_sav_qry" : 20,
						//   :
						//   "email" : "bobjones@gmail.com"
						// } 
            const client = g_lib.getUserFromClientID_noexcept(req.queryParams.client);

            const path_components = pathModule.splitPOSIXPath(req.queryParams.file);
            const data_key = path_components.at(-1);
            var record = Record(data_key);
						// Will split a posix path into an array
            // E.g. 
            // req.queryParams.file = "/usr/local/bin"
            // const path_components = pathModule.splitPOSIXPath(req.queryParams.file);
            //
            // Path components will be
            // ["usr", "local", "bin"]

            // Special case - allow unknown client to read a publicly accessible record
            // if record exists and if it is a public record
            if (!client) {
                if( record.exists() ) {
                  if (req.queryParams.act != "read" || !g_lib.hasPublicRead(data_id)) {
                      console.log("AUTHZ act: " + req.queryParams.act + " client: " + client._id  + " path " + req.queryParams.file + " FAILED");
                      throw g_lib.ERR_PERM_DENIED;
                  }
                }
            } else {

                // Actions: read, write, create, delete, chdir, lookup
                var req_perm = 0;
                switch (req.queryParams.act) {
                    case "read":
                        req_perm = g_lib.PERM_RD_DATA;
                        break;
                    case "write":
                        break;
                    case "create":
                        req_perm = g_lib.PERM_WR_DATA;
                        break;
                    case "delete":
                        throw g_lib.ERR_PERM_DENIED;
                    case "chdir":
                        break;
                    case "lookup":
                        // For TESTING, allow these actions
                        return;
                    default:
                        throw [g_lib.ERR_INVALID_PARAM, "Invalid gridFTP action: ", req.queryParams.act];
                }


                  // This will tell us if the action on the record is authorized
                  // we still do not know if the path is correct.
									if( record.exists() ) {
										if( authzModule.isRecordActionAuthorized(client, data_key, req_perm) ){
                      console.log("AUTHZ act: " + req.queryParams.act + " client: " + client._id  + " path " + req.queryParams.file + " FAILED");
											throw g_lib.ERR_PERM_DENIED;
										}
									}
            }

            if( record.exists() ) {
              if( !record.isPathConsistent(req.queryParams.file) ) {
                console.log("AUTHZ act: " + req.queryParams.act + " client: " + client._id  + " path " + req.queryParams.file + " FAILED");
                throw [record.error(), record.errorMessage()]
              }
            } else {
              // If the record does not exist then the path would noe be consistent.
              console.log("AUTHZ act: " + req.queryParams.act + " client: " + client._id  + " path " + req.queryParams.file + " FAILED");
							throw [g_lib.ERR_PERM_DENIED, "Invalid record specified: " + req.queryParams.file];
            }
            console.log("AUTHZ act: " + req.queryParams.act + " client: " + client._id  + " path " + req.queryParams.file + " SUCCESS");

        } catch (e) {
            g_lib.handleException(e, res);
        }
    })
    .queryParam('client', joi.string().required(), "Client ID")
    .queryParam('repo', joi.string().required(), "Originating repo ID, where the DataFed managed GridFTP server is running.")
    .queryParam('file', joi.string().required(), "Data file name")
    .queryParam('act', joi.string().required(), "GridFTP action: 'lookup', 'chdir', 'read', 'write', 'create', 'delete'")
    .summary('Checks authorization')
    .description('Checks authorization');


router.get('/perm/check', function(req, res) {
        try {
            const client = g_lib.getUserFromClientID(req.queryParams.client);
            var perms = req.queryParams.perms ? req.queryParams.perms : g_lib.PERM_ALL;
            var obj, result = true,
                id = g_lib.resolveID(req.queryParams.id, client),
                ty = id[0];

            if (id[1] != "/") {
                throw [g_lib.ERR_INVALID_PARAM, "Invalid ID, " + req.queryParams.id];
            }

            if (ty == "p") {
                var role = g_lib.getProjectRole(client._id, id);
                if (role == g_lib.PROJ_NO_ROLE) { // Non members have only VIEW permissions
                    if (perms != g_lib.PERM_RD_REC)
                        result = false;
                } else if (role == g_lib.PROJ_MEMBER) { // Non members have only VIEW permissions
                    if ((perms & ~g_lib.PERM_MEMBER) != 0)
                        result = false;
                } else if (role == g_lib.PROJ_MANAGER) { // Managers have all but UPDATE
                    if ((perms & ~g_lib.PERM_MANAGER) != 0)
                        result = false;
                }
            } else if (ty == "d") {
                if (!g_lib.hasAdminPermObject(client, id)) {
                    obj = g_db.d.document(id);
                    if (obj.locked)
                        result = false;
                    else
                        result = g_lib.hasPermissions(client, obj, perms);
                }
            } else if (ty == "c") {
                // If create perm is requested, ensure owner of collection has at least one allocation
                if (perms & g_lib.PERM_CREATE) {
                    var owner = g_db.owner.firstExample({
                        _from: id
                    });
                    if (!g_db.alloc.firstExample({
                            _from: owner._to
                        })) {
                        throw [g_lib.ERR_NO_ALLOCATION, "An allocation is required to create a collection."];
                    }
                }

                if (!g_lib.hasAdminPermObject(client, id)) {
                    obj = g_db.c.document(id);
                    result = g_lib.hasPermissions(client, obj, perms);
                }
            } else {
                throw [g_lib.ERR_INVALID_PARAM, "Invalid ID, " + req.queryParams.id];
            }

            res.send({
                granted: result
            });
        } catch (e) {
            g_lib.handleException(e, res);
        }
    })
    .queryParam('client', joi.string().required(), "Client ID")
    .queryParam('id', joi.string().required(), "Object ID or alias")
    .queryParam('perms', joi.number().required(), "Permission bit mask to check")
    .summary('Checks client permissions for object')
    .description('Checks client permissions for object (projects, data, collections');

router.get('/perm/get', function(req, res) {
        try {
            const client = g_lib.getUserFromClientID(req.queryParams.client);
            var result = req.queryParams.perms ? req.queryParams.perms : g_lib.PERM_ALL;
            var obj, id = g_lib.resolveID(req.queryParams.id, client),
                ty = id[0];

            if (id[1] != "/")
                throw [g_lib.ERR_INVALID_PARAM, "Invalid ID, " + req.queryParams.id];

            if (ty == "p") {
                var role = g_lib.getProjectRole(client._id, id);
                if (role == g_lib.PROJ_NO_ROLE) { // Non members have only VIEW permissions
                    result &= g_lib.PERM_RD_REC;
                } else if (role == g_lib.PROJ_MEMBER) {
                    result &= g_lib.PERM_MEMBER;
                } else if (role == g_lib.PROJ_MANAGER) { // Managers have all but UPDATE
                    result &= g_lib.PERM_MANAGER;
                }
            } else if (ty == "d") {
                if (!g_lib.hasAdminPermObject(client, id)) {
                    obj = g_db.d.document(id);
                    if (obj.locked)
                        result = 0;
                    else
                        result = g_lib.getPermissions(client, obj, result);
                }
            } else if (ty == "c") {
                if (!g_lib.hasAdminPermObject(client, id)) {
                    obj = g_db.c.document(id);
                    result = g_lib.getPermissions(client, obj, result);
                }
            } else
                throw [g_lib.ERR_INVALID_PARAM, "Invalid ID, " + req.queryParams.id];

            res.send({
                granted: result
            });
        } catch (e) {
            g_lib.handleException(e, res);
        }
    })
    .queryParam('client', joi.string().required(), "Client ID")
    .queryParam('id', joi.string().required(), "Object ID or alias")
    .queryParam('perms', joi.number().optional(), "Permission bit mask to get (default = all)")
    .summary('Gets client permissions for object')
    .description('Gets client permissions for object (projects, data, collections. Note this is potentially slower than using "check" method.');
