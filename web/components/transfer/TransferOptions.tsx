import React from 'react';
import { TransferMode } from '../../static/models/transfer-model';

interface TransferOptionsProps {
  mode: typeof TransferMode;
  path: string;
  encrypt: number;
  extension: string;
  origFilename: boolean;
  onPathChange: (value: string) => void;
  onEncryptChange: (value: number) => void;
  onExtensionChange: (value: string) => void;
  onOrigFilenameChange: (value: boolean) => void;
  onTransfer: () => void;
}

export const TransferOptions: React.FC<TransferOptionsProps> = ({
  mode,
  path,
  encrypt,
  extension,
  origFilename,
  onPathChange,
  onEncryptChange,
  onExtensionChange,
  onOrigFilenameChange,
  onTransfer
}) => {
  const isGet = mode === TransferMode.TT_DATA_GET;
  
  return (
    <div className="transfer-options">
      <div className="path-input">
        <label htmlFor="path">{isGet ? "Destination" : "Source"}</label>
        <input
          id="path"
          type="text"
          value={path}
          onChange={(e) => onPathChange(e.target.value)}
        />
      </div>

      <div className="encryption-options">
        <label>Encryption:</label>
        <div>
          <input
            type="radio"
            id="encrypt_none"
            name="encrypt_mode"
            value={0}
            checked={encrypt === 0}
            onChange={() => onEncryptChange(0)}
          />
          <label htmlFor="encrypt_none">None</label>

          <input
            type="radio"
            id="encrypt_avail"
            name="encrypt_mode"
            value={1}
            checked={encrypt === 1}
            onChange={() => onEncryptChange(1)}
          />
          <label htmlFor="encrypt_avail">When Available</label>

          <input
            type="radio"
            id="encrypt_req"
            name="encrypt_mode"
            value={2}
            checked={encrypt === 2}
            onChange={() => onEncryptChange(2)}
          />
          <label htmlFor="encrypt_req">Required</label>
        </div>
      </div>

      {isGet && (
        <div className="filename-options">
          <input
            type="checkbox"
            id="orig_fname"
            checked={origFilename}
            onChange={(e) => onOrigFilenameChange(e.target.checked)}
          />
          <label htmlFor="orig_fname">Use Original Filename</label>
        </div>
      )}

      <div className="extension-override">
        <label htmlFor="ext">Extension Override:</label>
        <input
          id="ext"
          type="text"
          value={extension}
          onChange={(e) => onExtensionChange(e.target.value)}
        />
      </div>

      <div className="actions">
        <button onClick={onTransfer}>Start Transfer</button>
      </div>
    </div>
  );
};
