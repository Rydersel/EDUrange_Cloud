import React, { useState, useEffect } from 'react';
import Button from '../../components/Button';
import StatusBadge from '../../components/StatusBadge';
import useInstallStore from '../../store/installStore';
import { useNavigate } from 'react-router-dom';

const IngressSetup = () => {
  const [isInstalling, setIsInstalling] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [logs, setLogs] = useState([]);
  const [verificationStatus, setVerificationStatus] = useState('not-started');
  const [externalIp, setExternalIp] = useState('');
  const [forceCancelling, setForceCancelling] = useState(false);
  const { setInstallationStatus, installationStatus, addLog, markStepCompleted, removeStepCompleted } = useInstallStore();
  const navigate = useNavigate();

  const verifyIngressController = async () => {
    setIsVerifying(true);

    try {
      addLog('Verifying NGINX Ingress Controller...');
      setLogs(prev => [...prev, 'Verifying NGINX Ingress Controller...']);

      // Check if the ingress-nginx namespace exists
      const namespaceResult = await window.api.executeCommand('kubectl', [
        'get',
        'namespace',
        'ingress-nginx',
        '--ignore-not-found'
      ]);

      if (namespaceResult.code !== 0 || !namespaceResult.stdout.includes('ingress-nginx')) {
        setVerificationStatus('error');
        addLog('Ingress-nginx namespace not found.');
        setLogs(prev => [...prev, 'Ingress-nginx namespace not found.']);
        return;
      }

      // Check if the ingress controller pods are running
      const podsResult = await window.api.executeCommand('kubectl', [
        'get',
        'pods',
        '-n',
        'ingress-nginx',
        '-l',
        'app.kubernetes.io/component=controller'
      ]);

      if (podsResult.code !== 0 || !podsResult.stdout.includes('Running')) {
        setVerificationStatus('error');
        addLog('Ingress controller pods are not running.');
        setLogs(prev => [...prev, 'Ingress controller pods are not running.']);
        return;
      }

      // Get the external IP of the ingress controller
      const ipResult = await window.api.getExternalIP('ingress-nginx-controller', 'ingress-nginx');
      const ip = ipResult.stdout.trim();

      if (!ip) {
        setVerificationStatus('warning');
        addLog('Could not get external IP of the ingress controller.');
        setLogs(prev => [...prev, 'Could not get external IP of the ingress controller.']);
        return;
      }

      setExternalIp(ip);

      // All checks passed
      setVerificationStatus('success');
      setInstallationStatus('ingressController', 'installed');

      // Save the step state
      await window.api.executeStep('ingress-setup');

      // Mark step as completed
      markStepCompleted('ingress-setup');

      addLog('NGINX Ingress Controller verification successful.');
      setLogs(prev => [...prev, 'NGINX Ingress Controller verification successful.', `External IP: ${ip}`]);

    } catch (error) {
      console.error('Error verifying NGINX Ingress Controller:', error);
      setVerificationStatus('error');
      addLog(`Error verifying NGINX Ingress Controller: ${error.message}`);
      setLogs(prev => [...prev, `Error: ${error.message}`]);
    } finally {
      setIsVerifying(false);
    }
  };

  const installIngressController = async () => {
    setIsInstalling(true);
    setInstallationStatus('ingressController', 'installing');
    addLog('Starting NGINX Ingress Controller installation...');

    try {
      // Create the ingress-nginx namespace
      addLog('Creating ingress-nginx namespace...');
      setLogs(prev => [...prev, 'Creating ingress-nginx namespace...']);

      const createNamespaceResult = await window.api.createNamespace('ingress-nginx');
      if (createNamespaceResult.code !== 0 && !createNamespaceResult.stderr.includes('already exists')) {
        throw new Error(`Failed to create namespace: ${createNamespaceResult.stderr}`);
      }

      addLog('Namespace created or already exists.');
      setLogs(prev => [...prev, 'Namespace created or already exists.']);

      // Apply the NGINX Ingress Controller manifests
      addLog('Installing NGINX Ingress Controller...');
      setLogs(prev => [...prev, 'Installing NGINX Ingress Controller...']);

      const installResult = await window.api.installNginxIngress();
      if (installResult.code !== 0) {
        throw new Error(`Failed to install NGINX Ingress Controller: ${installResult.stderr}`);
      }

      addLog('NGINX Ingress Controller installed successfully.');
      setLogs(prev => [...prev, 'NGINX Ingress Controller installed successfully.']);

      // Wait for the ingress controller pods to be ready
      addLog('Waiting for NGINX Ingress Controller pods to be ready...');
      setLogs(prev => [...prev, 'Waiting for NGINX Ingress Controller pods to be ready...']);

      const waitResult = await window.api.waitForPod('app.kubernetes.io/component=controller', 'ingress-nginx', 120);
      if (waitResult.code !== 0) {
        throw new Error(`Timed out waiting for NGINX Ingress Controller pods: ${waitResult.stderr}`);
      }

      addLog('NGINX Ingress Controller pods are ready.');
      setLogs(prev => [...prev, 'NGINX Ingress Controller pods are ready.']);

      // Configure client_max_body_size
      addLog('Configuring enhanced settings in NGINX Ingress Controller...');
      setLogs(prev => [...prev, 'Configuring enhanced settings in NGINX Ingress Controller...']);

      const patchResult = await window.api.executeCommand('kubectl', [
        'patch',
        'configmap',
        '-n',
        'ingress-nginx',
        'ingress-nginx-controller',
        '--patch',
        '{"data": {"proxy-body-size": "0", "proxy-buffer-size": "128k", "proxy-buffers-number": "4", "proxy-read-timeout": "600", "proxy-send-timeout": "600", "proxy-connect-timeout": "600", "proxy-max-temp-file-size": "1024m", "keep-alive": "75", "keep-alive-requests": "10000", "worker-processes": "auto", "worker-connections": "65536", "use-forwarded-headers": "true", "upstream-keepalive-connections": "1000", "upstream-keepalive-timeout": "60", "upstream-keepalive-requests": "10000", "max-worker-connections": "65536", "server-tokens": "false", "client-body-buffer-size": "128k", "client-max-body-size": "50m", "large-client-header-buffers": "4 16k"}}'
      ]);

      if (patchResult.code !== 0) {
        throw new Error(`Failed to configure NGINX settings: ${patchResult.stderr}`);
      }

      addLog('NGINX Ingress Controller settings configured successfully.');
      setLogs(prev => [...prev, 'NGINX Ingress Controller settings configured successfully.']);

      // Add resource limits to the deployment
      addLog('Setting resource limits for NGINX Ingress Controller...');
      setLogs(prev => [...prev, 'Setting resource limits for NGINX Ingress Controller...']);

      const resourcePatchResult = await window.api.executeCommand('kubectl', [
        'patch',
        'deployment',
        '-n',
        'ingress-nginx',
        'ingress-nginx-controller',
        '--patch',
        '{"spec":{"template":{"spec":{"containers":[{"name":"controller","resources":{"requests":{"cpu":"200m","memory":"512Mi"},"limits":{"cpu":"1000m","memory":"1Gi"}}}]}}}}'
      ]);

      if (resourcePatchResult.code !== 0) {
        throw new Error(`Failed to set resource limits: ${resourcePatchResult.stderr}`);
      }

      addLog('Resource limits set successfully.');
      setLogs(prev => [...prev, 'Resource limits set successfully.']);

      // Set up Horizontal Pod Autoscaler for the NGINX Ingress Controller
      addLog('Setting up autoscaling for NGINX Ingress Controller...');
      setLogs(prev => [...prev, 'Setting up autoscaling for NGINX Ingress Controller...']);

      // Create HPA using kubectl apply with a YAML manifest
      const hpaManifest = `
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: ingress-nginx-controller
  namespace: ingress-nginx
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: ingress-nginx-controller
  minReplicas: 1
  maxReplicas: 6
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 75
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 75
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
`;

      const hpaResult = await window.api.applyManifestFromString(hpaManifest);

      if (hpaResult.code !== 0) {
        addLog(`Warning: Failed to set up autoscaling: ${hpaResult.stderr}`);
        setLogs(prev => [...prev, `Warning: Failed to set up autoscaling: ${hpaResult.stderr}`]);
        // Don't throw error, continue with the installation
      } else {
        addLog('Autoscaling set up successfully.');
        setLogs(prev => [...prev, 'Autoscaling set up successfully.']);
      }

      // Restart the ingress controller to apply the configuration
      addLog('Restarting NGINX Ingress Controller...');
      setLogs(prev => [...prev, 'Restarting NGINX Ingress Controller...']);

      const restartResult = await window.api.executeCommand('kubectl', [
        'rollout',
        'restart',
        'deployment',
        '-n',
        'ingress-nginx',
        'ingress-nginx-controller'
      ]);

      if (restartResult.code !== 0) {
        throw new Error(`Failed to restart NGINX Ingress Controller: ${restartResult.stderr}`);
      }

      addLog('NGINX Ingress Controller restarted successfully.');
      setLogs(prev => [...prev, 'NGINX Ingress Controller restarted successfully.']);

      // Get the external IP of the ingress controller
      addLog('Getting external IP of the ingress controller...');
      setLogs(prev => [...prev, 'Getting external IP of the ingress controller...']);

      // Wait for the external IP to be assigned
      let externalIp = '';
      let attempts = 0;
      const maxAttempts = 30;

      while (!externalIp && attempts < maxAttempts) {
        attempts++;

        const ipResult = await window.api.getExternalIP('ingress-nginx-controller', 'ingress-nginx');
        externalIp = ipResult.stdout.trim();

        if (!externalIp) {
          const attemptMessage = `Waiting for external IP to be assigned (attempt ${attempts}/${maxAttempts})...`;
          addLog(attemptMessage);
          setLogs(prev => [...prev, attemptMessage]);

          // Wait for 10 seconds before trying again
          await new Promise(resolve => setTimeout(resolve, 10000));
        }
      }

      if (!externalIp) {
        throw new Error('Failed to get external IP of the ingress controller after multiple attempts.');
      }

      setExternalIp(externalIp);
      addLog(`External IP of the ingress controller: ${externalIp}`);
      setLogs(prev => [...prev, `External IP of the ingress controller: ${externalIp}`]);

      // Verify the installation
      await verifyIngressController();

    } catch (error) {
      console.error('Error installing NGINX Ingress Controller:', error);
      setInstallationStatus('ingressController', 'error');
      addLog(`Error installing NGINX Ingress Controller: ${error.message}`);
      setLogs(prev => [...prev, `Error: ${error.message}`]);
    } finally {
      setIsInstalling(false);
    }
  };

  const forceCancelInstallation = async () => {
    if (window.confirm('Are you sure you want to force cancel the NGINX Ingress Controller installation? This will attempt to clean up any resources created so far.')) {
      setForceCancelling(true);
      setInstallationStatus('ingressController', 'deleting');
      addLog('Force cancelling NGINX Ingress Controller installation...');

      try {
        // Clean up ingress controller resources
        addLog('Cleaning up NGINX Ingress Controller resources...');

        // Delete the ingress-nginx namespace which will remove all resources in it
        await window.api.executeCommand('kubectl', [
          'delete', 'namespace', 'ingress-nginx', '--ignore-not-found'
        ]);

        setInstallationStatus('ingressController', 'not-started');
        addLog('NGINX Ingress Controller installation force cancelled and resources cleaned up.');

        // Clear logs
        setLogs([]);
      } catch (error) {
        console.error('Error during force cancellation of NGINX Ingress Controller:', error);
        addLog(`Error during force cancellation: ${error.message}`);
      } finally {
        setForceCancelling(false);
        setIsInstalling(false);
      }
    }
  };

  const deleteIngressController = async () => {
    if (window.confirm('Are you sure you want to delete the NGINX Ingress Controller? This will remove all existing configurations.')) {
      setIsInstalling(true);
      setInstallationStatus('ingressController', 'deleting');
      addLog('Deleting NGINX Ingress Controller...');

      try {
        // Delete the ingress-nginx namespace which will remove all resources in it
        await window.api.executeCommand('kubectl', [
          'delete', 'namespace', 'ingress-nginx', '--ignore-not-found'
        ]);

        // Wait for resources to be fully deleted
        addLog('Waiting for resources to be fully deleted...');
        await new Promise(resolve => setTimeout(resolve, 5000));

        setInstallationStatus('ingressController', 'not-started');
        setLogs([]);
        setExternalIp('');
        setVerificationStatus('not-started');
        addLog('NGINX Ingress Controller deleted successfully.');
        
        // Remove the step from completedSteps
        removeStepCompleted('ingress-setup');
      } catch (error) {
        console.error('Error deleting NGINX Ingress Controller:', error);
        addLog(`Error deleting NGINX Ingress Controller: ${error.message}`);
      } finally {
        setIsInstalling(false);
      }
    }
  };

  // Check if the Ingress Controller is already installed when the component mounts
  useEffect(() => {
    const checkIngressController = async () => {
      try {
        // Check if the ingress-nginx namespace exists
        const namespaceResult = await window.api.executeCommand('kubectl', [
          'get',
          'namespace',
          'ingress-nginx',
          '--ignore-not-found'
        ]);

        if (namespaceResult.code === 0 && namespaceResult.stdout.includes('ingress-nginx')) {
          // Check if the ingress controller pods are running
          const podsResult = await window.api.executeCommand('kubectl', [
            'get',
            'pods',
            '-n',
            'ingress-nginx',
            '-l',
            'app.kubernetes.io/component=controller'
          ]);

          if (podsResult.code === 0 && podsResult.stdout.includes('Running')) {
            // Get the external IP of the ingress controller
            const ipResult = await window.api.getExternalIP('ingress-nginx-controller', 'ingress-nginx');
            const ip = ipResult.stdout.trim();

            if (ip) {
              setExternalIp(ip);
              setVerificationStatus('success');
              setInstallationStatus('ingressController', 'installed');
              addLog('NGINX Ingress Controller already installed and running.');

              // Save the step state
              await window.api.executeStep('ingress-setup');

              // Mark step as completed
              markStepCompleted('ingress-setup');
            }
          }
        } else {
          // If ingress controller is not installed, make sure it's not marked as completed
          removeStepCompleted('ingress-setup');
          setInstallationStatus('ingressController', 'not-started');
        }
      } catch (error) {
        console.error('Error checking NGINX Ingress Controller:', error);
      }
    };

    checkIngressController();
  }, [addLog, markStepCompleted, setInstallationStatus, removeStepCompleted]);

  return (
    <div className="space-y-6">
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-lg font-medium text-gray-900">NGINX Ingress Controller</h2>
            <p className="mt-1 text-sm text-gray-500">
              Install the NGINX Ingress Controller to manage external access to services in your cluster.
            </p>
          </div>
          <StatusBadge status={installationStatus.ingressController} />
        </div>

        {/* Installation Logs */}
        {logs.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-medium text-gray-900">Installation Logs</h3>
            <div className="mt-2 bg-gray-800 text-gray-200 p-4 rounded-md overflow-auto max-h-64 font-mono text-sm">
              {logs.map((log, index) => (
                <div key={index} className="whitespace-pre-wrap">
                  {log}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* External IP Display */}
        {externalIp && (
          <div className="mt-4 p-4 bg-gray-50 rounded-md">
            <div className="flex items-center">
              <span className="font-medium text-gray-900 mr-2">External IP:</span>
              <span className="text-gray-700">{externalIp}</span>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              This is the external IP address of your NGINX Ingress Controller. You'll need to configure your DNS to point to this IP.
            </p>
          </div>
        )}

        {/* Verification Status */}
        {verificationStatus !== 'not-started' && (
          <div className="mt-4 p-4 bg-gray-50 rounded-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <span className="font-medium text-gray-900 mr-2">Verification:</span>
                <StatusBadge
                  status={
                    verificationStatus === 'success' ? 'installed' :
                    verificationStatus === 'checking' ? 'pending' :
                    'error'
                  }
                  text={
                    verificationStatus === 'success' ? 'Verified' :
                    verificationStatus === 'checking' ? 'Checking...' :
                    'Failed'
                  }
                />
              </div>

              {verificationStatus !== 'checking' && (
                <Button
                  onClick={verifyIngressController}
                  isLoading={isVerifying}
                  disabled={isVerifying || isInstalling}
                  size="sm"
                >
                  Verify Again
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-6 flex justify-end space-x-3">
          {installationStatus.ingressController === 'success' ? (
            <Button
              onClick={deleteIngressController}
              isLoading={isInstalling && !forceCancelling}
              disabled={isInstalling || installationStatus.ingressController === 'installing' || installationStatus.ingressController === 'deleting'}
              variant="danger"
            >
              Uninstall
            </Button>
          ) : installationStatus.ingressController === 'error' ? (
            <Button
              onClick={installIngressController}
              isLoading={isInstalling && !forceCancelling}
              disabled={isInstalling || installationStatus.ingressController === 'installing' || installationStatus.ingressController === 'deleting'}
            >
              Retry Installation
            </Button>
          ) : (
            <Button
              onClick={installIngressController}
              isLoading={isInstalling && !forceCancelling}
              disabled={isInstalling || installationStatus.ingressController === 'installing' || installationStatus.ingressController === 'deleting'}
            >
              Install
            </Button>
          )}

          {isInstalling && (
            <Button
              onClick={forceCancelInstallation}
              variant="danger"
              isLoading={forceCancelling}
              disabled={forceCancelling}
            >
              Force Cancel
            </Button>
          )}
        </div>
      </div>

      {/* Next Button */}
      <div className="flex justify-end">
        <Button
          onClick={() => navigate('/cert-manager-setup')}
          disabled={installationStatus.ingressController !== 'success'}
        >
          Next
        </Button>
      </div>
    </div>
  );
};

export default IngressSetup;
