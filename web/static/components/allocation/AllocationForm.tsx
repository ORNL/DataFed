import React from 'react';
import { Button, Input } from '@mui/material';
import { parseSize } from '../../util';
import { AllocationFormProps } from './types';

export const AllocationForm: React.FC<AllocationFormProps> = ({
    allocation,
    isEdit,
    onChange,
    onSelectUser,
    onSelectProject
}) => {
    const handleChange = (field: string, value: string) => {
        if (field === 'dataLimit') {
            const parsed = parseSize(value);
            if (parsed !== null) {
                onChange('dataLimit', parsed);
            }
        } else if (field === 'recLimit') {
            const parsed = parseInt(value);
            if (!isNaN(parsed)) {
                onChange('recLimit', parsed);
            }
        } else {
            onChange(field as keyof typeof allocation, value);
        }
    };

    return (
        <div className="allocation-form">
            <div className="form-row">
                <label>{allocation.id?.startsWith('p/') ? 'Project ID:' : 'User ID:'}</label>
                <Input
                    value={allocation.id || ''}
                    onChange={(e) => handleChange('id', e.target.value)}
                    disabled={isEdit}
                />
                {!isEdit && (
                    <div className="button-group">
                        <Button onClick={onSelectUser}>Users</Button>
                        <Button onClick={onSelectProject}>Projects</Button>
                    </div>
                )}
            </div>
            <div className="form-row">
                <label>Max. Data Size:</label>
                <Input
                    value={allocation.dataLimit.toString()}
                    onChange={(e) => handleChange('dataLimit', e.target.value)}
                />
            </div>
            <div className="form-row">
                <label>Total Data Size:</label>
                <Input
                    value={allocation.dataSize.toString()}
                    disabled
                />
            </div>
            <div className="form-row">
                <label>Max. Rec. Count:</label>
                <Input
                    value={allocation.recLimit.toString()}
                    onChange={(e) => handleChange('recLimit', e.target.value)}
                />
            </div>
        </div>
    );
};
