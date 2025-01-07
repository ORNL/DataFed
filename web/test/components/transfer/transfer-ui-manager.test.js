import { expect, sinon } from "../../setup.js";
import { TransferUIManager } from "../../../static/components/transfer/transfer-ui-manager.js";
import * as model from "../../../static/model.js";
import * as dialogs from "../../../static/dialogs.js";
import * as api from "../../../static/api.js";

describe("TransferUIManager", () => {
    let uiManager;
    let mockDialog;
    let mockJQuery;

    beforeEach(() => {
        mockDialog = {
            model: {
                mode: model.TT_DATA_GET,
                records: [],
                getRecordInfo: sinon.stub(),
            },
            endpointManager: {
                currentEndpoint: {
                    id: "test-endpoint",
                    name: "test-endpoint",
                    default_directory: "/default",
                },
                currentSearchToken: "test-token",
                searchCounter: 0,
            },
        };

        // Create a real DOM element
        const frame = document.createElement("div");
        document.body.appendChild(frame);

        // Setup jQuery mock
        global.$ = mockJQuery = sinon.stub().returns({
            dialog: sinon.stub(),
            button: sinon.stub(),
            val: sinon.stub().returns("test/path"),
            html: sinon.stub(),
            prop: sinon.stub(),
            on: sinon.stub(),
            show: sinon.stub(),
            checkboxradio: sinon.stub(),
            hasClass: sinon.stub().returns(false),
        });

        uiManager = new TransferUIManager(mockDialog);
        uiManager.frame = frame;
    });

    afterEach(() => {
        sinon.restore();
    });

    describe("Constructor and Initialization", () => {
        it("should properly initialize state", () => {
            expect(uiManager.state.selectionOk).to.be.true;
            expect(uiManager.state.endpointOk).to.be.false;
        });

        it("should store controller reference", () => {
            expect(uiManager.controller).to.equal(mockDialog);
        });
    });

    describe("UI Operations", () => {
        it("should safely handle UI operations", () => {
            const operation = sinon.stub();
            uiManager.safeUIOperation(operation);
            expect(operation.called).to.be.true;
        });

        it("should handle UI operation failures gracefully", () => {
            const errorOperation = () => {
                throw new Error("UI Error");
            };
            const consoleSpy = sinon.spy(console, "error");
            const reInitSpy = sinon.spy(uiManager, "reInitializeUIComponents");

            expect(() => {
                uiManager.safeUIOperation(errorOperation);
            }).throws(Error);

            expect(consoleSpy.called).to.be.true;
            expect(reInitSpy.called).to.be.true;
        });
    });

    describe("Button Management", () => {
        it("should initialize button if not already initialized", () => {
            const buttonSelector = "#testButton";
            uiManager.ensureButtonInitialized(buttonSelector);
            expect(mockJQuery().button.called).to.be.true;
        });

        it("should set button state correctly", () => {
            uiManager.setButtonState("#testButton", true);
            expect(mockJQuery().button.calledWith("enable")).to.be.true;

            uiManager.setButtonState("#testButton", false);
            expect(mockJQuery().button.calledWith("disable")).to.be.true;
        });
    });

    describe("Path Management", () => {
        it("should get correct browse path", () => {
            const result = uiManager.getBrowsePath("endpoint/path");
            expect(result).to.equal("/path");
        });
    });

    describe("Dialog Management", () => {
        it("should get correct dialog labels for GET mode", () => {
            const labels = uiManager.getDialogLabels();
            expect(labels.endpoint).to.equal("Destination");
            expect(labels.record).to.equal("Source");
            expect(labels.dialogTitle).to.equal("Download Raw Data");
        });

        it("should get correct dialog labels for PUT mode", () => {
            uiManager.controller.model.mode = model.TT_DATA_PUT;
            const labels = uiManager.getDialogLabels();
            expect(labels.endpoint).to.equal("Source");
            expect(labels.record).to.equal("Destination");
            expect(labels.dialogTitle).to.equal("Upload Raw Data");
        });
    });

    describe("Transfer Configuration", () => {
        beforeEach(() => {
            mockJQuery().val.returns("/test/path");
            mockJQuery().prop.returns(true);
        });

        it("should get valid transfer configuration", () => {
            const config = uiManager.getTransferConfig();
            expect(config).to.have.property("path");
            expect(config).to.have.property("encrypt");
            expect(config).to.have.property("origFilename");
        });

        it("should handle empty path", () => {
            mockJQuery().val.returns("");

            const config = uiManager.getTransferConfig();

            expect(config).to.be.null;
        });
    });

    describe("Transfer Handling", () => {
        it("should handle successful transfer start", () => {
            sinon.stub(uiManager, "startTransfer");
            sinon.stub(uiManager, "getTransferConfig").returns({
                path: "/test/path",
                encrypt: "1",
                origFilename: false,
                extension: "",
            });

            uiManager.handleTransfer();

            expect(uiManager.startTransfer.calledOnce).to.be.true;
        });

        it("should handle transfer errors", () => {
            sinon.stub(uiManager, "startTransfer");
            sinon.stub(uiManager, "getTransferConfig").returns({
                path: "/test/path",
                encrypt: "1",
                origFilename: false,
                extension: "",
            });

            uiManager.handleTransfer();

            expect(uiManager.startTransfer.calledOnce).to.be.true;
        });
    });

    describe("Record Management", () => {
        it("should format record title correctly", () => {
            const mockRecord = { id: "test-id", title: "Test Title" };
            const mockInfo = { info: "INFO", selectable: true };

            const title = uiManager.formatRecordTitle(mockRecord, mockInfo);

            expect(title).to.include(mockRecord.id);
            expect(title).to.include(mockRecord.title);
            expect(title).to.include(mockInfo.info);
        });

        it("should get selected IDs correctly", () => {
            uiManager.controller.model.records = [{ id: "id1" }, { id: "id2" }];
            uiManager.recordTree = {
                getSelectedNodes: () => [{ key: "id1" }, { key: "id2" }],
            };

            const selectedIds = uiManager.getSelectedIds();
            expect(selectedIds).to.deep.equal(["id1", "id2"]);
        });
    });
});
