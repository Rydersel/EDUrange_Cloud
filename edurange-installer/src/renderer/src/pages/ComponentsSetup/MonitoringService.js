import useInstallStore from '../../store/installStore';
import { cleanupUnusedStorage, isRunningOnProvider } from '../../utils/storageCleanupUtils';

export const installMonitoringService = async ({
  setActiveComponent,
  setInstallationStatus,
  setIsCancelling,
  addLog,
  setLogs,
  logs,
  checkAndDeleteExistingDeployment,
  checkAndDeleteExistingService,
  checkAndDeleteExistingIngress,
  waitForPod,
  checkAndUpdateWildcardCertificate,
  renderIngressYaml,
  domain,
  registry,
  setIsInstalling
}) => {
  setActiveComponent('monitoringService');
  setInstallationStatus('monitoringService', 'installing');

  const addComponentLog = (message) => {
    addLog(message);
    setLogs(prev => ({
      ...prev,
      monitoringService: [...prev.monitoringService, message]
    }));
  };

  try {
    addComponentLog('Starting Monitoring Service installation...');

    // Create monitoring namespace if it doesn't exist
    addComponentLog('Creating monitoring namespace...');
    await window.api.executeCommand('kubectl', [
      'create',
      'namespace',
      'monitoring',
      '--dry-run=client',
      '-o',
      'yaml'
    ]).then(result => {
      return window.api.applyManifestFromString(result.stdout);
    });

    // Check if we're running on a cloud provider with storage limits
    addComponentLog('Checking cloud provider environment...');
    const isLinode = await isRunningOnProvider('linode', addComponentLog);

    // Run storage cleanup if we're on Linode or another cloud provider
    if (isLinode) {
      addComponentLog('Detected Linode environment. Running storage cleanup to prevent hitting volume limits...');
      const cleanupResult = await cleanupUnusedStorage(addComponentLog);

      if (cleanupResult.success) {
        addComponentLog(cleanupResult.message);
      } else {
        addComponentLog(`Warning: Storage cleanup encountered an error: ${cleanupResult.error}`);
        addComponentLog('Continuing with installation anyway...');
      }
    } else {
      // Check for any cloud provider by looking at storage classes
      const scResult = await window.api.executeCommand('kubectl', [
        'get',
        'storageclass',
        '-o',
        'json'
      ]);
      
      if (scResult.code === 0) {
        try {
          const storageClasses = JSON.parse(scResult.stdout).items;
          const cloudProviders = storageClasses.filter(sc => 
            sc.provisioner && (
              sc.provisioner.includes('csi') || 
              sc.provisioner.includes('cloud') ||
              sc.provisioner.includes('aws') ||
              sc.provisioner.includes('azure') ||
              sc.provisioner.includes('gcp') ||
              sc.provisioner.includes('linode')
            )
          );
          
          if (cloudProviders.length > 0) {
            addComponentLog('Detected cloud storage provider. Running storage cleanup...');
            const cleanupResult = await cleanupUnusedStorage(addComponentLog);
            
            if (cleanupResult.success) {
              addComponentLog(cleanupResult.message);
            } else {
              addComponentLog(`Warning: Storage cleanup encountered an error: ${cleanupResult.error}`);
              addComponentLog('Continuing with installation anyway...');
            }
          }
        } catch (error) {
          addComponentLog(`Error parsing storage classes: ${error.message}`);
        }
      }
    }

    // Check and update wildcard certificate
    addComponentLog('Checking wildcard certificate...');
    await checkAndUpdateWildcardCertificate();

    // Check if Prometheus is already installed and uninstall it
    addComponentLog('Checking for existing Prometheus installation...');
    const helmListResult = await window.api.executeCommand('helm', [
      'list',
      '--namespace',
      'monitoring',
      '--filter',
      'prometheus',
      '--output',
      'json'
    ]);

    if (helmListResult.stdout && helmListResult.stdout.trim() !== '[]') {
      addComponentLog('Found existing Prometheus installation. Uninstalling...');
      await window.api.executeCommand('helm', [
        'uninstall',
        'prometheus',
        '--namespace',
        'monitoring'
      ]);
      
      // Wait for the uninstallation to complete
      addComponentLog('Waiting for Prometheus resources to be fully removed...');
      await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
    }

    // Check for and delete any Helm release secrets that might be preventing reuse of the name
    addComponentLog('Checking for Helm release secrets...');
    const helmSecretsResult = await window.api.executeCommand('kubectl', [
      'get',
      'secrets',
      '-n',
      'monitoring',
      '--field-selector',
      'type=helm.sh/release.v1',
      '-o',
      'jsonpath={.items[*].metadata.name}'
    ]);

    if (helmSecretsResult.stdout) {
      const helmSecrets = helmSecretsResult.stdout.split(' ');
      for (const secret of helmSecrets) {
        if (secret.includes('prometheus')) {
          addComponentLog(`Deleting Helm release secret: ${secret}`);
          await window.api.executeCommand('kubectl', [
            'delete',
            'secret',
            secret,
            '-n',
            'monitoring'
          ]);
        }
      }
      // Wait for secrets to be deleted
      addComponentLog('Waiting for Helm secrets to be deleted...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    // Force cleanup of all Prometheus-related resources
    addComponentLog('Force cleaning up all Prometheus-related resources...');
    
    // Delete CRDs first to ensure all custom resources are removed
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
              await window.api.executeCommand('kubectl', [
                'delete',
                crd,
                name,
                '-n',
                namespace,
                '--ignore-not-found'
              ]).catch(() => {});
            }
          }
        }
      }
    }
    
    // Delete all resources in the monitoring namespace with prometheus in the name
    const resourceTypes = [
      'deployment', 'statefulset', 'daemonset', 'replicaset', 
      'pod', 'service', 'configmap', 'secret', 'serviceaccount',
      'rolebinding', 'role', 'clusterrolebinding', 'clusterrole'
    ];
    
    for (const resourceType of resourceTypes) {
      addComponentLog(`Checking for ${resourceType} resources...`);
      
      const resourcesResult = await window.api.executeCommand('kubectl', [
        'get',
        resourceType,
        '-n',
        'monitoring',
        '-o',
        'jsonpath={.items[*].metadata.name}'
      ]).catch(() => ({ stdout: '' }));
      
      if (resourcesResult.stdout) {
        const resources = resourcesResult.stdout.split(' ');
        const prometheusResources = resources.filter(r => 
          r.includes('prometheus') || 
          r.includes('grafana') || 
          r.includes('alertmanager') ||
          r.includes('kube-prometheus')
        );
        
        for (const resource of prometheusResources) {
          addComponentLog(`Force deleting ${resourceType}: ${resource}`);
          await window.api.executeCommand('kubectl', [
            'delete',
            resourceType,
            resource,
            '-n',
            'monitoring',
            '--force',
            '--grace-period=0',
            '--ignore-not-found'
          ]).catch(() => {});
        }
      }
    }
    
    // Wait for resources to be deleted
    addComponentLog('Waiting for all Prometheus resources to be deleted...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Clean up any leftover PVCs
    addComponentLog('Cleaning up any leftover monitoring-related PVCs...');
    
    // Get all PVCs in the monitoring namespace
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
        // Check for all monitoring-related PVCs
        if (pvc.includes('prometheus') || pvc.includes('grafana') || pvc.includes('alertmanager')) {
          addComponentLog(`Deleting PVC: ${pvc}`);
          
          // First try to remove finalizers if present
          try {
            await window.api.executeCommand('kubectl', [
              'patch',
              'pvc',
              pvc,
              '-n',
              'monitoring',
              '-p',
              '{"metadata":{"finalizers":null}}',
              '--type=merge'
            ]);
          } catch (error) {
            addComponentLog(`Warning: Failed to remove finalizers from PVC ${pvc}: ${error.message}`);
          }
          
          // Delete the PVC
          await window.api.executeCommand('kubectl', [
            'delete',
            'pvc',
            pvc,
            '--namespace',
            'monitoring',
            '--force',
            '--grace-period=0'
          ]);
        } else {
          // Delete any remaining PVCs in the monitoring namespace
          addComponentLog(`Deleting remaining PVC: ${pvc}`);
          
          // First try to remove finalizers if present
          try {
            await window.api.executeCommand('kubectl', [
              'patch',
              'pvc',
              pvc,
              '-n',
              'monitoring',
              '-p',
              '{"metadata":{"finalizers":null}}',
              '--type=merge'
            ]);
          } catch (error) {
            addComponentLog(`Warning: Failed to remove finalizers from PVC ${pvc}: ${error.message}`);
          }
          
          await window.api.executeCommand('kubectl', [
            'delete',
            'pvc',
            pvc,
            '--namespace',
            'monitoring',
            '--force',
            '--grace-period=0'
          ]);
        }
      }
      
      // Wait for PVCs to be fully deleted
      addComponentLog('Waiting for PVCs to be fully deleted...');
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
    }
    
    // Check for stuck persistent volumes
    addComponentLog('Checking for stuck persistent volumes...');
    const pvResult = await window.api.executeCommand('kubectl', [
      'get',
      'pv',
      '-o',
      'json'
    ]);
    
    if (pvResult.code === 0) {
      try {
        const pvs = JSON.parse(pvResult.stdout).items;
        const monitoringPvs = pvs.filter(pv => 
          (pv.spec.claimRef && pv.spec.claimRef.namespace === 'monitoring') ||
          (pv.metadata.name && (
            pv.metadata.name.includes('prometheus') || 
            pv.metadata.name.includes('grafana') || 
            pv.metadata.name.includes('alertmanager') ||
            pv.metadata.name.includes('monitoring')
          ))
        );
        
        for (const pv of monitoringPvs) {
          addComponentLog(`Deleting stuck PV: ${pv.metadata.name}`);
          
          // First try to remove finalizers if present
          if (pv.metadata.finalizers && pv.metadata.finalizers.length > 0) {
            try {
              await window.api.executeCommand('kubectl', [
                'patch',
                'pv',
                pv.metadata.name,
                '-p',
                '{"metadata":{"finalizers":null}}',
                '--type=merge'
              ]);
            } catch (error) {
              addComponentLog(`Warning: Failed to remove finalizers from PV ${pv.metadata.name}: ${error.message}`);
            }
          }
          
          // Delete the PV
          await window.api.executeCommand('kubectl', [
            'delete',
            'pv',
            pv.metadata.name,
            '--force',
            '--grace-period=0'
          ]);
        }
        
        // Wait for PVs to be fully deleted
        if (monitoringPvs.length > 0) {
          addComponentLog('Waiting for PVs to be fully deleted...');
          await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
        }
      } catch (error) {
        addComponentLog(`Error processing PVs: ${error.message}`);
      }
    }

    // Install metrics-server
    addComponentLog('Installing metrics-server...');
    const metricsServerRepoResult = await window.api.executeCommand('helm', [
      'repo',
      'add',
      'metrics-server',
      'https://kubernetes-sigs.github.io/metrics-server/'
    ]);

    if (metricsServerRepoResult.code !== 0) {
      throw new Error(`Failed to add metrics-server Helm repository: ${metricsServerRepoResult.stderr}`);
    }

    // Update Helm repositories
    addComponentLog('Updating Helm repositories...');
    const helmUpdateForMetricsResult = await window.api.executeCommand('helm', [
      'repo',
      'update'
    ]);

    if (helmUpdateForMetricsResult.code !== 0) {
      throw new Error(`Failed to update Helm repositories: ${helmUpdateForMetricsResult.stderr}`);
    }

    // Check if metrics-server is already installed
    addComponentLog('Checking if metrics-server is already installed...');
    const metricsServerCheckResult = await window.api.executeCommand('helm', [
      'list',
      '--all-namespaces',
      '--filter',
      'metrics-server',
      '--output',
      'json'
    ]);

    let metricsServerInstalled = false;
    if (metricsServerCheckResult.stdout && metricsServerCheckResult.stdout.trim() !== '[]') {
      addComponentLog('metrics-server is already installed.');
      metricsServerInstalled = true;
    }

    if (!metricsServerInstalled) {
      // Install metrics-server
      addComponentLog('Installing metrics-server...');
      const metricsServerInstallResult = await window.api.executeCommand('helm', [
        'install',
        'metrics-server',
        'metrics-server/metrics-server',
        '--namespace',
        'kube-system',
        '--set',
        'args={--kubelet-insecure-tls}'
      ]);

      if (metricsServerInstallResult.code !== 0) {
        throw new Error(`Failed to install metrics-server: ${metricsServerInstallResult.stderr}`);
      }

      // Wait for metrics-server to be ready
      addComponentLog('Waiting for metrics-server to be ready...');
      await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30 seconds for metrics-server to start
    }

    // Verify metrics-server is working
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
          await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds before retry
        }
      }
    }

    if (!metricsApiAvailable) {
      addComponentLog('Warning: Metrics API is not available. Some monitoring features may not work properly.');
    }

    // Check if linode-block-storage storage class exists
    addComponentLog('Checking for linode-block-storage storage class...');
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

    // Final check for any remaining PVCs or PVs before installing Prometheus
    addComponentLog('Performing final check for any stuck PVCs or PVs...');
    
    // Check for PVCs in monitoring namespace
    const finalPvcCheck = await window.api.executeCommand('kubectl', [
      'get',
      'pvc',
      '-n',
      'monitoring',
      '--no-headers'
    ]);
    
    if (finalPvcCheck.code === 0 && finalPvcCheck.stdout.trim()) {
      addComponentLog('Warning: There are still PVCs in the monitoring namespace. Attempting to force delete them...');
      
      // Get PVC names
      const pvcNames = finalPvcCheck.stdout.split('\n')
        .filter(line => line.trim())
        .map(line => line.split(/\s+/)[0]);
      
      for (const pvc of pvcNames) {
        addComponentLog(`Force deleting PVC: ${pvc}`);
        
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
        
        // Delete PVC
        await window.api.executeCommand('kubectl', [
          'delete',
          'pvc',
          pvc,
          '-n',
          'monitoring',
          '--force',
          '--grace-period=0'
        ]).catch(() => {});
      }
      
      // Wait a bit for deletion to complete
      addComponentLog('Waiting for forced PVC deletion to complete...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    // Check for stuck PVs related to monitoring
    const finalPvCheck = await window.api.executeCommand('kubectl', [
      'get',
      'pv',
      '-o',
      'json'
    ]);
    
    if (finalPvCheck.code === 0) {
      try {
        const pvs = JSON.parse(finalPvCheck.stdout).items;
        const monitoringPvs = pvs.filter(pv => 
          (pv.spec.claimRef && pv.spec.claimRef.namespace === 'monitoring') ||
          (pv.metadata.name && (
            pv.metadata.name.includes('prometheus') || 
            pv.metadata.name.includes('grafana') || 
            pv.metadata.name.includes('alertmanager') ||
            pv.metadata.name.includes('monitoring')
          ))
        );
        
        if (monitoringPvs.length > 0) {
          addComponentLog(`Warning: Found ${monitoringPvs.length} stuck PVs related to monitoring. Attempting to force delete them...`);
          
          for (const pv of monitoringPvs) {
            addComponentLog(`Force deleting PV: ${pv.metadata.name}`);
            
            // Remove finalizers
            await window.api.executeCommand('kubectl', [
              'patch',
              'pv',
              pv.metadata.name,
              '-p',
              '{"metadata":{"finalizers":null}}',
              '--type=merge'
            ]).catch(() => {});
            
            // Delete PV
            await window.api.executeCommand('kubectl', [
              'delete',
              'pv',
              pv.metadata.name,
              '--force',
              '--grace-period=0'
            ]).catch(() => {});
          }
          
          // Wait a bit for deletion to complete
          addComponentLog('Waiting for forced PV deletion to complete...');
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      } catch (error) {
        addComponentLog(`Error checking for stuck PVs: ${error.message}`);
      }
    }

    // Install Prometheus using Helm
    addComponentLog('Installing Prometheus using Helm...');
    const helmAddRepoResult = await window.api.executeCommand('helm', [
      'repo',
      'add',
      'prometheus-community',
      'https://prometheus-community.github.io/helm-charts'
    ]);

    if (helmAddRepoResult.code !== 0) {
      throw new Error(`Failed to add Prometheus Helm repository: ${helmAddRepoResult.stderr}`);
    }

    const helmUpdateResult = await window.api.executeCommand('helm', [
      'repo',
      'update'
    ]);

    if (helmUpdateResult.code !== 0) {
      throw new Error(`Failed to update Helm repositories: ${helmUpdateResult.stderr}`);
    }

    // Create values file for kube-prometheus-stack using a temporary file
    const prometheusValues = `
grafana:
  enabled: true
  adminPassword: edurange
  service:
    type: ClusterIP
  persistence:
    enabled: true${storageClassName ? `\n    storageClassName: ${storageClassName}` : ''}
prometheus:
  prometheusSpec:
    storageSpec:
      volumeClaimTemplate:
        spec:${storageClassName ? `\n          storageClassName: ${storageClassName}` : ''}
          accessModes: ["ReadWriteOnce"]
          resources:
            requests:
              storage: 8Gi
alertmanager:
  alertmanagerSpec:
    storage:
      volumeClaimTemplate:
        spec:${storageClassName ? `\n          storageClassName: ${storageClassName}` : ''}
          accessModes: ["ReadWriteOnce"]
          resources:
            requests:
              storage: 2Gi
`;

    // Create a temporary file with the values
    const tempValuesFile = await window.api.executeCommand('mktemp', ['-t', 'prometheus-values-XXXXXX.yaml']);
    if (tempValuesFile.code !== 0) {
      throw new Error(`Failed to create temporary file: ${tempValuesFile.stderr}`);
    }

    const tempFilePath = tempValuesFile.stdout.trim();

    // Write the values to the temporary file
    const writeResult = await window.api.executeCommand('bash', [
      '-c',
      `cat > "${tempFilePath}" << 'EOF'
${prometheusValues}
EOF`
    ]);

    if (writeResult.code !== 0) {
      throw new Error(`Failed to write Prometheus values to temporary file: ${writeResult.stderr}`);
    }

    // Install kube-prometheus-stack using the temporary values file
    const helmInstallResult = await window.api.executeCommand('helm', [
      'upgrade',
      '--install',
      'prometheus',
      'prometheus-community/kube-prometheus-stack',
      '--namespace',
      'monitoring',
      '-f',
      tempFilePath
    ]);

    // Clean up the temporary file
    await window.api.executeCommand('rm', [tempFilePath]);

    if (helmInstallResult.code !== 0) {
      throw new Error(`Failed to install kube-prometheus-stack: ${helmInstallResult.stderr}`);
    }

    addComponentLog('kube-prometheus-stack installed successfully.');

    // Wait for Prometheus to be ready
    addComponentLog('Waiting for Prometheus server pod to be ready...');
    
    // Implement retry mechanism instead of fixed delay
    addComponentLog('Will retry checking for Prometheus pods every 10 seconds for up to 60 seconds...');
    
    let prometheusServerPodFound = false;
    let retryAttempts = 0;
    const maxRetries = 6; // 6 attempts * 10 seconds = 60 seconds total
    
    while (!prometheusServerPodFound && retryAttempts < maxRetries) {
      retryAttempts++;
      addComponentLog(`Attempt ${retryAttempts}/${maxRetries} to find Prometheus server pod...`);
      
      // First, get the actual pod name and labels
      addComponentLog('Getting Prometheus server pod information...');
      const podInfoResult = await window.api.executeCommand('kubectl', [
        'get',
        'pods',
        '-n',
        'monitoring',
        '-l',
        'app.kubernetes.io/name=prometheus',
        '-o',
        'name'
      ]);
      
      if (podInfoResult.code !== 0 || !podInfoResult.stdout) {
        // Try alternative label selector
        addComponentLog('Trying alternative label selector...');
        const altPodInfoResult = await window.api.executeCommand('kubectl', [
          'get',
          'pods',
          '-n',
          'monitoring',
          '-l',
          'app=prometheus',
          '-o',
          'name'
        ]);
        
        if (altPodInfoResult.code !== 0 || !altPodInfoResult.stdout) {
          // Try kube-prometheus-stack selector
          addComponentLog('Trying kube-prometheus-stack selector...');
          const kubePromPodInfoResult = await window.api.executeCommand('kubectl', [
            'get',
            'pods',
            '-n',
            'monitoring',
            '-l',
            'app.kubernetes.io/name=prometheus',
            '-o',
            'name'
          ]);
          
          if (kubePromPodInfoResult.code !== 0 || !kubePromPodInfoResult.stdout) {
            // Just list all pods and look for the server pod
            addComponentLog('Listing all pods in monitoring namespace...');
            const allPodsResult = await window.api.executeCommand('kubectl', [
              'get',
              'pods',
              '-n',
              'monitoring',
              '-o',
              'wide'
            ]);
            
            addComponentLog(`All pods in monitoring namespace: ${allPodsResult.stdout}`);
            
            // Check if prometheus pod exists by name pattern
            const serverPodExists = await window.api.executeCommand('kubectl', [
              'get',
              'pods',
              '-n',
              'monitoring',
              '--field-selector',
              'status.phase=Running',
              '-o',
              'name'
            ]);
            
            const serverPodNames = serverPodExists.stdout.split('\n').filter(name => 
              name.includes('prometheus') && (name.includes('server') || name.includes('prometheus-prometheus-kube-prometheus-prometheus'))
            );
            
            if (serverPodNames.length > 0) {
              addComponentLog(`Found server pod by name: ${serverPodNames[0]}`);
              // Skip the wait since we've verified the pod exists and is running
              addComponentLog('Prometheus server pod is running. Proceeding with installation.');
              prometheusServerPodFound = true;
            } else if (retryAttempts < maxRetries) {
              addComponentLog(`Prometheus server pod not found on attempt ${retryAttempts}. Waiting 10 seconds before retrying...`);
              await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds before next retry
            } else {
              throw new Error('Could not find Prometheus server pod after maximum retry attempts');
            }
          } else {
            addComponentLog(`Found server pod with app.kubernetes.io/name=prometheus: ${kubePromPodInfoResult.stdout}`);
            // Wait for this pod to be ready
            const waitPrometheusResult = await waitForPod('app.kubernetes.io/name=prometheus', 'monitoring');
            if (!waitPrometheusResult.success) {
              throw new Error(`Failed to wait for Prometheus server pod: ${waitPrometheusResult.error}`);
            }
            prometheusServerPodFound = true;
          }
        } else {
          addComponentLog(`Found server pod with app=prometheus: ${altPodInfoResult.stdout}`);
          // Wait for this pod to be ready
          const waitPrometheusResult = await waitForPod('app=prometheus', 'monitoring');
          if (!waitPrometheusResult.success) {
            throw new Error(`Failed to wait for Prometheus server pod: ${waitPrometheusResult.error}`);
          }
          prometheusServerPodFound = true;
        }
      } else {
        addComponentLog(`Found server pod with app.kubernetes.io/name=prometheus: ${podInfoResult.stdout}`);
        // Wait for this pod to be ready
        const waitPrometheusResult = await waitForPod('app.kubernetes.io/name=prometheus', 'monitoring');
        if (!waitPrometheusResult.success) {
          throw new Error(`Failed to wait for Prometheus server pod: ${waitPrometheusResult.error}`);
        }
        prometheusServerPodFound = true;
      }
      
      // If pod not found and we haven't reached max retries, wait before next attempt
      if (!prometheusServerPodFound && retryAttempts < maxRetries) {
        addComponentLog(`Prometheus server pod not found on attempt ${retryAttempts}. Waiting 10 seconds before retrying...`);
        await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds before next retry
      }
    }
    
    if (!prometheusServerPodFound) {
      throw new Error('Could not find Prometheus server pod after maximum retry attempts');
    }

    addComponentLog('Prometheus server pod is ready.');

    // Create monitoring service deployment
    addComponentLog('Creating Monitoring Service deployment...');
    const monitoringServiceDeploymentYaml = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: monitoring-service
  namespace: default
  labels:
    app: monitoring-service
spec:
  replicas: 1
  selector:
    matchLabels:
      app: monitoring-service
  template:
    metadata:
      labels:
        app: monitoring-service
    spec:
      serviceAccountName: monitoring-service-sa
      containers:
      - name: monitoring-service
        image: ${registry.url}/monitoring-service:latest
        imagePullPolicy: Always
        ports:
        - containerPort: 5000
          name: http
        - containerPort: 9100
          name: metrics
        env:
        - name: PROMETHEUS_URL
          value: "http://prometheus-kube-prometheus-prometheus.monitoring:9090"
        - name: METRICS_CACHE_TTL
          value: "15"
        - name: METRICS_PORT
          value: "9100"
        - name: GUNICORN_WORKERS
          value: "1"
        - name: KUBERNETES_METRICS_ENABLED
          value: "true"
        - name: PYTHONUNBUFFERED
          value: "1"
        - name: DATABASE_API_URL
          value: "http://database-api-service:80"
        resources:
          limits:
            cpu: "500m"
            memory: "512Mi"
          requests:
            cpu: "100m"
            memory: "128Mi"
        livenessProbe:
          httpGet:
            path: /health
            port: 5000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 5000
          initialDelaySeconds: 5
          periodSeconds: 5
`;

    // Create service account for monitoring service
    addComponentLog('Creating service account for Monitoring Service...');
    const serviceAccountYaml = `
apiVersion: v1
kind: ServiceAccount
metadata:
  name: monitoring-service-sa
  namespace: default
`;

    await window.api.applyManifestFromString(serviceAccountYaml);

    // Create cluster role for monitoring service
    addComponentLog('Creating cluster role for Monitoring Service...');
    const clusterRoleYaml = `
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: monitoring-service-role
rules:
- apiGroups: [""]
  resources: ["pods", "nodes"]
  verbs: ["get", "list", "watch"]
- apiGroups: ["metrics.k8s.io"]
  resources: ["pods", "nodes"]
  verbs: ["get", "list"]
`;

    await window.api.applyManifestFromString(clusterRoleYaml);

    // Create cluster role binding for monitoring service
    addComponentLog('Creating cluster role binding for Monitoring Service...');
    const clusterRoleBindingYaml = `
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: monitoring-service-role-binding
subjects:
- kind: ServiceAccount
  name: monitoring-service-sa
  namespace: default
roleRef:
  kind: ClusterRole
  name: monitoring-service-role
  apiGroup: rbac.authorization.k8s.io
`;

    await window.api.applyManifestFromString(clusterRoleBindingYaml);

    // Apply monitoring service deployment
    await window.api.applyManifestFromString(monitoringServiceDeploymentYaml);

    // Create monitoring service service
    addComponentLog('Creating Monitoring Service service...');
    const monitoringServiceServiceYaml = `
apiVersion: v1
kind: Service
metadata:
  name: monitoring-service
  namespace: default
  labels:
    app: monitoring-service
spec:
  selector:
    app: monitoring-service
  ports:
  - name: http
    port: 5000
    targetPort: 5000
  - name: metrics
    port: 9100
    targetPort: 9100
  type: ClusterIP
`;

    await window.api.applyManifestFromString(monitoringServiceServiceYaml);

    // Create ServiceMonitor for Prometheus
    addComponentLog('Creating ServiceMonitor for Monitoring Service...');
    const serviceMonitorYaml = `
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: monitoring-service
  namespace: monitoring
  labels:
    release: prometheus
spec:
  selector:
    matchLabels:
      app: monitoring-service
  namespaceSelector:
    matchNames:
      - default
  endpoints:
  - port: metrics
    interval: 15s
`;

    try {
      await window.api.applyManifestFromString(serviceMonitorYaml);
    } catch (error) {
      // ServiceMonitor might not be available if Prometheus Operator is not installed
      addComponentLog(`Warning: Could not create ServiceMonitor: ${error.message}`);
    }

    // Create monitoring service ingress
    addComponentLog('Creating Monitoring Service ingress...');
    const monitoringServiceIngressYaml = `
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: monitoring-service-ingress
  namespace: default
  annotations:
    nginx.ingress.kubernetes.io/use-regex: "true"
    nginx.ingress.kubernetes.io/rewrite-target: /$2
spec:
  ingressClassName: nginx
  rules:
  - host: ${domain.monitoringSubdomain}.${domain.name}
    http:
      paths:
      - path: /metrics(/|$)(.*)
        pathType: ImplementationSpecific
        backend:
          service:
            name: monitoring-service
            port:
              number: 5000
  tls:
    - hosts:
        - ${domain.monitoringSubdomain}.${domain.name}
      secretName: wildcard-domain-certificate-prod
`;

    await window.api.applyManifestFromString(monitoringServiceIngressYaml);

    // Wait for monitoring service pod to be ready
    addComponentLog('Waiting for Monitoring Service pod to be ready...');
    const waitMonitoringServiceResult = await waitForPod('app=monitoring-service');

    if (!waitMonitoringServiceResult.success) {
      throw new Error(`Failed to wait for Monitoring Service pod: ${waitMonitoringServiceResult.error}`);
    }

    addComponentLog('Monitoring Service pod is ready.');
    addComponentLog('Monitoring Service installation completed successfully.');
    
    // Explicitly set the status to 'installed'
    setInstallationStatus('monitoringService', 'installed');
    
    // Check if all components are installed and mark step as completed if they are
    const { installationStatus, markStepCompleted } = useInstallStore.getState();
    if (
      installationStatus.databaseController === 'installed' &&
      installationStatus.instanceManager === 'installed' &&
      installationStatus.monitoringService === 'installed'
    ) {
      markStepCompleted('components-setup');
    }
    
    // Return success to the caller
    return { success: true };
  } catch (error) {
    console.error('Error installing Monitoring Service:', error);
    addComponentLog(`Error installing Monitoring Service: ${error.message}`);
    setInstallationStatus('monitoringService', 'error');
    
    // Return error to the caller
    return { success: false, error: error.message };
  } finally {
    setIsInstalling(false);
  }
};
