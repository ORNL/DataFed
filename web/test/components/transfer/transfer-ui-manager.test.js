import { expect, sinon } from "../../setup.js";
import { createMockServices, setupJQueryMocks } from "../../fixtures/transfer-fixtures.js";
import { TransferUIManager } from "../../../static/components/transfer/transfer-ui-manager.js";
import { TransferMode } from "../../../static/models/transfer-model.js";

describe("TransferUIManager", () => {
    let uiManager;
    let mockController;
    let mockServices;
    let jQueryStub;
    let sandbox;

    const testPath = "/test/path/dat.txt";
    const records = ["record1", "record2"];

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        mockController = {
            model: {
                mode: TransferMode.TT_DATA_GET,
                records,
                getRecordInfo: sandbox.stub().returns({ selectable: true, info: "test info" }),
            },
            endpointManager: {
                currentEndpoint: {
                    id: "test-endpoint",
                    name: "test-endpoint",
                    default_directory: "/default",
                    activated: true,
                    expires_in: 3600,
                    DATA: [{ scheme: "https" }],
                },
                currentSearchToken: 0,
                searchTokenIterator: 0,
                initialized: true,
                handlePathInput: sandbox.stub(),
            },
            callback: sandbox.stub(),
            ids: records,
        };
        mockServices = createMockServices();
        jQueryStub = setupJQueryMocks(sandbox);

        document.body.innerHTML = `                                                                                                                                  
             <div id="frame">                                                                                                                                         
                 <div id="title"></div>
                 <div id="records"></div>
                 <input id="path" type="text" value=${testPath} />
                 <div id="matches"></div>
                 <button id="browse"></button>
                 <button id="activate"></button>
                 <button id="go_btn"></button>
                 <input type="radio" id="encrypt_none" name="encrypt_mode" value="none" />
                 <input type="radio" id="encrypt_avail" name="encrypt_mode" value="available" />
                 <input type="radio" id="encrypt_req" name="encrypt_mode" value="required" />
                 <input type="checkbox" id="orig_fname" />
                 <input type="text" id="ext" />
             </div>                                                                                                                                                   
         `;

        uiManager = new TransferUIManager(mockController, mockServices);
        uiManager.state = {
            frame: $("#frame"),
            selectionOk: true,
            endpointOk: true,
            recordTree: {
                getSelectedNodes: sinon.stub().returns([{ key: records[0] }, { key: records[1] }]),
            },
            encryptRadios: {
                none: $("#encrypt_none"),
                available: $("#encrypt_avail"),
                required: $("#encrypt_req"),
            },
        };
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe("Constructor and Initialization", () => {
        it("should properly initialize state", () => {
            const freshUiManager = new TransferUIManager(mockController, mockServices);
            expect(freshUiManager.api).to.equal(mockServices.api);
            expect(freshUiManager.dialogs).to.equal(mockServices.dialogs);
        });

        it("should initialize components", () => {
            uiManager.initializeComponents();
            expect(jQueryStub.button.called).to.be.true;
        });
    });

    describe("Button Management", () => {
        it("should set button state correctly", () => {
            uiManager.setButtonState("#browse", true);
            expect($("#browse").button.calledWith("enable")).to.be.true;
        });

        it("should initialize buttons", () => {
            uiManager.initializeButtons();
            expect($(".btn").button.called).to.be.true;
        });
    });

    describe("Dialog Management", () => {
        it("should get correct dialog labels for GET mode", () => {
            const uiManager = new TransferUIManager(
                {
                    model: { mode: TransferMode.TT_DATA_GET },
                },
                mockServices,
            );
            const labels = uiManager.getDialogLabels();
            expect(labels.endpoint).to.equal("Destination");
            expect(labels.record).to.equal("Source");
            expect(labels.dialogTitle).to.equal("Download Raw Data");
        });

        it("should get correct dialog labels for PUT mode", () => {
            const uiManager = new TransferUIManager(
                {
                    model: { mode: TransferMode.TT_DATA_PUT },
                },
                mockServices,
            );
            const labels = uiManager.getDialogLabels();
            expect(labels.endpoint).to.equal("Source");
            expect(labels.record).to.equal("Destination");
            expect(labels.dialogTitle).to.equal("Upload Raw Data");
        });
    });

    describe("Path Management", () => {
        it("should get default path correctly", () => {
            const endpoint = {
                name: "test-endpoint",
                default_directory: "/default/path",
            };
            const result = uiManager.getDefaultPath(endpoint);
            expect(result).to.equal("test-endpoint/default/path");
        });

        it("should handle empty default directory", () => {
            const endpoint = {
                name: "test-endpoint",
            };
            const result = uiManager.getDefaultPath(endpoint);
            expect(result).to.equal("test-endpoint/");
        });
    });

    describe("Record Management", () => {
        it("should get selected IDs correctly", () => {
            uiManager.state.recordTree = {
                getSelectedNodes: () => [{ key: "record1" }, { key: "record2" }],
            };

            const ids = uiManager.getSelectedIds();
            expect(ids).to.deep.equal(["record1", "record2"]);
        });
    });

    describe("Transfer Handling", () => {
        it("should handle successful transfer start", () => {
            sinon.stub(uiManager, "startTransfer");
            sinon.stub(uiManager, "getTransferConfig").returns({
                path: "/test/path",
                encrypt: "none",
                origFilename: true,
                extension: undefined,
            });
        });

        it("should handle empty path in transfer config", () => {
            jQueryStub.val.returns("");
            const config = uiManager.getTransferConfig();
            expect(config).to.be.null;
            expect(mockServices.dialogs.dlgAlert.called).to.be.true;
        });
    });

    describe("Transfer Operations", () => {
        it("should handle successful transfer response", () => {
            const mockData = { task: { id: "test-task" } };
            const closeDialogSpy = sandbox.spy(uiManager, "closeDialog");

            uiManager.handleTransferResponse(true, mockData);

            expect(closeDialogSpy.calledOnce).to.be.true;
        });

        it("should handle transfer errors", () => {
            uiManager.handleTransferResponse(false, "Error message");
            expect(mockServices.dialogs.dlgAlert.calledWith("Transfer Error", "Error message")).to
                .be.true;
        });

        it("should start transfer with correct parameters", () => {
            const config = {
                path: "/test/path",
                encrypt: "none",
                origFilename: true,
                extension: "txt",
            };

            uiManager.startTransfer(config);

            expect(mockServices.api.xfrStart.called).to.be.true;
            expect(mockServices.api.xfrStart.firstCall.args[0]).to.deep.equal(records);
        });
    });

    describe("UI Operations", () => {
        it("should update button states correctly", () => {
            uiManager.updateButtonStates();
            expect(jQueryStub.button.called).to.be.true;
        });

        it("should update encryption options correctly", () => {
            const endpoint = { force_encryption: true };
            const scheme = "https";

            const radioStub = {
                length: 1,
                hasClass: sandbox.stub().returns(true),
                checkboxradio: sandbox.stub().returnsThis(),
                prop: sandbox.stub().returnsThis(),
            };
            uiManager.state.encryptRadios = {
                none: radioStub,
                available: radioStub,
                required: radioStub,
            };

            uiManager.updateEncryptionOptions(endpoint, scheme);
            expect(radioStub.checkboxradio.called).to.be.true;
        });
    });
});
