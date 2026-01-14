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
            "c",
            "owner",
            "alloc",
            "a",
            "alias",
            "item",
            "t",
            "top",
            "tag",
            "uuid",
            "accn",
            "u",
            "d",
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
            max_coll: 10,
        });

        // 2. Alloc record so "owner" has an allocation
        db.alloc.save({
            _from: "u/client1",
            _to: "alloc/owner1",
        });

        // 3. Root collection for this user
        const root = db.c.save({
            _key: "root1",
            owner: "u/client1",
            creator: "u/client1",
            ct: 0,
            ut: 0,
            title: "root",
        });

        // 4. Owner edge pointing to root
        db.owner.save({
            _from: "c/root1",
            _to: "u/client1",
        });

        // (Optional) If your g_lib.getRootID depends on something else, adjust accordingly
    });

    after(() => {
        const collections = [
            "c",
            "owner",
            "alloc",
            "a",
            "alias",
            "item",
            "t",
            "top",
            "tag",
            "uuid",
            "accn",
            "u",
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
            tags: ["alpha", "beta"],
        };

        // Send POST with query param ?client=client1
        const response = request.post(coll_base_url + "?client=client1", {
            json: true,
            body,
        });

        expect(response.status).to.equal(200);
        expect(response.json).to.have.property("results");
        expect(response.json.results).to.be.an("array").with.length(1);

        const created = response.json.results[0];

        expect(created).to.have.property("title", "Test Collection");
        expect(created).to.have.property("parent_id", "c/root1");
    });

    it("should NOT crash if collection creation fails before result is built", () => {
        const body = {
            title: "Broken Collection",
            parent: "c/doesNotExist",
        };

        const response = request.post(`${baseUrl}/col/create?client=client1`, {
            json: true,
            body,
        });

        // Should return controlled error, not logging crash
        expect(response.status).to.not.equal(500);
        expect(response.json).to.have.property("error");
    });

    it("should update an existing collection", () => {
        db.c.save({
            _key: "coll1",
            owner: "u/client1",
            creator: "u/client1",
            title: "Old Title",
            desc: "Old Desc",
            tags: ["old"],
        });

        db.owner.save({
            _from: "c/coll1",
            _to: "u/client1",
        });
        //
        // ---- CALL UPDATE ----
        //
        const body = {
            id: "c/coll1",
            title: "New Title",
            desc: "New Desc",
            tags: ["x", "y"],
        };

        const response = request.post(`${baseUrl}/col/update?client=client1`, {
            json: true,
            body,
        });

        expect(response.status).to.equal(200);
        expect(response.json.results).to.be.an("array").with.length(1);

        const updated = response.json.results[0];

        //
        // ---- ASSERTIONS ----
        //
        expect(updated.title).to.equal("New Title");
        expect(updated.desc).to.equal("New Desc");
        expect(updated.tags).to.deep.equal(["x", "y"]);
    });

    it("should NOT crash when updating a non-existent collection", () => {
        const body = {
            id: "c/missing",
            title: "Nope",
        };

        const response = request.post(`${baseUrl}/col/update?client=client1`, {
            json: true,
            body,
        });

        expect(response.status).to.not.equal(500);
        expect(response.json).to.have.property("error");
    });

    it("should view an existing collection", () => {
        //
        // Minimal fixture data required for view route
        //

        // The collection we want to view
        db.c.save({
            _key: "collview1",
            owner: "u/client1",
            creator: "u/client1",
            title: "View Title",
            desc: "View Desc",
            tags: ["v1", "v2"],
            notes: "This is a test note",
        });

        // Owner edge
        db.owner.save({
            _from: "c/collview1",
            _to: "u/client1",
        });

        //
        // ---- CALL VIEW ----
        //
        const response = request.get(`${baseUrl}/col/view?client=client1&id=c/collview1`, {
            json: true,
        });

        //
        // ---- ASSERTIONS ----
        //
        expect(response.status).to.equal(200);
        expect(response.json.results).to.be.an("array").with.length(1);

        const viewed = response.json.results[0];

        expect(viewed.id).to.equal("c/collview1");
        expect(viewed.title).to.equal("View Title");
        expect(viewed.desc).to.equal("View Desc");

        // tags come through normally
        expect(viewed.tags).to.deep.equal(["v1", "v2"]);

        // notes are passed through mask (not null)
        expect(viewed.notes).to.exist;
    });

    it("should read the contents of a collection", () => {
        // Create parent
        db.c.save({
            _key: "readParent",
            owner: "u/client1",
            creator: "u/client1",
            title: "Parent",
        });

        // Allow client1 to list it
        db.owner.save({
            _from: "c/readParent",
            _to: "u/client1",
        });

        // Create one child in c
        db.c.save({
            _key: "readChild",
            owner: "u/client1",
            creator: "u/client1",
            title: "Child",
        });

        // Link parent -> child with item edge
        db.item.save({
            _from: "c/readParent",
            _to: "c/readChild",
        });

        // ---- Call /read ----
        const response = request.get(`${baseUrl}/col/read?client=client1&id=c/readParent`, {
            json: true,
        });

        // ---- Assertions ----
        expect(response.status).to.equal(200);
        expect(response.json).to.be.an("array");

        // Should contain the child
        const child = response.json.find((r) => r.id === "c/readChild");
        expect(child).to.exist;
        expect(child.title).to.equal("Child");
    });

    it("should NOT crash when user lacks permission to read collection", () => {
        // Create collection owned by someone else
        db.c.save({
            _key: "privateColl",
            owner: "u/other",
            creator: "u/other",
            title: "Private",
        });

        const response = request.get(`${baseUrl}/col/read?client=client1&id=c/privateColl`, {
            json: true,
        });

        expect(response.status).to.not.equal(500);
        expect(response.json).to.have.property("error");
    });

    it("should add an item to a collection", () => {
        //
        // --- FIXTURE ---
        //

        // Parent collection
        db.c.save({
            _key: "wpParent",
            owner: "u/client1",
            creator: "u/client1",
            title: "Parent",
        });

        // Owner edge
        db.owner.save({
            _from: "c/wpParent",
            _to: "u/client1",
        });

        // Item to add
        db.c.save({
            _key: "wpChild",
            owner: "u/client1",
            creator: "u/client1",
            title: "Child",
        });

        // Owner edge for child (required because write route checks owners)
        db.owner.save({
            _from: "c/wpChild",
            _to: "u/client1",
        });

        //
        // --- CALL /write (ADD) ---
        //
        const response = request.get(
            `${baseUrl}/col/write?client=client1&id=c/wpParent&add[]=c/wpChild`,
            { json: true },
        );

        //
        // --- ASSERTIONS ---
        //
        expect(response.status).to.equal(200);

        // Should return empty array because no "loose" items
        expect(response.json).to.be.an("array").that.is.empty;
    });

    it("should move an item between collections", () => {
        // --- FIXTURE ---
        // Source collection
        db.c.save({ _key: "srcColl", owner: "u/client1", creator: "u/client1", title: "Source" });
        db.owner.save({ _from: "c/srcColl", _to: "u/client1" });

        // Destination collection
        db.c.save({
            _key: "dstColl",
            owner: "u/client1",
            creator: "u/client1",
            title: "Destination",
        });
        db.owner.save({ _from: "c/dstColl", _to: "u/client1" });

        // Item to move
        db.c.save({ _key: "item1", owner: "u/client1", creator: "u/client1", title: "Item" });
        db.owner.save({ _from: "c/item1", _to: "u/client1" });

        // Link item to source collection (required by /move)
        db.item.save({ _from: "c/srcColl", _to: "c/item1" });

        // --- CALL /move ---
        const response = request.get(
            `${baseUrl}/col/move?client=client1&source=c/srcColl&dest=c/dstColl&items[]=c/item1`,
            { json: true },
        );

        // --- ASSERTIONS ---
        expect(response.status).to.equal(200);
        expect(response.json).to.deep.equal({}); // /move returns empty object
    });

    it("should return parent collections for an item", () => {
        // --- FIXTURE ---
        // Parent collection
        db.c.save({
            _key: "parentColl",
            owner: "u/client1",
            creator: "u/client1",
            title: "Parent",
        });
        db.owner.save({ _from: "c/parentColl", _to: "u/client1" });

        // Child item
        db.d.save({ _key: "childItem", owner: "u/client1", creator: "u/client1", title: "Child" });
        db.owner.save({ _from: "d/childItem", _to: "u/client1" });

        // Link child to parent
        db.item.save({ _from: "c/parentColl", _to: "d/childItem" });

        // --- CALL /get_parents ---
        const response = request.get(`${baseUrl}/col/get_parents?client=client1&id=d/childItem`, {
            json: true,
        });

        // --- ASSERTIONS ---
        expect(response.status).to.equal(200);
        expect(response.json).to.be.an("array");
        expect(response.json[0][0]).to.have.property("id", "c/parentColl");
        expect(response.json[0][0]).to.have.property("title", "Parent");
    });

    it("should include the child item if inclusive=true", () => {
        db.c.save({
            _key: "parentColl",
            owner: "u/client1",
            creator: "u/client1",
            title: "Parent",
        });
        db.owner.save({ _from: "c/parentColl", _to: "u/client1" });

        db.d.save({ _key: "childItem", owner: "u/client1", creator: "u/client1", title: "Child" });
        db.owner.save({ _from: "d/childItem", _to: "u/client1" });

        db.item.save({ _from: "c/parentColl", _to: "d/childItem" });
        const response = request.get(
            `${baseUrl}/col/get_parents?client=client1&id=d/childItem&inclusive=true`,
            { json: true },
        );

        expect(response.status).to.equal(200);
        expect(response.json).to.be.an("array");
        // The first element of the first path should be the child itself
        expect(response.json[0][0]).to.have.property("id", "d/childItem");
        expect(response.json[0][0]).to.have.property("title", "Child");
    });

    it("should return the correct offset of an item in a collection", () => {
        // --- FIXTURE ---
        const clientId = "client1";

        // Parent collection
        db.c.save({
            _key: "coll1",
            owner: "u/client1",
            creator: "u/client1",
            title: "My Collection",
        });
        db.owner.save({ _from: "c/coll1", _to: "u/client1" });

        // Items in the collection
        for (let i = 1; i <= 10; i++) {
            const itemId = `d/item${i}`;
            db.d.save({
                _key: `item${i}`,
                owner: "u/client1",
                creator: "u/client1",
                title: `Item ${i}`,
            });
            db.owner.save({ _from: itemId, _to: "u/client1" });
            db.item.save({ _from: "c/coll1", _to: itemId });
        }

        // --- CALL /get_offset ---
        const pageSize = 3;
        const targetItem = "d/item5";

        const response = request.get(
            `${baseUrl}/col/get_offset?client=${clientId}&id=c/coll1&item=${targetItem}&page_sz=${pageSize}`,
            { json: true },
        );

        expect(response.status).to.equal(200);

        // Items 1-3 -> offset 0
        // Items 4-6 -> offset 3
        // Item 5 is in second page, offset should be 3
        expect(response.json).to.have.property("offset", 3);
    });

    it("should NOT crash if item is not found when getting offset", () => {
        // --- FIXTURE ---
        db.c.save({
            _key: "collOffsetFail",
            owner: "u/client1",
            creator: "u/client1",
            title: "Offset Test",
        });
        db.owner.save({ _from: "c/collOffsetFail", _to: "u/client1" });

        // No items added at all

        const response = request.get(
            `${baseUrl}/col/get_offset?client=client1&id=c/collOffsetFail&item=d/doesNotExist&page_sz=5`,
            { json: true },
        );

        // Should return a controlled error, NOT a 500 crash
        expect(response.status).to.not.equal(500);
        expect(response.json).to.have.property("error");
    });
    it("should NOT crash if page_sz is invalid in get_offset", () => {
        db.c.save({
            _key: "collBadPage",
            owner: "u/client1",
            creator: "u/client1",
            title: "Bad Page",
        });
        db.owner.save({ _from: "c/collBadPage", _to: "u/client1" });

        const response = request.get(
            `${baseUrl}/col/get_offset?client=client1&id=c/collBadPage&item=d/item1&page_sz=0`,
            { json: true },
        );

        expect(response.status).to.not.equal(500);
    });

    it("should return a list of published collections for a client", () => {
        const clientId = "client1";
        const userId = `u/${clientId}`;

        // --- Ensure collections exist ---
        if (!db._collection("c")) db._createDocumentCollection("c");
        if (!db._collection("u")) db._createDocumentCollection("u");
        if (!db._collection("owner")) db._createEdgeCollection("owner");

        // --- Ensure test user exists ---
        let userDoc = db.u.firstExample({ _key: clientId });
        if (!userDoc) {
            userDoc = db.u.save({ _key: clientId, name: "Client One" });
        }

        // --- Clean up previous test data ---
        db.c.truncate();
        db.owner.truncate();

        // --- Create some published collections ---
        const publishedColls = [
            {
                _key: "pub1",
                owner: userDoc._id,
                creator: userDoc._id,
                title: "Alpha",
                public: true,
            },
            { _key: "pub2", owner: userDoc._id, creator: userDoc._id, title: "Beta", public: true },
            {
                _key: "pub3",
                owner: userDoc._id,
                creator: userDoc._id,
                title: "Gamma",
                public: true,
            },
        ];

        publishedColls.forEach((c) => {
            const collDoc = db.c.save(c); // Save collection
            db.owner.save({ _from: collDoc._id, _to: userDoc._id }); // Edge must use real _id
        });

        // --- CALL /published/list without pagination ---
        let response = request.get(`${baseUrl}/col/published/list?client=${clientId}`, {
            json: true,
        });
        expect(response.status).to.equal(200);
        const titles = response.json.map((x) => x.title);
        expect(titles).to.include.members(["Alpha", "Beta", "Gamma"]);

        // --- CALL /published/list with pagination ---
        const offset = 1;
        const count = 2;
        response = request.get(
            `${baseUrl}/col/published/list?client=${clientId}&offset=${offset}&count=${count}`,
            { json: true },
        );
        expect(response.status).to.equal(200);
        const paged = response.json;
        const pagingInfo = paged.pop().paging;
        expect(pagingInfo).to.deep.equal({ off: offset, cnt: count, tot: 3 });
    });
});
