import React, { useState, useCallback } from 'react';
import * as Dialog from '../../dialogs';
import { AllocationForm } from './AllocationForm';
import { AllocationDialogProps, Allocation } from './types';
import * as api from '../../api';
import * as dlgPickUser from '../../dlg_pick_user';
import * as dlgPickProject from '../../dlg_pick_proj';

const DEFAULT_REC_LIMIT = 1000;

export const AllocationDialog: React.FC<AllocationDialogProps> = ({
    repo,
    allocation,
    excludedIds = [],
    onClose,
    onSave
}) => {
    const [formData, setFormData] = useState<Allocation>(() => ({
        repo,
        id: allocation?.id ?? null,
        dataLimit: allocation?.dataLimit ?? 0,
        dataSize: allocation?.dataSize ?? 0,
        recLimit: allocation?.recLimit ?? DEFAULT_REC_LIMIT
    }));
    const [error, setError] = useState<string>('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleChange = useCallback((field: keyof Allocation, value: any) => {
        setFormData(prev => ({
            ...prev,
            [field]: value
        }));
        setError(''); // Clear error when user makes changes
    }, []);

    const handleSelectUser = useCallback(() => {
        dlgPickUser.show(repo, excludedIds, true, (users) => {
            if (users?.[0]) {
                handleChange('id', users[0]);
            }
        });
    }, [repo, excludedIds, handleChange]);

    const handleSelectProject = useCallback(() => {
        dlgPickProject.show(excludedIds, true, (projects) => {
            if (projects?.[0]) {
                handleChange('id', projects[0]);
            }
        });
    }, [excludedIds, handleChange]);

    const validate = useCallback((): boolean => {
        if (!formData.id) {
            setError('Subject ID cannot be empty');
            return false;
        }
        if (!formData.id.startsWith('u/') && !formData.id.startsWith('p/')) {
            setError('Invalid subject ID (must include u/ or p/ prefix)');
            return false;
        }
        if (formData.dataLimit === 0) {
            setError('Max size cannot be 0');
            return false;
        }
        if (formData.recLimit === 0) {
            setError('Max count cannot be 0');
            return false;
        }
        return true;
    }, [formData]);

    const handleSave = useCallback(async () => {
        if (!validate() || isSubmitting) return;

        setIsSubmitting(true);
        try {
            const apiCall = allocation 
                ? () => api.allocSet(repo, formData.id!, formData.dataLimit, formData.recLimit)
                : () => api.allocCreate(repo, formData.id!, formData.dataLimit, formData.recLimit);

            const result = await apiCall();
            if (result.ok) {
                onSave(formData);
                onClose();
            } else {
                setError(`Allocation ${allocation ? 'update' : 'creation'} failed (${result.data})`);
            }
        } catch (err) {
            setError(`API error: ${err instanceof Error ? err.message : 'Unknown error'}`);
        } finally {
            setIsSubmitting(false);
        }
    }, [repo, formData, allocation, validate, isSubmitting, onSave, onClose]);

    return (
        <Dialog
            title={`${allocation ? 'Edit' : 'Add'} Allocation`}
            onClose={onClose}
            onConfirm={handleSave}
            error={error}
            isSubmitting={isSubmitting}
        >
            <AllocationForm
                allocation={formData}
                isEdit={!!allocation}
                onChange={handleChange}
                onSelectUser={handleSelectUser}
                onSelectProject={handleSelectProject}
                disabled={isSubmitting}
            />
        </Dialog>
    );
};
