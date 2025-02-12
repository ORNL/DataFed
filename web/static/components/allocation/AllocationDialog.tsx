import React, { useState } from 'react';
import { Dialog } from '../common/Dialog';
import { AllocationForm } from './AllocationForm';
import { AllocationDialogProps, Allocation } from './types';
import * as api from '../../api';
import * as dlgPickUser from '../user/UserPickerDialog';
import * as dlgPickProject from '../project/ProjectPickerDialog';

export const AllocationDialog: React.FC<AllocationDialogProps> = ({
    repo,
    allocation,
    excludedIds = [],
    onClose,
    onSave
}) => {
    const [formData, setFormData] = useState<Allocation>(
        allocation || {
            repo,
            id: null,
            dataLimit: 0,
            dataSize: 0,
            recLimit: 1000
        }
    );
    const [error, setError] = useState<string>('');

    const handleChange = (field: keyof Allocation, value: any) => {
        setFormData(prev => ({
            ...prev,
            [field]: value
        }));
    };

    const handleSelectUser = () => {
        dlgPickUser.show(repo, excludedIds, true, (users) => {
            if (users?.[0]) {
                handleChange('id', users[0]);
            }
        });
    };

    const handleSelectProject = () => {
        dlgPickProject.show(excludedIds, true, (projects) => {
            if (projects?.[0]) {
                handleChange('id', projects[0]);
            }
        });
    };

    const validate = (): boolean => {
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
    };

    const handleSave = async () => {
        if (!validate()) return;

        const apiCall = allocation 
            ? () => api.allocSet(repo, formData.id!, formData.dataLimit, formData.recLimit)
            : () => api.allocCreate(repo, formData.id!, formData.dataLimit, formData.recLimit);

        try {
            const result = await apiCall();
            if (result.ok) {
                onSave(formData);
                onClose();
            } else {
                setError(`Allocation ${allocation ? 'update' : 'creation'} failed (${result.data})`);
            }
        } catch (err) {
            setError(`API error: ${err.message}`);
        }
    };

    return (
        <Dialog
            title={`${allocation ? 'Edit' : 'Add'} Allocation`}
            onClose={onClose}
            onConfirm={handleSave}
            error={error}
        >
            <AllocationForm
                allocation={formData}
                isEdit={!!allocation}
                onChange={handleChange}
                onSelectUser={handleSelectUser}
                onSelectProject={handleSelectProject}
            />
        </Dialog>
    );
};
