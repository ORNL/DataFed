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

    describe("isMappedCollection", () => {
        it("should return true for mapped collection types", () => {
            expect(EndpointEntityType.isMappedCollection(EndpointEntityType.GCP_MAPPED_COLLECTION))
                .to.be.true;
            expect(
                EndpointEntityType.isMappedCollection(EndpointEntityType.GCSV5_MAPPED_COLLECTION),
            ).to.be.true;
        });

        it("should return false for non-mapped collection types", () => {
            expect(EndpointEntityType.isMappedCollection(EndpointEntityType.GCP_GUEST_COLLECTION))
                .to.be.false;
            expect(EndpointEntityType.isMappedCollection(EndpointEntityType.GCSV5_ENDPOINT)).to.be
                .false;
            expect(EndpointEntityType.isMappedCollection(EndpointEntityType.GCSV5_GUEST_COLLECTION))
                .to.be.false;
            expect(EndpointEntityType.isMappedCollection(EndpointEntityType.GCSV4_HOST)).to.be
                .false;
            expect(EndpointEntityType.isMappedCollection(EndpointEntityType.GCSV4_SHARE)).to.be
                .false;
            expect(EndpointEntityType.isMappedCollection("some_other_type")).to.be.false;
            expect(EndpointEntityType.isMappedCollection(null)).to.be.false;
            expect(EndpointEntityType.isMappedCollection(undefined)).to.be.false;
        });
    });

    describe("isGuestCollection", () => {
        it("should return true for guest collection types", () => {
            expect(EndpointEntityType.isGuestCollection(EndpointEntityType.GCP_GUEST_COLLECTION)).to
                .be.true;
            expect(EndpointEntityType.isGuestCollection(EndpointEntityType.GCSV5_GUEST_COLLECTION))
                .to.be.true;
        });

        it("should return false for non-guest collection types", () => {
            expect(EndpointEntityType.isGuestCollection(EndpointEntityType.GCP_MAPPED_COLLECTION))
                .to.be.false;
            expect(EndpointEntityType.isGuestCollection(EndpointEntityType.GCSV5_ENDPOINT)).to.be
                .false;
            expect(EndpointEntityType.isGuestCollection(EndpointEntityType.GCSV5_MAPPED_COLLECTION))
                .to.be.false;
            expect(EndpointEntityType.isGuestCollection(EndpointEntityType.GCSV4_HOST)).to.be.false;
            expect(EndpointEntityType.isGuestCollection(EndpointEntityType.GCSV4_SHARE)).to.be
                .false;
            expect(EndpointEntityType.isGuestCollection("some_other_type")).to.be.false;
            expect(EndpointEntityType.isGuestCollection(null)).to.be.false;
            expect(EndpointEntityType.isGuestCollection(undefined)).to.be.false;
        });
    });

    describe("requiresConsent", () => {
        it("should return true only for GCSv5 mapped collection type", () => {
            expect(EndpointEntityType.requiresConsent(EndpointEntityType.GCSV5_MAPPED_COLLECTION))
                .to.be.true;
        });

        it("should return false for other types", () => {
            expect(EndpointEntityType.requiresConsent(EndpointEntityType.GCP_MAPPED_COLLECTION)).to
                .be.false;
            expect(EndpointEntityType.requiresConsent(EndpointEntityType.GCP_GUEST_COLLECTION)).to
                .be.false;
            expect(EndpointEntityType.requiresConsent(EndpointEntityType.GCSV5_ENDPOINT)).to.be
                .false;
            expect(EndpointEntityType.requiresConsent(EndpointEntityType.GCSV5_GUEST_COLLECTION)).to
                .be.false;
            expect(EndpointEntityType.requiresConsent(EndpointEntityType.GCSV4_HOST)).to.be.false;
            expect(EndpointEntityType.requiresConsent(EndpointEntityType.GCSV4_SHARE)).to.be.false;
            expect(EndpointEntityType.requiresConsent("some_other_type")).to.be.false;
            expect(EndpointEntityType.requiresConsent(null)).to.be.false;
            expect(EndpointEntityType.requiresConsent(undefined)).to.be.false;
        });
    });
});

