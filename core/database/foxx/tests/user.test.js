"use strict"

// Integration test of API
const chai = require("chai");
const should = chai.should();
const expect = chai.expect;
const assert = chai.assert;
const request = require("@arangodb/request");
const {
    baseUrl
} = module.context;

// Define the endpoint path
const endpoint = `${baseUrl}/token/set`;

// Helper function to make requests with default parameters
function makeRequest(params) {
    return request.get(endpoint, { qs: params });
}

describe("Token Set API", () => {

    it("should set tokens with valid parameters", () => {
        const params = {
            client: "validClientId",
            access: "validAccessToken",
            refresh: "validRefreshToken",
            expires_in: 3600
        };
        
        const response = makeRequest(params);
        
        response.statusCode.should.equal(200);
        expect(response.json).to.be.an("object");
        expect(response.json).to.have.property("result", "success");
    });

    it("should set tokens for a specified user with valid 'subject'", () => {
        const params = {
            client: "validClientId",
            subject: "existingUserId",
            access: "validAccessToken",
            refresh: "validRefreshToken",
            expires_in: 3600
        };
        
        const response = makeRequest(params);
        
        response.statusCode.should.equal(200);
        expect(response.json).to.be.an("object");
        expect(response.json).to.have.property("result", "success");
    });

    it("should return an error when 'client' is missing", () => {
        const params = {
            access: "validAccessToken",
            refresh: "validRefreshToken",
            expires_in: 3600
        };
        
        const response = makeRequest(params);
        
        response.statusCode.should.equal(400);
        expect(response.json.error).to.include("client");
    });

    it("should return an error when 'access' is missing", () => {
        const params = {
            client: "validClientId",
            refresh: "validRefreshToken",
            expires_in: 3600
        };
        
        const response = makeRequest(params);
        
        response.statusCode.should.equal(400);
        expect(response.json.error).to.include("access");
    });

    it("should return an error when 'refresh' is missing", () => {
        const params = {
            client: "validClientId",
            access: "validAccessToken",
            expires_in: 3600
        };
        
        const response = makeRequest(params);
        
        response.statusCode.should.equal(400);
        expect(response.json.error).to.include("refresh");
    });

    it("should return an error when 'expires_in' is missing", () => {
        const params = {
            client: "validClientId",
            access: "validAccessToken",
            refresh: "validRefreshToken"
        };
        
        const response = makeRequest(params);
        
        response.statusCode.should.equal(400);
        expect(response.json.error).to.include("expires_in");
    });

    it("should return an error for invalid 'subject'", () => {
        const params = {
            client: "validClientId",
            subject: "nonExistingUserId",
            access: "validAccessToken",
            refresh: "validRefreshToken",
            expires_in: 3600
        };
        
        const response = makeRequest(params);
        
        response.statusCode.should.equal(400);
        expect(response.json.error).to.include("No such user");
    });

    it("should return an error for unauthorized client access to specified 'subject'", () => {
        const params = {
            client: "unauthorizedClientId",
            subject: "existingUserId",
            access: "validAccessToken",
            refresh: "validRefreshToken",
            expires_in: 3600
        };
        
        const response = makeRequest(params);
        
        response.statusCode.should.equal(403);
        expect(response.json.error).to.include("Unauthorized access");
    });

    it("should return an error for negative 'expires_in' value", () => {
        const params = {
            client: "validClientId",
            access: "validAccessToken",
            refresh: "validRefreshToken",
            expires_in: -1000
        };
        
        const response = makeRequest(params);
        
        response.statusCode.should.equal(400);
        expect(response.json.error).to.include("Invalid expiration time");
    });

    it("should return an error for non-integer 'expires_in' value", () => {
        const params = {
            client: "validClientId",
            access: "validAccessToken",
            refresh: "validRefreshToken",
            expires_in: "three hours"
        };
        
        const response = makeRequest(params);
        
        response.statusCode.should.equal(400);
        expect(response.json.error).to.include("expires_in must be an integer");
    });

});


