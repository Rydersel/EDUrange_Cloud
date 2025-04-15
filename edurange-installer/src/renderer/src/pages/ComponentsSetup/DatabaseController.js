import useInstallStore from '../../store/installStore';
import { cleanupUnusedStorage, isRunningOnProvider } from '../../utils/storageCleanupUtils';

export const restartDatabaseController = async ({
  addLog,
  setLogs
}) => {
  // Helper function to add logs specifically for this component
  const addComponentLog = (message) => {
    addLog(message);
    setLogs(prev => ({
      ...prev,
      databaseController: [...prev.databaseController, message]
    }));
  };

  try {
    addComponentLog('Restarting Database Controller...');

    // Delete the database-controller pod to force a restart
    const deleteResult = await window.api.executeCommand('kubectl', [
      'delete',
      'pod',
      '-l',
      'app=database-controller'
    ]);

    if (deleteResult.code !== 0) {
      throw new Error(`Failed to delete Database Controller pod: ${deleteResult.stderr}`);
    }

    addComponentLog('Database Controller pod deleted. Waiting for new pod to be ready...');

    // Wait for the new pod to be created and ready
    let podReady = false;
    let retryCount = 0;
    const maxRetries = 10;

    while (!podReady && retryCount < maxRetries) {
      // Wait a bit for the pod to be recreated
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Check if the pod exists and is running
      const podStatusResult = await window.api.executeCommand('kubectl', [
        'get',
        'pods',
        '-l',
        'app=database-controller',
        '-o',
        'jsonpath={.items[0].status.phase}'
      ]);

      if (podStatusResult.code === 0 && podStatusResult.stdout === 'Running') {
        // Check if the containers are ready
        const containersReadyResult = await window.api.executeCommand('kubectl', [
          'get',
          'pods',
          '-l',
          'app=database-controller',
          '-o',
          'jsonpath={.items[0].status.containerStatuses[*].ready}'
        ]);

        if (containersReadyResult.code === 0 && !containersReadyResult.stdout.includes('false')) {
          podReady = true;
          addComponentLog('Database Controller pod is now running and ready.');
        }
      }

      if (!podReady) {
        retryCount++;
        addComponentLog(`Waiting for Database Controller pod to be ready (attempt ${retryCount}/${maxRetries})...`);
      }
    }

    if (!podReady) {
      throw new Error('Database Controller pod failed to become ready after maximum retries.');
    }

    addComponentLog('Database Controller has been successfully restarted.');
    return { success: true };
  } catch (error) {
    addComponentLog(`Error restarting Database Controller: ${error.message}`);
    return { success: false, error: error.message };
  }
};

