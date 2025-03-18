/**
 * Cluster Verification Service
 * 
 * This service checks the Kubernetes cluster and verifies which steps have already been completed.
 * It updates the store accordingly to reflect the current state of the cluster.
 */
import useInstallStore from '../store/installStore';

/**
 * Verifies if kubectl is properly configured and connected to a cluster
 * @returns {Promise<boolean>} True if kubectl is connected to a cluster
 */
export const verifyKubectlConnection = async () => {
  try {
    const result = await window.api.executeCommand('kubectl', ['cluster-info']);
    return result.code === 0;
  } catch (error) {
    console.error('Error verifying kubectl connection:', error);
    return false;
  }
};

/**
 * Retrieves the Cloudflare API key from the cluster if it exists
 * @returns {Promise<{exists: boolean, apiKey: string|null, email: string|null}>} The Cloudflare API key and email
 */
export const getCloudflareApiKey = async () => {
  try {
    // Check if the secret exists
    const secretResult = await window.api.executeCommand('kubectl', [
      'get',
      'secret',
      'cloudflare-api-key-secret',
      '--ignore-not-found'
    ]);

    if (!secretResult.stdout.includes('cloudflare-api-key-secret')) {
      return { exists: false, apiKey: null, email: null };
    }

    // Get the API key from the secret
    const apiKeyResult = await window.api.executeCommand('kubectl', [
      'get',
      'secret',
      'cloudflare-api-key-secret',
      '-o',
      'jsonpath={.data.api-key}',
      '--ignore-not-found'
    ]);

    // Get the email from the secret
    const emailResult = await window.api.executeCommand('kubectl', [
      'get',
      'secret',
      'cloudflare-api-key-secret',
      '-o',
      'jsonpath={.data.email}',
      '--ignore-not-found'
    ]);

    if (!apiKeyResult.stdout || !emailResult.stdout) {
      return { exists: true, apiKey: null, email: null };
    }

    // Decode the base64-encoded values
    const apiKeyBase64 = apiKeyResult.stdout;
    const emailBase64 = emailResult.stdout;
    const apiKey = Buffer.from(apiKeyBase64, 'base64').toString('utf-8');
    const email = Buffer.from(emailBase64, 'base64').toString('utf-8');

    return { exists: true, apiKey, email };
  } catch (error) {
    console.error('Error retrieving Cloudflare API key:', error);
    return { exists: false, apiKey: null, email: null };
  }
};

/**
 * Verifies if NGINX Ingress Controller is installed
 * @returns {Promise<boolean>} True if NGINX Ingress Controller is installed
 */
export const verifyNginxIngress = async () => {
  try {
    // Check for the ingress-nginx namespace
    const namespaceResult = await window.api.executeCommand('kubectl', [
      'get',
      'namespace',
      'ingress-nginx',
      '--ignore-not-found'
    ]);

    if (!namespaceResult.stdout.includes('ingress-nginx')) {
      return false;
    }

    // Check for the ingress-nginx controller deployment
    const deploymentResult = await window.api.executeCommand('kubectl', [
      'get',
      'deployment',
      'ingress-nginx-controller',
      '-n',
      'ingress-nginx',
      '--ignore-not-found'
    ]);

    return deploymentResult.stdout.includes('ingress-nginx-controller');
  } catch (error) {
    console.error('Error verifying NGINX Ingress:', error);
    return false;
  }
};

/**
 * Verifies if Cert Manager is installed
 * @returns {Promise<boolean>} True if Cert Manager is installed
 */
export const verifyCertManager = async () => {
  try {
    // Check for the cert-manager namespace
    const namespaceResult = await window.api.executeCommand('kubectl', [
      'get',
      'namespace',
      'cert-manager',
      '--ignore-not-found'
    ]);

    if (!namespaceResult.stdout.includes('cert-manager')) {
      return false;
    }

    // Check for the cert-manager deployment
    const deploymentResult = await window.api.executeCommand('kubectl', [
      'get',
      'deployment',
      'cert-manager',
      '-n',
      'cert-manager',
      '--ignore-not-found'
    ]);

    return deploymentResult.stdout.includes('cert-manager');
  } catch (error) {
    console.error('Error verifying Cert Manager:', error);
    return false;
  }
};

/**
 * Verifies if a wildcard certificate has been created
 * @returns {Promise<boolean>} True if a wildcard certificate exists
 */
