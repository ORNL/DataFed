"use strict";
// NOTE: completion of tests requires successful run of user_fixture.js script

// Need to pull enum from support
const g_lib = require("../api/support");

// Integration test of API
const { expect } = require("chai");
const request = require("@arangodb/request");
const { baseUrl } = module.context;
const { db } = require("@arangodb");

const note_base_url = `${baseUrl}/note`;

describe("unit_note_router: the Foxx microservice note_router /create endpoint", () => {
    after(function () {
        const collections = ["note", "d", "u"];
        collections.forEach((name) => {
            let col = db._collection(name);
            if (col) col.truncate();
        });
    });

    beforeEach(() => {
        const collections = [
            { name: "u", type: "document" },
            { name: "d", type: "document" },
            { name: "note", type: "edge" }, // must be edge
            ];

    collections.forEach(({ name, type }) => {
        const col = db._collection(name);
        if (col) {
            col.truncate();
        } else {
            db._create(name, { type: type === "edge" ? 3 : 2 });
        }
        });
    });

    it("should successfully run the search route", () => {

        const user = db.u.save({
        _key: "testUser",
        _id: "u/testUser",
        name: "Test User",
        email: "testuser@example.com",
        is_admin: true,
        });

        const data = db.d.save({
        _key: "ID",
        _id: "d/ID",
        owner: user._id,
        });

        // Prepare the request
        const request_string = `${note_base_url}/create?client=${encodeURIComponent(
        user._id
        )}&subject=${encodeURIComponent(data._id)}&type=1&title=UnitTestTitle&comment=UnitTestComment`;

        // act
        const response = request.post(request_string);
        // assert
        expect(response.status).to.equal(200);
    });

    it("should successfully update an existing annotation", () => {
        // Arrange
        const user = db.u.save({
            _key: "testUser",
            _id: "u/testUser",
            name: "Test User",
            email: "testuser@example.com",
            is_admin: true,
        });

        const data = db.d.save({
            _key: "ID",
            _id: "d/ID",
            owner: user._id,
        });

        // Create a note record (edge + document)
        const note_doc = db.n.save({
            type: 1,
            state: 0,
            title: "OldTitle",
            creator: user._id,
            comments: [],
        });

        db.note.save({
            _from: data._id,
            _to: note_doc._id,
        });

        // Act — call /update
        const request_string = `${note_base_url}/update?client=${encodeURIComponent(user._id)}&id=${encodeURIComponent(note_doc._id)}&new_state=1&new_title=UpdatedTitle&comment=UpdatedComment`;

        const response = request.post(request_string);

        // Assert
        expect(response.status).to.equal(200);
        const body = JSON.parse(response.body);
        expect(body.results[0]._id).to.equal(note_doc._id);
        expect(body.results[0].state).to.equal(1);
    });

    it("should successfully edit an annotation comment", () => {
        // Arrange: create user and data
        const user = db.u.save({
            _key: "testUser",
            _id: "u/testUser",
            name: "Test User",
            email: "testuser@example.com",
            is_admin: true,
        });

        const data = db.d.save({
            _key: "ID",
            _id: "d/ID",
            owner: user._id,
        });

        // Create a note document with one comment
        const note_doc = db.n.save({
            type: 1,
            state: 0,
            title: "Test Note",
            creator: user._id,
            comments: [
                {
                    user: user._id,
                    time: Math.floor(Date.now() / 1000),
                    comment: "Original Comment",
                },
            ],
        });

        db.note.save({
            _from: data._id,
            _to: note_doc._id,
        });

        // Act: edit the existing comment
        const newComment = "Edited Comment";
        const request_string = `${note_base_url}/comment/edit?client=${encodeURIComponent(user._id)}&id=${encodeURIComponent(note_doc._id)}&comment=${encodeURIComponent(newComment)}&comment_idx=0`;

        const response = request.post(request_string);

        // Assert
        expect(response.status).to.equal(200);
        const body = JSON.parse(response.body);
        const updatedNote = body.results[0];
        expect(updatedNote.comments[0].comment).to.equal(newComment);
    });

    it("should successfully view an annotation", () => {
        // Arrange: create user and data record
        const user = db.u.save({
            _key: "testUser",
            _id: "u/testUser",
            name: "Test User",
            email: "testuser@example.com",
            is_admin: true,
        });

        const data = db.d.save({
            _key: "ID",
            _id: "d/ID",
            owner: user._id,
        });

        // Create a note linked to the data record
        const note_doc = db.n.save({
            type: 1,
            state: 0,
            title: "Viewable Note",
            creator: user._id,
            comments: [
                {
                    user: user._id,
                    time: Math.floor(Date.now() / 1000),
                    comment: "Initial Comment",
                },
            ],
        });

        db.note.save({
            _from: data._id,
            _to: note_doc._id,
        });

        // Act: call /note/view
        const request_string = `${note_base_url}/view?client=${encodeURIComponent(
            user._id
        )}&id=${encodeURIComponent(note_doc._id)}`;

        const response = request.get(request_string);

        // Assert
        expect(response.status).to.equal(200);
        const body = JSON.parse(response.body);
        expect(body.results).to.be.an("array").that.is.not.empty;
        expect(body.results[0]._id).to.equal(note_doc._id);
        expect(body.results[0].title).to.equal("Viewable Note");
    });

 it("should list all annotations for a subject", () => {
        // Arrange: create a user and subject document
        const user = db.u.save({
            _key: "testUser",
            _id: "u/testUser",
            name: "Test User",
            email: "testuser@example.com",
            is_admin: true,
        });

        const subject = db.d.save({
            _key: "subj1",
            _id: "d/subj1",
            owner: user._id,
        });

        // Create a few note documents and connect them
        const note1 = db.n.save({
            type: 1,
            state: 2, // active
            title: "Subject Note 1",
            creator: user._id,
            comments: [
                {
                    user: user._id,
                    time: Math.floor(Date.now() / 1000),
                    comment: "First comment",
                },
            ],
        });

        const note2 = db.n.save({
            type: 0,
            state: 2,
            title: "Subject Note 2",
            creator: user._id,
            comments: [],
        });

        db.note.save({ _from: subject._id, _to: note1._id });
        db.note.save({ _from: subject._id, _to: note2._id });

        // Act: call /note/list/by_subject
        const request_string = `${note_base_url}/list/by_subject?client=${encodeURIComponent(
            user._id
        )}&subject=${encodeURIComponent(subject._id)}`;

        const response = request.get(request_string);

        // Assert
        expect(response.status).to.equal(200);
        const body = JSON.parse(response.body);
        expect(body.results).to.be.an("array");
        expect(body.results.length).to.equal(2);
        expect(body.results.map((r) => r.title)).to.include("Subject Note 1");
    });

        it("should purge old closed annotations", () => {
        // Arrange: create user and subject
        const user = db.u.save({
            _key: "purgeUser",
            _id: "u/purgeUser",
            name: "Purge Tester",
            email: "purgetest@example.com",
            is_admin: true,
        });

        const subject = db.d.save({
            _key: "purgeSubj",
            _id: "d/purgeSubj",
            owner: user._id,
        });

        const now = Math.floor(Date.now() / 1000);

        // Create one old closed note (should be deleted)
        const oldClosedNote = db.n.save({
            type: 1,
            state: g_lib.NOTE_CLOSED, // usually 2 or something similar
            title: "Old Closed Note",
            creator: user._id,
            ut: now - 100000, // 100k seconds old
            parent_id: null,
        });
        db.note.save({ _from: subject._id, _to: oldClosedNote._id });

        // Create one recent closed note (should stay)
        const recentClosedNote = db.n.save({
            type: 1,
            state: g_lib.NOTE_CLOSED,
            title: "Recent Closed Note",
            creator: user._id,
            ut: now, // current time
            parent_id: null,
        });
        db.note.save({ _from: subject._id, _to: recentClosedNote._id });

        // Create one open note (should stay)
        const openNote = db.n.save({
            type: 1,
            state: 0, // open
            title: "Open Note",
            creator: user._id,
            ut: now - 200000,
            parent_id: null,
        });
        db.note.save({ _from: subject._id, _to: openNote._id });

        // Act: purge notes older than 50,000 seconds
        const request_string = `${note_base_url}/purge?client=${encodeURIComponent(
            user._id
        )}&age_sec=50000`;

        const response = request.get(request_string);

        // Assert: response should be OK
        expect(response.status).to.equal(204);
    });
});
