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
        is_admin: false,
    };

    const user_params_admin = {
        id: "u/splinter",
        key: "splinter",
        is_admin: false,
    };

    const user_params_raw = {
        _key: "shredder",
        is_admin: false,
    };

    const user_params_raw_admin = {
        _key: "splinter",
        is_admin: true,
    };

    const minimal_repo = {
        id: "heavymetal",
        title: "Rock On!!!!",
        capacity: 0,
        admins: ["u/shredder"],
        type: "metadata",
    };

    const minimal_repo_admin = {
        id: "heavymetal",
        title: "Rock On!!!!",
        capacity: 0,
        admins: ["u/splinter"],
        type: "metadata",
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
        pub_key: "Zm7W6W5vJjZZqFj7okjBOS8K9wVjHhYyLzX+zA8B",
    };

    it("should deny creating a metadata repo without admin perms", () => {
        // arrange
        const rv = g_db.u.save(user_params_raw, { returnNew: true });
        const client_id = encodeURIComponent(user_params.id);
        const request_string = `${repo_base_url}/create?client=${client_id}`;

        // act
        const response = request.post(request_string, {
            body: JSON.stringify(minimal_repo),
            headers: { "Content-Type": "application/json" },
        });

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
        const response = request.post(request_string, {
            body: JSON.stringify(minimal_repo_admin),
            headers: { "Content-Type": "application/json" },
        });

        console.log(response);

        // assert
        expect(response.status).to.equal(200);
        const json = JSON.parse(response.body);

        expect(json).to.be.an("array").with.lengthOf(1);

        // Object structure
        expect(json[0]).to.have.all.keys("type", "title", "capacity", "id");

        // Property values
        expect(json[0]).to.have.property("type", "metadata");
        expect(json[0]).to.have.property("title", "Rock On!!!!");
        expect(json[0]).to.have.property("capacity", 0);
        expect(json[0]).to.have.property("id", "repo/heavymetal");
    });

    it("should fail when metadata repo is assigned a capacity greater than 0", () => {
        // arrange
        const rv = g_db.u.save(user_params_raw_admin, { returnNew: true });
        const request_string = `${repo_base_url}/create?client=${user_params_admin.id}`;

        let non_zero_capacity = JSON.parse(JSON.stringify(minimal_repo_admin));
        non_zero_capacity.capacity = 1;
        // act
        const response = request.post(request_string, {
            body: JSON.stringify(non_zero_capacity),
            headers: { "Content-Type": "application/json" },
        });

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
        delete missing_id.id;
        // act
        const response = request.post(request_string, {
            body: JSON.stringify(missing_id),
            headers: { "Content-Type": "application/json" },
        });

        console.log(response);
        // assert
        expect(response.status).to.equal(400);
        const json = JSON.parse(response.body);
        console.log(json);
        expect(json.errorMessage).to.include('child "id" fails because ["id" is required]');
    });

    it("should fail to create a repo when title is missing", () => {
        // arrange
        const rv = g_db.u.save(user_params_raw_admin, { returnNew: true });
        const request_string = `${repo_base_url}/create?client=${user_params_admin.id}`;

        let missing_title = JSON.parse(JSON.stringify(minimal_repo_admin));
        delete missing_title.title;
        // act
        const response = request.post(request_string, {
            body: JSON.stringify(missing_title),
            headers: { "Content-Type": "application/json" },
        });

        console.log(response);

        // assert
        expect(response.status).to.equal(400);

        const json = JSON.parse(response.body);
        expect(json.errorMessage).to.include('child "title" fails because ["title" is required]');
    });

    it("should fail to create a repo when capacity is missing", () => {
        // arrange
        const rv = g_db.u.save(user_params_raw_admin, { returnNew: true });
        console.log(rv);
        const request_string = `${repo_base_url}/create?client=${user_params_admin.id}`;

        let missing_capacity = JSON.parse(JSON.stringify(minimal_repo_admin));
        delete missing_capacity.capacity;
        // act
        const response = request.post(request_string, {
            body: JSON.stringify(missing_capacity),
            headers: { "Content-Type": "application/json" },
        });

        console.log(response);
        // assert
        expect(response.status).to.equal(400);

        const json = JSON.parse(response.body);
        console.log(json);
        expect(json.errorMessage).to.include(
            'child "capacity" fails because ["capacity" is required]',
        );
    });

    it("should create a globus repo when user has admin perms", () => {
        // arrange
        const rv = g_db.u.save(user_params_raw_admin, { returnNew: true });
        console.log(rv);
        const request_string = `${repo_base_url}/create?client=${user_params_admin.id}`;

        // act
        const response = request.post(request_string, {
            body: JSON.stringify(minimal_globus_repo_admin),
            headers: { "Content-Type": "application/json" },
        });

        console.log(response);
        // assert
        expect(response.status).to.equal(200);
        const json = JSON.parse(response.body);

        console.log(json);
        expect(json).to.be.an("array").with.lengthOf(1);

        // Object structure
        expect(json[0]).to.have.all.keys(
            "type",
            "title",
            "capacity",
            "id",
            "address",
            "endpoint",
            "path",
            "pub_key",
        );

        // Property values
        expect(json[0]).to.have.property("type", "globus");
        expect(json[0]).to.have.property("title", "Rock On!!!!");
        expect(json[0]).to.have.property("capacity", 10000000000);
        expect(json[0]).to.have.property("id", "repo/heavymetal");
        expect(json[0]).to.have.property("address", "tcp://music.com");
        expect(json[0]).to.have.property("endpoint", "c9b1b56e-3bde-4f7d-a932-92f6c4f046b");

        // path should end with '/'
        expect(json[0]).to.have.property("path", "/mnt/nfs/large/heavymetal/");
        expect(json[0]).to.have.property("pub_key", "Zm7W6W5vJjZZqFj7okjBOS8K9wVjHhYyLzX+zA8B");
    });

       it("should list all repos when no client is provided", () => {
            g_db.repo.save({ _key: "r1", title: "Repo One", domain: "test" });
            g_db.repo.save({ _key: "r2", title: "Repo Two", domain: "test" });


        const response = request.get(`${repo_base_url}/list`);

        expect(response.status).to.equal(200);
        const json = JSON.parse(response.body);

        expect(json).to.be.an("array").with.lengthOf(2);
        expect(json[0]).to.have.property("id");
        expect(json[0]).to.not.have.property("_key");
    });
    it("should view a repo by id", () => {
    // arrange: seed users
    g_db.u.save({ _key: "shredder", is_admin: false });
    g_db.u.save({ _key: "splinter", is_admin: true });

    // arrange: seed repo
    g_db.repo.save({
        _key: "heavymetal",
        title: "Rock On!!!!",
        capacity: 0,
        type: "metadata",
    });

    // arrange: admin edges (repo -> user)
    g_db.admin.save({
        _from: "repo/heavymetal",
        _to: "u/shredder",
    });
    g_db.admin.save({
        _from: "repo/heavymetal",
        _to: "u/splinter",
    });

    // act
    const response = request.get(
        `${repo_base_url}/view?id=repo/heavymetal`,
    );

    // assert
    expect(response.status).to.equal(200);
    const json = JSON.parse(response.body);

    expect(json).to.be.an("array").with.lengthOf(1);

    const repo = json[0];

    // id remapped from _id
    expect(repo).to.have.property("id", "repo/heavymetal");

    // admins resolved from admin edges
    expect(repo.admins).to.have.members([
        "u/shredder",
        "u/splinter",
    ]);

    // internal fields stripped
    expect(repo).to.not.have.property("_id");
    expect(repo).to.not.have.property("_key");
    expect(repo).to.not.have.property("_rev");
});

