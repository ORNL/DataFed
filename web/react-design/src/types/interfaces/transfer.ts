/**
 * Endpoint entity type enum
 */
enum EndpointEntityType {
  GCP_MAPPED_COLLECTION = "GCP_mapped_collection",
  GCP_GUEST_COLLECTION = "GCP_guest_collection",
  GCSV5_ENDPOINT = "GCSv5_endpoint",
  GCSV5_MAPPED_COLLECTION = "GCSv5_mapped_collection",
  GCSV5_GUEST_COLLECTION = "GCSv5_guest_collection",
  GCSV4_HOST = "GCSv4_host",
  GCSV4_SHARE = "GCSv4_share",
}

/**
 * Endpoint interface for Globus integration
 */
interface Endpoint {
  id: string;
  displayName: string;
  entityType: EndpointEntityType | string;
  isConnected: boolean;
  isBusy: boolean;
  ownerString: string;
  collections?: any[];
  requiresConsent?: boolean;
  isMappedCollection?: boolean;
  isGuestCollection?: boolean;
}

/**
 * Transfer interface for Globus integration
 */
interface Transfer {
  id: string;
  sourceEndpoint: Endpoint;
  destinationEndpoint: Endpoint;
  sourcePath: string;
  destinationPath: string;
  status: string;
  progress: number;
  message?: string;
  createdTime: number;
  updatedTime: number;
  userId?: string;
  recordId?: string;
  encryptionEnabled?: boolean;
  label?: string;
}

/**
 * Transfer configuration interface
 */
interface TransferConfig {
  path?: string;
  encrypt?: number;
  extension?: string;
  origFilename?: boolean;
}

/**
 * Transfer statistics interface
 */
interface TransferStats {
  totalSize: number;
  skippedCount: number;
}

/**
 * Encryption mode enum
 */
enum EncryptionMode {
  NONE = 0,
  AVAILABLE = 1,
  FORCE = 2,
}

/**
 * Transfer mode enum
 */
enum TransferMode {
  DATA_GET = 0,
  DATA_PUT = 1,
  // @ts-expect-error - Migration
  NULL = null,
}

export {
  EndpointEntityType,
  Endpoint,
  Transfer,
  TransferConfig,
  TransferStats,
  EncryptionMode,
  TransferMode,
};
