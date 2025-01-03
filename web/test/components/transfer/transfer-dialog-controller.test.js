import { expect } from "chai";
import sinon from "sinon";
import { TransferDialogController } from "../../../static/components/transfer/transfer-dialog-controller.js";
import { TransferModel } from "../../../static/models/transfer-model.js";
import { TransferEndpointManager } from "../../../static/components/transfer/transfer-endpoint-manager.js";
import { TransferUIManager } from "../../../static/components/transfer/transfer-ui-manager.js";
import * as dialogs from "../../../static/dialogs.js";

describe("TransferDialogController", () => {
    let controller;
    let mockCallback;
    const TEST_MODE = 1;
    const TEST_IDS = [{ id: 1 }, { id: 2 }];

    beforeEach(() => {
        mockCallback = sinon.spy();
        sinon.stub(TransferModel.prototype);
        sinon.stub(TransferEndpointManager.prototype);
        sinon.stub(TransferUIManager.prototype, "createDialog");
        sinon.stub(TransferUIManager.prototype, "initializeComponents");
        sinon.stub(TransferUIManager.prototype, "attachMatchesHandler");
        sinon.stub(TransferUIManager.prototype, "showDialog");
        sinon.stub(dialogs, "dlgAlert");

        controller = new TransferDialogController(TEST_MODE, TEST_IDS, mockCallback);
    });

    afterEach(() => {
        sinon.restore();
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
        it("should successfully show the transfer dialog", () => {
            controller.show();

            expect(controller.uiManager.createDialog.calledOnce).to.be.true;
            expect(controller.uiManager.initializeComponents.calledOnce).to.be.true;
            expect(controller.uiManager.attachMatchesHandler.calledOnce).to.be.true;
            expect(controller.uiManager.showDialog.calledOnce).to.be.true;
            expect(controller.endpointManager.initialized).to.be.true;
        });

        it("should handle errors and show alert dialog", () => {
            controller.uiManager.createDialog.throws(new Error("Test error"));
            controller.show();

            expect(dialogs.dlgAlert.calledOnce).to.be.true;
            expect(dialogs.dlgAlert.calledWith("Error", "Failed to open transfer dialog")).to.be
                .true;
        });

        it("should call UI methods in correct order", () => {
            controller.show();

            sinon.assert.callOrder(
                controller.uiManager.createDialog,
                controller.uiManager.initializeComponents,
                controller.uiManager.attachMatchesHandler,
                controller.uiManager.showDialog,
            );
        });
    });
});
