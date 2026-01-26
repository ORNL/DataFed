"use strict";

const { expect } = require("chai");
const request = require("@arangodb/request");
const { db } = require("@arangodb");
const { baseUrl } = module.context;

const data_base_url = `${baseUrl}/dat`;

after(function () {
  // clean up all collections used in the test
  const collections = ["u", "d","c", "repo", "alloc", "loc", "owner"];
  collections.forEach((name) => {
    let col = db._collection(name);
    if (col) col.truncate();
  });
});

describe("unit_data_router: the Foxx microservice data_router create/ endpoint", () => {
    beforeEach(() => {
        const collections = ["u", "d", "c", "repo", "alloc", "loc", "owner", "alias", "item"];
        collections.forEach((name) => {
            let col = db._collection(name);
            if (col) col.truncate(); // truncate if exists
            else db._create(name);   // create if missing
        });

        // Create the fake user
        db.u.save({
            _key: "fakeUser",
            _id: "u/fakeUser",
            name: "fake user",
            name_first: "fake",
            name_last: "user",
            is_admin: true,
            max_coll: 50,
            max_proj: 10,
            max_sav_qry: 20,
            email: "fakeuser@gmail.com",
        });

        // Create a fake repo
        db.repo.save({
            _key: "fakeRepo",
            path: "/tmp/fakeRepo",
        });

        // Create allocation for fakeUser -> fakeRepo
        db.alloc.save({
            _from: "u/fakeUser",      // user _id
            _to: "repo/fakeRepo",     // repo _id
            rec_count: 0,             // current record count
            rec_limit: 10,            // max number of records allowed
            data_size: 0,             // current data size
            data_limit: 100000000,    // max data size
            state: "active",
        });

        db.owner.save({
            _from: "c/root_fakeUser",
            _to: "u/fakeUser",

        });
        // Create a root collection for fakeUser
if (!db._collection("c")) db._create("c");
db.c.save({
    _key: "u_fakeUser_root",
});

    });
it("should create exactly one data record", () => {
  const res = request.post(`${data_base_url}/create?client=fakeUser`, {
    body: {
      title: "My First Data",
    },
    json: true,
  });

  expect(res.statusCode).to.equal(200);

  const body = typeof res.body === "string"
    ? JSON.parse(res.body)
    : res.body;

  expect(body).to.have.property("results");
  expect(body.results).to.be.an("array").with.lengthOf(1);
});

it("should create multiple data records in a batch", () => {
  const records = [
    { title: "First Batch Record" },
    { title: "Second Batch Record" },
    { title: "Third Batch Record" },
  ];

  const res = request.post(`${data_base_url}/create/batch?client=fakeUser`, {
    body: records,
    json: true,
  });

  expect(res.statusCode).to.equal(200);

  // parse body in case it's returned as a string
  const body = typeof res.body === "string" ? JSON.parse(res.body) : res.body;

  expect(body).to.have.property("results");
  expect(body.results).to.be.an("array").with.lengthOf(records.length);

  // verify each record was created with the correct title and an ID
  records.forEach((r, i) => {
    expect(body.results[i]).to.have.property("title", r.title);
    expect(body.results[i]).to.have.property("id").that.is.a("string");
  });
});

it("should update an existing data record", () => {
  //CREATING NEW RECORD
  let res = request.post(`${data_base_url}/create?client=fakeUser`, {
    body: {
      title: "Title Original",
    },
    json: true,
  });
  const body = typeof res.body === "string"
    ? JSON.parse(res.body)
    : res.body;

  const recordId = body.results[0].id;
  console.log("Created record ID:", recordId);
 
  //UPDATING EXISTING RECORD
  res = request.post(`${data_base_url}/update?client=fakeUser`, {
    body: {
      id: recordId,
      title: "New Title",
    },
    json: true,
  });
  expect(res.statusCode).to.equal(200);
    const updateBody = typeof res.body === "string" ? JSON.parse(res.body) : res.body;

  // ASSERTION: verify the title actually changed
  expect(updateBody.results[0].title).to.equal("New Title");

});

it("should update multiple data records in a batch", () => {
  // Step 1: create two records
  const createRes = request.post(`${data_base_url}/create/batch?client=fakeUser`, {
    body: [
      { title: "Batch Original 1" },
      { title: "Batch Original 2" },
    ],
    json: true,
  });

  expect(createRes.statusCode).to.equal(200);

  const createBody =
    typeof createRes.body === "string"
      ? JSON.parse(createRes.body)
      : createRes.body;

  const ids = createBody.results.map(r => r.id);

  // Step 2: update both records
  const updateRes = request.post(`${data_base_url}/update/batch?client=fakeUser`, {
    body: [
      { id: ids[0], title: "Batch Updated 1" },
      { id: ids[1], title: "Batch Updated 2" },
    ],
    json: true,
  });

  expect(updateRes.statusCode).to.equal(200);

  const updateBody =
    typeof updateRes.body === "string"
      ? JSON.parse(updateRes.body)
      : updateRes.body;

  // Step 3: assertions
  expect(updateBody).to.have.property("updates");
  expect(updateBody.updates).to.be.an("array").with.lengthOf(2);

  const titles = updateBody.updates.map(r => r.title);
  expect(titles).to.include("Batch Updated 1");
  expect(titles).to.include("Batch Updated 2");
});

it("should update the metadata schema validation error message on a data record", () => {
  // Step 1: create a data record
  const createRes = request.post(`${data_base_url}/create?client=fakeUser`, {
    body: {
      title: "Record With Schema Error",
    },
    json: true,
  });

  expect(createRes.statusCode).to.equal(200);

  const createBody =
    typeof createRes.body === "string"
      ? JSON.parse(createRes.body)
      : createRes.body;

  const recordId = createBody.results[0].id;

  // Step 2: update md_err_msg via plain-text body
  const errorMessage = "Schema validation failed: missing required field";

  const updateRes = request.post(
    `${data_base_url}/update/md_err_msg?id=${recordId}&client=fakeUser`,
    {
      body: errorMessage,
      headers: {
        "content-type": "text/plain",
      },
    },
  );

  expect(updateRes.statusCode).to.equal(204);

  // Step 3: verify DB was updated
  const doc = db._document(recordId);

  expect(doc).to.have.property("md_err", true);
  expect(doc).to.have.property("md_err_msg", errorMessage);
});

it("should update the size of an existing data record and update allocation usage", () => {
  // Step 1: create a data record
  const createRes = request.post(`${data_base_url}/create?client=fakeUser`, {
    body: {
      title: "Data Record With Size",
    },
    json: true,
  });

  expect(createRes.statusCode).to.equal(200);

  const createBody =
    typeof createRes.body === "string"
      ? JSON.parse(createRes.body)
      : createRes.body;

  const recordId = createBody.results[0].id;

  // Step 2: create required loc edge (owner & alloc already exist from beforeEach)
  db.loc.save({
    _from: recordId,
    _to: "repo/fakeRepo",
  });

  // Step 3: verify initial values
  let dataDoc = db._document(recordId);
  expect(dataDoc.size || 0).to.equal(0);

  let allocDoc = db.alloc.firstExample({
    _from: "u/fakeUser",
    _to: "repo/fakeRepo",
  });
  expect(allocDoc.data_size).to.equal(0);

  // Step 4: call update/size
  const newSize = 4096;

  const updateRes = request.post(`${data_base_url}/update/size?client=fakeUser`, {
    body: {
      records: [
        {
          id: recordId,
          size: newSize,
        },
      ],
    },
    json: true,
  });

  expect(updateRes.statusCode).to.equal(200);

  // Step 5: verify data record updated
  dataDoc = db._document(recordId);
  expect(dataDoc.size).to.equal(newSize);
  expect(dataDoc).to.have.property("ut");
  expect(dataDoc).to.have.property("dt");

  // Step 6: verify allocation updated
  allocDoc = db.alloc.firstExample({
    _from: "u/fakeUser",
    _to: "repo/fakeRepo",
  });
  expect(allocDoc.data_size).to.equal(newSize);
});

it("should retrieve a data record by ID via /view", () => {
  // Step 1: create a data record
  const createRes = request.post(`${data_base_url}/create?client=fakeUser`, {
    body: { title: "Record To View" },
    json: true,
  });
  expect(createRes.statusCode).to.equal(200);

  const createBody = typeof createRes.body === "string" ? JSON.parse(createRes.body) : createRes.body;
  const recordId = createBody.results[0].id;

  // Step 2: optionally create loc edge (if your /view code expects it)
  db.loc.save({
    _from: recordId,
    _to: "repo/fakeRepo",
  });

  // Step 3: call the /view endpoint
  const viewRes = request.get(`${data_base_url}/view`, {
    qs: {
      client: "fakeUser",
      id: recordId,
    },
    headers: {
      "x-correlation-id": "test-corr-001",
    },
    json: true,
  });

  expect(viewRes.statusCode).to.equal(200);

  const viewBody = typeof viewRes.body === "string" ? JSON.parse(viewRes.body) : viewRes.body;
  expect(viewBody).to.have.property("results").that.is.an("array").with.lengthOf(1);

  const data = viewBody.results[0];
  expect(data).to.have.property("id", recordId);
  expect(data).to.have.property("title", "Record To View");
  expect(data).to.not.have.property("_id");
  expect(data).to.not.have.property("_key");
  expect(data).to.not.have.property("_rev");
});
it("should export one or more data records as JSON strings via /export", () => {
  // Step 1: create two data records
  const createRes = request.post(`${data_base_url}/create/batch?client=fakeUser`, {
    body: [
      { title: "Export Record 1" },
      { title: "Export Record 2" },
    ],
    json: true,
  });
  expect(createRes.statusCode).to.equal(200);

  const createBody = typeof createRes.body === "string" ? JSON.parse(createRes.body) : createRes.body;
  const recordIds = createBody.results.map(r => r.id);

  // Step 2: optionally create loc edges if required by export
  recordIds.forEach(id => {
    db.loc.save({
      _from: id,
      _to: "repo/fakeRepo",
    });
  });

  // Step 3: call the /export endpoint
  const exportRes = request.post(`${data_base_url}/export?client=fakeUser`, {
    body: {
      id: recordIds,
    },
    headers: {
      "x-correlation-id": "test-corr-002",
    },
    json: true,
  });

  expect(exportRes.statusCode).to.equal(200);

  // Step 4: parse and validate exported data
  const exportBody = typeof exportRes.body === "string" ? JSON.parse(exportRes.body) : exportRes.body;

  expect(exportBody).to.be.an("array").with.lengthOf(recordIds.length);

  exportBody.forEach((jsonStr, idx) => {
    const data = JSON.parse(jsonStr);
    expect(data).to.have.property("id", recordIds[idx]);
    expect(data).to.have.property("title").that.includes("Export Record");
    expect(data).to.not.have.property("_id");
    expect(data).to.not.have.property("_key");
    expect(data).to.not.have.property("_rev");

    // Optional: verify deps array exists
    if (data.deps) expect(data.deps).to.be.an("array");
  });
});
it("should return a dependency graph for a data record", () => {
  // Step 1: create three data records
  const createRes = request.post(`${data_base_url}/create/batch?client=fakeUser`, {
    body: [
      { title: "Root Record" },
      { title: "Child Record" },
      { title: "Grandchild Record" },
    ],
    json: true,
  });

  expect(createRes.statusCode).to.equal(200);

  const createBody =
    typeof createRes.body === "string"
      ? JSON.parse(createRes.body)
      : createRes.body;

  const [rootId, childId, grandchildId] =
    createBody.results.map(r => r.id);

  // Step 2: create dependency edges
  // root -> child -> grandchild
  db.dep.save({
    _from: rootId,
    _to: childId,
    type: 1,
  });

  db.dep.save({
    _from: childId,
    _to: grandchildId,
    type: 1,
  });

  // Step 3: call dep graph endpoint
  const res = request.get(
    `${data_base_url}/dep/graph/get?client=fakeUser&id=${encodeURIComponent(rootId)}`
  );

  expect(res.statusCode).to.equal(200);

  const body = typeof res.body === "string"
    ? JSON.parse(res.body)
    : res.body;

  // Step 4: assertions
  expect(body).to.be.an("array");
  expect(body.length).to.be.greaterThan(0);

  const ids = body.map(n => n.id);

  expect(ids).to.include(rootId);
  expect(ids).to.include(childId);
  expect(ids).to.include(grandchildId);

  // Root node should have deps
  const rootNode = body.find(n => n.id === rootId);
  expect(rootNode).to.have.property("deps");
  expect(rootNode.deps).to.be.an("array");

  // Child node should reference root or grandchild
  const childNode = body.find(n => n.id === childId);
  expect(childNode).to.have.property("id", childId);

  // Grandchild node should exist
  const grandchildNode = body.find(n => n.id === grandchildId);
  expect(grandchildNode).to.have.property("id", grandchildId);
});
it("should lock multiple data records", () => {
  // Step 1: create multiple data records
  const createRes = request.post(`${data_base_url}/create/batch?client=fakeUser`, {
    body: [
      { title: "Lock Test 1" },
      { title: "Lock Test 2" },
      { title: "Lock Test 3" },
      { title: "Lock Test 4" },
    ],
    json: true,
  });

  expect(createRes.statusCode).to.equal(200);

  const createBody =
    typeof createRes.body === "string"
      ? JSON.parse(createRes.body)
      : createRes.body;

  const ids = createBody.results.map(r => r.id);

  // sanity check
  expect(ids).to.have.lengthOf(4);

  // Step 2: lock the records
  const lockRes = request.get(
    `${data_base_url}/lock?client=fakeUser&lock=true&ids=${ids.join("&ids=")}`
  );

  expect(lockRes.statusCode).to.equal(200);

  const lockBody =
    typeof lockRes.body === "string"
      ? JSON.parse(lockRes.body)
      : lockRes.body;

  // Step 3: verify response
  expect(lockBody).to.be.an("array").with.lengthOf(ids.length);

  lockBody.forEach(r => {
    expect(r).to.have.property("id");
    expect(r).to.have.property("locked", true);
  });

  // Step 4: verify DB state
  ids.forEach(id => {
    const doc = db._document(id);
    expect(doc.locked).to.equal(true);
  });
});
it("should return the raw data local path for a data record", () => {
  // Step 1: create a data record
  const createRes = request.post(`${data_base_url}/create?client=fakeUser`, {
    body: {
      title: "Path Test Record",
    },
    json: true,
  });

  expect(createRes.statusCode).to.equal(200);

  const createBody =
    typeof createRes.body === "string"
      ? JSON.parse(createRes.body)
      : createRes.body;

  const recordId = createBody.results[0].id;

  // Step 2: ensure repo has a domain
  const repo = db.repo.document("repo/fakeRepo");
  db.repo.update(repo._id, {
    domain: "local",
    path: "/tmp/fakeRepo",
    exp_path: "/tmp/fakeRepo",
  });

  // Step 3: create loc edge for the record
  db.loc.save({
    _from: recordId,
    _to: "repo/fakeRepo",
    path: "/tmp/fakeRepo/data/file.bin",
  });

  // Step 4: call /path
  const res = request.get(
    `${data_base_url}/path?client=fakeUser&id=${recordId}&domain=local`
  );

  expect(res.statusCode).to.equal(200);

  const body =
    typeof res.body === "string"
      ? JSON.parse(res.body)
      : res.body;

  // Step 5: assertions
  expect(body).to.have.property("path");
  expect(body.path).to.be.a("string");
  expect(body.path.length).to.be.greaterThan(0);
});
it("should list data records by allocation for a repo", () => {
  // Step 1: create two data records
  const createRes = request.post(`${data_base_url}/create/batch?client=fakeUser`, {
    body: [
      { title: "Alloc Record One" },
      { title: "Alloc Record Two" },
    ],
    json: true,
  });

  expect(createRes.statusCode).to.equal(200);

  const createBody =
    typeof createRes.body === "string"
      ? JSON.parse(createRes.body)
      : createRes.body;

  const ids = createBody.results.map(r => r.id);
  expect(ids).to.have.lengthOf(2);

  // Step 2: ensure repo exists (already created in beforeEach)
  const repoId = "repo/fakeRepo";

  // Step 3: create loc edges linking records to repo
  ids.forEach((id) => {
    db.loc.save({
      _from: id,
      _to: repoId,
      uid: "u/fakeUser", // required by query filter e.uid == @uid
    });
  });

  // Step 4: call list/by_alloc
  const res = request.get(
    `${data_base_url}/list/by_alloc?client=fakeUser&repo=${repoId}`
  );

  expect(res.statusCode).to.equal(200);

  const body =
    typeof res.body === "string"
      ? JSON.parse(res.body)
      : res.body;

  // Step 5: assertions

  expect(body).to.be.an("array");
const uniqueIds = new Set(body.map(r => r.id));
expect(uniqueIds.size).to.equal(2);

  const titles = body.map(r => r.title);
  expect(titles).to.include("Alloc Record One");
  expect(titles).to.include("Alloc Record Two");
  
  body.forEach((rec) => {
    expect(rec).to.have.property("id");
    expect(rec).to.have.property("owner");
    expect(rec).to.have.property("creator");
  });
});

it("should initialize a data get task in check-only mode", () => {
  // Step 1: create a data record
  const createRes = request.post(`${data_base_url}/create?client=fakeUser`, {
    body: {
      title: "Get IT Test Record",
    },
    json: true,
  });

  expect(createRes.statusCode).to.equal(200);

  const createBody =
    typeof createRes.body === "string"
      ? JSON.parse(createRes.body)
      : createRes.body;

  const recordId = createBody.results[0].id;

  // Step 2: create required loc edge (used by get path resolution)
  db.loc.save({
    _from: recordId,
    _to: "repo/fakeRepo",
    path: "/tmp/fakeRepo/data/file.bin",
  });

  // Step 3: call /get in check-only mode
  const res = request.post(`${data_base_url}/get?client=fakeUser`, {
    body: {
      id: [recordId],
      check: true, // avoids real Globus transfer
    },
    headers: {
      "x-correlation-id": "test-corr-get-it-001",
    },
    json: true,
  });

  expect(res.statusCode).to.equal(200);

  const body =
    typeof res.body === "string"
      ? JSON.parse(res.body)
      : res.body;

  // Step 4: assertions
  expect(body).to.be.an("object");

});

it("should initialize a data put task in check-only mode", () => {
  // Step 1: create a data record
  const createRes = request.post(`${data_base_url}/create?client=fakeUser`, {
    body: {
      title: "Put Test Record",
    },
    json: true,
  });

  expect(createRes.statusCode).to.equal(200);

  const createBody =
    typeof createRes.body === "string"
      ? JSON.parse(createRes.body)
      : createRes.body;

  const recordId = createBody.results[0].id;

  // Step 2: call /put in check-only mode
  const res = request.post(`${data_base_url}/put?client=fakeUser`, {
    body: {
      id: [recordId],
      check: true,               // avoid real Globus upload
      ext: ".bin",
    },
    headers: {
      "x-correlation-id": "test-corr-put-it-001",
    },
    json: true,
  });

  expect(res.statusCode).to.equal(200);

  const body =
    typeof res.body === "string"
      ? JSON.parse(res.body)
      : res.body;

  // Step 3: IT-safe assertions
  expect(body).to.be.an("object");
});

it("should initialize an allocation change task for data records", () => {
  // Step 1: create two data records
  const createRes = request.post(`${data_base_url}/create/batch?client=fakeUser`, {
    body: [
      { title: "AllocChg Record 1" },
      { title: "AllocChg Record 2" },
    ],
    json: true,
  });

  expect(createRes.statusCode).to.equal(200);

  const createBody =
    typeof createRes.body === "string"
      ? JSON.parse(createRes.body)
      : createRes.body;

  const ids = createBody.results.map(r => r.id);
  expect(ids).to.have.lengthOf(2);

  // Step 2: create loc edges pointing to the original repo
  ids.forEach(id => {
    db.loc.save({
      _from: id,
      _to: "repo/fakeRepo",
      uid: "u/fakeUser",
    });
  });

  // Step 3: create a new repo
  db.repo.save({
    _key: "newRepo",
    path: "/tmp/newRepo",
  });

  // Step 4: create allocation for fakeUser -> newRepo
  db.alloc.save({
    _from: "u/fakeUser",
    _to: "repo/newRepo",
    rec_count: 0,
    rec_limit: 10,
    data_size: 0,
    data_limit: 100000000,
    state: "active",
  });

  // Step 5: call alloc_chg in check-only mode
  const res = request.post(`${data_base_url}/alloc_chg?client=fakeUser`, {
    body: {
      ids,
      repo_id: "repo/newRepo",
      check: true, // IMPORTANT: do not actually move data
    },
    headers: {
      "x-correlation-id": "test-corr-alloc-chg-001",
    },
    json: true,
  });

  expect(res.statusCode).to.equal(200);

  const body =
    typeof res.body === "string"
      ? JSON.parse(res.body)
      : res.body;

  // Step 6: assertions
  expect(body).to.be.an("object");
  const locEdges = db.loc.byExample({ _to: "repo/newRepo" }).toArray();
  expect(locEdges.length).to.equal(0);
});
it("should initialize an owner change task for data records", () => {
 db.c.save({
  _key: "u_fakeUser_newOwner",
});

const newCollId = "c/u_fakeUser_newOwner";

 
// 🔑 REQUIRED: owner edge for destination collection
db.owner.save({
  _from: newCollId,
  _to: "u/fakeUser",
});
  // Step 1: create multiple data records
  const createRes = request.post(`${data_base_url}/create/batch?client=fakeUser`, {
    body: [
      { title: "OwnerChg Record 1" },
      { title: "OwnerChg Record 2" },
      { title: "OwnerChg Record 3" },
      { title: "OwnerChg Record 4" },
    ],
    json: true,
  });

  expect(createRes.statusCode).to.equal(200);

  const createBody =
    typeof createRes.body === "string"
      ? JSON.parse(createRes.body)
      : createRes.body;

  const ids = createBody.results.map(r => r.id);
  expect(ids).to.have.lengthOf(4);

  // Step 2: ensure original owner collection exists
  const originalCollId = "c/u_fakeUser_root";

  // Step 3: create owner edges for each record (REQUIRED)
  ids.forEach(id => {
    db.owner.save({
      _from: id,
      _to: originalCollId,
    });
  });


 
  // Step 5: call owner_chg in check-only mode
  const res = request.post(`${data_base_url}/owner_chg?client=fakeUser`, {
    body: {
      ids,
      coll_id: newCollId,
      check: true,
    },
    headers: {
      "x-correlation-id": "test-corr-owner-chg-001",
    },
    json: true,
  });

  expect(res.statusCode).to.equal(200);

  const body =
    typeof res.body === "string"
      ? JSON.parse(res.body)
      : res.body;

  // Step 6: assertions
  expect(body).to.be.an("object");
});
it("should initialize a delete task for data records", () => {

  // Step 1: create data records
  const createRes = request.post(`${data_base_url}/create/batch?client=fakeUser`, {
    body: [
      { title: "Delete Test Record 1" },
      { title: "Delete Test Record 2" },
    ],
    json: true,
  });

  expect(createRes.statusCode).to.equal(200);

  const createBody =
    typeof createRes.body === "string"
      ? JSON.parse(createRes.body)
      : createRes.body;

  const ids = createBody.results.map(r => r.id);
  expect(ids).to.have.lengthOf(2);

  // Step 2: sanity check — records exist
ids.forEach(id => {
  const doc = db.d.document(id, true); // safe: returns null if not found
  expect(doc).to.be.an("object");
  expect(doc).to.have.property("_id", id);
});


  // Step 3: call delete route
  const res = request.post(`${data_base_url}/delete?client=fakeUser`, {
    body: {
      ids,
    },
    headers: {
      "x-correlation-id": "test-corr-delete-001",
    },
    json: true,
  });

  expect(res.statusCode).to.equal(200);

  const body =
    typeof res.body === "string"
      ? JSON.parse(res.body)
      : res.body;

  // Step 4: assertions — task created
  expect(body).to.be.an("object");
  expect(body).to.have.property("task");
  expect(body.task).to.have.property("_id");
  expect(body.task).to.have.property("status");

});

});
