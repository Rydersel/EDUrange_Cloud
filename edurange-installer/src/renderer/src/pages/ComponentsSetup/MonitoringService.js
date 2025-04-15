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

    // Helper function to uninstall any existing Prometheus installations
    const uninstallExistingPrometheus = async (addComponentLog) => {
      addComponentLog('Checking for existing Prometheus installations...');
      
      // Check for existing Helm releases
      const listReleasesResult = await window.api.executeCommand('helm', [
        'list',
        '-n',
        'monitoring',
        '-o',
        'json'
      ]).catch(() => ({ code: 1, stdout: '[]' }));
      
      if (listReleasesResult.code === 0 && listReleasesResult.stdout) {
        try {
          const releases = JSON.parse(listReleasesResult.stdout);
          const prometheusReleases = releases.filter(release => 
            release.name.includes('prometheus') || 
            release.name.includes('kube-prometheus')
          );
          
          if (prometheusReleases.length > 0) {
            addComponentLog(`Found ${prometheusReleases.length} existing Prometheus installations. Uninstalling...`);
            
            for (const release of prometheusReleases) {
              addComponentLog(`Uninstalling Helm release: ${release.name}`);
              
              // Set a timeout for the uninstall operation
              const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Helm uninstall timed out after 120 seconds')), 120000)
              );
              
              const uninstallPromise = window.api.executeCommand('helm', [
                'uninstall',
                release.name,
                '-n',
                'monitoring',
                '--wait'
              ]).catch(e => {
                addComponentLog(`Warning: Uninstall command failed: ${e.message}`);
                
                // Try force uninstall if regular uninstall fails
                return window.api.executeCommand('helm', [
                  'uninstall',
                  release.name,
                  '-n',
                  'monitoring',
                  '--no-hooks'
                ]);
              });
              
              try {
                await Promise.race([uninstallPromise, timeoutPromise]);
                addComponentLog(`Successfully uninstalled ${release.name}`);
              } catch (error) {
                addComponentLog(`Error uninstalling ${release.name}: ${error.message}`);
                addComponentLog('Continuing with cleanup anyway...');
              }
            }
          } else {
            addComponentLog('No existing Prometheus installations found via Helm.');
          }
        } catch (error) {
          addComponentLog(`Error processing Helm releases: ${error.message}`);
        }
      }
      
      // Also check for any prometheus pods that might exist
      const prometheusPodsResult = await window.api.executeCommand('kubectl', [
        'get',
        'pods',
        '-n',
        'monitoring',
        '-l',
        'app=prometheus,app=kube-prometheus-stack',
        '--no-headers'
      ]).catch(() => ({ code: 1, stdout: '' }));
      
      if (prometheusPodsResult.code === 0 && prometheusPodsResult.stdout.trim()) {
        addComponentLog('Found Prometheus pods. Deleting them...');
        await window.api.executeCommand('kubectl', [
          'delete',
          'pods',
          '-n',
          'monitoring',
          '-l',
          'app=prometheus,app=kube-prometheus-stack',
          '--force',
          '--grace-period=0'
        ]).catch(e => {
          addComponentLog(`Warning: Could not delete Prometheus pods: ${e.message}`);
        });
      }
      
      // Check for any CRDs related to Prometheus
      addComponentLog('Checking for Prometheus CRDs...');
      const crdResult = await window.api.executeCommand('kubectl', [
        'get',
        'crd',
        '-o',
        'name'
      ]).catch(() => ({ code: 1, stdout: '' }));
      
      if (crdResult.code === 0 && crdResult.stdout) {
        const crdLines = crdResult.stdout.split('\n');
        const prometheusCRDs = crdLines.filter(crd => 
          crd.includes('prometheus') || 
          crd.includes('monitoring.coreos.com')
        );
        
        if (prometheusCRDs.length > 0) {
          addComponentLog(`Found ${prometheusCRDs.length} Prometheus-related CRDs. Deleting them...`);
          
          for (const crd of prometheusCRDs) {
            if (!crd.trim()) continue;
            
            addComponentLog(`Deleting CRD: ${crd}`);
            await window.api.executeCommand('kubectl', [
              'delete',
              crd,
              '--force',
              '--grace-period=0'
            ]).catch(e => {
              addComponentLog(`Warning: Could not delete CRD ${crd}: ${e.message}`);
            });
          }
        } else {
          addComponentLog('No Prometheus-related CRDs found.');
        }
      }
      
      return true;
    };

    // Before namespace cleanup, uninstall existing Prometheus installations
    await uninstallExistingPrometheus(addComponentLog);

    // Now continue with namespace cleanup
    // Check if namespace is in terminating state
    addComponentLog('Checking if monitoring namespace is in terminating state...');
    const nsStatusResult = await window.api.executeCommand('kubectl', [
      'get',
      'namespace',
      'monitoring',
      '-o',
      'jsonpath={.status.phase}'
    ]).catch(() => ({ code: 1, stdout: '' }));
    
    if (nsStatusResult.code === 0 && nsStatusResult.stdout === 'Terminating') {
      addComponentLog('WARNING: Monitoring namespace is in terminating state. Will aggressively clean it up...');
      
      // Get all resources in the terminating namespace
      addComponentLog('Getting all resources in the terminating namespace...');
      
      // Use kubectl api-resources to get all resource types
      const apiResourcesResult = await window.api.executeCommand('kubectl', [
        'api-resources',
        '--verbs=list',
        '--namespaced=true',
        '-o',
        'name'
      ]).catch(() => ({ code: 1, stdout: '' }));
      
      if (apiResourcesResult.code === 0 && apiResourcesResult.stdout) {
        const resourceTypes = apiResourcesResult.stdout.split('\n').filter(rt => 
          rt && 
          !rt.includes('events') && 
          !rt.includes('events.events.k8s.io')
        );
        
        // Get all finalizers in the namespace
        addComponentLog('Removing finalizers from all resources in the monitoring namespace...');
        
        for (const resourceType of resourceTypes) {
          // Skip resource types that might cause issues
          if (resourceType.includes('customresourcedefinition') || 
              resourceType.includes('componentstatuses') ||
              resourceType.includes('bindings')) {
            continue;
          }
          
          try {
            // Get resources of this type
            const resourcesResult = await window.api.executeCommand('kubectl', [
              'get',
              resourceType,
              '-n',
              'monitoring',
              '-o',
              'json'
            ]).catch(() => ({ code: 1, stdout: '{}' }));
            
            if (resourcesResult.code === 0 && resourcesResult.stdout !== '{}') {
              try {
                const resources = JSON.parse(resourcesResult.stdout);
                
                if (resources.items && resources.items.length > 0) {
                  addComponentLog(`Found ${resources.items.length} ${resourceType} resources. Removing finalizers...`);
                  
                  for (const resource of resources.items) {
                    if (resource.metadata && resource.metadata.name) {
                      const resourceName = resource.metadata.name;
                      
                      // Check if it has finalizers
                      if (resource.metadata.finalizers && resource.metadata.finalizers.length > 0) {
                        addComponentLog(`Removing finalizers from ${resourceType}/${resourceName}`);
                        
                        try {
                          await window.api.executeCommand('kubectl', [
                            'patch',
                            resourceType,
                            resourceName,
                            '-n',
                            'monitoring',
                            '-p',
                            '{"metadata":{"finalizers":null}}',
                            '--type=merge'
                          ]);
                        } catch (e) {
                          addComponentLog(`Note: Could not remove finalizers from ${resourceType}/${resourceName}: ${e.message}`);
                        }
                      }
                      
                      // Force delete the resource
                      addComponentLog(`Force deleting ${resourceType}/${resourceName}`);
                      await window.api.executeCommand('kubectl', [
                        'delete',
                        resourceType,
                        resourceName,
                        '-n',
                        'monitoring',
                        '--force',
                        '--grace-period=0'
                      ]).catch(e => {
                        addComponentLog(`Note: Could not delete ${resourceType}/${resourceName}: ${e.message}`);
                      });
                    }
                  }
                }
              } catch (error) {
                addComponentLog(`Error processing ${resourceType} resources: ${error.message}`);
              }
            }
          } catch (error) {
            addComponentLog(`Error handling ${resourceType}: ${error.message}`);
          }
        }
      }
      
      // Patch to remove finalizers from namespace itself
      addComponentLog('Removing finalizers from namespace...');
      await window.api.executeCommand('kubectl', [
        'patch',
        'namespace',
        'monitoring',
        '-p',
        '{"metadata":{"finalizers":[]}}',
        '--type=merge'
      ]).catch(e => {
        addComponentLog(`Note: ${e.message}`);
      });
      
      // Try the null approach as well
      await window.api.executeCommand('kubectl', [
        'patch',
        'namespace',
        'monitoring',
        '-p',
        '{"metadata":{"finalizers":null}}',
        '--type=merge'
      ]).catch(e => {
        addComponentLog(`Note: ${e.message}`);
      });
      
      // Wait a bit
      addComponentLog('Waiting for resources to be cleaned up...');
      await new Promise(resolve => setTimeout(resolve, 10000));
      
      // Check if namespace is still terminating
      const recheckResult = await window.api.executeCommand('kubectl', [
        'get',
        'namespace',
        'monitoring',
        '-o',
        'jsonpath={.status.phase}'
      ]).catch(() => ({ code: 1, stdout: '' }));
      
      if (recheckResult.code === 0 && recheckResult.stdout === 'Terminating') {
        addComponentLog('WARNING: Namespace is still terminating, but we can continue anyway...');
        addComponentLog('Will proceed with resource cleanup within the namespace...');
      } else if (recheckResult.code === 0) {
        addComponentLog(`Namespace is now in phase: ${recheckResult.stdout}`);
      } else {
        addComponentLog('Namespace status check failed, assuming it may be deleted...');
        
        // Recreate the namespace if needed
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
      }
    }

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

    // Check for existing PVCs specifically related to prometheus and clean them up first
    addComponentLog('Checking for existing Prometheus-related PVCs...');
    const prometheusPvcResult = await window.api.executeCommand('kubectl', [
      'get',
      'pvc',
      '-n',
      'monitoring',
      '-o',
      'json'
    ]).catch(() => ({ code: 1, stdout: '{}' }));

    if (prometheusPvcResult.code === 0 && prometheusPvcResult.stdout !== '{}') {
      try {
        const pvcs = JSON.parse(prometheusPvcResult.stdout).items || [];
        if (pvcs.length > 0) {
          addComponentLog(`Found ${pvcs.length} PVCs in monitoring namespace. Cleaning up...`);
          
          for (const pvc of pvcs) {
            const pvcName = pvc.metadata.name;
            addComponentLog(`Removing finalizers from PVC ${pvcName}...`);
            
            // Remove finalizers first
            await window.api.executeCommand('kubectl', [
              'patch',
              'pvc',
              pvcName,
              '-n',
              'monitoring',
              '-p',
              '{"metadata":{"finalizers":null}}',
              '--type=merge'
            ]).catch(e => {
              addComponentLog(`Warning: Failed to remove finalizers from PVC ${pvcName}: ${e.message}`);
            });
            
            // Delete the PVC
            addComponentLog(`Deleting PVC ${pvcName}...`);
            await window.api.executeCommand('kubectl', [
              'delete',
              'pvc',
              pvcName,
              '-n',
              'monitoring',
              '--force',
              '--grace-period=0'
            ]).catch(e => {
              addComponentLog(`Warning: Failed to delete PVC ${pvcName}: ${e.message}`);
            });
          }
          
          // Wait for PVCs to be deleted
          addComponentLog('Waiting for PVCs to be fully deleted...');
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      } catch (error) {
        addComponentLog(`Error processing PVCs: ${error.message}`);
      }
    }

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
    
    // First, check if there are any helm release secrets in monitoring namespace
    const helmSecretsResult = await window.api.executeCommand('kubectl', [
      'get',
      'secrets',
      '-n',
      'monitoring',
      '--field-selector',
      'type=helm.sh/release.v1',
      '-o',
      'json'
    ]).catch(() => ({ code: 1, stdout: '{}' }));

    if (helmSecretsResult.code === 0) {
      try {
        const secretsData = JSON.parse(helmSecretsResult.stdout);
        if (secretsData.items && secretsData.items.length > 0) {
          const prometheusSecrets = secretsData.items.filter(secret => 
            secret.metadata.name.includes('prometheus') || 
            secret.metadata.name.includes('kube-prometheus')
          );
          
          if (prometheusSecrets.length > 0) {
            addComponentLog(`Found ${prometheusSecrets.length} Helm release secrets. Cleaning up...`);
            
            for (const secret of prometheusSecrets) {
              const secretName = secret.metadata.name;
              addComponentLog(`Deleting Helm release secret: ${secretName}`);
              
              // Patch to remove finalizers first
              await window.api.executeCommand('kubectl', [
                'patch',
                'secret',
                secretName,
                '-n',
                'monitoring',
                '-p',
                '{"metadata":{"finalizers":null}}',
                '--type=merge'
              ]).catch(e => {
                addComponentLog(`Warning: Could not remove finalizers from secret ${secretName}: ${e.message}`);
              });
              
              // Now delete the secret
              await window.api.executeCommand('kubectl', [
                'delete',
                'secret',
                secretName,
                '-n',
                'monitoring',
                '--force',
                '--grace-period=0'
              ]).catch(e => {
                addComponentLog(`Warning: Could not delete secret ${secretName}: ${e.message}`);
              });
            }
            
            // Wait for secrets to be deleted
            addComponentLog('Waiting for Helm secrets to be fully deleted...');
            await new Promise(resolve => setTimeout(resolve, 5000));
          } else {
            addComponentLog('No Prometheus-related Helm release secrets found.');
          }
        } else {
          addComponentLog('No Helm release secrets found in monitoring namespace.');
        }
      } catch (error) {
        addComponentLog(`Error processing Helm secrets: ${error.message}`);
      }
    }
    
    // Check for list.v1 format secrets also
    const helmSecretsListV1Result = await window.api.executeCommand('kubectl', [
      'get',
      'secrets',
      '-n',
      'monitoring',
      '--field-selector',
      'type=helm.sh/release.v1',
      '-o',
      'name'
    ]).catch(() => ({ code: 1, stdout: '' }));
    
    if (helmSecretsListV1Result.code === 0 && helmSecretsListV1Result.stdout) {
      const helmSecrets = helmSecretsListV1Result.stdout.split(/\s+/).filter(s => s);
      for (const secret of helmSecrets) {
        if (secret.includes('prometheus') || secret.includes('kube-prometheus')) {
          addComponentLog(`Deleting Helm release secret: ${secret}`);
          
          // Force delete without grace period
          await window.api.executeCommand('kubectl', [
            'delete',
            secret,
            '-n',
            'monitoring',
            '--force',
            '--grace-period=0'
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

    // Always uninstall metrics-server to ensure a clean installation
    if (metricsServerCheckResult.stdout && metricsServerCheckResult.stdout.trim() !== '[]') {
      addComponentLog('Uninstalling existing metrics-server for clean reinstallation...');
      await window.api.executeCommand('helm', [
        'uninstall',
        'metrics-server',
        '--namespace',
        'kube-system'
      ]).catch(e => {
        addComponentLog(`Warning: Error uninstalling metrics-server: ${e.message}. Will continue anyway.`);
      });
      
      // Wait for uninstallation to complete
      addComponentLog('Waiting for metrics-server uninstallation to complete...');
      await new Promise(resolve => setTimeout(resolve, 10000));
    }

    // Always install metrics-server (reinstallation)
    addComponentLog('Installing metrics-server...');
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

    if (metricsServerInstallResult.code !== 0) {
      addComponentLog(`Warning: metrics-server installation reported an issue: ${metricsServerInstallResult.stderr}`);
      addComponentLog('Will continue with installation anyway, but some monitoring features may be limited.');
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

    // Give metrics-server additional time to initialize and connect to the API
    addComponentLog('Giving metrics-server time to initialize (30 seconds)...');
    await new Promise(resolve => setTimeout(resolve, 30000));

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

    // Check one more time if the namespace is in a good state
    const finalNamespaceCheck = await window.api.executeCommand('kubectl', [
      'get',
      'namespace',
      'monitoring',
      '-o',
      'json'
    ]).catch(() => ({ code: 1, stdout: '{}' }));

    // Instead of deleting the namespace, we'll focus on cleaning up resources within it
    addComponentLog('Cleaning up resources within the monitoring namespace for clean reinstallation...');
    
    // Delete all deployments, statefulsets, daemonsets in the monitoring namespace
    const namespaceCleanupResourceTypes = [
      'deployment', 'statefulset', 'daemonset', 'replicaset', 'pod',
      'configmap', 'secret', 'service', 'serviceaccount', 'rolebinding', 'role'
    ];
    
    for (const resourceType of namespaceCleanupResourceTypes) {
      addComponentLog(`Removing all ${resourceType}s from monitoring namespace...`);
      await window.api.executeCommand('kubectl', [
        'delete',
        resourceType,
        '--all',
        '-n',
        'monitoring',
        '--ignore-not-found'
      ]).catch(e => {
        addComponentLog(`Note: Could not delete all ${resourceType}s: ${e.message}`);
      });
    }
    
    // Check for any stuck pods and force delete them
    addComponentLog('Checking for any stuck pods in monitoring namespace...');
    const stuckPodsResult = await window.api.executeCommand('kubectl', [
      'get',
      'pods',
      '-n',
      'monitoring',
      '-o',
      'name'
    ]).catch(() => ({ code: 1, stdout: '' }));
    
    if (stuckPodsResult.code === 0 && stuckPodsResult.stdout) {
      const pods = stuckPodsResult.stdout.split('\n').filter(p => p.trim());
      
      if (pods.length > 0) {
        addComponentLog(`Found ${pods.length} pods still in monitoring namespace. Force deleting...`);
        
        for (const pod of pods) {
          addComponentLog(`Force deleting pod: ${pod}`);
          await window.api.executeCommand('kubectl', [
            'delete',
            pod,
            '-n',
            'monitoring',
            '--force',
            '--grace-period=0'
          ]).catch(e => {
            addComponentLog(`Warning: Could not delete pod ${pod}: ${e.message}`);
          });
        }
      }
    }
    
    // Remove all helm secrets (more reliable than trying to filter by name)
    addComponentLog('Removing all Helm release secrets from monitoring namespace...');
    await window.api.executeCommand('kubectl', [
      'delete',
      'secret',
      '--field-selector',
      'type=helm.sh/release.v1',
      '-n',
      'monitoring',
      '--all',
      '--ignore-not-found'
    ]).catch(e => {
      addComponentLog(`Note: Could not delete Helm secrets: ${e.message}`);
    });
    
    // Wait for resources to be deleted
    addComponentLog('Waiting for resources to be fully deleted...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Create the monitoring namespace if it doesn't exist (don't recreate it)
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

    addComponentLog('Updating Helm repositories...');
    const helmUpdateResult = await window.api.executeCommand('helm', [
      'repo',
      'update'
    ]);

    if (helmUpdateResult.code !== 0) {
      throw new Error(`Failed to update Helm repositories: ${helmUpdateResult.stderr}`);
    }

    // Create values file for kube-prometheus-stack using a temporary file
    const prometheusValues = `
global:
  rbac:
    create: true
  securityContext:
    enabled: false

grafana:
  enabled: true
  adminPassword: edurange
  service:
    type: ClusterIP
  persistence:
    enabled: true${storageClassName ? `\n    storageClassName: ${storageClassName}` : ''}
  securityContext:
    runAsUser: 65534
    runAsGroup: 65534
    fsGroup: 65534

prometheus:
  prometheusSpec:
    securityContext:
      runAsUser: 65534
      runAsGroup: 65534
      fsGroup: 65534
    storageSpec:
      volumeClaimTemplate:
        spec:${storageClassName ? `\n          storageClassName: ${storageClassName}` : ''}
          accessModes: ["ReadWriteOnce"]
          resources:
            requests:
              storage: 8Gi

alertmanager:
  alertmanagerSpec:
    securityContext:
      runAsUser: 65534
      runAsGroup: 65534
      fsGroup: 65534
    storage:
      volumeClaimTemplate:
        spec:${storageClassName ? `\n          storageClassName: ${storageClassName}` : ''}
          accessModes: ["ReadWriteOnce"]
          resources:
            requests:
              storage: 2Gi

kubeProxy:
  enabled: false

kubeEtcd:
  enabled: false

kubeControllerManager:
  enabled: false

kubeScheduler:
  enabled: false
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

    // Implement retry logic for Helm installation
    addComponentLog('Installing kube-prometheus-stack with retry mechanism...');
    let helmInstallSuccess = false;
    let helmInstallError = null;
    const helmMaxRetries = 3;
    
    for (let attempt = 1; attempt <= helmMaxRetries; attempt++) {
      addComponentLog(`Helm install attempt ${attempt}/${helmMaxRetries}...`);
      
      // Install kube-prometheus-stack using the temporary values file with a longer timeout
      const helmInstallResult = await window.api.executeCommand('helm', [
        'upgrade',
        '--install',
        'prometheus',
        'prometheus-community/kube-prometheus-stack',
        '--namespace',
        'monitoring',
        '-f',
        tempFilePath,
        '--timeout',
        '10m', // Increase timeout to 10 minutes
        '--atomic', // Use atomic to automatically rollback on failure
        '--wait' // Wait for resources to be ready
      ]);
      
      if (helmInstallResult.code === 0) {
        addComponentLog('kube-prometheus-stack installed successfully.');
        helmInstallSuccess = true;
        break;
      } else {
        helmInstallError = helmInstallResult.stderr;
        addComponentLog(`Helm install attempt ${attempt} failed: ${helmInstallError}`);
        
        if (attempt < helmMaxRetries) {
          // Check if it's a timeout error or PVC-related error
          if (helmInstallError.includes('timeout') || 
              helmInstallError.includes('timed out') || 
              helmInstallError.includes('PVC') || 
              helmInstallError.includes('persistentvolumeclaim') ||
              helmInstallError.includes('storage')) {
            
            addComponentLog('Detected timeout or storage-related error. Running more aggressive cleanup before retry...');
            
            // Try to clean up failed resources
            await window.api.executeCommand('helm', [
              'uninstall',
              'prometheus',
              '--namespace',
              'monitoring',
              '--ignore-not-found'
            ]).catch(() => {});
            
            // Run additional PVC cleanup
            addComponentLog('Cleaning up any stuck PVCs...');
            
            // Get all PVCs in monitoring namespace
            const stuckPvcsResult = await window.api.executeCommand('kubectl', [
              'get',
              'pvc',
              '-n',
              'monitoring',
              '-o',
              'json'
            ]).catch(() => ({ code: 1, stdout: '{}' }));
            
            if (stuckPvcsResult.code === 0 && stuckPvcsResult.stdout !== '{}') {
              try {
                const pvcs = JSON.parse(stuckPvcsResult.stdout).items || [];
                for (const pvc of pvcs) {
                  const pvcName = pvc.metadata.name;
                  addComponentLog(`Force deleting PVC: ${pvcName}`);
                  
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
                  
                  // Delete PVC
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
              } catch (error) {
                addComponentLog(`Error processing stuck PVCs: ${error.message}`);
              }
            }
            
            // Also run the full storage cleanup utility again
            addComponentLog('Running global storage cleanup to free up any stuck volumes...');
            await cleanupUnusedStorage(addComponentLog);
            
            // Wait longer before next retry
            const waitTime = attempt * 30; // 30s, 60s, 90s
            addComponentLog(`Waiting ${waitTime} seconds before next attempt...`);
            await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
          } else {
            // For other errors, wait a bit less
            addComponentLog('Waiting 15 seconds before retry...');
            await new Promise(resolve => setTimeout(resolve, 15000));
          }
        }
      }
    }

    // Clean up the temporary file
    await window.api.executeCommand('rm', [tempFilePath]);

    if (!helmInstallSuccess) {
      throw new Error(`Failed to install kube-prometheus-stack after ${helmMaxRetries} attempts: ${helmInstallError}`);
    }

    // Wait for Prometheus to be ready
    addComponentLog('Waiting for Prometheus server pod to be ready...');
    
    // Implement more resilient retry mechanism
    addComponentLog('Will check for Prometheus pods readiness with exponential backoff...');
    
    let prometheusServerPodFound = false;
    let retryAttempts = 0;
    const maxRetries = 12; // Up to 12 attempts with increasing wait times
    let waitTime = 5; // Start with 5 seconds, will increase
    
    while (!prometheusServerPodFound && retryAttempts < maxRetries) {
      retryAttempts++;
      addComponentLog(`Attempt ${retryAttempts}/${maxRetries} to find and verify Prometheus server pod...`);
      
      // First, get the overall pod status in the monitoring namespace
      addComponentLog('Checking pod status in monitoring namespace...');
      const podStatusResult = await window.api.executeCommand('kubectl', [
        'get',
        'pods',
        '-n',
        'monitoring',
        '-o',
        'wide'
      ]);
      
      if (podStatusResult.code === 0 && podStatusResult.stdout) {
        addComponentLog(`Current pod status in monitoring namespace:\n${podStatusResult.stdout}`);
      }
      
      // Try to get prometheus server pod specifically
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
      
      // If not found with the first label, try alternative labels
      if (podInfoResult.code !== 0 || !podInfoResult.stdout) {
        addComponentLog('Prometheus pod not found with primary label. Trying alternative labels...');
        
        // Try several alternative labels that might be used
        const labelSelectors = [
          'app=prometheus',
          'app.kubernetes.io/component=prometheus',
          'component=prometheus',
          'prometheus=kube-prometheus-stack-prometheus'
        ];
        
        let found = false;
        for (const selector of labelSelectors) {
          addComponentLog(`Trying label selector: ${selector}`);
          const altPodInfoResult = await window.api.executeCommand('kubectl', [
            'get',
            'pods',
            '-n',
            'monitoring',
            '-l',
            selector,
            '-o',
            'name'
          ]);
          
          if (altPodInfoResult.code === 0 && altPodInfoResult.stdout) {
            const podNames = altPodInfoResult.stdout.split('\n').filter(p => p);
            if (podNames.length > 0) {
              addComponentLog(`Found prometheus pod(s) using selector '${selector}': ${podNames.join(', ')}`);
              
              // Check if the pod is ready
              for (const podName of podNames) {
                const shortPodName = podName.replace('pod/', '');
                const podStatusResult = await window.api.executeCommand('kubectl', [
                  'get',
                  'pod',
                  shortPodName,
                  '-n',
                  'monitoring',
                  '-o',
                  'jsonpath={.status.phase},{.status.conditions[?(@.type=="Ready")].status}'
                ]);
                
                if (podStatusResult.code === 0 && podStatusResult.stdout) {
                  const [phase, readyStatus] = podStatusResult.stdout.split(',');
                  addComponentLog(`Pod ${shortPodName} - Phase: ${phase}, Ready: ${readyStatus}`);
                  
                  if (phase === 'Running' && readyStatus === 'True') {
                    addComponentLog(`Prometheus pod ${shortPodName} is ready!`);
                    prometheusServerPodFound = true;
                    found = true;
                    break;
                  } else if (phase === 'Pending') {
                    // Check if there are any PVC issues
                    const podDescribeResult = await window.api.executeCommand('kubectl', [
                      'describe',
                      'pod',
                      shortPodName,
                      '-n',
                      'monitoring'
                    ]);
                    
                    if (podDescribeResult.stdout.includes('persistentvolumeclaim') && 
                        (podDescribeResult.stdout.includes('Pending') || 
                         podDescribeResult.stdout.includes('waiting for volume'))) {
                      addComponentLog('Pod is waiting for persistent volume. Running additional storage cleanup...');
                      await cleanupUnusedStorage(addComponentLog);
                    }
                  }
                }
              }
              
              if (found) break;
            }
          }
        }
      } else {
        const podNames = podInfoResult.stdout.split('\n').filter(p => p);
        if (podNames.length > 0) {
          addComponentLog(`Found prometheus pod(s): ${podNames.join(', ')}`);
          
          // Check if the pod is ready
          for (const podName of podNames) {
            const shortPodName = podName.replace('pod/', '');
            const podStatusResult = await window.api.executeCommand('kubectl', [
              'get',
              'pod',
              shortPodName,
              '-n',
              'monitoring',
              '-o',
              'jsonpath={.status.phase},{.status.conditions[?(@.type=="Ready")].status}'
            ]);
            
            if (podStatusResult.code === 0 && podStatusResult.stdout) {
              const [phase, readyStatus] = podStatusResult.stdout.split(',');
              addComponentLog(`Pod ${shortPodName} - Phase: ${phase}, Ready: ${readyStatus}`);
              
              if (phase === 'Running' && readyStatus === 'True') {
                addComponentLog(`Prometheus pod ${shortPodName} is ready!`);
                prometheusServerPodFound = true;
                break;
              }
            }
          }
        }
      }
      
      if (!prometheusServerPodFound && retryAttempts < maxRetries) {
        // Exponential backoff with capping
        waitTime = Math.min(waitTime * 1.5, 60); // Increase wait time but cap at 60 seconds
        addComponentLog(`Prometheus pod not ready yet. Waiting ${waitTime} seconds before next check...`);
        await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
      }
    }
    
    if (!prometheusServerPodFound) {
      // Instead of failing, log a warning and continue since Grafana might still work
      addComponentLog('WARNING: Prometheus server pod not found or not ready after maximum attempts.');
      addComponentLog('Will continue with installation anyway - the system may take longer to fully initialize.');
      
      // Give a final attempt to diagnose issues
      addComponentLog('Checking for any issues with PVCs...');
      const pvcStatusResult = await window.api.executeCommand('kubectl', [
        'get',
        'pvc',
        '-n',
        'monitoring'
      ]);
      
      if (pvcStatusResult.code === 0) {
        addComponentLog(`PVC Status:\n${pvcStatusResult.stdout}`);
      }
      
      // Check storage class
      const scStatusResult = await window.api.executeCommand('kubectl', [
        'get',
        'storageclass'
      ]);
      
      if (scStatusResult.code === 0) {
        addComponentLog(`StorageClass Status:\n${scStatusResult.stdout}`);
      }
    }

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
    
    // Create Horizontal Pod Autoscaler for Monitoring Service
    addComponentLog('Creating Horizontal Pod Autoscaler for Monitoring Service...');
    const hpaYaml = `
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: monitoring-service-hpa
  namespace: default
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: monitoring-service
  minReplicas: 1
  maxReplicas: 3
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Percent
        value: 25
        periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
      - type: Percent
        value: 100
        periodSeconds: 60
`;

    try {
      await window.api.applyManifestFromString(hpaYaml);
      addComponentLog('Horizontal Pod Autoscaler for Monitoring Service created successfully.');
    } catch (error) {
      addComponentLog(`Warning: Failed to create HPA for Monitoring Service: ${error.message}`);
      addComponentLog('Continuing with installation. You can manually add HPA later.');
    }
    
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
