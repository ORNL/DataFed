import React, { useState, useEffect, useCallback } from 'react';
import { TransferMode } from '../../static/models/transfer-model';
import { show } from '../endpoint-browse';
import { setStatusText } from '../../static/util';
import { TransferOptions } from './TransferTemplates';

interface Services {
  api: {
    epView: (id: string, callback: (ok: boolean, data: any) => void) => void;
    xfrStart: (ids: string[], mode: TransferMode, path: string, extension: string, encrypt: number, origFilename: boolean, callback: (ok: boolean, data: any) => void) => void;
  };
  dialogs: {
    dlgAlert: (title: string, message: string) => void;
  };
}

interface Controller {
  model: {
    mode: TransferMode;
    records: any[];
  };
  endpointManager: {
    currentSearchToken: number;
    searchTokenIterator: number;
    currentEndpoint: any;
    handlePathInput: (token: number) => void;
  };
  ids?: string[];
  callback?: (path?: string, encrypt?: number) => void;
}

interface TransferUIManagerProps {
  controller: Controller;
  services: Services;
}

interface TransferState {
  recordTree: any;
  path: string;
  encrypt: number;
  extension: string;
  origFilename: boolean;
  inputTimer: NodeJS.Timeout | null;
}

export const TransferUIManager: React.FC<TransferUIManagerProps> = ({ controller, services }) => {
  const [state, setState] = useState<TransferState>({
    recordTree: null,
    path: '',
    encrypt: 1,
    extension: '',
    origFilename: false,
    inputTimer: null
  });

  const handlePathInput = useCallback((value: string) => {
    if (state.inputTimer) {
      clearTimeout(state.inputTimer);
    }

    const timer = setTimeout(() => {
      controller.endpointManager.currentSearchToken = ++controller.endpointManager.searchTokenIterator;
      controller.endpointManager.handlePathInput(controller.endpointManager.currentSearchToken);
    }, 250);

    setState(prev => ({
      ...prev,
      path: value,
      inputTimer: timer
    }));
  }, [controller.endpointManager, state.inputTimer]);

  const handleTransfer = useCallback(() => {
    if (!state.path.trim()) {
      services.dialogs.dlgAlert("Input Error", "Path cannot be empty.");
      return;
    }

    const config = {
      path: state.path.trim(),
      encrypt: state.encrypt,
      origFilename: state.origFilename,
      extension: state.extension.trim()
    };

    if (controller.model.mode === TransferMode.TT_DATA_GET || 
        controller.model.mode === TransferMode.TT_DATA_PUT) {
      const ids = controller.ids || [];
      services.api.xfrStart(
        ids,
        controller.model.mode,
        config.path,
        config.extension,
        config.encrypt,
        config.origFilename,
        (ok, data) => {
          if (ok) {
            setStatusText(`Task '${data.task.id}' created for data transfer.`);
            controller.callback?.();
          } else {
            services.dialogs.dlgAlert("Transfer Error", data);
          }
        }
      );
    } else {
      controller.callback?.(config.path, config.encrypt);
    }
  }, [state, controller, services]);

  useEffect(() => {
    return () => {
      if (state.inputTimer) {
        clearTimeout(state.inputTimer);
      }
    };
  }, [state.inputTimer]);

  return (
    <div className="transfer-ui-manager">
      <TransferOptions 
        mode={controller.model.mode}
        path={state.path}
        encrypt={state.encrypt}
        extension={state.extension}
        origFilename={state.origFilename}
        onPathChange={handlePathInput}
        onEncryptChange={(value) => setState(prev => ({ ...prev, encrypt: value }))}
        onExtensionChange={(value) => setState(prev => ({ ...prev, extension: value }))}
        onOrigFilenameChange={(value) => setState(prev => ({ ...prev, origFilename: value }))}
        onTransfer={handleTransfer}
      />
    </div>
  );
};
