"use strict";

// Integration test of API
const { expect } = require("chai");
const request = require("@arangodb/request");
const { baseUrl } = module.context;
const g_db = require("@arangodb").db;

const repo_base_url = `${baseUrl}/repo`;

// NOTE: describe block strings are compared against test specification during test call, not file name
describe("integration_repo_router: the Foxx microservice repo_router create endpoint", () => {
    beforeEach(() => {
        const collections = ["repo", "d", "alloc", "loc", "repo", "admin", "g", "p", "u"];
        collections.forEach((name) => {
            let col = g_db._collection(name);
            if (col) {
                col.truncate(); // truncate after ensuring collection exists
            } else {
                g_db._create(name); // create if it doesn’t exist
            }
        });
    });

    const user_params = {
        id: "u/shredder",
        key: "shredder",
        is_admin: false
    };

    const user_params_admin = {
        id: "u/splinter",
        key: "splinter",
        is_admin: false
    };

    const user_params_raw  = {
        _key: "shredder",
        is_admin: false
    };

    const user_params_raw_admin  = {
        _key: "splinter",
        is_admin: true
    };


    const minimal_repo = {
       id: "heavymetal",
       title: "Rock On!!!!",
       capacity: 0,
       admins: ["u/shredder"],
       type: "metadata"
    };

    const minimal_repo_admin = {
       id: "heavymetal",
       title: "Rock On!!!!",
       capacity: 0,
       admins: ["u/splinter"],
       type: "metadata"
    };

    // All keys are examples
    const minimal_globus_repo_admin = {
       id: "heavymetal",
       title: "Rock On!!!!",
       capacity: 10000000000,
       admins: ["u/splinter"],
       address: "tcp://music.com",
       endpoint: "c9b1b56e-3bde-4f7d-a932-92f6c4f046b",
       path: "/mnt/nfs/large/heavymetal",
       pub_key: "Zm7W6W5vJjZZqFj7okjBOS8K9wVjHhYyLzX+zA8B" 
    };

    it("should deny creating a metadata repo without admin perms", () => {
        // arrange
        const rv = g_db.u.save(user_params_raw, { returnNew: true });
        const client_id = encodeURIComponent(user_params.id);
        const request_string = `${repo_base_url}/create?client=${client_id}`;

        // act
        const response = request.post(request_string, { body: JSON.stringify(minimal_repo), headers: { "Content-Type": "application/json" }});

        console.log(response);
        // assert
        expect(response.status).to.equal(400);
        const json = JSON.parse(response.body);
        expect(json.errorMessage).to.include("Permission Denied");
    });

    it("should create a metadata repo when user has admin perms", () => {
        // arrange
        const rv = g_db.u.save(user_params_raw_admin, { returnNew: true });
        const request_string = `${repo_base_url}/create?client=${user_params_admin.id}`;

        // act
        const response = request.post(request_string, { body: JSON.stringify(minimal_repo_admin), headers: { "Content-Type": "application/json" }});

        console.log(response);

        // assert
        expect(response.status).to.equal(200);
        const json = JSON.parse(response.body);

        expect(json).to.be.an('array').with.lengthOf(1);
        
        // Object structure
        expect(json[0]).to.have.all.keys('type', 'title', 'capacity', 'id');
        
        // Property values
        expect(json[0]).to.have.property('type', 'metadata');
        expect(json[0]).to.have.property('title', 'Rock On!!!!');
        expect(json[0]).to.have.property('capacity', 0);
        expect(json[0]).to.have.property('id', 'repo/heavymetal');
    });

    it("should fail when metadata repo is assigned a capacity greater than 0", () => {
        // arrange
        const rv = g_db.u.save(user_params_raw_admin, { returnNew: true });
        const request_string = `${repo_base_url}/create?client=${user_params_admin.id}`;

        let non_zero_capacity = JSON.parse(JSON.stringify(minimal_repo_admin));
        non_zero_capacity.capacity = 1;
        // act
        const response = request.post(request_string, { body: JSON.stringify(non_zero_capacity), headers: { "Content-Type": "application/json" }});

        console.log(response);
        // assert
        expect(response.status).to.equal(400);
        const json = JSON.parse(response.body);
        
        expect(json.errorMessage).to.include("Metadata repository capacity must be 0: capacity=1"); 
    });





    it("should fail to create a repo when id is missing", () => {
        // arrange
        const rv = g_db.u.save(user_params_raw_admin, { returnNew: true });
        const request_string = `${repo_base_url}/create?client=${user_params_admin.id}`;

        let missing_id = JSON.parse(JSON.stringify(minimal_repo_admin));
        delete missing_id.id
        // act
        const response = request.post(request_string, { body: JSON.stringify(missing_id), headers: { "Content-Type": "application/json" }});

        console.log(response);
        // assert
        expect(response.status).to.equal(400);
        const json = JSON.parse(response.body);
        console.log(json);
        expect(json.errorMessage).to.include("child \"id\" fails because [\"id\" is required]"); 
    });

    it("should fail to create a repo when title is missing", () => {
        // arrange
        const rv = g_db.u.save(user_params_raw_admin, { returnNew: true });
        const request_string = `${repo_base_url}/create?client=${user_params_admin.id}`;

        let missing_title = JSON.parse(JSON.stringify(minimal_repo_admin));
        delete missing_title.title
        // act
        const response = request.post(request_string, { body: JSON.stringify(missing_title), headers: { "Content-Type": "application/json" }});

        console.log(response);

        // assert
        expect(response.status).to.equal(400);

        const json = JSON.parse(response.body);
        expect(json.errorMessage).to.include("child \"title\" fails because [\"title\" is required]"); 
    });


    it("should fail to create a repo when capacity is missing", () => {
        // arrange
        const rv = g_db.u.save(user_params_raw_admin, { returnNew: true });
        console.log(rv);
        const request_string = `${repo_base_url}/create?client=${user_params_admin.id}`;

        let missing_capacity = JSON.parse(JSON.stringify(minimal_repo_admin));
        delete missing_capacity.capacity
        // act
        const response = request.post(request_string, { body: JSON.stringify(missing_capacity), headers: { "Content-Type": "application/json" }});

        console.log(response);
        // assert
        expect(response.status).to.equal(400);

        const json = JSON.parse(response.body);
        console.log(json);
        expect(json.errorMessage).to.include("child \"capacity\" fails because [\"capacity\" is required]"); 
    });

    it("should create a globus repo when user has admin perms", () => {
        // arrange
        const rv = g_db.u.save(user_params_raw_admin, { returnNew: true });
        console.log(rv);
        const request_string = `${repo_base_url}/create?client=${user_params_admin.id}`;

        // act
        const response = request.post(request_string, { body: JSON.stringify(minimal_globus_repo_admin), headers: { "Content-Type": "application/json" }});

        console.log(response);
        // assert
        expect(response.status).to.equal(200);
        const json = JSON.parse(response.body);

        console.log(json);
        expect(json).to.be.an('array').with.lengthOf(1);
        
        // Object structure
        expect(json[0]).to.have.all.keys('type', 'title', 'capacity', 'id', 'address', 'endpoint', 'path', 'pub_key');

        // Property values
        expect(json[0]).to.have.property('type', 'globus');
        expect(json[0]).to.have.property('title', 'Rock On!!!!');
        expect(json[0]).to.have.property('capacity', 10000000000);
        expect(json[0]).to.have.property('id', 'repo/heavymetal');
        expect(json[0]).to.have.property('address', 'tcp://music.com');
        expect(json[0]).to.have.property('endpoint', 'c9b1b56e-3bde-4f7d-a932-92f6c4f046b');
        
        // path should end with '/'
        expect(json[0]).to.have.property("path","/mnt/nfs/large/heavymetal/");
        expect(json[0]).to.have.property("pub_key","Zm7W6W5vJjZZqFj7okjBOS8K9wVjHhYyLzX+zA8B");

    });

});

