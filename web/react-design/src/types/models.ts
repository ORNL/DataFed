/**
 * TypeScript interfaces for DataFed data models
 * These interfaces are based on the current JavaScript models and will be used
 * for type checking in the React+TypeScript migration.
 */

// Permission constants
export const PERM_RD_REC = 0x0001; // Read record info (description, keywords, details)
export const PERM_RD_META = 0x0002; // Read structured metadata
export const PERM_RD_DATA = 0x0004; // Read raw data
export const PERM_WR_REC = 0x0008; // Write record info (description, keywords, details)
export const PERM_WR_META = 0x0010; // Write structured metadata
export const PERM_WR_DATA = 0x0020; // Write raw data
export const PERM_LIST = 0x0040; // List contents of collection
export const PERM_LINK = 0x0080; // Link/unlink child records (collections only)
export const PERM_CREATE = 0x0100; // Create new child records (collections only)
export const PERM_DELETE = 0x0200; // Delete record
export const PERM_SHARE = 0x0400; // View/set ACLs
export const PERM_LOCK = 0x0800; // Lock record
export const PERM_MAX = 0x0800; // Lock record

export const PERM_BAS_READ =
  PERM_RD_REC | PERM_RD_META | PERM_RD_DATA | PERM_LIST;
export const PERM_BAS_WRITE =
  PERM_WR_REC | PERM_WR_META | PERM_WR_DATA | PERM_LINK | PERM_CREATE;
export const PERM_BAS_ADMIN = PERM_DELETE | PERM_SHARE | PERM_LOCK;
export const PERM_ALL = 0x0fff;

// Search mode constants
export enum SearchMode {
  DATA = 0,
  COLLECTION = 1,
}

// Sort constants
export enum SortType {
  ID = 0,
  TITLE = 1,
  OWNER = 2,
  TIME_CREATE = 3,
  TIME_UPDATE = 4,
  RELEVANCE = 5,
}

// Task type constants
export enum TaskType {
  DATA_GET = 0,
  DATA_PUT = 1,
  DATA_DEL = 2,
  REC_CHG_ALLOC = 3,
}

/**
 * Base interface for all record types
 */
export interface BaseRecord {
  id: string;
  title: string;
  description?: string;
  owner: string;
  ownerName?: string;
  createdTime: number;
  updatedTime: number;
  keywords?: string[];
  permissions?: number;
}

/**
 * Data record interface
 */
export interface DataRecord extends BaseRecord {
  size?: number;
  dataType?: string;
  metadata?: Record<string, unknown>;
  allocId?: string;
  hasData?: boolean;
}

/**
 * Collection record interface
 */
export interface CollectionRecord extends BaseRecord {
  childCount?: number;
  children?: BaseRecord[];
}

/**
 * Project record interface
 */
export interface ProjectRecord extends BaseRecord {
  members?: string[];
  memberNames?: string[];
  isPublic?: boolean;
}

/**
 * User interface
 */
export interface User {
  uid: string;
  nameFirst: string;
  nameLast: string;
  email: string;
  org: string;
  isAdmin: boolean;
  defaultProject?: string;
}

/**
 * Access Control List interface
 */
export interface ACL {
  uid: string;
  name?: string;
  permissions: number;
}

/**
 * Search query interface
 */
export interface SearchQuery {
  id?: string;
  title?: string;
  text?: string;
  owner?: string;
  keywords?: string[];
  dataType?: string;
  metadata?: Record<string, unknown>;
  mode?: SearchMode;
  sort?: SortType;
  limit?: number;
  offset?: number;
}

/**
 * Search result interface
 */
export interface SearchResult {
  total: number;
  items: BaseRecord[];
  offset: number;
  limit: number;
}

/**
 * Task interface
 */
export interface Task {
  id: string;
  type: TaskType;
  status: string;
  progress: number;
  message?: string;
  createdTime: number;
  updatedTime: number;
  recordId?: string;
}

/**
 * Endpoint interface for Globus integration
 */
export interface Endpoint {
  id: string;
  displayName: string;
  entityType: string;
  isConnected: boolean;
  isBusy: boolean;
  ownerString: string;
  collections?: Array<{
    id: string;
    name: string;
    path: string;
    type: string;
  }>;
}

/**
 * Transfer interface for Globus integration
 */
export interface Transfer {
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
}

/**
 * API response interface
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
