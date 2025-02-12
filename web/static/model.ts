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

export const PERM_BAS_READ = PERM_RD_REC | PERM_RD_META | PERM_RD_DATA | PERM_LIST;
export const PERM_BAS_WRITE = PERM_WR_REC | PERM_WR_META | PERM_WR_DATA | PERM_LINK | PERM_CREATE;
export const PERM_BAS_ADMIN = PERM_DELETE | PERM_SHARE | PERM_LOCK;
export const PERM_ALL = 0x0fff;

export const MD_MAX_SIZE = 102400; // Max metadata size = 100 Kb
export const PAYLOAD_MAX_SIZE = 1048576; // Max server payload size = 10 MB

export const SM_DATA = 0;
export const SM_COLLECTION = 1;

export const SearchModeFromString = {
    SM_DATA: SM_DATA,
    SM_COLLECTION: SM_COLLECTION,
};

export const SORT_ID = 0;
export const SORT_TITLE = 1;
export const SORT_OWNER = 2;
export const SORT_TIME_CREATE = 3;
export const SORT_TIME_UPDATE = 4;
export const SORT_RELEVANCE = 5;

export const SortFromString = {
    SORT_ID: SORT_ID,
    SORT_TITLE: SORT_TITLE,
    SORT_OWNER: SORT_OWNER,
    SORT_TIME_CREATE: SORT_TIME_CREATE,
    SORT_TIME_UPDATE: SORT_TIME_UPDATE,
    SORT_RELEVANCE: SORT_RELEVANCE,
};

export const TT_DATA_GET = 0;
export const TT_DATA_PUT = 1;
export const TT_DATA_DEL = 2;
export const TT_REC_CHG_ALLOC = 3;
export const TT_REC_CHG_OWNER = 4;
export const TT_REC_DEL = 5;
export const TT_ALLOC_CREATE = 6;
export const TT_ALLOC_DEL = 7;
export const TT_USER_DEL = 8;
export const TT_PROJ_DEL = 9;

export const TS_BLOCKED = 0;
export const TS_READY = 1;
export const TS_RUNNING = 2;
export const TS_SUCCEEDED = 3;
export const TS_FAILED = 4;

export const ENCRYPT_NONE = 0;
export const ENCRYPT_AVAIL = 1;
export const ENCRYPT_FORCE = 2;

export const DEP_IN = 0;
export const DEP_OUT = 1;

export const DEP_IS_DERIVED_FROM = 0;
export const DEP_IS_COMPONENT_OF = 1;
export const DEP_IS_NEW_VERSION_OF = 2;

export const NOTE_QUESTION = 0;
export const NOTE_INFO = 1;
export const NOTE_WARN = 2;
export const NOTE_ERROR = 3;

export const NOTE_CLOSED = 0;
export const NOTE_OPEN = 1;
export const NOTE_ACTIVE = 2;

export const NOTE_MASK_ACT_QUES = 0x0001;
export const NOTE_MASK_ACT_INFO = 0x0002;
export const NOTE_MASK_ACT_WARN = 0x0004;
export const NOTE_MASK_ACT_ERR = 0x0008;
export const NOTE_MASK_OPN_QUES = 0x0010;
export const NOTE_MASK_OPN_INFO = 0x0020;
export const NOTE_MASK_OPN_WARN = 0x0040;
export const NOTE_MASK_OPN_ERR = 0x0080;
export const NOTE_MASK_INH_WARN = 0x0400;
export const NOTE_MASK_INH_ERR = 0x0800;
export const NOTE_MASK_LOC_QUES = 0x0011;
export const NOTE_MASK_LOC_INFO = 0x0022;
export const NOTE_MASK_LOC_WARN = 0x0044;
export const NOTE_MASK_LOC_ERR = 0x0088;
export const NOTE_MASK_LOC_ALL = 0x00ff;
export const NOTE_MASK_INH_ALL = 0x0c00;
export const NOTE_MASK_CLS_ANY = 0x1000;
export const NOTE_MASK_ALL = 0x1fff;
export const NOTE_MASK_MD_ERR = 0x2000;

export const NoteTypeLabel = ["Question", "Information", "Warning", "Error"];

export const NoteStateLabel = ["Closed", "Open", "Active"];

export const NoteTypeFromString = {
    NOTE_QUESTION: NOTE_QUESTION,
    NOTE_INFO: NOTE_INFO,
    NOTE_WARN: NOTE_WARN,
    NOTE_ERROR: NOTE_ERROR,
};

export const NoteStateFromString = {
    NOTE_CLOSED: NOTE_CLOSED,
    NOTE_OPEN: NOTE_OPEN,
    NOTE_ACTIVE: NOTE_ACTIVE,
};

export const DepDirFromString = {
    DEP_IN: DEP_IN,
    DEP_OUT: DEP_OUT,
};

export const DepTypeFromString = {
    DEP_IS_DERIVED_FROM: DEP_IS_DERIVED_FROM,
    DEP_IS_COMPONENT_OF: DEP_IS_COMPONENT_OF,
    DEP_IS_NEW_VERSION_OF: DEP_IS_NEW_VERSION_OF,
};

export const TaskTypeFromString = {
    TT_DATA_GET: TT_DATA_GET,
    TT_DATA_PUT: TT_DATA_PUT,
    TT_DATA_DEL: TT_DATA_DEL,
    TT_REC_CHG_ALLOC: TT_REC_CHG_ALLOC,
    TT_REC_CHG_OWNER: TT_REC_CHG_OWNER,
    TT_REC_DEL: TT_REC_DEL,
    TT_ALLOC_CREATE: TT_ALLOC_CREATE,
    TT_ALLOC_DEL: TT_ALLOC_DEL,
    TT_USER_DEL: TT_USER_DEL,
    TT_PROJ_DEL: TT_PROJ_DEL,
};

export const TaskTypeLabel = {
    TT_DATA_GET: "Get Data",
    TT_DATA_PUT: "Put Data",
    TT_DATA_DEL: "Delete Data",
    TT_REC_CHG_ALLOC: "Change Alloc",
    TT_REC_CHG_OWNER: "Change Owner",
    TT_REC_DEL: "Delete Record",
    TT_ALLOC_CREATE: "Create Alloc",
    TT_ALLOC_DEL: "Delete Alloc",
    TT_USER_DEL: "Delete User",
    TT_PROJ_DEL: "Delete Project",
};

export const TaskStatusLabel = {
    TS_BLOCKED: "QUEUED",
    TS_READY: "READY",
    TS_RUNNING: "RUNNING",
    TS_SUCCEEDED: "SUCCEEDED",
    TS_FAILED: "FAILED",
};

var upd_cbs = [];
var upd_timer;
var upd_data = {};

export function registerUpdateListener(a_cb) {
    if (upd_cbs.indexOf(a_cb) < 0) upd_cbs.push(a_cb);
}

export function update(a_data) {
    var d;
    console.log("Update model called", a_data);

    if (upd_timer) {
        clearTimeout(upd_timer);
        upd_timer = null;
    }

    // Convert array to map
    for (var i in a_data) {
        d = a_data[i];
        upd_data[d.id] = d;
    }

    upd_timer = setTimeout(function () {
        console.log("calling Update CBs");
        for (var i in upd_cbs) {
            upd_cbs[i](upd_data);
        }
        upd_timer = null;
        upd_data = {};
    }, 250);
}
