import { expect } from 'chai';
import { isObjEmpty, globusGetAuthorizeURL } from '../static/util.js';

describe('isObjEmpty', function () {
  it('should return true for an empty object', function () {
    const emptyObj = {};
    expect(isObjEmpty(emptyObj)).to.be.true;
  });

  it('should return false for an object with properties', function () {
    const objWithProps = { key: 'value' };
    expect(isObjEmpty(objWithProps)).to.be.false;
  });

  it('should return true if a non-object is passed (like null)', function () {
    expect(isObjEmpty(null)).to.be.true;
  });

  it('should return true if a non-object is passed (like undefined)', function () {
    expect(isObjEmpty(undefined)).to.be.true;
  });
});

describe('globusGetAuthorizeURL', () => {
  const client_id = "39c655a9-a428-46fa-94bb-078feab6acb1";
  const redirect_uri = "https://fake.website.datafed/ui/authn";
  const requested_scopes = [
    "urn:globus:auth:scope:transfer.api.globus.org:all[*https://auth.globus.org/scopes/e8b9afc1-dabf-45e9-9743-d5eda7c914c9/data_access]",
    "urn:globus:auth:scope:transfer.api.globus.org:all[*https://auth.globus.org/scopes/5066556a-bcd6-4e00-8e3f-b45e0ec88b1a/data_access]"
  ];
  const state = "none";
  const refresh_tokens = true;
  const query_params = {};
  it('should return a valid URL', () => {
    expect(
        Boolean(new URL(
            globusGetAuthorizeURL(
                client_id,
                redirect_uri,
                requested_scopes,
                state,
                refresh_tokens,
                query_params
            )
            )
        )
    ).to.be.true;
  });
});