export const installDatabaseController = async ({

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
  setActiveComponent('databaseController');
  setInstallationStatus('databaseController', 'installing');

  // Helper function to add logs specifically for this component
  const addComponentLog = (message) => {
    addLog(message);
    setLogs(prev => ({
      ...prev,
      databaseController: [...prev.databaseController, message]
    }));
  };

  // Helper function to apply manifest directly
  const applyManifestFromString = async (yamlContent, resourceName) => {
    try {
      // Create a temporary file using mktemp
      const { stdout: tempFilePath } = await window.api.executeCommand('mktemp', []);
      const cleanTempFilePath = tempFilePath.trim();

      // Write the YAML content to the temporary file
      await window.api.executeCommand('bash', ['-c', `cat > ${cleanTempFilePath} << 'EOF'\n${yamlContent}\nEOF`]);

      // Apply the manifest
      await window.api.executeCommand('kubectl', ['apply', '-f', cleanTempFilePath]);

      // Clean up the temporary file
      await window.api.executeCommand('rm', ['-f', cleanTempFilePath]);

      return { success: true };
    } catch (error) {
      console.error(`Error applying ${resourceName} manifest:`, error);
      return { success: false, error: error.message };
    }
  };

  try {
    addComponentLog('Starting Database Controller installation...');

    // Check if storage cleanup is enabled in the store
    const { database } = useInstallStore.getState();
    const enableStorageCleanup = database.enableStorageCleanup;

    // Check if we're running on a cloud provider with storage limits
    addComponentLog('Checking cloud provider...');
    const isLinode = await isRunningOnProvider('linode', addComponentLog);

    // Run storage cleanup if enabled and we're on Linode or another cloud provider
    if (enableStorageCleanup) {
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
                sc.provisioner.includes('aws') ||
                sc.provisioner.includes('azure') ||
                sc.provisioner.includes('gcp') ||
                sc.provisioner.includes('linode') ||
                sc.provisioner.includes('csi')
              )
            );

            if (cloudProviders.length > 0) {
              addComponentLog('Detected cloud provider environment. Running storage cleanup as a precaution...');
              const cleanupResult = await cleanupUnusedStorage(addComponentLog);

              if (cleanupResult.success) {
                addComponentLog(cleanupResult.message);
              } else {
                addComponentLog(`Warning: Storage cleanup encountered an error: ${cleanupResult.error}`);
                addComponentLog('Continuing with installation anyway...');
              }
            }
          } catch (error) {
            addComponentLog(`Warning: Error checking storage classes: ${error.message}`);
          }
        }
      }
    } else {
      addComponentLog('Storage cleanup is disabled. Skipping cleanup step.');
    }

    // Check if PostgreSQL is running
    addComponentLog('Checking if PostgreSQL is running...');
    const postgresStatusResult = await window.api.executeCommand('kubectl', [
      'get',
      'pods',
      '-l',
      'app=postgres',
      '-o',
      'jsonpath={.items[0].status.phase}'
    ]);

    if (postgresStatusResult.code !== 0 || postgresStatusResult.stdout !== 'Running') {
      addComponentLog('Warning: PostgreSQL does not appear to be running. Database Controller may not function correctly.');
      addComponentLog('Continuing with installation anyway, but you may need to restart the Database Controller after PostgreSQL is running.');
    } else {
      addComponentLog('PostgreSQL is running. Proceeding with Database Controller installation.');
    }

    // Check and delete existing deployments
    addComponentLog('Checking for existing Database Controller deployment...');
    await checkAndDeleteExistingDeployment('database-controller');

    // Check and delete existing services
    addComponentLog('Checking for existing Database Controller service...');
    await checkAndDeleteExistingService('database-controller');

    // Check and delete existing ingress
    addComponentLog('Checking for existing Database Controller ingress...');
    await checkAndDeleteExistingIngress('database-controller-ingress');

    // Check and update wildcard certificate
    addComponentLog('Checking wildcard certificate...');
    await checkAndUpdateWildcardCertificate();

    // Create deployment
    addComponentLog('Creating Database Controller deployment...');
    const deploymentYaml = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: database-controller
  namespace: default
  labels:
    app: database-controller
spec:
  replicas: 1
  selector:
    matchLabels:
      app: database-controller
  template:
    metadata:
      labels:
        app: database-controller
    spec:
      containers:
      - name: database-api
        image: ${registry.url}/database-api:latest
        imagePullPolicy: Always
        ports:
        - containerPort: 8000
        env:
        - name: POSTGRES_HOST
          valueFrom:
            secretKeyRef:
              name: database-secrets
              key: postgres-host
        - name: POSTGRES_NAME
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
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: database-secrets
              key: database-url
        - name: INSTANCE_MANAGER_URL
          value: "http://instance-manager.default.svc.cluster.local/api"
        - name: REDIS_URL
          value: "redis://:$(REDIS_PASSWORD)@redis:6379/0"
        - name: REDIS_PASSWORD
          valueFrom:
            secretKeyRef:
              name: redis-credentials
              key: redis-password
        - name: DATABASE_CONNECTION_LIMIT
          value: "10"
        - name: DATABASE_CONNECTION_RETRY_INTERVAL
          value: "5"
        - name: DATABASE_CONNECTION_MAX_RETRIES
          value: "10"
        - name: PYTHONUNBUFFERED
          value: "1"
        - name: PYTHONTRACEMALLOC
          value: "1"
        - name: PYTHONMALLOCSTATS
          value: "1"
        - name: PYTHONDEVMODE
          value: "1"
        resources:
          requests:
            memory: "256Mi"
            cpu: "100m"
          limits:
            memory: "512Mi"
            cpu: "300m"
        livenessProbe:
          httpGet:
            path: /status
            port: 8000
          initialDelaySeconds: 30
          periodSeconds: 30
          timeoutSeconds: 5
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /status
            port: 8000
          initialDelaySeconds: 10
          periodSeconds: 10
          timeoutSeconds: 3
          failureThreshold: 3
      - name: database-sync
        image: ${registry.url}/database-sync:latest
        imagePullPolicy: Always
        workingDir: /app
        command: ["/bin/bash", "-c"]
        args:
          - |
            # Limit Python's memory usage
            export PYTHONMEMORY=368435456
            
            while true; do
              python main.py || true
              sleep 10
            done
        env:
        - name: POSTGRES_HOST
          valueFrom:
            secretKeyRef:
              name: database-secrets
              key: postgres-host
        - name: POSTGRES_NAME
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
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: database-secrets
              key: database-url
        - name: INSTANCE_MANAGER_URL
          value: "http://instance-manager.default.svc.cluster.local/api"
        - name: REDIS_URL
          value: "redis://:$(REDIS_PASSWORD)@redis:6379/0"
        - name: REDIS_PASSWORD
          valueFrom:
            secretKeyRef:
              name: redis-credentials
              key: redis-password
        - name: DATABASE_CONNECTION_LIMIT
          value: "10"
        - name: DATABASE_CONNECTION_RETRY_INTERVAL
          value: "5"
        - name: DATABASE_CONNECTION_MAX_RETRIES
          value: "10"
        - name: PYTHONUNBUFFERED
          value: "1"
        - name: PYTHONTRACEMALLOC
          value: "1"
        - name: PYTHONMALLOCSTATS
          value: "1"
        - name: PYTHONDEVMODE
          value: "1"
        resources:
          requests:
            memory: "400Mi"
            cpu: "50m"
          limits:
            cpu: "200m"
