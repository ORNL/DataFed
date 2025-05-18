/**
 * User interface
 */
interface User {
  uid: string;
  nameFirst: string;
  nameLast: string;
  email: string;
  org: string;
  isAdmin: boolean;
  defaultProject?: string;
  defaultAlloc?: string;
}

/**
 * User group interface
 */
interface UserGroup {
  id: string;
  name: string;
  description?: string;
  owner: string;
  ownerName?: string;
  members: string[];
  memberNames?: string[];
  createdTime: number;
  updatedTime: number;
}

/**
 * User settings interface
 */
interface UserSettings {
  defaultProject?: string;
  defaultAlloc?: string;
  defaultCollection?: string;
  uiSettings?: {
    theme?: string;
    layout?: string;
    pageSize?: number;
    showTutorials?: boolean;
  };
  notifications?: {
    email?: boolean;
    taskCompletion?: boolean;
    recordShared?: boolean;
    systemAlerts?: boolean;
  };
}

/**
 * Authentication token interface
 */
interface AuthToken {
  token: string;
  expiresAt: number;
  scope: string[];
}

/**
 * User session interface
 */
interface UserSession {
  userId: string;
  sessionId: string;
  createdTime: number;
  expiresAt: number;
  lastActivity: number;
  ipAddress?: string;
  userAgent?: string;
}

export { User, UserGroup, UserSettings, AuthToken, UserSession };
