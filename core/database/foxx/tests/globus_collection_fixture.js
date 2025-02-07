"use strict";

const { db } = require("@arangodb");

const current_time = Math.floor(Date.now() / 1000);
const collection_no_token_uuid = "94445318-2097-4ed8-8550-f73cd292b11f";
const collection_key_list = [collection_no_token_uuid];
const end_collection_key = collection_key_list.at(-1);
const base_globus_collection_data = {
    name: "Test fixture collection",
    description: "Test fixture collection description",
    required_scopes: "test::globus::transfer::scopes",
    owner: "",
    ct: current_time,
    ut: current_time,
    type: "mapped",
    ha_enabled: false,
};

if (!db._collection("globus_coll")) {
    throw "This collection - globus_coll - does not exist";
} else if (!db.globus_coll.exists(end_collection_key)) {
    collection_key_list.map((collection_key, idx) => {
        if (!db.globus_coll.exists(collection_key)) {
            const globus_collection_data = {
                _key: collection_key,
                ...base_globus_collection_data,
            };

            db.globus_coll.save(globus_collection_data);
        }
    });
}
