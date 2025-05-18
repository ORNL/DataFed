/**
 * Task type enum
 */
enum TaskType {
  DATA_GET = 0,
  DATA_PUT = 1,
  DATA_DEL = 2,
  REC_CHG_ALLOC = 3,
  REC_CHG_OWNER = 4,
  REC_DEL = 5,
  ALLOC_CREATE = 6,
  ALLOC_DEL = 7,
  USER_DEL = 8,
  PROJ_DEL = 9,
}

/**
 * Task status enum
 */
enum TaskStatus {
  BLOCKED = 0,
  READY = 1,
  RUNNING = 2,
  SUCCEEDED = 3,
  FAILED = 4,
}

/**
 * Task interface
 */
interface Task {
  id: string;
  type: TaskType;
  status: TaskStatus | string;
  progress: number;
  message?: string;
  createdTime: number;
  updatedTime: number;
  recordId?: string;
  userId?: string;
  priority?: number;
  dependencies?: string[];
}

/**
 * Task filter interface
 */
interface TaskFilter {
  userId?: string;
  recordId?: string;
  type?: TaskType;
  status?: TaskStatus;
  startTime?: number;
  endTime?: number;
}

/**
 * Task statistics interface
 */
interface TaskStatistics {
  total: number;
  running: number;
  succeeded: number;
  failed: number;
  blocked: number;
  ready: number;
  averageCompletionTime?: number;
}

export { TaskType, TaskStatus, Task, TaskFilter, TaskStatistics };
