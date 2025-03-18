import React, { useState, useEffect } from 'react';
import Card from '../../components/Card';
import Button from '../../components/Button';
import StatusBadge from '../../components/StatusBadge';
import useInstallStore from '../../store/installStore';
import { installDatabaseController } from './DatabaseController';
import { installInstanceManager } from './InstanceManager';
import { installMonitoringService } from './MonitoringService';

// Constants
const WILDCARD_CERT_NAME = 'wildcard-certificate-prod';
const WILDCARD_CERT_SECRET_NAME = 'wildcard-domain-certificate-prod';

// Simple LogDisplay component
const LogDisplay = ({ logs, maxHeight }) => {
  return (
    <div className="bg-gray-800 text-gray-200 p-4 rounded-md overflow-auto font-mono text-sm" style={{ maxHeight }}>
      {logs.map((log, index) => (
        <div key={index} className="whitespace-pre-wrap">
          {log}
        </div>
      ))}
    </div>
  );
};

const ComponentsSetup = () => {
  const {
    setInstallationStatus,
    installationStatus,
    domain,
    registry,
    addLog,
    markStepCompleted,
    removeStepCompleted
  } = useInstallStore();

  const [logs, setLogs] = useState({
    databaseController: [],
    instanceManager: [],
    monitoringService: []
  });

  const [activeComponent, setActiveComponent] = useState(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const [waitingForPod, setWaitingForPod] = useState(false);

  // Check if all components are installed when the component mounts
  useEffect(() => {
    const checkComponentsInstallation = async () => {
      try {
        // Check Database Controller
        const dbControllerResult = await window.api.executeCommand('kubectl', [
          'get',
          'deployment',
          'database-controller',
          '--ignore-not-found'
        ]);
        const dbControllerInstalled = dbControllerResult.code === 0 && dbControllerResult.stdout.includes('database-controller');

        // Check Instance Manager
        const instanceManagerResult = await window.api.executeCommand('kubectl', [
          'get',
          'deployment',
          'instance-manager',
          '--ignore-not-found'
        ]);
        const instanceManagerInstalled = instanceManagerResult.code === 0 && instanceManagerResult.stdout.includes('instance-manager');

        // Check Monitoring Service
        const monitoringServiceResult = await window.api.executeCommand('kubectl', [
          'get',
          'deployment',
          'monitoring-service',
          '--ignore-not-found'
        ]);
        const monitoringServiceInstalled = monitoringServiceResult.code === 0 && monitoringServiceResult.stdout.includes('monitoring-service');

        // Update installation status for each component
        if (dbControllerInstalled) {
          setInstallationStatus('databaseController', 'installed');
        } else {
          setInstallationStatus('databaseController', 'not-started');
        }

        if (instanceManagerInstalled) {
          setInstallationStatus('instanceManager', 'installed');
        } else {
          setInstallationStatus('instanceManager', 'not-started');
        }

        if (monitoringServiceInstalled) {
          setInstallationStatus('monitoringService', 'installed');
        } else {
          setInstallationStatus('monitoringService', 'not-started');
        }

        // If all components are installed, mark the step as completed
        if (dbControllerInstalled && instanceManagerInstalled && monitoringServiceInstalled) {
          markStepCompleted('components-setup');
        } else {
          // If not all components are installed, make sure it's not marked as completed
          removeStepCompleted('components-setup');
        }
      } catch (error) {
        console.error('Error checking components installation:', error);
      }
    };

    checkComponentsInstallation();
  }, [setInstallationStatus, markStepCompleted, removeStepCompleted]);

  // Utility functions
  const checkAndDeleteExistingDeployment = async (name, namespace = 'default') => {
    try {
      const result = await window.api.executeCommand('kubectl', [
        'get',
        'deployment',
        name,
        '-n',
        namespace,
        '--ignore-not-found'
      ]);

      if (result.stdout.includes(name)) {
        addLog(`Deleting existing deployment: ${name}`);
        await window.api.executeCommand('kubectl', [
          'delete',
          'deployment',
          name,
          '-n',
          namespace
        ]);
        await new Promise(resolve => setTimeout(resolve, 5000));
        return true;
      }
      return false;
    } catch (error) {
      console.error(`Error checking/deleting deployment ${name}:`, error);
      return false;
    }
  };

  const checkAndDeleteExistingService = async (name, namespace = 'default') => {
    try {
      const result = await window.api.executeCommand('kubectl', [
        'get',
        'service',
        name,
        '-n',
        namespace,
        '--ignore-not-found'
      ]);

      if (result.stdout.includes(name)) {
        addLog(`Deleting existing service: ${name}`);
        await window.api.executeCommand('kubectl', [
          'delete',
          'service',
          name,
          '-n',
          namespace
        ]);
        await new Promise(resolve => setTimeout(resolve, 2000));
        return true;
      }
      return false;
    } catch (error) {
      console.error(`Error checking/deleting service ${name}:`, error);
      return false;
    }
  };

  const checkAndDeleteExistingIngress = async (name, namespace = 'default') => {
    try {
      const result = await window.api.executeCommand('kubectl', [
        'get',
        'ingress',
        name,
        '-n',
        namespace,
        '--ignore-not-found'
      ]);

      if (result.stdout.includes(name)) {
        addLog(`Deleting existing ingress: ${name}`);
        await window.api.executeCommand('kubectl', [
          'delete',
          'ingress',
          name,
          '-n',
          namespace
        ]);
        await new Promise(resolve => setTimeout(resolve, 2000));
        return true;
      }
      return false;
    } catch (error) {
      console.error(`Error checking/deleting ingress ${name}:`, error);
      return false;
    }
  };

  const waitForPod = async (selector, namespace = 'default', timeoutSeconds = 360) => {
    setWaitingForPod(true);
    try {
      const startTime = Date.now();
      const timeoutMs = timeoutSeconds * 1000;

      while (Date.now() - startTime < timeoutMs) {
        const result = await window.api.executeCommand('kubectl', [
          'get',
          'pods',
          '-l',
          selector,
          '-n',
          namespace,
          '-o',
          'jsonpath={.items[0].status.phase},{.items[0].status.containerStatuses[*].ready}'
        ]);

        if (result.stdout) {
          const [phase, readyStatus] = result.stdout.split(',');

          // Check if phase is Running and all containers are ready
          // readyStatus will be a string like "true" or "true,true" or "true,false,true"
          const allContainersReady = readyStatus && !readyStatus.split(',').includes('false');

          if (phase === 'Running' && allContainersReady) {
            setWaitingForPod(false);
            return { success: true };
          }
        }

        // Sleep for 2 seconds before checking again
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      setWaitingForPod(false);
      return {
        success: false,
        error: `Timeout waiting for pod with selector ${selector} to be ready`
      };
    } catch (error) {
      setWaitingForPod(false);
      return {
        success: false,
        error: error.message || 'Error waiting for pod'
      };
    }
  };

  const checkAndUpdateWildcardCertificate = async () => {
    try {
      // Check if the wildcard certificate exists
      const certResult = await window.api.executeCommand('kubectl', [
        'get',
        'certificate',
        WILDCARD_CERT_NAME,
        '--ignore-not-found'
      ]);

      if (!certResult.stdout.includes(WILDCARD_CERT_NAME)) {
        addLog(`Wildcard certificate ${WILDCARD_CERT_NAME} not found. Creating...`);

        // Create the wildcard certificate
        const wildcardCertYaml = `
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: ${WILDCARD_CERT_NAME}
spec:
  secretName: ${WILDCARD_CERT_SECRET_NAME}
  issuerRef:
    name: cert-clusterissuer
    kind: ClusterIssuer
  dnsNames:
  - "*.${domain.name}"
  - "${domain.name}"
`;

        const createCertResult = await window.api.applyManifestFromString(wildcardCertYaml);

        if (createCertResult.code !== 0) {
          throw new Error(`Failed to create wildcard certificate: ${createCertResult.stderr}`);
        }

        addLog(`Wildcard certificate ${WILDCARD_CERT_NAME} created successfully.`);

        // Wait for the certificate to be ready
        addLog('Waiting for certificate to be ready...');
        await new Promise(resolve => setTimeout(resolve, 10000));
      } else {
        addLog(`Wildcard certificate ${WILDCARD_CERT_NAME} already exists.`);
      }

      return true;
    } catch (error) {
      console.error('Error checking/updating wildcard certificate:', error);
      addLog(`Error checking/updating wildcard certificate: ${error.message}`);
      return false;
    }
  };

  const renderIngressYaml = (name, serviceName, subdomainKey, namespace = 'default', pathConfig = { path: '/' }, annotations = {}) => {
    const subdomain = domain[subdomainKey] || subdomainKey;
    const host = `${subdomain}.${domain.name}`;

    const annotationsYaml = Object.entries({
      'cert-manager.io/cluster-issuer': 'letsencrypt-prod',
      ...annotations
    }).map(([key, value]) => `    ${key}: "${value}"`).join('\n');

    return `
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ${name}
  namespace: ${namespace}
  annotations:
${annotationsYaml}
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - ${host}
    secretName: ${WILDCARD_CERT_SECRET_NAME}
  rules:
  - host: ${host}
    http:
      paths:
      - path: ${pathConfig.path || '/'}
        pathType: ${pathConfig.pathType || 'Prefix'}
        backend:
          service:
            name: ${serviceName}
            port:
              number: 80
`;
  };

  // Update the component installation functions to remove cancellation parameters
  const handleInstallDatabaseController = async () => {
    setIsInstalling(true);

    // Check if domain is set, try to get it from certificate if not
    if (!domain.name || domain.name.trim() === '') {
      addLog('Domain name not set. Attempting to retrieve from wildcard certificate...');
      const domainSet = await useInstallStore.getState().updateDomainFromCertificate();
      if (!domainSet) {
        addLog('Could not retrieve domain from certificate. Please set the domain name in the Domain Setup step.');
        setIsInstalling(false);
        return;
      }
      addLog(`Retrieved domain name from certificate: ${useInstallStore.getState().domain.name}`);
    }

    await installDatabaseController({
      setActiveComponent,
      setInstallationStatus,
      setIsCancelling: () => {}, // Empty function as placeholder
      addLog,
      setLogs,
      logs,
      checkAndDeleteExistingDeployment,
      checkAndDeleteExistingService,
      checkAndDeleteExistingIngress,
      waitForPod,
      checkAndUpdateWildcardCertificate,
      renderIngressYaml,
      domain: useInstallStore.getState().domain, // Get the latest domain in case it was updated
      registry,
      setIsInstalling
    });
  };

  const handleInstallInstanceManager = async () => {
    setIsInstalling(true);

    // Check if domain is set, try to get it from certificate if not
    if (!domain.name || domain.name.trim() === '') {
      addLog('Domain name not set. Attempting to retrieve from wildcard certificate...');
      const domainSet = await useInstallStore.getState().updateDomainFromCertificate();
      if (!domainSet) {
        addLog('Could not retrieve domain from certificate. Please set the domain name in the Domain Setup step.');
        setIsInstalling(false);
        return;
      }
      addLog(`Retrieved domain name from certificate: ${useInstallStore.getState().domain.name}`);
    }

    await installInstanceManager({
      setActiveComponent,
      setInstallationStatus,
      setIsCancelling: () => {}, // Empty function as placeholder
      addLog,
      setLogs,
      logs,
      checkAndDeleteExistingDeployment,
      checkAndDeleteExistingService,
      checkAndDeleteExistingIngress,
      waitForPod,
      checkAndUpdateWildcardCertificate,
      renderIngressYaml,
      domain: useInstallStore.getState().domain, // Get the latest domain in case it was updated
      registry,
      setIsInstalling
    });
  };

  const handleInstallMonitoringService = async () => {
    setIsInstalling(true);

    // Check if domain is set, try to get it from certificate if not
    if (!domain.name || domain.name.trim() === '') {
      addLog('Domain name not set. Attempting to retrieve from wildcard certificate...');
      const domainSet = await useInstallStore.getState().updateDomainFromCertificate();
      if (!domainSet) {
        addLog('Could not retrieve domain from certificate. Please set the domain name in the Domain Setup step.');
        setIsInstalling(false);
        return;
      }
      addLog(`Retrieved domain name from certificate: ${useInstallStore.getState().domain.name}`);
    }

    const result = await installMonitoringService({
      setActiveComponent,
      setInstallationStatus,
      setIsCancelling: () => {}, // Empty function as placeholder
      addLog,
      setLogs,
      logs,
      checkAndDeleteExistingDeployment,
      checkAndDeleteExistingService,
      checkAndDeleteExistingIngress,
      waitForPod,
      checkAndUpdateWildcardCertificate,
      renderIngressYaml,
      domain: useInstallStore.getState().domain, // Get the latest domain in case it was updated
      registry,
      setIsInstalling
    });

    // Ensure the status is set correctly based on the result
    if (result && result.success) {
      setInstallationStatus('monitoringService', 'installed');
    }
  };

  // Handle uninstall functions
  const handleUninstallDatabaseController = async () => {
    setIsInstalling(true);
    setActiveComponent(null); // Hide console immediately
    setInstallationStatus('databaseController', 'deleting');
    // Clear logs at the beginning of the uninstall operation
    setLogs(prev => ({ ...prev, databaseController: [] }));
    addLog('Uninstalling Database Controller...');

    try {
      await checkAndDeleteExistingIngress('database-controller-ingress');
      await checkAndDeleteExistingService('database-controller');
      await checkAndDeleteExistingDeployment('database-controller');

      // Delete RBAC resources are no longer needed as we're not creating them

      addLog('Database Controller uninstalled successfully.');
      setInstallationStatus('databaseController', 'not-started');

      // Check if all components are uninstalled and remove the step from completedSteps if needed
      checkAndRemoveComponentsStep();
    } catch (error) {
      console.error('Error uninstalling Database Controller:', error);
      addLog(`Error uninstalling Database Controller: ${error.message}`);
      setInstallationStatus('databaseController', 'error');
    } finally {
      setIsInstalling(false);
    }
  };

  const handleUninstallInstanceManager = async () => {
    setIsInstalling(true);
    setActiveComponent(null); // Hide console immediately
    setInstallationStatus('instanceManager', 'deleting');
    // Clear logs at the beginning of the uninstallation operation

    setLogs(prev => ({ ...prev, instanceManager: [] }));
    addLog('Uninstalling Instance Manager...');

    try {
      await checkAndDeleteExistingIngress('instance-manager-ingress');
      await checkAndDeleteExistingService('instance-manager');
      await checkAndDeleteExistingDeployment('instance-manager');

      addLog('Instance Manager uninstalled successfully.');
      setInstallationStatus('instanceManager', 'not-started');

      // Check if all components are uninstalled and remove the step from completedSteps if needed
      checkAndRemoveComponentsStep();
    } catch (error) {
      console.error('Error uninstalling Instance Manager:', error);
      addLog(`Error uninstalling Instance Manager: ${error.message}`);
      setInstallationStatus('instanceManager', 'error');
    } finally {
      setIsInstalling(false);
    }
  };

  const handleUninstallMonitoringService = async () => {
    setIsInstalling(true);
    setActiveComponent(null); // Hide console immediately
    setInstallationStatus('monitoringService', 'deleting');
    // Clear logs at the beginning of the uninstall operation
    setLogs(prev => ({ ...prev, monitoringService: [] }));
    addLog('Uninstalling Monitoring Service...');

    try {
      // Delete monitoring service resources
      addLog('Deleting monitoring-service resources...');
      await checkAndDeleteExistingIngress('monitoring-service-ingress');
      await checkAndDeleteExistingService('monitoring-service');
      await checkAndDeleteExistingDeployment('monitoring-service');

      // Force delete any stuck pods
      addLog('Checking for stuck monitoring-service pods...');
      const stuckPodsResult = await window.api.executeCommand('kubectl', [
        'get', 'pods', '--selector', 'app=monitoring-service', '-o', 'name'
      ]);

      if (stuckPodsResult.stdout) {
        const podNames = stuckPodsResult.stdout.split('\n').filter(name => name);
        for (const podName of podNames) {
          addLog(`Force deleting pod: ${podName}`);
          await window.api.executeCommand('kubectl', [
            'delete', podName, '--force', '--grace-period=0'
          ]);
        }
      }

      // Delete RBAC resources
      addLog('Deleting RBAC resources...');
      await window.api.executeCommand('kubectl', [
        'delete', 'serviceaccount', 'monitoring-service-sa', '--ignore-not-found'
      ]);

      await window.api.executeCommand('kubectl', [
        'delete', 'clusterrole', 'monitoring-service-role', '--ignore-not-found'
      ]);

      await window.api.executeCommand('kubectl', [
        'delete', 'clusterrolebinding', 'monitoring-service-role-binding', '--ignore-not-found'
      ]);

      // Delete ServiceMonitor
      addLog('Deleting ServiceMonitor...');
      await window.api.executeCommand('kubectl', [
        'delete', 'servicemonitor', 'monitoring-service-metrics', '--ignore-not-found'
      ]);

      // Delete Prometheus and Grafana
      addLog('Deleting Prometheus and Grafana...');
      await window.api.executeCommand('helm', [
        'uninstall', 'prometheus', '--namespace', 'monitoring', '--ignore-not-found'
      ]);

      // Delete Grafana resources
      await window.api.executeCommand('kubectl', [
        'delete', 'deployment', 'grafana', '--namespace', 'monitoring', '--ignore-not-found'
      ]);

      await window.api.executeCommand('kubectl', [
        'delete', 'service', 'grafana', '--namespace', 'monitoring', '--ignore-not-found'
      ]);

      await window.api.executeCommand('kubectl', [
        'delete', 'ingress', 'grafana-ingress', '--namespace', 'monitoring', '--ignore-not-found'
      ]);

      // Delete monitoring namespace
      addLog('Deleting monitoring namespace...');
      await window.api.executeCommand('kubectl', [
        'delete', 'namespace', 'monitoring', '--ignore-not-found'
      ]);

      addLog('Monitoring Service uninstalled successfully.');
      setInstallationStatus('monitoringService', 'not-started');

      // Check if all components are uninstalled and remove the step from completedSteps if needed
      checkAndRemoveComponentsStep();
    } catch (error) {
      console.error('Error uninstalling Monitoring Service:', error);
      addLog(`Error uninstalling Monitoring Service: ${error.message}`);
      setInstallationStatus('monitoringService', 'error');
    } finally {
      setIsInstalling(false);
    }
  };

  // Helper function to check if all components are uninstalled and remove the step from completedSteps if needed
  const checkAndRemoveComponentsStep = () => {
    const allComponentsUninstalled =
      installationStatus.databaseController !== 'installed' &&
      installationStatus.instanceManager !== 'installed' &&
      installationStatus.monitoringService !== 'installed';

    if (allComponentsUninstalled) {
      removeStepCompleted('components-setup');
    }
  };

  // Add a function to forcefully cancel installation
  const handleForceCancelInstallation = async (component) => {
    const componentName = component === 'databaseController' ? 'Database Controller' :
                          component === 'instanceManager' ? 'Instance Manager' :
                          'Monitoring Service';

    addLog(`Forcefully cancelling ${componentName} installation...`);
    setLogs(prev => ({
      ...prev,
      [component]: [...prev[component], `Forcefully cancelling ${componentName} installation...`]
    }));

    // Reset the installation status
    setInstallationStatus(component, 'error');

    try {
      // Try to delete any resources that might have been created
      if (component === 'databaseController') {
        await checkAndDeleteExistingIngress('database-controller-ingress');
        await checkAndDeleteExistingService('database-controller');
        await checkAndDeleteExistingDeployment('database-controller');

        // Delete RBAC resources
        await window.api.executeCommand('kubectl', [
          'delete', 'serviceaccount', 'database-controller-sa', '--ignore-not-found'
        ]);

        await window.api.executeCommand('kubectl', [
          'delete', 'clusterrole', 'database-controller-role', '--ignore-not-found'
        ]);

        await window.api.executeCommand('kubectl', [
          'delete', 'clusterrolebinding', 'database-controller-role-binding', '--ignore-not-found'
        ]);
      }
      else if (component === 'instanceManager') {
        await checkAndDeleteExistingIngress('instance-manager-ingress');
        await checkAndDeleteExistingService('instance-manager');
        await checkAndDeleteExistingDeployment('instance-manager');

        // Delete RBAC resources
        await window.api.executeCommand('kubectl', [
          'delete', 'serviceaccount', 'instance-manager-sa', '--ignore-not-found'
        ]);

        await window.api.executeCommand('kubectl', [
          'delete', 'clusterrole', 'instance-manager-role', '--ignore-not-found'
        ]);

        await window.api.executeCommand('kubectl', [
          'delete', 'clusterrolebinding', 'instance-manager-role-binding', '--ignore-not-found'
        ]);
      }
      else if (component === 'monitoringService') {
        await checkAndDeleteExistingIngress('monitoring-service-ingress');
        await checkAndDeleteExistingService('monitoring-service');
        await checkAndDeleteExistingDeployment('monitoring-service');

        // Delete RBAC resources
        await window.api.executeCommand('kubectl', [
          'delete', 'serviceaccount', 'monitoring-service-sa', '--ignore-not-found'
        ]);

        await window.api.executeCommand('kubectl', [
          'delete', 'clusterrole', 'monitoring-service-role', '--ignore-not-found'
        ]);

        await window.api.executeCommand('kubectl', [
          'delete', 'clusterrolebinding', 'monitoring-service-role-binding', '--ignore-not-found'
        ]);

        // Try to clean up Prometheus and Grafana
        try {
          await window.api.executeCommand('helm', [
            'uninstall', 'prometheus', '--namespace', 'monitoring', '--ignore-not-found'
          ]);

          // Delete Grafana resources
          await window.api.executeCommand('kubectl', [
            'delete', 'deployment', 'grafana', '--namespace', 'monitoring', '--ignore-not-found'
          ]);

          await window.api.executeCommand('kubectl', [
            'delete', 'service', 'grafana', '--namespace', 'monitoring', '--ignore-not-found'
          ]);

          await window.api.executeCommand('kubectl', [
            'delete', 'ingress', 'grafana-ingress', '--namespace', 'monitoring', '--ignore-not-found'
          ]);
        } catch (error) {
          console.error('Error cleaning up Prometheus/Grafana:', error);
        }
      }

      // Add log message
      addLog(`Cancelled ${componentName} installation and cleaned up resources.`);
      setLogs(prev => ({
        ...prev,
        [component]: [...prev[component], `Cancelled ${componentName} installation and cleaned up resources.`]
      }));
    } catch (error) {
      console.error(`Error cleaning up after cancellation:`, error);
      addLog(`Error cleaning up after cancellation: ${error.message}`);
      setLogs(prev => ({
        ...prev,
        [component]: [...prev[component], `Error cleaning up after cancellation: ${error.message}`]
      }));
    }

    // Reset installation state
    setIsInstalling(false);
    setActiveComponent(null);
  };

  // Update the UI to ensure install and uninstall buttons are properly displayed
  return (
    <div className="space-y-8 pb-8">
      <div>
        <h1 className="text-2xl font-bold mb-2">Components Setup</h1>
        <p className="text-gray-500">
          Install the core components of EDURange Cloud
        </p>
      </div>

      {/* Database Controller */}
      <Card>
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-xl font-semibold">Database Controller</h2>
            <p className="text-gray-500">
              Manages the PostgreSQL database for EDURange Cloud
            </p>
          </div>
          <StatusBadge status={installationStatus.databaseController} />
        </div>

        <div className="space-y-4">
          {activeComponent === 'databaseController' && (
            <LogDisplay logs={logs.databaseController} maxHeight="200px" />
          )}

          <div className="flex space-x-2 justify-end">
            {(installationStatus.databaseController === 'not-started' ||
              installationStatus.databaseController === 'pending' ||
              installationStatus.databaseController === 'error') && (
              <Button
                onClick={handleInstallDatabaseController}
                disabled={isInstalling}
              >
                Install Database Controller
              </Button>
            )}

            {installationStatus.databaseController === 'installing' && (
              <>
                <Button
                  disabled={true}
                >
                  Installing...
                </Button>
                <Button
                  onClick={() => handleForceCancelInstallation('databaseController')}
                  variant="danger"
                >
                  Cancel Installation
                </Button>
              </>
            )}

            {installationStatus.databaseController === 'installed' && (
              <Button
                onClick={handleUninstallDatabaseController}
                variant="danger"
                disabled={isInstalling}
              >
                Uninstall
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Instance Manager */}
      <Card>
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-xl font-semibold">Instance Manager</h2>
            <p className="text-gray-500">
              Manages challenge instances for users
            </p>
          </div>
          <StatusBadge status={installationStatus.instanceManager} />
        </div>

        <div className="space-y-4">
          {activeComponent === 'instanceManager' && (
            <LogDisplay logs={logs.instanceManager} maxHeight="200px" />
          )}

          <div className="flex space-x-2 justify-end">
            {(installationStatus.instanceManager === 'not-started' ||
              installationStatus.instanceManager === 'pending' ||
              installationStatus.instanceManager === 'error') && (
              <Button
                onClick={handleInstallInstanceManager}
                disabled={isInstalling}
              >
                Install Instance Manager
              </Button>
            )}

            {installationStatus.instanceManager === 'installing' && (
              <>
                <Button
                  disabled={true}
                >
                  Installing...
                </Button>
                <Button
                  onClick={() => handleForceCancelInstallation('instanceManager')}
                  variant="danger"
                >
                  Cancel Installation
                </Button>
              </>
            )}

            {(installationStatus.instanceManager === 'installed' ||
              installationStatus.instanceManager === 'success') && (
              <Button
                onClick={handleUninstallInstanceManager}
                variant="danger"
                disabled={isInstalling}
              >
                Uninstall
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Monitoring Service */}
      <Card>
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-xl font-semibold">Monitoring Service</h2>
            <p className="text-gray-500">
              Prometheus and Grafana for monitoring the cluster
            </p>
          </div>
          <StatusBadge status={installationStatus.monitoringService} />
        </div>

        <div className="space-y-4">
          {activeComponent === 'monitoringService' && (
            <LogDisplay logs={logs.monitoringService} maxHeight="200px" />
          )}

          <div className="flex space-x-2 justify-end">
            {(installationStatus.monitoringService === 'not-started' ||
              installationStatus.monitoringService === 'pending' ||
              installationStatus.monitoringService === 'error') && (
              <Button
                onClick={handleInstallMonitoringService}
                disabled={isInstalling}
              >
                Install Monitoring Service
              </Button>
            )}

            {installationStatus.monitoringService === 'installing' && (
              <>
                <Button
                  disabled={true}
                >
                  Installing...
                </Button>
                <Button
                  onClick={() => handleForceCancelInstallation('monitoringService')}
                  variant="danger"
                >
                  Cancel Installation
                </Button>
              </>
            )}

            {(installationStatus.monitoringService === 'installed' ||
              installationStatus.monitoringService === 'success') && (
              <Button
                onClick={handleUninstallMonitoringService}
                variant="danger"
                disabled={isInstalling}
              >
                Uninstall
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
};

export default ComponentsSetup;