it("should update a repo when client has admin permissions", () => {
    // arrange: seed admin user
    g_db.u.save({
        _key: "splinter",
        is_admin: true,
    });

    // arrange: seed repo
    g_db.repo.save({
        _key: "heavymetal",
        title: "Old Title",
        summary: "Old summary",
        domain: "old-domain",
        capacity: 0,
        type: "metadata",
    });

    // arrange: admin edge (repo -> user)
    g_db.admin.save({
        _from: "repo/heavymetal",
        _to: "u/splinter",
    });

    const request_string = `${repo_base_url}/update?client=u/splinter`;

    const update_body = {
        id: "repo/heavymetal",
        title: "New Title",
        domain: "new-domain",
        path: "/mnt/nfs/heavymetal",
        capacity: 42,
        admins: ["u/splinter"],
    };

    // act
    const response = request.post(request_string, {
        body: JSON.stringify(update_body),
        headers: { "Content-Type": "application/json" },
    });

    // assert
    expect(response.status).to.equal(200);
    const json = JSON.parse(response.body);

    expect(json).to.be.an("array").with.lengthOf(1);

    const repo = json[0];

    // id remapped
    expect(repo).to.have.property("id", "repo/heavymetal");

    // updated fields
    expect(repo).to.have.property("title", "New Title");
    expect(repo).to.have.property("domain", "new-domain");
    expect(repo).to.have.property("capacity", 42);

    // path normalized with trailing slash
    expect(repo).to.have.property("path", "/mnt/nfs/heavymetal/");

    // internal fields stripped
    expect(repo).to.not.have.property("_id");
    expect(repo).to.not.have.property("_key");
    expect(repo).to.not.have.property("_rev");
});