`;

    const deploymentResult = await applyManifestFromString(deploymentYaml, 'deployment');
    if (!deploymentResult.success) {
      throw new Error(`Failed to create deployment: ${deploymentResult.error}`);
    }

    // Create service
    addComponentLog('Creating Database Controller service...');
    const serviceYaml = `
apiVersion: v1
kind: Service
metadata:
  name: database-api-service
  namespace: default
  labels:
    app: database-controller
spec:
  selector:
    app: database-controller
  ports:
  - port: 80
    targetPort: 8000
    protocol: TCP
  type: ClusterIP
`;

    const serviceResult = await applyManifestFromString(serviceYaml, 'service');
    if (!serviceResult.success) {
      throw new Error(`Failed to create service: ${serviceResult.error}`);
    }

    // Note: We no longer create an ingress for the database controller
    // The database API is now only accessible from within the cluster using the ClusterIP service
    // This improves security by preventing external access to the database API
    addComponentLog('Database API will only be accessible from within the cluster for improved security.');

    // Wait for pod to be ready
    addComponentLog('Waiting for Database Controller pod to be ready...');
    const waitResult = await waitForPod('app=database-controller');

    // Instead, check for success
    if (!waitResult.success) {
      // If the pod failed to become ready, get more details
      const podDetailsResult = await window.api.executeCommand('kubectl', [
        'describe',
        'pods',
        '-l',
        'app=database-controller'
      ]);

      if (podDetailsResult.code === 0) {
        addComponentLog('Database Controller pod details:');
        addComponentLog(podDetailsResult.stdout);
      }

      throw new Error(`Failed to wait for Database Controller pod: ${waitResult.error}`);
    }

    // Check if the database-api container is ready
    const containerReadyResult = await window.api.executeCommand('kubectl', [
      'get',
      'pods',
      '-l',
      'app=database-controller',
      '-o',
      'jsonpath={.items[0].status.containerStatuses[?(@.name=="database-api")].ready}'
    ]);

    if (containerReadyResult.code !== 0 || containerReadyResult.stdout !== 'true') {
      addComponentLog('Warning: database-api container is not ready. The Database Controller may not function correctly.');
      addComponentLog('You may need to restart the Database Controller after all issues are resolved.');
    }

    if (containerReadyResult.stdout === 'true') {
      addComponentLog('Database API container is ready.');
    } else {
      throw new Error('Database API container is not ready.');
    }

    // Create Horizontal Pod Autoscaler for database-controller
    addComponentLog('Creating Horizontal Pod Autoscaler for Database Controller...');
    const hpaYaml = `
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: database-controller-hpa
  namespace: default
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: database-controller
  minReplicas: 1
  maxReplicas: 6
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
        averageUtilization: 75
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

    const hpaResult = await applyManifestFromString(hpaYaml, 'hpa');
    if (!hpaResult.success) {
      addComponentLog(`Warning: Failed to create HPA for Database Controller: ${hpaResult.error}`);
      addComponentLog('Continuing with installation. You can manually add HPA later.');
    } else {
      addComponentLog('Horizontal Pod Autoscaler for Database Controller created successfully.');
    }

    addComponentLog('Database Controller installation completed successfully.');
    setInstallationStatus('databaseController', 'installed');

    // Check if all components are installed and mark step as completed if they are
    const { installationStatus, markStepCompleted } = useInstallStore.getState();
    if (
      installationStatus.databaseController === 'installed' &&
      installationStatus.instanceManager === 'installed' &&
      installationStatus.monitoringService === 'installed'
    ) {
      markStepCompleted('components-setup');
    }
  } catch (error) {
    console.error('Error installing Database Controller:', error);
    addComponentLog(`Error installing Database Controller: ${error.message}`);
    setInstallationStatus('databaseController', 'error');
  } finally {
    setIsInstalling(false);
  }
};
