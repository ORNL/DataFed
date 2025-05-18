/**
 * ======================================================
 * PERMISSIONS AND ACCESS CONTROL
 * ======================================================
 */

enum Permission {
  RD_REC = 0x0001, // Read record info (description, keywords, details)
  RD_META = 0x0002, // Read structured metadata
  RD_DATA = 0x0004, // Read raw data
  WR_REC = 0x0008, // Write record info (description, keywords, details)
  WR_META = 0x0010, // Write structured metadata
  WR_DATA = 0x0020, // Write raw data
  LIST = 0x0040, // List contents of a collection
  LINK = 0x0080, // Link/unlink child records (collections only)
  CREATE = 0x0100, // Create new child records (collections only)
  DELETE = 0x0200, // Delete record
  SHARE = 0x0400, // View/set ACLs
  LOCK = 0x0800, // Lock record
}

const PERM_BAS_READ =
  Permission.RD_REC | Permission.RD_META | Permission.RD_DATA | Permission.LIST;
const PERM_BAS_WRITE =
  Permission.WR_REC |
  Permission.WR_META |
  Permission.WR_DATA |
  Permission.LINK |
  Permission.CREATE;
const PERM_BAS_ADMIN = Permission.DELETE | Permission.SHARE | Permission.LOCK;
const PERM_ALL = 0x0fff;

/**
 * ======================================================
 * METADATA AND PAYLOAD LIMITATIONS
 * ======================================================
 */

const MD_MAX_SIZE = 102400; // Max metadata size = 100 Kb
const PAYLOAD_MAX_SIZE = 1048576; // Max server payload size = 1 MB

/**
 * ======================================================
 * DEPENDENCIES AND RELATIONSHIPS
 * ======================================================
 */

enum DependencyDirection {
  IN = 0,
  OUT = 1,
}
enum DependencyType {
  IS_DERIVED_FROM = 0,
  IS_COMPONENT_OF = 1,
  IS_NEW_VERSION_OF = 2,
}

/**
 * ======================================================
 * NOTES AND ANNOTATIONS
 * ======================================================
 */

enum NoteType {
  QUESTION = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}
enum NoteState {
  CLOSED = 0,
  OPEN = 1,
  ACTIVE = 2,
}

// Note filtering masks
enum NoteMask {
  // Active notes by type
  ACT_QUES = 0x0001,
  ACT_INFO = 0x0002,
  ACT_WARN = 0x0004,
  ACT_ERR = 0x0008,

  // Open notes by type
  OPN_QUES = 0x0010,
  OPN_INFO = 0x0020,
  OPN_WARN = 0x0040,
  OPN_ERR = 0x0080,

  // Inherited warnings and errors
  INH_WARN = 0x0400,
  INH_ERR = 0x0800,

  // Local notes by type
  LOC_QUES = 0x0011,
  LOC_INFO = 0x0022,
  LOC_WARN = 0x0044,
  LOC_ERR = 0x0088,

  // Groupings
  LOC_ALL = 0x00ff,
  INH_ALL = 0x0c00,
  CLS_ANY = 0x1000,
  ALL = 0x1fff,
  MD_ERR = 0x2000,
}

// Display labels
const NoteTypeLabel: Record<NoteType, string> = {
  [NoteType.QUESTION]: "Question",
  [NoteType.INFO]: "Information",
  [NoteType.WARN]: "Warning",
  [NoteType.ERROR]: "Error",
};
const NoteStateLabel: Record<NoteState, string> = {
  [NoteState.CLOSED]: "Closed",
  [NoteState.OPEN]: "Open",
  [NoteState.ACTIVE]: "Active",
};

export {
  Permission,
  PERM_BAS_READ,
  PERM_BAS_WRITE,
  PERM_BAS_ADMIN,
  PERM_ALL,
  MD_MAX_SIZE,
  PAYLOAD_MAX_SIZE,
  DependencyDirection,
  DependencyType,
  NoteType,
  NoteState,
  NoteMask,
  NoteTypeLabel,
  NoteStateLabel,
};