export const verifyWildcardCertificate = async () => {
  try {
    const certResult = await window.api.executeCommand('kubectl', [
      'get',
      'certificate',
      'wildcard-certificate-prod',
      '-n',
      'default',
      '--ignore-not-found'
    ]);

    return certResult.stdout.includes('wildcard-certificate-prod');
  } catch (error) {
    console.error('Error verifying wildcard certificate:', error);
    return false;
  }
};

/**
 * Verifies if the database is installed and running
 * @returns {Promise<boolean>} True if the database is installed and running
 */
export const verifyDatabase = async () => {
  try {
    // Check for the postgres deployment
    const deploymentResult = await window.api.executeCommand('kubectl', [
      'get',
      'deployment',
      'postgres',
      '--ignore-not-found'
    ]);

    if (!deploymentResult.stdout.includes('postgres')) {
      return false;
    }

    // Check for the database-secrets secret
    const secretResult = await window.api.executeCommand('kubectl', [
      'get',
      'secret',
      'database-secrets',
      '--ignore-not-found'
    ]);

    return secretResult.stdout.includes('database-secrets');
  } catch (error) {
    console.error('Error verifying database:', error);
    return false;
  }
};

/**
 * Verifies if Prisma Studio is installed and running
 * @returns {Promise<boolean>} True if Prisma Studio is installed and running
 */
export const verifyPrismaStudio = async () => {
  try {
    const deploymentResult = await window.api.executeCommand('kubectl', [
      'get',
      'deployment',
      'prisma-studio',
      '--ignore-not-found'
    ]);

    return deploymentResult.stdout.includes('prisma-studio');
  } catch (error) {
    console.error('Error verifying Prisma Studio:', error);
    return false;
  }
};

/**
 * Verifies if the database controller is installed and running
 * @returns {Promise<boolean>} True if the database controller is installed and running
 */
export const verifyDatabaseController = async () => {
  try {
    const deploymentResult = await window.api.executeCommand('kubectl', [
      'get',
      'deployment',
      'database-controller',
      '--ignore-not-found'
    ]);

    return deploymentResult.stdout.includes('database-controller');
  } catch (error) {
    console.error('Error verifying database controller:', error);
    return false;
  }
};

/**
 * Verifies if the instance manager is installed and running
 * @returns {Promise<boolean>} True if the instance manager is installed and running
 */
export const verifyInstanceManager = async () => {
  try {
    const deploymentResult = await window.api.executeCommand('kubectl', [
      'get',
      'deployment',
      'instance-manager',
      '--ignore-not-found'
    ]);

    return deploymentResult.stdout.includes('instance-manager');
  } catch (error) {
    console.error('Error verifying instance manager:', error);
    return false;
  }
};

/**
 * Verifies if the monitoring service is installed and running
 * @returns {Promise<boolean>} True if the monitoring service is installed and running
 */
export const verifyMonitoringService = async () => {
  try {
    const deploymentResult = await window.api.executeCommand('kubectl', [
      'get',
      'deployment',
      'monitoring-service',
      '--ignore-not-found'
    ]);

    return deploymentResult.stdout.includes('monitoring-service');
  } catch (error) {
    console.error('Error verifying monitoring service:', error);
    return false;
  }
};

/**
 * Verifies if the dashboard is installed and running
 * @returns {Promise<boolean>} True if the dashboard is installed and running
 */
export const verifyDashboard = async () => {
  try {
    const deploymentResult = await window.api.executeCommand('kubectl', [
      'get',
      'deployment',
      'dashboard',
      '--ignore-not-found'
    ]);

    return deploymentResult.stdout.includes('dashboard');
  } catch (error) {
    console.error('Error verifying dashboard:', error);
    return false;
  }
};

/**
 * Verifies if OAuth is configured
 * @returns {Promise<boolean>} True if OAuth is configured
 */
export const verifyOAuth = async () => {
  try {
    const secretResult = await window.api.executeCommand('kubectl', [
      'get',
      'secret',
      'oauth-config',
      '--ignore-not-found'
    ]);

    return secretResult.stdout.includes('oauth-config');
  } catch (error) {
    console.error('Error verifying OAuth:', error);
    return false;
  }
};

/**
 * Verifies if the domain is configured
 * @returns {Promise<{configured: boolean, domain: string|null}>} Domain configuration status
 */
