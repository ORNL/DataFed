import React, { createContext, useContext, useReducer, ReactNode } from 'react';
import { TransferState, TransferConfig } from '../types/transfer.types';
import { TransferMode } from '../../../static/models/transfer-model';

interface TransferContextState extends TransferState {
  mode: TransferMode;
  isInitialized: boolean;
}

type TransferAction = 
  | { type: 'SET_PATH'; payload: string }
  | { type: 'SET_ENCRYPT'; payload: number }
  | { type: 'SET_EXTENSION'; payload: string }
  | { type: 'SET_ORIG_FILENAME'; payload: boolean }
  | { type: 'SET_INITIALIZED'; payload: boolean };

const initialState: TransferContextState = {
  path: '',
  encrypt: 1,
  extension: '',
  origFilename: false,
  mode: TransferMode.TT_DATA_GET,
  isInitialized: false
};

const TransferContext = createContext<{
  state: TransferContextState;
  dispatch: React.Dispatch<TransferAction>;
} | undefined>(undefined);

function transferReducer(state: TransferContextState, action: TransferAction): TransferContextState {
  switch (action.type) {
    case 'SET_PATH':
      return { ...state, path: action.payload };
    case 'SET_ENCRYPT':
      return { ...state, encrypt: action.payload };
    case 'SET_EXTENSION':
      return { ...state, extension: action.payload };
    case 'SET_ORIG_FILENAME':
      return { ...state, origFilename: action.payload };
    case 'SET_INITIALIZED':
      return { ...state, isInitialized: action.payload };
    default:
      return state;
  }
}

export function TransferProvider({ children, mode }: { children: ReactNode; mode: TransferMode }) {
  const [state, dispatch] = useReducer(transferReducer, { ...initialState, mode });

  return (
    <TransferContext.Provider value={{ state, dispatch }}>
      {children}
    </TransferContext.Provider>
  );
}

export function useTransfer() {
  const context = useContext(TransferContext);
  if (context === undefined) {
    throw new Error('useTransfer must be used within a TransferProvider');
  }
  return context;
}
