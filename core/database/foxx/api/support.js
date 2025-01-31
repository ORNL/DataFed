"use strict";

const joi = require("joi");

module.exports = (function () {
    var obj = {};

    obj.db = require("@arangodb").db;
    obj.graph = require("@arangodb/general-graph")._graph("sdmsg");

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

    obj.MAX_COLL_ITEMS = 10000;
    obj.MAX_QRY_ITEMS = 10000;
    obj.MAX_PAGE_SIZE = 1000;
    obj.MAX_MD_SIZE = 102400;
    obj.PASSWORD_MIN_LEN = 10;

    obj.SM_DATA = 0;
    obj.SM_COLLECTION = 1;

    obj.SS_PERSONAL = 0;
    obj.SS_PROJECT = 1;
    obj.SS_SHARED = 2;
    obj.SS_PUBLIC = 3;

    obj.TT_DATA_GET = 0;
    obj.TT_DATA_PUT = 1;
    obj.TT_DATA_DEL = 2;
    obj.TT_REC_ALLOC_CHG = 3;
    obj.TT_REC_OWNER_CHG = 4;
    obj.TT_REC_DEL = 5;
    obj.TT_ALLOC_CREATE = 6;
    obj.TT_ALLOC_DEL = 7;
    obj.TT_USER_DEL = 8;
    obj.TT_PROJ_DEL = 9;
    obj.TT_DATA_EXPORT = 10;

    obj.TS_BLOCKED = 0;
    obj.TS_READY = 1;
    obj.TS_RUNNING = 2;
    obj.TS_SUCCEEDED = 3;
    obj.TS_FAILED = 4;
    obj.TS_COUNT = 5;

    obj.TC_STOP = 0;
    obj.TC_RAW_DATA_TRANSFER = 1;
    obj.TC_RAW_DATA_DELETE = 2;
    obj.TC_RAW_DATA_UPDATE_SIZE = 3;
    obj.TC_ALLOC_CREATE = 4;
    obj.TC_ALLOC_DELETE = 5;

    obj.XS_INIT = 0;
    obj.XS_ACTIVE = 1;
    obj.XS_INACTIVE = 2;
    obj.XS_SUCCEEDED = 3;
    obj.XS_FAILED = 4;

    obj.XM_GET = 0;
    obj.XM_PUT = 1;
    obj.XM_COPY = 2;

    obj.DEP_IS_DERIVED_FROM = 0;
    obj.DEP_IS_COMPONENT_OF = 1;
    obj.DEP_IS_NEW_VERSION_OF = 2;

    obj.DEP_IN = 0;
    obj.DEP_OUT = 1;

    obj.SORT_ID = 0;
    obj.SORT_TITLE = 1;
    obj.SORT_OWNER = 2;
    obj.SORT_TIME_CREATE = 3;
    obj.SORT_TIME_UPDATE = 4;
    obj.SORT_RELEVANCE = 5;

    obj.PROJ_NO_ROLE = 0; // No permissions
    obj.PROJ_MEMBER = 1; // Data/collection Permissions derived from "members" group and other ACLs
    obj.PROJ_MANAGER = 2; // Adds permission to manage groups and grants ADMIN permission on all data/collections
    obj.PROJ_ADMIN = 3; // Grants all permissions (edit and delete project)

    obj.NOTE_QUESTION = 0;
    obj.NOTE_INFO = 1;
    obj.NOTE_WARN = 2;
    obj.NOTE_ERROR = 3;

    obj.NOTE_CLOSED = 0;
    obj.NOTE_OPEN = 1;
    obj.NOTE_ACTIVE = 2;

    obj.NOTE_MASK_ACT_QUES = 0x0001;
    obj.NOTE_MASK_ACT_INFO = 0x0002;
    obj.NOTE_MASK_ACT_WARN = 0x0004;
    obj.NOTE_MASK_ACT_ERR = 0x0008;
    obj.NOTE_MASK_OPN_QUES = 0x0010;
    obj.NOTE_MASK_OPN_INFO = 0x0020;
    obj.NOTE_MASK_OPN_WARN = 0x0040;
    obj.NOTE_MASK_OPN_ERR = 0x0080;
    obj.NOTE_MASK_INH_WARN = 0x0400; // Questions & info are not inherited
    obj.NOTE_MASK_INH_ERR = 0x0800;
    obj.NOTE_MASK_CLS_ANY = 0x1000;
    obj.NOTE_MASK_LOC_ALL = 0x00ff;
    obj.NOTE_MASK_INH_ALL = 0x0c00;
    obj.NOTE_MASK_MD_ERR = 0x2000;

    obj.acl_schema = joi.object().keys({
        id: joi.string().required(),
        grant: joi.number().optional(),
        inhgrant: joi.number().optional(),
    });

    obj.ERR_INFO = [];
    obj.ERR_COUNT = 0;

    obj.ERR_AUTHN_FAILED = obj.ERR_COUNT++;
    obj.ERR_INFO.push([400, "Authentication Failed"]);
    obj.ERR_PERM_DENIED = obj.ERR_COUNT++;
    obj.ERR_INFO.push([400, "Permission Denied"]);
    obj.ERR_INVALID_PARAM = obj.ERR_COUNT++;
    obj.ERR_INFO.push([400, "Invalid Parameter"]);
    obj.ERR_INPUT_TOO_LONG = obj.ERR_COUNT++;
    obj.ERR_INFO.push([400, "Input value too long"]);
    obj.ERR_INVALID_CHAR = obj.ERR_COUNT++;
    obj.ERR_INFO.push([400, "Invalid character"]);
    obj.ERR_NOT_FOUND = obj.ERR_COUNT++;
    obj.ERR_INFO.push([400, "Record Not Found"]);
    obj.ERR_IN_USE = obj.ERR_COUNT++;
    obj.ERR_INFO.push([400, "Value In Use"]);
    obj.ERR_LINK = obj.ERR_COUNT++;
    obj.ERR_INFO.push([400, "Collection Link Error"]);
    obj.ERR_UNLINK = obj.ERR_COUNT++;
    obj.ERR_INFO.push([400, "Collection Unlink Error"]);
    obj.ERR_MISSING_REQ_PARAM = obj.ERR_COUNT++;
    obj.ERR_INFO.push([400, "Missing one or more required parameters"]);
    obj.ERR_NO_RAW_DATA = obj.ERR_COUNT++;
    obj.ERR_INFO.push([400, "Record has no raw data"]);
    obj.ERR_XFR_CONFLICT = obj.ERR_COUNT++;
    obj.ERR_INFO.push([400, "Data transfer conflict"]);
    obj.ERR_INTERNAL_FAULT = obj.ERR_COUNT++;
    obj.ERR_INFO.push([400, "Internal server fault"]);
    obj.ERR_NO_ALLOCATION = obj.ERR_COUNT++;
    obj.ERR_INFO.push([400, "No allocation available"]);
    obj.ERR_ALLOCATION_EXCEEDED = obj.ERR_COUNT++;
    obj.ERR_INFO.push([400, "Storage allocation exceeded"]);

    obj.CHARSET_ID = 0;
    obj.CHARSET_ALIAS = 1;
    obj.CHARSET_TOPIC = 2;
    obj.CHARSET_URL = 3;
    obj.CHARSET_DOI = 4;
    obj.CHARSET_SCH_ID = 5;

    obj.pw_chars = "?#@!$&*:;/+-=~";
    obj.extra_chars = ["_-.", "_-.", "_-.", "-._~:/?#[]@!$&'()*+,;=", "/_-:.@()+,=;$!*'%", "_-.:"];

    obj.field_reqs = {
        title: {
            required: true,
            update: true,
            max_len: 80,
            label: "title",
        },
        alias: {
            required: false,
            update: true,
            max_len: 40,
            lower: true,
            charset: obj.CHARSET_ALIAS,
            label: "alias",
        },
        desc: {
            required: false,
            update: true,
            max_len: 2000,
            label: "description",
        },
        summary: {
            required: false,
            update: true,
            max_len: 500,
            in_field: "desc",
            out_field: "desc",
            label: "description",
        },
        comment: {
            required: true,
            update: true,
            max_len: 2000,
            in_field: "comment",
            out_field: "comment",
            label: "comment",
        },
        topic: {
            required: false,
            update: true,
            max_len: 500,
            lower: true,
            charset: obj.CHARSET_TOPIC,
            label: "topic",
        },
        domain: {
            required: false,
            update: true,
            max_len: 40,
            lower: true,
            charset: obj.CHARSET_ID,
            label: "domain",
        },
        source: {
            required: false,
            update: true,
            max_len: 4096,
            lower: false,
            label: "source",
        },
        ext: {
            required: false,
            update: true,
            max_len: 40,
            lower: false,
            label: "extension",
        },
        gid: {
            required: true,
            update: false,
            max_len: 40,
            lower: true,
            charset: obj.CHARSET_ID,
            label: "group ID",
        },
        id: {
            required: true,
            update: false,
            max_len: 40,
            lower: true,
            charset: obj.CHARSET_ID,
            out_field: "_key",
            label: "ID",
        },
        doi: {
            required: false,
            update: true,
            max_len: 40,
            lower: true,
            charset: obj.CHARSET_DOI,
            label: "doi",
        },
        data_url: {
            required: false,
            update: true,
            max_len: 200,
            lower: false,
            charset: obj.CHARSET_URL,
            label: "data URL",
        },
        sch_id: {
            required: false,
            update: true,
            max_len: 120,
            lower: true,
            charset: obj.CHARSET_SCH_ID,
            label: "schema",
        },
        _sch_id: {
            required: true,
            update: true,
            max_len: 120,
            lower: true,
            charset: obj.CHARSET_SCH_ID,
            in_field: "id",
            out_field: "id",
            label: "schema",
        },
    };

    obj.DEF_MAX_COLL = 50;
    obj.DEF_MAX_PROJ = 10;
    obj.DEF_MAX_SAV_QRY = 20;

    obj.GLOB_MAX_XFR_SIZE = 10000000000; // ~10GB
    //obj.GLOB_MAX_XFR_SIZE = 2000000;

    // TODO: this will need to be updated every time the AccessTokenType enum is updated in SDMS.proto
    obj.AccessTokenType = {
        GENERIC: 1,
        GLOBUS: 2,
        GLOBUS_AUTH: 3,
        GLOBUS_TRANSFER: 4,
        GLOBUS_DEFAULT: 5,
        ACCESS_SENTINEL: 255,
    };

    obj.procInputParam = function (a_in, a_field, a_update, a_out) {
        var val,
            spec = obj.field_reqs[a_field];

        //console.log("procInput",a_field,",update:",a_update);

        if (!spec) {
            throw [
                obj.ERR_INTERNAL_FAULT,
                "Input specification for '" +
                    a_field +
                    "' not found. Please contact system administrator.",
            ];
        }

        if (typeof a_in == "string") val = a_in;
        else if (spec.in_field) val = a_in[spec.in_field];
        else val = a_in[a_field];

        //console.log("init val",val);

        // Ignore param updates when not allowed to be updated
        if (a_update && !spec.update) {
            //console.log("stop b/c no update allowed");
            return;
        }

        if (val && val.length) val = val.trim();

        if (val && val.length) {
            // Check length if specified
            if (spec.max_len && val.length > spec.max_len)
                throw [
                    obj.ERR_INPUT_TOO_LONG,
                    "'" +
                        spec.label +
                        "' field is too long. Maximum length is " +
                        spec.max_len +
                        ".",
                ];

            if (spec.lower) val = val.toLowerCase();

            if (spec.charset != undefined) {
                var extra = obj.extra_chars[spec.charset];
                var code, i, len;

                for (i = 0, len = val.length; i < len; i++) {
                    code = val.charCodeAt(i);
                    if (
                        !(code > 47 && code < 58) && // numeric (0-9)
                        !(code > 64 && code < 91) && // upper alpha (A-Z)
                        !(code > 96 && code < 123)
                    ) {
                        // lower alpha (a-z)
                        if (extra.indexOf(val.charAt(i)) == -1)
                            throw [
                                obj.ERR_INVALID_CHAR,
                                "Invalid character(s) in '" + spec.label + "' field.",
                            ];
                    }
                }
            }
            //console.log("save new val:",val);

            if (spec.out_field) a_out[spec.out_field] = val;
            else a_out[a_field] = val;
        } else {
            // Required params must have a value
            if (a_update) {
                if (val === "") {
                    if (spec.required)
                        throw [
                            obj.ERR_MISSING_REQ_PARAM,
                            "Required field '" + spec.label + "' cannot be deleted.",
                        ];

                    if (spec.out_field) a_out[spec.out_field] = null;
                    else a_out[a_field] = null;
                }
            } else if (spec.required)
                throw [obj.ERR_MISSING_REQ_PARAM, "Missing required field '" + spec.label + "'."];
        }
    };

    obj.isInteger = function (x) {
        return typeof x === "number" && x % 1 === 0;
    };

    obj.validatePassword = function (pw) {
        if (pw.length < obj.PASSWORD_MIN_LEN) {
            throw [
                obj.ERR_INVALID_PARAM,
                "ERROR: password must be at least " +
                    obj.PASSWORD_MIN_LEN +
                    " characters in length.",
            ];
        }

        var i,
            j = 0,
            c;
        for (i in pw) {
            c = pw[i];
            if (c >= "0" && c <= "9") {
                j |= 1;
            } else if (obj.pw_chars.indexOf(c) != -1) {
                j |= 2;
            }
            if (j == 3) {
                return;
            }
        }

        if (j != 3) {
            throw [
                obj.ERR_INVALID_PARAM,
                "ERROR: password must contain at least one number (0-9) and one special character (" +
                    obj.pw_chars +
                    ").",
            ];
        }
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

    obj.handleException = function (e, res) {
        console.log("Service exception:", e);

        if (obj.isInteger(e) && e >= 0 && e < obj.ERR_COUNT) {
            res.throw(obj.ERR_INFO[e][0], obj.ERR_INFO[e][1]);
        } else if (Array.isArray(e)) {
            res.throw(obj.ERR_INFO[e[0]][0], e[1]);
            //} else if ( e.hasOwnProperty( "errorNum" )) {
        } else if (Object.prototype.hasOwnProperty.call(e, "errorNum")) {
            switch (e.errorNum) {
                case 1202:
                    res.throw(404, "Record does not exist");
                    break;
                case 1205:
                case 1213:
                    res.throw(404, "Invalid ID");
                    break;
                case 1210:
                    res.throw(409, "Conflicting ID or alias");
                    break;
                case 1200:
                    res.throw(500, "Conflict: " + e);
                    break;
                default:
                    res.throw(500, "Unexpected DB exception: " + e);
                    break;
            }
        } else {
            res.throw(500, "Unexpected exception: " + e);
        }
    };

    obj.isDomainAccount = function (a_client_id) {
        // TODO This needs to have a test that doesn't conflict with email-style uids

        /*if ( a_client_id.indexOf( "." ) != -1 )
            return true;
        else*/
        return false;
    };

    // Quick check to determine if ID looks like a UUID (does not verify)
    obj.isUUID = function (a_client_id) {
        if (a_client_id.length == 36 && a_client_id.charAt(8) == "-") return true;
        else return false;
    };

    // Quick check to see if a comma separated list of UUIDs has been provided
    // Must contain at least one comma
    obj.isUUIDList = function (a_client_ids) {
        if (a_client_ids.indexOf(",") > -1) {
            var potential_uuids = a_client_ids.split(",");
            for (var index in potential_uuids) {
                if (!obj.isUUID(potential_uuids[index])) {
                    return false;
                }
            }
            return true;
        } else {
            return false;
        }
    };

    // Verify a_is is a valid UUID AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA (full check)
    obj.isValidUUID = function (a_id) {
        if (a_id.length == 36) {
            var code;
            for (var i = 0; i < 36; i++) {
                if (i == 8 || i == 13 || i == 18 || i == 23) {
                    if (a_id.charAt(i) != "-") {
                        return false;
                    }
                } else {
                    code = a_id.charCodeAt(i);
                    if (
                        !(code > 47 && code < 58) && // numeric (0-9)
                        !(code > 64 && code < 71) && // upper alpha (A-F)
                        !(code > 96 && code < 103)
                    ) {
                        // lower alpha (a-F)
                        return false;
                    }
                }
            }

            return true;
        }

        return false;
    };

    obj.isFullGlobusPath = function (a_path, a_is_file = true) {
        // Full Globus path can be UUID/<som_path> or legacy#name/<some_path>
        var idx = a_path.indexOf("/");
        if (idx > 0) {
            var ep = a_path.substr(0, idx),
                idx2 = ep.indexOf("#");

            if (idx2 > -1) {
                // Verify ep is in valid legacy name format (one # with prefix & suffix)
                if (idx2 == 0 || idx2 == ep.length - 1 || ep.indexOf("#", idx2 + 1) != -1) {
                    return false;
                }
            } else {
                // Verify ep is in valid UUID format
                if (!obj.isValidUUID(ep)) {
                    return false;
                }
            }

            if (a_is_file && a_path.charAt(a_path.length - 1) == "/") {
                return false;
            }

            return true;
        }

        return false;
    };

    obj.resolveUUIDsToID = function (uuid_list) {
        // This function will take a comma separated list of uuids as a string separate them and then either resolve them to a single uuid or
        // throw an error
        var potential_uuids = uuid_list.split(",");
        var uuids = [];
        for (var i in potential_uuids) {
            uuids.push("uuid/" + potential_uuids[i]);
        }
        console.log("resolveUUIDsToID");
        console.log("uuids: ", uuids);
        var result = obj.db
            ._query("for i in ident filter i._to in @ids return distinct document(i._from)", {
                ids: uuids,
            })
            .toArray();

        if (result.length !== 1) {
            throw [obj.ERR_NOT_FOUND, "No user matching Globus IDs found"];
        }

        var first_uuid = result[0]._id;
        // Next we need to make sure the provided ids are all the same if there is more than one
        for (var i = 1; i < result.length; i++) {
            if (first_uuid != result[i]._id) {
                throw [
                    obj.ERR_INVALID_PARAM,
                    "uuid_list does not resolve to a single user, unable to unambiguously resolve user, it is possible that you have multiple accounts when you should have only a single one problematic ids are: " +
                        first_uuid +
                        " and " +
                        array[i],
                ];
            }
        }
        return first_uuid;
    };

    obj.resolveUUIDsToID_noexcept = function (uuid_list) {
        // This function will take a comma separated list of uuids as a string separate them and then either resolve them to a single uuid or
        // throw an error
        var potential_uuids = uuid_list.split(",");
        var uuids = [];
        for (var i in potential_uuids) {
            uuids.push("uuid/" + potential_uuids[i]);
        }
        console.log("resolveUUIDsToID_noexcept");
        console.log("uuids: ", uuids);
        var result = obj.db
            ._query("for i in ident filter i._to in @ids return distinct document(i._from)", {
                ids: uuids,
            })
            .toArray();
        if (result.length != 1) {
            throw [obj.ERR_NOT_FOUND, "No user matching Globus IDs found"];
        }

        var first_uuid = result[0]._id;
        // Next we need to make sure the provided ids are all the same if there is more than one
        for (var i = 1; i < result.length; i++) {
            console.log("resolveUUID comparing " + first_uuid + " with " + result[i]);
            if (first_uuid != result[i]._id) {
                return;
            }
        }
        return first_uuid;
    };

    /**
     * Retrieves user information based on the provided client ID.
     *
     * The return value should be a client containing the following information:
     *
     * "_key" : "bob",
     * "_id" : "u/bob",
     * "name" : "bob junior",
     * "name_first" : "bob",
     * "name_last" : "jones",
     * "is_admin" : true,
     * "max_coll" : 50,
     * "max_proj" : 10,
     * "max_sav_qry" : 20,
     * "email" : "bobjones@gmail.com"
     *
     *
     * The client ID can be in the following formats:
     * - SDMS uname (e.g., "xxxxx...")
     * - UUID (e.g., "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx")
     * - Account (e.g., "domain.uname")
     *
     * UUIDs are defined by length and format, accounts have a "." (and known domains),
     * and SDMS unames have no "." or "-" characters.
     *
     * @param {string} a_client_id - The client ID, which can be in various formats (SDMS uname, UUID, or Account).
     * @throws {Array} Throws an error if the user does not exist, or the client ID is invalid.
     * @returns {object} The user record containing details such as name, admin status, and email.
     *
     * @example
     * const user = obj.getUserFromClientID('u/bob');
     * console.log(user.name); // "bob junior"
     */
    obj.getUserFromClientID = function (a_client_id) {
        // Client ID can be an SDMS uname (xxxxx...), a UUID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx), or an account (domain.uname)
        // UUID are defined by length and format, accounts have a "." (and known domains), SDMS unames have no "." or "-" characters

        var params;
        console.log("getUserFromClient id: ", a_client_id);

        if (a_client_id.startsWith("u/")) {
            if (!obj.db.u.exists(a_client_id)) {
                throw [obj.ERR_INVALID_PARAM, "No such user '" + a_client_id + "'"];
            }

            return obj.db._document({
                _id: a_client_id,
            });
        } else if (obj.isDomainAccount(a_client_id)) {
            // Account
            params = {
                id: "accn/" + a_client_id,
            };
        } else if (obj.isUUID(a_client_id)) {
            // UUID
            params = {
                id: "uuid/" + a_client_id,
            };
        } else if (obj.isUUIDList(a_client_id)) {
            // Check to make sure the UUIDs provided are all associated with the same DataFed account, if they are we can unambiguously
            // determine the UUID, if they are not, then we will throw an error for now,
            var unambiguous_id = obj.resolveUUIDsToID(a_client_id);
            if (!unambiguous_id) {
                console.log("Undefined");
                return;
            }
            //params = { 'id': unambiguous_id };
            return obj.db._document({
                _id: unambiguous_id,
            });
        } else {
            if (!obj.db.u.exists("u/" + a_client_id)) {
                throw [obj.ERR_INVALID_PARAM, "No such user 'u/" + a_client_id + "'"];
            }
            return obj.db._document({
                _id: "u/" + a_client_id,
            });
        }

        var result = obj.db
            ._query("for j in inbound @id ident return j", params, {
                cache: true,
            })
            .toArray();

        if (result.length != 1) {
            //console.log("Client", a_client_id, "not found, params:", params );
            throw [obj.ERR_NOT_FOUND, "Account/Identity '" + a_client_id + "' not found"];
        }

        return result[0];
    };

    obj.getUserFromClientID_noexcept = function (a_client_id) {
        // Client ID can be an SDMS uname (xxxxx...), a UUID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx), or an account (domain.uname)
        // UUID are defined by length and format, accounts have a "." (and known domains), SDMS unames have no "." or "-" characters

        var params;

        if (a_client_id.startsWith("u/")) {
            if (!obj.db.u.exists(a_client_id)) return;

            return obj.db._document({
                _id: a_client_id,
            });
        } else if (obj.isDomainAccount(a_client_id)) {
            // Account
            params = {
                id: "accn/" + a_client_id,
            };
        } else if (obj.isUUID(a_client_id)) {
            // UUID
            params = {
                id: "uuid/" + a_client_id,
            };
        } else if (obj.isUUIDList(a_client_id)) {
            // Check to make sure the UUIDs provided are all associated with the same DataFed account, if they are we can unambiguously
            // determine the UUID, if they are not, then we will throw an error for now,
            var unambiguous_id = obj.resolveUUIDsToID_noexcept(a_client_id);
            if (!unambiguous_id) {
                console.log("Undefined");
                return;
            }
            //params = { 'id': unambiguous_id };
            return obj.db._document({
                _id: unambiguous_id,
            });
        } else {
            if (!obj.db.u.exists("u/" + a_client_id)) return;

            return obj.db._document({
                _id: "u/" + a_client_id,
            });
        }

        var result = obj.db
            ._query("for j in inbound @id ident return j", params, {
                cache: true,
            })
            .toArray();

        if (result.length != 1) {
            return;
        }

        return result[0];
    };

    obj.findUserFromUUIDs = function (a_uuids) {
        console.log("findUserFromUUIDs");
        console.log("a_uuids: ", a_uuids);
        var result = obj.db
            ._query("for i in ident filter i._to in @ids return distinct document(i._from)", {
                ids: a_uuids,
            })
            .toArray();

        if (result.length === 0) {
            throw [obj.ERR_NOT_FOUND, "No user matching Globus IDs found"];
        } else if (result.length > 1) {
            throw [
                obj.ERR_NOT_FOUND,
                "Multiple DataFed accounts associated with the provided Globus identities" +
                    result.toString(),
            ];
        }

        return result[0];
    };

    obj.uidFromPubKey = function (a_pub_key) {
        //var result = obj.db._query( "for i in accn filter i.pub_key == @key let u = (for v in inbound i._id ident return v._key) return u[0]", { key: a_pub_key }).toArray();
        var result = obj.db
            ._query("for i in u filter i.pub_key == @key return i._id", {
                key: a_pub_key,
            })
            .toArray();
        if (result.length !== 1)
            throw [obj.ERR_NOT_FOUND, "No user matching authentication key found"];

        return result[0];
    };

    obj.findUserFromPubKey = function (a_pub_key) {
        var result = obj.db
            ._query(
                "for i in accn filter i.pub_key == @key let u = (for v in inbound i._id ident return v) return u[0]",
                {
                    key: a_pub_key,
                },
            )
            .toArray();

        //console.log( "key res:", result );
        if (result.length != 1)
            throw [obj.ERR_NOT_FOUND, "No user matching authentication key found"];

        return result[0];
    };

    obj.getAccessToken = function (a_user_id) {
        var user = obj.db.u.document(a_user_id);
        var exp_in = user.expiration - Math.floor(Date.now() / 1000);
        var result = {
            acc_tok: user.access,
            ref_tok: user.refresh,
            acc_tok_exp_in: exp_in > 0 ? exp_in : 0,
        };

        return result;
    };

    obj.getProjectRole = function (a_client_id, a_proj_id) {
        if (
            obj.db.owner.firstExample({
                _from: a_proj_id,
                _to: a_client_id,
            })
        )
            return obj.PROJ_ADMIN;

        if (
            obj.db.admin.firstExample({
                _from: a_proj_id,
                _to: a_client_id,
            })
        )
            return obj.PROJ_MANAGER;

        var grp = obj.db.g.firstExample({
            uid: a_proj_id,
            gid: "members",
        });
        if (!grp) return obj.PROJ_NO_ROLE;

        if (
            obj.db.member.firstExample({
                _from: grp._id,
                _to: a_client_id,
            })
        )
            return obj.PROJ_MEMBER;
        else return obj.PROJ_NO_ROLE;
    };

    obj.sortAllocations = function (allocs) {
        allocs.sort(function (a, b) {
            if (a.is_def) return -1;
            else if (b.is_def) return 1;
            else return a._to < b._to ? -1 : 1;
        });
    };

    obj.assignRepo = function (a_user_id) {
        var alloc,
            allocs = obj.db.alloc
                .byExample({
                    _from: a_user_id,
                })
                .toArray();

        obj.sortAllocations(allocs);

        for (var i in allocs) {
            alloc = allocs[i];

            if (alloc.data_size < alloc.data_limit && alloc.rec_count < alloc.rec_limit) {
                return alloc;
            }
        }

        return null;
    };

    obj.verifyRepo = function (a_user_id, a_repo_id) {
        var alloc = obj.db.alloc.firstExample({
            _from: a_user_id,
            _to: a_repo_id,
        });
        if (!alloc) throw [obj.ERR_NO_ALLOCATION, "No allocation on repo " + a_repo_id];

        if (alloc.data_size >= alloc.data_limit)
            throw [
                obj.ERR_ALLOCATION_EXCEEDED,
                "Allocation data size exceeded (max: " + alloc.data_limit + ")",
            ];

        if (alloc.rec_count >= alloc.rec_limit)
            throw [
                obj.ERR_ALLOCATION_EXCEEDED,
                "Allocation record count exceeded (max: " + alloc.rec_limit + ")",
            ];

        return alloc;
    };

    obj.getRootID = function (owner_id) {
        return "c/" + owner_id[0] + "_" + owner_id.substr(2) + "_root";
    };

    obj.computeDataPath = function (a_loc, a_export) {
        var repo = obj.db._document(a_loc._to);
        var repo_path = a_export ? repo.export_path : repo.path;

        if (a_loc.uid.charAt(0) == "u") {
            return repo_path + "user" + a_loc.uid.substr(1) + a_loc._from.substr(1);
        } else {
            return repo_path + "project" + a_loc.uid.substr(1) + a_loc._from.substr(1);
        }
    };

    obj.computeDataPathPrefix = function (a_repo_id, a_owner_id) {
        var repo = obj.db._document(a_repo_id);

        if (a_owner_id.charAt(0) == "u") {
            return repo.path + "user" + a_owner_id.substr(1) + "/";
        } else {
            return repo.path + "project" + a_owner_id.substr(1) + "/";
        }
    };

    obj.getObject = function (a_obj_id, a_client) {
        var id = obj.resolveID(a_obj_id, a_client);

        if (!obj.db._exists(id))
            throw [obj.ERR_INVALID_PARAM, "Record '" + id + "' does not exist."];

        var doc = obj.db._document(id);

        return doc;
    };

    obj.getDataCollectionLinkCount = function (id) {
        return obj.db
            ._query("for v in 1..1 inbound @id item return v._id", {
                id: id,
            })
            .count();
    };

    obj.hasAdminPermUser = function (a_client, a_user_id) {
        //if ( a_client._id != a_user_id && !a_client.is_admin && !obj.db.owner.firstExample({ _from: a_user_id, _to: a_client._id }) && !obj.db.admin.firstExample({ _from: a_user_id, _to: a_client._id })){
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
            throw [obj.ERR_NOT_FOUND, "Data record for owner not found " + a_object_id + "."];
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
                throw [obj.ERR_NOT_FOUND, "Data record " + a_object_id + " not found."];
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
        if (!obj.hasAdminPermUser(a_client, a_user_id)) throw obj.ERR_PERM_DENIED;
    };

    obj.ensureAdminPermProj = function (a_client, a_user_id) {
        if (!obj.hasAdminPermProj(a_client, a_user_id)) throw obj.ERR_PERM_DENIED;
    };

    obj.ensureManagerPermProj = function (a_client, a_user_id) {
        if (!obj.hasManagerPermProj(a_client, a_user_id)) throw obj.ERR_PERM_DENIED;
    };

    obj.ensureAdminPermObject = function (a_client, a_object_id) {
        if (!obj.hasAdminPermObject(a_client, a_object_id)) throw obj.ERR_PERM_DENIED;
    };

    obj.ensureAdminPermRepo = function (a_client, a_repo_id) {
        if (!obj.hasAdminPermRepo(a_client, a_repo_id)) throw obj.ERR_PERM_DENIED;
    };

    obj.isSrcParentOfDest = function (a_src_id, a_dest_id) {
        var parent;
        var child_id = a_dest_id;
        for (;;) {
            parent = obj.db.item.firstExample({
                _to: child_id,
            });
            if (!parent) return false;
            if (parent._from == a_src_id) return true;
            child_id = parent._from;
        }
    };

    // Data or Collection ID or alias
    obj.resolveID = function (a_id, a_client) {
        var id,
            i = a_id.indexOf("/");

        if (i != -1) {
            if (!a_id.startsWith("d/") && !a_id.startsWith("c/") && !a_id.startsWith("p/"))
                throw [obj.ERR_INVALID_PARAM, "Invalid ID '" + a_id + "'"];
            id = a_id;
        } else {
            var alias_id = "a/";
            if (a_id.indexOf(":") == -1) alias_id += "u:" + a_client._key + ":" + a_id;
            else alias_id += a_id;

            var alias = obj.db.alias.firstExample({
                _to: alias_id,
            });
            if (!alias) throw [obj.ERR_NOT_FOUND, "Alias '" + a_id + "' does not exist"];

            id = alias._from;
        }

        if (!obj.db._exists(id)) {
            throw [obj.ERR_INVALID_PARAM, "Record '" + id + "' does not exist."];
        }

        return id;
    };

    obj.resolveDataID = function (a_id, a_client) {
        var alias,
            id,
            i = a_id.indexOf("/");

        if (i != -1) {
            if (!a_id.startsWith("d/"))
                throw [obj.ERR_INVALID_PARAM, "Invalid data record ID '" + a_id + "'"];
            id = a_id;
        } else {
            var alias_id = "a/";
            if (a_id.indexOf(":") == -1) alias_id += "u:" + a_client._key + ":" + a_id;
            else alias_id += a_id;

            alias = obj.db.alias.firstExample({
                _to: alias_id,
            });
            if (!alias) throw [obj.ERR_NOT_FOUND, "Alias '" + a_id + "' does not exist"];

            id = alias._from;

            if (!id.startsWith("d/"))
                throw [
                    obj.ERR_INVALID_PARAM,
                    "Alias '" + a_id + "' does not identify a data record",
                ];
        }

        if (!obj.db.d.exists(id)) {
            throw [obj.ERR_INVALID_PARAM, "Data record '" + id + "' does not exist."];
        }

        return id;
    };

    obj.resolveCollID = function (a_id, a_client) {
        var id,
            i = a_id.indexOf("/");

        if (i != -1) {
            if (!a_id.startsWith("c/"))
                throw [obj.ERR_INVALID_PARAM, "Invalid collection ID '" + a_id + "'"];
            id = a_id;
        } else {
            var alias_id = "a/";
            if (a_client && a_id.indexOf(":") == -1) alias_id += "u:" + a_client._key + ":" + a_id;
            else alias_id += a_id;

            var alias = obj.db.alias.firstExample({
                _to: alias_id,
            });
            if (!alias) throw [obj.ERR_NOT_FOUND, "Alias '" + a_id + "' does not exist"];

            id = alias._from;

            if (!id.startsWith("c/"))
                throw [
                    obj.ERR_INVALID_PARAM,
                    "Alias '" + a_id + "' does not identify a collection",
                ];
        }

        if (!obj.db.c.exists(id)) {
            throw [obj.ERR_INVALID_PARAM, "Collection '" + id + "' does not exist."];
        }

        return id;
    };

    obj.resolveCollID2 = function (a_id, a_ctxt) {
        var id,
            i = a_id.indexOf("/");

        if (i != -1) {
            if (!a_id.startsWith("c/"))
                throw [obj.ERR_INVALID_PARAM, "Invalid collection ID '" + a_id + "'"];
            id = a_id;
        } else {
            var alias_id = "a/";
            if (a_ctxt && a_id.indexOf(":") == -1)
                alias_id += a_ctxt.charAt(0) + ":" + a_ctxt.substr(2) + ":" + a_id;
            else alias_id += a_id;

            var alias = obj.db.alias.firstExample({
                _to: alias_id,
            });
            if (!alias) throw [obj.ERR_NOT_FOUND, "Alias '" + alias_id + "' does not exist"];

            id = alias._from;

            if (!id.startsWith("c/"))
                throw [
                    obj.ERR_INVALID_PARAM,
                    "Alias '" + alias_id + "' does not identify a collection",
                ];
        }

        if (!obj.db.c.exists(id)) {
            throw [obj.ERR_INVALID_PARAM, "Collection '" + id + "' does not exist."];
        }

        return id;
    };

    obj.resolveDataCollID = function (a_id, a_client) {
        var id,
            i = a_id.indexOf("/");

        if (i != -1) {
            if (!a_id.startsWith("d/") && !a_id.startsWith("c/"))
                throw [obj.ERR_INVALID_PARAM, "Invalid ID '" + a_id + "'"];
            id = a_id;
        } else {
            var alias_id = "a/";
            if (a_client && a_id.indexOf(":") == -1) alias_id += "u:" + a_client._key + ":" + a_id;
            else alias_id += a_id;

            var alias = obj.db.alias.firstExample({
                _to: alias_id,
            });
            if (!alias) throw [obj.ERR_NOT_FOUND, "Alias '" + a_id + "' does not exist"];

            id = alias._from;
        }

        if (!obj.db._exists(id)) {
            throw [
                obj.ERR_INVALID_PARAM,
                (id.charAt(0) == "d" ? "Data record '" : "Collection '") + id + "' does not exist.",
            ];
        }

        return id;
    };

    /*
    obj.topicUpdateData = function( a_coll_id, a_public, a_new_tags ){
        // Recurse into all child collections and update data record tags and public flag
        var ctx = { pub: a_public, tags: a_new_tags, visited: {}, par: null };
        obj.topicUpdateData_recurse( a_coll_id, ctx );
    }
    */

    // For use when creating a new record
    obj.getCollCategoryTags = function (a_coll_id) {
        var coll = obj.db.c.document(a_coll_id),
            ctx = obj.catalogCalcParCtxt(coll, {});

        if (ctx.pub) return Array.from(ctx.tags);
    };

    obj.catalogUpdateRecord = function (a_data, a_coll, a_ctx, a_visited = {}) {
        var p,
            par = obj.db.item.byExample({
                _to: a_data._id,
            }),
            tmp,
            _ctx = a_ctx
                ? a_ctx
                : {
                      pub: false,
                      tags: new Set(),
                  };

        while (par.hasNext()) {
            p = par.next();

            if (a_coll && p._from != a_coll._id) {
                // Record has a parent outside of starting collection tree
                tmp = a_visited[p._from];
                if (!tmp) {
                    tmp = obj.db.c.document(p._from);
                    tmp = obj.catalogCalcParCtxt(tmp, a_visited);
                }

                // Only merge tags if this parent coll is public (or has public ancestor)
                if (tmp.pub) {
                    // Create new context for record if needed
                    if (_ctx === a_ctx) {
                        _ctx = {
                            pub: a_ctx.pub,
                            tags: new Set(a_ctx.tags),
                        };
                    }

                    _ctx.pub = _ctx.pub || tmp.pub;
                    tmp.tags.forEach(_ctx.tags.add, _ctx.tags);
                }
            }
        }

        // Update record with pub flag & tags
        obj.db._update(
            a_data._id,
            {
                public: _ctx.pub,
                cat_tags: _ctx.pub ? Array.from(_ctx.tags) : null,
            },
            {
                keepNull: false,
            },
        );
    };

    obj.catalogCalcParCtxt = function (a_coll, a_visited) {
        //console.log("catalogCalcParCtxt",a_coll._id);
        var c,
            ctx = {
                pub: a_coll.public ? true : false,
                tags: new Set(a_coll.cat_tags ? a_coll.cat_tags : []),
            },
            item = obj.db.item.firstExample({
                _to: a_coll._id,
            });

        while (item) {
            //console.log("chk par",item);
            c = a_visited[item._from];

            if (c) {
                ctx.pub = ctx.pub || c.pub;
                if (c.tags) {
                    c.tags.forEach(ctx.tags.add, ctx.tags);
                }
                //console.log("found visited - stop");
                break;
            } else {
                c = obj.db.c.document(item._from);
                ctx.pub = ctx.pub || c.public;
                if (c.cat_tags) {
                    c.cat_tags.forEach(ctx.tags.add, ctx.tags);
                }
            }

            item = obj.db.item.firstExample({
                _to: item._from,
            });
        }
        //console.log("update visited",ctx);

        a_visited[a_coll._id] = ctx;
        return ctx;
    };

    /* This recursive function updates data record public flag and category tags based
    on current public status of all parent collections, including the entry collection.
    When a collection topic is change, the collection should be updated first before
    calling this function. Note that the public state and category tags of child
    collections are not changed by this function.
    */
    obj.catalogUpdateColl = function (a_coll, a_ctx, a_visited = {}) {
        var ctx;

        if (a_ctx) {
            ctx = {
                pub: a_coll.public || a_ctx.pub,
                tags: new Set(a_ctx.tags),
            };
            if (a_coll.cat_tags) {
                a_coll.cat_tags.forEach(ctx.tags.add, ctx.tags);
            }
            a_visited[a_coll._id] = ctx;
        } else {
            // First collection - must compute pub/tags from parent collections
            ctx = obj.catalogCalcParCtxt(a_coll, a_visited);
        }

        var p,
            par,
            _ctx,
            tmp,
            item,
            items = obj.db.item.byExample({
                _from: a_coll._id,
            });

        while (items.hasNext()) {
            item = items.next();

            if (item._to.charAt(0) == "c") {
                par = obj.db.c.document(item._to);
                obj.catalogUpdateColl(par, ctx, a_visited);
            } else {
                // TODO Refactor to use catalogUpdateRecord function

                // Determine if this record is published by other collections
                par = obj.db.item.byExample({
                    _to: item._to,
                });
                _ctx = ctx;

                while (par.hasNext()) {
                    p = par.next();

                    if (p._from != a_coll._id) {
                        //console.log("chk link to ",p._from );
                        // Record has a parent outside of starting collection tree
                        tmp = a_visited[p._from];
                        if (!tmp) {
                            //console.log("not visited");

                            tmp = obj.db.c.document(p._from);
                            //console.log("loaded",tmp);
                            tmp = obj.catalogCalcParCtxt(tmp, a_visited);
                        }

                        //console.log("ctx",tmp);

                        // Only merge tags if this parent coll is public (or has public ancestor)
                        if (tmp.pub) {
                            //console.log("merge");

                            // Create new context for record if needed
                            if (_ctx === ctx) {
                                _ctx = {
                                    pub: ctx.pub,
                                    tags: new Set(ctx.tags),
                                };
                            }

                            _ctx.pub = _ctx.pub || tmp.pub;
                            tmp.tags.forEach(_ctx.tags.add, _ctx.tags);
                        }
                    } else {
                        //console.log("ignore link to ",a_coll._id );
                    }
                }

                // Update record with pub flag & tags
                obj.db._update(
                    item._to,
                    {
                        public: _ctx.pub,
                        cat_tags: _ctx.pub ? Array.from(_ctx.tags) : null,
                    },
                    {
                        keepNull: false,
                    },
                );
            }
        }
    };

    obj.topicCreate = function (a_topics, a_idx, a_par_id, a_owner_id) {
        var topic,
            par_id = a_par_id; //, doc;

        for (var i = a_idx; i < a_topics.length; i++) {
            topic = a_topics[i];

            /*if (( doc = obj.db.tag.firstExample({ _key: topic })) != null ){
                obj.db.tag.update( doc._id, { count: doc.count + 1 });
            }else{
                obj.db.tag.save({ _key: topic, count: 1 });
            }*/

            topic = obj.db.t.save(
                {
                    title: topic,
                    creator: a_owner_id,
                    coll_cnt: 1,
                },
                {
                    returnNew: true,
                },
            );
            obj.db.top.save({
                _from: topic._id,
                _to: par_id,
            });
            par_id = topic._id;
        }

        return par_id;
    };

    obj.topicLink = function (a_topic, a_coll_id, a_owner_id) {
        var i,
            topics = a_topic.split(".");

        // Detect misplaced topic delimiters
        for (i in topics) {
            if (topics[i].length === 0) throw [obj.ERR_INVALID_PARAM, "Invalid category"];
        }

        var topic, parent; //,tag;

        // Find or create top-level topics
        parent = obj.db._query("for i in t filter i.top == true && i.title == @title return i", {
            title: topics[0],
        });

        if (parent.hasNext()) {
            parent = parent.next();

            // Increment coll_cnt
            obj.db.t.update(parent._id, {
                coll_cnt: parent.coll_cnt + 1,
            });
            parent = parent._id;

            /*if (( tag = obj.db.tag.firstExample({ _key: topics[0] })) != null ){
                obj.db.tag.update( tag._id, { count: tag.count + 1 });
            }else{
                obj.db.tag.save({ _key: topics[0], count: 1 });
            }*/

            for (i = 1; i < topics.length; i++) {
                topic = obj.db._query(
                    "for v in 1..1 inbound @par top filter v.title == @title filter is_same_collection('t',v) return v",
                    {
                        par: parent,
                        title: topics[i],
                    },
                );
                if (topic.hasNext()) {
                    parent = topic.next();
                    // Increment coll_cnt
                    obj.db.t.update(parent._id, {
                        coll_cnt: parent.coll_cnt + 1,
                    });

                    /*if (( tag = obj.db.tag.firstExample({ _key: topics[i] })) != null ){
                        obj.db.tag.update( tag._id, { count: tag.count + 1 });
                    }else{
                        obj.db.tag.save({ _key: topics[i], count: 1 });
                    }*/

                    parent = parent._id;
                } else {
                    parent = this.topicCreate(topics, i, parent, a_owner_id);
                    break;
                }
            }
        } else {
            parent = obj.db.t.save(
                {
                    title: topics[0],
                    top: true,
                    creator: a_owner_id,
                    coll_cnt: 1,
                },
                {
                    returnNew: true,
                },
            )._id;

            parent = this.topicCreate(topics, 1, parent, a_owner_id);
        }

        if (
            !obj.db.top.firstExample({
                _from: a_coll_id,
                _to: parent,
            })
        ) {
            obj.db.top.save({
                _from: a_coll_id,
                _to: parent,
            });
        }
    };

    obj.topicUnlink = function (a_coll_id) {
        //console.log("topicUnlink");
        var top_lnk = obj.db.top.firstExample({
            _from: a_coll_id,
        });
        if (!top_lnk) {
            return;
        }

        // Save parent topic id, delete link from collection
        var topic,
            topic_id = top_lnk._to,
            dec_only = false; //, tags = [];
        //console.log("rem top lnk",top_lnk._id);
        obj.db.top.remove(top_lnk);

        // Unwind path, deleting orphaned, non-admin topics along the way
        while (topic_id) {
            topic = obj.db.t.document(topic_id);

            // Decrement coll_cnt
            obj.db.t.update(topic._id, {
                coll_cnt: topic.coll_cnt - 1,
            });

            //tags.push( topic.title );

            // If parent is admin controlled, or other topics are linked to parent, stop
            if (
                dec_only ||
                topic.admin ||
                obj.db.top.firstExample({
                    _to: topic_id,
                })
            ) {
                //console.log("stop no del topic",topic);
                dec_only = true;
                top_lnk = obj.db.top.firstExample({
                    _from: topic_id,
                });
                if (top_lnk) {
                    topic_id = top_lnk._to;
                } else {
                    break;
                }
            } else {
                top_lnk = obj.db.top.firstExample({
                    _from: topic_id,
                });

                if (top_lnk) {
                    topic_id = top_lnk._to;
                    //console.log("rem topic",top_lnk._from);
                    obj.graph.t.remove(top_lnk._from);
                } else {
                    //console.log("rem topic",topic_id);
                    obj.graph.t.remove(topic_id);
                    topic_id = null;
                }
            }
        }

        //obj.removeTags( tags );
    };

    obj.getParents = function (item_id) {
        var p,
            idx = 0,
            parents,
            results = [];

        parents = obj.db.item.byExample({
            _to: item_id,
        });
        if (!parents.hasNext()) return [[]];

        while (parents.hasNext()) {
            p = parents.next();
            p = obj.db.c.document(p._from);

            results.push([
                {
                    id: p._id,
                    title: p.title,
                    alias: p.alias,
                },
            ]);

            p = obj.db.item.firstExample({
                _to: p._id,
            });
            while (p) {
                p = obj.db.c.document(p._from);
                results[idx].push({
                    id: p._id,
                    title: p.title,
                    alias: p.alias,
                });
                p = obj.db.item.firstExample({
                    _to: p._id,
                });
            }
            idx++;
        }

        // Sort paths alphabetically as in collection listings
        results.sort(function (a, b) {
            var i, j;
            if (a.length < b.length) {
                for (i = a.length - 1, j = b.length - 1; i >= 0; i--, j--) {
                    if (a[i].title < b[j].title) return -1;
                    else if (a[i].title > b[j].title) return 1;
                }
                return 1;
            } else {
                for (i = a.length - 1, j = b.length - 1; j >= 0; i--, j--) {
                    if (a[i].title < b[j].title) return -1;
                    else if (a[i].title > b[j].title) return 1;
                }
                return -1;
            }
        });

        return results;
    };

    obj.makeTitleUnique = function (a_parent_id, a_doc) {
        var conflicts = obj.db._query(
            "for v in 1..1 outbound @coll item filter is_same_collection(@type,v) and v.title == @title return {id:v._id}",
            {
                coll: a_parent_id,
                title: a_doc.title,
                type: a_doc._id.charAt(0),
            },
        );

        if (conflicts.hasNext()) {
            obj.db._update(a_doc._id, {
                title: a_doc.title + "_" + a_doc._key,
            });
        }
    };

    obj.hasAnyCommonAccessScope = function (src_item_id, dst_coll_id) {
        //console.log("hasAnyCommonAccessScope",src_item_id, dst_coll_id);

        if (src_item_id[0] == "c") {
            // Collections can only be linked in one place, can use hasCommonAccessScope on parent
            var parent = obj.db.item.firstExample({
                _to: src_item_id,
            });
            if (!parent) return false;
            else {
                return obj.hasCommonAccessScope(parent._from, dst_coll_id);
            }
        } else {
            var parents = obj.db.item.byExample({
                _to: src_item_id,
            });
            while (parents.hasNext()) {
                if (obj.hasCommonAccessScope(parents.next()._from, dst_coll_id)) return true;
            }
        }

        return false;
    };

    obj.hasCommonAccessScope = function (src_coll_id, dst_coll_id) {
        //console.log("hasCommonAccessScope",src_coll_id, dst_coll_id);
        var p1 = [src_coll_id],
            p2 = [dst_coll_id];
        var parent,
            child = src_coll_id;

        for (;;) {
            parent = obj.db.item.firstExample({
                _to: child,
            });
            if (!parent) break;
            p1.unshift(parent._from);
            child = parent._from;
        }

        child = dst_coll_id;

        for (;;) {
            parent = obj.db.item.firstExample({
                _to: child,
            });
            if (!parent) break;
            p2.unshift(parent._from);
            child = parent._from;
        }

        var i,
            len = Math.min(p1.length, p2.length);

        for (i = 0; i < len; i++) {
            if (p1[i] != p2[i]) break;
        }
        //console.log("hasCommonAccessScope",p1, p2,i);

        if (i === 0) {
            return false;
        }

        // If ANY ACLs or default permissions are set from here down, they differ in scope
        var j;

        for (j = i; j < p1.length; j++) {
            if (
                obj.db.acl.firstExample({
                    _from: p1[j],
                })
            ) {
                return false;
            }
        }

        for (j = i; j < p2.length; j++) {
            if (
                obj.db.acl.firstExample({
                    _from: p2[j],
                })
            ) {
                return false;
            }
        }

        return true;
    };

    obj.hasPublicRead = function (a_id) {
        console.log("Has public read a_id is ", a_id);
        // Check for local topic on collections
        if (a_id.startsWith("c/")) {
            var col = obj.db.c.document(a_id);
            if (col.topic) return true;
        }

        var i,
            children = [a_id],
            parents;

        for (;;) {
            // Find all parent collections owned by object owner
            parents = obj.db
                ._query(
                    "for i in @children for v in 1..1 inbound i item return {_id:v._id,topic:v.topic}",
                    {
                        children: children,
                    },
                )
                .toArray();
            console.log("children are ", children, " parents are, ", parents);
            if (parents.length === 0) return false;

            for (i in parents) {
                if (parents[i].topic) {
                    return true;
                }
            }
            children = parents;
        }
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

    obj.getACLOwnersBySubject = function (subject, inc_users, inc_projects) {
        var results = [];

        /* Get users and projects that have shared data or collections with subject:
        - Any user that shares a record or collection directly with the subject, or with a group that the subject is a member
        - Any non-associated project that shares a record or collection directly with the subject, or with a group that the subject is a member
        - Non-associated projects are prejects where the subject is not the owner, an admin, or a member
        */

        if (inc_users || inc_projects) {
            var ids = new Set(),
                ignore = new Set(),
                owner_id,
                acl,
                acls = obj.db.acl.byExample({
                    _to: subject,
                });

            // Find direct ACLs (not through a group)
            while (acls.hasNext()) {
                acl = acls.next();
                owner_id = obj.db.owner.firstExample({
                    _from: acl._from,
                })._to;

                if (owner_id.charAt(0) == "p") {
                    if (inc_projects) {
                        if (ids.has(owner_id) || ignore.has(owner_id)) continue;

                        if (obj.getProjectRole(subject, owner_id) == obj.PROJ_NO_ROLE) {
                            ids.add(owner_id);
                        } else {
                            ignore.add(owner_id);
                        }
                    }
                } else if (inc_users) {
                    ids.add(owner_id);
                }
            }

            // Find indirect ACLs (through a group)
            var mem,
                members = obj.db.member.byExample({
                    _to: subject,
                });
            while (members.hasNext()) {
                mem = members.next();
                // Group must have at least one ACL set; otherwise ignore it
                if (
                    obj.db.acl.firstExample({
                        _to: mem._from,
                    })
                ) {
                    owner_id = obj.db.owner.firstExample({
                        _from: mem._from,
                    })._to;

                    if (owner_id.charAt(0) == "p") {
                        if (inc_projects) {
                            if (ids.has(owner_id) || ignore.has(owner_id)) continue;

                            if (obj.getProjectRole(subject, owner_id) == obj.PROJ_NO_ROLE) {
                                ids.add(owner_id);
                            } else {
                                ignore.add(owner_id);
                            }
                        }
                    } else if (inc_users) {
                        ids.add(owner_id);
                    }
                }
            }

            var doc, title;

            ids.forEach(function (id) {
                doc = obj.db._document(id);
                if (doc.title) title = doc.title;
                else title = doc.name_last + ", " + doc.name_first;
                results.push({
                    id: doc._id,
                    title: title,
                    owner: doc.owner,
                });
            });

            results.sort(function (a, b) {
                if (a.id < b.id) return -1;
                else if (a.id > b.id) return 1;
                else return 0;
            });
        }

        return results;
    };

    obj.usersWithClientACLs = function (client_id, id_only) {
        var result;
        if (id_only) {
            result = obj.db
                ._query(
                    "for x in union_distinct((for v in 2..2 inbound @user acl, outbound owner filter is_same_collection('u',v) return v._id),(for v,e,p in 3..3 inbound @user member, acl, outbound owner filter is_same_collection('g',p.vertices[1]) and is_same_collection('acl',p.edges[1]) and is_same_collection('u',v) return v._id)) return x",
                    {
                        user: client_id,
                    },
                )
                .toArray();
        } else {
            result = obj.db
                ._query(
                    "for x in union_distinct((for v in 2..2 inbound @user acl, outbound owner filter is_same_collection('u',v) return {uid:v._id,name:v.name}),(for v,e,p in 3..3 inbound @user member, acl, outbound owner filter is_same_collection('g',p.vertices[1]) and is_same_collection('acl',p.edges[1]) and is_same_collection('u',v) return {uid:v._id,name:v.name})) sort x.name return x",
                    {
                        user: client_id,
                    },
                )
                .toArray();
        }
        //console.log("usersWithACLs:",result);
        return result;
    };

    obj.projectsWithClientACLs = function (client_id, id_only) {
        // Get projects that have ACLs set for client AND where client is not owner, admin, or member of project
        var result;
        if (id_only) {
            result = obj.db._query(
                "for i in minus((for v in 2..2 inbound @user member, acl, outbound owner filter is_same_collection('p',v) return v._id),(for v,e,p in 2..2 inbound @user member, outbound owner filter p.vertices[1].gid == 'members' and is_same_collection('p',v) return v._id)) return i",
                {
                    user: client_id,
                },
            );
        } else {
            result = obj.db._query(
                "for i in minus((for v in 2..2 inbound @user member, acl, outbound owner filter is_same_collection('p',v) return {id:v._id,title:v.title}),(for v,e,p in 2..2 inbound @user member, outbound owner filter p.vertices[1].gid == 'members' and is_same_collection('p',v) return {id:v._id,title:v.title})) return i",
                {
                    user: client_id,
                },
            );
        }
        //console.log("projectsWithACLs:",result);
        return result.toArray();
    };

    obj.checkDependencies = function (id, src, depth) {
        //console.log("checkdep ",id,src,depth);

        var dep,
            deps = obj.db._query("for v in 1..1 outbound @id dep return v._id", {
                id: id,
            });
        if (!depth || depth < 50) {
            //console.log("checkdep depth ok");
            while (deps.hasNext()) {
                //console.log("has next");
                dep = deps.next();
                if (dep == src)
                    throw [
                        obj.ERR_INVALID_PARAM,
                        "Circular dependency detected in references, from " + id,
                    ];
                obj.checkDependencies(dep, src ? src : id, depth + 1);
            }
        }
    };

    // Returns bitmask: CLOSED_BIT (1) | OPEN_TYPE_INH (4) | OPEN_TYPE (4) | ACTIVE_TYPE (4)

    //obj.annotationGetMask = function( a_client, a_subj_id, a_admin ){
    obj.getNoteMask = function (a_client, a_subj, a_admin) {
        var mask = 0,
            res,
            n,
            b,
            id = a_subj.id || a_subj._id;

        if (a_client) {
            if (a_admin || (a_admin === undefined && obj.hasAdminPermObject(a_client, id))) {
                // Owner/admin - return notes that are open or active
                res = obj.db._query(
                    "for n in 1..1 outbound @id note return {type:n.type,state:n.state,parent_id:n.parent_id}",
                    {
                        id: id,
                    },
                );
            } else {
                // Non-owner - return notes that are active
                // Creator - return notes that are open or active
                res = obj.db._query(
                    "for n in 1..1 outbound @id note filter n.state == 2 || n.creator == @client return {type:n.type,state:n.state,parent_id:n.parent_id}",
                    {
                        id: id,
                        client: a_client._id,
                    },
                );
            }
        } else {
            // Annonymous - return notes that are active
            res = obj.db._query(
                "for n in 1..1 outbound @id note filter n.state == 2 return {type:n.type,state:n.state,parent_id:n.parent_id}",
                {
                    id: id,
                },
            );
        }

        // Shift note type bits based on inherited, open, active state
        while (res.hasNext()) {
            n = res.next();

            if (n.state == obj.NOTE_CLOSED) {
                mask |= obj.NOTE_MASK_CLS_ANY;
            } else {
                b = 1 << n.type;
                if (n.parent_id && n.state == obj.NOTE_OPEN) b <<= 8;
                else if (n.state == obj.NOTE_OPEN) b <<= 4;

                mask |= b;
            }
        }

        if (a_subj.md_err) {
            mask |= obj.NOTE_MASK_MD_ERR;
        }

        return mask;
    };

    obj.annotationInitDependents = function (a_client, a_parent_note, a_updates) {
        //console.log("annotationInitDependents",a_parent_note._id);

        var subj = obj.db._document(a_parent_note.subject_id),
            note,
            dep,
            deps = obj.db._query("for v,e in 1..1 inbound @id dep filter e.type < 2 return v", {
                id: subj._id,
            }),
            time = Math.floor(Date.now() / 1000),
            new_note = {
                state: obj.NOTE_OPEN,
                type: a_parent_note.type,
                parent_id: a_parent_note._id,
                creator: a_parent_note.creator,
                ct: time,
                ut: time,
                title: a_parent_note.title,
                comments: [
                    {
                        user: a_parent_note.creator,
                        new_type: a_parent_note.type,
                        new_state: obj.NOTE_OPEN,
                        time: time,
                        comment:
                            "Impact assessment needed due to issue on direct ancestor '" +
                            a_parent_note.subject_id +
                            "'. Original issue description: \"" +
                            a_parent_note.comments[0].comment +
                            '"',
                    },
                ],
            };

        // Create new linked annotation for each dependent
        while (deps.hasNext()) {
            dep = deps.next();
            //console.log("dep:",dep._id);
            new_note.subject_id = dep._id;
            note = obj.db.n.save(new_note, {
                returnNew: true,
            });
            obj.db.note.save({
                _from: dep._id,
                _to: note.new._id,
            });
            obj.db.note.save({
                _from: note.new._id,
                _to: a_parent_note._id,
            });

            // Add update listing data if not present
            if (!(dep._id in a_updates)) {
                dep.notes = obj.getNoteMask(a_client, dep);
                // remove larger unnecessary fields
                delete dep.desc;
                delete dep.md;
                a_updates[dep._id] = dep;
            }
        }
    };

    /* Called when a parent annotation state or type is changed. If type is changed to error or warning, change all
    children to match. For other types, close all children. For errors and warnings, if state is changed to active,
    reopen any closed children; otherwise, if open or closed, close all children. For child notes that have already
    been activated, must recurse to all children as needed. */
    obj.annotationUpdateDependents = function (
        a_client,
        a_parent_note,
        a_prev_type,
        a_prev_state,
        a_updates,
    ) {
        if (
            a_parent_note.type == a_prev_type &&
            (a_parent_note.state == a_prev_state ||
                (a_parent_note.state != obj.NOTE_ACTIVE && a_prev_state != obj.NOTE_ACTIVE))
        )
            return;

        var time = Math.floor(Date.now() / 1000),
            upd = {
                type: a_parent_note.type,
                ut: time,
            },
            comment = {
                user: a_client._id,
                time: time,
            };

        if (a_parent_note.type != a_prev_type) comment.new_type = a_parent_note.type;

        if (a_parent_note.state != a_prev_state) comment.new_state = a_parent_note.state;

        if (a_parent_note.type >= obj.NOTE_WARN && a_parent_note.state == obj.NOTE_ACTIVE) {
            upd.state = obj.NOTE_OPEN;
            comment.comment = "Impact reassessment needed due to change of ";

            if (a_parent_note.type != a_prev_type && a_parent_note.state != a_prev_state)
                comment.comment += "type and state";
            else if (a_parent_note.state != a_prev_state) comment.comment += "type";
            else comment.comment += "state";
        } else {
            upd.state = obj.NOTE_CLOSED;
            comment.comment = "Impact assessment invalidated due to change of state";
        }

        comment.comment += " of annotaion on ancestor '" + a_parent_note.subject_id + "'.";

        var context = {
            client: a_client,
            note_upd: upd,
            comment: comment,
            updates: a_updates,
        };

        // Recurse full tree only if type is changing or state is changed from active to open or closed
        if (
            comment.new_type != undefined ||
            (a_parent_note.state != obj.NOTE_ACTIVE && a_prev_state == obj.NOTE_ACTIVE)
        )
            context.recurse = true;

        obj.annotationUpdateDependents_Recurse(a_parent_note._id, context);
    };

    obj.annotationUpdateDependents_Recurse = function (a_note_id, a_context, a_close) {
        var old_state,
            note,
            subj,
            deps = obj.db._query(
                "for v in 1..1 inbound @id note filter is_same_collection('n',v) return v",
                {
                    id: a_note_id,
                },
            );

        if (a_close) {
            old_state = a_context.note_upd.state;
            a_context.note_upd.state = obj.NOTE_CLOSED;
        }

        while (deps.hasNext()) {
            note = deps.next();

            a_context.note_upd.comments = note.comments;
            a_context.note_upd.comments.push(a_context.comment);

            obj.db._update(note._id, a_context.note_upd);

            // Add/refresh update listing data
            if (note.subject_id in a_context.updates) {
                a_context.updates[note.subject_id].notes = obj.getNoteMask(
                    a_context.client,
                    a_context.updates[note.subject_id],
                );
            } else {
                subj = obj.db._document(note.subject_id);
                subj.notes = obj.getNoteMask(a_context.client, subj);
                // remove larger unnecessary fields
                delete subj.desc;
                delete subj.md;
                a_context.updates[note.subject_id] = subj;
            }

            if (a_context.recurse)
                obj.annotationUpdateDependents_Recurse(note._id, a_context, true);
        }

        if (a_close) {
            a_context.note_upd.state = old_state;
        }
    };

    obj.annotationDelete = function (a_id, a_update_ids) {
        //console.log("delete note:",a_id);
        var n,
            notes = obj.db.note.byExample({
                _to: a_id,
            });

        while (notes.hasNext()) {
            n = notes.next();
            if (n._from.startsWith("n/")) {
                obj.annotationDelete(n._from, a_update_ids);
            }
        }

        n = obj.db.n.document(a_id);
        if (a_update_ids) a_update_ids.add(n.subject_id);
        obj.graph.n.remove(a_id);
    };

    obj.annotationDependenciesUpdated = function (
        a_data,
        a_dep_ids_added,
        a_dep_ids_removed,
        a_update_ids,
    ) {
        //console.log("annotationDependenciesUpdated",a_data._id);
        // Called when dependencies are added/removed to/from existing/new data record
        var res, qry_res;

        a_update_ids.add(a_data._id);

        if (a_dep_ids_removed) {
            //console.log("deletings notes from:",a_data._id);

            // Find local annotations linked to upstream dependencies
            qry_res = obj.db._query(
                "for v,e,p in 3..3 any @src note filter is_same_collection('d',v) && p.edges[1]._from == p.vertices[1]._id return {src: p.vertices[1], dst: p.vertices[3]}",
                {
                    src: a_data._id,
                },
            );

            while (qry_res.hasNext()) {
                res = qry_res.next();
                //console.log("examine:",res.dst._id);

                if (a_dep_ids_removed.has(res.dst._id)) {
                    // Delete local and downstream annotations
                    obj.annotationDelete(res.src._id, a_update_ids);
                } else {
                    //console.log("not removed:",res.dst._id);
                }
            }
        }

        if (a_dep_ids_added) {
            //console.log("deps added:",Array.from( a_dep_ids_added ));
            // Get all annotations from new dependencies that may need to be propagated
            qry_res = obj.db._query(
                "for i in @src for v in 1..1 outbound i note filter v.type > 1 return v",
                {
                    src: Array.from(a_dep_ids_added),
                },
            );

            if (qry_res.hasNext()) {
                var time = Math.floor(Date.now() / 1000),
                    new_note;

                while (qry_res.hasNext()) {
                    res = qry_res.next();
                    //console.log("dep:",res);

                    // Only need to propagate if dependents are already present or state is active
                    if (
                        res.state == obj.NOTE_ACTIVE ||
                        obj.db.note
                            .byExample({
                                _to: res._id,
                            })
                            .count() > 1
                    ) {
                        //console.log("propagate");
                        new_note = {
                            state: obj.NOTE_OPEN,
                            type: res.type,
                            parent_id: res._id,
                            creator: res.creator,
                            subject_id: a_data._id,
                            ct: time,
                            ut: time,
                            title: res.title,
                            comments: [
                                {
                                    user: res.creator,
                                    new_type: res.type,
                                    new_state: obj.NOTE_OPEN,
                                    time: time,
                                    comment:
                                        "Impact assessment needed due to issue on direct ancestor '" +
                                        res.subject_id +
                                        "'. Original issue description: \"" +
                                        res.comments[0].comment +
                                        '"',
                                },
                            ],
                        };

                        new_note = obj.db.n.save(new_note, {
                            returnNew: true,
                        }).new;
                        obj.db.note.save({
                            _from: a_data._id,
                            _to: new_note._id,
                        });
                        obj.db.note.save({
                            _from: new_note._id,
                            _to: res._id,
                        });
                    }
                }
            }
        }
    };

    obj.addTags = function (a_tags) {
        //console.log("addTags",a_tags);

        var id, tag, j, code;

        for (var i in a_tags) {
            tag = a_tags[i].toLowerCase();
            id = "tag/" + tag;
            if (obj.db.tag.exists(id)) {
                //console.log( "update", id );
                tag = obj.db.tag.document(id);
                obj.db._update(id, {
                    count: tag.count + 1,
                });
            } else {
                //console.log( "save", id );
                if (tag.length > 40)
                    throw [obj.ERR_INVALID_PARAM, "Tag too long (max 40 characters)."];

                for (j = 0; j < tag.length; j++) {
                    code = tag.charCodeAt(j);
                    if (
                        !(code > 47 && code < 58) && // numeric (0-9)
                        !(code > 96 && code < 123) && // lower alpha (a-z)
                        code !== 45
                    )
                        // "-"
                        throw [obj.ERR_INVALID_CHAR, "Invalid character(s) in tag."];
                }

                obj.db.tag.save({
                    _key: tag,
                    count: 1,
                });
            }
        }
    };

    obj.removeTags = function (a_tags) {
        //console.log("removeTags",a_tags);

        var id, tag;
        for (var i in a_tags) {
            id = "tag/" + a_tags[i].toLowerCase();
            if (obj.db.tag.exists(id)) {
                tag = obj.db.tag.document(id);
                if (tag.count > 1) {
                    //console.log("update",id);
                    obj.db._update(id, {
                        count: tag.count - 1,
                    });
                } else {
                    //console.log("remove",id);
                    obj.db._remove(id);
                }
            }
        }
    };

    obj.saveRecentGlobusPath = function (a_client, a_path, a_mode) {
        var path = a_path,
            idx = a_path.lastIndexOf("/");

        if (a_mode == obj.TT_DATA_PUT) {
            // For PUT, strip off filename but keep last slash
            if (idx > 0) path = a_path.substr(0, idx + 1);
        } else {
            // For GET, make sure path ends in a slash
            if (idx != a_path.length - 1) path += "/";
        }

        if (a_client.eps && a_client.eps.length) {
            idx = a_client.eps.indexOf(path);
            if (idx == -1) {
                if (a_client.eps.unshift(path) > 20) {
                    a_client.eps.length = 20;
                }
            } else {
                a_client.eps.splice(idx, 1);
                a_client.eps.unshift(path);
            }
        } else {
            a_client.eps = [path];
        }

        obj.db._update(a_client._id, {
            eps: a_client.eps,
        });
    };

    // All col IDs are from same scope (owner), exapnd to include all readable sub-collections
    // Collections must exist
    // TODO This would be more efficient as a recursive function
    obj.expandSearchCollections2 = function (a_client, a_col_ids) {
        var cols = new Set(a_col_ids),
            c,
            col,
            cur,
            next = a_col_ids,
            perm,
            child;

        while (next) {
            cur = next;
            next = [];

            for (c in cur) {
                col = obj.db.c.document(cur[c]);

                if (obj.hasAdminPermObject(a_client, col._id)) {
                    child = obj.db._query(
                        "for i in 1..10 outbound @col item filter is_same_collection('c',i) return i._id",
                        {
                            col: col._id,
                        },
                    );

                    if (!cols.has(col._id)) {
                        cols.add(col._id);
                    }

                    while (child.hasNext()) {
                        col = child.next();
                        if (!cols.has(col)) {
                            cols.add(col);
                        }
                    }
                } else {
                    perm = obj.getPermissionsLocal(
                        a_client._id,
                        col,
                        true,
                        obj.PERM_RD_REC | obj.PERM_LIST,
                    );

                    if (
                        perm.grant &
                        ((obj.PERM_RD_REC | obj.PERM_LIST) != (obj.PERM_RD_REC | obj.PERM_LIST))
                    ) {
                        throw [
                            obj.ERR_PERM_DENIED,
                            "Permission denied for collection '" + col._id + "'",
                        ];
                    }

                    if (!cols.has(col._id)) {
                        cols.add(col._id);
                    }

                    if (
                        perm.inhgrant &
                        ((obj.PERM_RD_REC | obj.PERM_LIST) == (obj.PERM_RD_REC | obj.PERM_LIST))
                    ) {
                        child = obj.db._query(
                            "for i in 1..10 outbound @col item filter is_same_collection('c',i) return i._id",
                            {
                                col: col._id,
                            },
                        );
                        while (child.hasNext()) {
                            col = child.next();
                            if (!cols.has(col)) {
                                cols.add(col);
                            }
                        }
                    } else {
                        child = obj.db._query(
                            "for i in 1..1 outbound @col item filter is_same_collection('c',i) return i._id",
                            {
                                col: col._id,
                            },
                        );
                        while (child.hasNext()) {
                            next.push(child.next());
                        }
                    }
                }
            }
        }

        return Array.from(cols);
    };

    obj.expandSearchCollections = function (a_client, a_col_ids) {
        var cols = new Set();
        for (var c in a_col_ids) {
            obj.expandSearchCollections_recurse(a_client, cols, a_col_ids[c]);
        }
        return Array.from(cols);
    };

    obj.expandSearchCollections_recurse = function (a_client, a_cols, a_col_id, a_inh_perm) {
        if (!a_cols.has(a_col_id)) {
            //console.log("expColl",a_col_id,"inh:",a_inh_perm);
            var col, res;
            if (obj.hasAdminPermObject(a_client, a_col_id)) {
                a_cols.add(a_col_id);
                //console.log("has admin");
                res = obj.db._query(
                    "for i in 1..10 outbound @col item filter is_same_collection('c',i) return i._id",
                    {
                        col: a_col_id,
                    },
                );
                while (res.hasNext()) {
                    col = res.next();
                    if (!a_cols.has(col)) {
                        a_cols.add(col);
                    }
                }
            } else {
                col = obj.db.c.document(a_col_id);

                var perm = obj.getPermissionsLocal(
                    a_client._id,
                    col,
                    a_inh_perm == undefined ? true : false,
                    obj.PERM_RD_REC | obj.PERM_LIST,
                );
                //console.log("perm",perm);

                if (
                    ((perm.grant | perm.inherited | a_inh_perm) &
                        (obj.PERM_RD_REC | obj.PERM_LIST)) !=
                    (obj.PERM_RD_REC | obj.PERM_LIST)
                ) {
                    if (a_inh_perm == undefined) {
                        // Only throw a PERM_DENIED error if this is one of the user-specified collections (not a child)
                        throw [
                            obj.ERR_PERM_DENIED,
                            "Permission denied for collection '" + col._id + "'",
                        ];
                    } else {
                        // Don't have access - skip
                        return;
                    }
                }

                //console.log("have access", perm.grant | perm.inherited | a_inh_perm );

                a_cols.add(a_col_id);

                if (
                    ((perm.inhgrant | perm.inherited | a_inh_perm) &
                        (obj.PERM_RD_REC | obj.PERM_LIST)) ==
                    (obj.PERM_RD_REC | obj.PERM_LIST)
                ) {
                    //console.log("have all inh perms");

                    res = obj.db._query(
                        "for i in 1..10 outbound @col item filter is_same_collection('c',i) return i._id",
                        {
                            col: a_col_id,
                        },
                    );
                    while (res.hasNext()) {
                        col = res.next();
                        if (!a_cols.has(col)) {
                            a_cols.add(col);
                        }
                    }
                } else {
                    res = obj.db._query(
                        "for i in 1..1 outbound @col item filter is_same_collection('c',i) return i._id",
                        {
                            col: col._id,
                        },
                    );
                    perm = perm.inhgrant | perm.inherited | a_inh_perm;
                    //console.log("not all inh perms", perm);

                    while (res.hasNext()) {
                        obj.expandSearchCollections_recurse(a_client, a_cols, res.next(), perm);
                    }
                }
            }
        }
    };

    /**
     * Parses other_token_data string field and breaks it into pieces
     *
     * @param {integer} token_type - Type to determine parse logic.
     *
     * @param {string} other_token_data
     *
     * String of additional token data, delimited by the '|' character.
     * The format is determined by the token type.
     * Currently expecting the following formats:
     *
     * GLOBUS_TRANSFER: "<UUID>|<scopes>"
     * @returns {{}} Object containing the parsed key/values of the input other_token_data string.
     * @throws obj.ERR_INVALAD_PARAM
     *
     * @example
     * // returns { uuid: "1cbaaee5-b938-4a4e-87a8-f1ec4d5d92f9", scopes: "urn:globus:auth:scope:transfer.api.globus.org:all+email" }
     * parseOtherTokenData(AccessTokenType.GLOBUS_TRANSFER, "1cbaaee5-b938-4a4e-87a8-f1ec4d5d92f9|urn:globus:auth:scope:transfer.api.globus.org:all+email");
     */
    obj.parseOtherTokenData = (token_type, other_token_data) => {
        let return_data = {};
        // TODO: other token types
        if (token_type === obj.AccessTokenType.GLOBUS_TRANSFER) {
            // TODO: add support for additional type of collection and HA fields
            // TODO: callers and jsdocs will need to be updated if changes are made to assumed data
            // GLOBUS_TRANSFER parse currently assumes uuid and scopes exist, but this may change
            const parsed_data = other_token_data.split("|");
            if (parsed_data.length !== 2) {
                throw [obj.ERR_INVALID_PARAM, "Unexpected count of additional token data provided"];
            }

            const parsed_uuid = parsed_data[0];
            if (!obj.isUUID(parsed_uuid)) {
                throw [
                    obj.ERR_INVALID_PARAM,
                    "Provided other_token_data does not follow format of '<UUID>|<scopes>'",
                ];
            }
            const parsed_scopes = parsed_data[1];
            if (!parsed_scopes.includes("transfer.api.globus.org")) {
                // TODO: does this need validation, and is this validation sufficient?
                throw [
                    obj.ERR_INVALID_PARAM,
                    "Scopes included in other_token_data do not refer to transfer resource, but transfer resource was specified",
                ];
            }
            return_data = {
                ...return_data,
                uuid: parsed_uuid,
                scopes: parsed_scopes,
            };
        }
        return return_data;
    };

    return obj;
})();
