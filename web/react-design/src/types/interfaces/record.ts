import { BaseRecord } from "./common";

/**
 * Data record interface
 */
interface DataRecord extends BaseRecord {
  size?: number;
  dataType?: string;
  metadata?: any;
  allocId?: string;
  hasData?: boolean;
  source?: string;
}

/**
 * Collection record interface
 */
interface CollectionRecord extends BaseRecord {
  childCount?: number;
  children?: BaseRecord[];
}

/**
 * Project record interface
 */
interface ProjectRecord extends BaseRecord {
  members?: string[];
  memberNames?: string[];
  isPublic?: boolean;
}

/**
 * Allocation record interface
 */
interface AllocationRecord extends BaseRecord {
  repoId: string;
  repoName?: string;
  path?: string;
  quota?: number;
  used?: number;
  isDefault?: boolean;
}

/**
 * Repository record interface
 */
interface RepositoryRecord extends BaseRecord {
  url: string;
  type: string;
  status: string;
  allocCount?: number;
}

/**
 * Dependency interface
 */
interface Dependency {
  id: string;
  sourceId: string;
  targetId: string;
  type: number;
  direction: number;
  createdTime: number;
}

/**
 * Annotation interface
 */
interface Annotation {
  id: string;
  recordId: string;
  type: number;
  state: number;
  title: string;
  text: string;
  createdTime: number;
  updatedTime: number;
  createdBy: string;
  updatedBy: string;
}

/**
 * Schema interface
 */
interface Schema {
  id: string;
  name: string;
  version: string;
  description?: string;
  schema: any;
  createdTime: number;
  updatedTime: number;
  owner: string;
}

export {
  DataRecord,
  CollectionRecord,
  ProjectRecord,
  AllocationRecord,
  RepositoryRecord,
  Dependency,
  Annotation,
  Schema,
};
