"use strict";

// Integration test of API
const chai = require("chai");
const should = chai.should();
const expect = chai.expect;
const request = require("@arangodb/request");
const { baseUrl } = module.context;

describe("the Foxx microservice version route.", () => {
    it("unit_version: should return version information about the release and the foxx service and api versions.", () => {
        const response = request.get(`${baseUrl}/version`);
        expect(response.status).to.equal(200);
        var object = JSON.parse(response.body);
        object.should.have.property("release_year");
        object.should.have.property("release_month");
        object.should.have.property("release_day");
        object.should.have.property("release_hour");
        object.should.have.property("release_minute");
    });
});
