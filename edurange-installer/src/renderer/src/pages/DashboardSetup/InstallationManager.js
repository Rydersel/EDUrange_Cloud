import { generatePassword } from '../../utils/helpers';
import { checkAndUpdateWildcardCertificate } from './CertificateManager';
import { checkDashboardStatus } from './StatusChecks';
import { verifyDatabaseCredentials } from '../../utils/databaseUtils';
import { renderIngressYaml, waitForPodWithCancel } from './UtilityFunctions';

// Safe base64 encoding function for Kubernetes secrets
const safeBase64Encode = (str) => {
  try {
    // Use Buffer for more reliable base64 encoding
    return Buffer.from(str).toString('base64');
  } catch (error) {
    console.error('Error encoding string to base64:', error);
    // Fallback to btoa with error handling
    try {
      return btoa(str);
    } catch (btoaError) {
      console.error('Error with btoa fallback:', btoaError);
      // Last resort: manual encoding of problematic characters
      const safeStr = str.replace(/[^\x00-\x7F]/g, c =>
        '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4)
      );
      return btoa(safeStr);
    }
  }
};

export const installDashboard = async ({
  setIsInstalling,
  setInstallationStatus,
  setIsCancelling,
  addLog,
  setLogs,
  domain,
  registry,
  isCancelling,
  setWaitingForPod,
  waitingForPod,
  markStepCompleted
}) => {
  setIsInstalling(true);
  setInstallationStatus('dashboard', 'installing');
  setIsCancelling(false);

  // Helper function to add logs specifically for this component
  const componentLog = (message) => {
    addLog(message);
    setLogs(prev => [...prev, message]);
  };

  try {
    componentLog('Starting Dashboard installation...');

    // Check and update wildcard certificate
    await checkAndUpdateWildcardCertificate({
      componentLog,
      domain
    });

    // Verify database credentials
    const { databaseUrl, postgresPassword } = await verifyDatabaseCredentials({
      componentLog
    });

    // Create or update dashboard-secrets
    componentLog('Creating or updating dashboard-secrets...');

    // Check if dashboard-secrets exists
    const secretExists = await window.api.executeCommand('kubectl', [
      'get',
      'secret',
      'dashboard-secrets',
      '--ignore-not-found'
    ]);

    // Generate NextAuth secret if needed
    const nextAuthSecret = generatePassword(32);

    if (!secretExists.stdout.includes('dashboard-secrets')) {
      // Create new secret
      componentLog('Creating new dashboard-secrets...');

      const secretYaml = `
apiVersion: v1
kind: Secret
metadata:
  name: dashboard-secrets
type: Opaque
data:
  nextauth-secret: "${safeBase64Encode(nextAuthSecret)}"
  database-url: "${safeBase64Encode(databaseUrl)}"
  github-client-id: "${safeBase64Encode('placeholder')}"
  github-client-secret: "${safeBase64Encode('placeholder')}"
`;

      const createResult = await window.api.applyManifestFromString(secretYaml);
      if (createResult.code !== 0) {
        throw new Error(`Failed to create dashboard-secrets: ${createResult.stderr}`);
      }
    } else {
      // Update existing secret with database URL
      componentLog('Updating existing dashboard-secrets with database URL...');

      // Get existing nextauth-secret
      const getNextAuthSecretCmd = await window.api.executeCommand('kubectl', [
        'get',
        'secret',
        'dashboard-secrets',
        '-o',
        'jsonpath={.data.nextauth-secret}',
        '--ignore-not-found'
      ]);

      // Use existing nextauth-secret if available, otherwise use the generated one
      const encodedNextAuthSecret = getNextAuthSecretCmd.stdout || safeBase64Encode(nextAuthSecret);

      // Get existing GitHub client ID and secret
      const getGithubClientIdCmd = await window.api.executeCommand('kubectl', [
        'get',
        'secret',
        'dashboard-secrets',
        '-o',
        'jsonpath={.data.github-client-id}',
        '--ignore-not-found'
      ]);

      const getGithubClientSecretCmd = await window.api.executeCommand('kubectl', [
        'get',
        'secret',
        'dashboard-secrets',
        '-o',
        'jsonpath={.data.github-client-secret}',
        '--ignore-not-found'
      ]);

      // Use existing GitHub credentials if available, otherwise use placeholders
      const encodedGithubClientId = getGithubClientIdCmd.stdout || safeBase64Encode('placeholder');
      const encodedGithubClientSecret = getGithubClientSecretCmd.stdout || safeBase64Encode('placeholder');

      // Update the secret
      const updateSecretYaml = `
apiVersion: v1
kind: Secret
metadata:
  name: dashboard-secrets
type: Opaque
data:
  nextauth-secret: "${encodedNextAuthSecret}"
  database-url: "${safeBase64Encode(databaseUrl)}"
  github-client-id: "${encodedGithubClientId}"
  github-client-secret: "${encodedGithubClientSecret}"
`;

      const updateResult = await window.api.applyManifestFromString(updateSecretYaml);
      if (updateResult.code !== 0) {
        throw new Error(`Failed to update dashboard-secrets: ${updateResult.stderr}`);
      }
    }

    // Create dashboard deployment
    componentLog('Creating dashboard deployment...');
    const dashboardDeploymentYaml = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: dashboard
  labels:
    app: dashboard
spec:
  replicas: 1
  selector:
    matchLabels:
      app: dashboard
  template:
    metadata:
      labels:
        app: dashboard
    spec:
      containers:
      - name: dashboard
        image: ${registry.url}/dashboard:latest
        imagePullPolicy: Always
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: NEXTAUTH_URL
          value: "https://dashboard.${domain.name}"
        - name: NEXTAUTH_SECRET
          valueFrom:
            secretKeyRef:
              name: dashboard-secrets
              key: nextauth-secret
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: dashboard-secrets
              key: database-url
        - name: AUTH_GITHUB_ID
          valueFrom:
            secretKeyRef:
              name: dashboard-secrets
              key: github-client-id
        - name: AUTH_GITHUB_SECRET
          valueFrom:
            secretKeyRef:
              name: dashboard-secrets
              key: github-client-secret
        - name: INSTANCE_MANAGER_SUBDOMAIN
          value: "eductf"
        - name: DATABASE_SUBDOMAIN
          value: "database"
        - name: BASE_DOMAIN
          value: "${domain.name}"
        - name: INSTANCE_MANAGER_URL
          value: "http://instance-manager.default.svc.cluster.local/api"
        - name: DATABASE_API_URL
          value: "http://database-api-service.default.svc.cluster.local"
        - name: MONITORING_SERVICE_URL
          value: "https://${domain.monitoringSubdomain}.${domain.name}/metrics"
        - name: HEALTH_CHECK_INSTANCE_MANAGER_URL
          value: "http://instance-manager.default.svc.cluster.local/api/health"
        - name: HEALTH_CHECK_MONITORING_URL
          value: "https://${domain.monitoringSubdomain}.${domain.name}/metrics/health"
        resources:
          limits:
            cpu: 500m
            memory: 512Mi
          requests:
            cpu: 100m
            memory: 256Mi
        livenessProbe:
          httpGet:
            path: /api/health
            port: 3000
            httpHeaders:
            - name: Host
              value: dashboard.${domain.name}
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
        readinessProbe:
          httpGet:
            path: /api/health
            port: 3000
            httpHeaders:
            - name: Host
              value: dashboard.${domain.name}
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
`;

    const deploymentResult = await window.api.applyManifestFromString(dashboardDeploymentYaml);
    if (deploymentResult.code !== 0) {
      throw new Error(`Failed to create dashboard deployment: ${deploymentResult.stderr}`);
    }

    // Create dashboard service
    componentLog('Creating dashboard service...');
    const dashboardServiceYaml = `
apiVersion: v1
kind: Service
metadata:
  name: dashboard
  labels:
    app: dashboard
spec:
  selector:
    app: dashboard
  ports:
  - port: 80
    targetPort: 3000
    protocol: TCP
  type: ClusterIP
`;

    const serviceResult = await window.api.applyManifestFromString(dashboardServiceYaml);
    if (serviceResult.code !== 0) {
      throw new Error(`Failed to create dashboard service: ${serviceResult.stderr}`);
    }

    // Create dashboard ingress
    componentLog('Creating dashboard ingress...');
    const ingressYaml = renderIngressYaml({
      name: 'dashboard-ingress',
      serviceName: 'dashboard',
      subdomainKey: 'dashboard',
      domain,
      pathConfig: { path: '/' }
    });

    const ingressResult = await window.api.applyManifestFromString(ingressYaml);
    if (ingressResult.code !== 0) {
      throw new Error(`Failed to create dashboard ingress: ${ingressResult.stderr}`);
    }

    // Wait for dashboard pod to be ready
    componentLog('Waiting for dashboard pod to be ready...');
    const waitResult = await waitForPodWithCancel({
      selector: 'app=dashboard',
      namespace: 'default',
      timeout: 300,
      isCancelling,
      setWaitingForPod
    });

    if (waitResult.code !== 0) {
      throw new Error(`Timed out waiting for dashboard pod: ${waitResult.stderr}`);
    }

    componentLog('Dashboard pod is ready.');

    componentLog('Checking if dashboard is accessible...');
    const dashboardStatusResult = await checkDashboardStatus({
      componentLog
    });

    if (!dashboardStatusResult.success) {
      componentLog('Warning: Dashboard URL is still returning 503 after multiple attempts.');
      componentLog('The dashboard may need more time to fully initialize.');
      componentLog('You can check the status again later from the dashboard page.');
    } else {
      componentLog('Dashboard URL is accessible and ready to use.');
    }

    componentLog('Dashboard installation completed successfully.');
    componentLog(`Dashboard URL: https://dashboard.${domain.name}`);

    // Mark dashboard setup step as completed
    await window.api.executeStep('dashboard-setup');
    markStepCompleted('dashboard-setup');

    setInstallationStatus('dashboard', 'installed');
  } catch (error) {
    console.error('Error installing dashboard:', error);
    componentLog(`Error installing dashboard: ${error.message}`);
    setInstallationStatus('dashboard', 'error');
  } finally {
    setIsInstalling(false);
  }
};

