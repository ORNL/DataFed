import { expect, sinon } from "../../setup.js";
import { TransferDialogController } from "../../../static/components/transfer/transfer-dialog-controller.js";
import { TransferEndpointManager } from "../../../static/components/transfer/transfer-endpoint-manager.js";
import { TransferModel } from "../../../static/models/transfer-model.js";
import { TransferUIManager } from "../../../static/components/transfer/transfer-ui-manager.js";

describe("TransferDialogController", () => {
    let controller;
    let mockCallback;
    let sandbox;
    let uiManagerStub;
    let endpointManagerStub;
    let modelStub;

    const TEST_MODE = 1;
    const TEST_IDS = [{ id: 1 }, { id: 2 }];
    const TEST_DIALOG_LABELS = { title: "Test Title", button: "Test Button" };

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        mockCallback = sandbox.stub();

        modelStub = new TransferModel(TEST_MODE, TEST_IDS);
        endpointManagerStub = new TransferEndpointManager();
        uiManagerStub = new TransferUIManager();

        sandbox.stub(modelStub);

        uiManagerStub.createDialog = sandbox.stub();
        uiManagerStub.initializeComponents = sandbox.stub();
        uiManagerStub.attachMatchesHandler = sandbox.stub();
        uiManagerStub.showDialog = sandbox.stub();
        uiManagerStub.getDialogLabels = sandbox.stub().returns(TEST_DIALOG_LABELS);

        endpointManagerStub.initialized = false;
        controller = new TransferDialogController(TEST_MODE, TEST_IDS, mockCallback);

        controller.uiManager = uiManagerStub;
        controller.endpointManager = endpointManagerStub;
        controller.model = modelStub;
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe("constructor", () => {
        it("should initialize with correct parameters", () => {
            const newController = new TransferDialogController(TEST_MODE, TEST_IDS, mockCallback);

            expect(newController.model).to.be.instanceOf(TransferModel);
            expect(newController.endpointManager).to.be.instanceOf(TransferEndpointManager);
            expect(newController.uiManager).to.be.instanceOf(TransferUIManager);
            expect(newController.ids).to.deep.equal(TEST_IDS);
            expect(newController.callback).to.equal(mockCallback);
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
    });
});
