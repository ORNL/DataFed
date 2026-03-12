"use strict";

const { expect } = require("chai");
const request = require("@arangodb/request");
const { baseUrl } = module.context;
const { db } = require("@arangodb");

const schema_base_url = `${baseUrl}/schema`;

describe("schema router", () => {
    before(() => {
        const collections = ["u", "sch", "sch_dep"];
        collections.forEach((name) => {
            const col = db._collection(name);
            if (col) col.truncate();
            else db._create(name);
        });

        db.u.save({
            _key: "fakeUser",
            _id: "u/fakeUser",
            name: "Fake User",
            is_admin: true,
        });
    });

    after(function () {
        const collections = ["u", "sch", "sch_dep"];
        collections.forEach((name) => {
            const col = db._collection(name);
            if (col) col.truncate();
        });
    });

    it("unit_schema_router: should create a schema", () => {
        const body = {
            id: "test_schema_1",
            desc: "A simple test schema",
            def: { properties: { field1: { type: "string" } } },
            pub: true,
            sys: false,
        };

        const response = request.post(`${schema_base_url}/create?client=u/fakeUser`, {
            body: JSON.stringify(body),
            headers: { "Content-Type": "application/json" },
        });

        expect(response.status).to.equal(200);

        const result = JSON.parse(response.body);
        expect(result).to.be.an("array");
        expect(result[0].def).to.deep.equal(body.def);
        expect(result[0].own_nm).to.equal("Fake");
    });

    it("unit_schema_router: should update a schema", () => {
        const response = request.post(
            `${schema_base_url}/update?client=u/fakeUser&id=test_schema_1:0`,
            {
                body: JSON.stringify({
                    desc: "Updated schema description",
                    def: { properties: { field1: { type: "string" } } },
                    pub: true,
                }),
                headers: { "Content-Type": "application/json" },
            },
        );

        expect(response.status).to.equal(200);

        const schema = JSON.parse(response.body)[0];
        expect(schema).to.have.property("id", "test_schema_1");
        expect(schema).to.have.property("desc", "Updated schema description");
        expect(schema).to.have.property("own_id", "u/fakeUser");
    });

    it("unit_schema_router: should revise a schema", () => {
        const response = request.post(
            `${schema_base_url}/revise?client=u/fakeUser&id=test_schema_1:0`,
            {
                body: JSON.stringify({
                    desc: "Revised schema description",
                    def: {
                        properties: {
                            field1: { type: "string" },
                            field2: { type: "number" },
                        },
                    },
                    pub: true,
                }),
                headers: { "Content-Type": "application/json" },
            },
        );

        expect(response.status).to.equal(200);

        const schema = JSON.parse(response.body)[0];
        expect(schema).to.have.property("ver", 1);
        expect(schema).to.have.property("id", "test_schema_1");
    });

    it("unit_schema_router: should search schemas", () => {
        const response = request.get(`${schema_base_url}/search?client=u/fakeUser`);

        expect(response.status).to.equal(200);

        const result = JSON.parse(response.body);
        expect(result).to.be.an("array");

        const paging = result[result.length - 1];
        expect(paging).to.have.property("paging");

        const schemas = result.filter((r) => !r.paging);
        if (schemas.length) {
            expect(schemas[0]).to.have.property("ver");
            expect(schemas[0]).to.have.property("own_id");
            expect(schemas[0]).to.have.property("own_nm");
        }
    });

    it("unit_schema_router: should delete latest schema revision", () => {
        const response = request.post(
            `${schema_base_url}/delete?client=u/fakeUser&id=test_schema_1:1`,
        );

        expect(response.status).to.equal(204);

        const deleted = db.sch.firstExample({ id: "test_schema_1", ver: 1 });
        expect(deleted).to.equal(null);
    });

    it("unit_schema_router: should view a schema", () => {
        const response = request.get(
            `${schema_base_url}/view?client=u/fakeUser&id=test_schema_1:0`,
        );

        expect(response.status).to.equal(200);

        const schema = JSON.parse(response.body)[0];
        expect(schema).to.have.property("id", "test_schema_1:0");
        expect(schema).to.have.property("ver", 0);
        expect(schema).to.have.property("own_id", "u/fakeUser");
    });
});
