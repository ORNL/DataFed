import React from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button } from '@mui/material';
import { ConfirmChoiceProps } from './types';

export const ConfirmChoiceDialog: React.FC<ConfirmChoiceProps> = ({
  isOpen,
  onClose,
  title,
  message,
  buttons,
  onSelect
}) => {
  return (
    <Dialog open={isOpen} onClose={onClose}>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <div dangerouslySetInnerHTML={{ __html: message }} />
      </DialogContent>
      <DialogActions>
        {buttons.map((label, index) => (
          <Button 
            key={index}
            onClick={() => {
              onSelect(index);
              onClose();
            }}
          >
            {label}
          </Button>
        ))}
      </DialogActions>
    </Dialog>
  );
};
