const { db } = require("@arangodb");
const g_lib = require("../api/support");

const uid = "testUser0";
const current_time = Math.floor(Date.now() / 1000)

if (!db._collection("u")) {
    throw "This collection - u - does not exist"
} else if (!db.u.exists(uid)) {
    const user_data = {
        _key: uid,
        name: "test user" + " " + uid,
        name_first: "test",
        name_last: "user",
        is_admin: true,
        max_coll: g_lib.DEF_MAX_COLL,
        max_proj: g_lib.DEF_MAX_PROJ,
        max_sav_qry: g_lib.DEF_MAX_SAV_QRY,
        ct: current_time,
        ut: current_time
    };

    db.u.save(user_data);
}