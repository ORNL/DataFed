"use strict";

const { UserModel, User } = require("../api/models/user");
const { DataFedOAuthToken } = require("../api/models/DataFedOAuthToken");
const g_lib = require("../api/support");

// Unit test of DB user model
const { expect } = require("chai");
const { db } = require("@arangodb");

describe("unit_user_model: User Model tests", () => {
    // test setup - give some arbitrary token
    let working_user_doc;
    let get_user_doc;
    before(() => {
        get_user_doc = Object.freeze(db.u.document({ _key: "getModelUser" }));
        const update_user_doc = db.u.update(
            get_user_doc,
            {
                ...get_user_doc,
                access: "get user access token",
                refresh: "get user refresh token",
                expiration: 123456789,
            },
            { returnNew: true },
        );
        working_user_doc = Object.freeze(update_user_doc.new);
    });

    describe("unit_user_model: calling constructor", () => {
        it("should create a user object when passed an id", () => {
            const user_model = new UserModel("u/getModelUser");
            expect(user_model).to.be.instanceOf(UserModel);
        });
        it("should create a user object when passed a key", () => {
            const user_model = new UserModel(null, "getModelUser");
            expect(user_model).to.be.instanceOf(UserModel);
        });
        it("should throw an error if neither id nor key are provided", () => {
            expect(() => new UserModel()).to.throw("User ID or Key must be provided");
        });
    });

    describe("unit_user_model: calling exists", () => {
        const user_model_exists = new UserModel("u/getModelUser");
        const user_model_dne = new UserModel("u/userNotExists");

        it("should return true when the user exists on DB", () => {
            const user_exists = user_model_exists.exists();
            expect(user_exists).to.be.true;
        });

        it("should return false when the user does not exist on DB", () => {
            const user_exists = user_model_dne.exists();
            expect(user_exists).to.be.false;
        });
    });

    describe("unit_user_model: calling get", () => {
        const user_model_exists = new UserModel("u/getModelUser");
        const user_model_dne = new UserModel("u/userNotExists");

        it("should return a read only user object when user exists", () => {
            const user = user_model_exists.get();

            expect(user).to.be.instanceOf(User);
            expect(user).to.be.frozen;
            expect(user).to.include({
                id: working_user_doc._id,
                key: working_user_doc._key,
                name: working_user_doc.name,
                first_name: working_user_doc.first_name,
                last_name: working_user_doc.last_name,
                is_admin: working_user_doc.is_admin,
                maximum_collections: working_user_doc.max_coll,
                maximum_projects: working_user_doc.max_proj,
                maximum_saved_queries: working_user_doc.max_sav_qry,
                creation_time: working_user_doc.ct,
                update_time: working_user_doc.ut,
                // These values should be undefined
                password: working_user_doc.password,
                email: working_user_doc.email,
                options: working_user_doc.options,
            });
        });

        it("should return a ready only empty user object with all fields undefined when user does not exist", () => {
            const user = user_model_dne.get();

            expect(user).to.be.instanceOf(User);
            expect(user).to.be.frozen;
            Object.keys(User).map((key) => {
                expect(user).to.have.property(key, undefined);
            });
        });

        // TODO: this is mostly to document current functionality, we will likely want updates in the future
        it("should not update when the database data updates", () => {
            // arrange
            const test_no_update_token_data = {
                access: "test no update access",
                refresh: "test no update refresh",
            };
            const inserted_data = db.u.insert(
                { ...get_user_doc, ...test_no_update_token_data, _key: "test_get_before_update" },
                { returnNew: true },
            );
            const working_user_model = new UserModel(inserted_data._id);
            const old_user = working_user_model.get();

            // act
            let updated_data = db.u.update(
                inserted_data,
                { email: "new_test_email@example.com" },
                { returnNew: true },
            );
            const new_user = working_user_model.get();

            // assert
            expect(new_user).to.deep.equal(old_user);
            expect(new_user).to.have.property("email", undefined);
            expect(new_user.email).to.equal(updated_data.email);

            // cleanup
            db.u.remove(updated_data);
        });

        it("should reflect updates when a new user model is built", () => {
            // arrange
            const test_update_token_data = {
                access: "test update access",
                refresh: "test update refresh",
            };
            const inserted_data = db.u.insert(
                { ...get_user_doc, ...test_update_token_data, _key: "test_get_after_update" },
                { returnNew: true },
            );
            const old_user = new UserModel(inserted_data._id).get();

            // act
            let updated_data = db.u.update(
                inserted_data,
                { email: "new_test_email@example.com" },
                { returnNew: true },
            );
            const new_user = new UserModel(inserted_data._id).get();

            // assert
            expect(new_user).to.not.deep.equal(old_user);
            expect(new_user).to.have.property("email", "new_test_email@example.com");
            expect(new_user.email).to.not.equal(updated_data.email);

            // cleanup
            db.u.remove(updated_data);
        });
    });

    describe("unit_user_model: calling get_token", () => {
        const user_model_exists = new UserModel("u/getModelUser");
        const user_model_dne = new UserModel("u/userNotExists");

        it("should return a read only token object when user exists", () => {
            const token = user_model_exists.get_token();

            expect(token).to.be.instanceOf(DataFedOAuthToken);
            expect(token).to.be.frozen;
            expect(token).to.include({
                access: working_user_doc.access,
                refresh: working_user_doc.refresh,
                expiration: working_user_doc.expiration,
                type: g_lib.AccessTokenType.GLOBUS_DEFAULT,
                dependent_scopes: "",
            });
        });

        it("should return an empty object when user does not exist", () => {
            const token = user_model_dne.get_token();

            expect(token).to.be.instanceOf(DataFedOAuthToken);
            expect(token).to.be.frozen;
            expect(token).to.include({
                access: undefined,
                refresh: undefined,
                expiration: undefined,
                type: g_lib.AccessTokenType.GLOBUS_DEFAULT,
                dependent_scopes: "",
            });
        });

        // assuming previous update tests sufficient to prove same logic here
    });

});