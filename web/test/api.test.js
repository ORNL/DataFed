import { expect } from "chai";
import sinon from "sinon";
import { getGlobusConsentURL } from "../static/api.js";

describe("getGlobusConsentURL", function () {
    const sandbox = sinon.createSandbox();
    const collection_id = "test_collection";
    let asyncGetStub;

    beforeEach(function () {
        global.$ = {
            ajax: function () {},
        };
        asyncGetStub = sinon.stub(global.$, "ajax");
    });

    afterEach(function () {
        sandbox.restore();
    });

    it("should call the callback with correct parameters when all arguments are provided", function (done) {
        const callback = sandbox.spy();
        const requested_scopes = ["scope1", "scope2"];
        const refresh_tokens = true;
        const query_params = { param1: "value1" };
        const state = "test_state";

        asyncGetStub.callsFake((options) => {
            expect(options.url).to.equal("/api/globus/consent_url");
            expect(options.data).to.deep.equal({
                collection_id,
                refresh_tokens,
                requested_scopes: requested_scopes.join(","),
                query_params: JSON.stringify(query_params),
                state,
            });
            options.success({ consent_url: "http://example.com" });
        });

        getGlobusConsentURL(
            callback,
            collection_id,
            requested_scopes,
            refresh_tokens,
            query_params,
            state,
        );

        setTimeout(() => {
            expect(callback.calledOnce).to.be.true;
            expect(callback.calledWith(true, { consent_url: "http://example.com" })).to.be.true;
            done();
        }, 0);
    });

    it("should handle missing optional parameters", function (done) {
        const callback = sandbox.spy();
        const requested_scopes = ["scope1", "scope2"];

        asyncGetStub.callsFake((options) => {
            expect(options.url).to.equal("/api/globus/consent_url");
            expect(options.data).to.include({
                collection_id,
                refresh_tokens: false,
                requested_scopes: requested_scopes.join(","),
                query_params: "{}",
                state: "_default",
            });
            options.success({ consent_url: "http://example.com" });
        });

        getGlobusConsentURL(callback, collection_id, requested_scopes);

        setTimeout(() => {
            expect(callback.calledOnce).to.be.true;
            expect(callback.calledWith(true, { consent_url: "http://example.com" })).to.be.true;
            done();
        }, 0);
    });

    it("should handle empty requested_scopes", function (done) {
        const callback = sandbox.spy();
        const requested_scopes = [];

        asyncGetStub.callsFake((options) => {
            expect(options.url).to.equal("/api/globus/consent_url");
            expect(options.data).to.include({
                requested_scopes: "",
            });
            options.success({ consent_url: "http://example.com" });
        });

        getGlobusConsentURL(callback, collection_id, requested_scopes);

        setTimeout(() => {
            expect(callback.calledOnce).to.be.true;
            expect(callback.calledWith(true, { consent_url: "http://example.com" })).to.be.true;
            done();
        }, 0);
    });

    it("should handle refresh_tokens set to false", function (done) {
        const callback = sandbox.spy();

        const requested_scopes = ["scope1"];

        asyncGetStub.callsFake((options) => {
            expect(options.url).to.equal("/api/globus/consent_url");
            expect(options.data).to.include({
                refresh_tokens: false,
            });
            options.success({ consent_url: "http://example.com" });
        });

        getGlobusConsentURL(callback, collection_id, requested_scopes, false);

        setTimeout(() => {
            expect(callback.calledOnce).to.be.true;
            expect(callback.calledWith(true, { consent_url: "http://example.com" })).to.be.true;
            done();
        }, 0);
    });
});
