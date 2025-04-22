import useInstallStore from '../../store/installStore';
import { cleanupUnusedStorage, isRunningOnProvider } from '../../utils/storageCleanupUtils';
import { installLoki, installGrafana, installPromtail } from '../../utils/lokiGrafanaUtils';

export const installLokiGrafanaService = async ({
  setActiveComponent,
  setInstallationStatus,
  addLog,
  setLogs,
  logs,
  checkAndUpdateWildcardCertificate,
  domain,
  registry,
  setIsInstalling,
  isExistingLoki = false,
  isLokiUninstall = false,
  existingLokiPod = '',
  isExistingGrafana = false,
  isGrafanaUninstall = false,
  existingGrafanaPod = '',
  isExistingPromtail = false,
  isPromtailUninstall = false,
  existingPromtailPod = '',
  updateCurrentStep = () => {}
}) => {
  setActiveComponent('lokiGrafanaService');
  setInstallationStatus('loki', 'installing');
  setInstallationStatus('grafana', 'installing');
  setInstallationStatus('promtail', 'installing');

  const addComponentLog = (message) => {
    addLog(message);
    setLogs(prev => ({
      ...prev,
      lokiGrafanaService: [...(prev.lokiGrafanaService || []), message]
    }));
  };

  try {
    addComponentLog('Starting Loki and Grafana Service installation...');
    
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

    // Helper function to uninstall any existing Loki installations
    const uninstallLoki = async () => {
      if (existingLokiPod || isLokiUninstall) {
        addComponentLog('Uninstalling existing Loki...');
        updateCurrentStep('Uninstalling Loki');
        const lokiUninstallCmd = 'helm uninstall loki -n monitoring';
        await window.api.executeCommand(lokiUninstallCmd);
        addComponentLog('Existing Loki uninstalled.');
      }
    };

    // Helper function to uninstall any existing Grafana installations
    const uninstallGrafana = async () => {
      if (existingGrafanaPod || isGrafanaUninstall) {
        addComponentLog('Uninstalling existing Grafana...');
        updateCurrentStep('Uninstalling Grafana');
        const grafanaUninstallCmd = 'helm uninstall grafana -n monitoring';
        await window.api.executeCommand(grafanaUninstallCmd);
        addComponentLog('Existing Grafana uninstalled.');
      }
    };

    // Helper function to uninstall any existing Promtail installations
    const uninstallPromtail = async () => {
      if (existingPromtailPod || isPromtailUninstall) {
        addComponentLog('Uninstalling existing Promtail...');
        updateCurrentStep('Uninstalling Promtail');
        const promtailUninstallCmd = 'helm uninstall promtail -n monitoring';
        await window.api.executeCommand(promtailUninstallCmd);
        addComponentLog('Existing Promtail uninstalled.');
      }
    };
    
    // Check if only uninstallation was requested for components
    if ((isLokiUninstall && !isExistingLoki) || 
        (isGrafanaUninstall && !isExistingGrafana) || 
        (isPromtailUninstall && !isExistingPromtail)) {
      
      if (isLokiUninstall && !isExistingLoki) {
        await uninstallLoki();
        setInstallationStatus('loki', 'uninstalled');
      }
      
      if (isGrafanaUninstall && !isExistingGrafana) {
        await uninstallGrafana();
        setInstallationStatus('grafana', 'uninstalled');
      }
      
      if (isPromtailUninstall && !isExistingPromtail) {
        await uninstallPromtail();
        setInstallationStatus('promtail', 'uninstalled');
      }
      
      return { success: true, message: 'Components uninstalled successfully.' };
    }

    // Uninstall existing components before reinstalling
    await uninstallLoki();
    await uninstallGrafana();
    await uninstallPromtail();

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
      addComponentLog('Using linode-block-storage storage class for volumes.');
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
        addComponentLog(`Using default storage class '${storageClassName}' for volumes.`);
      } else {
        addComponentLog('No default storage class found. Services may not be able to provision storage.');
        storageClassName = ''; // Let Helm use the default from the chart
      }
    }

    // Define a waitForPod function for Loki and Grafana
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

    // Install Loki
    addComponentLog('Installing Loki...');
    updateCurrentStep('Installing Loki');
    
    const lokiInstallResult = await installLoki({
      addComponentLog,
      updateCurrentStep,
      storageClassName,
      waitForPod
    });

    if (!lokiInstallResult.success) {
      throw new Error(`Failed to install Loki: ${lokiInstallResult.error}`);
    }

    addComponentLog('Loki installation completed successfully.');
    setInstallationStatus('loki', 'installed');

    // Install Grafana
    addComponentLog('Installing Grafana...');
    updateCurrentStep('Installing Grafana');
    
    const grafanaInstallResult = await installGrafana({
      addComponentLog,
      updateCurrentStep,
      domain,
      storageClassName,
      waitForPod
    });

    if (!grafanaInstallResult.success) {
      throw new Error(`Failed to install Grafana: ${grafanaInstallResult.error}`);
    }

    addComponentLog('Grafana installation completed successfully.');
    setInstallationStatus('grafana', 'installed');

    // Install Promtail
    addComponentLog('Installing Promtail...');
    updateCurrentStep('Installing Promtail');
    
    const promtailInstallResult = await installPromtail({
      addComponentLog,
      updateCurrentStep,
      waitForPod: async (params) => {
        // Define a simple waitForPod function if one isn't available in the params
        const { namespace, labelSelector, timeout } = params;
        try {
          let retries = 0;
          const maxRetries = Math.floor(timeout / 5);
          
          while (retries < maxRetries) {
            retries++;
            addComponentLog(`Checking for Promtail pod (attempt ${retries}/${maxRetries})...`);
            
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
          
          return { success: false, error: 'Timed out waiting for Promtail pod' };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
    });

    if (!promtailInstallResult.success) {
      throw new Error(`Failed to install Promtail: ${promtailInstallResult.error}`);
    }
    
    addComponentLog('Promtail installation completed successfully.');
    setInstallationStatus('promtail', 'installed');
    
    // Configure Grafana to use Loki
    addComponentLog('Configuring Grafana to use Loki...');
    
    // Create Loki datasource for Grafana
    const lokiDatasourceCmd = `kubectl -n monitoring exec -it $(kubectl -n monitoring get pods -l "app.kubernetes.io/name=grafana" -o jsonpath="{.items[0].metadata.name}") -- \
      curl -s -X POST -H "Content-Type: application/json" \
      -d '{"name":"Loki","type":"loki","url":"http://loki.monitoring.svc.cluster.local:3100","access":"proxy","isDefault":false,"jsonData":{}}' \
      http://localhost:3000/api/datasources`;
    
    try {
      const datasourceResult = await window.api.executeCommand(lokiDatasourceCmd);
      if (datasourceResult.stdout.includes("datasource added")) {
        addComponentLog('Successfully configured Loki datasource in Grafana.');
      } else {
        addComponentLog('Warning: Loki datasource configuration may not have succeeded. Check Grafana settings.');
      }
    } catch (error) {
      addComponentLog(`Warning: Error configuring Loki datasource: ${error.message}`);
      addComponentLog('You may need to manually configure the Loki datasource in Grafana.');
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error installing Loki Grafana Service:', error);
    addComponentLog(`Error installing Loki Grafana Service: ${error.message}`);
    setInstallationStatus('loki', 'error');
    setInstallationStatus('grafana', 'error');
    setInstallationStatus('promtail', 'error');
    return { success: false, error: error.message };
  } finally {
    setIsInstalling(false);
  }
};

export const uninstallLokiService = async ({
  addLog,
  setLogs,
  updateCurrentStep = () => {}
}) => {
  const addComponentLog = (message) => {
    addLog(message);
    setLogs(prev => ({
      ...prev,
      lokiGrafanaService: [...(prev.lokiGrafanaService || []), message]
    }));
  };

  try {
    addComponentLog('Uninstalling Loki...');
    updateCurrentStep('Uninstalling Loki');
    
    const lokiUninstallCmd = 'helm uninstall loki -n monitoring';
    await window.api.executeCommand(lokiUninstallCmd);
    
    addComponentLog('Loki uninstalled successfully.');
    return { success: true };
  } catch (error) {
    addComponentLog(`Error uninstalling Loki: ${error.message}`);
    return { success: false, error: error.message };
  }
};

export const uninstallGrafanaService = async ({
  addLog,
  setLogs,
  updateCurrentStep = () => {}
}) => {
  const addComponentLog = (message) => {
    addLog(message);
    setLogs(prev => ({
      ...prev,
      lokiGrafanaService: [...(prev.lokiGrafanaService || []), message]
    }));
  };

  try {
    addComponentLog('Uninstalling Grafana...');
    updateCurrentStep('Uninstalling Grafana');
    
    const grafanaUninstallCmd = 'helm uninstall grafana -n monitoring';
    await window.api.executeCommand(grafanaUninstallCmd);
    
    addComponentLog('Grafana uninstalled successfully.');
    return { success: true };
  } catch (error) {
    addComponentLog(`Error uninstalling Grafana: ${error.message}`);
    return { success: false, error: error.message };
  }
};

export const uninstallPromtailService = async ({
  addLog,
  setLogs,
  updateCurrentStep = () => {}
}) => {
  const addComponentLog = (message) => {
    addLog(message);
    setLogs(prev => ({
      ...prev,
      lokiGrafanaService: [...(prev.lokiGrafanaService || []), message]
    }));
  };

  try {
    addComponentLog('Uninstalling Promtail...');
    updateCurrentStep('Uninstalling Promtail');
    
    const promtailUninstallCmd = 'helm uninstall promtail -n monitoring';
    await window.api.executeCommand(promtailUninstallCmd);
    
    addComponentLog('Promtail uninstalled successfully.');
    return { success: true };
  } catch (error) {
    addComponentLog(`Error uninstalling Promtail: ${error.message}`);
    return { success: false, error: error.message };
  }
}; 