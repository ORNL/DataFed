import React from 'react';
import ReactDOM from 'react-dom';
import { AllocationDialog } from './components/dialogs/AllocationDialog';
import { Allocation } from './components/allocation/types';

export function show(repo: string, allocation: Allocation | null, excludedIds: string[], onSave: (allocation: Allocation) => void): void {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const handleClose = () => {
        ReactDOM.unmountComponentAtNode(container);
        document.body.removeChild(container);
    };

    ReactDOM.render(
        <AllocationDialog
            repo={repo}
            allocation={allocation}
            excludedIds={excludedIds}
            onClose={handleClose}
            onSave={onSave}
        />,
        container
    );
}
