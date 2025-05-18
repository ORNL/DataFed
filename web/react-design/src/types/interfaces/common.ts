/**
 * Base interface for all record types
 */
interface BaseRecord {
  id: string;
  title: string;
  description?: string;
  owner: string;
  ownerName?: string;
  createdTime: number;
  updatedTime: number;
  keywords?: string[];
  permissions?: number;
  locked?: boolean;
}

/**
 * API response interface
 */
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * Access Control List interface
 */
interface ACL {
  uid: string;
  name?: string;
  permissions: number;
}

/**
 * Pagination parameters
 */
interface PaginationParams {
  limit: number;
  offset: number;
}

/**
 * Sorting parameters
 */
interface SortParams {
  field: string;
  direction: "asc" | "desc";
}

/**
 * Filter parameters
 */
interface FilterParams {
  field: string;
  value: string | number | boolean;
  operator?:
    | "eq"
    | "neq"
    | "gt"
    | "lt"
    | "gte"
    | "lte"
    | "contains"
    | "startsWith"
    | "endsWith";
}

/**
 * Query parameters
 */
interface QueryParams {
  pagination?: PaginationParams;
  sort?: SortParams[];
  filters?: FilterParams[];
}

export {
  BaseRecord,
  ApiResponse,
  ACL,
  PaginationParams,
  SortParams,
  FilterParams,
  QueryParams,
};
