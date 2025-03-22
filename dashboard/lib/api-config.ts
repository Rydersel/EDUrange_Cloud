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
    return baseDomain;
  }

  // Fallback to extracting from CONNECT_SRC_DOMAIN
  const connectSrcDomain = process.env.CONNECT_SRC_DOMAIN || '';
  const extractedDomain = connectSrcDomain.replace(/^\*\./, '');

  if (!extractedDomain) {
    console.warn("No base domain found in environment variables");
    return '';
  }

  return extractedDomain;
};

/**
 * Get the instance manager subdomain
 */
export const getInstanceManagerSubdomain = (): string => {
  const subdomain = process.env.INSTANCE_MANAGER_SUBDOMAIN || 'eductf';
  return subdomain;
};

/**
 * Get the database subdomain
 */
export const getDatabaseSubdomain = (): string => {
  const subdomain = process.env.DATABASE_SUBDOMAIN || 'database';
  return subdomain;
};

/**
 * Get the base URL for the instance manager API
 */
export const getInstanceManagerUrl = (): string => {
  // First check if we have a direct URL configured
  if (process.env.INSTANCE_MANAGER_URL) {
    return process.env.INSTANCE_MANAGER_URL;
  }

  // Check for health check specific URL
  if (process.env.HEALTH_CHECK_INSTANCE_MANAGER_URL) {
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

  return `https://${subdomain}.${baseDomain}/instance-manager/api`;
};

/**
 * Get the base URL for the monitoring service API
 */
export const getMonitoringServiceUrl = (): string => {
  // First check if we have a direct URL configured
  if (process.env.MONITORING_SERVICE_URL) {
    return process.env.MONITORING_SERVICE_URL;
  }

  // Check for health check specific URL
  if (process.env.HEALTH_CHECK_MONITORING_URL) {
    return process.env.HEALTH_CHECK_MONITORING_URL;
  }

  // Use direct URL to monitoring service as fallback
  // The monitoring service exposes its API directly at the root path
  return 'http://monitoring-service.default.svc.cluster.local';
};

/**
 * Get the base URL for the database API
 */
export const getDatabaseApiUrl = (): string => {
  // First check if we have a direct URL configured
  if (process.env.DATABASE_API_URL) {
    return process.env.DATABASE_API_URL;
  }

  // Check if we're running in Kubernetes (server-side only)
  if (typeof window === 'undefined' && process.env.KUBERNETES_SERVICE_HOST) {
    // Use internal Kubernetes DNS name when running in the cluster
    return 'http://database-api-service.default.svc.cluster.local';
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

  return `https://${subdomain}.${baseDomain}`;
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
