import { expect } from "chai";
import sinon from "sinon";
import { TransferEndpointManager } from "../../../static/components/transfer/transfer-endpoint-manager.js";
import * as api from "../../../static/api.js";
import * as dialogs from "../../../static/dialogs.js";

describe("TransferEndpointManager", () => {
    let manager;
    let mockDialog;
    let mockJQuery;

    beforeEach(() => {
        mockDialog = {
            uiManager: {
                frame: $("<div>"),
                updateEndpoint: sinon.stub(),
                state: { endpointOk: false },
                updateButtonStates: sinon.stub(),
                createMatchesHtml: sinon.stub().returns("<option>Test</option>"),
            },
        };

        sinon.stub(api, "epView");
        sinon.stub(api, "epAutocomplete");

        manager = new TransferEndpointManager(mockDialog);
        manager.initialized = true;
    });

    afterEach(() => {
        sinon.restore();
    });

    describe("getEndpointStatus", () => {
        it('should return "active" for non-activated endpoint with expires_in = -1', () => {
            const endpoint = { activated: false, expires_in: -1 };
            expect(manager.getEndpointStatus(endpoint)).to.equal("active");
        });

        it("should return hours remaining for activated endpoint", () => {
            const endpoint = { activated: true, expires_in: 7200 };
            expect(manager.getEndpointStatus(endpoint)).to.equal("2 hrs");
        });

        it('should return "inactive" for non-activated endpoint with expires_in != -1', () => {
            const endpoint = { activated: false, expires_in: 0 };
            expect(manager.getEndpointStatus(endpoint)).to.equal("inactive");
        });
    });

    describe("searchEndpoint", () => {
        let epViewStub;

        beforeEach(() => {
            epViewStub = sinon.stub(api, "epView");
            manager.currentSearchToken = "test-token";
        });

        it("should update UI on successful direct endpoint match", () => {
            const mockData = { name: "test-endpoint" };
            epViewStub.callsFake((endpoint, callback) => callback(true, mockData));

            manager.searchEndpoint("test-endpoint", "test-token");

            expect(manager.controller.uiManager.updateEndpoint.calledWith(mockData)).to.be.true;
            expect(manager.controller.uiManager.state.endpointOk).to.be.true;
            expect(manager.controller.uiManager.updateButtonStates.called).to.be.true;
        });

        it("should fall back to autocomplete when no direct match found", () => {
            const searchAutocompleteSpy = sinon.spy(manager, "searchEndpointAutocomplete");
            epViewStub.callsFake((endpoint, callback) => callback(true, { code: "NOT_FOUND" }));

            manager.searchEndpoint("test-endpoint", "test-token");

            expect(searchAutocompleteSpy.calledWith("test-endpoint", "test-token")).to.be.true;
        });

        it("should handle errors gracefully", () => {
            const dlgAlertStub = sinon.stub(dialogs, "dlgAlert");
            epViewStub.throws(new Error("Test error"));

            manager.searchEndpoint("test-endpoint", "test-token");

            expect(dlgAlertStub.calledWith("Globus Error", sinon.match.any)).to.be.true;
        });
    });

    describe("searchEndpointAutocomplete", () => {
        let epAutocompleteStub;

        beforeEach(() => {
            epAutocompleteStub = sinon.stub(api, "epAutocomplete");
            manager.currentSearchToken = "test-token";
        });

        it("should update matches list with autocomplete results", () => {
            const mockData = {
                DATA: [
                    { id: "1", canonical_name: "endpoint1" },
                    { id: "2", canonical_name: "endpoint2" },
                ],
            };
            epAutocompleteStub.callsFake((endpoint, callback) => callback(true, mockData));

            manager.searchEndpointAutocomplete("test", "test-token");

            expect(manager.endpointManagerList).to.deep.equal(mockData.DATA);
        });

        it("should handle no matches case", () => {
            epAutocompleteStub.callsFake((endpoint, callback) => callback(true, { DATA: [] }));

            manager.searchEndpointAutocomplete("test", "test-token");

            expect(manager.endpointManagerList).to.be.null;
        });
    });

    describe("handlePathInput", () => {
        it("should process valid path input", () => {
            const searchEndpointSpy = sinon.spy(manager, "searchEndpoint");
            manager.currentSearchToken = "test-token";

            manager.handlePathInput("test-token");

            expect(searchEndpointSpy.called).to.be.true;
        });

        it("should handle empty path input", () => {
            mockJQuery().val.returns("");
            manager.currentSearchToken = "test-token";

            manager.handlePathInput("test-token");

            expect(manager.endpointManagerList).to.be.null;
        });

        it("should ignore stale requests", () => {
            manager.currentSearchToken = "different-token";
            const searchEndpointSpy = sinon.spy(manager, "searchEndpoint");

            manager.handlePathInput("test-token");

            expect(searchEndpointSpy.called).to.be.false;
        });
    });
});
