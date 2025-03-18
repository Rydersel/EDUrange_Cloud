/**
 * Utilities for cleaning up unused storage resources in Kubernetes
 */

/**
 * Finds and deletes unused PVCs and PVs in the cluster
 * @param {Function} logCallback - Function to log messages
 * @returns {Promise<Object>} - Result of the cleanup operation
 */
export const cleanupUnusedStorage = async (logCallback) => {
  const log = (message) => {
    console.log(message);
    if (logCallback) {
      logCallback(message);
    }
  };

  try {
    log('Starting cleanup of unused storage resources...');
    
    // Step 1: Get all PVCs in the cluster
    log('Checking for unused PVCs...');
    const pvcResult = await window.api.executeCommand('kubectl', [
      'get',
      'pvc',
      '--all-namespaces',
      '-o',
      'json'
    ]);
    
    if (pvcResult.code !== 0) {
      throw new Error(`Failed to get PVCs: ${pvcResult.stderr}`);
    }
    
    const pvcs = JSON.parse(pvcResult.stdout).items;
    log(`Found ${pvcs.length} PVCs in the cluster.`);
    
    // Step 2: Get all pods in the cluster
    log('Getting all pods to check PVC usage...');
    const podsResult = await window.api.executeCommand('kubectl', [
      'get',
      'pods',
      '--all-namespaces',
      '-o',
      'json'
    ]);
    
    if (podsResult.code !== 0) {
      throw new Error(`Failed to get pods: ${podsResult.stderr}`);
    }
    
    const pods = JSON.parse(podsResult.stdout).items;
    
    // Step 3: Find unused PVCs (not referenced by any pod)
    const usedPvcs = new Set();
    
    // Collect all PVCs used by pods
    pods.forEach(pod => {
      if (pod.spec.volumes) {
        pod.spec.volumes.forEach(volume => {
          if (volume.persistentVolumeClaim && volume.persistentVolumeClaim.claimName) {
            // Format: namespace/pvcName
            const key = `${pod.metadata.namespace}/${volume.persistentVolumeClaim.claimName}`;
            usedPvcs.add(key);
          }
        });
      }
    });
    
    // Find PVCs that are not used by any pod
    const unusedPvcs = pvcs.filter(pvc => {
      const key = `${pvc.metadata.namespace}/${pvc.metadata.name}`;
      return !usedPvcs.has(key);
    });
    
    log(`Found ${unusedPvcs.length} unused PVCs.`);
    
    // Step 4: Delete unused PVCs
    let deletedPvcs = 0;
    
    for (const pvc of unusedPvcs) {
      // Skip PVCs that are being created or deleted
      if (pvc.metadata.deletionTimestamp) {
        log(`Skipping PVC ${pvc.metadata.namespace}/${pvc.metadata.name} as it's already being deleted.`);
        continue;
      }
      
      // Skip PVCs that are in the process of being bound
      if (pvc.status.phase === 'Pending') {
        log(`Skipping PVC ${pvc.metadata.namespace}/${pvc.metadata.name} as it's in Pending state.`);
        continue;
      }
      
      // Skip system PVCs or those with special annotations
      if (pvc.metadata.namespace === 'kube-system' || 
          (pvc.metadata.annotations && pvc.metadata.annotations['kubernetes.io/do-not-delete'] === 'true')) {
        log(`Skipping system or protected PVC ${pvc.metadata.namespace}/${pvc.metadata.name}.`);
        continue;
      }
      
      // Skip postgres-pvc as we're about to use it
      if (pvc.metadata.name === 'postgres-pvc') {
        log(`Skipping postgres-pvc as it's needed for the database installation.`);
        continue;
      }
      
      log(`Deleting unused PVC ${pvc.metadata.namespace}/${pvc.metadata.name}...`);
      
      try {
        // First try to remove finalizers if present
        if (pvc.metadata.finalizers && pvc.metadata.finalizers.length > 0) {
          log(`Removing finalizers from PVC ${pvc.metadata.namespace}/${pvc.metadata.name}...`);
          
          await window.api.executeCommand('kubectl', [
            'patch',
            'pvc',
            pvc.metadata.name,
            '-n',
            pvc.metadata.namespace,
            '-p',
            '{"metadata":{"finalizers":null}}',
            '--type=merge'
          ]);
        }
        
        // Delete the PVC
        const deleteResult = await window.api.executeCommand('kubectl', [
          'delete',
          'pvc',
          pvc.metadata.name,
          '-n',
          pvc.metadata.namespace,
          '--force',
          '--grace-period=0'
        ]);
        
        if (deleteResult.code === 0) {
          log(`Successfully deleted PVC ${pvc.metadata.namespace}/${pvc.metadata.name}.`);
          deletedPvcs++;
        } else {
          log(`Failed to delete PVC ${pvc.metadata.namespace}/${pvc.metadata.name}: ${deleteResult.stderr}`);
        }
      } catch (error) {
        log(`Error deleting PVC ${pvc.metadata.namespace}/${pvc.metadata.name}: ${error.message}`);
      }
    }
    
    // Step 5: Find and delete orphaned PVs (Released or Failed state)
    log('Checking for orphaned PVs...');
    const pvResult = await window.api.executeCommand('kubectl', [
      'get',
      'pv',
      '-o',
      'json'
    ]);
    
    if (pvResult.code !== 0) {
      throw new Error(`Failed to get PVs: ${pvResult.stderr}`);
    }
    
    const pvs = JSON.parse(pvResult.stdout).items;
    const orphanedPvs = pvs.filter(pv => 
      pv.status.phase === 'Released' || 
      pv.status.phase === 'Failed'
    );
    
    log(`Found ${orphanedPvs.length} orphaned PVs.`);
    
    // Delete orphaned PVs
    let deletedPvs = 0;
    
    for (const pv of orphanedPvs) {
      log(`Deleting orphaned PV ${pv.metadata.name}...`);
      
      try {
        // First try to remove finalizers if present
        if (pv.metadata.finalizers && pv.metadata.finalizers.length > 0) {
          log(`Removing finalizers from PV ${pv.metadata.name}...`);
          
          await window.api.executeCommand('kubectl', [
            'patch',
            'pv',
            pv.metadata.name,
            '-p',
            '{"metadata":{"finalizers":null}}',
            '--type=merge'
          ]);
        }
        
        // Delete the PV
        const deleteResult = await window.api.executeCommand('kubectl', [
          'delete',
          'pv',
          pv.metadata.name,
          '--force',
          '--grace-period=0'
        ]);
        
        if (deleteResult.code === 0) {
          log(`Successfully deleted PV ${pv.metadata.name}.`);
          deletedPvs++;
        } else {
          log(`Failed to delete PV ${pv.metadata.name}: ${deleteResult.stderr}`);
        }
      } catch (error) {
        log(`Error deleting PV ${pv.metadata.name}: ${error.message}`);
      }
    }
    
    // Step 6: Check for stuck volumes in cloud provider
    // This is provider-specific and would need to be implemented for each provider
    // For now, we'll just log a message
    log('Note: This utility cannot directly delete cloud provider volumes that are not associated with Kubernetes resources.');
    log('If you continue to experience storage limits, please check your cloud provider console for orphaned volumes.');
    
    // Return summary
    return {
      success: true,
      deletedPvcs,
      deletedPvs,
      message: `Cleanup completed. Deleted ${deletedPvcs} unused PVCs and ${deletedPvs} orphaned PVs.`
    };
  } catch (error) {
    log(`Error during storage cleanup: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Checks if the cluster is running on a specific cloud provider
 * @param {string} providerName - The name of the provider to check for (e.g., 'linode', 'aws', 'azure', 'gcp')
 * @param {Function} logFn - Function to use for logging
 * @returns {Promise<boolean>} - True if running on the specified provider
 */
export const isRunningOnProvider = async (providerName, logFn = console.log) => {
  try {
    // Check storage classes first as they're the most reliable indicator
    const scResult = await window.api.executeCommand('kubectl', [
      'get',
      'storageclass',
      '-o',
      'json'
    ]);
    
    if (scResult.code === 0) {
      const storageClasses = JSON.parse(scResult.stdout).items;
      
      // Check if any storage class provisioner contains the provider name
      const matchingProviders = storageClasses.filter(sc => 
        sc.provisioner && sc.provisioner.toLowerCase().includes(providerName.toLowerCase())
      );
      
      if (matchingProviders.length > 0) {
        return true;
      }
    }
    
    // Check node labels as a fallback
    const nodeResult = await window.api.executeCommand('kubectl', [
      'get',
      'nodes',
      '-o',
      'json'
    ]);
    
    if (nodeResult.code === 0) {
      const nodes = JSON.parse(nodeResult.stdout).items;
      
      // Look for provider-specific labels in node metadata
      for (const node of nodes) {
        const labels = node.metadata?.labels || {};
        const providerLabels = Object.keys(labels).filter(label => 
          label.includes(providerName) || 
          label.includes('cloud.google') || 
          label.includes('amazonaws') || 
          label.includes('azure') ||
          label.includes('linode')
        );
        
        if (providerLabels.length > 0) {
          return providerLabels.some(label => label.includes(providerName));
        }
      }
    }
    
    return false;
  } catch (error) {
    logFn(`Error detecting provider ${providerName}: ${error.message}`);
    return false;
  }
}; 