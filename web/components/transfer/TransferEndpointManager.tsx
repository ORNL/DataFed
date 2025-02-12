import React, { useState, useEffect, useCallback } from 'react';
import { TransferMode } from '../../static/models/transfer-model';

interface EndpointData {
  id: string;
  canonical_name?: string;
  name?: string;
  description?: string;
  display_name?: string;
  DATA?: EndpointData[];
  code?: string;
}

interface Services {
  api: {
    epView: (endpoint: string, callback: (ok: boolean, data: EndpointData) => void) => void;
    epAutocomplete: (endpoint: string, callback: (ok: boolean, data: EndpointData) => void) => void;
  };
  dialogs: {
    dlgAlert: (title: string, message: string) => void;
  };
}

interface UIManager {
  state: {
    frame: HTMLElement;
  };
  enableBrowseButton: (enabled: boolean) => void;
  enableStartButton: (enabled: boolean) => void;
  handleSelectedEndpoint: (data: EndpointData) => void;
}

interface Controller {
  uiManager: UIManager;
  model: {
    mode: TransferMode;
  };
}

interface TransferEndpointManagerProps {
  controller: Controller;
  services: Services;
}

export const TransferEndpointManager: React.FC<TransferEndpointManagerProps> = ({ 
  controller, 
  services 
}) => {
  const [initialized, setInitialized] = useState(false);
  const [currentEndpoint, setCurrentEndpoint] = useState<EndpointData | null>(null);
  const [endpointList, setEndpointList] = useState<EndpointData[] | null>(null);
  const [searchTokenIterator, setSearchTokenIterator] = useState(0);
  const [currentSearchToken, setCurrentSearchToken] = useState<number | null>(null);

  const searchEndpointAutocomplete = useCallback((endpoint: string, searchToken: number) => {
    services.api.epAutocomplete(endpoint, (ok, data) => {
      if (searchToken !== currentSearchToken) {
        return;
      }

      if (ok && data.DATA && data.DATA.length) {
        const endpoints = data.DATA.map(ep => ({
          ...ep,
          name: ep.canonical_name || ep.id
        }));
        setEndpointList(endpoints);
      } else {
        console.warn("No matches found");
        setEndpointList(null);
        if (data.code) {
          console.error("Autocomplete error:", data);
          services.dialogs.dlgAlert("Globus Error", data.code);
        }
      }
    });
  }, [services, currentSearchToken]);

  const searchEndpoint = useCallback((endpoint: string, searchToken: number) => {
    console.info("Searching for endpoint:", endpoint);

    try {
      return services.api.epView(endpoint, (ok, data) => {
        if (searchToken !== currentSearchToken) {
          console.warn("Ignoring stale epView response");
          return;
        }

        if (ok && !data.code) {
          console.info("Direct endpoint match found:", data);
          controller.uiManager.enableBrowseButton(true);
          controller.uiManager.handleSelectedEndpoint(data);
        } else {
          console.warn("No direct match, trying autocomplete");
          searchEndpointAutocomplete(endpoint, searchToken);
        }
      });
    } catch (error) {
      services.dialogs.dlgAlert("Globus Error", error as string);
    }
  }, [services, controller, currentSearchToken, searchEndpointAutocomplete]);

  const handlePathInput = useCallback((path: string) => {
    if (!initialized) {
      console.warn("Dialog not yet initialized - delaying path input handling");
      setTimeout(() => handlePathInput(path), 100);
      return;
    }

    const newSearchToken = searchTokenIterator + 1;
    setSearchTokenIterator(newSearchToken);
    setCurrentSearchToken(newSearchToken);

    if (!path || !path.length) {
      setEndpointList(null);
      setCurrentEndpoint(null);
      controller.uiManager.enableStartButton(false);
      controller.uiManager.enableBrowseButton(false);
      return;
    }

    const endpoint = path.split("/")[0];
    console.info(
      "Extracted endpoint:",
      endpoint,
      "Current endpoint:",
      currentEndpoint?.name
    );

    if (endpoint && (!currentEndpoint || endpoint !== currentEndpoint.name)) {
      console.info("Endpoint changed or not set - searching for new endpoint");
      searchEndpoint(endpoint, newSearchToken);
    }
  }, [
    initialized, 
    searchTokenIterator, 
    currentEndpoint, 
    controller, 
    searchEndpoint
  ]);

  useEffect(() => {
    setInitialized(true);
    return () => setInitialized(false);
  }, []);

  return (
    <div className="transfer-endpoint-manager">
      {/* The component manages endpoint state and interactions */}
      {/* UI elements are rendered by parent components */}
    </div>
  );
};
