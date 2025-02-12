import React from 'react';
import { TransferMode } from '../../static/models/transfer-model';

interface ModeSpecificOptionsProps {
  mode: TransferMode;
  onExtensionChange?: (value: string) => void;
  onOrigFilenameChange?: (checked: boolean) => void;
}

export const ModeSpecificOptions: React.FC<ModeSpecificOptionsProps> = ({ 
  mode, 
  onExtensionChange,
  onOrigFilenameChange 
}) => {
  if (mode === TransferMode.TT_DATA_GET) {
    return (
      <div>
        <br />
        File extension override: 
        <input 
          id='ext' 
          type='text' 
          onChange={(e) => onExtensionChange?.(e.target.value)}
        />
        <br />
      </div>
    );
  } else if (mode === TransferMode.TT_DATA_PUT) {
    return (
      <div>
        <br />
        <label htmlFor='orig_fname'>Download to original filename(s)</label>
        <input 
          id='orig_fname' 
          type='checkbox'
          onChange={(e) => onOrigFilenameChange?.(e.target.checked)} 
        />
      </div>
    );
  }
  return null;
};

interface TransferOptionsProps {
  mode: TransferMode;
  onEncryptionChange: (value: string) => void;
  onExtensionChange?: (value: string) => void;
  onOrigFilenameChange?: (checked: boolean) => void;
}

export const TransferOptions: React.FC<TransferOptionsProps> = ({
  mode,
  onEncryptionChange,
  onExtensionChange,
  onOrigFilenameChange
}) => (
  <div>
    <br />
    Transfer Encryption:&nbsp;
    <input 
      type='radio' 
      id='encrypt_none' 
      name='encrypt_mode' 
      value='0'
      onChange={(e) => onEncryptionChange(e.target.value)}
    />
    <label htmlFor='encrypt_none'>None</label>&nbsp;
    <input 
      type='radio' 
      id='encrypt_avail' 
      name='encrypt_mode' 
      value='1' 
      defaultChecked
      onChange={(e) => onEncryptionChange(e.target.value)}
    />
    <label htmlFor='encrypt_avail'>If Available</label>&nbsp;
    <input 
      type='radio' 
      id='encrypt_req' 
      name='encrypt_mode' 
      value='2'
      onChange={(e) => onEncryptionChange(e.target.value)}
    />
    <label htmlFor='encrypt_req'>Required</label>
    <br />
    <ModeSpecificOptions 
      mode={mode}
      onExtensionChange={onExtensionChange}
      onOrigFilenameChange={onOrigFilenameChange}
    />
  </div>
);
