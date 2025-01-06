import { expect, sinon } from "../../setup.js";
import { TransferDialogController } from "../../../static/components/transfer/transfer-dialog-controller.js";
import { TransferEndpointManager } from "../../../static/components/transfer/transfer-endpoint-manager.js";
import { TransferModel } from "../../../static/models/transfer-model.js";
import { TransferUIManager } from "../../../static/components/transfer/transfer-ui-manager.js";
import { createMockImport } from "mock-import";
import { createMockModule } from "../../test-utils.js";

describe("TransferDialogController", () => {
    let controller;
    let mockCallback;
    let mockDialogs;
    let sandbox;

    const TEST_MODE = 1;
    const TEST_IDS = [{ id: 1 }, { id: 2 }];

    beforeEach(async () => {
        sandbox = sinon.createSandbox();
        mockCallback = sandbox.stub();

        const MockTransferModel = class {
            constructor() {
                this.cache = new Map();
            }
            setCache() {}
        };

        const MockEndpointManager = class {
            constructor() {
                this.initialized = false;
            }
            initialize() {
                this.initialized = true;
            }
        };

        const MockUIManager = class {
            constructor() {
                this.dialog = {};
                this.button = {};
            }
            createDialog() {}
            initializeComponents() {}
            attachMatchesHandler() {}
            showDialog() {}
            getDialogLabels() {
                return {};
            }
            reInitializeUIComponents() {}
        };

        mockDialogs = {
            dlgAlert: sandbox.stub(),
        };

        const mockImporter = createMockImport(import.meta.url);

        const mocks = {
            "../../static/dialogs.js": createMockModule(mockDialogs),
            "../../models/transfer-model.js": createMockModule({
                TransferModel: MockTransferModel,
            }),
            "./transfer-endpoint-manager.js": createMockModule({
                TransferEndpointManager: MockEndpointManager,
            }),
            "./transfer-ui-manager.js": createMockModule({
                TransferUIManager: MockUIManager,
            }),
        };

        // Apply all mocks
        for (const [path, mock] of Object.entries(mocks)) {
            await mockImporter.mockImport(path, mock);
        }

        const module = await mockImporter.reImport(
            "../../../static/components/transfer/transfer-dialog-controller.js",
        );

        TransferDialogController = module.TransferDialogController;
        controller = new TransferDialogController(TEST_MODE, TEST_IDS, mockCallback);
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe("constructor", () => {
        it("should initialize with correct parameters", () => {
            expect(controller.model).to.be.instanceOf(TransferModel);
            expect(controller.endpointManager).to.be.instanceOf(TransferEndpointManager);
            expect(controller.uiManager).to.be.instanceOf(TransferUIManager);
            expect(controller.ids).to.deep.equal(TEST_IDS);
            expect(controller.callback).to.equal(mockCallback);
        });
    });

    describe("show", () => {
        it("should successfully show the transfer dialog", async () => {
            await controller.show();

            expect(controller.uiManager.createDialog.called).to.be.true;
            expect(controller.uiManager.initializeComponents.called).to.be.true;
            expect(controller.uiManager.attachMatchesHandler.called).to.be.true;
            expect(controller.uiManager.showDialog.called).to.be.true;
            expect(controller.endpointManager.initialized).to.be.true;
        });

        it("should handle errors and show alert dialog", async () => {
            const error = new Error("Test error");
            controller.uiManager.createDialog.throws(error);

            await controller.show();

            expect(mockDialogs.dlgAlert.calledOnce).to.be.true;
            expect(mockDialogs.dlgAlert.calledWith("Error", "Failed to open transfer dialog")).to.be
                .true;
        });
    });
});
