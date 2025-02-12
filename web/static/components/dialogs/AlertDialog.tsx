import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button
} from '@mui/material';
import { AlertProps } from './types';

export const AlertDialog: React.FC<AlertProps> = ({
  isOpen,
  onClose,
  title,
  message,
  onConfirm
}) => {
  const handleConfirm = () => {
    onConfirm?.();
    onClose();
  };

  return (
    <Dialog open={isOpen} onClose={onClose}>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <div dangerouslySetInnerHTML={{ __html: message }} />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleConfirm}>Ok</Button>
      </DialogActions>
    </Dialog>
  );
};

export const AlertPermDenied: React.FC<Omit<AlertProps, 'title' | 'message'>> = (props) => (
  <AlertDialog
    {...props}
    title="Cannot Perform Action"
    message="Permission Denied."
  />
);
