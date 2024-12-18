"use strict";

const chai = require("chai");
const expect = chai.expect;
const authzModule = require("./authz"); // Replace with the actual file name
const g_db = require("@arangodb").db;
const g_lib = require("../api/support");
const arangodb = require("@arangodb");

describe("Authz functions", () => {

  beforeEach(() => {
    g_db.d.truncate();
    g_db.alloc.truncate();
    g_db.loc.truncate();
    g_db.repo.truncate();
  });

  it("unit_authz: if admin should return true", () => {

      let data_key = "big_data_obj";
      let data_id = "d/" + data_key;

      g_db.d.save({
        _key: data_key,
        _id: data_id,
        creator: "george"
      });

      let owner_id = "u/not_bob";
      let client = {
       _key: "bob",
       _id: "u/bob",
       is_admin: true
      };

      g_db.u.save(client);

      g_db.owner.save({
        _from: data_key,
        _to: owner_id
      });

     let req_perm = g_lib.PERM_CREATE;

     expect(authzModule.isRecordActionAuthorized(client, data_key, req_perm)).to.be.true;
  }

});
