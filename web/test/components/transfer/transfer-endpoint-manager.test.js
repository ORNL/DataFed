import { expect, sinon } from "../../setup.js";
import { createMockServices, setupJQueryMocks } from "../../fixtures/transfer-fixtures.js";
import { TransferEndpointManager } from "../../../static/components/transfer/transfer-endpoint-manager.js";

describe("TransferEndpointManager", () => {
    let jQueryStub;
    let manager;
    let mockController;
    let mockServices;
    let sandbox;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        mockServices = createMockServices();
        jQueryStub = setupJQueryMocks(sandbox);

        document.body.innerHTML = `                                                                                                                                  
             <div id="frame">                                                                                                                                         
                 <textarea id="path"></textarea>                                                                                                                      
                 <select id="matches"></select>                                                                                                                       
             </div>                                                                                                                                                   
         `;

        mockController = {
            uiManager: {
                state: {
                    frame: $("#frame"),
                    endpointOk: false,
                },
                updateEndpoint: sandbox.stub().returnsThis(),
                updateButtonStates: sandbox.stub().returnsThis(),
            },
        };

        manager = new TransferEndpointManager(mockController, mockServices);
        manager.initialized = true;
        manager.controller = mockController;
    });

    afterEach(() => {
        sandbox.restore();
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
            const searchAutocompleteSpy = sandbox.spy(manager, "searchEndpointAutocomplete");

            manager.searchEndpoint("test-endpoint", "test-token");

            expect(searchAutocompleteSpy.calledWith("test-endpoint", "test-token")).to.be.true;
        });

        it("should handle API errors", () => {
            mockServices.api.epView.throws(new Error("API Error"));

            manager.searchEndpoint("test-endpoint", "test-token");

            expect(mockServices.dialogs.dlgAlert.calledWith("Globus Error", sinon.match.any)).to.be
                .true;
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
            expect(jQueryStub.html.called).to.be.true;
            expect(jQueryStub.prop.calledWith("disabled", false)).to.be.true;
        });

        it("should handle no matches case", () => {
            mockServices.api.epAutocomplete.callsFake((endpoint, callback) =>
                callback(true, { DATA: [] }),
            );
            const consoleWarnStub = sinon.stub(console, "warn");

            manager.searchEndpointAutocomplete("test", "test-token");

            expect(manager.endpointManagerList).to.be.null;
            expect(jQueryStub.html.calledWith("<option disabled selected>No Matches</option>")).to
                .be.true;
            expect(jQueryStub.prop.calledWith("disabled", true)).to.be.true;
            expect(consoleWarnStub.calledWith("No matches found")).to.be.true;
        });

        it("should handle error responses", () => {
            mockServices.api.epAutocomplete.callsFake((endpoint, callback) =>
                callback(true, { code: "ERROR", DATA: [] }),
            );

            manager.searchEndpointAutocomplete("test", "test-token");

            expect(mockServices.dialogs.dlgAlert.calledWith("Globus Error", "ERROR")).to.be.true;
        });
    });

    describe("handlePathInput", () => {
        beforeEach(() => {
            manager.currentSearchToken = "test-token";
        });

        it("should process valid path input", () => {
            jQueryStub.val.returns("endpoint/path");
            const searchEndpointSpy = sandbox.spy(manager, "searchEndpoint");

            manager.handlePathInput("test-token");

            expect(searchEndpointSpy.calledWith("endpoint", "test-token")).to.be.true;
        });

        it("should handle empty path input", () => {
            jQueryStub.val.returns("");

            manager.handlePathInput("test-token");

            expect(manager.endpointManagerList).to.be.null;
            expect(manager.controller.uiManager.updateButtonStates.called).to.be.true;
        });

        it("should ignore stale requests", () => {
            jQueryStub.val.returns("endpoint/path");
            manager.currentSearchToken = "different-token";
            const searchEndpointSpy = sandbox.spy(manager, "searchEndpoint");

            manager.handlePathInput("test-token");

            expect(searchEndpointSpy.called).to.be.false;
        });

        it("should handle uninitialized state", () => {
            manager.initialized = false;
            const handlePathInputSpy = sandbox.spy(manager, "handlePathInput");

            manager.handlePathInput("test-token");

            expect(handlePathInputSpy.calledOnce).to.be.true;
        });
    });

    describe("updateMatchesList", () => {
        it("should update matches list with endpoints", () => {
            const endpoints = [
                { id: "1", name: "endpoint1" },
                { id: "2", name: "endpoint2" },
            ];

            manager.updateMatchesList(endpoints);

            expect(jQueryStub.html.called).to.be.true;
            expect(jQueryStub.prop.calledWith("disabled", false)).to.be.true;
        });

        it("should handle empty endpoints list", () => {
            manager.updateMatchesList([]);

            expect(jQueryStub.html.calledWith("<option disabled selected>No Matches</option>")).to
                .be.true;
            expect(jQueryStub.prop.calledWith("disabled", true)).to.be.true;
        });
    });
});
