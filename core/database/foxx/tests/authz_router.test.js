"use strict";

// Integration test of API
const { expect } = require("chai");
const request = require("@arangodb/request");
const { baseUrl } = module.context;
const g_db = require("@arangodb").db;
const g_lib = require("../api/support");

const authz_base_url = `${baseUrl}/authz`;

// NOTE: describe block strings are compared against test specification during test call, not file name
const current_time = Math.floor(Date.now() / 1000);
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
const valid_key = "1120";
const key_id = "d/" + valid_key;

const repo_key = "datafed-at-hot-potato";
const repo_id = "repo/" + repo_key;
const repo_path = "/mnt/repo_name";
const file_path = repo_path + "/user/" + james_key + "/" + valid_key;
const record_id = "d/" + valid_key;

const project_key = "physics";
const project_id = "p/" + project_key;
const project_file_path = repo_path + "/project/" + project_key + "/" + valid_key;

function defaultWorkingSetup() {

    g_db.uuid.save({
        _id: james_uuid_id
    });

    g_db.ident.save({
        _from: james_id,
        _to: james_uuid_id
    });

    const repo_data = {
        _key: repo_key,
          path: repo_path
    }
    // Create nodes
    //recordRepoAndUserSetup(valid_key, base_user_data, repo_data);

    g_db.d.save({
        _key: valid_key,
        owner: james_id
    });
    g_db.repo.save(repo_data,
            { waitForSync: true }
    );

    g_db.u.save(base_user_data);

    // Create edges
    g_db.loc.save({
        _from: key_id,
        _to: repo_id,
        uid: james_id,
        new_repo: null
    });

    g_db.alloc.save({
        _from: james_id,
        _to: repo_id,
    });

}

function defaultWorkingSetupProject() {

    g_db.uuid.save({
        _id: james_uuid_id
    });

    g_db.u.save(base_user_data);

    g_db.p.save({
      _key: project_key
    });

    const root = g_db.c.save({
        _key: "p_" + project_key + "_root",
        is_root: true,
        owner: project_id,
        acls: 2,
    },
    {
        returnNew: true,
    });

    const mem_grp = g_db.g.save(
        {
            uid: "p/" + project_key,
            gid: "members",
        },
        {
            returnNew: true,
        },
    );

     // Create nodes
    //recordRepoAndUserSetup(valid_key, base_user_data, repo_data);

    g_db.d.save({
        _key: valid_key,
        owner: project_id
    });

    const repo_data = {
        _key: repo_key,
        path: repo_path
    }
    g_db.repo.save(repo_data,
            { waitForSync: true }
    );


    // Create edges

     g_db.item.save({
        _from: root._id,
        _to: key_id,
    });

    g_db.acl.save({
        _from: root._id,
        _to: mem_grp._id,
        grant: g_lib.PERM_MEMBER,
        inhgrant: g_lib.PERM_MEMBER,
    });


    g_db.loc.save({
        _from: key_id,
        _to: repo_id,
        uid: project_id,
        new_repo: null
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
        _to: james_uuid_id
    });
    g_db.owner.save({
        _from: key_id,
        _to: project_id
    });
   
    console.log("Create project owner edges");
    console.log(g_db.owner.toArray());
}

