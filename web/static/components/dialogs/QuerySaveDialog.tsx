import React, { useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField } from '@mui/material';

interface QuerySaveDialogProps {
  query: string;
  id?: string;
  title?: string;
  onSave: (title: string, update: boolean) => void;
}

const QuerySaveDialog: React.FC<QuerySaveDialogProps> = ({ query, id, title, onSave }) => {
  const [open, setOpen] = useState(true);
  const [queryTitle, setQueryTitle] = useState(title || '');

  const handleClose = () => {
    setOpen(false);
  };

  const handleSave = (update: boolean) => {
    if (!queryTitle.trim()) {
      alert("Input Error: Title cannot be empty");
      return;
    }
    onSave(queryTitle, update);
    handleClose();
  };

  return (
    <Dialog open={open} onClose={handleClose}>
      <DialogTitle>Save Search</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          margin="dense"
          id="dlg_qry_title"
          label="Search Title"
          type="text"
          fullWidth
          value={queryTitle}
          onChange={(e) => setQueryTitle(e.target.value)}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} color="primary">
          Cancel
        </Button>
        {id && (
          <Button onClick={() => handleSave(true)} color="primary">
            Update
          </Button>
        )}
        <Button onClick={() => handleSave(false)} color="primary">
          {id ? "Save As" : "Save"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default QuerySaveDialog;
