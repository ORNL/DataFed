import React, { useState, useCallback } from 'react';
import { TransferMode } from '../../static/models/transfer-model';
import { TransferOptions } from './TransferTemplates';
import { dlgAlert } from '../../static/dialogs';

interface TransferDialogProps {
  mode: typeof TransferMode;
  onClose: () => void;
  onTransfer: (config: TransferConfig) => void;
}

interface TransferConfig {
  path: string;
  encryption: string;
  extension?: string;
  origFilename?: boolean;
}

export const TransferDialog: React.FC<TransferDialogProps> = ({
  mode,
  onClose,
  onTransfer
}) => {
  const [path, setPath] = useState('');
  const [encryption, setEncryption] = useState('1');
  const [extension, setExtension] = useState('');
  const [origFilename, setOrigFilename] = useState(false);

  const handleTransfer = useCallback(() => {
    if (!path.trim()) {
      dlgAlert("Input Error", "Path cannot be empty.");
      return;
    }

    onTransfer({
      path: path.trim(),
      encryption,
      extension: extension.trim(),
      origFilename
    });
  }, [path, encryption, extension, origFilename, onTransfer]);

  const labels = {
    record: mode === TransferMode.TT_DATA_GET ? 'Source' : 'Destination',
    endpoint: mode === TransferMode.TT_DATA_GET ? 'Destination' : 'Source'
  };

  return (
    <div className='ui-widget' style={{ height: '95%' }}>
      {labels.record}: <span id='title'></span><br />
      <div className='col-flex' style={{ height: '100%' }}>
        <div id='records' className='ui-widget ui-widget-content' 
             style={{ flex: '1 1 auto', display: 'none', height: '6em', overflow: 'auto' }}>
        </div>
        <div style={{ flex: 'none' }}>
          <br />
          <span>{labels.endpoint} Path:</span>
          <div style={{ display: 'flex', alignItems: 'flex-start' }}>
            <textarea 
              className='ui-widget-content'
              rows={3}
              style={{ width: '100%', resize: 'none' }}
              value={path}
              onChange={(e) => setPath(e.target.value)}
            />
            <button 
              className='btn small'
              style={{ marginLeft: '10px', lineHeight: '1.5', verticalAlign: 'top' }}
              disabled
            >
              Browse
            </button>
          </div>
          <br />
          <select 
            className='ui-widget-content ui-widget'
            size={7}
            style={{ width: '100%' }}
            disabled
          >
            <option disabled selected>No Matches</option>
          </select>
          <TransferOptions 
            mode={mode}
            onEncryptionChange={setEncryption}
            onExtensionChange={setExtension}
            onOrigFilenameChange={setOrigFilename}
          />
        </div>
      </div>
      <div className="dialog-buttons">
        <button onClick={onClose}>Cancel</button>
        <button onClick={handleTransfer}>Start</button>
      </div>
    </div>
  );
};
