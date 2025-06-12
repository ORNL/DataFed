const { db } = require("@arangodb");
const g_lib = require("../api/support");

const current_time = Math.floor(Date.now() / 1000);
const get_token_test_user = "getTokenUser";
const get_model_test_user = "getModelUser";
const get_globus_token_model_user = "getGlobusTokenModelUser";
const user_token_user = "userTokenUser";
const user_collection_token_user = "userCollectionTokenUser";
const uid_list = [
    "testUser0",
    "testUser1",
    "testUser2",
    "testUser3",
    "testUser4",
    get_token_test_user,
    get_model_test_user,
    get_globus_token_model_user,
    user_token_user,
    user_collection_token_user,
];
const end_uid = uid_list.at(-1);
const base_user_data = {
    name_first: "test",
    name_last: "user",
    is_admin: true,
    max_coll: g_lib.DEF_MAX_COLL,
    max_proj: g_lib.DEF_MAX_PROJ,
    max_sav_qry: g_lib.DEF_MAX_SAV_QRY,
    ct: current_time,
    ut: current_time,
};

const users_needing_token = [user_token_user, user_collection_token_user];

if (!db._collection("u")) {
    throw "This collection - u - does not exist";
} else if (!db.u.exists(end_uid)) {
    uid_list.map((uid, idx) => {
        if (!db.u.exists(uid)) {
            const minimal_user_data = {
                _key: uid,
                name: "test user" + " " + uid,
                ...base_user_data,
            };
            let user_data;
            if (users_needing_token.includes(uid)) {
                user_data = {
                    access: "access for " + uid,
                    refresh: "refresh for " + uid,
                    expiration: current_time + 123456789,
                    ...minimal_user_data,
                };
            } else {
                user_data = minimal_user_data;
            }

            db.u.save(user_data);
        }
    });
}
