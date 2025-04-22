/**
 * Loki Installation and Configuration Utilities
 * 
 * This module provides functions for installing and configuring Loki
 * in the EDURange Cloud monitoring stack.
 */

/**
 * Generate Loki values.yaml content for Helm installation
 * @param {string} storageClassName - The storage class to use for Loki
 * @returns {string} - The Loki values.yaml content
 */
export function generateLokiValues(storageClassName) {
  return `
loki:
  auth_enabled: false
  
  persistence:
    enabled: true
    size: 10Gi
    ${storageClassName ? `storageClassName: ${storageClassName}` : ''}
  
  config:
    ingester:
      lifecycler:
        ring:
          kvstore:
            store: inmemory
      chunk_idle_period: 1h
      chunk_retain_period: 30s
      
    schema_config:
      configs:
        - from: 2023-01-01
          store: boltdb-shipper
          object_store: filesystem
          schema: v11
          index:
            prefix: index_
            period: 24h
            
    storage_config:
      boltdb_shipper:
        active_index_directory: /data/loki/index
        cache_location: /data/loki/cache
        cache_ttl: 24h
        shared_store: filesystem
      filesystem:
        directory: /data/loki/chunks
        
  ruler:
    storage:
      type: local
      local:
        directory: /rules
    rule_path: /rules
    alertmanager_url: http://prometheus-kube-prometheus-alertmanager.monitoring.svc.cluster.local:9093
    ring:
      kvstore:
        store: inmemory
    enable_api: true
  
  # Resource limits for smaller clusters
  resources:
    requests:
      cpu: 100m
      memory: 256Mi
    limits:
      cpu: 1
      memory: 1Gi
`;
}

/**
 * Install Loki using Helm
 * @param {object} params - Parameters for the installation
 * @returns {Promise<object>} - Result of the installation
 */
export async function installLoki({
  addComponentLog, 
  storageClassName,
  waitForPod,
  domain
}) {
  try {
    addComponentLog('Starting Loki installation...');

    // Add Grafana Helm repository
    addComponentLog('Adding Grafana Helm repository...');
    const helmAddRepoResult = await window.api.executeCommand('helm', [
      'repo',
      'add',
      'grafana',
      'https://grafana.github.io/helm-charts'
    ]);

    if (helmAddRepoResult.code !== 0) {
      throw new Error(`Failed to add Grafana Helm repository: ${helmAddRepoResult.stderr}`);
    }

    // Update repositories
    addComponentLog('Updating Helm repositories...');
    const helmUpdateResult = await window.api.executeCommand('helm', [
      'repo',
      'update'
    ]);

    if (helmUpdateResult.code !== 0) {
      throw new Error(`Failed to update Helm repositories: ${helmUpdateResult.stderr}`);
    }

    // Generate Loki values
    const lokiValues = generateLokiValues(storageClassName);

    // Create a temporary file with the values
    addComponentLog('Creating Loki configuration...');
    const tempValuesFile = await window.api.executeCommand('mktemp', ['-t', 'loki-values-XXXXXX.yaml']);
    if (tempValuesFile.code !== 0) {
      throw new Error(`Failed to create temporary file: ${tempValuesFile.stderr}`);
    }

    const tempFilePath = tempValuesFile.stdout.trim();

    // Write the values to the temporary file
    const writeResult = await window.api.executeCommand('bash', [
      '-c',
      `cat > "${tempFilePath}" << 'EOF'
${lokiValues}
EOF`
    ]);

    if (writeResult.code !== 0) {
      throw new Error(`Failed to write Loki values to temporary file: ${writeResult.stderr}`);
    }

    // Install Loki using Helm
    addComponentLog('Installing Loki using Helm...');
    const helmInstallResult = await window.api.executeCommand('helm', [
      'upgrade',
      '--install',
      'loki',
      'grafana/loki',
      '--namespace',
      'monitoring',
      '-f',
      tempFilePath,
      '--timeout',
      '10m',
      '--atomic',
      '--wait'
    ]);

    // Clean up the temporary file
    await window.api.executeCommand('rm', [tempFilePath]);

    if (helmInstallResult.code !== 0) {
      throw new Error(`Failed to install Loki: ${helmInstallResult.stderr}`);
    }

    addComponentLog('Loki installation completed successfully.');

    // Wait for Loki pod to be ready
    addComponentLog('Waiting for Loki pod to be ready...');
    const waitResult = await waitForPod({
      selector: 'app.kubernetes.io/name=loki',
      namespace: 'monitoring',
      timeout: 300
    });

    if (!waitResult.success) {
      addComponentLog(`Warning: Loki pod readiness check timed out: ${waitResult.error}`);
      addComponentLog('Will continue with the installation process as Loki may still be starting...');
    } else {
      addComponentLog('Loki pod is ready.');
    }

    return { success: true };
  } catch (error) {
    addComponentLog(`Error installing Loki: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Check if Loki is already installed
 * @param {function} addComponentLog - Function to log messages
 * @returns {Promise<boolean>} - Whether Loki is already installed
 */
export async function isLokiInstalled(addComponentLog) {
  try {
    addComponentLog('Checking if Loki is already installed...');
    
    const helmListResult = await window.api.executeCommand('helm', [
      'list',
      '--namespace',
      'monitoring',
      '--filter',
      'loki',
      '--output',
      'json'
    ]);

    if (helmListResult.stdout && helmListResult.stdout.trim() !== '[]') {
      const releases = JSON.parse(helmListResult.stdout);
      const lokiReleases = releases.filter(release => 
        release.name === 'loki' && release.status === 'deployed'
      );
      
      if (lokiReleases.length > 0) {
        addComponentLog('Loki is already installed.');
        return true;
      }
    }
    
    addComponentLog('Loki is not installed.');
    return false;
  } catch (error) {
    addComponentLog(`Error checking Loki installation: ${error.message}`);
    return false;
  }
}

/**
 * Uninstall Loki if it exists
 * @param {function} addComponentLog - Function to log messages
 * @returns {Promise<boolean>} - Whether the uninstallation was successful
 */
export async function uninstallLoki(addComponentLog) {
  try {
    addComponentLog('Checking for existing Loki installation...');
    
    const helmListResult = await window.api.executeCommand('helm', [
      'list',
      '--namespace',
      'monitoring',
      '--filter',
      'loki',
      '--output',
      'json'
    ]);

    if (helmListResult.stdout && helmListResult.stdout.trim() !== '[]') {
      addComponentLog('Found existing Loki installation. Uninstalling...');
      
      const uninstallResult = await window.api.executeCommand('helm', [
        'uninstall',
        'loki',
        '--namespace',
        'monitoring'
      ]);
      
      if (uninstallResult.code !== 0) {
        addComponentLog(`Warning: Failed to uninstall Loki: ${uninstallResult.stderr}`);
        return false;
      }
      
      addComponentLog('Loki uninstalled successfully.');
      
      // Wait for resources to be fully removed
      addComponentLog('Waiting for Loki resources to be fully removed...');
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
    
    return true;
  } catch (error) {
    addComponentLog(`Error uninstalling Loki: ${error.message}`);
    return false;
  }
} 