it("should delete a repo when user has admin perms and repo is not in use", () => {
    // arrange
    // create admin user
    g_db.u.save(user_params_raw_admin);

    // create repo document
    const repoDoc = {
        _key: "heavymetal",
        title: "Rock On!!!!",
        capacity: 0,
        type: "metadata",
    };
    g_db.repo.save(repoDoc);

    // link admin to repo
    g_db.admin.save({
        _from: "repo/heavymetal",
        _to: "u/splinter",
    });

    // sanity check: repo exists before delete
    expect(!!g_db._exists("repo/heavymetal")).to.equal(true);
    const request_string = `${repo_base_url}/delete?client=${user_params_admin.id}&id=repo/heavymetal`;

    // act
    const response = request.get(request_string);

    // assert
    expect(response.status).to.equal(204);

    // repo should no longer exist
    expect(g_db._exists("repo/heavymetal")).to.equal(false);
});
it("should calculate per-repo sizes for specified items", () => {
    // arrange
    g_db.u.save(user_params_raw_admin);

    g_db.repo.save({
        _key: "heavymetal",
        title: "Rock On!!!!",
        capacity: 0,
        type: "metadata",
    });

    g_db.d.save({
        _key: "song1",
        size: 1234,
        repo: "repo/heavymetal",
    });

    g_db.alloc.save({
        _from: "d/song1",
        _to: "repo/heavymetal",
    });

    const items = encodeURIComponent(JSON.stringify(["d/song1"]));
    const request_string =
        `${repo_base_url}/calc_size?client=${user_params_admin.id}` +
        `&items=${items}&recurse=false`;

    // act
    const response = request.get(request_string);

    // assert
    expect(response.status).to.equal(200);

    const json = JSON.parse(response.body);
    expect(json).to.be.an("array");

    // Only check repo info if something is returned
    if (json.length > 0) {
        expect(json[0]).to.have.property("repo");
        expect(json[0]).to.have.property("size");
    }
});
it("should list all allocations for a repo", () => {
    // arrange
    const adminUser = { _key: "alloc_admin", is_admin: true };
    g_db.u.save(adminUser);

    const repoDoc = {
        _key: "rock_repo",
        title: "Rock Collection",
        capacity: 0,
        type: "metadata",
    };
    g_db.repo.save(repoDoc);

    // create some data vertices
    g_db.d.save({ _key: "songA", size: 1000 });
    g_db.d.save({ _key: "songB", size: 2000 });

    // create allocation edges
    g_db.alloc.save({
        _from: "d/songA",
        _to: "repo/rock_repo",
        data_limit: 5000,
        data_size: 1000,
        rec_limit: 10,
        rec_count: 1,
        path: "/mnt/rock/songA",
    });

    g_db.alloc.save({
        _from: "d/songB",
        _to: "repo/rock_repo",
        data_limit: 5000,
        data_size: 2000,
        rec_limit: 10,
        rec_count: 1,
        path: "/mnt/rock/songB",
    });

    // query parameters
    const clientId = encodeURIComponent("alloc_admin");
    const repoId = encodeURIComponent("repo/rock_repo");

    const request_string = `${repo_base_url}/alloc/list/by_repo?client=${clientId}&repo=${repoId}`;

    // act
    const response = request.get(request_string);

    // assert
    expect(response.status).to.equal(200);

    const json = JSON.parse(response.body);
    expect(json).to.be.an("array").with.lengthOf(2);

    // validate first allocation structure
    expect(json[0]).to.have.all.keys(
        "id",
        "repo",
        "data_limit",
        "data_size",
        "rec_limit",
        "rec_count",
        "path"
    );
    expect(json[0].repo).to.equal("repo/rock_repo");

    // validate second allocation
    expect(json[1].repo).to.equal("repo/rock_repo");
});
it("should list allocations for a specific object", () => {
    // arrange
    const adminUser = { _key: "alloc_admin", is_admin: true };
    g_db.u.save(adminUser);

    // create repo
    const repoDoc = {
        _key: "rock_repo",
        title: "Rock Collection",
        capacity: 0,
        type: "metadata",
    };
    g_db.repo.save(repoDoc);

    // create data object
    const dataObj = { _key: "songX", size: 500 };
    g_db.d.save(dataObj);

    // create owner edge: object -> owner
    g_db.owner.save({
        _from: "d/songX",
        _to: "u/alloc_admin",
    });

    // create allocations: owner -> repo
    g_db.alloc.save({
        _from: "u/alloc_admin",
        _to: "repo/rock_repo",
        data_limit: 1000,
        data_size: 500,
        rec_limit: 5,
        rec_count: 1,
        path: "/mnt/rock/songX",
    });

    const clientId = encodeURIComponent("alloc_admin");
    const objectId = encodeURIComponent("d/songX");
    const request_string = `${repo_base_url}/alloc/list/by_object?client=${clientId}&object=${objectId}`;

    // act
    const response = request.get(request_string);

    // assert
    expect(response.status).to.equal(200);

    const json = JSON.parse(response.body);
    expect(json).to.be.an("array").with.lengthOf(1);

    const alloc = json[0];
    expect(alloc).to.have.all.keys(
        "id",
        "repo",
        "data_limit",
        "data_size",
        "rec_limit",
        "rec_count",
        "path"
    );

    expect(alloc.id).to.equal("u/alloc_admin");
    expect(alloc.repo).to.equal("repo/rock_repo");
    expect(alloc.data_size).to.equal(500);
    expect(alloc.rec_count).to.equal(1);
});
it("should view allocation details for a repo", () => {
    // arrange
    const adminUser = { _key: "alloc_admin", is_admin: true };
    g_db.u.save(adminUser);

    // create repo
    const repoDoc = {
        _key: "rock_repo",
        title: "Rock Collection",
        capacity: 0,
        type: "metadata",
    };
    g_db.repo.save(repoDoc);

    // create allocation: user -> repo
    g_db.alloc.save({
        _from: "u/alloc_admin",
        _to: "repo/rock_repo",
        data_limit: 1000,
        data_size: 500,
        rec_limit: 5,
        rec_count: 1,
        path: "/mnt/rock/songX",
    });

    const clientId = encodeURIComponent("alloc_admin");
    const repoId = encodeURIComponent("repo/rock_repo");
    const request_string = `${repo_base_url}/alloc/view?client=${clientId}&repo=${repoId}`;

    // act
    const response = request.get(request_string);

    // assert
    expect(response.status).to.equal(200);

    const json = JSON.parse(response.body);
    expect(json).to.be.an("array").with.lengthOf(1);

    const alloc = json[0];
    expect(alloc).to.have.all.keys(
        "id",
        "repo",
        "data_limit",
        "data_size",
        "rec_limit",
        "rec_count",
        "path"
    );

    expect(alloc.id).to.equal("u/alloc_admin");
    expect(alloc.repo).to.equal("repo/rock_repo");
    expect(alloc.data_size).to.equal(500);
    expect(alloc.rec_count).to.equal(1);
});

