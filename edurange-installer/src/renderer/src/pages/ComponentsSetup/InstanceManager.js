import useInstallStore from '../../store/installStore';

/**
 * Installs the Instance Manager component.
 *
 * Note: The Instance Manager is configured to be accessible only from within the Kubernetes cluster
 * for security reasons. It is not exposed via Ingress. Other components within the cluster
 * communicate with it using the internal Kubernetes DNS name:
 * http://instance-manager.default.svc.cluster.local
 */
export const installInstanceManager = async ({
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
  setActiveComponent('instanceManager');
  setInstallationStatus('instanceManager', 'installing');

  const addComponentLog = (message) => {
    addLog(message);
    setLogs(prev => ({
      ...prev,
      instanceManager: [...prev.instanceManager, message]
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
    addComponentLog('Starting Instance Manager installation...');

    addComponentLog('Checking for existing Instance Manager deployment...');
    await checkAndDeleteExistingDeployment('instance-manager');

    addComponentLog('Checking for existing Instance Manager service...');
    await checkAndDeleteExistingService('instance-manager');

    addComponentLog('Checking for existing Instance Manager ingress...');
    await checkAndDeleteExistingIngress('instance-manager-ingress');

    addComponentLog('Checking wildcard certificate...');
    await checkAndUpdateWildcardCertificate();

    addComponentLog('Creating Instance Manager deployment...');
    const deploymentYaml = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: instance-manager
  namespace: default
  labels:
    app: instance-manager
spec:
  replicas: 1
  selector:
    matchLabels:
      app: instance-manager
  template:
    metadata:
      labels:
        app: instance-manager
    spec:
      serviceAccountName: default
      containers:
      - name: instance-manager
        image: ${registry.url}/instance-manager-ingress
        imagePullPolicy: Always
        ports:
        - containerPort: 8000
        env:
        - name: INGRESS_URL
          value: "${domain.name}"
        - name: DATABASE_SUBDOMAIN
          value: "${domain.databaseSubdomain}"
        - name: REGISTRY_URL
          value: "${registry.url}"
        resources:
          limits:
            cpu: "500m"
            memory: "512Mi"
          requests:
            cpu: "100m"
            memory: "128Mi"
`;

    const deploymentResult = await applyManifestFromString(deploymentYaml, 'deployment');
    if (!deploymentResult.success) {
      throw new Error(`Failed to create deployment: ${deploymentResult.error}`);
    }

    addComponentLog('Creating Instance Manager service...');
    const serviceYaml = `
apiVersion: v1
kind: Service
metadata:
  name: instance-manager
  namespace: default
  labels:
    app: instance-manager
spec:
  selector:
    app: instance-manager
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

    addComponentLog('Instance Manager service created successfully');

    addComponentLog('Waiting for Instance Manager pod to be ready...');
    const waitResult = await waitForPod('app=instance-manager');

    if (!waitResult.success) {
      throw new Error(`Failed to wait for Instance Manager pod: ${waitResult.error}`);
    }

    addComponentLog('Instance Manager pod is ready.');
    addComponentLog('Instance Manager installation completed successfully.');
    setInstallationStatus('instanceManager', 'installed');

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
    console.error('Error installing Instance Manager:', error);
    addComponentLog(`Error installing Instance Manager: ${error.message}`);
    setInstallationStatus('instanceManager', 'error');
  } finally {
    setIsInstalling(false);
  }
};
