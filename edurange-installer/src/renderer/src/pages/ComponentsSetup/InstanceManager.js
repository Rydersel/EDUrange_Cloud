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
  // Get the enableImageCaching option from the store
  const { instanceManager } = useInstallStore.getState();
  const enableImageCaching = instanceManager.enableImageCaching;
  
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
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: redis-credentials
              key: redis-url
        - name: REDIS_PASSWORD
          valueFrom:
            secretKeyRef:
              name: redis-credentials
              key: redis-password
        resources:
          limits:
            cpu: "1500m"
            memory: "2Gi"
          requests:
            cpu: "500m"
            memory: "1Gi"
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

    // Create Horizontal Pod Autoscaler for instance-manager
    addComponentLog('Creating Horizontal Pod Autoscaler for Instance Manager...');
    const hpaYaml = `
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: instance-manager-hpa
  namespace: default
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: instance-manager
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 60
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 70
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Percent
        value: 25
        periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 30
      policies:
      - type: Percent
        value: 100
        periodSeconds: 30
      - type: Pods
        value: 2
        periodSeconds: 30
`;

    const hpaResult = await applyManifestFromString(hpaYaml, 'hpa');
    if (!hpaResult.success) {
      addComponentLog(`Warning: Failed to create HPA for Instance Manager: ${hpaResult.error}`);
      addComponentLog('Continuing with installation. You can manually add HPA later.');
    } else {
      addComponentLog('Horizontal Pod Autoscaler for Instance Manager created successfully.');
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
    
    // After successfully deploying the instance-manager, set up image caching if enabled
    if (enableImageCaching) {
      addComponentLog('Setting up image caching for improved challenge startup performance...');
      
      // Deploy the registry mirror
      addComponentLog('Deploying registry mirror...');
      
      const registryMirrorYaml = `
apiVersion: v1
kind: ConfigMap
metadata:
  name: registry-mirror-config
  namespace: default
data:
  config.yml: |
    version: 0.1
    log:
      level: info
    storage:
      filesystem:
        rootdirectory: /var/lib/registry
      cache:
        blobdescriptor: inmemory
    http:
      addr: :5000
      headers:
        X-Content-Type-Options: [nosniff]
    proxy:
      remoteurl: https://registry-1.docker.io
    health:
      storagedriver:
        enabled: true
        interval: 10s
        threshold: 3
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: registry-mirror-pvc
  namespace: default
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 20Gi
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: registry-mirror
  namespace: default
  labels:
    app: registry-mirror
spec:
  replicas: 1
  selector:
    matchLabels:
      app: registry-mirror
  template:
    metadata:
      labels:
        app: registry-mirror
    spec:
      containers:
      - name: registry
        image: registry:2
        ports:
        - containerPort: 5000
        volumeMounts:
        - name: registry-storage
          mountPath: /var/lib/registry
        - name: registry-config
          mountPath: /etc/docker/registry/config.yml
          subPath: config.yml
        resources:
          limits:
            memory: "512Mi"
            cpu: "200m"
        livenessProbe:
          httpGet:
            path: /
            port: 5000
          initialDelaySeconds: 30
          periodSeconds: 60
        readinessProbe:
          httpGet:
            path: /
            port: 5000
          initialDelaySeconds: 10
          periodSeconds: 30
      volumes:
      - name: registry-storage
        persistentVolumeClaim:
          claimName: registry-mirror-pvc
      - name: registry-config
        configMap:
          name: registry-mirror-config
---
apiVersion: v1
kind: Service
metadata:
  name: registry-mirror
  namespace: default
  labels:
    app: registry-mirror
spec:
  selector:
    app: registry-mirror
  ports:
  - port: 5000
    targetPort: 5000
  type: ClusterIP`;

      const registryMirrorResult = await applyManifestFromString(registryMirrorYaml, 'registry mirror');
      if (!registryMirrorResult.success) {
        addComponentLog(`Warning: Failed to create registry mirror: ${registryMirrorResult.error}`);
        addComponentLog('Continuing installation without image caching...');
      } else {
        addComponentLog('Registry mirror deployed successfully.');
        
        // Deploy image puller DaemonSet
        addComponentLog('Deploying image puller DaemonSet...');
        
        const imagePullerYaml = `
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: image-puller
  namespace: default
spec:
  selector:
    matchLabels:
      app: image-puller
  template:
    metadata:
      labels:
        app: image-puller
    spec:
      initContainers:
        # Pre-pull common challenge images
        - name: pull-webos
          image: ${registry.url}/webos
          command: ["echo", "WebOS image pulled"]
          imagePullPolicy: Always
        - name: pull-terminal
          image: ${registry.url}/terminal
          command: ["echo", "Terminal image pulled"]
          imagePullPolicy: Always
      containers:
        - name: pause
          image: k8s.gcr.io/pause:3.6
          resources:
            limits:
              memory: "128Mi"
              cpu: "100m"
---
# CronJob to refresh the image cache hourly
apiVersion: batch/v1
kind: CronJob
metadata:
  name: refresh-image-cache
  namespace: default
spec:
  schedule: "0 * * * *"  # Run every hour
  concurrencyPolicy: Forbid
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: kubectl
            image: bitnami/kubectl:latest
            command:
            - /bin/sh
            - -c
            - |
              # Delete pods to force recreating them
              kubectl delete pods -l app=image-puller --force
          restartPolicy: OnFailure`;
          
        const imagePullerResult = await applyManifestFromString(imagePullerYaml, 'image puller');
        if (!imagePullerResult.success) {
          addComponentLog(`Warning: Failed to create image puller: ${imagePullerResult.error}`);
          addComponentLog('Continuing installation without automatic image pulling...');
        } else {
          addComponentLog('Image puller DaemonSet deployed successfully.');
          addComponentLog('Image caching setup complete. Challenge startup times will improve after the first few launches.');
        }
      }
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