it("should view allocation details for a repo (self view)", () => {
    // arrange
    const user = { _key: "alloc_user", is_admin: true };
    g_db.u.save(user);

    // create repo
    const repoDoc = {
        _key: "rock_repo",
        title: "Rock Collection",
        capacity: 0,
        type: "metadata",
    };
    g_db.repo.save(repoDoc);

    // create allocation: user -> repo
    g_db.alloc.save({
        _from: "u/alloc_user",
        _to: "repo/rock_repo",
        data_limit: 1000,
        data_size: 500,
        rec_limit: 5,
        rec_count: 1,
        path: "/mnt/rock/songX",
    });

    const clientId = encodeURIComponent("alloc_user");
    const repoId = encodeURIComponent("repo/rock_repo");
    const request_string = `${repo_base_url}/alloc/view?client=${clientId}&repo=${repoId}`;

    // act
    const response = request.get(request_string);

    // assert
    expect(response.status).to.equal(200);

    const json = JSON.parse(response.body);
    expect(json).to.be.an("array").with.lengthOf(1);

    const alloc = json[0];
    expect(alloc).to.have.all.keys(
        "id",
        "repo",
        "data_limit",
        "data_size",
        "rec_limit",
        "rec_count",
        "path"
    );

    expect(alloc.id).to.equal("u/alloc_user");
    expect(alloc.repo).to.equal("repo/rock_repo");
    expect(alloc.data_size).to.equal(500);
    expect(alloc.rec_count).to.equal(1);
});

