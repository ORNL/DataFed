import { NoteState, NoteType } from '../model';

export interface Annotation {
  id: string;
  type: NoteType;
  title: string;
  comment: Array<{
    comment: string;
  }>;
}

export interface AnnotationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  subject: string;
  annotation?: Annotation;
  newState?: NoteState;
  commentIdx?: number;
  onSubmit: (data: any) => void;
}

export interface FormData {
  type: number;
  title: string;
  comment: string;
  activate: boolean;
}