describe("EndpointModel", () => {
    afterEach(() => {
        sinon.restore();
    });

    describe("Constructor and Basic Getters", () => {
        it("should initialize with default values when no data is provided", () => {
            const endpointData = {};
            const model = new EndpointModel(endpointData);

            expect(model.id).to.equal("");
            expect(model.displayName).to.equal("Unknown Endpoint");
            expect(model.entityType).to.be.null;
            expect(model.collections).to.deep.equal([]);
            expect(model.ownerString).to.equal("Unknown owner");
            expect(model.isConnected).to.be.false;
            expect(model.isBusy).to.be.false;
            expect(model.rawData).to.deep.equal({});
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
            const dataWithName = { display_name: "Display Name" };
            const dataWithCanonical = { canonical_name: "Canonical Name" };
            const dataWithBoth = { display_name: "Display Name", canonical_name: "Canonical Name" };
            const dataWithNeither = {};

            expect(new EndpointModel(dataWithName).displayName).to.equal("Display Name");
            expect(new EndpointModel(dataWithCanonical).displayName).to.equal("Canonical Name");
            expect(new EndpointModel(dataWithBoth).displayName).to.equal("Display Name");
            expect(new EndpointModel(dataWithNeither).displayName).to.equal("Unknown Endpoint");
        });

        it("should handle owner string fallback logic", () => {
            const dataWithOwnerString = { owner_string: "owner@domain.org" };
            const dataWithOwnerId = { owner_id: "owner123" };
            const dataWithOwnerIdAndUser = { owner_id: "owner123", username: "testuser" };
            const dataWithAll = {
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
            expect(new EndpointModel(dataWithNeither).ownerString).to.equal("Unknown owner");
        });

        it("should correctly map is_connected and in_use to isConnected and isBusy", () => {
            const dataConnectedNotBusy = { is_connected: true, in_use: false };
            const dataDisconnectedNotBusy = { is_connected: false, in_use: false };
            const dataConnectedBusy = { is_connected: true, in_use: true };
            const dataDisconnectedBusy = { is_connected: false, in_use: true };
            const dataMissing = {};

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
            const dataRequiresConsent = { entity_type: EndpointEntityType.GCSV5_MAPPED_COLLECTION };
            const dataDoesNotRequireConsent = {
                entity_type: EndpointEntityType.GCP_MAPPED_COLLECTION,
            };
            const dataNoType = {};

            expect(new EndpointModel(dataRequiresConsent).requiresConsent).to.be.true;
            expect(new EndpointModel(dataDoesNotRequireConsent).requiresConsent).to.be.false;
            expect(new EndpointModel(dataNoType).requiresConsent).to.be.false;
        });

        it("should correctly determine isMappedCollection based on entityType", () => {
            const dataIsMapped1 = { entity_type: EndpointEntityType.GCP_MAPPED_COLLECTION };
            const dataIsMapped2 = { entity_type: EndpointEntityType.GCSV5_MAPPED_COLLECTION };
            const dataIsNotMapped = { entity_type: EndpointEntityType.GCP_GUEST_COLLECTION };
            const dataNoType = {};

            expect(new EndpointModel(dataIsMapped1).isMappedCollection).to.be.true;
            expect(new EndpointModel(dataIsMapped2).isMappedCollection).to.be.true;
            expect(new EndpointModel(dataIsNotMapped).isMappedCollection).to.be.false;
            expect(new EndpointModel(dataNoType).isMappedCollection).to.be.false;
        });

        it("should correctly determine isGuestCollection based on entityType", () => {
            const dataIsGuest1 = { entity_type: EndpointEntityType.GCP_GUEST_COLLECTION };
            const dataIsGuest2 = { entity_type: EndpointEntityType.GCSV5_GUEST_COLLECTION };
            const dataIsNotGuest = { entity_type: EndpointEntityType.GCP_MAPPED_COLLECTION };
            const dataNoType = {};

            expect(new EndpointModel(dataIsGuest1).isGuestCollection).to.be.true;
            expect(new EndpointModel(dataIsGuest2).isGuestCollection).to.be.true;
            expect(new EndpointModel(dataIsNotGuest).isGuestCollection).to.be.false;
            expect(new EndpointModel(dataNoType).isGuestCollection).to.be.false;
        });
    });

    describe("rawData", () => {
        it("should return a shallow copy of the original endpoint data", () => {
            const originalData = { id: "ep1", name: "test", nested: { key: "value" } };
            const model = new EndpointModel(originalData);
            const rawData = model.rawData;

            expect(rawData).to.deep.equal(originalData);
            expect(rawData).to.not.equal(originalData);
            expect(rawData.nested).to.equal(originalData.nested);
        });
    });

    describe("collections Getter", () => {
        it("should return a shallow copy of the internal collections array", () => {
            const originalCollections = [{ id: "coll1" }, { id: "coll2" }];
            const endpointData = { collections: originalCollections };
            const model = new EndpointModel(endpointData);
            const collectionsCopy = model.collections;

            expect(collectionsCopy).to.deep.equal(originalCollections);
            expect(collectionsCopy).to.not.equal(originalCollections);
            if (collectionsCopy.length > 0) {
                expect(collectionsCopy[0]).to.equal(originalCollections[0]);
            }
        });

        it("should return an empty array if original data had no collections", () => {
            const endpointData = {};
            const model = new EndpointModel(endpointData);
            const collectionsCopy = model.collections;

            expect(collectionsCopy).to.deep.equal([]);
        });
    });

    describe("canTransfer", () => {
        it("should return true if connected and not busy", () => {
            const model = new EndpointModel({ is_connected: true, in_use: false });
            expect(model.canTransfer()).to.be.true;
        });

        it("should return false if not connected", () => {
            const model = new EndpointModel({ is_connected: false, in_use: false });
            expect(model.canTransfer()).to.be.false;
        });

        it("should return false if busy", () => {
            const model = new EndpointModel({ is_connected: true, in_use: true });
            expect(model.canTransfer()).to.be.false;
        });

        it("should return false if not connected and busy", () => {
            const model = new EndpointModel({ is_connected: false, in_use: true });
            expect(model.canTransfer()).to.be.false;
        });

        it("should return false if connection/busy status is unknown (default)", () => {
            const model = new EndpointModel({});
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

        it("should handle default/missing values gracefully", () => {
            const model = new EndpointModel({});
            const attributes = model.getSearchAttributes();

            expect(attributes).to.deep.equal({
                id: "",
                displayName: "Unknown Endpoint",
                owner: "Unknown owner",
                status: "Disconnected",
                entityType: null,
            });
        });
    });
});
