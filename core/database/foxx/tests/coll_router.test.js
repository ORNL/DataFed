"use strict";

const { expect } = require("chai");
const request = require("@arangodb/request");
const { baseUrl } = module.context;
const { db } = require("@arangodb");

// import support utilities if needed
const g_lib = require("../api/support");

const coll_base_url = `${baseUrl}/col/create`;

describe("unit_coll_router: /col/create endpoint", () => {

    //
    // NOTE:
    // The /create route requires many collections and relations:
    //   - c, owner, alloc, a, alias, item, t, top, tag, uuid, accn
    // You must prepare enough minimal fixture data so the transaction succeeds.
    //

    beforeEach(() => {
        const collections = [
            "c", "owner", "alloc", "a", "alias",
            "item", "t", "top", "tag", "uuid", "accn", "u"
        ];

        collections.forEach((name) => {
            let col = db._collection(name);
            if (!col) {
                db._create(name);
            } else {
                col.truncate();
            }
        });

        //
        // MINIMAL FIXTURE SETUP REQUIRED
        //

        // 1. Create a fake client user
        db.u.save({
            _key: "client1",
            name: "Test User",
            max_coll: 10
        });

        // 2. Alloc record so "owner" has an allocation
        db.alloc.save({
            _from: "u/client1",
            _to: "alloc/owner1"
        });

        // 3. Root collection for this user
        const root = db.c.save({
            _key: "root1",
            owner: "u/client1",
            creator: "u/client1",
            ct: 0, ut: 0, title: "root"
        });

        // 4. Owner edge pointing to root
        db.owner.save({
            _from: "c/root1",
            _to: "u/client1"
        });

        // (Optional) If your g_lib.getRootID depends on something else, adjust accordingly
    });

    after(() => {
        const collections = [
            "c", "owner", "alloc", "a", "alias",
            "item", "t", "top", "tag", "uuid", "accn", "u"
        ];
        collections.forEach((name) => {
            let col = db._collection(name);
            if (col) col.truncate();
        });
    });

    it("should successfully create a new collection", () => {

        const body = {
            title: "Test Collection",
            desc: "Unit Test Desc",
            parent: "c/root1",
            tags: ["alpha", "beta"]
        };

        // Send POST with query param ?client=client1
        const response = request.post(coll_base_url + "?client=client1", {
            json: true,
            body
        });

        expect(response.status).to.equal(200);
        expect(response.json).to.have.property("results");
        expect(response.json.results).to.be.an("array").with.length(1);

        const created = response.json.results[0];

        expect(created).to.have.property("title", "Test Collection");
        expect(created).to.have.property("parent_id", "c/root1");
    });

});
