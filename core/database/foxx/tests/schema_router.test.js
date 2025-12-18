"use strict";

const { expect } = require("chai");
const request = require("@arangodb/request");
const { baseUrl } = module.context;
const { db } = require("@arangodb");

const schema_base_url = `${baseUrl}/schema`;

describe("simple test for schema/create", () => {

  before(() => {
    // Ensure the required collections exist and are empty
    const collections = ["u", "sch", "sch_dep"];
    collections.forEach((name) => {
      const col = db._collection(name);
      if (col) col.truncate();
      else db._create(name);
    });

    // Add a fake user
    db.u.save({
      _key: "fakeUser",
      _id: "u/fakeUser",
      name: "Fake User",
      is_admin: true
    });
  });

  it("unit_schema_router: should successfully create a schema", () => {
    const body = {
      id: "test_schema_1",
      desc: "A simple test schema",
      def: {
        properties: {
          field1: { type: "string" }
        }
      },
      pub: true,
      sys: false
    };

    const response = request.post(`${schema_base_url}/create?client=u/fakeUser`, {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" }
    });

    expect(response.status).to.equal(200);

    const result = JSON.parse(response.body);
    expect(result).to.be.an("array");
    expect(result[0].def).to.deep.equal(body.def);
    expect(result[0].own_nm).to.equal("Fake"); // matches fixSchOwnNm logic
  });

it("unit_schema_router: should successfully update a schema and return only own_id, id, and desc", () => {
    const clientId = "u/fakeUser";
    const schemaIdWithVersion = "test_schema_1:0";

    const body = {
        desc: "Updated schema description",
        def: {
            properties: { field1: { type: "string" } }
        },
        pub: true
    };

    const response = request.post(`${schema_base_url}/update?client=${clientId}&id=${schemaIdWithVersion}`, {
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" }
    });

    expect(response.status).to.equal(200);

    const result = JSON.parse(response.body);
    expect(result).to.be.an("array").with.lengthOf(1);
    const schema = result[0];

    // Only validate the fields you care about
    expect(schema).to.have.property("own_id", clientId);
    expect(schema).to.have.property("id", "test_schema_1");
    expect(schema).to.have.property("desc", "Updated schema description");

    // Ensure internal fields are removed
    expect(schema).to.not.have.property("_id");
    expect(schema).to.not.have.property("_key");
    expect(schema).to.not.have.property("_rev");
});

it("unit_schema_router: should successfully revise a schema and create a new version", () => {
  const clientId = "u/fakeUser";
  const schemaIdWithVersion = "test_schema_1:0";

  const body = {
    desc: "Revised schema description",
    def: {
      properties: {
        field1: { type: "string" },
        field2: { type: "number" }
      }
    },
    pub: true
  };

  const response = request.post(
    `${schema_base_url}/revise?client=${clientId}&id=${schemaIdWithVersion}`,
    {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" }
    }
  );

  expect(response.status).to.equal(200);

  const result = JSON.parse(response.body);
  expect(result).to.be.an("array").with.lengthOf(1);

  const schema = result[0];

  // New revision should increment version
  expect(schema).to.have.property("ver", 1);

  // ID remains the same
  expect(schema).to.have.property("id", "test_schema_1");

  // Updated fields
  expect(schema).to.have.property("desc", "Revised schema description");
  expect(schema.def).to.deep.equal(body.def);

  // Ownership should still be correct
  expect(schema).to.have.property("own_id", clientId);

  // Internal Arango fields must be stripped
  expect(schema).to.not.have.property("_id");
  expect(schema).to.not.have.property("_key");
  expect(schema).to.not.have.property("_rev");
});

it("unit_schema_router: should successfully delete the latest schema revision", () => {
  const clientId = "u/fakeUser";

  // After revise, the latest version should be :1
  const schemaIdWithVersion = "test_schema_1:1";

  const response = request.post(
    `${schema_base_url}/delete?client=${clientId}&id=${schemaIdWithVersion}`
  );

  expect(response.status).to.equal(204);

  // Verify schema is actually gone
  const deleted = db.sch.firstExample({
    id: "test_schema_1",
    ver: 1
  });

  expect(deleted).to.equal(null);
});

it("unit_schema_router: should successfully view a schema by id and version", () => {
  const clientId = "u/fakeUser";
  const schemaIdWithVersion = "test_schema_1:0";

  const response = request.get(
    `${schema_base_url}/view?client=${clientId}&id=${schemaIdWithVersion}`
  );

  expect(response.status).to.equal(200);

  const result = JSON.parse(response.body);
  expect(result).to.be.an("array").with.lengthOf(1);

  const schema = result[0];

  // Basic identity
  expect(schema).to.have.property("id", "test_schema_1");
  expect(schema).to.have.property("ver", 0);

  // Ownership and visibility
  expect(schema).to.have.property("own_id", clientId);
  expect(schema).to.have.property("pub", true);

  // Schema definition exists
  expect(schema).to.have.property("def");
  expect(schema.def).to.have.property("properties");

  // Derived fields
  expect(schema).to.have.property("depr").that.is.a("boolean");
  expect(schema).to.have.property("uses").that.is.an("array");
  expect(schema).to.have.property("used_by").that.is.an("array");

  // Internal Arango fields must not leak
  expect(schema).to.not.have.property("_id");
  expect(schema).to.not.have.property("_key");
  expect(schema).to.not.have.property("_rev");
});

it("unit_schema_router: should successfully search schemas", () => {
  const clientId = "u/fakeUser";

  const response = request.get(
    `${schema_base_url}/search?client=${clientId}`
  );

  expect(response.status).to.equal(200);

  const result = JSON.parse(response.body);
  expect(result).to.be.an("array");
  expect(result.length).to.be.greaterThan(0);

  // Last element must be paging info
  const paging = result[result.length - 1];
  expect(paging).to.have.property("paging");
  expect(paging.paging).to.have.property("off");
  expect(paging.paging).to.have.property("cnt");
  expect(paging.paging).to.have.property("tot");

  // Validate at least one schema result
  const schema = result[0];

  expect(schema).to.have.property("ver");
  expect(schema).to.have.property("pub");
  expect(schema).to.have.property("own_id");
  expect(schema).to.have.property("own_nm");

  // Internal _id is allowed internally but not required to be exposed further
  // (search explicitly returns _id internally for ref detection)
});

});