export const uninstallDashboard = async ({
  setIsInstalling,
  setInstallationStatus,
  addLog,
  setLogs
}) => {
  setIsInstalling(true);
  setInstallationStatus('dashboard', 'deleting');

  // Helper function to add logs specifically for this component
  const componentLog = (message) => {
    addLog(message);
    setLogs(prev => [...prev, message]);
  };

  try {
    componentLog('Uninstalling Dashboard...');

    // Delete dashboard ingress
    componentLog('Deleting dashboard ingress...');
    await window.api.executeCommand('kubectl', [
      'delete',
      'ingress',
      'dashboard-ingress',
      '--ignore-not-found'
    ]);

    // Delete dashboard service
    componentLog('Deleting dashboard service...');
    await window.api.executeCommand('kubectl', [
      'delete',
      'service',
      'dashboard',
      '--ignore-not-found'
    ]);

    // Delete dashboard deployment
    componentLog('Deleting dashboard deployment...');
    await window.api.executeCommand('kubectl', [
      'delete',
      'deployment',
      'dashboard',
      '--ignore-not-found'
    ]);

    // Wait for resources to be fully deleted
    componentLog('Waiting for dashboard resources to be fully deleted...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    componentLog('Dashboard uninstalled successfully.');
    setInstallationStatus('dashboard', 'not-started');
    setLogs([]);
  } catch (error) {
    console.error('Error uninstalling dashboard:', error);
    componentLog(`Error uninstalling dashboard: ${error.message}`);
    setInstallationStatus('dashboard', 'error');
  } finally {
    setIsInstalling(false);
  }
};

export const forceCancelInstallation = async ({
  setIsCancelling,
  setForceCancelling,
  setIsInstalling,
  setInstallationStatus,
  addLog,
  setLogs
}) => {
  setForceCancelling(true);
  setIsCancelling(true);

  // Helper function to add logs specifically for this component
  const componentLog = (message) => {
    addLog(message);
    setLogs(prev => [...prev, message]);
  };

  try {
    componentLog('Force cancelling installation...');

    // Delete any dashboard pods that might be stuck
    componentLog('Deleting any stuck dashboard pods...');
    await window.api.executeCommand('kubectl', [
      'delete',
      'pods',
      '-l',
      'app=dashboard',
      '--force',
      '--grace-period=0'
    ]);

    componentLog('Installation cancelled.');
    setInstallationStatus('dashboard', 'not-started');
  } catch (error) {
    console.error('Error cancelling installation:', error);
    componentLog(`Error cancelling installation: ${error.message}`);
  } finally {
    setForceCancelling(false);
    setIsCancelling(false);
    setIsInstalling(false);
  }
};
