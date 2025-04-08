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

    // First, clean up any existing resources
    addComponentLog('Cleaning up any existing Instance Manager resources...');
    await checkAndDeleteExistingDeployment('instance-manager');
    await checkAndDeleteExistingService('instance-manager');
    await checkAndDeleteExistingIngress('instance-manager-ingress');

    // Create RBAC resources
    addComponentLog('Creating Instance Manager RBAC resources...');
    const rbacYaml = `
apiVersion: v1
kind: ServiceAccount
metadata:
  name: instance-manager-sa
  namespace: default
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: instance-manager-role
  namespace: default
rules:
- apiGroups: [""]
  resources: ["pods", "services", "configmaps", "secrets"]
  verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
- apiGroups: ["apps"]
  resources: ["deployments"]
  verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
- apiGroups: ["networking.k8s.io"]
  resources: ["ingresses"]
  verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: instance-manager-rolebinding
  namespace: default
subjects:
- kind: ServiceAccount
  name: instance-manager-sa
  namespace: default
roleRef:
  kind: Role
  name: instance-manager-role
  apiGroup: rbac.authorization.k8s.io`;

    const rbacResult = await applyManifestFromString(rbacYaml, 'rbac');
    if (!rbacResult.success) {
      throw new Error(`Failed to create RBAC resources: ${rbacResult.error}`);
    }
    addComponentLog('RBAC resources created successfully');

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
      serviceAccountName: instance-manager-sa
      initContainers:
      - name: wait-for-terminal-credentials
        image: bitnami/kubectl:latest
        command: ['sh', '-c', 'until kubectl get configmap terminal-credentials; do echo "waiting for terminal-credentials configmap"; sleep 2; done;']
      containers:
      - name: instance-manager
        image: ${registry.url}/instance-manager
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
        - name: CHALLENGE_POD_LABEL_KEY
          value: "app"
        - name: CHALLENGE_POD_LABEL_VALUE
          value: "ctfchal"
        resources:
          limits:
            cpu: "500m"
            memory: "512Mi"
          requests:
            cpu: "100m"
            memory: "128Mi"
        volumeMounts:
        - name: terminal-credentials
          mountPath: /etc/terminal-credentials
          readOnly: true
      volumes:
      - name: terminal-credentials
        configMap:
          name: terminal-credentials`;

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
  type: ClusterIP`;

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

    // Verify terminal-credentials ConfigMap exists
    addComponentLog('Verifying terminal-credentials ConfigMap...');
    const configMapResult = await window.api.executeCommand('kubectl', [
      'get',
      'configmap',
      'terminal-credentials',
      '--ignore-not-found'
    ]);

    if (!configMapResult.stdout.includes('terminal-credentials')) {
      throw new Error('terminal-credentials ConfigMap not found. Please ensure terminal RBAC setup is completed.');
    }

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
    
    return { success: true };
  } catch (error) {
    console.error('Error installing Instance Manager:', error);
    addComponentLog(`Error installing Instance Manager: ${error.message}`);
    setInstallationStatus('instanceManager', 'error');
    return { success: false, error: error.message };
  } finally {
    setIsInstalling(false);
  }
};
