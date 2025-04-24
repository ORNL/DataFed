import { expect } from "chai";
import sinon from "sinon";
import { EndpointEntityType, EndpointModel } from "../static/models/endpoint-model.js";

describe("EndpointEntityType", () => {
    it("should contain the correct enum string values", () => {
        expect(EndpointEntityType.GCP_MAPPED_COLLECTION).to.equal("GCP_mapped_collection");
        expect(EndpointEntityType.GCP_GUEST_COLLECTION).to.equal("GCP_guest_collection");
        expect(EndpointEntityType.GCSV5_ENDPOINT).to.equal("GCSv5_endpoint");
        expect(EndpointEntityType.GCSV5_MAPPED_COLLECTION).to.equal("GCSv5_mapped_collection");
        expect(EndpointEntityType.GCSV5_GUEST_COLLECTION).to.equal("GCSv5_guest_collection");
        expect(EndpointEntityType.GCSV4_HOST).to.equal("GCSv4_host");
        expect(EndpointEntityType.GCSV4_SHARE).to.equal("GCSv4_share");
    });

    describe("isValid", () => {
        it("should return true for valid entity type strings", () => {
            expect(EndpointEntityType.isValid(EndpointEntityType.GCP_MAPPED_COLLECTION)).to.be.true;
            expect(EndpointEntityType.isValid(EndpointEntityType.GCSV5_ENDPOINT)).to.be.true;
            expect(EndpointEntityType.isValid("GCSv4_host")).to.be.true;
        });

        it("should return false for invalid or non-string types", () => {
            expect(EndpointEntityType.isValid("invalid_type_string")).to.be.false;
            expect(EndpointEntityType.isValid(null)).to.be.false;
            expect(EndpointEntityType.isValid(undefined)).to.be.false;
            expect(EndpointEntityType.isValid(123)).to.be.false;
            expect(EndpointEntityType.isValid({})).to.be.false;
        });
    });
    describe("isMappedCollection", () => {
        it("should return true for mapped collection types", () => {
            expect(EndpointEntityType.isMappedCollection(EndpointEntityType.GCP_MAPPED_COLLECTION))
                .to.be.true;
            expect(
                EndpointEntityType.isMappedCollection(EndpointEntityType.GCSV5_MAPPED_COLLECTION),
            ).to.be.true;
        });

        it("should throw TypeError for invalid types", () => {
            expect(() => EndpointEntityType.isMappedCollection("some_other_type")).to.throw(
                TypeError,
            );
            expect(() => EndpointEntityType.isMappedCollection(null)).to.throw(TypeError);
            expect(() => EndpointEntityType.isMappedCollection(undefined)).to.throw(TypeError);
        });
    });
    describe("isGuestCollection", () => {
        it("should return true for guest collection types", () => {
            expect(EndpointEntityType.isGuestCollection(EndpointEntityType.GCP_GUEST_COLLECTION)).to
                .be.true;
            expect(EndpointEntityType.isGuestCollection(EndpointEntityType.GCSV5_GUEST_COLLECTION))
                .to.be.true;
        });

        it("should throw TypeError for invalid types", () => {
            expect(() => EndpointEntityType.isGuestCollection("some_other_type")).to.throw(
                TypeError,
            );
            expect(() => EndpointEntityType.isGuestCollection(null)).to.throw(TypeError);
            expect(() => EndpointEntityType.isGuestCollection(undefined)).to.throw(TypeError);
        });
    });
    describe("requiresConsent", () => {
        it("should return true only for GCSv5 mapped collection type", () => {
            expect(EndpointEntityType.requiresConsent(EndpointEntityType.GCSV5_MAPPED_COLLECTION))
                .to.be.true;
        });

        it("should throw TypeError for invalid types", () => {
            expect(() => EndpointEntityType.requiresConsent("some_other_type")).to.throw(TypeError);
            expect(() => EndpointEntityType.requiresConsent(null)).to.throw(TypeError);
            expect(() => EndpointEntityType.requiresConsent(undefined)).to.throw(TypeError);
        });
    });
});

