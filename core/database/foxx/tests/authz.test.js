"use strict";
const chai = require("chai");
const expect = chai.expect;
const authzModule = require("../api/authz"); // Replace with the actual file name
const g_db = require("@arangodb").db;
const g_lib = require("../api/support");
const arangodb = require("@arangodb");

describe("Authz functions", () => {

  beforeEach(() => {
    g_db.d.truncate();
    g_db.alloc.truncate();
    g_db.loc.truncate();
    g_db.repo.truncate();
    g_db.u.truncate();
    g_db.owner.truncate();
    g_db.p.truncate();
    g_db.admin.truncate();
  });

  it("unit_authz: if admin should return true", () => {

      let data_key = "big_data_obj";
      let data_id = "d/" + data_key;

      g_db.d.save({
        _key: data_key,
        _id: data_id,
        creator: "u/george"
      });

      let owner_id = "u/not_bob";
      g_db.u.save({
        _key: "not_bob",
        _id: owner_id,
        is_admin: false
      });

      let client = {
       _key: "bob",
       _id: "u/bob",
       is_admin: true
      };

      g_db.u.save(client);

      g_db.owner.save({
        _from: data_id,
        _to: owner_id
      });

     let req_perm = g_lib.PERM_CREATE;

     expect(authzModule.isRecordActionAuthorized(client, data_key, req_perm)).to.be.true;
  });

  // Test 2: Regular user without ownership should be denied access
  it("unit_authz: non-owner regular user should not have access", () => {
    let data_key = "data_key";
    let data_id = "d/" + data_key;

    g_db.d.save({
      _key: data_key,
      _id: data_id,
      creator: "u/george"
    });

    let client = {
      _key: "bob",
      _id: "u/bob",
      is_admin: false
    };

    g_db.u.save(client);

    let req_perm = g_lib.PERM_CREATE;

    expect(() => authzModule.isRecordActionAuthorized(client, data_key, req_perm)).to.throw();
  });

  // Test 3: Owner should have access to their own data record
  it("unit_authz: owner user should have access to their record", () => {
    let data_key = "data_key";
    let data_id = "d/" + data_key;

    g_db.d.save({
      _key: data_key,
      _id: data_id,
      creator: "u/george"
    });

    let client = {
      _key: "george",
      _id: "u/george",
      is_admin: false
    };

    g_db.u.save(client);

    g_db.owner.save({
      _from: data_id,
      _to: "u/george"
    });

    let req_perm = g_lib.PERM_CREATE;

    expect(authzModule.isRecordActionAuthorized(client, data_key, req_perm)).to.be.true;
  });

it("unit_authz: should return true for authorized project admin", () => {

    let data_key = "project_data_obj";
    let data_id = "d/" + data_key;

    g_db.d.save({
      _key: data_key,
      _id: data_id,
      creator: "u/george"
    });

    let project_id = "p/project_1";
    g_db.p.save({
      _key: "project_1",
      _id: project_id,
      name: "Project One"
    });

    let bob_id = "u/bob";

    let bob = {
      _key: "bob",
      _id: bob_id,
      is_admin: false
    }

    let george = {
      _key: "george",
      _id: "u/george",
      is_admin: false
    };

    g_db.u.save(bob);
    g_db.u.save(george);

    g_db.owner.save({
      _from: data_id,
      _to: project_id
    });

    g_db.admin.save({
      _from: project_id,
      _to: bob_id
    });

    let req_perm = g_lib.PERM_CREATE;

    // Project admin should have permission
    expect(authzModule.isRecordActionAuthorized(bob, data_key, req_perm)).to.be.true;
  });

  // Test 4: Non-owner user should be denied access to another user's record
  it("unit_authz: non-owner should be denied access to another user's record", () => {
    let data_key = "bananas";
    let data_id = "d/" + data_key;

    g_db.d.save({
      _key: data_key,
      _id: data_id,
      creator: "u/george"
    }, { waitForSync: true });

    let bob = {
      _key: "bob",
      _id: "u/bob",
      is_admin: false
    };

    let george = {
      _key: "george",
      _id: "u/george",
      is_admin: false
    };

    g_db.u.save(bob, { waitForSync: true });
    g_db.u.save(george, { waitForSync: true });

    g_db.owner.save({
      _from: data_id,
      _to: "u/george"
    }, { waitForSync: true });

    let req_perm = g_lib.PERM_CREATE;

    expect(authzModule.isRecordActionAuthorized(bob, data_key, req_perm)).to.be.false;
  });

 it("unit_authz: should return false for project admin of a different project, that does not have access", () => {
    // Jack is the creator of the documnet
    // Amy is the project owner where the documnet is located, which is the fruity project
    // Mandy is a different project owner to the condiments project
    // Mandy should not have access to the apples document

    let data_key = "apples";
    let data_id = "d/" + data_key;

    g_db.d.save({
      _key: data_key,
      _id: data_id,
      creator: "u/jack"
    }, { waitForSync: true });

    let jack = {
      _key: "jack",
      _id: "u/jack",
      is_admin: false
    };

    g_db.u.save(jack, { waitForSync: true });

    let fruity_project_id = "p/fruity";
    g_db.p.save({
      _key: "fruity",
      _id: fruity_project_id,
      name: "Project Fruity"
    }, { waitForSync: true });

    let condiments_project_id = "p/condiments";
    g_db.p.save({
      _key: "condiments",
      _id: condiments_project_id,
      name: "Project Condiments"
    }, { waitForSync: true });

    let mandy_admin_id = "u/mandy";
    let mandy = {
      _key: "mandy",
      _id: mandy_admin_id,
      is_admin: false
    };
    g_db.u.save(mandy, { waitForSync: true });

    let amy_admin_id = "u/amy";
    g_db.u.save({
      _key: "amy",
      _id: amy_admin_id,
      is_admin: false
    }, { waitForSync: true });

    g_db.owner.save({
      _from: data_id,
      _to: fruity_project_id
    }, { waitForSync: true });

    g_db.admin.save({
      _from: fruity_project_id,
      _to: amy_admin_id
    }, { waitForSync: true });

    g_db.admin.save({
      _from: condiments_project_id,
      _to: mandy_admin_id
    }, { waitForSync: true });

    let req_perm = g_lib.PERM_CREATE;

    // Non-project admin should not have permission
    expect(authzModule.isRecordActionAuthorized(mandy, data_key, req_perm)).to.be.false;
  });

  it("unit_authz: read should return false, for record creator, if owned by project that creator does not have read permission too.", () => {

    let data_key = "cherry";
    let data_id = "d/" + data_key;

    g_db.d.save({
      _key: data_key,
      _id: data_id,
      creator: "tim"
    }, { waitForSync: true });

    let tim = {
      _key: "tim",
      _id: "u/tim",
      is_admin: false
    };

    // A project is the owner
    let project_id = "p/red_fruit";
    g_db.p.save({
      _key: "red_fruit",
      _id: project_id,
      name: "Project Red Fruit"
    }, { waitForSync: true });

    let bob_id = "u/bob";

    let bob = {
      _key: "bob",
      _id: bob_id,
      is_admin: false
    }

    g_db.u.save(bob, { waitForSync: true });

    g_db.owner.save({
      _from: data_id,
      _to: project_id
    }, { waitForSync: true });

    g_db.admin.save({
      _from: project_id,
      _to: bob_id
    }, { waitForSync: true });

    g_db.u.save(tim, { waitForSync: true });

    let req_perm = g_lib.PERM_READ;

    expect(authzModule.isRecordActionAuthorized(tim, data_key, req_perm)).to.be.false;
  });


});
