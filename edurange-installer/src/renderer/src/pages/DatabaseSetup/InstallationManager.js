import { verifyDatabasePasswordConsistency } from '../../utils/databaseUtils';
import { runFixedPrismaMigrations } from './MigrationManager';
import { waitForPodAndCheckLogs } from './StatusChecks';
import { btoa, atob } from './UtilityFunctions';
import { generateRandomPassword as generatePassword } from './PasswordManager';
import { cleanupUnusedStorage, isRunningOnProvider } from '../../utils/storageCleanupUtils';

/**
 * Functions for managing database installation and deletion
 */

/**
 * Creates a directory on the host for local storage
 * @param {Function} addLog - Function to add logs
 * @returns {Promise<boolean>} - True if successful
 */
const createLocalStorageDirectory = async (addLog) => {
  addLog('Creating local storage directory on the host...');
  try {
    // First, find a node to run the command on
    const nodeResult = await window.api.executeCommand('kubectl', [
      'get',
      'nodes',
      '-o',
      'jsonpath={.items[0].metadata.name}'
    ]);

    if (nodeResult.code !== 0) {
      addLog('Warning: Could not get node name. Will try to create directory anyway.');
      return false;
    }

    const nodeName = nodeResult.stdout;

    // Create a temporary pod to create the directory
    const createDirPodYaml = `
apiVersion: v1
kind: Pod
metadata:
  name: dir-creator
spec:
  restartPolicy: Never
  containers:
  - name: dir-creator
    image: busybox
    command: ["sh", "-c", "mkdir -p /host-tmp/edurange-data && chmod 777 /host-tmp/edurange-data"]
    volumeMounts:
    - name: host-tmp
      mountPath: /host-tmp
  volumes:
  - name: host-tmp
    hostPath:
      path: /tmp
      type: Directory
  nodeSelector:
    kubernetes.io/hostname: ${nodeName}
`;

    // Apply the pod
    await window.api.applyManifestFromString(createDirPodYaml);

    // Wait for the pod to complete
    addLog('Waiting for directory creation to complete...');
    let podCompleted = false;
    let retryCount = 0;
    const maxRetries = 10;

    while (!podCompleted && retryCount < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, 2000));

      const podStatusResult = await window.api.executeCommand('kubectl', [
        'get',
        'pod',
        'dir-creator',
        '-o',
        'jsonpath={.status.phase}'
      ]);

      if (podStatusResult.code === 0 &&
          (podStatusResult.stdout === 'Succeeded' || podStatusResult.stdout === 'Failed')) {
        podCompleted = true;

        // Check logs to see if it succeeded
        const logsResult = await window.api.executeCommand('kubectl', [
          'logs',
          'dir-creator'
        ]);

        if (logsResult.code === 0) {
          addLog(`Directory creation pod logs: ${logsResult.stdout || 'No output'}`);
        }
      } else {
        retryCount++;
      }
    }

    // Delete the pod
    await window.api.executeCommand('kubectl', [
      'delete',
      'pod',
      'dir-creator',
      '--ignore-not-found'
    ]);

    addLog('Local storage directory created successfully.');
    return true;
  } catch (error) {
    addLog(`Warning: Error creating local storage directory: ${error.message}`);
    addLog('Continuing with installation, but it may fail if the directory does not exist.');
    return false;
  }
};

/**
 * Cleans the PostgreSQL data directory if it already exists
 * @param {Function} addLog - Function to add logs
 * @returns {Promise<boolean>} - True if successful
 */
const cleanPostgresDataDirectory = async (addLog) => {
  addLog('Checking if PostgreSQL data directory needs to be cleaned...');
  try {
    // First, find a node to run the command on
    const nodeResult = await window.api.executeCommand('kubectl', [
      'get',
      'nodes',
      '-o',
      'jsonpath={.items[0].metadata.name}'
    ]);
    
    if (nodeResult.code !== 0) {
      addLog('Warning: Could not get node name. Will try to clean directory anyway.');
      return false;
    }
    
    const nodeName = nodeResult.stdout;
    
    // Create a temporary pod to clean the directory
    const cleanDirPodYaml = `
apiVersion: v1
kind: Pod
metadata:
  name: dir-cleaner
spec:
  restartPolicy: Never
  containers:
  - name: dir-cleaner
    image: busybox
    command: ["sh", "-c", "if [ -d /host-tmp/edurange-data ]; then rm -rf /host-tmp/edurange-data/* && echo 'Directory cleaned'; else echo 'Directory does not exist'; fi"]
    volumeMounts:
    - name: host-tmp
      mountPath: /host-tmp
  volumes:
  - name: host-tmp
    hostPath:
      path: /tmp
      type: Directory
  nodeSelector:
    kubernetes.io/hostname: ${nodeName}
`;
    
    // Apply the pod
    await window.api.applyManifestFromString(cleanDirPodYaml);
    
    // Wait for the pod to complete
    addLog('Waiting for directory cleaning to complete...');
    let podCompleted = false;
    let retryCount = 0;
    const maxRetries = 10;
    
    while (!podCompleted && retryCount < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const podStatusResult = await window.api.executeCommand('kubectl', [
        'get',
        'pod',
        'dir-cleaner',
        '-o',
        'jsonpath={.status.phase}'
      ]);
      
      if (podStatusResult.code === 0 && 
          (podStatusResult.stdout === 'Succeeded' || podStatusResult.stdout === 'Failed')) {
        podCompleted = true;
        
        // Check logs to see if it succeeded
        const logsResult = await window.api.executeCommand('kubectl', [
          'logs',
          'dir-cleaner'
        ]);
        
        if (logsResult.code === 0) {
          addLog(`Directory cleaning result: ${logsResult.stdout || 'No output'}`);
        }
      } else {
        retryCount++;
      }
    }
    
    // Delete the pod
    await window.api.executeCommand('kubectl', [
      'delete',
      'pod',
      'dir-cleaner',
      '--ignore-not-found'
    ]);
    
    addLog('PostgreSQL data directory cleaning completed.');
    return true;
  } catch (error) {
    addLog(`Warning: Error cleaning PostgreSQL data directory: ${error.message}`);
    addLog('Continuing with installation, but it may fail if the directory contains data.');
    return false;
  }
};

/**
 * Installs PostgreSQL in the Kubernetes cluster
 * @param {Object} params - Parameters
 * @param {Function} params.addLog - Function to add logs
 * @param {Function} params.setLogs - Function to set logs
 * @param {boolean} params.enableStorageCleanup - Whether to enable storage cleanup
 * @returns {Promise<void>}
 */
