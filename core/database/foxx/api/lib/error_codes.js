"use strict";

module.exports = (function () {

    var obj = {};
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

    return obj;
})();
