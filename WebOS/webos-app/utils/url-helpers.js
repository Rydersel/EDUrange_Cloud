/**
 * Shared utility functions for URL construction across the WebOS app
 */

/**
 * Gets the database API URL with internal Kubernetes DNS
 * @returns {string} The database API URL
 */
export const getDatabaseApiUrl = () => {
  // Always use internal Kubernetes DNS name for reliability inside pods
  return `http://database-api-service.default.svc.cluster.local`;
};

/**
 * Gets the instance manager URL - always uses internal Kubernetes DNS
 * @returns {string} The instance manager URL
 */
export const getInstanceManagerUrl = () => {
  // Always use internal Kubernetes DNS name for reliability
  return `http://instance-manager.default.svc.cluster.local/api`;
};

/**
 * Constructs proxy URLs for client-side use
 * @param {Request} req - The request object
 * @returns {Object} Object containing proxy URLs
 */
export const getProxyUrls = (req) => {
  const hostname = req.headers.get('host') || 'localhost';
  const protocol = req.headers.get('x-forwarded-proto') || 'https';
  const baseUrl = `${protocol}://${hostname}`;
  
  return {
    databaseApiProxy: `${baseUrl}/api/database-proxy`,
    instanceManagerProxy: `${baseUrl}/api/instance-manager-proxy`,
  };
};

/**
 * Gets the terminal URL based on instance ID and domain
 * @param {string} instanceId - The instance ID
 * @param {string} domainName - The domain name
 * @returns {string|null} The terminal URL or null if not available
 */
export const getTerminalUrl = (instanceId, domainName) => {
  let terminalUrl = process.env.TERMINAL_URL;
  
  if (!terminalUrl && domainName && instanceId !== 'unknown') {
    terminalUrl = `https://terminal-${instanceId}.${domainName}`;
  }
  
  return terminalUrl || null;
};

/**
 * Extract instance ID from hostname
 * @param {string} hostname - The hostname from request
 * @param {string} domainName - The domain name from environment
 * @returns {string} The extracted instance ID
 */
export const extractInstanceId = (hostname, domainName) => {
  if (domainName && hostname.includes(domainName)) {
    return hostname.split(`.${domainName}`)[0];
  }
  
  // Fallback to first segment of hostname
  return hostname.split('.')[0];
}; 