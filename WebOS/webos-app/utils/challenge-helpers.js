/**
 * Utility functions for working with challenges in WebOS
 */
import { logger } from './logger';
import { isDevMode } from './dev-config';

/**
 * Fetches all challenge-specific URLs from the instance manager for a specific instance
 * @param {string} instanceId - The instance ID to fetch URLs for
 * @param {string} instanceManagerUrl - The instance manager API URL
 * @returns {Promise<Object>} Promise resolving to an object with all challenge URLs
 */
export const fetchChallengeUrls = async (instanceId, instanceManagerUrl) => {
  // Skip network request if in development mode
  if (isDevMode()) {
    logger.debug('Skipping challenge URLs fetch in development mode');
    return {
      webChallengeUrl: 'http://localhost:8080',
      doomUrl: 'http://localhost:8080/doom',
    };
  }

  try {
    logger.info(`Fetching challenge URLs for instance ${instanceId}`);
    
    // Use a direct fetch to the instance manager's list-challenge-pods endpoint
    const response = await fetch(`${instanceManagerUrl}/list-challenge-pods`);
    
    if (!response.ok) {
      logger.warn('Failed to fetch challenge pods from instance manager:', response.status);
      return {};
    }
    
    const data = await response.json();
    
    // Find the pod with matching instance ID
    const instancePod = data.challenge_pods?.find(pod => pod.pod_name === instanceId);
    
    if (!instancePod) {
      logger.warn(`No pod found with instance ID: ${instanceId}`);
      return {};
    }
    
    // Extract all URL-like fields (ending with 'Url')
    const urlFields = {};
    Object.keys(instancePod).forEach(key => {
      // Check if the key ends with 'Url' (case-sensitive) and has a string value
      if (key.endsWith('Url') && typeof instancePod[key] === 'string') {
        urlFields[key] = instancePod[key];
      }
    });
    
    logger.debug('Extracted URL fields from instance manager:', urlFields);
    return urlFields;
  } catch (error) {
    logger.error('Error fetching challenge URLs:', error);
    return {};
  }
};

/**
 * Gets the web challenge URL based on instance ID and domain
 * @param {string} instanceId - The instance ID
 * @param {string} domainName - The domain name
 * @returns {string|null} The web challenge URL or null if not available
 */
export const getWebChallengeUrl = (instanceId, domainName) => {
  // First check for environment variable
  const envUrl = process.env.NEXT_PUBLIC_WEB_CHALLENGE_URL;
  if (envUrl) {
    return envUrl;
  }
  
  // For development mode, return localhost URL
  if (isDevMode()) {
    return 'http://localhost:8080';
  }
  
  // Fallback to constructing URL if we have instance and domain
  if (domainName && instanceId !== 'unknown') {
    return `https://web-${instanceId}.${domainName}`;
  }
  
  return null;
}; 