export interface Allocation {
    repo: string;
    id: string | null;
    dataLimit: number;
    dataSize: number;
    recLimit: number;
}

export interface AllocationDialogProps {
    repo: string;
    allocation?: Allocation;
    excludedIds?: string[];
    onClose: () => void;
    onSave: (allocation: Allocation) => void;
}

export interface AllocationFormProps {
    allocation: Allocation;
    isEdit: boolean;
    onChange: (field: keyof Allocation, value: any) => void;
    onSelectUser: () => void;
    onSelectProject: () => void;
}
