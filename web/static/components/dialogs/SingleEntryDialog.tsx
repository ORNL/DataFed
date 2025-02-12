import React, { useState } from 'react';
import { 
  Dialog, 
  DialogTitle, 
  DialogContent,
  DialogActions,
  Button,
  TextField
} from '@mui/material';
import { SingleEntryProps } from './types';

export const SingleEntryDialog: React.FC<SingleEntryProps> = ({
  isOpen,
  onClose,
  title,
  label,
  buttons,
  onSubmit
}) => {
  const [value, setValue] = useState('');

  return (
    <Dialog open={isOpen} onClose={onClose}>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <TextField
          fullWidth
          label={label}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          margin="normal"
        />
      </DialogContent>
      <DialogActions>
        {buttons.map((label, index) => (
          <Button
            key={index}
            onClick={() => {
              onSubmit(index, value);
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
