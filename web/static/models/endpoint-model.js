/**
 * Enum for Globus endpoint entity types
 * @readonly
 * @enum {string}
 */
const EndpointEntityType = Object.freeze({
  GCP_MAPPED_COLLECTION: 'GCP_mapped_collection',
  GCP_GUEST_COLLECTION: 'GCP_guest_collection',
  GCSV5_ENDPOINT: 'GCSv5_endpoint',
  GCSV5_MAPPED_COLLECTION: 'GCSv5_mapped_collection',
  GCSV5_GUEST_COLLECTION: 'GCSv5_guest_collection',
  GCSV4_HOST: 'GCSv4_host',
  GCSV4_SHARE: 'GCSv4_share',

  /**
   * Check if entity type is a mapped collection
   * @param {string} type - Entity type to check
   * @returns {boolean} True if the entity type is a mapped collection
   */
  isMappedCollection(type) {
    return type === this.GCP_MAPPED_COLLECTION ||
      type === this.GCSV5_MAPPED_COLLECTION;
  },

  /**
   * Check if entity type is a guest collection
   * @param {string} type - Entity type to check
   * @returns {boolean} True if the entity type is a guest collection
   */
  isGuestCollection(type) {
    return type === this.GCP_GUEST_COLLECTION ||
      type === this.GCSV5_GUEST_COLLECTION;
  },

  /**
   * Check if entity requires consent
   * According to docs, only GCSv5 mapped collections require consent
   * @param {string} type - Entity type to check
   * @returns {boolean} True if the entity type requires consent
   */
  requiresConsent(type) {
    return type === this.GCSV5_MAPPED_COLLECTION;
  }
});

/**
 * Model class for Globus endpoint data and operations
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
    this.#endpoint = endpointData;
    this.#displayName = endpointData.display_name || endpointData.canonical_name || "Unknown Endpoint";
    this.#entityType = endpointData.entity_type || null;
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
    if (endpointData.owner_string) return endpointData.owner_string;

    return endpointData.owner_id ?
      `${endpointData.username || 'User'}#${endpointData.owner_id}` :
      'Unknown owner';
  }

  get id() { return this.#endpoint.id || ''; }
  get displayName() { return this.#displayName; }
  get entityType() { return this.#entityType; }
  get requiresConsent() { return EndpointEntityType.requiresConsent(this.#entityType); }
  get isMappedCollection() { return EndpointEntityType.isMappedCollection(this.#entityType); }
  get isGuestCollection() { return EndpointEntityType.isGuestCollection(this.#entityType); }
  get isConnected() { return this.#isConnected; }
  get isBusy() { return this.#isBusy; }
  get rawData() { return { ...this.#endpoint }; }
  get ownerString() { return this.#ownerString; }
  get collections() { return [...this.#collections]; }

  canTransfer() { return this.#isConnected && !this.#isBusy; }

  getSearchAttributes() {
    return {
      id: this.id,
      displayName: this.#displayName,
      owner: this.#ownerString,
      status: this.#isConnected ? 'Connected' : 'Disconnected',
      entityType: this.#entityType
    };
  }
}

export {
  EndpointEntityType,
  EndpointModel
}