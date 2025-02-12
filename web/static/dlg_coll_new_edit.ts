import React from 'react';
import ReactDOM from 'react-dom';
import { CollectionDialog } from './components/collection/CollectionDialog';
import * as api from './api';
import { CollectionData } from './types/collection';

export function show(data?: CollectionData, parent?: string, updatePerms?: number, callback?: (collection: CollectionData) => void) {
    // Create container for dialog
    const container = document.createElement('div');
    container.id = `${data ? data.id.replace('/', '_') : 'c_new'}_edit`;
    document.body.appendChild(container);

    const handleClose = () => {
        ReactDOM.unmountComponentAtNode(container);
        container.remove();
    };

    const handleSave = async (collection: CollectionData) => {
        try {
            const response = data 
                ? await api.collUpdate(collection)
                : await api.collCreate(collection);
                
            if (response.ok) {
                if (callback) {
                    callback(response.coll[0]);
                }
                handleClose();
            }
        } catch (error) {
            console.error('Failed to save collection:', error);
        }
    };

    ReactDOM.render(
        <CollectionDialog
            data={data}
            parent={parent}
            updatePermissions={updatePerms}
            onClose={handleClose}
            onSave={handleSave}
            isOpen={true}
        />,
        container
    );
}
