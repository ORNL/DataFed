import { BaseRecord } from "./common";

/**
 * Search mode enum
 */
enum SearchMode {
  DATA = 0,
  COLLECTION = 1,
}

/**
 * Sort type enum
 */
enum SortType {
  ID = 0,
  TITLE = 1,
  OWNER = 2,
  TIME_CREATE = 3,
  TIME_UPDATE = 4,
  RELEVANCE = 5,
}

/**
 * Search query interface
 */
interface SearchQuery {
  id?: string;
  title?: string;
  text?: string;
  owner?: string;
  keywords?: string[];
  dataType?: string;
  metadata?: any;
  mode?: SearchMode;
  sort?: SortType;
  limit?: number;
  offset?: number;
}

/**
 * Search result interface
 */
interface SearchResult {
  total: number;
  items: BaseRecord[];
  offset: number;
  limit: number;
}

/**
 * Saved search interface
 */
interface SavedSearch {
  id: string;
  name: string;
  description?: string;
  query: SearchQuery;
  owner: string;
  createdTime: number;
  updatedTime: number;
  isPublic?: boolean;
}

/**
 * Facet interface for search results
 */
interface SearchFacet {
  field: string;
  values: {
    value: string;
    count: number;
  }[];
}

/**
 * Extended search result with facets
 */
interface SearchResultWithFacets extends SearchResult {
  facets?: SearchFacet[];
}

export {
  SearchMode,
  SortType,
  SearchQuery,
  SearchResult,
  SavedSearch,
  SearchFacet,
  SearchResultWithFacets,
};
