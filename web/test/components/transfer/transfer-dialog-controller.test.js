import { expect, sinon } from "../../setup.js";
import { createMockServices, setupJQueryMocks } from "../../fixtures/transfer-fixtures.js";
import { TransferDialogController } from "../../../static/components/transfer/transfer-dialog-controller.js";
import { TransferEndpointManager } from "../../../static/components/transfer/transfer-endpoint-manager.js";
import { TransferMode } from "../../../static/models/transfer-model.js";
import { TransferUIManager } from "../../../static/components/transfer/transfer-ui-manager.js";

describe("TransferDialogController", () => {
    let controller;
    let mockCallback;
    let mockServices;
    let sandbox;

    const TEST_MODE = TransferMode.TT_DATA_PUT;
    const TEST_IDS = [{ id: 1 }, { id: 2 }];

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        mockCallback = sandbox.stub();
        mockServices = createMockServices();
        setupJQueryMocks(sandbox);

        controller = new TransferDialogController(TEST_MODE, TEST_IDS, mockCallback, mockServices);
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe("constructor", () => {
        it("should initialize with correct parameters and components", () => {
            expect(controller.endpointManager).to.be.instanceOf(TransferEndpointManager);
            expect(controller.uiManager).to.be.instanceOf(TransferUIManager);
            expect(controller.ids).to.deep.equal(TEST_IDS);
            expect(controller.callback).to.equal(mockCallback);

            expect(controller.endpointManager.api).to.equal(mockServices.api);
            expect(controller.uiManager.api).to.equal(mockServices.api);
            expect(controller.endpointManager.dialogs).to.equal(mockServices.dialogs);
            expect(controller.uiManager.dialogs).to.equal(mockServices.dialogs);
        });

        it("should initialize with default services if none provided", () => {
            const defaultController = new TransferDialogController(
                TEST_MODE,
                TEST_IDS,
                mockCallback,
            );
            expect(defaultController.services).to.have.property("dialogs");
            expect(defaultController.services).to.have.property("api");
        });
    });

    describe("show", () => {
        it("should successfully show the transfer dialog", async () => {
            sandbox.stub(controller.uiManager, "initializeComponents");
            sandbox.stub(controller.uiManager, "attachMatchesHandler");
            sandbox.stub(controller.uiManager, "showDialog");

            await controller.show();

            expect(controller.uiManager.initializeComponents.called).to.be.true;
            expect(controller.uiManager.attachMatchesHandler.called).to.be.true;
            expect(controller.endpointManager.initialized).to.be.true;
            expect(controller.uiManager.showDialog.called).to.be.true;
        });

        it("should handle errors gracefully", async () => {
            sandbox
                .stub(controller.uiManager, "initializeComponents")
                .throws(new Error("Test error"));

            await controller.show();

            expect(
                mockServices.dialogs.dlgAlert.calledWith("Error", "Failed to open transfer dialog"),
            ).to.be.true;
        });
    });
});
