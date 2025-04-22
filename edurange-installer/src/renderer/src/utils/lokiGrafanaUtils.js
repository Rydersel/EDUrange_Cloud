/**
 * Loki and Grafana Utilities for EDURange Cloud
 * 
 * This module provides utilities for installing, checking, and uninstalling Loki, Promtail,
 * and Grafana in the EDURange Cloud platform.
 */

/**
 * Check if Loki is already installed
 * @param {Function} addComponentLog - Function to add logs
 * @returns {Promise<object>} - Result of the check
 */
export async function isLokiInstalled(addComponentLog) {
  try {
    addComponentLog('Checking if Loki is already installed...');
    
    const lokiListResult = await window.api.executeCommand('helm', [
      'list',
      '--namespace',
      'monitoring',
      '--filter',
      'loki',
      '--output',
      'json'
    ]);

    let installed = false;
    let releaseInfo = null;

    if (lokiListResult.stdout && lokiListResult.stdout.trim() !== '[]') {
      const releases = JSON.parse(lokiListResult.stdout);
      const lokiReleases = releases.filter(release => 
        release.name === 'loki' && release.status === 'deployed'
      );
      
      if (lokiReleases.length > 0) {
        installed = true;
        releaseInfo = lokiReleases[0];
        addComponentLog('Loki is already installed.');
      }
    }

    // Check for running pods if release is installed
    let podName = '';
    if (installed) {
      const podsResult = await window.api.executeCommand('kubectl', [
        'get',
        'pods',
        '-n',
        'monitoring',
        '-l',
        'app=loki',
        '-o',
        'jsonpath={.items[0].metadata.name}'
      ]);
      
      if (podsResult.stdout) {
        podName = podsResult.stdout.trim();
      }
    }

    return {
      success: true,
      installed,
      podName,
      releaseInfo
    };
  } catch (error) {
    addComponentLog(`Error checking Loki installation: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Check if Promtail is already installed
 * @param {Function} addComponentLog - Function to add logs
 * @returns {Promise<object>} - Result of the check
 */
export async function isPromtailInstalled(addComponentLog) {
  try {
    addComponentLog('Checking if Promtail is already installed...');
    
    const promtailListResult = await window.api.executeCommand('helm', [
      'list',
      '--namespace',
      'monitoring',
      '--filter',
      'promtail',
      '--output',
      'json'
    ]);

    let installed = false;
    let releaseInfo = null;

    if (promtailListResult.stdout && promtailListResult.stdout.trim() !== '[]') {
      const releases = JSON.parse(promtailListResult.stdout);
      const promtailReleases = releases.filter(release => 
        release.name === 'promtail' && release.status === 'deployed'
      );
      
      if (promtailReleases.length > 0) {
        installed = true;
        releaseInfo = promtailReleases[0];
        addComponentLog('Promtail is already installed.');
      }
    }

    // Check for running pods if release is installed
    let podName = '';
    if (installed) {
      const podsResult = await window.api.executeCommand('kubectl', [
        'get',
        'pods',
        '-n',
        'monitoring',
        '-l',
        'app=promtail',
        '-o',
        'jsonpath={.items[0].metadata.name}'
      ]);
      
      if (podsResult.stdout) {
        podName = podsResult.stdout.trim();
      }
    }

    return {
      success: true,
      installed,
      podName,
      releaseInfo
    };
  } catch (error) {
    addComponentLog(`Error checking Promtail installation: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Check if Grafana is already installed
 * @param {Function} addComponentLog - Function to add logs
 * @returns {Promise<object>} - Result of the check
 */
export async function isGrafanaInstalled(addComponentLog) {
  try {
    addComponentLog('Checking if Grafana is already installed...');
    
    const grafanaListResult = await window.api.executeCommand('helm', [
      'list',
      '--namespace',
      'monitoring',
      '--filter',
      'grafana',
      '--output',
      'json'
    ]);

    let installed = false;
    let releaseInfo = null;

    if (grafanaListResult.stdout && grafanaListResult.stdout.trim() !== '[]') {
      const releases = JSON.parse(grafanaListResult.stdout);
      const grafanaReleases = releases.filter(release => 
        release.name === 'grafana' && release.status === 'deployed'
      );
      
      if (grafanaReleases.length > 0) {
        installed = true;
        releaseInfo = grafanaReleases[0];
        addComponentLog('Grafana is already installed.');
      }
    }

    // Check for running pods if release is installed
    let podName = '';
    if (installed) {
      const podsResult = await window.api.executeCommand('kubectl', [
        'get',
        'pods',
        '-n',
        'monitoring',
        '-l',
        'app.kubernetes.io/name=grafana',
        '-o',
        'jsonpath={.items[0].metadata.name}'
      ]);
      
      if (podsResult.stdout) {
        podName = podsResult.stdout.trim();
      }
    }

    return {
      success: true,
      installed,
      podName,
      releaseInfo
    };
  } catch (error) {
    addComponentLog(`Error checking Grafana installation: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Uninstall Loki
 * @param {Function} addComponentLog - Function to add logs
 * @param {Function} updateCurrentStep - Function to update current installation step
 * @returns {Promise<object>} - Result of the uninstallation
 */
export async function uninstallLoki(addComponentLog, updateCurrentStep) {
  try {
    addComponentLog('Uninstalling Loki...');
    updateCurrentStep('Uninstalling Loki');
    
    // Uninstall using helm
    await window.api.executeCommand('helm', [
      'uninstall',
      'loki',
      '--namespace',
      'monitoring'
    ]);
    
    // Wait for resources to be deleted
    addComponentLog('Waiting for Loki resources to be removed...');
    await new Promise(resolve => setTimeout(resolve, 10000)); // 10 second wait
    
    // Clean up PVCs
    addComponentLog('Cleaning up Loki PVCs...');
    const pvcResult = await window.api.executeCommand('kubectl', [
      'get',
      'pvc',
      '--namespace',
      'monitoring',
      '-o',
      'jsonpath={.items[*].metadata.name}'
    ]);
    
    if (pvcResult.stdout) {
      const pvcs = pvcResult.stdout.split(' ');
      for (const pvc of pvcs) {
        if (pvc.includes('loki')) {
          addComponentLog(`Deleting PVC: ${pvc}`);
          
          // Remove finalizers
          await window.api.executeCommand('kubectl', [
            'patch',
            'pvc',
            pvc,
            '-n',
            'monitoring',
            '-p',
            '{"metadata":{"finalizers":null}}',
            '--type=merge'
          ]).catch(() => {});
          
          // Delete the PVC
          await window.api.executeCommand('kubectl', [
            'delete',
            'pvc',
            pvc,
            '--namespace',
            'monitoring',
            '--force',
            '--grace-period=0'
          ]).catch(() => {});
        }
      }
    }
    
    addComponentLog('Loki uninstalled successfully.');
    return { success: true };
  } catch (error) {
    addComponentLog(`Error uninstalling Loki: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Uninstall Promtail
 * @param {Function} addComponentLog - Function to add logs
 * @param {Function} updateCurrentStep - Function to update current installation step
 * @returns {Promise<object>} - Result of the uninstallation
 */
export async function uninstallPromtail(addComponentLog, updateCurrentStep) {
  try {
    // Check if there's a Promtail pod or Promtail uninstall is in progress
    const promtailCheck = await isPromtailInstalled(addComponentLog);
    
    if (promtailCheck.installed || promtailCheck.podName) {
      addComponentLog('Uninstalling Promtail...');
      updateCurrentStep('Uninstalling Promtail');
      
      // Uninstall using helm
      await window.api.executeCommand('helm', [
        'uninstall',
        'promtail',
        '-n',
        'monitoring'
      ]);
      
      addComponentLog('Promtail uninstalled successfully.');
    } else {
      addComponentLog('No Promtail installation found to uninstall.');
    }
    
    return { success: true };
  } catch (error) {
    addComponentLog(`Error uninstalling Promtail: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Uninstall Grafana
 * @param {Function} addComponentLog - Function to add logs
 * @param {Function} updateCurrentStep - Function to update current installation step
 * @returns {Promise<object>} - Result of the uninstallation
 */
export async function uninstallGrafana(addComponentLog, updateCurrentStep) {
  try {
    addComponentLog('Uninstalling Grafana...');
    updateCurrentStep('Uninstalling Grafana');
    
    // Uninstall using helm
    await window.api.executeCommand('helm', [
      'uninstall',
      'grafana',
      '--namespace',
      'monitoring'
    ]);
    
    // Wait for resources to be deleted
    addComponentLog('Waiting for Grafana resources to be removed...');
    await new Promise(resolve => setTimeout(resolve, 10000)); // 10 second wait
    
    // Clean up PVCs
    addComponentLog('Cleaning up Grafana PVCs...');
    const pvcResult = await window.api.executeCommand('kubectl', [
      'get',
      'pvc',
      '--namespace',
      'monitoring',
      '-o',
      'jsonpath={.items[*].metadata.name}'
    ]);
    
    if (pvcResult.stdout) {
      const pvcs = pvcResult.stdout.split(' ');
      for (const pvc of pvcs) {
        if (pvc.includes('grafana')) {
          addComponentLog(`Deleting PVC: ${pvc}`);
          
          // Remove finalizers
          await window.api.executeCommand('kubectl', [
            'patch',
            'pvc',
            pvc,
            '-n',
            'monitoring',
            '-p',
            '{"metadata":{"finalizers":null}}',
            '--type=merge'
          ]).catch(() => {});
          
          // Delete the PVC
          await window.api.executeCommand('kubectl', [
            'delete',
            'pvc',
            pvc,
            '--namespace',
            'monitoring',
            '--force',
            '--grace-period=0'
          ]).catch(() => {});
        }
      }
    }
    
    addComponentLog('Grafana uninstalled successfully.');
    return { success: true };
  } catch (error) {
    addComponentLog(`Error uninstalling Grafana: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Install Loki
 * @param {object} params - Parameters for installation
 * @param {Function} params.addComponentLog - Function to add logs
 * @param {Function} params.updateCurrentStep - Function to update installation step
 * @param {string} params.storageClassName - Storage class to use
 * @param {Function} params.waitForPod - Function to wait for a pod
 * @returns {Promise<object>} - Result of installation
 */
export async function installLoki({
  addComponentLog,
  updateCurrentStep,
  storageClassName,
  waitForPod
}) {
  try {
    addComponentLog('Starting Loki installation...');
    updateCurrentStep('Installing Loki');
    
    // Check if Loki is already installed and uninstall it
    addComponentLog('Checking for existing Loki installation...');
    const existingLoki = await isLokiInstalled(addComponentLog);
    
    if (existingLoki.installed || existingLoki.podName) {
      addComponentLog('Found existing Loki installation. Uninstalling...');
      await uninstallLoki(addComponentLog, updateCurrentStep);
      
      // Wait for resources to be fully removed
      addComponentLog('Waiting for existing Loki resources to be fully removed...');
      await new Promise(resolve => setTimeout(resolve, 15000));
    }
    
    // Double-check and forcefully remove any remaining Loki resources
    addComponentLog('Checking for any remaining Loki resources...');
    
    // Check for and delete any lingering Loki deployments, statefulsets, daemonsets
    const resourceTypes = ['deployment', 'statefulset', 'daemonset', 'configmap', 'service', 'serviceaccount', 'secret'];
    const labelSelectors = [
      'app=loki',
      'app.kubernetes.io/name=loki',
      'app.kubernetes.io/instance=loki'
    ];
    
    for (const resourceType of resourceTypes) {
      for (const selector of labelSelectors) {
        const resourcesResult = await window.api.executeCommand('kubectl', [
          'get',
          resourceType,
          '-n',
          'monitoring',
          '-l',
          selector,
          '--no-headers',
          '--ignore-not-found'
        ]);
        
        if (resourcesResult.stdout && resourcesResult.stdout.trim() !== '') {
          addComponentLog(`Found lingering Loki ${resourceType}s with selector ${selector}. Removing...`);
          await window.api.executeCommand('kubectl', [
            'delete',
            resourceType,
            '-n',
            'monitoring',
            '-l',
            selector,
            '--force',
            '--grace-period=0'
          ]).catch(e => {
            addComponentLog(`Note during cleanup: ${e.message}`);
          });
        }
      }
    }
    
    // Clean up any Loki PVCs to ensure fresh storage
    const pvcResult = await window.api.executeCommand('kubectl', [
      'get',
      'pvc',
      '-n',
      'monitoring',
      '--no-headers'
    ]);
    
    if (pvcResult.stdout) {
      const lines = pvcResult.stdout.split('\n');
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length > 0 && parts[0].includes('loki')) {
          const pvcName = parts[0];
          addComponentLog(`Deleting Loki PVC: ${pvcName}`);
          
          // Remove finalizers
          await window.api.executeCommand('kubectl', [
            'patch',
            'pvc',
            pvcName,
            '-n',
            'monitoring',
            '-p',
            '{"metadata":{"finalizers":null}}',
            '--type=merge'
          ]).catch(() => {});
          
          // Delete the PVC
          await window.api.executeCommand('kubectl', [
            'delete',
            'pvc',
            pvcName,
            '-n',
            'monitoring',
            '--force',
            '--grace-period=0'
          ]).catch(() => {});
        }
      }
    }
    
    // Add loki helm repo
    addComponentLog('Adding Loki Helm repository...');
    await window.api.executeCommand('helm', [
      'repo',
      'add',
      'grafana',
      'https://grafana.github.io/helm-charts'
    ]);
    
    // Update helm repos
    addComponentLog('Updating Helm repositories...');
    await window.api.executeCommand('helm', [
      'repo',
      'update'
    ]);
    
    // Create values.yaml for Loki installation
    addComponentLog('Creating Loki values configuration...');
    const lokiValues = `
# Use the simpler loki-stack chart which is more stable
loki:
  enabled: true
  persistence:
    enabled: true
    storageClassName: ${storageClassName}
    size: 10Gi
  config:
    auth_enabled: false
    storage:
      filesystem:
        chunks_directory: /var/loki/chunks
        rules_directory: /var/loki/rules
    limits_config:
      ingestion_rate_mb: 8
      ingestion_burst_size_mb: 16
      retention_period: 24h
    schema_config:
      configs:
        - from: 2020-05-15
          store: boltdb-shipper
          object_store: filesystem
          schema: v11
          index:
            prefix: index_
            period: 24h
    table_manager:
      retention_deletes_enabled: true
      retention_period: 24h

# Include Promtail for log collection
promtail:
  enabled: true
  config:
    logLevel: info
    client:
      # Note we'll configure this URL in the Promtail installation function
      # Here we just have a placeholder
      url: http://loki:3100/loki/api/v1/push

# Disable Grafana as we'll install it separately for more control
grafana:
  enabled: false

# Disable Prometheus as we're installing it separately
prometheus:
  enabled: false
  alertmanager:
    enabled: false
  pushgateway:
    enabled: false
  server:
    enabled: false

# Disable other bundled components
fluent-bit:
  enabled: false
filebeat:
  enabled: false
logstash:
  enabled: false
`;
    
    // Write values file to a temporary location
    const tempValuesPath = '/tmp/loki-values.yaml';
    await window.api.executeCommand('bash', [
      '-c',
      `echo '${lokiValues}' > ${tempValuesPath}`
    ]);
    
    // Display values for debugging
    addComponentLog(`Using Loki configuration:\n${lokiValues}`);
    
    // Install Loki using loki-stack chart instead of loki chart
    addComponentLog('Installing Loki with Helm...');
    const helmInstallResult = await window.api.executeCommand('helm', [
      'install',
      'loki',
      'grafana/loki-stack',
      '--version',
      '2.9.11', // Last stable version of loki-stack
      '--namespace',
      'monitoring',
      '--create-namespace',
      '--values',
      tempValuesPath,
      '--timeout',
      '10m'
    ]);
    
    // Check if the Helm install was successful
    if (helmInstallResult.code !== 0) {
      throw new Error(`Helm install failed: ${helmInstallResult.stderr}`);
    }
    
    addComponentLog('Loki Helm chart installed. Verifying deployment...');
    
    // Check what's deployed in the namespace
    const deployedResources = await window.api.executeCommand('kubectl', [
      'get',
      'all',
      '-n',
      'monitoring',
      '-l',
      'app=loki'
    ]);
    
    addComponentLog(`Deployed Loki resources:\n${deployedResources.stdout}`);
    
    // Wait for Loki pod to be ready
    addComponentLog('Waiting for Loki pod to be ready...');
    try {
      // Try multiple label selectors for Loki
      const labelSelectors = [
        'app=loki',
        'app.kubernetes.io/name=loki',
        'app.kubernetes.io/instance=loki'
      ];
      
      let lokiFound = false;
      
      for (const selector of labelSelectors) {
        addComponentLog(`Checking for pods with selector: ${selector}`);
        const podsResult = await window.api.executeCommand('kubectl', [
          'get',
          'pods',
          '-n',
          'monitoring',
          '-l',
          selector,
          '--no-headers'
        ]);
        
        if (podsResult.stdout && podsResult.stdout.trim() !== '') {
          addComponentLog(`Found Loki pods with selector ${selector}:\n${podsResult.stdout}`);
          lokiFound = true;
          
          const lokiPod = await waitForPod({
            namespace: 'monitoring',
            labelSelector: selector,
            timeout: 300
          });
          
          if (lokiPod.success) {
            addComponentLog(`Loki pod is ready with selector: ${selector}`);
            break;
          }
        }
      }
      
      if (!lokiFound) {
        addComponentLog('Warning: No Loki pods found with any known selectors. Installation may have failed.');
        
        // Check pod statuses in the monitoring namespace
        const allPodsStatus = await window.api.executeCommand('kubectl', [
          'get',
          'pods',
          '-n',
          'monitoring'
        ]);
        
        addComponentLog(`All pods in monitoring namespace:\n${allPodsStatus.stdout}`);
        
        // Check events in the monitoring namespace
        const namespaceEvents = await window.api.executeCommand('kubectl', [
          'get',
          'events',
          '-n',
          'monitoring',
          '--sort-by=.metadata.creationTimestamp'
        ]);
        
        addComponentLog(`Recent events in monitoring namespace:\n${namespaceEvents.stdout}`);
      }
    } catch (error) {
      addComponentLog(`Warning: Error waiting for Loki pod: ${error.message}`);
      addComponentLog('Checking if Loki service exists...');
      
      // Check if the Loki service exists as a fallback
      const serviceResult = await window.api.executeCommand('kubectl', [
        'get',
        'service',
        '-n',
        'monitoring',
        'loki'
      ]);
      
      if (serviceResult.stdout && serviceResult.stdout.includes('loki')) {
        addComponentLog('Loki service exists. Installation may be successful despite pod check failure.');
      } else {
        throw new Error('Failed to find Loki service. Installation appears to have failed.');
      }
    }
    
    addComponentLog('Loki installed successfully.');
    return { success: true };
  } catch (error) {
    addComponentLog(`Error installing Loki: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Install Promtail
 * @param {object} params - Parameters for installation
 * @param {Function} params.addComponentLog - Function to add logs
 * @param {Function} params.updateCurrentStep - Function to update installation step
 * @param {Function} params.waitForPod - Function to wait for a pod
 * @returns {Promise<object>} - Result of installation
 */
export async function installPromtail({
  addComponentLog,
  updateCurrentStep,
  waitForPod
}) {
  try {
    addComponentLog('Starting Promtail installation...');
    updateCurrentStep('Installing Promtail');
    
    // Check if Loki service exists
    addComponentLog('Checking if Loki service exists...');
    const lokiGatewayResult = await window.api.executeCommand('kubectl', [
      'get',
      'service',
      'loki-gateway',
      '-n',
      'monitoring',
      '--ignore-not-found'
    ]);
    
    let lokiUrl = '';
    if (lokiGatewayResult.stdout && lokiGatewayResult.stdout.includes('loki-gateway')) {
      lokiUrl = 'http://loki-gateway.monitoring.svc.cluster.local';
      addComponentLog('Using Loki gateway service.');
    } else {
      // Check for standard Loki service
      const lokiServiceResult = await window.api.executeCommand('kubectl', [
        'get',
        'service',
        'loki',
        '-n',
        'monitoring',
        '--ignore-not-found'
      ]);
      
      if (lokiServiceResult.stdout && lokiServiceResult.stdout.includes('loki')) {
        lokiUrl = 'http://loki.monitoring.svc.cluster.local:3100';
        addComponentLog('Using standard Loki service.');
      } else {
        throw new Error('Loki service not found. Please ensure Loki is installed before Promtail.');
      }
    }
    
    // Create values.yaml for Promtail installation
    addComponentLog('Creating Promtail values configuration...');
    const promtailValues = `
config:
  clients:
    - url: ${lokiUrl}/loki/api/v1/push
  
serviceMonitor:
  enabled: true
`;
    
    // Write values file to a temporary location
    const tempValuesPath = '/tmp/promtail-values.yaml';
    await window.api.executeCommand('bash', [
      '-c',
      `echo '${promtailValues}' > ${tempValuesPath}`
    ]);
    
    // Display values for debugging
    addComponentLog(`Using Promtail configuration:\n${promtailValues}`);
    
    // Install Promtail using helm with values file and force flag to attempt to fix conflicts
    addComponentLog('Installing Promtail with Helm...');
    const helmInstallResult = await window.api.executeCommand('helm', [
      'install',
      'promtail',
      'grafana/promtail',
      '--namespace',
      'monitoring',
      '--create-namespace',
      '--values',
      tempValuesPath,
      '--atomic',
      '--timeout',
      '5m'
    ]);
    
    // Check if the Helm install was successful
    if (helmInstallResult.code !== 0) {
      // If it still fails, try uninstalling and reinstalling
      addComponentLog('Initial installation failed. Attempting to uninstall existing release...');
      
      await window.api.executeCommand('helm', [
        'uninstall',
        'promtail',
        '-n',
        'monitoring',
        '--ignore-not-found'
      ]).catch(e => {
        addComponentLog(`Note during uninstall: ${e.message}`);
      });
      
      // Small delay to allow resources to be cleaned up
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Try installation again
      addComponentLog('Retrying Promtail installation...');
      const retryResult = await window.api.executeCommand('helm', [
        'install',
        'promtail',
        'grafana/promtail',
        '--namespace',
        'monitoring',
        '--create-namespace',
        '--values',
        tempValuesPath,
        '--atomic',
        '--timeout',
        '5m'
      ]);
      
      if (retryResult.code !== 0) {
        throw new Error(`Helm install failed after retry: ${retryResult.stderr}`);
      }
    }
    
    addComponentLog('Promtail Helm chart installed. Verifying deployment...');
    
    // Wait for Promtail pods to be ready
    addComponentLog('Waiting for Promtail pods to be ready...');
    try {
      // Try multiple label selectors for Promtail
      const labelSelectors = [
        'app=promtail',
        'app.kubernetes.io/name=promtail',
        'app.kubernetes.io/instance=promtail'
      ];
      
      let promtailFound = false;
      
      for (const selector of labelSelectors) {
        addComponentLog(`Checking for pods with selector: ${selector}`);
        const podsResult = await window.api.executeCommand('kubectl', [
          'get',
          'pods',
          '-n',
          'monitoring',
          '-l',
          selector,
          '--no-headers'
        ]);
        
        if (podsResult.stdout && podsResult.stdout.trim() !== '') {
          addComponentLog(`Found Promtail pods with selector ${selector}:\n${podsResult.stdout}`);
          promtailFound = true;
          
          // Promtail typically runs as a DaemonSet, so we don't need to wait for a specific pod
          // Just check if at least one pod is running
          if (podsResult.stdout.includes('Running')) {
            addComponentLog(`Promtail pods are running with selector: ${selector}`);
            break;
          }
        }
      }
      
      if (!promtailFound) {
        addComponentLog('Warning: No Promtail pods found with any known selectors. Installation may have failed.');
        
        // Check pod statuses in the monitoring namespace
        const allPodsStatus = await window.api.executeCommand('kubectl', [
          'get',
          'pods',
          '-n',
          'monitoring'
        ]);
        
        addComponentLog(`All pods in monitoring namespace:\n${allPodsStatus.stdout}`);
        
        // Check events in the monitoring namespace
        const namespaceEvents = await window.api.executeCommand('kubectl', [
          'get',
          'events',
          '-n',
          'monitoring',
          '--sort-by=.metadata.creationTimestamp'
        ]);
        
        addComponentLog(`Recent events in monitoring namespace:\n${namespaceEvents.stdout}`);
      } else {
        addComponentLog('Promtail pods deployed successfully.');
      }
    } catch (error) {
      addComponentLog(`Warning: Error checking Promtail pods: ${error.message}`);
      // Continue anyway - Promtail runs as a DaemonSet and may take time to deploy on all nodes
    }
    
    addComponentLog('Promtail installed successfully.');
    return { success: true };
  } catch (error) {
    addComponentLog(`Error installing Promtail: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Install Grafana
 * @param {object} params - Parameters for installation
 * @param {Function} params.addComponentLog - Function to add logs
 * @param {Function} params.updateCurrentStep - Function to update installation step
 * @param {string} params.storageClassName - Storage class to use
 * @param {Function} params.waitForPod - Function to wait for a pod
 * @param {object} params.domain - Domain configuration
 * @returns {Promise<object>} - Result of installation
 */
export async function installGrafana({
  addComponentLog,
  updateCurrentStep,
  storageClassName,
  waitForPod,
  domain
}) {
  try {
    addComponentLog('Starting Grafana installation...');
    updateCurrentStep('Installing Grafana');
    
    // Check if Grafana is already installed and uninstall it
    addComponentLog('Checking for existing Grafana installation...');
    const existingGrafana = await isGrafanaInstalled(addComponentLog);
    
    if (existingGrafana.installed || existingGrafana.podName) {
      addComponentLog('Found existing Grafana installation. Uninstalling...');
      await uninstallGrafana(addComponentLog, updateCurrentStep);
      
      // Wait for resources to be fully removed
      addComponentLog('Waiting for existing Grafana resources to be fully removed...');
      await new Promise(resolve => setTimeout(resolve, 15000));
    }
    
    // Double-check and forcefully remove any remaining Grafana resources
    addComponentLog('Checking for any remaining Grafana resources...');
    
    // Check for and delete any lingering Grafana deployments, statefulsets, daemonsets
    const resourceTypes = ['deployment', 'statefulset', 'daemonset', 'configmap', 'service', 'serviceaccount', 'secret', 'ingress'];
    const labelSelectors = [
      'app=grafana',
      'app.kubernetes.io/name=grafana',
      'app.kubernetes.io/instance=grafana'
    ];
    
    for (const resourceType of resourceTypes) {
      for (const selector of labelSelectors) {
        addComponentLog(`Checking for lingering ${resourceType} with selector ${selector}...`);
        try {
          const resourcesResult = await window.api.executeCommand('kubectl', [
            'get',
            resourceType,
            '-n',
            'monitoring',
            '-l',
            selector,
            '--no-headers',
            '--ignore-not-found'
          ]);
          
          if (resourcesResult.stdout && resourcesResult.stdout.trim() !== '') {
            addComponentLog(`Found lingering Grafana ${resourceType}s with selector ${selector}. Removing...`);
            await window.api.executeCommand('kubectl', [
              'delete',
              resourceType,
              '-n',
              'monitoring',
              '-l',
              selector,
              '--force',
              '--grace-period=0'
            ]).catch(e => {
              addComponentLog(`Note during cleanup: ${e.message}`);
            });
          }
        } catch (e) {
          addComponentLog(`Error checking for ${resourceType} with selector ${selector}: ${e.message}`);
        }
      }
    }
    
    // Clean up Grafana credentials secret specifically
    addComponentLog('Cleaning up Grafana credentials secret...');
    try {
      await window.api.executeCommand('kubectl', [
        'delete',
        'secret',
        'grafana-admin-credentials',
        '-n',
        'monitoring',
        '--ignore-not-found'
      ]).catch(e => {
        addComponentLog(`Note during credentials cleanup: ${e.message}`);
      });
    } catch (e) {
      addComponentLog(`Error cleaning up Grafana credentials: ${e.message}`);
    }
    
    // Clean up any Grafana PVCs to ensure fresh storage
    addComponentLog('Cleaning up Grafana PVCs...');
    try {
      const pvcResult = await window.api.executeCommand('kubectl', [
        'get',
        'pvc',
        '-n',
        'monitoring',
        '--no-headers'
      ]);
      
      if (pvcResult.stdout) {
        const lines = pvcResult.stdout.split('\n');
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          if (parts.length > 0 && parts[0].includes('grafana')) {
            const pvcName = parts[0];
            addComponentLog(`Deleting Grafana PVC: ${pvcName}`);
            
            // Remove finalizers with timeout
            try {
              const patchPromise = window.api.executeCommand('kubectl', [
                'patch',
                'pvc',
                pvcName,
                '-n',
                'monitoring',
                '-p',
                '{"metadata":{"finalizers":null}}',
                '--type=merge'
              ]);
              
              // Set timeout for this operation
              const patchTimeout = setTimeout(() => {
                addComponentLog(`Warning: PVC patch operation timed out for ${pvcName}`);
              }, 10000);
              
              await patchPromise.catch(() => {});
              clearTimeout(patchTimeout);
              
              // Delete the PVC with timeout
              const deletePromise = window.api.executeCommand('kubectl', [
                'delete',
                'pvc',
                pvcName,
                '-n',
                'monitoring',
                '--force',
                '--grace-period=0'
              ]);
              
              // Set timeout for this operation
              const deleteTimeout = setTimeout(() => {
                addComponentLog(`Warning: PVC delete operation timed out for ${pvcName}`);
              }, 10000);
              
              await deletePromise.catch(() => {});
              clearTimeout(deleteTimeout);
            } catch (e) {
              addComponentLog(`Error deleting PVC ${pvcName}: ${e.message}`);
            }
          }
        }
      }
    } catch (e) {
      addComponentLog(`Error cleaning up PVCs: ${e.message}`);
    }
    
    // Check if Loki service exists to add as a data source
    addComponentLog('Checking if Loki service exists...');
    let lokiServiceExists = false;
    let lokiUrl = '';
    
    try {
      // First try for loki-gateway service (from newer loki chart)
      const lokiGatewayResult = await window.api.executeCommand('kubectl', [
        'get',
        'service',
        'loki-gateway',
        '-n',
        'monitoring',
        '--ignore-not-found'
      ]);
      
      lokiServiceExists = lokiGatewayResult.stdout && lokiGatewayResult.stdout.includes('loki-gateway');
      
      if (lokiServiceExists) {
        addComponentLog('Found Loki Gateway service. Will configure Grafana to use it.');
        lokiUrl = 'http://loki-gateway.monitoring.svc.cluster.local';
      } else {
        // Try for standard loki service (from loki-stack chart)
        const lokiSvcResult = await window.api.executeCommand('kubectl', [
          'get',
          'service',
          'loki',
          '-n',
          'monitoring',
          '--ignore-not-found'
        ]);
        
        lokiServiceExists = lokiSvcResult.stdout && lokiSvcResult.stdout.includes('loki');
        
        if (lokiServiceExists) {
          addComponentLog('Found standard Loki service. Will configure Grafana to use it.');
          lokiUrl = 'http://loki.monitoring.svc.cluster.local:3100';
        } else {
          addComponentLog('Warning: No Loki service found. Loki datasource will not be configured in Grafana.');
        }
      }
    } catch (e) {
      addComponentLog(`Error checking for Loki service: ${e.message}`);
    }
    
    // Check for Prometheus service
    addComponentLog('Checking if Prometheus service exists...');
    let prometheusServiceExists = false;
    let prometheusUrl = '';
    
    try {
      const prometheusResult = await window.api.executeCommand('kubectl', [
        'get',
        'service',
        'prometheus-server',
        '-n',
        'monitoring',
        '--ignore-not-found'
      ]);
      
      prometheusServiceExists = prometheusResult.stdout && prometheusResult.stdout.includes('prometheus-server');
      
      if (prometheusServiceExists) {
        addComponentLog('Found Prometheus server service. Will configure Grafana to use it.');
        prometheusUrl = 'http://prometheus-server.monitoring.svc.cluster.local';
      } else {
        addComponentLog('Warning: No Prometheus service found. Prometheus datasource will not be configured in Grafana.');
      }
    } catch (e) {
      addComponentLog(`Error checking for Prometheus service: ${e.message}`);
    }
    
    // Generate Grafana admin password
    addComponentLog('Generating Grafana admin password...');
    const passwordLength = 16;
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+';
    let adminPassword = '';
    for (let i = 0; i < passwordLength; i++) {
      const randomIndex = Math.floor(Math.random() * charset.length);
      adminPassword += charset[randomIndex];
    }
    
    // Create the monitoring namespace (even though it should already exist)
    addComponentLog('Ensuring monitoring namespace exists...');
    try {
      await window.api.executeCommand('kubectl', [
        'create',
        'namespace',
        'monitoring',
        '--dry-run=client',
        '-o',
        'yaml'
      ]).then(result => {
        return window.api.executeCommand('kubectl', ['apply', '-f', '-'], { input: result.stdout });
      }).catch(e => {
        addComponentLog(`Note: ${e.message}`);
      });
    } catch (e) {
      addComponentLog(`Error ensuring namespace: ${e.message}`);
    }
    
    // Create the admin credentials secret
    addComponentLog('Creating Grafana admin credentials secret...');
    const secretYaml = `
apiVersion: v1
kind: Secret
metadata:
  name: grafana-admin-credentials
  namespace: monitoring
type: Opaque
data:
  admin-user: ${Buffer.from('admin').toString('base64')}
  admin-password: ${Buffer.from(adminPassword).toString('base64')}
`;
    
    try {
      await window.api.executeCommand('kubectl', ['apply', '-f', '-'], { input: secretYaml }).catch(e => {
        addComponentLog(`Error creating Grafana credentials: ${e.message}`);
        throw new Error('Failed to create Grafana admin credentials');
      });
    } catch (e) {
      addComponentLog(`Error creating secret: ${e.message}`);
      throw e;
    }
    
    // Create values file for Grafana
    addComponentLog('Creating Grafana values configuration...');
    
    // Build datasources configuration
    let datasourcesConfig = `
datasources:
  datasources.yaml:
    apiVersion: 1
    datasources:`;
    
    if (prometheusServiceExists) {
      datasourcesConfig += `
    - name: Prometheus
      type: prometheus
      url: ${prometheusUrl}
      access: proxy
      isDefault: true`;
    }
    
    if (lokiServiceExists) {
      datasourcesConfig += `
    - name: Loki
      type: loki
      url: ${lokiUrl}
      access: proxy`;
    }
    
    const grafanaValues = `
persistence:
  enabled: true
  storageClassName: ${storageClassName}
  size: 5Gi

admin:
  existingSecret: grafana-admin-credentials
  userKey: admin-user
  passwordKey: admin-password

ingress:
  enabled: true
  hosts:
    - grafana.${domain.name}
  tls:
    - secretName: wildcard-domain-certificate-prod
      hosts:
        - grafana.${domain.name}
${datasourcesConfig}

serviceMonitor:
  enabled: true

# Add some timeout configuration
timeouts:
  connectTimeout: 30s
  readTimeout: 30s

# Add resource constraints to avoid potential OOM issues
resources:
  limits:
    cpu: 200m
    memory: 256Mi
  requests:
    cpu: 100m
    memory: 128Mi
`;
    
    // Write values file to a temporary location
    const tempValuesPath = '/tmp/grafana-values.yaml';
    addComponentLog('Writing Grafana values to temporary file...');
    try {
      await window.api.executeCommand('bash', [
        '-c',
        `echo '${grafanaValues}' > ${tempValuesPath}`
      ]);
      
      // Display values for debugging
      addComponentLog(`Using Grafana configuration:\n${grafanaValues}`);
    } catch (e) {
      addComponentLog(`Error writing values file: ${e.message}`);
      throw e;
    }
    
    // Install Grafana using helm with values file
    addComponentLog('Installing Grafana with Helm...');
    try {
      const helmInstallResult = await window.api.executeCommand('helm', [
        'install',
        'grafana',
        'grafana/grafana',
        '--namespace',
        'monitoring',
        '--create-namespace',
        '--values',
        tempValuesPath,
        '--timeout',
        '10m'
      ]);
      
      // Check if the Helm install was successful
      if (helmInstallResult.code !== 0) {
        throw new Error(`Helm install failed: ${helmInstallResult.stderr}`);
      }
      
      addComponentLog('Grafana Helm chart installed successfully.');
    } catch (e) {
      addComponentLog(`Error during Helm install: ${e.message}`);
      throw e;
    }
    
    addComponentLog('Verifying Grafana deployment...');
    try {
      // Check what's deployed in the namespace
      const deployedResources = await window.api.executeCommand('kubectl', [
        'get',
        'all',
        '-n',
        'monitoring',
        '-l',
        'app.kubernetes.io/name=grafana'
      ]);
      
      addComponentLog(`Deployed Grafana resources:\n${deployedResources.stdout}`);
    } catch (e) {
      addComponentLog(`Error checking deployed resources: ${e.message}`);
    }
    
    // Wait for Grafana pod to be ready with timeout
    addComponentLog('Waiting for Grafana pod to be ready...');
    let grafanaReady = false;
    
    try {
      // Try multiple label selectors for Grafana with timeout
      const labelSelectors = [
        'app.kubernetes.io/name=grafana',
        'app=grafana'
      ];
      
      for (const selector of labelSelectors) {
        addComponentLog(`Checking for pods with selector: ${selector}`);
        
        try {
          const podsResult = await window.api.executeCommand('kubectl', [
            'get',
            'pods',
            '-n',
            'monitoring',
            '-l',
            selector,
            '--no-headers'
          ]);
          
          if (podsResult.stdout && podsResult.stdout.trim() !== '') {
            addComponentLog(`Found Grafana pods with selector ${selector}:\n${podsResult.stdout}`);
            
            // Wait for pod with timeout
            const waitPromise = waitForPod({
              namespace: 'monitoring',
              labelSelector: selector,
              timeout: 300
            });
            
            // Set timeout for this operation
            const waitTimeout = setTimeout(() => {
              addComponentLog(`Warning: Waiting for Grafana pod ready timed out for selector ${selector}`);
            }, 310000); // 310 seconds
            
            const grafanaPod = await waitPromise;
            clearTimeout(waitTimeout);
            
            if (grafanaPod.success) {
              addComponentLog(`Grafana pod is ready with selector: ${selector}`);
              grafanaReady = true;
              break;
            }
          }
        } catch (e) {
          addComponentLog(`Error checking for pods with selector ${selector}: ${e.message}`);
        }
      }
      
      if (!grafanaReady) {
        addComponentLog('Warning: Could not confirm Grafana pods are ready. Checking for services...');
        
        // Check if the Grafana service exists as a fallback
        const serviceResult = await window.api.executeCommand('kubectl', [
          'get',
          'service',
          '-n',
          'monitoring',
          'grafana'
        ]);
        
        if (serviceResult.stdout && serviceResult.stdout.includes('grafana')) {
          addComponentLog('Grafana service exists. Installation may be successful despite pod check failure.');
          grafanaReady = true;
        } else {
          throw new Error('Failed to find Grafana service. Installation appears to have failed.');
        }
      }
    } catch (e) {
      addComponentLog(`Error waiting for Grafana: ${e.message}`);
      throw e;
    }
    
    if (grafanaReady) {
      addComponentLog('Grafana installed successfully.');
      return {
        success: true,
        url: `https://grafana.${domain.name}`,
        credentials: {
          username: 'admin',
          password: adminPassword
        }
      };
    } else {
      throw new Error('Grafana installation could not be verified.');
    }
  } catch (error) {
    addComponentLog(`Error installing Grafana: ${error.message}`);
    return { success: false, error: error.message };
  }
}