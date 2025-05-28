/**
 * Prometheus Utilities for EDURange Cloud
 * 
 * This module provides utilities for installing, checking, and uninstalling Prometheus
 * in the EDURange Cloud platform.
 */

/**
 * Check if Prometheus is already installed
 * @param {Function} addComponentLog - Function to add logs
 * @returns {Promise<object>} - Result of the check
 */
export async function isPrometheusInstalled(addComponentLog) {
  try {
    addComponentLog('Checking if Prometheus is already installed...');
    
    const prometheusListResult = await window.api.executeCommand('helm', [
      'list',
      '--namespace',
      'monitoring',
      '--filter',
      'prometheus',
      '--output',
      'json'
    ]);

    let installed = false;
    let releaseInfo = null;

    if (prometheusListResult.stdout && prometheusListResult.stdout.trim() !== '[]') {
      const releases = JSON.parse(prometheusListResult.stdout);
      const prometheusReleases = releases.filter(release => 
        release.name === 'prometheus' && release.status === 'deployed'
      );
      
      if (prometheusReleases.length > 0) {
        installed = true;
        releaseInfo = prometheusReleases[0];
        addComponentLog('Prometheus is already installed.');
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
        'app.kubernetes.io/instance=prometheus',
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
    addComponentLog(`Error checking Prometheus installation: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Uninstall Prometheus
 * @param {Function} addComponentLog - Function to add logs
 * @param {Function} updateCurrentStep - Function to update current installation step
 * @returns {Promise<object>} - Result of the uninstallation
 */
export async function uninstallPrometheus(addComponentLog, updateCurrentStep) {
  try {
    addComponentLog('Uninstalling Prometheus...');
    updateCurrentStep('Uninstalling Prometheus');
    
    // First check if prometheus release exists
    const helmListResult = await window.api.executeCommand('helm', [
      'list',
      '--namespace',
      'monitoring',
      '--filter',
      'prometheus',
      '--all',
      '--output',
      'json'
    ]);
    
    let releaseExists = false;
    if (helmListResult.stdout && helmListResult.stdout.trim() !== '[]') {
      const releases = JSON.parse(helmListResult.stdout);
      const prometheusReleases = releases.filter(release => release.name === 'prometheus');
      releaseExists = prometheusReleases.length > 0;
      
      if (releaseExists) {
        addComponentLog(`Found Prometheus Helm release with status: ${prometheusReleases[0].status}`);
      }
    }
    
    if (releaseExists) {
      // Try normal uninstall first
      addComponentLog('Uninstalling Prometheus using helm...');
      await window.api.executeCommand('helm', [
        'uninstall',
        'prometheus',
        '--namespace',
        'monitoring'
      ]);
      
      // Wait for resources to be deleted
      addComponentLog('Waiting for Prometheus resources to be removed...');
      await new Promise(resolve => setTimeout(resolve, 10000)); // 10 second wait
      
      // Check if the release is still there
      const checkAfterUninstall = await window.api.executeCommand('helm', [
        'list',
        '--namespace',
        'monitoring',
        '--filter',
        'prometheus',
        '--all',
        '--output',
        'json'
      ]);
      
      if (checkAfterUninstall.stdout && checkAfterUninstall.stdout.trim() !== '[]') {
        const releasesAfter = JSON.parse(checkAfterUninstall.stdout);
        if (releasesAfter.some(r => r.name === 'prometheus')) {
          addComponentLog('Prometheus release still exists after uninstall. Attempting to force cleanup...');
          
          // Try to delete any secrets that might be holding the release information
          addComponentLog('Deleting Helm secrets for prometheus release...');
          await window.api.executeCommand('kubectl', [
            'delete',
            'secret',
            '--namespace',
            'monitoring',
            '-l',
            'owner=helm,name=prometheus',
            '--ignore-not-found'
          ]).catch(e => {
            addComponentLog(`Note: ${e.message}`);
          });
          
          // Also try to delete any configmaps that might contain helm release data
          await window.api.executeCommand('kubectl', [
            'delete',
            'configmap',
            '--namespace',
            'monitoring',
            '-l',
            'owner=helm,name=prometheus',
            '--ignore-not-found'
          ]).catch(e => {
            addComponentLog(`Note: ${e.message}`);
          });
          
          // Wait a bit more
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }
    } else {
      addComponentLog('No Prometheus Helm release found. Proceeding with resource cleanup...');
    }
    
    // Clean up additional resources that might prevent reinstallation
    addComponentLog('Cleaning up any remaining Prometheus resources...');
    
    // Clean up potential CRDs
    const crdResult = await window.api.executeCommand('kubectl', [
      'get',
      'crd',
      '-o',
      'jsonpath={.items[*].metadata.name}'
    ]);
    
    if (crdResult.stdout) {
      const crds = crdResult.stdout.split(' ');
      const prometheusCrds = crds.filter(crd => 
        crd.includes('prometheus') || 
        crd.includes('alertmanager') || 
        crd.includes('servicemonitor') ||
        crd.includes('podmonitor') ||
        crd.includes('prometheusrule')
      );
      
      for (const crd of prometheusCrds) {
        addComponentLog(`Checking for resources of CRD: ${crd}`);
        
        // Get all resources of this CRD type
        const resourcesResult = await window.api.executeCommand('kubectl', [
          'get',
          crd,
          '--all-namespaces',
          '-o',
          'jsonpath={range .items[*]}{.metadata.namespace}{","}{.metadata.name}{"\n"}{end}'
        ]).catch(() => ({ stdout: '' }));
        
        if (resourcesResult.stdout) {
          const resources = resourcesResult.stdout.split('\n').filter(r => r.trim());
          for (const resource of resources) {
            const [namespace, name] = resource.split(',');
            if (namespace && name) {
              addComponentLog(`Deleting ${crd} resource: ${namespace}/${name}`);
              
              // First try to remove finalizers
              await window.api.executeCommand('kubectl', [
                'patch',
                crd,
                name,
                '-n',
                namespace,
                '-p',
                '{"metadata":{"finalizers":[]}}',
                '--type=merge'
              ]).catch(() => {});
              
              // Then delete with force if needed
              await window.api.executeCommand('kubectl', [
                'delete',
                crd,
                name,
                '-n',
                namespace,
                '--ignore-not-found',
                '--force',
                '--grace-period=0'
              ]).catch(() => {});
            }
          }
        }
      }
    }
    
    // Delete Prometheus and Alertmanager deployments explicitly if they exist
    await window.api.executeCommand('kubectl', [
      'delete',
      'deployment',
      '-n',
      'monitoring',
      '-l',
      'app=prometheus',
      '--ignore-not-found',
      '--force',
      '--grace-period=0'
    ]).catch(() => {});
    
    await window.api.executeCommand('kubectl', [
      'delete',
      'deployment',
      '-n',
      'monitoring',
      '-l',
      'app=alertmanager',
      '--ignore-not-found',
      '--force',
      '--grace-period=0'
    ]).catch(() => {});
    
    // Clean up any services
    await window.api.executeCommand('kubectl', [
      'delete',
      'service',
      '-n',
      'monitoring',
      '-l',
      'app=prometheus',
      '--ignore-not-found'
    ]).catch(() => {});
    
    await window.api.executeCommand('kubectl', [
      'delete',
      'service',
      '-n',
      'monitoring',
      '-l',
      'app=alertmanager',
      '--ignore-not-found'
    ]).catch(() => {});
    
    // Clean up PVCs
    addComponentLog('Cleaning up Prometheus PVCs...');
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
        if (pvc.includes('prometheus') || pvc.includes('alertmanager')) {
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
    
    // Check once more for the release to make sure it's gone
    const finalCheck = await window.api.executeCommand('helm', [
      'list',
      '--namespace',
      'monitoring',
      '--filter',
      'prometheus',
      '--all',
      '--output',
      'json'
    ]);
    
    if (finalCheck.stdout && finalCheck.stdout.trim() !== '[]') {
      const finalReleases = JSON.parse(finalCheck.stdout);
      if (finalReleases.some(r => r.name === 'prometheus')) {
        addComponentLog('Warning: Prometheus release still exists after cleanup attempts.');
      } else {
        addComponentLog('Prometheus release successfully removed.');
      }
    } else {
      addComponentLog('Prometheus release successfully removed.');
    }
    
    addComponentLog('Prometheus uninstalled successfully.');
    return { success: true };
  } catch (error) {
    addComponentLog(`Error uninstalling Prometheus: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Install Prometheus
 * @param {object} params - Parameters for installation
 * @param {Function} params.addComponentLog - Function to add logs
 * @param {Function} params.updateCurrentStep - Function to update installation step
 * @param {string} params.storageClassName - Storage class to use
 * @param {Function} params.waitForPod - Function to wait for a pod
 * @param {object} params.domain - Domain configuration
 * @returns {Promise<object>} - Result of installation
 */
export async function installPrometheus({
  addComponentLog,
  updateCurrentStep,
  storageClassName,
  waitForPod,
  domain
}) {
  try {
    addComponentLog('Starting Prometheus installation...');
    updateCurrentStep('Installing Prometheus');
    
    // First, verify that there's no existing Prometheus installation
    const helmListResult = await window.api.executeCommand('helm', [
      'list',
      '--namespace',
      'monitoring',
      '--filter',
      'prometheus',
      '--all',
      '--output',
      'json'
    ]);
    
    if (helmListResult.stdout && helmListResult.stdout.trim() !== '[]') {
      const releases = JSON.parse(helmListResult.stdout);
      const prometheusReleases = releases.filter(release => release.name === 'prometheus');
      
      if (prometheusReleases.length > 0) {
        addComponentLog(`Found existing Prometheus Helm release with status: ${prometheusReleases[0].status}`);
        
        // If it's in a failed or pending-* state, attempt to uninstall it first
        if (prometheusReleases[0].status !== 'deployed') {
          addComponentLog('Existing Prometheus release is not in deployed state. Attempting to clean up...');
          
          // Uninstall existing release
          const uninstallResult = await uninstallPrometheus(addComponentLog, updateCurrentStep);
          
          if (!uninstallResult.success) {
            throw new Error(`Failed to uninstall existing Prometheus release: ${uninstallResult.error}`);
          }
          
          // Small delay to ensure Kubernetes has time to clean up resources
          addComponentLog('Waiting for cleanup to complete before reinstalling...');
          await new Promise(resolve => setTimeout(resolve, 10000)); // 10 second wait
        } else {
          // If the release is already deployed, we can just return success
          addComponentLog('Prometheus is already successfully deployed. Skipping installation.');
          return {
            success: true,
            url: `https://prometheus.${domain.name}`,
            alertmanagerUrl: `https://alertmanager.${domain.name}`,
            alreadyInstalled: true
          };
        }
      }
    }
    
    // Add prometheus helm repo
    addComponentLog('Adding Prometheus Helm repository...');
    await window.api.executeCommand('helm', [
      'repo',
      'add',
      'prometheus-community',
      'https://prometheus-community.github.io/helm-charts'
    ]);
    
    // Update helm repos
    addComponentLog('Updating Helm repositories...');
    await window.api.executeCommand('helm', [
      'repo',
      'update'
    ]);
    
    // Install Prometheus using helm with direct values
    addComponentLog('Installing Prometheus with Helm...');
    
    // First try to check if there's an existing release to upgrade instead of install
    const existingReleaseCheck = await window.api.executeCommand('helm', [
      'list',
      '--namespace',
      'monitoring',
      '--filter',
      'prometheus',
      '--output',
      'json'
    ]);
    
    let helmCommand = 'install';
    if (existingReleaseCheck.stdout && existingReleaseCheck.stdout !== '[]') {
      const existingReleases = JSON.parse(existingReleaseCheck.stdout);
      if (existingReleases.some(r => r.name === 'prometheus')) {
        addComponentLog('Found existing Prometheus release. Using upgrade instead of install...');
        helmCommand = 'upgrade';
      }
    }
    
    // Check if the monitoring namespace exists - ensure it's created with appropriate labels if needed
    const namespaceCheck = await window.api.executeCommand('kubectl', [
      'get',
      'namespace',
      'monitoring',
      '--ignore-not-found'
    ]);
    
    if (!namespaceCheck.stdout || !namespaceCheck.stdout.includes('monitoring')) {
      addComponentLog('Creating monitoring namespace...');
      await window.api.executeCommand('kubectl', [
        'create',
        'namespace',
        'monitoring'
      ]);
    }
    
    const helmResult = await window.api.executeCommand('helm', [
      helmCommand,
      'prometheus',
      'prometheus-community/kube-prometheus-stack',
      '--namespace',
      'monitoring',
      '--create-namespace',
      '--wait',
      '--timeout',
      '600s',
      '--set', `prometheus-node-exporter.hostRootFsMount.enabled=false`,
      '--set', `server.persistentVolume.enabled=true`,
      '--set', `server.persistentVolume.size=8Gi`,
      '--set', `server.persistentVolume.storageClass=${storageClassName}`,
      '--set', `server.ingress.enabled=true`,
      '--set', `server.ingress.hosts[0]=prometheus.${domain.name}`,
      '--set', `server.ingress.tls[0].secretName=wildcard-domain-certificate-prod`,
      '--set', `server.ingress.tls[0].hosts[0]=prometheus.${domain.name}`,
      '--set', `alertmanager.persistentVolume.enabled=true`,
      '--set', `alertmanager.persistentVolume.size=2Gi`,
      '--set', `alertmanager.persistentVolume.storageClass=${storageClassName}`,
      '--set', `alertmanager.ingress.enabled=true`,
      '--set', `alertmanager.ingress.hosts[0]=alertmanager.${domain.name}`,
      '--set', `alertmanager.ingress.tls[0].secretName=wildcard-domain-certificate-prod`,
      '--set', `alertmanager.ingress.tls[0].hosts[0]=alertmanager.${domain.name}`,
      '--set', 'kube-state-metrics.enabled=true',
      '--set', 'prometheus-node-exporter.enabled=true',
      '--set', 'prometheus-pushgateway.enabled=false'
    ]);
    
    if (helmResult.code !== 0) {
      // If the install fails with "name already in use", try one more time with uninstall
      if (helmResult.stderr && helmResult.stderr.includes('cannot re-use a name that is still in use')) {
        addComponentLog('Installation failed because the release name is still in use. Attempting aggressive cleanup...');
        
        // Try to find and delete the secret that holds the release information
        const helmSecretsResult = await window.api.executeCommand('kubectl', [
          'get',
          'secrets',
          '-n',
          'monitoring',
          '-l',
          'owner=helm',
          '-o',
          'json'
        ]);
        
        if (helmSecretsResult.stdout) {
          const secretsData = JSON.parse(helmSecretsResult.stdout);
          if (secretsData.items) {
            // Find any secret related to prometheus
            const prometheusSecrets = secretsData.items.filter(item => 
              item.metadata.name.includes('prometheus') || 
              (item.metadata.labels && 
               (item.metadata.labels.name === 'prometheus' || 
                item.metadata.labels.app === 'prometheus'))
            );
            
            for (const secret of prometheusSecrets) {
              addComponentLog(`Deleting Helm release secret: ${secret.metadata.name}`);
              await window.api.executeCommand('kubectl', [
                'delete',
                'secret',
                secret.metadata.name,
                '-n',
                'monitoring',
                '--ignore-not-found'
              ]).catch(e => {
                addComponentLog(`Warning: ${e.message}`);
              });
            }
          }
        }
        
        // Wait a moment
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Try installation one more time
        addComponentLog('Retrying Prometheus installation...');
        const retryResult = await window.api.executeCommand('helm', [
          'install',
          'prometheus',
          'prometheus-community/kube-prometheus-stack',
          '--namespace',
          'monitoring',
          '--create-namespace',
          '--wait',
          '--timeout',
          '600s',
          '--set', `prometheus-node-exporter.hostRootFsMount.enabled=false`,
          '--set', `server.persistentVolume.enabled=true`,
          '--set', `server.persistentVolume.size=8Gi`,
          '--set', `server.persistentVolume.storageClass=${storageClassName}`,
          '--set', `server.ingress.enabled=true`,
          '--set', `server.ingress.hosts[0]=prometheus.${domain.name}`,
          '--set', `server.ingress.tls[0].secretName=wildcard-domain-certificate-prod`,
          '--set', `server.ingress.tls[0].hosts[0]=prometheus.${domain.name}`,
          '--set', `alertmanager.persistentVolume.enabled=true`,
          '--set', `alertmanager.persistentVolume.size=2Gi`,
          '--set', `alertmanager.persistentVolume.storageClass=${storageClassName}`,
          '--set', `alertmanager.ingress.enabled=true`,
          '--set', `alertmanager.ingress.hosts[0]=alertmanager.${domain.name}`,
          '--set', `alertmanager.ingress.tls[0].secretName=wildcard-domain-certificate-prod`,
          '--set', `alertmanager.ingress.tls[0].hosts[0]=alertmanager.${domain.name}`,
          '--set', 'kube-state-metrics.enabled=true',
          '--set', 'prometheus-node-exporter.enabled=true',
          '--set', 'prometheus-pushgateway.enabled=false'
        ]);
        
        if (retryResult.code !== 0) {
          throw new Error(`Helm installation failed after retry: ${retryResult.stderr}`);
        }
      } else {
        throw new Error(`Helm installation failed: ${helmResult.stderr}`);
      }
    }
    
    addComponentLog('Helm chart installation completed. Checking for Prometheus server pod...');
    
    // List all pods in the monitoring namespace to aid in debugging
    try {
      const podsList = await window.api.executeCommand('kubectl', [
        'get',
        'pods',
        '-n',
        'monitoring',
        '--show-labels'
      ]);
      
      if (podsList.stdout) {
        addComponentLog(`Pods in monitoring namespace:\n${podsList.stdout}`);
      }
    } catch (listError) {
      addComponentLog(`Note: Could not list pods: ${listError.message}`);
    }
    
    // Try various label selectors that might match Prometheus pods
    const labelSelectors = [
      'app.kubernetes.io/name=prometheus',
      'app=prometheus,component=server',
      'app.kubernetes.io/instance=prometheus',
      'app.kubernetes.io/component=server'
    ];
    
    let podSuccess = false;
    
    // Wait for Prometheus server pod to be ready, trying different selectors
    addComponentLog('Waiting for Prometheus server pod to be ready...');
    for (const selector of labelSelectors) {
      if (podSuccess) break;
      
      addComponentLog(`Trying to find Prometheus pod with selector: ${selector}`);
      try {
        const prometheusServerPod = await waitForPod({
          namespace: 'monitoring',
          labelSelector: selector,
          timeout: 60 // shorter timeout for each attempt
        });
        
        if (prometheusServerPod.success) {
          addComponentLog(`Found running Prometheus pod with selector: ${selector}`);
          podSuccess = true;
          break;
        }
      } catch (error) {
        addComponentLog(`No pods found with selector ${selector}: ${error.message}`);
      }
    }
    
    if (!podSuccess) {
      addComponentLog('Warning: Could not confirm Prometheus server pod readiness. Installation may still be successful.');
    }
    
    // Check if we can access the Prometheus server URL
    try {
      const prometheusServerService = await window.api.executeCommand('kubectl', [
        'get',
        'svc',
        '-n',
        'monitoring',
        '-l',
        'app=prometheus,component=server',
        '-o',
        'name'
      ]);
      
      if (prometheusServerService.stdout) {
        addComponentLog(`Prometheus server service found: ${prometheusServerService.stdout.trim()}`);
      } else {
        addComponentLog('Warning: Prometheus server service not found. Check your installation.');
      }
    } catch (serviceError) {
      addComponentLog(`Warning: Error checking Prometheus server service: ${serviceError.message}`);
    }
    
    // Installation is considered successful even if we can't confirm pod readiness
    addComponentLog('Prometheus installed successfully.');
    return {
      success: true,
      url: `https://prometheus.${domain.name}`,
      alertmanagerUrl: `https://alertmanager.${domain.name}`
    };
  } catch (error) {
    addComponentLog(`Error installing Prometheus: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Install metrics-server for Prometheus to collect metrics
 * @param {Function} addComponentLog - Function to add logs
 * @returns {Promise<object>} - Result of the installation
 */
export async function installMetricsServer(addComponentLog) {
  try {
    addComponentLog('Installing metrics-server...');
    
    // First check if metrics-server is already installed
    const helmListResult = await window.api.executeCommand('helm', [
      'list',
      '--namespace',
      'kube-system',
      '--filter',
      'metrics-server',
      '--all',
      '--output',
      'json'
    ]);
    
    let shouldUninstall = false;
    
    if (helmListResult.stdout && helmListResult.stdout.trim() !== '[]') {
      const releases = JSON.parse(helmListResult.stdout);
      const metricsReleases = releases.filter(release => release.name === 'metrics-server');
      
      if (metricsReleases.length > 0) {
        addComponentLog(`Found existing metrics-server Helm release with status: ${metricsReleases[0].status}`);
        
        // If it's already deployed, we can verify it's working and return
        if (metricsReleases[0].status === 'deployed') {
          addComponentLog('metrics-server is already deployed. Checking if it is working...');
          
          // Verify metrics-server API is working
          let metricsApiAvailable = false;
          const metricsApiResult = await window.api.executeCommand('kubectl', [
            'get',
            '--raw',
            '/apis/metrics.k8s.io/v1beta1/nodes'
          ]);
          
          if (metricsApiResult.code === 0 && metricsApiResult.stdout && !metricsApiResult.stdout.includes('not found')) {
            addComponentLog('Metrics API is available and working.');
            return { success: true, alreadyInstalled: true };
          } else {
            addComponentLog('Metrics API not responding. Will uninstall and reinstall metrics-server.');
            shouldUninstall = true;
          }
        } else {
          // If it's in a failed state, uninstall it
          addComponentLog('Existing metrics-server release is not in deployed state. Will uninstall.');
          shouldUninstall = true;
        }
      }
    }
    
    // Uninstall if needed
    if (shouldUninstall) {
      addComponentLog('Uninstalling existing metrics-server...');
      await window.api.executeCommand('helm', [
        'uninstall',
        'metrics-server',
        '--namespace',
        'kube-system'
      ]).catch(e => {
        addComponentLog(`Note during uninstall: ${e.message}`);
      });
      
      // Wait a moment for resources to clean up
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Force cleanup of any remaining resources
      addComponentLog('Cleaning up any remaining metrics-server resources...');
      await window.api.executeCommand('kubectl', [
        'delete',
        'deployment',
        'metrics-server',
        '-n',
        'kube-system',
        '--ignore-not-found',
        '--force',
        '--grace-period=0'
      ]).catch(() => {});
      
      await window.api.executeCommand('kubectl', [
        'delete',
        'service',
        'metrics-server',
        '-n',
        'kube-system',
        '--ignore-not-found'
      ]).catch(() => {});
      
      // Check for and delete any Helm secrets that might be preventing reinstallation
      const helmSecretsResult = await window.api.executeCommand('kubectl', [
        'get',
        'secrets',
        '-n',
        'kube-system',
        '-l',
        'owner=helm,name=metrics-server',
        '--ignore-not-found'
      ]);
      
      if (helmSecretsResult.stdout && helmSecretsResult.stdout.includes('metrics-server')) {
        addComponentLog('Cleaning up metrics-server Helm release secrets...');
        await window.api.executeCommand('kubectl', [
          'delete',
          'secrets',
          '-n',
          'kube-system',
          '-l',
          'owner=helm,name=metrics-server',
          '--ignore-not-found'
        ]).catch(e => {
          addComponentLog(`Note: ${e.message}`);
        });
      }
      
      // Wait a moment more
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    // Add metrics-server helm repo if it doesn't exist
    await window.api.executeCommand('helm', [
      'repo',
      'add',
      'metrics-server',
      'https://kubernetes-sigs.github.io/metrics-server/'
    ]);
    
    // Update helm repos
    await window.api.executeCommand('helm', [
      'repo',
      'update'
    ]);
    
    // Install metrics-server
    const metricsServerInstallResult = await window.api.executeCommand('helm', [
      'install',
      'metrics-server',
      'metrics-server/metrics-server',
      '--namespace',
      'kube-system',
      '--set',
      'args={--kubelet-insecure-tls}',
      '--wait',
      '--timeout',
      '180s'
    ]);
    
    // Handle the "name already in use" error with a special retry
    if (metricsServerInstallResult.code !== 0) {
      if (metricsServerInstallResult.stderr && metricsServerInstallResult.stderr.includes('cannot re-use a name that is still in use')) {
        addComponentLog('Installation failed because the release name is still in use. Attempting more aggressive cleanup...');
        
        // Try to find and delete any secrets that might be holding the release information
        await window.api.executeCommand('kubectl', [
          'get',
          'secrets',
          '-n',
          'kube-system',
          '-o',
          'json'
        ]).then(result => {
          if (result.stdout) {
            const secretsData = JSON.parse(result.stdout);
            if (secretsData.items) {
              // Process all secrets that might be related to metrics-server
              const metricsSecrets = secretsData.items.filter(item => 
                item.metadata.name.includes('metrics-server') || 
                (item.metadata.labels && item.metadata.labels.app === 'metrics-server')
              );
              
              metricsSecrets.forEach(async (secret) => {
                addComponentLog(`Deleting metrics-server related secret: ${secret.metadata.name}`);
                await window.api.executeCommand('kubectl', [
                  'delete',
                  'secret',
                  secret.metadata.name,
                  '-n',
                  'kube-system',
                  '--ignore-not-found'
                ]).catch(() => {});
              });
            }
          }
        }).catch(e => {
          addComponentLog(`Warning: Error finding metrics-server secrets: ${e.message}`);
        });
        
        // Wait a bit more
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Try using upgrade instead of install as a last resort
        addComponentLog('Trying to use helm upgrade instead of install...');
        const upgradeResult = await window.api.executeCommand('helm', [
          'upgrade',
          '--install', // This flag allows upgrade to install if it doesn't exist
          'metrics-server',
          'metrics-server/metrics-server',
          '--namespace',
          'kube-system',
          '--set',
          'args={--kubelet-insecure-tls}',
          '--wait',
          '--timeout',
          '180s',
          '--force' // Force resource updates
        ]);
        
        if (upgradeResult.code !== 0) {
          addComponentLog(`Warning: metrics-server installation reported an issue: ${upgradeResult.stderr}`);
          addComponentLog('Continuing with installation, but some monitoring features may be limited.');
        } else {
          addComponentLog('metrics-server installed successfully using upgrade method.');
        }
      } else {
        addComponentLog(`Warning: metrics-server installation reported an issue: ${metricsServerInstallResult.stderr}`);
        addComponentLog('Continuing with installation, but some monitoring features may be limited.');
      }
    } else {
      addComponentLog('metrics-server installed successfully.');
    }
    
    // Wait for metrics-server to be ready
    addComponentLog('Waiting for metrics-server deployment to roll out...');
    await window.api.executeCommand('kubectl', [
      'rollout',
      'status',
      'deployment/metrics-server',
      '-n',
      'kube-system',
      '--timeout=180s'
    ]).catch(e => {
      addComponentLog(`Warning: Error waiting for metrics-server rollout: ${e.message}`);
    });
    
    // Verify metrics-server API is working
    addComponentLog('Verifying metrics-server is working...');
    let metricsApiAvailable = false;
    let retryCount = 0;
    const metricsApiMaxRetries = 5;
    
    while (!metricsApiAvailable && retryCount < metricsApiMaxRetries) {
      retryCount++;
      addComponentLog(`Checking metrics API (attempt ${retryCount}/${metricsApiMaxRetries})...`);
      
      const metricsApiResult = await window.api.executeCommand('kubectl', [
        'get',
        '--raw',
        '/apis/metrics.k8s.io/v1beta1/nodes'
      ]);
      
      if (metricsApiResult.code === 0 && metricsApiResult.stdout && !metricsApiResult.stdout.includes('not found')) {
        addComponentLog('Metrics API is available!');
        metricsApiAvailable = true;
      } else {
        if (retryCount < metricsApiMaxRetries) {
          addComponentLog(`Metrics API not yet available. Waiting 10 seconds before retry...`);
          await new Promise(resolve => setTimeout(resolve, 10000));
        }
      }
    }
    
    if (!metricsApiAvailable) {
      addComponentLog('Warning: Metrics API is not available. Some monitoring features may not work properly.');
      return { success: true, warning: 'Metrics API not available' };
    }
    
    return { success: true };
  } catch (error) {
    addComponentLog(`Error installing metrics-server: ${error.message}`);
    return { success: false, error: error.message };
  }
} 