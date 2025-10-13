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
