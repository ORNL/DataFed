export interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
}

export interface ConfirmChoiceProps extends DialogProps {
  message: string;
  buttons: string[];
  onSelect: (index: number) => void;
}

export interface SingleEntryProps extends DialogProps {
  label: string;
  buttons: string[];
  onSubmit: (index: number, value: string) => void;
}

export interface AlertProps extends DialogProps {
  message: string;
  onConfirm?: () => void;
}

export interface DataEditDialogProps extends DialogProps {
  mode: 'new' | 'edit' | 'duplicate';
  data?: any; // TODO: Add proper type
  parent?: string;
  updatePermissions?: number;
  onSave: (data: any, parentCollection: string) => void;
}
