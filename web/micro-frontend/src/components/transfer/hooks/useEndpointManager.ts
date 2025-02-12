import { useState, useCallback } from 'react';
import { Services, EndpointData } from '../types/transfer.types';

export function useEndpointManager(services: Services) {
  const [currentEndpoint, setCurrentEndpoint] = useState<EndpointData | null>(null);
  const [endpointList, setEndpointList] = useState<EndpointData[] | null>(null);
  const [searchTokenIterator, setSearchTokenIterator] = useState(0);
  const [currentSearchToken, setCurrentSearchToken] = useState<number | null>(null);

  const searchEndpointAutocomplete = useCallback((
    endpoint: string, 
    searchToken: number
  ) => {
    services.api.epAutocomplete(endpoint, (ok, data) => {
      if (searchToken !== currentSearchToken) return;

      if (ok && data.DATA?.length) {
        const endpoints = data.DATA.map(ep => ({
          ...ep,
          name: ep.canonical_name || ep.id
        }));
        setEndpointList(endpoints);
      } else {
        setEndpointList(null);
        if (data.code) {
          console.error("Autocomplete error:", data);
          services.dialogs.dlgAlert("Globus Error", data.code);
        }
      }
    });
  }, [services, currentSearchToken]);

  const searchEndpoint = useCallback((
    endpoint: string, 
    searchToken: number,
    onEndpointFound: (data: EndpointData) => void
  ) => {
    try {
      services.api.epView(endpoint, (ok, data) => {
        if (searchToken !== currentSearchToken) {
          console.warn("Ignoring stale epView response");
          return;
        }

        if (ok && !data.code) {
          setCurrentEndpoint(data);
          onEndpointFound(data);
        } else {
          console.warn("No direct match, trying autocomplete");
          searchEndpointAutocomplete(endpoint, searchToken);
        }
      });
    } catch (error) {
      services.dialogs.dlgAlert("Globus Error", error as string);
    }
  }, [services, currentSearchToken, searchEndpointAutocomplete]);

  return {
    currentEndpoint,
    endpointList,
    searchTokenIterator,
    currentSearchToken,
    setCurrentSearchToken,
    setSearchTokenIterator,
    searchEndpoint
  };
}
