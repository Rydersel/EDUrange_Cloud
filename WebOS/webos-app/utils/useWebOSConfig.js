import { useState, useEffect } from 'react';

/**
 * Custom hook to fetch WebOS configuration from the server
 * This allows components to access configuration values without directly accessing environment variables
 */
export function useWebOSConfig() {
  const [config, setConfig] = useState({
    urls: {
      databaseApi: '',
      instanceManager: '',
      databaseApiProxy: '',
      instanceManagerProxy: '',
      terminal: '',
    },
    challenge: {
      instanceId: null,
    },
    system: {
      hostname: 'webos',
      domain: 'localhost',
    },
    isLoading: true,
    error: null
  });

  useEffect(() => {
    async function fetchConfig() {
      try {
        // Using the enhanced config endpoint that now includes all system URLs
        const response = await fetch('/api/config');
        
        if (!response.ok) {
          throw new Error(`Failed to fetch WebOS configuration: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // Structure the config in a backward-compatible way
        setConfig({
          urls: data.urls || {},
          challenge: data.challenge || {},
          system: data.system || {},
          apps: data.apps || [],
          isLoading: false,
          error: null
        });
      } catch (error) {
        console.error('Error fetching WebOS configuration:', error);
        setConfig(prevConfig => ({
          ...prevConfig,
          isLoading: false,
          error: error.message
        }));
      }
    }

    fetchConfig();
  }, []);

  return config;
}

export default useWebOSConfig; 