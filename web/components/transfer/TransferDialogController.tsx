import React from 'react';
import { TransferProvider } from './context/TransferContext';
import { TransferDialog } from './TransferDialog';
import { Services } from './types/transfer.types';
import { TransferMode } from '../../static/models/transfer-model';

interface TransferDialogControllerProps {
  mode: TransferMode;
  ids: string[];
  onComplete: (config?: { path: string; encrypt: number }) => void;
  services: Services;
}

export const TransferDialogController: React.FC<TransferDialogControllerProps> = ({
  mode,
  ids,
  onComplete,
  services
}) => {
  const handleError = (error: Error) => {
    console.error("Transfer dialog error:", error);
    services.dialogs.dlgAlert("Error", "Failed to process transfer operation");
  };

  return (
    <TransferProvider mode={mode}>
      <TransferDialog
        mode={mode}
        ids={ids}
        onComplete={onComplete}
        services={services}
        onError={handleError}
      />
    </TransferProvider>
  );
};
