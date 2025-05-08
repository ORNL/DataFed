/**
 * Enum for Globus endpoint entity types
 * Derived from https://docs.globus.org/api/transfer/endpoints_and_collections/#entity_types
 * @readonly
 * @enum {string}
 */
const EndpointEntityType = Object.freeze({
    GCP_MAPPED_COLLECTION: "GCP_mapped_collection",
    GCP_GUEST_COLLECTION: "GCP_guest_collection",
    GCSV5_ENDPOINT: "GCSv5_endpoint",
    GCSV5_MAPPED_COLLECTION: "GCSv5_mapped_collection",
    GCSV5_GUEST_COLLECTION: "GCSv5_guest_collection",
    GCSV4_HOST: "GCSv4_host",
    GCSV4_SHARE: "GCSv4_share",

    /**
     * Check if a string is a valid defined entity type.
     * @param {string} type - Entity type string to check.
     * @returns {boolean} True if the type is a valid enum value.
     */
    isValid(type) {
        return typeof type === "string" && Object.values(this).includes(type);
    },

    /**
     * Check if entity type is a mapped collection
     * @param {string} type - Entity type to check
     * @returns {boolean} True if the entity type is a mapped collection
     */
    isMappedCollection(type) {
        if (!this.isValid(type)) throw new TypeError(`Invalid entity type provided: ${type}`);
        return type === this.GCP_MAPPED_COLLECTION || type === this.GCSV5_MAPPED_COLLECTION;
    },

    /**
     * Check if entity type is a guest collection
     * @param {string} type - Entity type to check
     * @returns {boolean} True if the entity type is a guest collection
     */
    isGuestCollection(type) {
        if (!this.isValid(type)) throw new TypeError(`Invalid entity type provided: ${type}`);
        return type === this.GCP_GUEST_COLLECTION || type === this.GCSV5_GUEST_COLLECTION;
    },

    /**
     * Check if entity requires consent
     * According to docs, only GCSv5 mapped collections require consent
     * @param {string} type - Entity type to check
     * @returns {boolean} True if the entity type requires consent
     */
    requiresConsent(type) {
        if (!this.isValid(type)) throw new TypeError(`Invalid entity type provided: ${type}`);
        return type === this.GCSV5_MAPPED_COLLECTION;
    },
});

/**
 * https://docs.globus.org/api/transfer/endpoints_and_collections/
 * Derived from https://docs.globus.org/api/transfer/endpoints_and_collections/
 */
class EndpointModel {
    #endpoint;
    #displayName;
    #entityType;
    #collections;
    #ownerString;
    #isConnected;
    #isBusy;

    /**
     * @param {object} endpointData - Endpoint data from Globus API
     */
    constructor(endpointData = {}) {
        if (!endpointData || typeof endpointData !== "object") {
            throw new TypeError("Endpoint data must be an object.");
        }
        if (!endpointData.id) {
            throw new TypeError("Endpoint data must include an 'id'.");
        }
        if (!EndpointEntityType.isValid(endpointData.entity_type)) {
            throw new TypeError(
                `Endpoint data must include a valid 'entity_type'. Received: ${endpointData.entity_type}`,
            );
        }

        this.#endpoint = endpointData;
        this.#displayName =
            endpointData.display_name || endpointData.canonical_name || "Unknown Endpoint";
        this.#entityType = endpointData.entity_type;
        this.#collections = endpointData.collections || [];
        this.#ownerString = this.#formatOwnerString(endpointData);
        this.#isConnected = endpointData.is_connected === true;
        this.#isBusy = endpointData.in_use === true;
    }

    /**
     * Format owner information as a display string
     * @param {object} endpointData - Endpoint data
     * @returns {string} Formatted owner string
     */
    #formatOwnerString(endpointData) {
        if (endpointData.owner_string) {
            return endpointData.owner_string;
        } else if (endpointData.owner_id) {
            return `${endpointData.username || "User"}#${endpointData.owner_id}`;
        }
    }

    get id() {
        return this.#endpoint.id;
    }
    get displayName() {
        return this.#displayName;
    }
    get entityType() {
        return this.#entityType;
    }
    get requiresConsent() {
        return EndpointEntityType.requiresConsent(this.#entityType);
    }
    get isMappedCollection() {
        return EndpointEntityType.isMappedCollection(this.#entityType);
    }
    get isGuestCollection() {
        return EndpointEntityType.isGuestCollection(this.#entityType);
    }
    get isConnected() {
        return this.#isConnected;
    }
    get isBusy() {
        return this.#isBusy;
    }
    get rawData() {
        return { ...this.#endpoint };
    }
    get ownerString() {
        return this.#ownerString;
    }
    get collections() {
        return [...this.#collections];
    }

    canTransfer() {
        return this.#isConnected && !this.#isBusy;
    }

    getSearchAttributes() {
        return {
            id: this.id,
            displayName: this.#displayName,
            owner: this.#ownerString,
            status: this.#isConnected ? "Connected" : "Disconnected",
            entityType: this.#entityType,
        };
    }
}

export { EndpointEntityType, EndpointModel };
