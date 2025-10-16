"use strict";

const error = require("./error_codes");

module.exports = (function () {
    var obj = {};

    obj.db = require("@arangodb").db;

    obj.PERM_RD_REC = 0x0001; // Read record info (description, keywords, details)
    obj.PERM_RD_META = 0x0002; // Read structured metadata
    obj.PERM_RD_DATA = 0x0004; // Read raw data
    obj.PERM_WR_REC = 0x0008; // Write record info (description, keywords, details)
    obj.PERM_WR_META = 0x0010; // Write structured metadata
    obj.PERM_WR_DATA = 0x0020; // Write raw data
    obj.PERM_LIST = 0x0040; // Find record and view ID, alias, title, and owner
    obj.PERM_LINK = 0x0080; // Link/unlink child records (collections only)
    obj.PERM_CREATE = 0x0100; // Create new child records (collections only)
    obj.PERM_DELETE = 0x0200; // Delete record
    obj.PERM_SHARE = 0x0400; // View/set ACLs
    obj.PERM_LOCK = 0x0800; // Lock record
    obj.PERM_LABEL = 0x1000; // Label record
    obj.PERM_TAG = 0x2000; // Tag record
    obj.PERM_ANNOTATE = 0x4000; // Annotate record

    obj.PERM_NONE = 0x0000;
    obj.PERM_RD_ALL = 0x0007; // Read all
    obj.PERM_WR_ALL = 0x0038; // Write all
    obj.PERM_ALL = 0x7fff;
    obj.PERM_MEMBER = 0x0047; // Project record perms
    obj.PERM_MANAGER = 0x0407; // Project record perms
    obj.PERM_PUBLIC = 0x0047;

    obj.hasAdminPermUser = function (a_client, a_user_id) {
        if (a_client._id != a_user_id && !a_client.is_admin) {
            return false;
        } else {
            return true;
        }
    };

    obj.hasAdminPermProj = function (a_client, a_proj_id) {
        if (
            !a_client.is_admin &&
            !obj.db.owner.firstExample({
                _from: a_proj_id,
                _to: a_client._id,
            })
        ) {
            return false;
        } else {
            return true;
        }
    };

    obj.hasManagerPermProj = function (a_client, a_proj_id) {
        if (
            !a_client.is_admin &&
            !obj.db.owner.firstExample({
                _from: a_proj_id,
                _to: a_client._id,
            }) &&
            !obj.db.admin.firstExample({
                _from: a_proj_id,
                _to: a_client._id,
            })
        ) {
            return false;
        } else {
            return true;
        }
    };

    obj.hasAdminPermObjectLoaded = function (a_client, a_object) {
        // TODO Should collection creator have admin rights?
        if (a_object.owner == a_client._id || a_object.creator == a_client._id || a_client.is_admin)
            return true;

        if (a_object.owner.charAt(0) == "p") {
            if (
                obj.db.owner.firstExample({
                    _from: a_object.owner,
                    _to: a_client._id,
                })
            )
                return true;

            if (
                obj.db.admin.firstExample({
                    _from: a_object.owner,
                    _to: a_client._id,
                })
            )
                return true;
        }

        return false;
    };

    /**
     * checks to make sure the client has admin permissions on an object
     *
     * @param {object} a_client - this is a user document i.e.
     *
     *
     * "_key" : "bob",
     * "_id" : "u/bob",
     * "name" : "bob junior ",
     * "name_first" : "bob",
     * "name_last" : "jones",
     * "is_admin" : true,
     * "max_coll" : 50,
     * "max_proj" : 10,
     * "max_sav_qry" : 20,
     * :
     * "email" : "bobjones@gmail.com"
     *
     * @param {string} a_object_id - the identity of a record or collection or project
     *
     * "d/fdakjfla"
     * "p/big_thing"
     * "c/my_collection"
     *
     * @returns {boolean} - if client has admin rights on the object.
     **/
    obj.hasAdminPermObject = function (a_client, a_object_id) {
        if (a_client.is_admin) return true;

        var first_owner = obj.db.owner.firstExample({
            _from: a_object_id,
        });
        if (first_owner !== null) {
            var owner_id = first_owner._to; // obj.db.owner.firstExample({ _from: a_object_id })._to;
        } else {
            throw [error.ERR_NOT_FOUND, "Data record for owner not found " + a_object_id + "."];
        }
        if (owner_id == a_client._id) return true;

        if (owner_id[0] == "p") {
            // Object owned by a project
            if (
                obj.db.admin.firstExample({
                    _from: owner_id,
                    _to: a_client._id,
                })
            )
                return true;

            if (
                obj.db.owner.firstExample({
                    _from: owner_id,
                    _to: a_client._id,
                })
            )
                return true;
        }

        if (a_object_id[0] == "d") {
            var data = obj.db._query("for i in d filter i._id == @id return i.creator", {
                id: a_object_id,
            });
            if (!data.hasNext()) {
                throw [error.ERR_NOT_FOUND, "Data record " + a_object_id + " not found."];
            }
            data = data.next();
            if (a_client._id == data) return true;
        }
        return false;
    };

    obj.hasAdminPermRepo = function (a_client, a_repo_id) {
        if (
            !a_client.is_admin &&
            !obj.db.admin.firstExample({
                _from: a_repo_id,
                _to: a_client._id,
            })
        ) {
            return false;
        } else {
            return true;
        }
    };

    obj.ensureAdminPermUser = function (a_client, a_user_id) {
        if (!obj.hasAdminPermUser(a_client, a_user_id)) throw error.ERR_PERM_DENIED;
    };

    obj.ensureAdminPermProj = function (a_client, a_user_id) {
        if (!obj.hasAdminPermProj(a_client, a_user_id)) throw error.ERR_PERM_DENIED;
    };

    obj.ensureManagerPermProj = function (a_client, a_user_id) {
        if (!obj.hasManagerPermProj(a_client, a_user_id)) throw error.ERR_PERM_DENIED;
    };

    obj.ensureAdminPermObject = function (a_client, a_object_id) {
        if (!obj.hasAdminPermObject(a_client, a_object_id)) throw error.ERR_PERM_DENIED;
    };

    obj.ensureAdminPermRepo = function (a_client, a_repo_id) {
        if (!obj.hasAdminPermRepo(a_client, a_repo_id)) throw error.ERR_PERM_DENIED;
    };

    /* Test if client has requested permission(s) for specified object. Note: this call does NOT check for
     * ownership or admin privilege - the hasAdminPermObject function performs these checks and should be
     * called first if needed. This function is typically used when filtering a list of objects that are
     * known not to be owned by the client (and that the client is not an admin). In this case, those checks
     * would add performance cost for no benefit.
     */
    obj.hasPermissions = function (
        a_client,
        a_object,
        a_req_perm,
        a_inherited = false,
        any = false,
    ) {
        //console.log("check perm:", a_req_perm, "client:", a_client._id, "object:", a_object._id, "any:", any );
        //console.log("grant:", a_object.grant );

        var perm_found = 0,
            acl,
            acls,
            result,
            i;

        // If object is marked "public", everyone is granted VIEW, and READ permissions
        // The current implementation allows users to be denied access to public data (maybe wrong?)

        if (a_object.topic) {
            perm_found = obj.PERM_PUBLIC;

            result = obj.evalPermissions(a_req_perm, perm_found, any);
            if (result != null) return result;
        }

        // Evaluate user permissions set directly on object
        if (a_object.acls & 1) {
            acls = obj.db
                ._query("for v, e in 1..1 outbound @object acl filter v._id == @client return e", {
                    object: a_object._id,
                    client: a_client._id,
                })
                .toArray();

            if (acls.length) {
                for (i in acls) {
                    acl = acls[i];
                    //console.log("user_perm:",acl);
                    perm_found |= acl.grant;
                    if (a_inherited && acl.inhgrant) perm_found |= acl.inhgrant;
                }

                result = obj.evalPermissions(a_req_perm, perm_found, any);
                if (result != null) return result;
            }
        }

        // Evaluate group permissions on object
        if (a_object.acls & 2) {
            acls = obj.db
                ._query(
                    "for v, e, p in 2..2 outbound @object acl, outbound member filter p.vertices[2]._id == @client return p.edges[0]",
                    {
                        object: a_object._id,
                        client: a_client._id,
                    },
                )
                .toArray();
            if (acls.length) {
                for (i in acls) {
                    acl = acls[i];
                    //console.log("group_perm:",acl);
                    perm_found |= acl.grant;
                    if (a_inherited && acl.inhgrant) perm_found |= acl.inhgrant;
                }

                result = obj.evalPermissions(a_req_perm, perm_found, any);
                if (result != null) return result;
            }
        }

        // If not all requested permissions have been found, evaluate permissions inherited from parent collections
        // Note that items can only be linked to containers that share the same owner
        // This evaluation is implemented as a manually guided breadth-first search

        var children = [a_object];
        var parents, parent;

        for (;;) {
            // Find all parent collections owned by object owner

            parents = obj.db
                ._query(
                    "for i in @children for v in 1..1 inbound i item return {_id:v._id,topic:v.topic,acls:v.acls}",
                    {
                        children: children,
                    },
                )
                .toArray();

            if (parents.length == 0) break;

            for (i in parents) {
                parent = parents[i];

                if (parent.topic) {
                    perm_found |= obj.PERM_PUBLIC;

                    result = obj.evalPermissions(a_req_perm, perm_found, any);
                    if (result != null) return result;
                }

                // User ACL first
                if (parent.acls && (parent.acls & 1) !== 0) {
                    acls = obj.db
                        ._query(
                            "for v, e in 1..1 outbound @object acl filter v._id == @client return e",
                            {
                                object: parent._id,
                                client: a_client._id,
                            },
                        )
                        .toArray();
                    if (acls.length) {
                        for (i in acls) {
                            acl = acls[i];
                            perm_found |= acl.inhgrant;
                        }

                        result = obj.evalPermissions(a_req_perm, perm_found, any);
                        if (result != null) return result;
                    }
                }

                // Group ACL next
                if (parent.acls && (parent.acls & 2) !== 0) {
                    acls = obj.db
                        ._query(
                            "for v, e, p in 2..2 outbound @object acl, outbound member filter is_same_collection('g',p.vertices[1]) and p.vertices[2]._id == @client return p.edges[0]",
                            {
                                object: parent._id,
                                client: a_client._id,
                            },
                        )
                        .toArray();
                    if (acls.length) {
                        for (i in acls) {
                            acl = acls[i];
                            perm_found |= acl.inhgrant;
                        }

                        result = obj.evalPermissions(a_req_perm, perm_found, any);
                        if (result != null) return result;
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

    obj.evalPermissions = function (a_req_perm, a_perm_found, any) {
        if (any) {
            // If any requested permission have been found, return true (granted)
            if (a_perm_found & a_req_perm) return true;
            else return null; // Else, keep looking
        } else {
            // If not all requested permissions have been found return NULL (keep looking)
            if ((a_perm_found & a_req_perm) != a_req_perm) return null;
            else return true; // Else, permission granted
        }
    };

    obj.getPermissions = function (a_client, a_object, a_req_perm, a_inherited = false) {
        //console.log("get perm:", a_req_perm, "client:", a_client._id, "object:", a_object._id, "any:", any );
        //console.log("grant:", a_object.grant );

        var perm_found = 0,
            acl,
            acls,
            i;

        // If object has a topic (collections only), everyone is granted VIEW, and READ permissions
        // The current implementation allows users to be denied access to public data (maybe wrong?)

        if (a_object.topic) {
            perm_found = obj.PERM_PUBLIC;

            if ((a_req_perm & perm_found) == a_req_perm) return a_req_perm;
        }

        // Evaluate permissions set directly on object

        if (a_object.acls && (a_object.acls & 1) !== 0) {
            acls = obj.db
                ._query("for v, e in 1..1 outbound @object acl filter v._id == @client return e", {
                    object: a_object._id,
                    client: a_client._id,
                })
                .toArray();

            if (acls.length) {
                for (i in acls) {
                    acl = acls[i];
                    //console.log("user_perm:",acl);
                    perm_found |= acl.grant;
                    if (a_inherited && acl.inhgrant) perm_found |= acl.inhgrant;
                }

                if ((a_req_perm & perm_found) == a_req_perm) return a_req_perm;
            }
        }

        // Evaluate group permissions on object

        if (a_object.acls && (a_object.acls & 2) !== 0) {
            acls = obj.db
                ._query(
                    "for v, e, p in 2..2 outbound @object acl, outbound member filter p.vertices[2]._id == @client return p.edges[0]",
                    {
                        object: a_object._id,
                        client: a_client._id,
                    },
                )
                .toArray();

            if (acls.length) {
                for (i in acls) {
                    acl = acls[i];
                    //console.log("group_perm:",acl);
                    perm_found |= acl.grant;
                    if (a_inherited && acl.inhgrant) perm_found |= acl.inhgrant;
                }

                if ((a_req_perm & perm_found) == a_req_perm) return a_req_perm;
            }
        }

        // If not all requested permissions have been found, evaluate permissions inherited from parent collections
        // Note that items can only be linked to containers that share the same owner

        var children = [a_object];
        var parents, parent;

        for (;;) {
            // Find all parent collections owned by object owner

            parents = obj.db
                ._query(
                    "for i in @children for v in 1..1 inbound i item return {_id:v._id,topic:v.topic,acls:v.acls}",
                    {
                        children: children,
                    },
                )
                .toArray();

            if (parents.length == 0) break;

            for (i in parents) {
                parent = parents[i];

                if (parent.topic) {
                    perm_found |= obj.PERM_PUBLIC;

                    if ((a_req_perm & perm_found) == a_req_perm) return a_req_perm;
                }

                // User ACL
                if (parent.acls && (parent.acls & 1) != 0) {
                    acls = obj.db
                        ._query(
                            "for v, e in 1..1 outbound @object acl filter v._id == @client return e",
                            {
                                object: parent._id,
                                client: a_client._id,
                            },
                        )
                        .toArray();
                    if (acls.length) {
                        for (i in acls) {
                            acl = acls[i];
                            perm_found |= acl.inhgrant;
                        }

                        if ((a_req_perm & perm_found) == a_req_perm) return a_req_perm;
                    }
                }

                // Group ACL
                if (parent.acls && (parent.acls & 2) != 0) {
                    acls = obj.db
                        ._query(
                            "for v, e, p in 2..2 outbound @object acl, outbound member filter is_same_collection('g',p.vertices[1]) and p.vertices[2]._id == @client return p.edges[0]",
                            {
                                object: parent._id,
                                client: a_client._id,
                            },
                        )
                        .toArray();
                    if (acls.length) {
                        for (i in acls) {
                            acl = acls[i];
                            perm_found |= acl.inhgrant;
                        }

                        if ((a_req_perm & perm_found) == a_req_perm) return a_req_perm;
                    }
                }
            }

            // If there are still missing require permissions...
            // Determine which parents are candidates for further evaluation (have req bits not set in inherited permissions)
            children = parents;
        }

        return perm_found & a_req_perm;
    };

    obj.getPermissionsLocal = function (a_client_id, a_object, a_get_inherited, a_req_perm) {
        var perm = {
                grant: 0,
                inhgrant: 0,
                inherited: 0,
            },
            acl,
            acls,
            i;

        //console.log("getPermissionsLocal",a_object._id);

        if (a_object.topic) {
            //console.log("has topic 1");
            perm.grant |= obj.PERM_PUBLIC;
            perm.inhgrant |= obj.PERM_PUBLIC;
        }

        if (a_object.acls & 1) {
            //console.log("chk local user acls");

            acls = obj.db
                ._query("for v, e in 1..1 outbound @object acl filter v._id == @client return e", {
                    object: a_object._id,
                    client: a_client_id,
                })
                .toArray();

            for (i in acls) {
                acl = acls[i];
                perm.grant |= acl.grant;
                perm.inhgrant |= acl.inhgrant;
            }
        }

        // Evaluate group permissions on object
        if (a_object.acls & 2) {
            //console.log("chk local group acls");

            acls = obj.db
                ._query(
                    "for v, e, p in 2..2 outbound @object acl, outbound member filter p.vertices[2]._id == @client return p.edges[0]",
                    {
                        object: a_object._id,
                        client: a_client_id,
                    },
                )
                .toArray();
            for (i in acls) {
                acl = acls[i];
                perm.grant |= acl.grant;
                perm.inhgrant |= acl.inhgrant;
            }
        }

        if (a_get_inherited) {
            //console.log("chk inherited");

            var children = [a_object];
            var parents, parent;

            for (;;) {
                // Find all parent collections owned by object owner

                parents = obj.db
                    ._query(
                        "for i in @children for v in 1..1 inbound i item return {_id:v._id,topic:v.topic,acls:v.acls}",
                        {
                            children: children,
                        },
                    )
                    .toArray();

                //console.log("parents",parents);

                if (parents.length == 0) break;

                for (i in parents) {
                    parent = parents[i];

                    if (parent.topic) {
                        //console.log("has topic 2");

                        perm.inherited |= obj.PERM_PUBLIC;

                        if ((a_req_perm & perm.inherited) == a_req_perm) break;
                    }

                    // User ACL
                    if (parent.acls && (parent.acls & 1) != 0) {
                        //console.log("chk par user acls");

                        acls = obj.db
                            ._query(
                                "for v, e in 1..1 outbound @object acl filter v._id == @client return e",
                                {
                                    object: parent._id,
                                    client: a_client_id,
                                },
                            )
                            .toArray();
                        if (acls.length) {
                            for (i in acls) {
                                acl = acls[i];
                                perm.inherited |= acl.inhgrant;
                            }

                            if ((a_req_perm & perm.inherited) == a_req_perm) break;
                        }
                    }

                    // Group ACL
                    if (parent.acls && (parent.acls & 2) != 0) {
                        //console.log("chk par group acls");

                        acls = obj.db
                            ._query(
                                "for v, e, p in 2..2 outbound @object acl, outbound member filter is_same_collection('g',p.vertices[1]) and p.vertices[2]._id == @client return p.edges[0]",
                                {
                                    object: parent._id,
                                    client: a_client_id,
                                },
                            )
                            .toArray();
                        if (acls.length) {
                            for (i in acls) {
                                acl = acls[i];
                                perm.inherited |= acl.inhgrant;
                            }

                            if ((a_req_perm & perm.inherited) == a_req_perm) break;
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

    return obj;
})();