describe("EndpointModel", () => {
    afterEach(() => {
        sinon.restore();
    });

    describe("Constructor and Basic Getters", () => {
        it("should throw TypeError if endpointData is not an object", () => {
            expect(() => new EndpointModel(null)).to.throw(
                TypeError,
                "Endpoint data must be an object.",
            );
            expect(() => new EndpointModel("string")).to.throw(
                TypeError,
                "Endpoint data must be an object.",
            );
            expect(() => new EndpointModel(123)).to.throw(
                TypeError,
                "Endpoint data must be an object.",
            );
        });

        it("should throw TypeError if id is missing", () => {
            const endpointData = { entity_type: EndpointEntityType.GCP_MAPPED_COLLECTION };
            expect(() => new EndpointModel(endpointData)).to.throw(
                TypeError,
                "Endpoint data must include an 'id'.",
            );
            expect(() => new EndpointModel({})).to.throw(
                TypeError,
                "Endpoint data must include an 'id'.",
            );
        });

        it("should throw TypeError if entity_type is missing", () => {
            const endpointData = { id: "ep123" };
            expect(() => new EndpointModel(endpointData)).to.throw(
                TypeError,
                /must include a valid 'entity_type'/,
            );
        });

        it("should throw TypeError if entity_type is invalid", () => {
            const endpointData = { id: "ep123", entity_type: "invalid_type" };
            expect(() => new EndpointModel(endpointData)).to.throw(
                TypeError,
                /must include a valid 'entity_type'/,
            );
        });

        it("should NOT throw if only optional fields are missing", () => {
            const minimalData = {
                id: "ep123",
                entity_type: EndpointEntityType.GCP_MAPPED_COLLECTION,
            };
            expect(() => new EndpointModel(minimalData)).to.not.throw();
        });

        it("should initialize correctly with typical endpoint data", () => {
            const endpointData = {
                id: "ep123",
                display_name: "My Test Endpoint",
                entity_type: EndpointEntityType.GCSV5_MAPPED_COLLECTION,
                collections: [{ id: "coll1" }, { id: "coll2" }],
                owner_string: "testuser#globusid",
                is_connected: true,
                in_use: false,
                other_prop: "value",
            };
            const model = new EndpointModel(endpointData);

            expect(model.id).to.equal("ep123");
            expect(model.displayName).to.equal("My Test Endpoint");
            expect(model.entityType).to.equal(EndpointEntityType.GCSV5_MAPPED_COLLECTION);
            expect(model.collections).to.deep.equal([{ id: "coll1" }, { id: "coll2" }]);
            expect(model.ownerString).to.equal("testuser#globusid");
            expect(model.isConnected).to.be.true;
            expect(model.isBusy).to.be.false;
            expect(model.rawData).to.deep.equal(endpointData);
        });

        it("should handle display name fallback logic", () => {
            const dataWithName = {
                id: "ep1",
                entity_type: EndpointEntityType.GCP_MAPPED_COLLECTION,
                display_name: "Display Name",
            };
            const dataWithCanonical = {
                id: "ep1",
                entity_type: EndpointEntityType.GCP_MAPPED_COLLECTION,
                canonical_name: "Canonical Name",
            };
            const dataWithBoth = {
                id: "ep1",
                entity_type: EndpointEntityType.GCP_MAPPED_COLLECTION,
                display_name: "Display Name",
                canonical_name: "Canonical Name",
            };
            const dataWithNeither = {
                id: "ep1",
                entity_type: EndpointEntityType.GCP_MAPPED_COLLECTION,
            };

            expect(new EndpointModel(dataWithName).displayName).to.equal("Display Name");
            expect(new EndpointModel(dataWithCanonical).displayName).to.equal("Canonical Name");
            expect(new EndpointModel(dataWithBoth).displayName).to.equal("Display Name");
            expect(new EndpointModel(dataWithNeither).displayName).to.equal("Unknown Endpoint");
        });

        it("should handle owner string fallback logic", () => {
            const base = { id: "ep1", entity_type: EndpointEntityType.GCP_MAPPED_COLLECTION };
            const dataWithOwnerString = { ...base, owner_string: "owner@domain.org" };
            const dataWithOwnerId = { ...base, owner_id: "owner123" };
            const dataWithOwnerIdAndUser = { ...base, owner_id: "owner123", username: "testuser" };
            const dataWithAll = {
                ...base,
                owner_string: "owner@domain.org",
                owner_id: "owner123",
                username: "testuser",
            };
            const dataWithNeither = {};

            expect(new EndpointModel(dataWithOwnerString).ownerString).to.equal("owner@domain.org");
            expect(new EndpointModel(dataWithOwnerId).ownerString).to.equal("User#owner123");
            expect(new EndpointModel(dataWithOwnerIdAndUser).ownerString).to.equal(
                "testuser#owner123",
            );
            expect(new EndpointModel(dataWithAll).ownerString).to.equal("owner@domain.org");
        });
        // expect(new EndpointModel(dataWithNeither).ownerString).to.equal("Unknown owner");

        it("should correctly map is_connected and in_use to isConnected and isBusy", () => {
            const base = { id: "ep1", entity_type: EndpointEntityType.GCP_MAPPED_COLLECTION };
            const dataConnectedNotBusy = { ...base, is_connected: true, in_use: false };
            const dataDisconnectedNotBusy = { ...base, is_connected: false, in_use: false };
            const dataConnectedBusy = { ...base, is_connected: true, in_use: true };
            const dataDisconnectedBusy = { ...base, is_connected: false, in_use: true };
            const dataMissing = { ...base };

            let model = new EndpointModel(dataConnectedNotBusy);
            expect(model.isConnected).to.be.true;
            expect(model.isBusy).to.be.false;

            model = new EndpointModel(dataDisconnectedNotBusy);
            expect(model.isConnected).to.be.false;
            expect(model.isBusy).to.be.false;

            model = new EndpointModel(dataConnectedBusy);
            expect(model.isConnected).to.be.true;
            expect(model.isBusy).to.be.true;

            model = new EndpointModel(dataDisconnectedBusy);
            expect(model.isConnected).to.be.false;
            expect(model.isBusy).to.be.true;

            model = new EndpointModel(dataMissing);
            expect(model.isConnected).to.be.false;
            expect(model.isBusy).to.be.false;
        });
    });

    describe("Derived Getters (requiresConsent, isMappedCollection, isGuestCollection)", () => {
        it("should correctly determine requiresConsent based on entityType", () => {
            const dataRequiresConsent = {
                id: "ep1",
                entity_type: EndpointEntityType.GCSV5_MAPPED_COLLECTION,
            };
            const dataDoesNotRequireConsent = {
                id: "ep2",
                entity_type: EndpointEntityType.GCP_MAPPED_COLLECTION,
            };

            expect(new EndpointModel(dataRequiresConsent).requiresConsent).to.be.true;
            expect(new EndpointModel(dataDoesNotRequireConsent).requiresConsent).to.be.false;
        });

        it("should correctly determine isMappedCollection based on entityType", () => {
            const dataIsMapped1 = {
                id: "ep1",
                entity_type: EndpointEntityType.GCP_MAPPED_COLLECTION,
            };
            const dataIsMapped2 = {
                id: "ep2",
                entity_type: EndpointEntityType.GCSV5_MAPPED_COLLECTION,
            };
            const dataIsNotMapped = {
                id: "ep3",
                entity_type: EndpointEntityType.GCP_GUEST_COLLECTION,
            };

            expect(new EndpointModel(dataIsMapped1).isMappedCollection).to.be.true;
            expect(new EndpointModel(dataIsMapped2).isMappedCollection).to.be.true;
            expect(new EndpointModel(dataIsNotMapped).isMappedCollection).to.be.false;
        });

        it("should correctly determine isGuestCollection based on entityType", () => {
            const dataIsGuest1 = {
                id: "ep1",
                entity_type: EndpointEntityType.GCP_GUEST_COLLECTION,
            };
            const dataIsGuest2 = {
                id: "ep2",
                entity_type: EndpointEntityType.GCSV5_GUEST_COLLECTION,
            };
            const dataIsNotGuest = {
                id: "ep3",
                entity_type: EndpointEntityType.GCP_MAPPED_COLLECTION,
            };

            expect(new EndpointModel(dataIsGuest1).isGuestCollection).to.be.true;
            expect(new EndpointModel(dataIsGuest2).isGuestCollection).to.be.true;
            expect(new EndpointModel(dataIsNotGuest).isGuestCollection).to.be.false;
        });
    });

    describe("rawData", () => {
        it("should return a shallow copy of the original endpoint data", () => {
            const originalData = {
                id: "ep1",
                name: "test",
                entity_type: EndpointEntityType.GCSV5_MAPPED_COLLECTION,
                nested: { key: "value" },
            };
            const model = new EndpointModel(originalData);
            const { rawData } = model;

            expect(rawData).to.deep.equal(originalData);
            expect(rawData).to.not.equal(originalData);
            expect(rawData.nested).to.equal(originalData.nested);
        });
    });

    describe("collections Getter", () => {
        it("should return a shallow copy of the internal collections array", () => {
            const originalCollections = [{ id: "coll1" }, { id: "coll2" }];
            const endpointData = {
                id: "ep1",
                entity_type: EndpointEntityType.GCP_MAPPED_COLLECTION,
                collections: originalCollections,
            };
            const model = new EndpointModel(endpointData);
            const collectionsCopy = model.collections;

            expect(collectionsCopy).to.deep.equal(originalCollections);
            expect(collectionsCopy).to.not.equal(originalCollections);
            if (collectionsCopy.length > 0) {
                expect(collectionsCopy[0]).to.equal(originalCollections[0]);
            }
        });

        it("should return an empty array if original data had no collections", () => {
            const endpointData = {
                id: "ep1",
                entity_type: EndpointEntityType.GCP_MAPPED_COLLECTION,
            };
            const model = new EndpointModel(endpointData);
            const collectionsCopy = model.collections;

            expect(collectionsCopy).to.deep.equal([]);
        });
    });

    describe("canTransfer", () => {
        it("should return true if connected and not busy", () => {
            const model = new EndpointModel({
                id: "ep1",
                entity_type: EndpointEntityType.GCP_MAPPED_COLLECTION,
                is_connected: true,
                in_use: false,
            });
            expect(model.canTransfer()).to.be.true;
        });

        it("should return false if not connected", () => {
            const model = new EndpointModel({
                id: "ep1",
                entity_type: EndpointEntityType.GCP_MAPPED_COLLECTION,
                is_connected: false,
                in_use: false,
            });
            expect(model.canTransfer()).to.be.false;
        });

        it("should return false if busy", () => {
            const model = new EndpointModel({
                id: "ep1",
                entity_type: EndpointEntityType.GCP_MAPPED_COLLECTION,
                is_connected: true,
                in_use: true,
            });
            expect(model.canTransfer()).to.be.false;
        });

        it("should return false if not connected and busy", () => {
            const model = new EndpointModel({
                id: "ep1",
                entity_type: EndpointEntityType.GCP_MAPPED_COLLECTION,
                is_connected: false,
                in_use: true,
            });
            expect(model.canTransfer()).to.be.false;
        });

        it("should return false if connection/busy status is unknown (default)", () => {
            const model = new EndpointModel({
                id: "ep1",
                entity_type: EndpointEntityType.GCP_MAPPED_COLLECTION,
            });
            expect(model.canTransfer()).to.be.false;
        });
    });

    describe("getSearchAttributes", () => {
        it("should return the correct attributes object based on model state", () => {
            const endpointData = {
                id: "ep999",
                display_name: "Searchable Endpoint",
                entity_type: EndpointEntityType.GCSV4_HOST,
                owner_id: "owner999",
                username: "searchuser",
                is_connected: true,
                in_use: false,
            };
            const model = new EndpointModel(endpointData);
            const attributes = model.getSearchAttributes();

            expect(attributes).to.deep.equal({
                id: "ep999",
                displayName: "Searchable Endpoint",
                owner: "searchuser#owner999",
                status: "Connected",
                entityType: EndpointEntityType.GCSV4_HOST,
            });
        });

        it("should reflect disconnected status correctly", () => {
            const endpointData = {
                id: "ep000",
                display_name: "Offline Endpoint",
                entity_type: EndpointEntityType.GCSV5_ENDPOINT,
                owner_string: "offline@owner.com",
                is_connected: false,
                in_use: false,
            };
            const model = new EndpointModel(endpointData);
            const attributes = model.getSearchAttributes();

            expect(attributes).to.deep.equal({
                id: "ep000",
                displayName: "Offline Endpoint",
                owner: "offline@owner.com",
                status: "Disconnected",
                entityType: EndpointEntityType.GCSV5_ENDPOINT,
            });
        });
    });
});
