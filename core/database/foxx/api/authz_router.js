'use strict';

const createRouter = require('@arangodb/foxx/router');
const router = createRouter();
const joi = require('joi');
const g_db = require('@arangodb').db;
const g_lib = require('./support');

module.exports = router;

function getFoldersFromPath(path) {
    // Split the path into components
    const parts = path.split('/').filter(Boolean); // Remove empty elements caused by leading/trailing slashes

    // Get the first folder from the end
    const lastFolder = parts[parts.length - 1];

    // Get the second folder from the end
    const secondLastFolder = parts[parts.length - 2];

    return [lastFolder, secondLastFolder];
}


router.get('/gridftp', function(req, res) {
        try {
            console.log("/gridftp start authz client", req.queryParams.client, "repo", req.queryParams.repo, "file", req.queryParams.file, "act", req.queryParams.act);

            const client = g_lib.getUserFromClientID_noexcept(req.queryParams.client);
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

            var idx = req.queryParams.file.lastIndexOf("/");
            var data_key = req.queryParams.file.substr(idx + 1);
            var data_id = "d/" + data_key;

            // Special case - allow unknown client to read a publicly accessible record
            if (!client) {
                if (req.queryParams.act != "read" || !g_lib.hasPublicRead(data_id)) {
                    console.log("Permission to read denied!");
                    throw g_lib.ERR_PERM_DENIED;
                }
                console.log("allow anon read of public record");
            } else {
                console.log("client:", client);

                // Actions: read, write, create, delete, chdir, lookup
                var req_perm = 0;
                switch (req.queryParams.act) {
                    case "read":
                        console.log("Client: ", client, " read permissions?");
                        req_perm = g_lib.PERM_RD_DATA;
                        break;
                    case "write":
                        console.log("Client: ", client, " write permissions?");
                        break;
                    case "create":
                        console.log("Client: ", client, " create permissions?");
                        req_perm = g_lib.PERM_WR_DATA;
                        break;
                    case "delete":
                        console.log("Client: ", client, " delete permissions?");
                        throw g_lib.ERR_PERM_DENIED;
                    case "chdir":
                        console.log("Client: ", client, " chdir permissions?");
                        break;
                    case "lookup":
                        console.log("Client: ", client, " lookup permissions?");
                        break;

                }

                if(req.queryParams.act == "lookup" || req.queryParams.act == "create"){

                                        // For TESTING, allow these actions
                    //
                        // We need to determine if project or user
                        // if user project
                        //
                      var path = req.queryParams.file;

                      // If path is missing the starting "/" add it back in
                      if (!path.startsWith("/") && alloc.path.startsWith("/") ) {
                        path = "/" + path;
                      }
                      // Path will have the following form
                      // GridFTP authz library will have removed the base of
                      // the collection
                      // /datafed-home/project/2024_transformer_vae_results_overflow/8524343
                      // 
                      // path should have the following forms to be supported 
                      // Other paths may be provided but we are only interested
                      // in supporting the following two everything else should
                      // be denied
                      // 
                      // <possibly_other_path>/<repo_name>/project/<project_name>/
                      // <possibly_other_path>/<repo_name>/user/<user_name>/
                      //
                      //
                      const dirs = getFoldersFromPath(path);


                      var project_or_user = null;
                      var u_or_p_name = null;
                      if( dirs[0] == "project" || dirs[0] == "user") {
                        // just because it is the project and or user path
                        // doesn't mean you should be able to see it you 
                        // must have an allocation on the repo
                        project_or_user = dirs[0];
                      } else if ( dirs[1] == "project" || dirs[1] == "user" ) {
                        project_or_user = dirs[1];
                        u_or_p_name = dirs[0];
                      }

                      console.log("u_or_p_name");
                      console.log(u_or_p_name);
                      console.log("project_or_user");
                      console.log(project_or_user);

                      // Only check this if it is defined
                      if( project_or_user ) {
                        if( project_or_user == "project" ) {
                          // how do we tie a user to a project through an allocation
                          //
                          // alloc requires client to start with u/
                          var temp_alloc = g_db.alloc.firstExample({
                            _from: client._id,
                            _to: req.queryParams.repo
                          });
                          console.log("Alloc object ");
                          console.log(temp_alloc);

                          if (!temp_alloc) {
                              throw [g_lib.ERR_NO_ALLOCATION, "No allocation on repo " + req.queryParams.repo];
                          }

                          // Ok but what about the individual project id
                          if( u_or_p_name ) {
                            // Only do this if not null
                            if ( g_lib.getProjectRole( client._id, u_or_p_name ) != g_lib.PROJ_NO_ROLE ){
                              return;
                            }
                          }
                          console.log("Role returned as PROJ_NO_ROLE for client ");


                          console.log(client._id);
                          console.log("and project name");
                          console.log(u_or_p_name);
                          throw [g_lib.ERR_NO_ALLOCATION, "No allocation on repo " + req.queryParams.repo];

                        } else if( project_or_user == "user" ) {
                          if ( client._key == u_or_p_name ) {
                            // If the user is equal to the client than authorization
                            // is approved
                            return; 
                          }

                        }
                      }

                      var repo = g_db._document(req.queryParams.repo);
                      console.log("repo ");
                      console.log(repo);

                    // {
                    //   "_key" : "datafed-folder",
                    //   "_id" : "repo/datafed-folder",
                    //   "_rev" : "_izwBzb----",
                    //   "capacity" : 4345350,
                    //   "pub_key" : "<repo rsa public key>",
                    //   "address" : "tcp://<repo domain>:<repo port>",
                    //   "endpoint" : "XXXXYYYY-XXXX-YYYY-XXXX-YYYYXXXXYYYY",
                    //   "path" : "<path from root of guest collection to folder>",
                    //   "title" : "<title>",
                    //   "desc" : "<description>",
                    //   "domain" : "",
                    //   "exp_path" : "/"
                    // }
                    //
                    // Example of repo.path
                    //
                    // "/datafed/datafedci-home/"
                    //
                    // Example of path might be
                    //
                    // "/datafed/datafedci-home"
                    // "/datafed"
                    // 
                      var repo_base_path = repo.path;
                      if (!repo_base_path.startsWith("/") && path.startsWith("/") ) {
                        repo_base_path = "/" + repo_base_path;
                      }
                     
                      console.log("Checking that repo base path ", repo_base_path, " starts with ", path );
                      // Ok but how do we know that user has access to the 
                      // repo, still shouldn't be able to see things unless
                      // they actually access to the repo.
                      if ( repo_base_path.startsWith(path) || path.startsWith(repo_base_path) ) {

                        console.log("Checking if client has allocation on repo");
                        var new_alloc = g_db.alloc.firstExample({
                            _from: client._id,
                            _to: repo._id
                        });
                        console.log("alloc");
                        console.log(new_alloc);
                        if (new_alloc) {
                          return;
                        }
                      }

                      throw g_lib.ERR_PERM_DENIED;
                    default:
                        throw [g_lib.ERR_INVALID_PARAM, "Invalid gridFTP action: ", req.queryParams.act];

                console.log("client: ", client, " data_id: ", data_id);
                if (!g_lib.hasAdminPermObject(client, data_id)) {
                    var data = g_db.d.document(data_id);
                    if (!g_lib.hasPermissions(client, data, req_perm)) {
                        console.log("Client: ", client, " does not have permission!");
                        throw g_lib.ERR_PERM_DENIED;
                    }
                }
            }



            // Verify repo and path are correct for record
            // Note: only managed records have an allocations and this gridftp auth call is only made for managed records
            //var path = req.queryParams.file.substr( req.queryParams.file.indexOf("/",8));
            var path = req.queryParams.file;
            console.log("data_id is, ", data_id);
            var loc = g_db.loc.firstExample({
                _from: data_id
            });
            console.log("Loc is:")
            console.log(loc)
            if (!loc) {
                console.log("Permission denied data is not managed by DataFed. This can happen if you try to do a transfer directly from Globus.")
                throw g_lib.ERR_PERM_DENIED;
            }
            var alloc = g_db.alloc.firstExample({
                _from: loc.uid,
                _to: loc._to
            });
            console.log("path:", path, " alloc path:", alloc.path + data_key, " loc: ", loc);
            if (!alloc) {
                throw g_lib.ERR_PERM_DENIED;
            }

            // If path is missing the starting "/" add it back in
            if (!path.startsWith("/") && alloc.path.startsWith("/") ) {
               path = "/" + path;
            }

            console.log("path:", path, " alloc path:", alloc.path + data_key, " loc: ", loc);
            if (alloc.path + data_key != path) {
                // This may be due to an alloc/owner change
                // Allow If new path matches
                console.log("authz loc info:", loc);

                if (!loc.new_repo) {
                    console.log("Throw a permission denied error");
                    throw g_lib.ERR_PERM_DENIED;
                }

                console.log("Creating alloc");
                alloc = g_db.alloc.firstExample({
                    _from: loc.new_owner ? loc.new_owner : loc.uid,
                    _to: loc.new_repo
                });


                console.log("alloc is ");
                console.log(alloc);
                if (!alloc || (alloc.path + data_key != path)) {
                    throw [g_lib.ERR_PERM_DENIED, "Permission denied, DataFed registered path is '" + alloc.path + data_key + "' Globus path is '" + path + "'"]
                }
            }

        } catch (e) {
            g_lib.handleException(e, res);
        }
    })
    .queryParam('client', joi.string().required(), "Client ID")
    .queryParam('repo', joi.string().required(), "Originating repo ID")
    .queryParam('file', joi.string().required(), "Data file name")
    .queryParam('act', joi.string().required(), "Action")
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
