import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  FormControlLabel,
  Checkbox,
  Typography,
  Grid
} from '@mui/material';
import { styled } from '@mui/material/styles';
import * as api from '../../api';
import * as model from '../../model';
import { AlertDialog } from './AlertDialog';
import { AnnotationDialogProps, FormData } from '../../types/annotation';

const StyledDialogContent = styled(DialogContent)(({ theme }) => ({
  minWidth: 550,
  '& .MuiFormControl-root': {
    marginBottom: theme.spacing(2)
  }
}));

export const AnnotationDialog: React.FC<AnnotationDialogProps> = ({
  isOpen,
  onClose,
  subject,
  annotation,
  newState,
  commentIdx = -1,
  onSubmit
}) => {
  const [formData, setFormData] = useState<FormData>({
    type: 0,
    title: '',
    comment: '',
    activate: false
  });
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (annotation) {
      setFormData(prev => ({
        ...prev,
        type: model.NoteTypeFromString[annotation.type],
        title: annotation.title,
        comment: commentIdx >= 0 ? annotation.comment[commentIdx].comment : ''
      }));
    }
  }, [annotation, commentIdx]);

  const getDialogTitle = () => {
    if (!annotation) return 'New Annotation';
    if (commentIdx === -1) return 'Edit Annotation';
    if (commentIdx != null && commentIdx >= 0) return 'Edit Annotation Comment';
    
    switch (newState) {
      case model.NOTE_OPEN: return 'Reopen Annotation';
      case model.NOTE_CLOSED: return 'Close Annotation';
      case model.NOTE_ACTIVE: return 'Activate Annotation';
      default: return 'Comment on Annotation';
    }
  };

  const handleSubmit = async () => {
    try {
      if (annotation) {
        if (commentIdx === -1 || commentIdx == null) {
          const newType = commentIdx === -1 ? 
            (formData.type !== model.NoteTypeFromString[annotation.type] ? formData.type : null) : 
            null;
          const newTitle = commentIdx === -1 ? 
            (formData.title !== annotation.title ? formData.title : null) : 
            null;

          const response = await api.annotationUpdate(
            annotation.id,
            formData.comment,
            newType,
            commentIdx === null ? newState : null,
            newTitle
          );
          onSubmit(response);
        } else {
          const response = await api.annotationCommentEdit(
            annotation.id,
            formData.comment,
            commentIdx
          );
          onSubmit(response);
        }
      } else {
        const response = await api.annotationCreate(
          subject,
          formData.type,
          formData.title,
          formData.comment,
          formData.activate
        );
        onSubmit(response);
      }
      onClose();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      <Dialog open={isOpen} onClose={onClose} maxWidth="md">
        <DialogTitle>{getDialogTitle()}</DialogTitle>
        <StyledDialogContent>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <Typography>
                Subject: {subject.charAt(0) === 'c' ? 'Collection' : 'Data Record'} '{subject}'
              </Typography>
            </Grid>
            
            {annotation && (
              <Grid item xs={12}>
                <Typography>ID: {annotation.id}</Typography>
              </Grid>
            )}

            <Grid item xs={12}>
              <FormControl fullWidth disabled={annotation && (newState === model.NOTE_CLOSED || commentIdx !== -1)}>
                <InputLabel>Type</InputLabel>
                <Select
                  value={formData.type}
                  onChange={(e) => setFormData(prev => ({ ...prev, type: Number(e.target.value) }))}
                >
                  <MenuItem value={0}>Question</MenuItem>
                  <MenuItem value={1}>Information</MenuItem>
                  <MenuItem value={2}>Warning</MenuItem>
                  <MenuItem value={3}>Error</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12}>
              <TextField
                label="Title"
                required
                fullWidth
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                disabled={commentIdx !== -1}
                inputProps={{ maxLength: 80 }}
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                label="Comment"
                required
                fullWidth
                multiline
                rows={8}
                value={formData.comment}
                onChange={(e) => setFormData(prev => ({ ...prev, comment: e.target.value }))}
                inputProps={{ maxLength: 2000 }}
              />
            </Grid>

            {!annotation && (
              <Grid item xs={12}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={formData.activate}
                      onChange={(e) => setFormData(prev => ({ ...prev, activate: e.target.checked }))}
                    />
                  }
                  label="Activate on open"
                />
              </Grid>
            )}
          </Grid>
        </StyledDialogContent>
        
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button 
            onClick={handleSubmit}
            variant="contained"
            disabled={!formData.title.trim() || !formData.comment.trim()}
          >
            Ok
          </Button>
        </DialogActions>
      </Dialog>

      <AlertDialog
        isOpen={!!error}
        onClose={() => setError('')}
        title="Server Error"
        message={error}
      />
    </>
  );
};