describe("authz_router: the Foxx microservice authz_router", () => {
    //const test_param_indexes = [0, 1, 2, 3, 4];
    //const test_params = test_param_indexes.map((param_index) => {
    //    return {
    //        _key: "testUser" + param_index,
    //        access: "access_token" + param_index,
    //        refresh: "refresh_token" + param_index,
    //    };
    //});
    //const test_uuid = "1cbaaee5-b938-4a4e-87a8-f1ec4d5d92f9"; // fake UUID
    //const test_scope = "urn:globus:auth:scope:transfer.api.globus.org:all";
    //const test_edge_params = {
    //    type: g_lib.AccessTokenType.GLOBUS_TRANSFER,
    //    other_token_data: test_uuid + "%7C" + test_scope, // URL encoded | character
    //};

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

    it("authz_router_unit: gridftp create action with user record and valid file path.", () => {
        // arrange
        // NOTE: the get request has query params instead of a body
        //const query_params = test_params[0];
        // TODO: make encoded query params less hard coded
        //const request_string = `${authz_base_url}/gridftp?client=23c9067f-60e8-4741-9af1-482280faced3%2C56071064-8a08-4a5a-ad8d-5af84282f70d&repo=repo%2Fdatafedci-home&file=%2Fdatafed%2Fdatafedci-home%2Fuser%2Fdatafed89%2F829229&act=create`
        defaultWorkingSetup();
        const request_string = `${authz_base_url}/gridftp?client=` + james_uuid + `&repo=` + encodeURIComponent(repo_id) + `&file=` + encodeURIComponent(file_path) + `&act=create`

        // act
        const response = request.get(request_string);

        // assert
        expect(response.status).to.equal(204);

    });

    it("authz_router_unit: gridftp create action with user record and invalid file path.", () => {
        // arrange
        // NOTE: the get request has query params instead of a body
        //const query_params = test_params[0];
        // TODO: make encoded query params less hard coded
        //const request_string = `${authz_base_url}/gridftp?client=23c9067f-60e8-4741-9af1-482280faced3%2C56071064-8a08-4a5a-ad8d-5af84282f70d&repo=repo%2Fdatafedci-home&file=%2Fdatafed%2Fdatafedci-home%2Fuser%2Fdatafed89%2F829229&act=create`
        defaultWorkingSetup();
        const bad_file_path = repo_path + "/user/bobby/" + valid_key;
        const request_string = `${authz_base_url}/gridftp?client=` + james_uuid + `&repo=` + encodeURIComponent(repo_id) + `&file=` + encodeURIComponent(bad_file_path) + `&act=create`

        // act
        const response = request.get(request_string);

        // assert
        expect(response.status).to.equal(400);

    });

    it("authz_router_unit: gridftp create action with invalid repo and valid file path.", () => {
        // arrange
        // NOTE: the get request has query params instead of a body
        //const query_params = test_params[0];
        // TODO: make encoded query params less hard coded
        //const request_string = `${authz_base_url}/gridftp?client=23c9067f-60e8-4741-9af1-482280faced3%2C56071064-8a08-4a5a-ad8d-5af84282f70d&repo=repo%2Fdatafedci-home&file=%2Fdatafed%2Fdatafedci-home%2Fuser%2Fdatafed89%2F829229&act=create`
        defaultWorkingSetup();
        const bad_repo_id = "repo/not_exist"
        const request_string = `${authz_base_url}/gridftp?client=` + james_uuid + `&repo=` + encodeURIComponent(bad_repo_id) + `&file=` + encodeURIComponent(file_path) + `&act=create`

        // act
        const response = request.get(request_string);

        // assert
        expect(response.status).to.equal(400);

    });

    it("authz_router_unit: gridftp create action with invalid client and valid file path.", () => {

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
            _id: george_uuid_id
        });

        g_db.ident.save({
            _from: "u/george",
            _to: george_uuid_id
        });


        // arrange
        // NOTE: the get request has query params instead of a body
        //const query_params = test_params[0];
        // TODO: make encoded query params less hard coded
        //const request_string = `${authz_base_url}/gridftp?client=23c9067f-60e8-4741-9af1-482280faced3%2C56071064-8a08-4a5a-ad8d-5af84282f70d&repo=repo%2Fdatafedci-home&file=%2Fdatafed%2Fdatafedci-home%2Fuser%2Fdatafed89%2F829229&act=create`
        defaultWorkingSetup();
        const bad_repo_id = "repo/not_exist"
        const request_string = `${authz_base_url}/gridftp?client=` + george_uuid + `&repo=` + encodeURIComponent(repo_id) + `&file=` + encodeURIComponent(file_path) + `&act=create`

        // act
        const response = request.get(request_string);

        // assert
        expect(response.status).to.equal(400);

    });


    it("authz_router_unit: gridftp create action with valid repo and valid file path in project.", () => {
        // arrange
        // NOTE: the get request has query params instead of a body
        //const query_params = test_params[0];
        // TODO: make encoded query params less hard coded
        //const request_string = `${authz_base_url}/gridftp?client=23c9067f-60e8-4741-9af1-482280faced3%2C56071064-8a08-4a5a-ad8d-5af84282f70d&repo=repo%2Fdatafedci-home&file=%2Fdatafed%2Fdatafedci-home%2Fuser%2Fdatafed89%2F829229&act=create`
        defaultWorkingSetupProject();
        const bad_repo_id = "repo/not_exist"
        const request_string = `${authz_base_url}/gridftp?client=` + james_uuid + `&repo=` + encodeURIComponent(repo_id) + `&file=` + encodeURIComponent(project_file_path) + `&act=create`

        // act
        const response = request.get(request_string);

        // assert
        expect(response.status).to.equal(204);

    });
});
