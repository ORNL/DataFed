import { TransferMode } from '../../../static/models/transfer-model';

export interface Services {
  dialogs: {
    dlgAlert: (title: string, message: string) => void;
  };
  api: {
    epView: (endpoint: string, callback: (ok: boolean, data: EndpointData) => void) => void;
    epAutocomplete: (endpoint: string, callback: (ok: boolean, data: EndpointData) => void) => void;
    xfrStart: (
      ids: string[], 
      mode: TransferMode, 
      path: string, 
      extension: string, 
      encrypt: number, 
      origFilename: boolean, 
      callback: (ok: boolean, data: any) => void
    ) => void;
  };
}

export interface EndpointData {
  id: string;
  canonical_name?: string;
  name?: string;
  description?: string;
  display_name?: string;
  DATA?: EndpointData[];
  code?: string;
}

export interface TransferConfig {
  path: string;
  encryption: string;
  extension?: string;
  origFilename?: boolean;
}

export interface TransferState {
  path: string;
  encrypt: number;
  extension: string;
  origFilename: boolean;
}
