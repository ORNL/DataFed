import * as dialogs from "../../dialogs.js";
import { TransferDialogController } from "./transfer-dialog-controller";

export function show(mode, records, callback) {
  try {
    const dialog = new TransferDialogController(mode, records, callback);
    dialog.show();
  } catch (error) {
    console.error("Error showing transfer dialog:", error);
    dialogs.dlgAlert("Error", "Failed to open transfer dialog");
  }
}