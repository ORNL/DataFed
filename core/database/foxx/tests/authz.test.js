"use strict";
const chai = require("chai");
const expect = chai.expect;
const authzModule = require("../api/authz");
const g_db = require("@arangodb").db;
const g_lib = require("../api/support");
const arangodb = require("@arangodb");

describe("Authz functions", () => {
    beforeEach(() => {
        g_db.d.truncate();
        g_db.alloc.truncate();
        g_db.loc.truncate();
        g_db.repo.truncate();
        g_db.u.truncate();
        g_db.owner.truncate();
        g_db.p.truncate();
        g_db.admin.truncate();
    });

    describe("unit_authz: if a user is an admin 'bob' they should have authorization on not_bob's record", () => {
        it("unit_authz: should return true", () => {
            let data_key = "big_data_obj";
            let data_id = "d/" + data_key;

            g_db.d.save({
                _key: data_key,
                _id: data_id,
                creator: "u/george",
            });

            let owner_id = "u/not_bob";
            g_db.u.save({
                _key: "not_bob",
                _id: owner_id,
                is_admin: false,
            });

            let client = {
                _key: "bob",
                _id: "u/bob",
                is_admin: true,
            };

            g_db.u.save(client);

            g_db.owner.save({
                _from: data_id,
                _to: owner_id,
            });

            let req_perm = g_lib.PERM_CREATE;

            expect(authzModule.isRecordActionAuthorized(client, data_key, req_perm)).to.be.true;
        });
    });

    describe("unit_authz: if a record is part of George's user allocation a non owning regular user 'bob' should not have access to the record", () => {
        it("unit_authz: should thrown an error if bob tries to run a create request on the record.", () => {
            let data_key = "data_key";
            let data_id = "d/" + data_key;

            g_db.d.save({
                _key: data_key,
                _id: data_id,
                creator: "u/george",
            });

            let client = {
                _key: "bob",
                _id: "u/bob",
                is_admin: false,
            };

            g_db.u.save(client);

            let req_perm = g_lib.PERM_CREATE;

            expect(() =>
                authzModule.isRecordActionAuthorized(client, data_key, req_perm),
            ).to.throw();
        });
    });

    describe("unit_authz: a user 'george' who is an owner of a record should have authorization on the record.", () => {
        it("unit_authz: should return true.", () => {
            let data_key = "data_key";
            let data_id = "d/" + data_key;

            g_db.d.save({
                _key: data_key,
                _id: data_id,
                creator: "u/george",
            });

            let client = {
                _key: "george",
                _id: "u/george",
                is_admin: false,
            };

            g_db.u.save(client);

            g_db.owner.save({
                _from: data_id,
                _to: "u/george",
            });

            let req_perm = g_lib.PERM_CREATE;

            expect(authzModule.isRecordActionAuthorized(client, data_key, req_perm)).to.be.true;
        });
    });

    describe("unit_authz: a user 'bob' who is an admin of a project should have authorization on a record in the project.", () => {
        it("unit_authz: should return true", () => {
            let data_key = "project_data_obj";
            let data_id = "d/" + data_key;

            g_db.d.save({
                _key: data_key,
                _id: data_id,
                creator: "u/george",
            });

            let project_id = "p/project_1";
            g_db.p.save({
                _key: "project_1",
                _id: project_id,
                name: "Project One",
            });

            let bob_id = "u/bob";

            let bob = {
                _key: "bob",
                _id: bob_id,
                is_admin: false,
            };

            let george = {
                _key: "george",
                _id: "u/george",
                is_admin: false,
            };

            g_db.u.save(bob);
            g_db.u.save(george);

            g_db.owner.save({
                _from: data_id,
                _to: project_id,
            });

            g_db.admin.save({
                _from: project_id,
                _to: bob_id,
            });
            let req_perm = g_lib.PERM_CREATE;

            expect(authzModule.isRecordActionAuthorized(bob, data_key, req_perm)).to.be.true;
        });
    });

    describe("unit_authz: non-owner 'bob' should be denied access to another user's 'george' record.", () => {
        it("unit_authz: should return false", () => {
            let data_key = "bananas";
            let data_id = "d/" + data_key;

            g_db.d.save(
                {
                    _key: data_key,
                    _id: data_id,
                    creator: "u/george",
                },
                { waitForSync: true },
            );

            let bob = {
                _key: "bob",
                _id: "u/bob",
                is_admin: false,
            };

            let george = {
                _key: "george",
                _id: "u/george",
                is_admin: false,
            };

            g_db.u.save(bob, { waitForSync: true });
            g_db.u.save(george, { waitForSync: true });

            g_db.owner.save(
                {
                    _from: data_id,
                    _to: "u/george",
                },
                { waitForSync: true },
            );
            let req_perm = g_lib.PERM_CREATE;

            expect(authzModule.isRecordActionAuthorized(bob, data_key, req_perm)).to.be.false;
        });
    });

    describe("unit_authz: 'Jack' is a creator of the an 'apples' document in the 'fruity' project, 'Mandy' is the admin of the 'condiments' project, 'Mandy' should not have access to the 'apples' document.", () => {
        it("unit_authz: should return false.", () => {
            let data_key = "apples";
            let data_id = "d/" + data_key;

            g_db.d.save(
                {
                    _key: data_key,
                    _id: data_id,
                    creator: "u/jack",
                },
                { waitForSync: true },
            );

            let jack = {
                _key: "jack",
                _id: "u/jack",
                is_admin: false,
            };

            g_db.u.save(jack, { waitForSync: true });

            let fruity_project_id = "p/fruity";
            g_db.p.save(
                {
                    _key: "fruity",
                    _id: fruity_project_id,
                    name: "Project Fruity",
                },
                { waitForSync: true },
            );

            let condiments_project_id = "p/condiments";
            g_db.p.save(
                {
                    _key: "condiments",
                    _id: condiments_project_id,
                    name: "Project Condiments",
                },
                { waitForSync: true },
            );

            let mandy_admin_id = "u/mandy";
            let mandy = {
                _key: "mandy",
                _id: mandy_admin_id,
                is_admin: false,
            };
            g_db.u.save(mandy, { waitForSync: true });

            let amy_admin_id = "u/amy";
            g_db.u.save(
                {
                    _key: "amy",
                    _id: amy_admin_id,
                    is_admin: false,
                },
                { waitForSync: true },
            );

            g_db.owner.save(
                {
                    _from: data_id,
                    _to: fruity_project_id,
                },
                { waitForSync: true },
            );

            g_db.admin.save(
                {
                    _from: fruity_project_id,
                    _to: amy_admin_id,
                },
                { waitForSync: true },
            );

            g_db.admin.save(
                {
                    _from: condiments_project_id,
                    _to: mandy_admin_id,
                },
                { waitForSync: true },
            );
            let req_perm = g_lib.PERM_CREATE;

            // Non-project admin should not have permission
            expect(authzModule.isRecordActionAuthorized(mandy, data_key, req_perm)).to.be.false;
        });
    });

    describe("unit_authz: 'Tim' is the creator of a record 'cherry', but the 'cherry' record has been moved to a different project 'red_fruit' that 'Tim' does not have access to.", () => {
        it("unit_authz: should return false.", () => {
            let data_key = "cherry";
            let data_id = "d/" + data_key;

            g_db.d.save(
                {
                    _key: data_key,
                    _id: data_id,
                    creator: "tim",
                },
                { waitForSync: true },
            );

            let tim = {
                _key: "tim",
                _id: "u/tim",
                is_admin: false,
            };

            // A project is the owner
            let project_id = "p/red_fruit";
            g_db.p.save(
                {
                    _key: "red_fruit",
                    _id: project_id,
                    name: "Project Red Fruit",
                },
                { waitForSync: true },
            );

            let bob_id = "u/bob";

            let bob = {
                _key: "bob",
                _id: bob_id,
                is_admin: false,
            };

            g_db.u.save(bob, { waitForSync: true });

            g_db.owner.save(
                {
                    _from: data_id,
                    _to: project_id,
                },
                { waitForSync: true },
            );

            g_db.admin.save(
                {
                    _from: project_id,
                    _to: bob_id,
                },
                { waitForSync: true },
            );

            g_db.u.save(tim, { waitForSync: true });

            let req_perm = g_lib.PERM_READ;

            expect(authzModule.isRecordActionAuthorized(tim, data_key, req_perm)).to.be.false;
        });
    });
});
