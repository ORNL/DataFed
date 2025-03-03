const g_lib = require("../api/support");

const { db } = require("@arangodb");

// from user fixture file
const get_globus_token_model_user = "getGlobusTokenModelUser";
const get_globus_token_model_user_id = "u/" + get_globus_token_model_user;

// from globus collection fixture file
const get_globus_token_model_collection = "a1067823-2598-4481-be95-712794ddd9e8";
const get_globus_token_model_collection_id = "globus_coll/" + get_globus_token_model_collection;

const current_time = Math.floor(Date.now() / 1000);
const globus_token_list = [
    {
        user_id: get_globus_token_model_user_id,
        collection_id: get_globus_token_model_collection_id,
        key: get_globus_token_model_collection + "_" + g_lib.AccessTokenType.GLOBUS_TRANSFER + "_" + get_globus_token_model_user,
    }
];
const end_globus_token_key = globus_token_list.at(-1).key;
const base_globus_token_data = {
    type: g_lib.AccessTokenType.GLOBUS_TRANSFER,
    dependent_scopes: "some fake scopes",
    request_time: current_time,
    last_used: current_time,
    status: "active",
    expiration: current_time + 123456789,
}
if (!db._collection("globus_token")) {
    throw "This collection - globus_token - does not exist";
} else if (!db.globus_token.exists(end_globus_token_key)) {
    globus_token_list.map((globus_token_info, idx) => {
        if (!db.globus_token.exists(globus_token_info.key)) {
            const globus_token_data = {
                _key: globus_token_info.key,
                _from: globus_token_info.user_id,
                _to: globus_token_info.collection_id,
                ...base_globus_token_data,
                access: "access for " + globus_token_info.key,
                refresh: "refresh for " + globus_token_info.key,
            };

            db.globus_token.save(globus_token_data);
        }
    });
}