it("should fetch allocation stats for a repo", () => {
    // Arrange: create admin user
    g_db.u.save({ _key: "stats_admin", name: "Stats Admin", role: "admin" });

    // Create repo
    g_db.repo.save({
        _key: "stats_repo",
        title: "Stats Repo",
        type: "metadata",
        capacity: 0
    });

    // Link the admin user to the repo via the admin edge
    g_db.admin.save({
        _from: "repo/stats_repo",
        _to: "u/stats_admin"
    });

    const clientId = encodeURIComponent("stats_admin");
    const repoId = encodeURIComponent("repo/stats_repo");
    const request_string = `${repo_base_url}/alloc/stats?client=${clientId}&repo=${repoId}`;

    // Act
    const response = request.get(request_string);

    // Assert
    expect(response.status).to.equal(200);

    const json = JSON.parse(response.body);
    expect(json).to.be.an("object");
    expect(json).to.have.property("repo", "repo/stats_repo");
    expect(json).to.have.property("rec_count");
    expect(json).to.have.property("data_size");
});
it("should create an allocation for a user/project when repo admin", () => {
    // Arrange: create admin user
    g_db.u.save({ _key: "alloc_admin", is_admin: true });

    // Create a repo
    g_db.repo.save({
        _key: "music_repo",
        title: "Music Repo",
        type: "metadata",
        capacity: 0
    });

    // Link admin to repo
    g_db.admin.save({
        _from: "repo/music_repo",
        _to: "u/alloc_admin"
    });

    // Create subject user/project
    g_db.u.save({ _key: "alloc_user", is_admin: false });

    // Prepare query parameters
    const clientId = encodeURIComponent("alloc_admin");
    const subjectId = encodeURIComponent("alloc_user");
    const repoId = encodeURIComponent("repo/music_repo");
    const dataLimit = 5000;
    const recLimit = 10;

    const requestString = `${repo_base_url}/alloc/create?client=${clientId}` +
        `&subject=${subjectId}&repo=${repoId}&data_limit=${dataLimit}&rec_limit=${recLimit}`;

    // Act
    const response = request.get(requestString);

const json = JSON.parse(response.body);
expect(json).to.have.property("task");

const task = json.task;
expect(task).to.have.property("_key");
expect(task).to.have.property("_id");
expect(task).to.have.property("type", 6);
expect(task).to.have.property("status", 0);

// Optional: check state fields
expect(task.state).to.have.property("repo_id", "repo/music_repo");
expect(task.state).to.have.property("subject", "u/alloc_user");
expect(task.state).to.have.property("data_limit", dataLimit);
expect(task.state).to.have.property("rec_limit", recLimit);
});

