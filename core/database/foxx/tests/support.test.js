"use strict"

// Integration test of API
const chai = require("chai");
const should = chai.should();
const expect = chai.expect;
const assert = chai.assert;
const g_lib = require("../api/support")

describe("the Foxx microservice support module evaluating isUUID.", () => {
    it("unit_support: should return true if string is a UUID.", () => {
        var uuid = "XXXXYYYY-XXXX-YYYY-XXXX-YYYYXXXXYYYY"
        expect(g_lib.isUUID(uuid)).to.be.true;
    });
});

describe("the Foxx microservice support module evaluating isUUIDList.", () => {
    it("unit_support: should return true if string is a UUID List.", () => {
        var uuids = "XXXXYYYY-XXXX-YYYY-XXXX-YYYYXXXXYYYY,XXXXYYYY-XXXX-YYYY-XXXX-YYYYXXXXYYYY"
        expect(g_lib.isUUIDList(uuids)).to.be.true;
    });
    it("unit_support: should return false because one of the provided items is not a uuid", () => {
        var uuids = "XXXXYYYY-XXXX-YYYY-XXXX-YYYYXXXXYYYY,132"
        expect(g_lib.isUUIDList(uuids)).to.be.false;
    });
});
