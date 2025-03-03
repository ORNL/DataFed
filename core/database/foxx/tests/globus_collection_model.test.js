"use strict";

const { GlobusCollectionModel, GlobusCollection } = require("../api/models/globus_collection");

const { expect } = require("chai");
const { db } = require("@arangodb");

const collection_no_token_uuid = "94445318-2097-4ed8-8550-f73cd292b11f"; // fake collection UUID from fixture file
const fake_uuid = "d5a58070-33e2-4841-80c5-7722a749f8e2"; // some fake uuid

describe("unit_globus_collection_model: calling constructor", () => {
    it("should create a collection model object when passed a collection id", () => {
        const globus_collection_model = new GlobusCollectionModel(collection_no_token_uuid);
        expect(globus_collection_model).to.be.instanceOf(GlobusCollectionModel);
    });
    it("should throw an error when not passed a collection id", () => {
        expect(() => new GlobusCollectionModel()).to.throw(
            "A Globus Collection ID must be provided",
        );
    });
});

describe("unit_globus_collection_model: calling exists", () => {
    it("should return true when collection exists on DB", () => {
        const globus_collection_exists = new GlobusCollectionModel(
            collection_no_token_uuid,
        ).exists();
        expect(globus_collection_exists).to.be.true;
    });
    it("should return false when collection does not exist on DB", () => {
        const globus_collection_exists = new GlobusCollectionModel(fake_uuid).exists();
        expect(globus_collection_exists).to.be.false;
    });
});

describe("unit_globus_collection_model: calling get", () => {
    let globus_collection_db;
    before(() => {
        // TODO: abstract DB calls
        globus_collection_db = Object.freeze(
            db.globus_coll.document({ _key: collection_no_token_uuid }),
        );
    });
    it("should return a read only globus collection object when the collection exists", () => {
        const globus_collection = new GlobusCollectionModel(collection_no_token_uuid).get();

        expect(globus_collection).to.be.instanceOf(GlobusCollection);
        expect(globus_collection).to.be.frozen;
        expect(globus_collection).to.include({
            id: globus_collection_db._id,
            key: globus_collection_db._key,
            name: globus_collection_db.name,
            description: globus_collection_db.description,
            required_scopes: globus_collection_db.required_scopes,
            owner: globus_collection_db.owner,
            creation_time: globus_collection_db.ct,
            update_time: globus_collection_db.ut,
            type: globus_collection_db.type,
            ha_enabled: globus_collection_db.ha_enabled,
        });
    });
    it("should return a read only empty globus collection object with all fields undefined when the collection does not exist", () => {
        const globus_collection = new GlobusCollectionModel(fake_uuid).get();

        expect(globus_collection).to.be.instanceOf(GlobusCollection);
        expect(globus_collection).to.be.frozen;
        Object.keys(GlobusCollection).map((key) => {
            expect(globus_collection).to.have.property(key, undefined);
        });
    });
});
