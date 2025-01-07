import { expect } from "chai";
import sinon from "sinon";
import { TransferEndpointManager } from "../../../static/components/transfer/transfer-endpoint-manager.js";

describe("TransferEndpointManager", () => {
    let manager;
    let mockDialog;
    let mockFrame;
    let mockServices;

    beforeEach(() => {
        mockFrame = $("<div>");
        mockFrame.append('<textarea id="path"></textarea>');
        mockFrame.append('<select id="matches"></select>');
        mockDialog = {
            uiManager: {
                frame: mockFrame,
                updateEndpoint: sinon.stub(),
                state: { endpointOk: false },
                updateButtonStates: sinon.stub(),
                createMatchesHtml: sinon.stub().returns("<option>Test</option>"),
            },
        };
        mockServices = {
            api: {
                epAutocomplete: sinon.stub(),
                epView: sinon.stub(),
            },
            dialogs: {
                dlgAlert: sinon.stub(),
            },
        };

        manager = new TransferEndpointManager(mockDialog, mockServices);
        manager.initialized = true;
    });

    afterEach(() => {
        sinon.restore();
    });

    describe("searchEndpoint", () => {
        beforeEach(() => {
            manager.currentSearchToken = "test-token";
        });

        it("should update UI on successful direct endpoint match", () => {
            const mockData = { name: "test-endpoint" };
            mockServices.api.epView.callsFake((endpoint, callback) => callback(true, mockData));
            manager.searchEndpoint("test-endpoint", "test-token");

            expect(manager.controller.uiManager.updateEndpoint.calledWith(mockData)).to.be.true;
            expect(manager.controller.uiManager.state.endpointOk).to.be.true;
            expect(manager.controller.uiManager.updateButtonStates.called).to.be.true;
        });

        it("should fall back to autocomplete when no direct match found", () => {
            mockServices.api.epView.callsFake((endpoint, callback) =>
                callback(true, { code: "ERROR" }),
            );
            const searchAutocompleteSpy = sinon.spy(manager, "searchEndpointAutocomplete");

            manager.searchEndpoint("test-endpoint", "test-token");

            expect(searchAutocompleteSpy.calledWith("test-endpoint", "test-token")).to.be.true;
        });
    });

    describe("searchEndpointAutocomplete", () => {
        beforeEach(() => {
            manager.currentSearchToken = "test-token";
        });

        it("should update matches list with autocomplete results", () => {
            const mockData = {
                DATA: [
                    { id: "1", canonical_name: "endpoint1" },
                    { id: "2", canonical_name: "endpoint2" },
                ],
            };
            mockServices.api.epAutocomplete.callsFake((endpoint, callback) =>
                callback(true, mockData),
            );
            manager.searchEndpointAutocomplete("test", "test-token");

            expect(manager.endpointManagerList).to.deep.equal(mockData.DATA);
            expect(mockServices.api.epAutocomplete.calledOnce).to.be.true;
        });

        it("should handle no matches case", () => {
            mockServices.api.epAutocomplete.callsFake((endpoint, callback) =>
                callback(true, { DATA: [] }),
            );
            const consoleWarnStub = sinon.stub(console, "warn");

            manager.searchEndpointAutocomplete("test", "test-token");

            expect(manager.endpointManagerList).to.be.null;
            expect(consoleWarnStub.calledWith("No matches found")).to.be.true;
        });
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

    describe("handlePathInput", () => {
        beforeEach(() => {
            manager.currentSearchToken = "test-token";
        });

        it("should process valid path input", () => {
            $("#path", mockFrame).val("endpoint/path");
            const searchEndpointSpy = sinon.spy(manager, "searchEndpoint");

            manager.handlePathInput("test-token");

            expect(searchEndpointSpy.calledWith("endpoint", "test-token")).to.be.true;
        });

        it("should handle empty path input", () => {
            $("#path", mockFrame).val("");

            manager.handlePathInput("test-token");

            expect(manager.endpointManagerList).to.be.null;
            expect(manager.controller.uiManager.updateButtonStates.called).to.be.true;
        });

        it("should ignore stale requests", () => {
            $("#path", mockFrame).val("endpoint/path");
            manager.currentSearchToken = "different-token";
            const searchEndpointSpy = sinon.spy(manager, "searchEndpoint");

            manager.handlePathInput("test-token");

            expect(searchEndpointSpy.called).to.be.false;
        });
    });
});
