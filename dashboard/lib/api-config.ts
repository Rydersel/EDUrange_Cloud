/**
 * API configuration utilities for EDURange Cloud
 * Provides consistent access to API endpoints across the application
 */

/**
 * Get the base domain for all services
 */
export const getBaseDomain = (): string => {
  // First try BASE_DOMAIN, then extract from CONNECT_SRC_DOMAIN
  const baseDomain = process.env.BASE_DOMAIN || '';
  if (baseDomain) {
    console.log("Using BASE_DOMAIN:", baseDomain);
    return baseDomain;
  }

  // Fallback to extracting from CONNECT_SRC_DOMAIN
  const connectSrcDomain = process.env.CONNECT_SRC_DOMAIN || '';
  const extractedDomain = connectSrcDomain.replace(/^\*\./, '');

  if (!extractedDomain) {
    console.warn("No base domain found in environment variables");
    return '';
  }

  console.log("Extracted domain from CONNECT_SRC_DOMAIN:", extractedDomain);
  return extractedDomain;
};

/**
 * Get the instance manager subdomain
 */
export const getInstanceManagerSubdomain = (): string => {
  const subdomain = process.env.INSTANCE_MANAGER_SUBDOMAIN || 'eductf';
  console.log("Using instance manager subdomain:", subdomain);
  return subdomain;
};

/**
 * Get the database subdomain
 */
export const getDatabaseSubdomain = (): string => {
  const subdomain = process.env.DATABASE_SUBDOMAIN || 'database';
  console.log("Using database subdomain:", subdomain);
  return subdomain;
};

/**
 * Get the base URL for the instance manager API
 */
export const getInstanceManagerUrl = (): string => {
  // First check if we have a direct URL configured
  if (process.env.INSTANCE_MANAGER_URL) {
    console.log("Using direct INSTANCE_MANAGER_URL:", process.env.INSTANCE_MANAGER_URL);
    return process.env.INSTANCE_MANAGER_URL;
  }

  // Check for health check specific URL
  if (process.env.HEALTH_CHECK_INSTANCE_MANAGER_URL) {
    console.log("Using HEALTH_CHECK_INSTANCE_MANAGER_URL:", process.env.HEALTH_CHECK_INSTANCE_MANAGER_URL);
    return process.env.HEALTH_CHECK_INSTANCE_MANAGER_URL;
  }

  // Otherwise construct from base domain and subdomain
  const baseDomain = getBaseDomain();
  const subdomain = getInstanceManagerSubdomain();

  if (!baseDomain) {
    console.error("Cannot construct instance manager URL: missing base domain");
    console.error("BASE_DOMAIN:", process.env.BASE_DOMAIN);
    console.error("CONNECT_SRC_DOMAIN:", process.env.CONNECT_SRC_DOMAIN);
    // Never fall back to localhost in production
    return '';
  }

  if (!subdomain) {
    console.error("Cannot construct instance manager URL: missing subdomain");
    console.error("INSTANCE_MANAGER_SUBDOMAIN:", process.env.INSTANCE_MANAGER_SUBDOMAIN);
    // Never fall back to localhost in production
    return '';
  }

  const url = `https://${subdomain}.${baseDomain}/instance-manager/api`;
  console.log("Constructed instance manager URL:", url);
  return url;
};

/**
 * Get the base URL for the monitoring service API
 */
export const getMonitoringServiceUrl = (): string => {
  // First check if we have a direct URL configured
  if (process.env.MONITORING_SERVICE_URL) {
    console.log("Using direct MONITORING_SERVICE_URL:", process.env.MONITORING_SERVICE_URL);
    return process.env.MONITORING_SERVICE_URL;
  }

  // Check for health check specific URL
  if (process.env.HEALTH_CHECK_MONITORING_URL) {
    console.log("Using HEALTH_CHECK_MONITORING_URL:", process.env.HEALTH_CHECK_MONITORING_URL);
    return process.env.HEALTH_CHECK_MONITORING_URL;
  }

  // Otherwise construct from base domain and subdomain
  const baseDomain = getBaseDomain();
  const subdomain = getInstanceManagerSubdomain(); // Monitoring is on the same subdomain as instance manager

  if (!baseDomain) {
    console.error("Cannot construct monitoring service URL: missing base domain");
    console.error("BASE_DOMAIN:", process.env.BASE_DOMAIN);
    console.error("CONNECT_SRC_DOMAIN:", process.env.CONNECT_SRC_DOMAIN);
    // Never fall back to localhost in production
    return '';
  }

  if (!subdomain) {
    console.error("Cannot construct monitoring service URL: missing subdomain");
    console.error("INSTANCE_MANAGER_SUBDOMAIN:", process.env.INSTANCE_MANAGER_SUBDOMAIN);
    // Never fall back to localhost in production
    return '';
  }

  const url = `https://${subdomain}.${baseDomain}/metrics`;
  console.log("Constructed monitoring service URL:", url);
  return url;
};

/**
 * Get the base URL for the database API
 */
export const getDatabaseApiUrl = (): string => {
  // First check if we have a direct URL configured
  if (process.env.DATABASE_API_URL) {
    console.log("Using direct DATABASE_API_URL:", process.env.DATABASE_API_URL);
    return process.env.DATABASE_API_URL;
  }

  // Check if we're running in Kubernetes (server-side only)
  if (typeof window === 'undefined' && process.env.KUBERNETES_SERVICE_HOST) {
    // Use internal Kubernetes DNS name when running in the cluster
    const internalUrl = 'http://database-api-service.default.svc.cluster.local';
    console.log("Using internal Kubernetes DNS for database API:", internalUrl);
    return internalUrl;
  }

  // Otherwise construct from base domain and subdomain for external access
  const baseDomain = getBaseDomain();
  const subdomain = getDatabaseSubdomain();

  if (!baseDomain) {
    console.error("Cannot construct database API URL: missing base domain");
    console.error("BASE_DOMAIN:", process.env.BASE_DOMAIN);
    console.error("CONNECT_SRC_DOMAIN:", process.env.CONNECT_SRC_DOMAIN);
    // Never fall back to localhost in production
    return '';
  }

  if (!subdomain) {
    console.error("Cannot construct database API URL: missing subdomain");
    console.error("DATABASE_SUBDOMAIN:", process.env.DATABASE_SUBDOMAIN);
    // Never fall back to localhost in production
    return '';
  }

  const url = `https://${subdomain}.${baseDomain}`;
  console.log("Constructed database API URL:", url);
  return url;
};

/**
 * Get configuration for client-side components
 * This should be used to create a server-side API endpoint that provides
 * necessary configuration to client components without exposing sensitive values
 */
export const getClientConfig = () => {
  return {
    // Add any client-safe configuration here
    apiEndpoints: {
      challenges: '/api/challenges',
      competitions: '/api/competitions',
      users: '/api/users',

    },
    instanceManagerUrl: getInstanceManagerUrl(),
    monitoringServiceUrl: getMonitoringServiceUrl(),
    databaseApiUrl: getDatabaseApiUrl(),
    baseDomain: getBaseDomain()

  };
};
