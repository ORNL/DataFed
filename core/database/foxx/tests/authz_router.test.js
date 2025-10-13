"use strict";

// Integration test of API
const { expect } = require("chai");
const request = require("@arangodb/request");
const { baseUrl } = module.context;
const g_db = require("@arangodb").db;
const g_lib = require("../api/support");
const permissions = require("../api/lib/permissions");
// Constants used throughout test file
// The base URL for the authz foxx route
const authz_base_url = `${baseUrl}/authz`;
// Current time used for updating documents in the database
const current_time = Math.floor(Date.now() / 1000);
// Test user information
const james_uuid = "XXXXYYYY-XXXX-YYYY-XXXX-YYYYXXXXYYYY";
const james_uuid_id = "uuid/" + james_uuid;
const james_key = "jamesw";
const james_id = "u/" + james_key;
const base_user_data = {
    _key: james_key,
    _id: james_id,
    name_first: "james",
    name_last: "whiticker",
    is_admin: true,
    max_coll: g_lib.DEF_MAX_COLL,
    max_proj: g_lib.DEF_MAX_PROJ,
    max_sav_qry: g_lib.DEF_MAX_SAV_QRY,
    ct: current_time,
    ut: current_time,
};

// Test record information
const valid_key = "1120";
const record_id = "d/" + valid_key;

// Test repo information
const repo_key = "datafed-at-hot-potato";
const repo_id = "repo/" + repo_key;
const repo_path = "/mnt/repo_name";
const file_path = repo_path + "/user/" + james_key + "/" + valid_key;

// Test Project information
const project_key = "physics";
const project_id = "p/" + project_key;
const project_file_path = repo_path + "/project/" + project_key + "/" + valid_key;

/**
 * This method sets up the database with the documents for a user with a data record
 *
 * Creates a user, creates a repository and adds an allocation that connects the user
 * to the repository. A record is also created and is connected to the repository
 * via a location connection.
 **/
function defaultWorkingSetup() {
    g_db.uuid.save({
        _id: james_uuid_id,
    });

    g_db.ident.save({
        _from: james_id,
        _to: james_uuid_id,
    });

    const repo_data = {
        _key: repo_key,
        path: repo_path,
    };
    // Create nodes
    //recordRepoAndUserSetup(valid_key, base_user_data, repo_data);

    g_db.d.save({
        _key: valid_key,
        owner: james_id,
    });
    g_db.repo.save(repo_data, { waitForSync: true });

    g_db.u.save(base_user_data);

    // Create edges
    g_db.loc.save({
        _from: record_id,
        _to: repo_id,
        uid: james_id,
        new_repo: null,
    });

    g_db.alloc.save({
        _from: james_id,
        _to: repo_id,
    });
}

/**
 * This method sets up the database with the documents for a project owned data record
 *
 * The following items are needed for this.
 * A user
 * A record
 * A project
 * A group
 * A collection
 * A owner
 * A repo
 *
 * These different documents are connected through edges.
 * record <-> item <-> collection
 * record <-> owner <-> project
 * record <-> loc <-> repo
 * uuid <-> ident <-> user
 * group <-> acl <-> collection
 * user <-> member <-> group
 * project <-> alloc <-> repo
 * project <-> owner <-> group
 **/
function defaultWorkingSetupProject() {
    // Create nodes
    g_db.uuid.save({
        _id: james_uuid_id,
    });

    g_db.u.save(base_user_data);

    g_db.p.save({
        _key: project_key,
    });

    const root = g_db.c.save(
        {
            _key: "p_" + project_key + "_root",
            is_root: true,
            owner: project_id,
            acls: 2,
        },
        {
            returnNew: true,
        },
    );

    const mem_grp = g_db.g.save(
        {
            uid: "p/" + project_key,
            gid: "members",
        },
        {
            returnNew: true,
        },
    );

    g_db.d.save({
        _key: valid_key,
        owner: project_id,
    });

    const repo_data = {
        _key: repo_key,
        path: repo_path,
    };
    g_db.repo.save(repo_data, { waitForSync: true });

    // Create edges
    g_db.item.save({
        _from: root._id,
        _to: record_id,
    });

    g_db.acl.save({
        _from: root._id,
        _to: mem_grp._id,
        grant: permissions.PERM_MEMBER,
        inhgrant: permissions.PERM_MEMBER,
    });

    g_db.loc.save({
        _from: record_id,
        _to: repo_id,
        uid: project_id,
        new_repo: null,
    });

    g_db.alloc.save({
        _from: project_id,
        _to: repo_id,
    });

    g_db.member.save({
        _from: mem_grp._id,
        _to: james_id,
    });

    g_db.ident.save({
        _from: james_id,
        _to: james_uuid_id,
    });

    g_db.owner.save({
        _from: record_id,
        _to: project_id,
    });
}

