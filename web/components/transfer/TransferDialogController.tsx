import React from 'react';
import { TransferUIManager } from './TransferUIManager';
import { TransferEndpointManager } from './TransferEndpointManager';
import { TransferModel } from '../../static/models/transfer-model';

interface Services {
  dialogs: {
    dlgAlert: (title: string, message: string) => void;
  };
  api: any;
}

export class TransferDialogController {
  private model: TransferModel;
  private endpointManager: typeof TransferEndpointManager;
  private uiManager: typeof TransferUIManager;
  private ids: Array<object>;
  private callback: Function;
  private services: Services;

  constructor(mode: number, ids: Array<object>, callback: Function, services: Services) {
    this.model = new TransferModel(mode, ids);
    this.endpointManager = new TransferEndpointManager(this, services);
    this.uiManager = new TransferUIManager(this, services);
    this.ids = ids;
    this.callback = callback;
    this.services = services;
  }

  show() {
    try {
      this.uiManager.initializeComponents();
      this.uiManager.attachMatchesHandler();
      this.endpointManager.initialized = true;
      this.uiManager.showDialog();
    } catch (error) {
      console.error("Failed to show transfer dialog:", error);
      this.services.dialogs.dlgAlert("Error", "Failed to open transfer dialog");
    }
  }
}