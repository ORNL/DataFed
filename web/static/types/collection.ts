export interface CollectionData {
    id: string;
    title: string;
    alias?: string;
    desc?: string;
    topic?: string;
    tags?: string[];
    parentId?: string;
}

export interface CollectionDialogProps {
    data?: CollectionData;
    parent?: string;
    updatePermissions?: number;
    onClose: () => void;
    onSave: (collection: CollectionData) => void;
    isOpen: boolean;
}

export interface FormData {
    title: string;
    alias: string;
    description: string;
    tags: string[];
    parentId: string;
    isPublic: boolean;
    topic: string;
}
