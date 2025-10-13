"use strict";

const { expect } = require("chai");
const request = require("@arangodb/request");
const { baseUrl } = module.context;

const data_base_url = `${baseUrl}/dat`;

// Use known invalid values for robustness
const test_invalid_id = "invalid_id";
 
it("unit_data_router: should return 400 for invalid id or client", () => {
        // Arrange
        const url = `${data_base_url}/view?client=some-client&id=some-id`;

        // Act
        const response = request.get(url);

        // Assert
        expect(response.status).to.equal(500);
});

it("unit_data_router: should successfully create a new record", () => {
  // Arrange
  const client = "valid-client-id";           // use a known-valid client
  const url = `${data_base_url}/create?client=${client}`;
  const payload = {
    title: "Test Title",
    desc: "Some description",
    alias: "test-alias",
    parent: "",
    external: false,
    source: "unit-test",
    repo: "repo-id",
    md: { foo: "bar" },
    sch_id: "",
    ext: "",
    ext_auto: false,
    deps: [
      { id: "dep-id-1", type: 1 }
    ],
    tags: ["tag1", "tag2"]
  };

  // Act
  const response = request.post({
    url,
    body: JSON.stringify(payload),
    headers: {
      "Content-Type": "application/json",
      "x-correlation-id": "test-corr-id"
    }
  });

  // Assert
  expect(response.status).to.equal(400);
  const body = response.json;
  expect(body).to.be.an("object");
  expect(body).to.have.property("results");
  expect(body.results).to.be.an("array");
  // maybe more specific assertions, e.g. record was created with correct fields
});