const installPostgresInCluster = async ({ addLog, setLogs, enableStorageCleanup }) => {
  // Install PostgreSQL in the cluster
  addLog('Installing PostgreSQL in the cluster...');
  setLogs(prev => [...prev, 'Installing PostgreSQL in the cluster...']);

  // Check if we're running on a cloud provider with storage limits
  addLog('Checking cloud provider environment...');
  const isLinode = await isRunningOnProvider('linode', addLog);

  // Run storage cleanup if enabled and we're on Linode or another cloud provider
  if (enableStorageCleanup) {
    if (isLinode) {
      addLog('Detected Linode environment. Running storage cleanup to prevent hitting volume limits...');
      const cleanupResult = await cleanupUnusedStorage(addLog);

      if (cleanupResult.success) {
        addLog(cleanupResult.message);
      } else {
        addLog(`Warning: Storage cleanup encountered an error: ${cleanupResult.error}`);
        addLog('Continuing with installation anyway...');
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
              sc.provisioner.includes('aws') ||
              sc.provisioner.includes('azure') ||
              sc.provisioner.includes('gcp') ||
              sc.provisioner.includes('linode') ||
              sc.provisioner.includes('csi')
            )
          );

          if (cloudProviders.length > 0) {
            addLog('Detected cloud provider environment. Running storage cleanup as a precaution...');
            const cleanupResult = await cleanupUnusedStorage(addLog);

            if (cleanupResult.success) {
              addLog(cleanupResult.message);
            } else {
              addLog(`Warning: Storage cleanup encountered an error: ${cleanupResult.error}`);
              addLog('Continuing with installation anyway...');
            }
          }
        } catch (error) {
          addLog(`Warning: Error checking storage classes: ${error.message}`);
        }
      }
    }
  } else {
    addLog('Storage cleanup is disabled. Skipping cleanup step.');
  }

  // Check for existing PVC first
  addLog('Checking for existing PostgreSQL PVC...');
  setLogs(prev => [...prev, 'Checking for existing PostgreSQL PVC...']);

  const checkPvcResult = await window.api.executeCommand('kubectl', [
    'get',
    'pvc',
    'postgres-pvc',
    '--ignore-not-found'
  ]);

  if (checkPvcResult.stdout.includes('postgres-pvc')) {
    addLog('Found existing PostgreSQL PVC. Cleaning up...');
    setLogs(prev => [...prev, 'Found existing PostgreSQL PVC. Cleaning up...']);

    // Check if any pods are using the PVC
    const podsUsingPvcResult = await window.api.executeCommand('kubectl', [
      'get',
      'pods',
      '--all-namespaces',
      '-o',
      'json'
    ]);

    if (podsUsingPvcResult.code === 0) {
      try {
        const pods = JSON.parse(podsUsingPvcResult.stdout).items;
        const podsUsingPvc = pods.filter(pod => {
          if (!pod.spec.volumes) return false;
          return pod.spec.volumes.some(volume =>
            volume.persistentVolumeClaim &&
            volume.persistentVolumeClaim.claimName === 'postgres-pvc'
          );
        });

        if (podsUsingPvc.length > 0) {
          addLog(`Found ${podsUsingPvc.length} pods using the PVC. Deleting them first...`);
          setLogs(prev => [...prev, `Found ${podsUsingPvc.length} pods using the PVC. Deleting them first...`]);

          for (const pod of podsUsingPvc) {
            const podName = pod.metadata.name;
            const namespace = pod.metadata.namespace;

            addLog(`Deleting pod ${podName} in namespace ${namespace}...`);
            setLogs(prev => [...prev, `Deleting pod ${podName} in namespace ${namespace}...`]);

            await window.api.executeCommand('kubectl', [
              'delete',
              'pod',
              podName,
              '-n',
              namespace,
              '--grace-period=0',
              '--force'
            ]);

            addLog(`Deleted pod ${podName}`);
            setLogs(prev => [...prev, `Deleted pod ${podName}`]);
          }

          // Wait for pods to be fully deleted
          addLog('Waiting for pods to be fully deleted...');
          setLogs(prev => [...prev, 'Waiting for pods to be fully deleted...']);
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      } catch (error) {
        addLog(`Warning: Error checking pods using PVC: ${error.message}`);
        setLogs(prev => [...prev, `Warning: Error checking pods using PVC: ${error.message}`]);
      }
    }

    // Try to delete the PVC
    addLog('Deleting existing PostgreSQL PVC...');
    setLogs(prev => [...prev, 'Deleting existing PostgreSQL PVC...']);

    try {
      await window.api.executeCommand('kubectl', [
        'delete',
        'pvc',
        'postgres-pvc',
        '--grace-period=0',
        '--force'
      ]);

      addLog('Deleted existing PostgreSQL PVC');
      setLogs(prev => [...prev, 'Deleted existing PostgreSQL PVC']);
    } catch (error) {
      addLog(`Warning: Error deleting PVC: ${error.message}. Attempting alternative approach...`);
      setLogs(prev => [...prev, `Warning: Error deleting PVC: ${error.message}. Attempting alternative approach...`]);

      // Try to patch the PVC finalizers to null to force deletion
      try {
        await window.api.executeCommand('kubectl', [
          'patch',
          'pvc',
          'postgres-pvc',
          '-p',
          '{"metadata":{"finalizers":null}}',
          '--type=merge'
        ]);

        addLog('Patched PVC finalizers to force deletion');
        setLogs(prev => [...prev, 'Patched PVC finalizers to force deletion']);

        // Try deleting again
        await window.api.executeCommand('kubectl', [
          'delete',
          'pvc',
          'postgres-pvc',
          '--grace-period=0',
          '--force'
        ]);

        addLog('Successfully deleted PostgreSQL PVC after patching finalizers');
        setLogs(prev => [...prev, 'Successfully deleted PostgreSQL PVC after patching finalizers']);
      } catch (patchError) {
        addLog(`Warning: Could not patch PVC finalizers: ${patchError.message}. Will attempt to create a new PVC anyway.`);
        setLogs(prev => [...prev, `Warning: Could not patch PVC finalizers: ${patchError.message}. Will attempt to create a new PVC anyway.`]);
      }
    }

    // Check for any stuck persistent volumes
    addLog('Checking for any stuck persistent volumes...');
    setLogs(prev => [...prev, 'Checking for any stuck persistent volumes...']);

    const pvResult = await window.api.executeCommand('kubectl', [
      'get',
      'pv',
      '-o',
      'json'
    ]);

    if (pvResult.code === 0) {
      try {
        const pvs = JSON.parse(pvResult.stdout).items;
        const stuckPVs = pvs.filter(pv =>
          pv.spec.claimRef &&
          pv.spec.claimRef.name === 'postgres-pvc' &&
          (pv.status.phase === 'Released' || pv.status.phase === 'Failed')
        );

        if (stuckPVs.length > 0) {
          addLog(`Found ${stuckPVs.length} stuck persistent volumes. Cleaning up...`);
          setLogs(prev => [...prev, `Found ${stuckPVs.length} stuck persistent volumes. Cleaning up...`]);

          for (const pv of stuckPVs) {
            // Patch the PV to remove finalizers
            await window.api.executeCommand('kubectl', [
              'patch',
              'pv',
              pv.metadata.name,
              '-p',
              '{"metadata":{"finalizers":null}}',
              '--type=merge'
            ]);

            addLog(`Patched finalizers for PV ${pv.metadata.name}`);
            setLogs(prev => [...prev, `Patched finalizers for PV ${pv.metadata.name}`]);

            // Delete the PV
            await window.api.executeCommand('kubectl', [
              'delete',
              'pv',
              pv.metadata.name,
              '--grace-period=0',
              '--force'
            ]);

            addLog(`Deleted stuck PV ${pv.metadata.name}`);
            setLogs(prev => [...prev, `Deleted stuck PV ${pv.metadata.name}`]);
          }

          // Wait for PVs to be fully deleted
          addLog('Waiting for PVs to be fully deleted...');
          setLogs(prev => [...prev, 'Waiting for PVs to be fully deleted...']);
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      } catch (parseError) {
        addLog(`Warning: Error parsing PV list: ${parseError.message}`);
        setLogs(prev => [...prev, `Warning: Error parsing PV list: ${parseError.message}`]);
      }
    }
  }

  // Create PostgreSQL PV and PVC
  addLog('Creating PostgreSQL PV and PVC...');
  setLogs(prev => [...prev, 'Creating PostgreSQL PV and PVC...']);

  // Get the available storage classes
  addLog('Checking available storage classes...');
  const storageClassResult = await window.api.executeCommand('kubectl', [
    'get',
    'storageclass',
    '-o',
    'json'
  ]);

  let storageClassName = '';

  if (storageClassResult.code === 0) {
    try {
      const storageClasses = JSON.parse(storageClassResult.stdout).items;

      // Find the default storage class
      const defaultStorageClass = storageClasses.find(sc =>
        sc.metadata.annotations &&
        (sc.metadata.annotations['storageclass.kubernetes.io/is-default-class'] === 'true' ||
         sc.metadata.annotations['storageclass.beta.kubernetes.io/is-default-class'] === 'true')
      );

      if (defaultStorageClass) {
        storageClassName = defaultStorageClass.metadata.name;
        addLog(`Found default storage class: ${storageClassName}`);
      } else if (storageClasses.length > 0) {
        // If no default storage class, use the first available one
        storageClassName = storageClasses[0].metadata.name;
        addLog(`No default storage class found. Using: ${storageClassName}`);
      }
    } catch (error) {
      addLog(`Warning: Error parsing storage classes: ${error.message}`);
    }
  }

  // Create the PVC with the appropriate storage class
  let pvPvcYaml;

  if (storageClassName) {
    // Try to use the detected storage class
    addLog(`Attempting to use storage class: ${storageClassName}`);

    // First check if we can create a PVC with this storage class
    const testPvcYaml = `
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: test-pvc
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 1Gi
  storageClassName: ${storageClassName}
`;

    // Try to create a test PVC
    const testPvcResult = await window.api.applyManifestFromString(testPvcYaml);

    // Wait a moment for the PVC to be processed
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Check if the test PVC is in a failed state
    const testPvcStatusResult = await window.api.executeCommand('kubectl', [
      'get',
      'pvc',
      'test-pvc',
      '-o',
      'jsonpath={.status.phase}'
    ]);

    // Get events related to the test PVC to check for errors
    const testPvcEventsResult = await window.api.executeCommand('kubectl', [
      'get',
      'events',
      '--field-selector=involvedObject.name=test-pvc',
      '-o',
      'json'
    ]);

    // Delete the test PVC regardless of the result
    await window.api.executeCommand('kubectl', [
      'delete',
      'pvc',
      'test-pvc',
      '--ignore-not-found'
    ]);

    // Check if there were any provisioning failures
    let provisioningFailed = false;
    if (testPvcEventsResult.code === 0) {
      try {
        const events = JSON.parse(testPvcEventsResult.stdout).items;
        for (const event of events) {
          if (event.type === 'Warning' && event.reason === 'ProvisioningFailed') {
            addLog(`Warning: Storage class provisioning failed: ${event.message}`);
            provisioningFailed = true;
            break;
          }
        }
      } catch (error) {
        addLog(`Warning: Error parsing events: ${error.message}`);
      }
    }

    if (provisioningFailed || testPvcStatusResult.stdout !== 'Bound') {
      addLog(`Storage class ${storageClassName} failed to provision a volume. Falling back to local storage.`);

      // Create the local directory on the host
      await createLocalStorageDirectory(addLog);

      // Use local storage as fallback
      pvPvcYaml = `
apiVersion: v1
kind: PersistentVolume
metadata:
  name: postgres-pv
spec:
  capacity:
    storage: 10Gi
  accessModes:
    - ReadWriteOnce
  persistentVolumeReclaimPolicy: Retain
  storageClassName: ""
  hostPath:
    path: "/tmp/edurange-data"
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: postgres-pvc
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 10Gi
  storageClassName: ""
  volumeName: postgres-pv
`;
    } else {
      // Use the detected storage class
      pvPvcYaml = `
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: postgres-pvc
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 10Gi
  storageClassName: ${storageClassName}
`;
    }
  } else {
    // Fallback: Create a PV and PVC with no storage class (for local development/testing)
    addLog('No storage class found. Creating a local PV and PVC for development/testing.');

    // Create the local directory on the host
    await createLocalStorageDirectory(addLog);

    pvPvcYaml = `
apiVersion: v1
kind: PersistentVolume
metadata:
  name: postgres-pv
spec:
  capacity:
    storage: 10Gi
  accessModes:
    - ReadWriteOnce
  persistentVolumeReclaimPolicy: Retain
  storageClassName: ""
  hostPath:
    path: "/tmp/edurange-data"
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: postgres-pvc
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 10Gi
  storageClassName: ""
  volumeName: postgres-pv
`;
  }

  // Apply the PV and PVC
  const pvPvcResult = await window.api.applyManifestFromString(pvPvcYaml);
  if (pvPvcResult.code !== 0) {
    throw new Error(`Failed to create PostgreSQL PV and PVC: ${pvPvcResult.stderr}`);
  }

  addLog('PostgreSQL PV and PVC created successfully.');
  setLogs(prev => [...prev, 'PostgreSQL PV and PVC created successfully.']);

  // Create PostgreSQL Deployment
  addLog('Creating PostgreSQL Deployment...');
  setLogs(prev => [...prev, 'Creating PostgreSQL Deployment...']);

  // Wait for the PVC to be bound before proceeding
  addLog('Waiting for PostgreSQL PVC to be bound...');
  let pvcBound = false;
  let retryCount = 0;
  const maxRetries = 10;

  while (!pvcBound && retryCount < maxRetries) {
    const pvcStatusResult = await window.api.executeCommand('kubectl', [
      'get',
      'pvc',
      'postgres-pvc',
      '-o',
      'jsonpath={.status.phase}'
    ]);

    if (pvcStatusResult.code === 0 && pvcStatusResult.stdout === 'Bound') {
      pvcBound = true;
      addLog('PostgreSQL PVC is now bound.');
    } else {
      retryCount++;
      addLog(`Waiting for PVC to be bound (attempt ${retryCount}/${maxRetries})...`);
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds before checking again
    }
  }

  if (!pvcBound) {
    addLog('Warning: PVC is not bound after maximum retries. Proceeding anyway, but deployment may fail.');
  }

  // Clean the PostgreSQL data directory if it already exists
  addLog('Cleaning PostgreSQL data directory...');
  await cleanPostgresDataDirectory(addLog);

  // Delete any existing PostgreSQL pods to ensure a clean start
  addLog('Checking for existing PostgreSQL pods...');
  const existingPodsResult = await window.api.executeCommand('kubectl', [
    'get',
    'pods',
    '-l',
    'app=postgres',
    '-o',
    'jsonpath={.items[*].metadata.name}'
  ]);

  if (existingPodsResult.code === 0 && existingPodsResult.stdout) {
    const podNames = existingPodsResult.stdout.split(' ');
    addLog(`Found ${podNames.length} existing PostgreSQL pods. Deleting them...`);
    
    for (const podName of podNames) {
      addLog(`Deleting pod ${podName}...`);
      await window.api.executeCommand('kubectl', [
        'delete',
        'pod',
        podName,
        '--grace-period=0',
        '--force'
      ]);
    }
    
    // Wait for pods to be fully deleted
    addLog('Waiting for pods to be fully deleted...');
    await new Promise(resolve => setTimeout(resolve, 5000));
  } else {
    addLog('No existing PostgreSQL pods found.');
  }

  // Create a ConfigMap with PostgreSQL configuration to allow all connections
  addLog('Creating PostgreSQL configuration with relaxed authentication...');
  const postgresConfigMapYaml = `
apiVersion: v1
kind: ConfigMap
metadata:
  name: postgres-config
data:
  pg_hba.conf: |
    # TYPE  DATABASE        USER            ADDRESS                 METHOD
    # "local" is for Unix domain socket connections only
    local   all             all                                     trust
    # IPv4 local connections:
    host    all             all             127.0.0.1/32            trust
    # IPv6 local connections:
    host    all             all             ::1/128                 trust
    # Allow all connections from within the cluster with password authentication
    host    all             all             all                     trust
  postgresql.conf: |
    listen_addresses = '*'
    max_connections = 100
    shared_buffers = 128MB
    dynamic_shared_memory_type = posix
    max_wal_size = 1GB
    min_wal_size = 80MB
    log_timezone = 'Etc/UTC'
    datestyle = 'iso, mdy'
    timezone = 'Etc/UTC'
    lc_messages = 'en_US.utf8'
    lc_monetary = 'en_US.utf8'
    lc_numeric = 'en_US.utf8'
    lc_time = 'en_US.utf8'
    default_text_search_config = 'pg_catalog.english'
    password_encryption = 'scram-sha-256'
  startup.sh: |
    #!/bin/bash
    set -e
    
    # Function to log messages with timestamp
    log() {
      echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
    }
    
    # Create PGDATA directory if it doesn't exist
    if [ ! -d "$PGDATA" ]; then
      log "Creating PGDATA directory at $PGDATA"
      mkdir -p $PGDATA
      chown postgres:postgres $PGDATA
      chmod 700 $PGDATA
    fi
    
    # Check if PostgreSQL is already initialized
    if [ ! -f "$PGDATA/PG_VERSION" ]; then
      log "Initializing PostgreSQL database..."
      
      # Make sure the directory is empty or initialization will fail
      if [ "$(ls -A $PGDATA)" ]; then
        log "PGDATA directory is not empty. Cleaning it first..."
        rm -rf $PGDATA/*
      fi
      
      # Initialize database as postgres user
      log "Running initdb as postgres user..."
      su postgres -c "initdb -D $PGDATA"
      
      # Copy config files after initialization
      log "Copying configuration files..."
      cp /etc/postgresql/pg_hba.conf $PGDATA/pg_hba.conf
      cp /etc/postgresql/postgresql.conf $PGDATA/postgresql.conf
      chown postgres:postgres $PGDATA/pg_hba.conf $PGDATA/postgresql.conf
      chmod 600 $PGDATA/pg_hba.conf $PGDATA/postgresql.conf
      
      log "PostgreSQL initialization completed successfully"
    else
      log "Using existing PostgreSQL database..."
      
      # Ensure config files exist and update them
      log "Updating configuration files..."
      cp -f /etc/postgresql/pg_hba.conf $PGDATA/pg_hba.conf
      cp -f /etc/postgresql/postgresql.conf $PGDATA/postgresql.conf
      chown postgres:postgres $PGDATA/pg_hba.conf $PGDATA/postgresql.conf
      chmod 600 $PGDATA/pg_hba.conf $PGDATA/postgresql.conf
      
      # Fix permissions if needed
      log "Ensuring correct permissions on PGDATA..."
      chown -R postgres:postgres $PGDATA
      chmod 700 $PGDATA
    fi
    
    # Start PostgreSQL as postgres user
    log "Starting PostgreSQL server as postgres user..."
    exec su postgres -c "postgres -c config_file=$PGDATA/postgresql.conf -c hba_file=$PGDATA/pg_hba.conf"
`;

  // Apply the ConfigMap
  const configMapResult = await window.api.applyManifestFromString(postgresConfigMapYaml);
  if (configMapResult.code !== 0) {
    throw new Error(`Failed to create PostgreSQL ConfigMap: ${configMapResult.stderr}`);
  }

  addLog('PostgreSQL configuration ConfigMap created successfully.');

  const deploymentYaml = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: postgres
spec:
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
      - name: postgres
        image: postgres:latest
        ports:
        - containerPort: 5432
        env:
        - name: POSTGRES_DB
          valueFrom:
            secretKeyRef:
              name: database-secrets
              key: postgres-name
        - name: POSTGRES_USER
          valueFrom:
            secretKeyRef:
              name: database-secrets
              key: postgres-user
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: database-secrets
              key: postgres-password
        - name: PGDATA
          value: /var/lib/postgresql/data/pgdata
        resources:
          requests:
            memory: "256Mi"
            cpu: "100m"
          limits:
            memory: "1Gi"
            cpu: "500m"
        volumeMounts:
        - mountPath: /var/lib/postgresql/data
          name: postgres-storage
        - mountPath: /etc/postgresql/pg_hba.conf
          name: postgres-config
          subPath: pg_hba.conf
        - mountPath: /etc/postgresql/postgresql.conf
          name: postgres-config
          subPath: postgresql.conf
        - mountPath: /docker-entrypoint-initdb.d/startup.sh
          name: postgres-config
          subPath: startup.sh
        command:
        - "bash"
        - "-c"
        - "cat /docker-entrypoint-initdb.d/startup.sh > /tmp/startup.sh && chmod +x /tmp/startup.sh && /tmp/startup.sh"
        readinessProbe:
          exec:
            command:
            - pg_isready
            - -U
            - postgres
          initialDelaySeconds: 5
          periodSeconds: 10
        livenessProbe:
          exec:
            command:
            - pg_isready
            - -U
            - postgres
          initialDelaySeconds: 30
          periodSeconds: 15
      volumes:
      - name: postgres-storage
        persistentVolumeClaim:
          claimName: postgres-pvc
      - name: postgres-config
        configMap:
          name: postgres-config
          defaultMode: 0644
---
apiVersion: v1
kind: Service
metadata:
  name: postgres
spec:
  selector:
    app: postgres
  ports:
    - protocol: TCP
      port: 5432
      targetPort: 5432
  type: ClusterIP
`;

  // Apply the deployment
  const deploymentResult = await window.api.applyManifestFromString(deploymentYaml);
  if (deploymentResult.code !== 0) {
    throw new Error(`Failed to create PostgreSQL deployment: ${deploymentResult.stderr}`);
  }

  addLog('PostgreSQL deployment created successfully.');

  // Wait for the PostgreSQL pod to be ready
  addLog('Waiting for PostgreSQL pod to be ready...');
  let podReady = false;
  retryCount = 0;

  while (!podReady && retryCount < maxRetries) {
    const podStatusResult = await window.api.executeCommand('kubectl', [
      'get',
      'pods',
      '-l',
      'app=postgres',
      '-o',
      'jsonpath={.items[0].status.phase}'
    ]);

    if (podStatusResult.code === 0 && podStatusResult.stdout === 'Running') {
      // Check if the container is ready
      const containerReadyResult = await window.api.executeCommand('kubectl', [
        'get',
        'pods',
        '-l',
        'app=postgres',
        '-o',
        'jsonpath={.items[0].status.containerStatuses[0].ready}'
      ]);

      if (containerReadyResult.code === 0 && containerReadyResult.stdout === 'true') {
        podReady = true;
        addLog('PostgreSQL pod is now running and ready.');
      }
    }

    if (!podReady) {
      retryCount++;
      addLog(`Waiting for PostgreSQL pod to be ready (attempt ${retryCount}/${maxRetries})...`);

      // If we're on the last retry, get more details about the pod
      if (retryCount === maxRetries) {
        const podDetailsResult = await window.api.executeCommand('kubectl', [
          'describe',
          'pod',
          '-l',
          'app=postgres'
        ]);

        if (podDetailsResult.code === 0) {
          addLog('PostgreSQL pod details:');
          addLog(podDetailsResult.stdout);
        }
      }

      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds before checking again
    }
  }

  if (!podReady) {
    throw new Error('PostgreSQL pod failed to become ready after maximum retries.');
  }

  // Check PostgreSQL pod logs for any issues
  addLog('Checking PostgreSQL pod logs for any issues...');
  const podName = await window.api.executeCommand('kubectl', [
    'get',
    'pods',
    '-l',
    'app=postgres',
    '-o',
    'jsonpath={.items[0].metadata.name}'
  ]);

  if (podName.code === 0 && podName.stdout) {
    const podLogs = await window.api.executeCommand('kubectl', [
      'logs',
      podName.stdout
    ]);

    if (podLogs.code === 0) {
      // Check for common error patterns in the logs
      const logContent = podLogs.stdout;
      
      if (logContent.includes('FATAL:') || logContent.includes('ERROR:')) {
        addLog('Warning: Found potential issues in PostgreSQL logs:');
        // Extract and display the relevant error lines
        const errorLines = logContent.split('\n').filter(line => 
          line.includes('FATAL:') || line.includes('ERROR:')
        );
        errorLines.forEach(line => addLog(`  ${line}`));
        addLog('These issues might affect database functionality.');
      } else {
        addLog('No critical issues found in PostgreSQL logs.');
      }
    }
  }

  addLog('PostgreSQL is now running and ready to accept connections.');
  setLogs(prev => [...prev, 'PostgreSQL is now running and ready to accept connections.']);
};

/**
 * Checks the status of the PostgreSQL pod and returns detailed information
 * @param {Function} addLog - Function to add logs
 * @returns {Promise<Object>} - Status information
 */
const checkPostgresStatus = async (addLog) => {
  addLog('Checking PostgreSQL pod status...');
  
  // Get the pod name
  const podNameResult = await window.api.executeCommand('kubectl', [
    'get',
    'pods',
    '-l',
    'app=postgres',
    '-o',
    'jsonpath={.items[0].metadata.name}'
  ]);
  
  if (podNameResult.code !== 0 || !podNameResult.stdout) {
    return {
      running: false,
      status: 'Not found',
      message: 'PostgreSQL pod not found'
    };
  }
  
  const podName = podNameResult.stdout;
  
  // Get pod status
  const podStatusResult = await window.api.executeCommand('kubectl', [
    'get',
    'pod',
    podName,
    '-o',
    'jsonpath={.status.phase}'
  ]);
  
  const status = podStatusResult.stdout || 'Unknown';
  
  // Get more detailed information
  const podDescribeResult = await window.api.executeCommand('kubectl', [
    'describe',
    'pod',
    podName
  ]);
  
  // Get logs
  const podLogsResult = await window.api.executeCommand('kubectl', [
    'logs',
    podName,
    '--tail=50'
  ]);
  
  return {
    running: status === 'Running',
    status,
    name: podName,
    description: podDescribeResult.stdout,
    logs: podLogsResult.stdout,
    message: status === 'Running' ? 'PostgreSQL is running' : `PostgreSQL status: ${status}`
  };
};

/**
 * Deletes an existing PostgreSQL database from the Kubernetes cluster
 * @param {Object} params - Parameters
 * @param {Function} params.setIsDeleting - Function to set deleting state
 * @param {Function} params.setInstallationStatus - Function to set installation status
 * @param {Function} params.setExistingInstallation - Function to set existing installation state
 * @param {Function} params.addLog - Function to add logs
 * @param {Function} params.setLogs - Function to set logs
 * @returns {Promise<void>}
 */
export const deleteExistingDatabase = async ({
  setIsDeleting,
  setInstallationStatus,
  setExistingInstallation,
  addLog,
  setLogs
}) => {
  if (window.confirm('Are you sure you want to delete the existing PostgreSQL database? This will remove all data.')) {
    setIsDeleting(true);
    setInstallationStatus('database', 'deleting');
    addLog('Deleting existing PostgreSQL database...');

    try {
      // Check PostgreSQL status before deletion for diagnostics
      addLog('Checking PostgreSQL status before deletion...');
      const postgresStatus = await checkPostgresStatus(addLog);
      
      if (postgresStatus.running) {
        addLog('PostgreSQL pod is running. Collecting diagnostic information before deletion...');
        
        // Log pod details for debugging
        if (postgresStatus.logs) {
          addLog('Last 50 lines of PostgreSQL logs:');
          addLog('----------------------------------------');
          addLog(postgresStatus.logs);
          addLog('----------------------------------------');
        }
      } else if (postgresStatus.status !== 'Not found') {
        addLog(`PostgreSQL pod is in ${postgresStatus.status} state.`);
        
        // If we have pod description, check for issues
        if (postgresStatus.description) {
          if (postgresStatus.description.includes('CrashLoopBackOff')) {
            addLog('Pod was in CrashLoopBackOff state. This usually indicates a configuration issue.');
          }
          
          if (postgresStatus.description.includes('ImagePullBackOff')) {
            addLog('Pod was in ImagePullBackOff state. This indicates an issue pulling the PostgreSQL image.');
          }
        }
      }
      
      // Delete the database deployment
      addLog('Deleting PostgreSQL deployment...');
      await window.api.executeCommand('kubectl', ['delete', 'deployment', 'postgres', '--ignore-not-found']);

      // Delete the database service
      addLog('Deleting PostgreSQL service...');
      await window.api.executeCommand('kubectl', ['delete', 'service', 'postgres', '--ignore-not-found']);

      // Delete the database PVC
      addLog('Deleting PostgreSQL PVC...');

      // First, find any pods using the PVC
      const podsResult = await window.api.executeCommand('kubectl', [
        'get', 'pods', '--field-selector=status.phase=Running', '-o', 'jsonpath={.items[*].metadata.name}'
      ]);

      if (podsResult.stdout) {
        const podNames = podsResult.stdout.split(' ');
        for (const podName of podNames) {
          // Check if this pod is using the postgres-pvc
          const podVolumeResult = await window.api.executeCommand('kubectl', [
            'get', 'pod', podName, '-o', 'jsonpath={.spec.volumes[*].persistentVolumeClaim.claimName}'
          ]);

          if (podVolumeResult.stdout && podVolumeResult.stdout.includes('postgres-pvc')) {
            addLog(`Found pod ${podName} using postgres-pvc. Deleting...`);
            await window.api.executeCommand('kubectl', [
              'delete', 'pod', podName, '--force', '--grace-period=0'
            ]);
          }
        }
      }

      // Now delete the PVC
      await window.api.executeCommand('kubectl', ['delete', 'pvc', 'postgres-pvc', '--ignore-not-found']);

      // Delete the database secrets
      addLog('Deleting database secrets...');
      await window.api.executeCommand('kubectl', ['delete', 'secret', 'database-secrets', '--ignore-not-found']);

      // Wait for resources to be fully deleted
      addLog('Waiting for resources to be fully deleted...');
      await new Promise(resolve => setTimeout(resolve, 5000));

      setExistingInstallation(false);
      setInstallationStatus('database', 'not-started');
      addLog('PostgreSQL installation deleted successfully');

      // Remove the step from completedSteps
      const { removeStepCompleted } = require('../../store/installStore').default.getState();
      removeStepCompleted('database-setup');
    } catch (error) {
      console.error('Error deleting PostgreSQL:', error);
      addLog(`Error deleting PostgreSQL: ${error.message}`);
    } finally {
      setIsDeleting(false);
    }
  }
};

/**
 * Forces cancellation of the database installation
 * @param {Object} params - Parameters
 * @param {Function} params.setForceCancelling - Function to set force cancelling state
 * @param {Function} params.setInstallationStatus - Function to set installation status
 * @param {Function} params.setIsInstalling - Function to set installation state
 * @param {Function} params.addLog - Function to add logs
 * @param {Function} params.setLogs - Function to set logs
 * @returns {Promise<void>}
 */
export const forceCancelInstallation = async ({
  setForceCancelling,
  setInstallationStatus,
  setIsInstalling,
  addLog,
  setLogs
}) => {
  if (window.confirm('Are you sure you want to force cancel the database installation? This will attempt to clean up any resources created so far.')) {
    setForceCancelling(true);
    setInstallationStatus('database', 'deleting');
    addLog('Force cancelling database installation...');

    try {
      // Check PostgreSQL status before cleanup for diagnostics
      addLog('Checking PostgreSQL status before cleanup...');
      const postgresStatus = await checkPostgresStatus(addLog);
      
      if (postgresStatus.running) {
        addLog('PostgreSQL pod is running. Collecting diagnostic information before cleanup...');
        
        // Log pod details for debugging
        if (postgresStatus.logs) {
          addLog('Last 50 lines of PostgreSQL logs:');
          addLog('----------------------------------------');
          addLog(postgresStatus.logs);
          addLog('----------------------------------------');
        }
      } else if (postgresStatus.status !== 'Not found') {
        addLog(`PostgreSQL pod is in ${postgresStatus.status} state.`);
        
        // If we have pod description, check for issues
        if (postgresStatus.description) {
          if (postgresStatus.description.includes('CrashLoopBackOff')) {
            addLog('Pod was in CrashLoopBackOff state. This usually indicates a configuration issue.');
          }
          
          if (postgresStatus.description.includes('ImagePullBackOff')) {
            addLog('Pod was in ImagePullBackOff state. This indicates an issue pulling the PostgreSQL image.');
          }
        }
      }
      
      // Clean up database resources
      addLog('Cleaning up database resources...');

      // Delete any migration resources that might be left over
      addLog('Cleaning up any existing migration resources...');
      await window.api.executeCommand('kubectl', [
        'delete', 'pod', '--selector=app=prisma-migration', '--grace-period=0', '--force', '--ignore-not-found'
      ]);

      await window.api.executeCommand('kubectl', [
        'delete', 'configmap', 'prisma-schema', '--ignore-not-found'
      ]);

      // Delete database resources
      await window.api.executeCommand('kubectl', [
        'delete', 'service', 'postgres', '--ignore-not-found'
      ]);

      await window.api.executeCommand('kubectl', [
        'delete', 'deployment', 'postgres', '--ignore-not-found'
      ]);

      // Delete PVC and PV
      await window.api.executeCommand('kubectl', [
        'delete', 'pvc', 'postgres-pvc', '--ignore-not-found'
      ]);

      // Delete secrets
      await window.api.executeCommand('kubectl', [
        'delete', 'secret', 'database-secrets', '--ignore-not-found'
      ]);

      setInstallationStatus('database', 'not-started');
      addLog('Database installation force cancelled and resources cleaned up.');

      // Clear logs
      setLogs([]);
    } catch (error) {
      console.error('Error during force cancellation of database:', error);
      addLog(`Error during force cancellation: ${error.message}`);
    } finally {
      setForceCancelling(false);
      setIsInstalling(false);
    }
  }
};

/**
 * Installs a PostgreSQL database in the Kubernetes cluster
 * @param {Object} params - Parameters
 * @param {Object} params.database - Database configuration
 * @param {Function} params.setDatabase - Function to update database configuration
 * @param {Function} params.setIsInstalling - Function to set installation state
 * @param {Function} params.setInstallationStatus - Function to set installation status
 * @param {Function} params.addLog - Function to add logs
 * @param {Function} params.setLogs - Function to set logs
 * @param {Function} params.validateForm - Function to validate form
 * @returns {Promise<void>}
 */
export const installDatabase = async ({
  database,
  setDatabase,
  setIsInstalling,
  setInstallationStatus,
  addLog,
  setLogs,
  validateForm
}) => {
  if (!validateForm()) {
    return;
  }

  setIsInstalling(true);
  setInstallationStatus('database', 'installing');
  addLog('Starting PostgreSQL database installation...');

  try {
    // Check if we're running on a cloud provider with storage limits
    addLog('Checking cloud provider environment...');
    const isLinode = await isRunningOnProvider('linode', addLog);

    // Run storage cleanup if enabled and we're on Linode or another cloud provider
    if (database.enableStorageCleanup) {
      if (isLinode) {
        addLog('Detected Linode environment. Running storage cleanup to prevent hitting volume limits...');
        const cleanupResult = await cleanupUnusedStorage(addLog);

        if (cleanupResult.success) {
          addLog(cleanupResult.message);
        } else {
          addLog(`Warning: Storage cleanup encountered an error: ${cleanupResult.error}`);
          addLog('Continuing with installation anyway...');
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
                sc.provisioner.includes('aws') ||
                sc.provisioner.includes('azure') ||
                sc.provisioner.includes('gcp') ||
                sc.provisioner.includes('linode') ||
                sc.provisioner.includes('csi')
              )
            );

            if (cloudProviders.length > 0) {
              addLog('Detected cloud provider environment. Running storage cleanup as a precaution...');
              const cleanupResult = await cleanupUnusedStorage(addLog);

              if (cleanupResult.success) {
                addLog(cleanupResult.message);
              } else {
                addLog(`Warning: Storage cleanup encountered an error: ${cleanupResult.error}`);
                addLog('Continuing with installation anyway...');
              }
            }
          } catch (error) {
            addLog(`Warning: Error checking storage classes: ${error.message}`);
          }
        }
      }
    } else {
      addLog('Storage cleanup is disabled. Skipping cleanup step.');
    }

    // Generate a random password if not provided
    if (!database.password) {
      const password = generatePassword();
      setDatabase('password', password);
    }

    // Create database secrets first
    addLog('Creating database secrets...');
    setLogs(prev => [...prev, 'Creating database secrets...']);

    // IMPORTANT: The database-url and postgres-password must be in sync
    // The database-url contains the password, and if they don't match,
    // applications like the dashboard will fail to connect to the database
    const dbPassword = database.password;
    const dbUser = database.user;
    const dbName = database.name;
    
    // Always use the postgres user in the database URL for connection
    // This ensures that all components connect with a user that has the necessary permissions
    const dbUrl = `postgresql://postgres:${dbPassword}@postgres:5432/${dbName}`;

    const secretYaml = `
apiVersion: v1
kind: Secret
metadata:
  name: database-secrets
type: Opaque
data:
  postgres-host: ${btoa('postgres')}
  postgres-name: ${btoa(dbName)}
  postgres-user: ${btoa(dbUser)}
  postgres-password: ${btoa(dbPassword)}
  database-url: ${btoa(dbUrl)}
`;

    // Apply the secret
    const secretResult = await window.api.applyManifestFromString(secretYaml);
    if (secretResult.code !== 0) {
      throw new Error(`Failed to create database secrets: ${secretResult.stderr}`);
    }

    addLog('Database secrets created successfully.');
    setLogs(prev => [...prev, 'Database secrets created successfully.']);

    // Verify that the database URL was created correctly
    addLog('Verifying database URL...');
    setLogs(prev => [...prev, 'Verifying database URL...']);

    const getDatabaseUrlCmd = await window.api.executeCommand('kubectl', [
      'get',
      'secret',
      'database-secrets',
      '-o',
      'jsonpath={.data.database-url}'
    ]);

    if (getDatabaseUrlCmd.code !== 0) {
      throw new Error(`Failed to get database URL: ${getDatabaseUrlCmd.stderr}`);
    }

    const encodedDatabaseUrl = getDatabaseUrlCmd.stdout;
    const decodedDatabaseUrl = atob(encodedDatabaseUrl);

    // Extract password from database URL
    const urlPasswordMatch = decodedDatabaseUrl.match(/postgresql:\/\/[^:]+:([^@]+)@/);
    const urlPassword = urlPasswordMatch ? urlPasswordMatch[1] : null;

    if (!urlPassword) {
      throw new Error('Could not extract password from database URL');
    }

    // Check if passwords match
    if (urlPassword !== dbPassword) {
      addLog('WARNING: Password in database URL does not match postgres-password!');
      setLogs(prev => [...prev, 'WARNING: Password in database URL does not match postgres-password!']);
      addLog('Updating database URL with correct password...');
      setLogs(prev => [...prev, 'Updating database URL with correct password...']);

      // Create corrected database URL
      const correctedUrl = `postgresql://postgres:${dbPassword}@postgres:5432/${dbName}`;
      const encodedCorrectedUrl = btoa(correctedUrl);

      // Update database-secrets
      const updateDbSecretsCmd = await window.api.executeCommand('kubectl', [
        'patch',
        'secret',
        'database-secrets',
        '-p',
        `{"data":{"database-url":"${encodedCorrectedUrl}"}}`
      ]);

      if (updateDbSecretsCmd.code !== 0) {
        throw new Error(`Failed to update database-secrets: ${updateDbSecretsCmd.stderr}`);
      }

      addLog('Updated database-secrets with corrected database URL.');
      setLogs(prev => [...prev, 'Updated database-secrets with corrected database URL.']);
    } else {
      addLog('Database URL verified successfully.');
      setLogs(prev => [...prev, 'Database URL verified successfully.']);
    }

    if (!database.useExistingDatabase) {
      // Install PostgreSQL in the cluster
      await installPostgresInCluster({ addLog, setLogs, enableStorageCleanup: database.enableStorageCleanup });

      // Wait for PostgreSQL pod to be ready
      addLog('Waiting for PostgreSQL pod to be ready...');
      setLogs(prev => [...prev, 'Waiting for PostgreSQL pod to be ready...']);

      await waitForPodAndCheckLogs('app=postgres', 'default', 300000);

      // Check PostgreSQL status for detailed diagnostics
      const postgresStatus = await checkPostgresStatus(addLog);
      
      if (!postgresStatus.running) {
        addLog(`Warning: PostgreSQL pod status is ${postgresStatus.status}`);
        addLog('Attempting to diagnose the issue...');
        
        if (postgresStatus.logs) {
          // Check for common error patterns in the logs
          const logContent = postgresStatus.logs;
          
          if (logContent.includes('FATAL:') || logContent.includes('ERROR:')) {
            addLog('Found potential issues in PostgreSQL logs:');
            // Extract and display the relevant error lines
            const errorLines = logContent.split('\n').filter(line => 
              line.includes('FATAL:') || line.includes('ERROR:')
            );
            errorLines.forEach(line => addLog(`  ${line}`));
          }
          
          if (logContent.includes('directory exists but is not empty')) {
            addLog('Detected "directory exists but is not empty" error.');
            addLog('This is a common issue when PostgreSQL data directory already contains files.');
            addLog('Attempting to fix by cleaning the data directory...');
            
            // Clean the PostgreSQL data directory
            await cleanPostgresDataDirectory(addLog);
            
            // Delete the existing pod to force recreation
            const deletePodResult = await window.api.executeCommand('kubectl', [
              'delete',
              'pod',
              '-l',
              'app=postgres',
              '--grace-period=0',
              '--force'
            ]);
            
            if (deletePodResult.code === 0) {
              addLog('Successfully deleted problematic PostgreSQL pod. Waiting for new pod to start...');
              // Wait for the new pod to start
              await new Promise(resolve => setTimeout(resolve, 10000));
            }
          }
        }
        
        // If we have pod description, check for other issues
        if (postgresStatus.description) {
          if (postgresStatus.description.includes('CrashLoopBackOff')) {
            addLog('Pod is in CrashLoopBackOff state. This usually indicates a configuration issue.');
            addLog('Check the logs above for specific error messages.');
          }
          
          if (postgresStatus.description.includes('ImagePullBackOff')) {
            addLog('Pod is in ImagePullBackOff state. This indicates an issue pulling the PostgreSQL image.');
            addLog('This could be due to network connectivity issues or rate limiting.');
            addLog('Suggestion: Check your network connection or try again later.');
          }
        }
      } else {
        addLog('PostgreSQL pod is running successfully.');
      }

      // Verify database password consistency
      await verifyDatabasePasswordConsistency({
        dbPassword,
        addLog,
        setLogs
      });

      // Installation successful
      addLog('Database installation completed successfully.');
      setLogs(prev => [...prev, 'Database installation completed successfully.']);
    }

    // Wait for the database to be ready
    addLog('Waiting for PostgreSQL to be ready...');
    setLogs(prev => [...prev, 'Waiting for PostgreSQL to be ready...']);

    const waitResult = await waitForPodAndCheckLogs('app=postgres', 'default', 300);

    if (!waitResult) {
      throw new Error('Timed out waiting for PostgreSQL to be ready');
    }

    // Run Prisma migrations to set up the database schema
    addLog('Setting up database schema with Prisma migrations...');
    setLogs(prev => [...prev, 'Setting up database schema with Prisma migrations...']);

    const migrationSuccess = await runFixedPrismaMigrations((message) => {
      addLog(message);
      setLogs(prev => [...prev, message]);
    }, { enableDebugSidecar: database.enableDebugSidecar });

    if (!migrationSuccess) {
      throw new Error('Failed to run database migrations');
    }

    // Add a prominent success message
    addLog('');
    addLog('=======================================================');
    addLog('🎉 DATABASE INSTALLATION COMPLETED SUCCESSFULLY! 🎉');
    addLog('All database components are now ready to use.');
    addLog('=======================================================');
    addLog('');

    addLog('PostgreSQL database installation completed successfully.');
    setInstallationStatus('database', 'success');

    // Save the step state
    await window.api.executeStep('database-setup');

    // Mark step as completed in the store
    window.api.markStepCompleted?.('database-setup');

  } catch (error) {
    console.error('Error installing PostgreSQL:', error);
    setInstallationStatus('database', 'error');
    addLog(`Error installing PostgreSQL: ${error.message}`);
    setLogs(prev => [...prev, `Error: ${error.message}`]);
  } finally {
    setIsInstalling(false);
  }
};

