import React, { useState, useEffect } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    Button,
    RadioGroup,
    FormControlLabel,
    Radio,
    Box
} from '@mui/material';
import { AlertDialog } from '../dialogs/AlertDialog';
import { TopicPicker } from '../topic/TopicPicker';
import { TagInput } from '../common/TagInput';
import * as model from '../../model';
import * as util from '../../util';
import { CollectionDialogProps, FormData } from '../../types/collection';

export const CollectionDialog: React.FC<CollectionDialogProps> = ({
    data,
    parent,
    updatePermissions,
    onClose,
    onSave,
    isOpen
}) => {
    const [formData, setFormData] = useState<FormData>({
        title: '',
        alias: '',
        description: '',
        tags: [],
        parentId: parent || '',
        isPublic: false,
        topic: ''
    });

    const [showError, setShowError] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    useEffect(() => {
        if (data) {
            setFormData({
                title: data.title || '',
                alias: data.alias || '',
                description: data.desc || '',
                tags: data.tags || [],
                parentId: data.parentId || '',
                isPublic: !!data.topic,
                topic: data.topic || ''
            });
        }
    }, [data]);

    const handleChange = (field: keyof FormData) => (
        event: React.ChangeEvent<HTMLInputElement>
    ) => {
        setFormData(prev => ({
            ...prev,
            [field]: event.target.value
        }));
    };

    const handleSubmit = () => {
        if (formData.isPublic && !formData.topic) {
            setErrorMessage('Category is required for public data.');
            setShowError(true);
            return;
        }

        const updatedData = {
            ...(data && { id: data.id }),
            title: formData.title,
            alias: formData.alias,
            desc: formData.description,
            topic: formData.isPublic ? formData.topic : undefined,
            tags: formData.tags,
            ...(formData.parentId && { parentId: formData.parentId })
        };

        onSave(updatedData);
    };

    const isDisabled = (field: string): boolean => {
        if (!data) return false;
        if (field === 'topic') return !formData.isPublic;
        return (updatePermissions & model.PERM_WR_REC) === 0;
    };

    return (
        <>
            <Dialog 
                open={isOpen} 
                onClose={onClose}
                maxWidth="md"
                fullWidth
            >
                <DialogTitle>
                    {data ? `Edit Collection ${data.id}` : 'New Collection'}
                </DialogTitle>
                <DialogContent>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
                        <TextField
                            label="Title"
                            required
                            value={formData.title}
                            onChange={handleChange('title')}
                            disabled={isDisabled('title')}
                            fullWidth
                        />
                        
                        <TextField
                            label="Alias"
                            value={formData.alias}
                            onChange={handleChange('alias')}
                            disabled={isDisabled('alias')}
                            fullWidth
                        />
                        
                        <TextField
                            label="Description"
                            multiline
                            rows={5}
                            value={formData.description}
                            onChange={handleChange('description')}
                            disabled={isDisabled('description')}
                            fullWidth
                        />
                        
                        <TagInput
                            tags={formData.tags}
                            onChange={(tags) => setFormData(prev => ({ ...prev, tags }))}
                            disabled={isDisabled('tags')}
                        />
                        
                        {!data && (
                            <TextField
                                label="Parent"
                                required
                                value={formData.parentId}
                                onChange={handleChange('parentId')}
                                fullWidth
                            />
                        )}
                        
                        <RadioGroup
                            value={formData.isPublic ? 'public' : 'private'}
                            onChange={(e) => setFormData(prev => ({
                                ...prev,
                                isPublic: e.target.value === 'public',
                                topic: e.target.value === 'private' ? '' : prev.topic
                            }))}
                        >
                            <FormControlLabel 
                                value="private" 
                                control={<Radio />} 
                                label="Private" 
                            />
                            <FormControlLabel 
                                value="public" 
                                control={<Radio />} 
                                label="Public" 
                            />
                        </RadioGroup>
                        
                        <Box sx={{ display: 'flex', gap: 1 }}>
                            <TextField
                                label="Category"
                                value={formData.topic}
                                onChange={handleChange('topic')}
                                disabled={!formData.isPublic || isDisabled('topic')}
                                fullWidth
                            />
                            <TopicPicker
                                disabled={!formData.isPublic || isDisabled('topic')}
                                onSelect={(topic) => setFormData(prev => ({
                                    ...prev,
                                    topic
                                }))}
                            />
                        </Box>
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSubmit} variant="contained">
                        {data ? 'Update' : 'Create'}
                    </Button>
                </DialogActions>
            </Dialog>

            <AlertDialog
                isOpen={showError}
                onClose={() => setShowError(false)}
                title="Data Entry Error"
                message={errorMessage}
            />
        </>
    );
};