// NOTE: describe block strings are compared against test specification during test call, not file name
describe("unit_authz_router: the Foxx microservice authz_router", () => {
    beforeEach(() => {
        g_db.u.truncate();
        g_db.ident.truncate();
        g_db.uuid.truncate();
        g_db.acl.truncate();
        g_db.item.truncate();
        g_db.c.truncate();
        g_db.g.truncate();
        g_db.p.truncate();
        g_db.owner.truncate();
        g_db.member.truncate();
        g_db.d.truncate();
        g_db.alloc.truncate();
        g_db.loc.truncate();
        g_db.repo.truncate();
    });

    it("unit_authz_router: gridftp create action with user record and valid file path.", () => {
        defaultWorkingSetup();
        const request_string =
            `${authz_base_url}/gridftp?client=` +
            james_uuid +
            `&repo=` +
            encodeURIComponent(repo_id) +
            `&file=` +
            encodeURIComponent(file_path) +
            `&act=create`;

        // act
        const response = request.get(request_string);

        // assert
        expect(response.status).to.equal(204);
    });

    it("unit_authz_router: gridftp create action with user record and invalid file path.", () => {
        defaultWorkingSetup();

        // This is invalid because bobby does not exist as a user and the record "valid_key" they are not the owner of or have a membership too.
        const bad_file_path = repo_path + "/user/bobby/" + valid_key;
        const request_string =
            `${authz_base_url}/gridftp?client=` +
            james_uuid +
            `&repo=` +
            encodeURIComponent(repo_id) +
            `&file=` +
            encodeURIComponent(bad_file_path) +
            `&act=create`;

        // act
        const response = request.get(request_string);

        // assert
        expect(response.status).to.equal(400);
    });

    it("unit_authz_router: gridftp create action with invalid repo and valid file path.", () => {
        defaultWorkingSetup();
        const bad_repo_id = "repo/not_exist";
        const request_string =
            `${authz_base_url}/gridftp?client=` +
            james_uuid +
            `&repo=` +
            encodeURIComponent(bad_repo_id) +
            `&file=` +
            encodeURIComponent(file_path) +
            `&act=create`;

        // act
        const response = request.get(request_string);

        // assert
        expect(response.status).to.equal(400);
    });

    it("unit_authz_router: gridftp create action with invalid client and valid file path.", () => {
        // Here we are creating a valid user but they simply do not have access to the provided file
        // path.
        const bad_user_data = {
            _key: "george",
            _id: "u/george",
            name_first: "george",
            name_last: "Brown",
            is_admin: false,
        };
        const george_uuid = "ZZZZYYYY-ZZZZ-ZZZZ-ZZZZ-ZZZZTTTTZZZZ";
        const george_uuid_id = "uuid/" + george_uuid;
        g_db.u.save(bad_user_data);

        g_db.uuid.save({
            _id: george_uuid_id,
        });

        g_db.ident.save({
            _from: "u/george",
            _to: george_uuid_id,
        });

        defaultWorkingSetup();
        const bad_repo_id = "repo/not_exist";
        const request_string =
            `${authz_base_url}/gridftp?client=` +
            george_uuid +
            `&repo=` +
            encodeURIComponent(repo_id) +
            `&file=` +
            encodeURIComponent(file_path) +
            `&act=create`;

        // act
        const response = request.get(request_string);

        // assert
        expect(response.status).to.equal(400);
    });

    it("unit_authz_router: gridftp create action with valid repo and valid file path in project.", () => {
        defaultWorkingSetupProject();
        const bad_repo_id = "repo/not_exist";
        const request_string =
            `${authz_base_url}/gridftp?client=` +
            james_uuid +
            `&repo=` +
            encodeURIComponent(repo_id) +
            `&file=` +
            encodeURIComponent(project_file_path) +
            `&act=create`;

        // act
        const response = request.get(request_string);

        // assert
        expect(response.status).to.equal(204);
    });
});
