import React from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Select, MenuItem, Typography } from '@mui/material';
import * as util from '../../util.js';

interface Allocation {
  repo: string;
  dataSize: number;
  dataLimit: number;
}

interface OwnerChangeDialogProps {
  open: boolean;
  currentOwner: string;
  newOwner: string;
  reply: {
    totCnt: number;
    actSize: number;
    alloc: Allocation[];
  };
  onClose: () => void;
  onConfirm: (selectedAllocation: string) => void;
}

export const OwnerChangeDialog: React.FC<OwnerChangeDialogProps> = ({
  open,
  currentOwner,
  newOwner,
  reply,
  onClose,
  onConfirm
}) => {
  const [selectedAllocation, setSelectedAllocation] = React.useState<string>('');

  const handleConfirm = () => {
    onConfirm(selectedAllocation);
    onClose();
  };

  return (
    <Dialog 
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle>Confirm Record Owner Change</DialogTitle>
      <DialogContent>
        <Typography paragraph>
          This operation will initiate a background task to transfer ownership of {reply.totCnt} record(s) with {util.sizeToString(reply.actSize)} of raw data from current the owner, '{currentOwner}', to the new owner, '{newOwner}'.
        </Typography>
        
        <Typography>Select destination allocation:</Typography>
        <Select
          fullWidth
          value={selectedAllocation}
          onChange={(e) => setSelectedAllocation(e.target.value as string)}
        >
          {reply.alloc.map((alloc) => {
            const free = Math.max(
              Math.floor((10000 * (alloc.dataLimit - alloc.dataSize)) / alloc.dataLimit) / 100,
              0
            );
            return (
              <MenuItem key={alloc.repo} value={alloc.repo}>
                {`${alloc.repo.substr(5)} -- ${util.sizeToString(alloc.dataSize)} used of ${util.sizeToString(alloc.dataLimit)} total, ${free}% free`}
              </MenuItem>
            );
          })}
        </Select>

        <Typography 
          sx={{ mt: 2 }}
          color="text.secondary"
          variant="body2"
        >
          Note: pending transfers may impact space available on destination allocation.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button 
          onClick={handleConfirm}
          disabled={!selectedAllocation}
          variant="contained"
        >
          Ok
        </Button>
      </DialogActions>
    </Dialog>
  );
};
