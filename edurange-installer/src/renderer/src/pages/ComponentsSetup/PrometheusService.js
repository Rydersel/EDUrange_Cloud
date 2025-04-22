import useInstallStore from '../../store/installStore';
import { cleanupUnusedStorage, isRunningOnProvider } from '../../utils/storageCleanupUtils';
import { installPrometheus, installMetricsServer } from '../../utils/prometheusUtils';

export const installPrometheusService = async ({
  setActiveComponent,
  setInstallationStatus,
  addLog,
  setLogs,
  logs,
  checkAndUpdateWildcardCertificate,
  domain,
  registry,
  setIsInstalling,
  isExistingPrometheus = false,
  isPrometheusUninstall = false,
  existingPrometheusPod = '',
  updateCurrentStep = () => {}
}) => {
  setActiveComponent('prometheusService');
  setInstallationStatus('prometheus', 'installing');

  const addComponentLog = (message) => {
    addLog(message);
    setLogs(prev => ({
      ...prev,
      prometheusService: [...(prev.prometheusService || []), message]
    }));
  };

  try {
    addComponentLog('Starting Prometheus Service installation...');
    
    // Check Kubernetes availability
    let isK8sFound = true; // Default to true
    try {
      const storeState = useInstallStore.getState();
      // Only set to false if explicitly false
      if (storeState && storeState.isK8s === false) {
        isK8sFound = false;
      }
    } catch (e) {
      addComponentLog(`DEBUG: Error checking K8s state: ${e.message}`);
      // Keep default true if there's an error
    }
    
    // Early exit if required - no Kubernetes found
    if (!isK8sFound) {
      return { success: false, message: 'Kubernetes not found. Please install Kubernetes first.' };
    }

    // Helper function to uninstall any existing Prometheus installations
    const uninstallPrometheus = async () => {
      if (existingPrometheusPod || isPrometheusUninstall) {
        addComponentLog('Uninstalling existing Prometheus...');
        updateCurrentStep('Uninstalling Prometheus');
        const prometheusUninstallCmd = 'helm uninstall prometheus -n monitoring';
        await window.api.executeCommand(prometheusUninstallCmd);
        addComponentLog('Existing Prometheus uninstalled.');
      }
    };
    
    // Check if only uninstall was requested
    if (isPrometheusUninstall && !isExistingPrometheus) {
      await uninstallPrometheus();
      setInstallationStatus('prometheus', 'uninstalled');
      return { success: true, message: 'Prometheus uninstalled successfully.' };
    }

    // Before namespace cleanup, uninstall existing Prometheus installations
    await uninstallPrometheus();

    // Check and create monitoring namespace if needed
    addComponentLog('Ensuring monitoring namespace exists...');
    await window.api.executeCommand('kubectl', [
      'create', 
      'namespace', 
      'monitoring', 
      '--dry-run=client', 
      '-o', 
      'yaml'
    ]).then(result => {
      return window.api.applyManifestFromString(result.stdout);
    }).catch(e => {
      addComponentLog(`Note: ${e.message}`);
    });

    // Check if we're running on a cloud provider with storage limits
    addComponentLog('Checking cloud provider environment...');
    const isLinode = await isRunningOnProvider('linode', addComponentLog);

    // Run storage cleanup if we're on Linode or another cloud provider
    if (isLinode) {
      addComponentLog('Detected Linode environment. Running storage cleanup...');
      try {
        const cleanupResult = await cleanupUnusedStorage(addComponentLog);
        if (cleanupResult.success) {
          addComponentLog(cleanupResult.message);
        } else {
          addComponentLog(`Warning: Storage cleanup encountered an error: ${cleanupResult.error}`);
          addComponentLog('Continuing with installation anyway...');
        }
      } catch (cleanupError) {
        addComponentLog(`Warning: Storage cleanup encountered an unexpected error: ${cleanupError.message}`);
        addComponentLog('Continuing with installation anyway...');
      }
    }

    // Check and update wildcard certificate
    addComponentLog('Checking wildcard certificate...');
    await checkAndUpdateWildcardCertificate();

    // Get the default storage class
    addComponentLog('Checking for available storage classes...');
    const storageClassResult = await window.api.executeCommand('kubectl', [
      'get',
      'storageclass',
      'linode-block-storage',
      '--no-headers',
      '--ignore-not-found'
    ]);
    
    let storageClassName = '';
    if (storageClassResult.code === 0 && storageClassResult.stdout.trim()) {
      addComponentLog('Using linode-block-storage storage class for Prometheus volumes.');
      storageClassName = 'linode-block-storage';
    } else {
      // Get the default storage class
      const defaultStorageClassResult = await window.api.executeCommand('kubectl', [
        'get',
        'storageclass',
        '-o',
        'jsonpath={.items[?(@.metadata.annotations.storageclass\\.kubernetes\\.io/is-default-class=="true")].metadata.name}'
      ]);
      
      if (defaultStorageClassResult.code === 0 && defaultStorageClassResult.stdout.trim()) {
        storageClassName = defaultStorageClassResult.stdout.trim();
        addComponentLog(`Using default storage class '${storageClassName}' for Prometheus volumes.`);
      } else {
        addComponentLog('No default storage class found. Prometheus may not be able to provision storage.');
        storageClassName = ''; // Let Helm use the default from the chart
      }
    }

    // Install metrics server
    addComponentLog('Installing metrics-server...');
    const metricsServerResult = await installMetricsServer(addComponentLog);

    if (!metricsServerResult.success) {
      addComponentLog(`Warning: metrics-server installation reported an issue: ${metricsServerResult.error}`);
      addComponentLog('Will continue with installation anyway, but some monitoring features may be limited.');
    } else {
      addComponentLog('metrics-server installed successfully.');
    }

    // Define a waitForPod function for Prometheus
    const waitForPod = async (params) => {
      const { namespace, labelSelector, timeout } = params;
      try {
        let retries = 0;
        const maxRetries = Math.floor(timeout / 5);
        
        while (retries < maxRetries) {
          retries++;
          addComponentLog(`Checking for pod with selector ${labelSelector} (attempt ${retries}/${maxRetries})...`);
          
          const result = await window.api.executeCommand('kubectl', [
            'get',
            'pods',
            '-n',
            namespace,
            '-l',
            labelSelector,
            '-o',
            'jsonpath={.items[0].status.phase}'
          ]);
          
          if (result.stdout && result.stdout.trim() === 'Running') {
            return { success: true };
          }
          
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
        
        return { success: false, error: `Timed out waiting for pod with selector ${labelSelector}` };
      } catch (error) {
        return { success: false, error: error.message };
      }
    };

    // Use the installPrometheus utility function
    addComponentLog('Installing Prometheus using utility function...');
    updateCurrentStep('Installing Prometheus');
    
    const prometheusInstallResult = await installPrometheus({
      addComponentLog,
      updateCurrentStep,
      storageClassName,
      waitForPod,
      domain
    });

    if (!prometheusInstallResult.success) {
      throw new Error(`Failed to install Prometheus: ${prometheusInstallResult.error}`);
    }

    addComponentLog('Prometheus installation completed successfully.');
    setInstallationStatus('prometheus', 'installed');
    
    return { success: true };
  } catch (error) {
    console.error('Error installing Prometheus Service:', error);
    addComponentLog(`Error installing Prometheus Service: ${error.message}`);
    setInstallationStatus('prometheus', 'error');
    return { success: false, error: error.message };
  } finally {
    setIsInstalling(false);
  }
};

export const uninstallPrometheusService = async ({
  addLog,
  setLogs,
  updateCurrentStep = () => {}
}) => {
  const addComponentLog = (message) => {
    addLog(message);
    setLogs(prev => ({
      ...prev,
      prometheusService: [...(prev.prometheusService || []), message]
    }));
  };

  try {
    addComponentLog('Uninstalling Prometheus...');
    updateCurrentStep('Uninstalling Prometheus');
    
    const prometheusUninstallCmd = 'helm uninstall prometheus -n monitoring';
    await window.api.executeCommand(prometheusUninstallCmd);
    
    addComponentLog('Prometheus uninstalled successfully.');
    return { success: true };
  } catch (error) {
    addComponentLog(`Error uninstalling Prometheus: ${error.message}`);
    return { success: false, error: error.message };
  }
}; 