it("should delete an allocation for a user/project when repo admin", async function () {
    // First, create the allocation and wait for it to finish
    const createRes = await request.get("/repo/alloc/create", {
        client: "alloc_admin",
        subject: "alloc_user",
        repo: "repo/music_repo",
        data_limit: 5000,
        rec_limit: 10
    });

    expect(createRes.status).to.equal(200);
    expect(createRes.json).to.have.property("task");

    // Now, delete the allocation
    const deleteRes = await request.get("/repo/alloc/delete", {
        client: "alloc_admin",
        subject: "alloc_user",
        repo: "repo/music_repo"
    });

    expect(deleteRes.status).to.equal(200);
    expect(deleteRes.json).to.be.an("object");

    const task = deleteRes.json.task;

    expect(task).to.have.property("_key");
    expect(task).to.have.property("_id");
    expect(task).to.have.property("type");
    expect(task).to.have.property("status");
    expect(task.type).to.equal(6);

    // Validate the task state
    expect(task).to.have.property("state");
    expect(task.state).to.have.property("repo_id", "repo/music_repo");
    expect(task.state).to.have.property("subject", "u/alloc_user");
});
it("should update allocation limits when client is repo admin", () => {
    // arrange
    g_db.u.save({ _key: "alloc_admin", is_admin: true });
    g_db.u.save({ _key: "alloc_user", is_admin: false });

    g_db.repo.save({
        _key: "rock_repo",
        title: "Rock Repo",
        capacity: 0,
        type: "metadata",
    });

    // admin edge
    g_db.admin.save({
        _from: "repo/rock_repo",
        _to: "u/alloc_admin",
    });

    // existing allocation
    g_db.alloc.save({
        _from: "u/alloc_user",
        _to: "repo/rock_repo",
        data_limit: 1000,
        rec_limit: 5,
    });

    const request_string =
        `${repo_base_url}/alloc/set?client=alloc_admin` +
        `&subject=alloc_user&repo=repo/rock_repo` +
        `&data_limit=5000&rec_limit=20`;

    // act
    const response = request.get(request_string);

    // assert
    expect(response.status).to.equal(204);

    const alloc = g_db.alloc.firstExample({
        _from: "u/alloc_user",
        _to: "repo/rock_repo",
    });

    expect(alloc.data_limit).to.equal(5000);
    expect(alloc.rec_limit).to.equal(20);
});
it("should set default allocation for self", () => {
    // arrange
    g_db.u.save({ _key: "alloc_user", is_admin: false });

    g_db.repo.save({ _key: "repo1", title: "Repo 1", capacity: 0, type: "metadata" });
    g_db.repo.save({ _key: "repo2", title: "Repo 2", capacity: 0, type: "metadata" });

    g_db.alloc.save({ _from: "u/alloc_user", _to: "repo/repo1", is_def: false });
    g_db.alloc.save({ _from: "u/alloc_user", _to: "repo/repo2", is_def: true });

    const request_string =
        `${repo_base_url}/alloc/set/default?client=alloc_user&repo=repo/repo1`;

    // act
    const response = request.get(request_string);

    // assert
    expect(response.status).to.equal(204);

    const alloc1 = g_db.alloc.firstExample({ _from: "u/alloc_user", _to: "repo/repo1" });
    const alloc2 = g_db.alloc.firstExample({ _from: "u/alloc_user", _to: "repo/repo2" });

    expect(alloc1.is_def).to.equal(true);
    expect(alloc2.is_def).to.equal(false);
});

});
