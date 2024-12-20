const { db } = require("@arangodb");
const g_lib = require("../api/support");
const users = module.context.collectionName("u");

const uid = "testUser0";

if (!db._collection(users)) {
    throw "This collection does not exist"
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
        ct: time,
        ut: time
    };

    db.u.save(user_data);
}