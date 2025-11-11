"use strict";

const { expect } = require("chai");
const request = require("@arangodb/request");
const { baseUrl } = module.context;
const { db } = require("@arangodb");

// (replace “myrouter” with the actual base path)
const base_url = `${baseUrl}/`;

after(function () {
  // cleanup collections if needed
  const collections = [ /* list collections to truncate */ ];
  collections.forEach(name => {
    let col = db._collection(name);
    if (col) col.truncate();
  });
});

describe("unit_version_router: the Foxx microservice version/ endpoint", () => {
  beforeEach(() => {
    // ensure collections exist & trimmed/initialized
    const collections = [ /* list collections */ ];
    collections.forEach(name => {
      let col = db._collection(name);
      if (col) {
        col.truncate();
      } else {
        db._create(name);
      }
    });
  });

  it("should succeed when valid parameters given", () => {
    // arrange: setup fixture data
    // e.g., db.u.save({...}); db.mycoll.save({...});
    // TODO: insert required documents

    // arrange: build request string
    const request_string = `${base_url}/version`;
    
    // act
    const response = request.get(request_string);

    // assert
    expect(response.status).to.equal(200);
    // additional assertions on response body (if needed)
  });
});