export const verifyDomain = async () => {
  try {
    const secretResult = await window.api.executeCommand('kubectl', [
      'get',
      'secret',
      'domain-config',
      '--ignore-not-found'
    ]);

    if (!secretResult.stdout.includes('domain-config')) {
      return { configured: false, domain: null };
    }

    // Get the domain from the secret
    const domainResult = await window.api.executeCommand('kubectl', [
      'get',
      'secret',
      'domain-config',
      '-o',
      'jsonpath={.data.domain}',
      '--ignore-not-found'
    ]);

    if (!domainResult.stdout) {
      return { configured: false, domain: null };
    }

    // Decode the base64-encoded domain
    const domainBase64 = domainResult.stdout;
    const domain = Buffer.from(domainBase64, 'base64').toString('utf-8');

    return { configured: true, domain };
  } catch (error) {
    console.error('Error verifying domain:', error);
    return { configured: false, domain: null };
  }
};

/**
 * Runs all verification checks and returns the results
 * @returns {Promise<Object>} Results of all verification checks
 */
export const verifyAllSteps = async () => {
  const kubectlConnected = await verifyKubectlConnection();
  
  // If kubectl is not connected, we can't verify anything else
  if (!kubectlConnected) {
    return {
      kubectlConnected: false
    };
  }

  // Run all verification checks in parallel
  const [
    nginxIngress,
    certManager,
    wildcardCertificate,
    database,
    prismaStudio,
    databaseController,
    instanceManager,
    monitoringService,
    dashboard,
    oauth,
    domain
  ] = await Promise.all([
    verifyNginxIngress(),
    verifyCertManager(),
    verifyWildcardCertificate(),
    verifyDatabase(),
    verifyPrismaStudio(),
    verifyDatabaseController(),
    verifyInstanceManager(),
    verifyMonitoringService(),
    verifyDashboard(),
    verifyOAuth(),
    verifyDomain()
  ]);

  return {
    kubectlConnected,
    nginxIngress,
    certManager,
    wildcardCertificate,
    database,
    prismaStudio,
    databaseController,
    instanceManager,
    monitoringService,
    dashboard,
    oauth,
    domain
  };
};

/**
 * Verifies the cluster state and updates the store
 * @returns {Promise<Object>} Results of all verification checks
 */
export const verifyClusterState = async () => {
  try {
    const results = await verifyAllSteps();
    
    // Get the store to update it
    const store = useInstallStore.getState();
    
    // Update prerequisites status
    if (results.kubectlConnected) {
      store.setPrerequisite('kubeConnection', true);
    } else {
      store.setPrerequisite('kubeConnection', false);
    }
    
    // Update installation steps status
    if (results.nginxIngress) {
      store.markStepCompleted('ingress-setup');
      store.setInstallationStatus('ingressController', 'installed');
    }
    
    if (results.certManager && results.wildcardCertificate) {
      store.markStepCompleted('cert-manager-setup');
      store.setInstallationStatus('certManager', 'installed');
    }
    
    if (results.database) {
      store.markStepCompleted('database-setup');
      store.setInstallationStatus('database', 'installed');
    }
    
    if (results.databaseController) {
      store.setInstallationStatus('databaseController', 'installed');
    }
    
    if (results.instanceManager) {
      store.setInstallationStatus('instanceManager', 'installed');
    }
    
    if (results.monitoringService) {
      store.setInstallationStatus('monitoringService', 'installed');
    }
    
    // If all components are installed, mark the components-setup step as completed
    if (results.databaseController && results.instanceManager && results.monitoringService) {
      store.markStepCompleted('components-setup');
    }
    
    if (results.oauth) {
      store.markStepCompleted('oauth-setup');
    }
    
    if (results.dashboard) {
      store.markStepCompleted('dashboard-setup');
      store.setInstallationStatus('dashboard', 'installed');
    }
    
    if (results.domain.configured) {
      store.markStepCompleted('domain-setup');
      // Update domain in store if it's not already set
      if (!store.domain.name) {
        store.setDomain('name', results.domain.domain);
      }
    }
    
    return results;
  } catch (error) {
    console.error('Error verifying cluster state:', error);
    return {
      error: error.message,
      kubectlConnected: false
    };
  }
};

// Create a service object with all the exported functions
const clusterVerificationService = {
  verifyKubectlConnection,
  getCloudflareApiKey,
  verifyNginxIngress,
  verifyCertManager,
  verifyWildcardCertificate,
  verifyDatabase,
  verifyPrismaStudio,
  verifyDatabaseController,
  verifyInstanceManager,
  verifyMonitoringService,
  verifyDashboard,
  verifyOAuth,
  verifyDomain,
  verifyAllSteps,
  verifyClusterState
};

// Export the service object as default
export default clusterVerificationService; 