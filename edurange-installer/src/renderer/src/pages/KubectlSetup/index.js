import React, { useState } from 'react';
import Card from '../../components/Card';
import Button from '../../components/Button';
import TextField from '../../components/TextField';
import StatusBadge from '../../components/StatusBadge';
import useInstallStore from '../../store/installStore';

const KubectlSetup = () => {
  const { addLog, markStepCompleted } = useInstallStore();
  const [isChecking, setIsChecking] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('pending');
  const [logs, setLogs] = useState([]);
  const [kubeConfigPath, setKubeConfigPath] = useState('');
  const [cloudProvider, setCloudProvider] = useState('');
  const [showCloudInstructions, setShowCloudInstructions] = useState(false);

  const checkConnection = async () => {
    setIsChecking(true);
    setLogs([]);

    try {
      addLog('Checking kubectl connection...');
      setLogs(prev => [...prev, 'Checking kubectl connection...']);

      const result = await window.api.checkKubectlConnection();

      if (result.code === 0) {
        setConnectionStatus('success');
        addLog('Successfully connected to Kubernetes cluster.');
        setLogs(prev => [...prev, 'Successfully connected to Kubernetes cluster.']);

        // Mark the step as completed
        markStepCompleted('kubectl-setup');

        // Get cluster info
        const clusterInfoResult = await window.api.executeCommand('kubectl', ['cluster-info']);
        if (clusterInfoResult.code === 0) {
          setLogs(prev => [...prev, 'Cluster info:', clusterInfoResult.stdout]);
        }

        // Get nodes
        const nodesResult = await window.api.executeCommand('kubectl', ['get', 'nodes']);
        if (nodesResult.code === 0) {
          setLogs(prev => [...prev, 'Nodes:', nodesResult.stdout]);
        }
      } else {
        setConnectionStatus('error');
        addLog('Failed to connect to Kubernetes cluster.');
        setLogs(prev => [
          ...prev,
          'Failed to connect to Kubernetes cluster.',
          `Error: ${result.stderr || 'Unknown error'}`
        ]);
      }
    } catch (error) {
      console.error('Error checking kubectl connection:', error);
      setConnectionStatus('error');
      addLog(`Error checking kubectl connection: ${error.message}`);
      setLogs(prev => [...prev, `Error: ${error.message}`]);
    } finally {
      setIsChecking(false);
    }
  };

  const browseKubeConfig = async () => {
    try {
      const result = await window.api.showDialog({
        title: 'Select kubeconfig file',
        properties: ['openFile'],
        filters: [
          { name: 'Kubeconfig files', extensions: ['yaml', 'yml'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });

      if (!result.canceled && result.filePaths.length > 0) {
        setKubeConfigPath(result.filePaths[0]);
      }
    } catch (error) {
      console.error('Error browsing for kubeconfig:', error);
    }
  };

  const applyKubeConfig = async () => {
    if (!kubeConfigPath) return;

    setIsChecking(true);
    setLogs([]);

    try {
      addLog(`Applying kubeconfig from ${kubeConfigPath}...`);
      setLogs(prev => [...prev, `Applying kubeconfig from ${kubeConfigPath}...`]);

      // Get platform info directly from the API (now async)
      const platform = await window.api.getPlatform();
      const isWindows = platform === 'win32';

      if (isWindows) {
        // For Windows, use cmd.exe with /c flag
        await window.api.executeCommand('cmd', ['/c', `set KUBECONFIG=${kubeConfigPath}`]);
      } else {
        // For Unix-like systems (macOS, Linux), use sh -c
        await window.api.executeCommand('sh', ['-c', `export KUBECONFIG=${kubeConfigPath}`]);
      }

      // A better approach is to directly use the kubeconfig file with kubectl
      const mergeResult = await window.api.executeCommand('kubectl', [
        'config',
        'view',
        '--flatten',
        `--kubeconfig=${kubeConfigPath}`,
        '--merge'
      ]);

      if (mergeResult.code === 0) {
        setLogs(prev => [...prev, 'Successfully merged kubeconfig.']);

        // A more reliable approach: directly write to the default kubeconfig location
        try {
          // Get the home directory
          const homeResult = isWindows
            ? await window.api.executeCommand('cmd', ['/c', 'echo %USERPROFILE%'])
            : await window.api.executeCommand('sh', ['-c', 'echo $HOME']);

          const homeDir = homeResult.stdout.trim();
          const kubeDirPath = isWindows ? `${homeDir}\\.kube` : `${homeDir}/.kube`;
          const kubeConfigDefaultPath = isWindows ? `${kubeDirPath}\\config` : `${kubeDirPath}/config`;

          // Create .kube directory if it doesn't exist
          if (isWindows) {
            await window.api.executeCommand('cmd', ['/c', `mkdir "${kubeDirPath}" 2>nul`]);
          } else {
            await window.api.executeCommand('sh', ['-c', `mkdir -p "${kubeDirPath}"`]);
          }

          // Copy the kubeconfig file to the default location
          if (isWindows) {
            await window.api.executeCommand('cmd', ['/c', `copy "${kubeConfigPath}" "${kubeConfigDefaultPath}"`]);
          } else {
            await window.api.executeCommand('sh', ['-c', `cp "${kubeConfigPath}" "${kubeConfigDefaultPath}"`]);
          }

          setLogs(prev => [...prev, `Copied kubeconfig to default location: ${kubeConfigDefaultPath}`]);
        } catch (error) {
          console.error('Error copying kubeconfig to default location:', error);
          setLogs(prev => [...prev, `Note: Could not copy kubeconfig to default location: ${error.message}`]);
          // Continue anyway since we've already merged the config
        }

        // Check connection again
        await checkConnection();
      } else {
        setConnectionStatus('error');
        addLog('Failed to apply kubeconfig.');
        setLogs(prev => [
          ...prev,
          'Failed to apply kubeconfig.',
          `Error: ${mergeResult.stderr || 'Unknown error'}`
        ]);
      }
    } catch (error) {
      console.error('Error applying kubeconfig:', error);
      setConnectionStatus('error');
      addLog(`Error applying kubeconfig: ${error.message}`);
      setLogs(prev => [...prev, `Error: ${error.message}`]);
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Kubectl Connection Setup</h1>
        <p className="mt-2 text-gray-600">
          Let's make sure kubectl is connected to your Kubernetes cluster.
        </p>
      </div>

      <Card title="Kubectl Connection Status">
        <div className="space-y-4">
          <div className="flex items-center">
            <span className="font-medium text-gray-900 mr-2">Status:</span>
            <StatusBadge status={connectionStatus} text={
              connectionStatus === 'success' ? 'Connected' :
              connectionStatus === 'error' ? 'Not Connected' :
              'Checking...'
            } />
          </div>

          <div className="flex space-x-4">
            <Button
              onClick={checkConnection}
              isLoading={isChecking && !kubeConfigPath}
              disabled={isChecking}
            >
              Check Connection
            </Button>

            <Button
              variant="outline"
              onClick={() => setShowCloudInstructions(!showCloudInstructions)}
            >
              {showCloudInstructions ? 'Hide Instructions' : 'Show Instructions'}
            </Button>
          </div>

          {logs.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-medium text-gray-900">Connection Logs</h3>
              <div className="mt-2 bg-gray-800 text-gray-200 p-4 rounded-md overflow-auto max-h-64 font-mono text-sm">
                {logs.map((log, index) => (
                  <div key={index} className="whitespace-pre-wrap">
                    {log}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>

      {showCloudInstructions && (
        <Card title="Cloud Provider Instructions">
          <div className="space-y-4">
            <div className="flex items-center space-x-4 mb-4">
              <span className="text-sm font-medium text-gray-700">Select your cloud provider:</span>
              <select
                value={cloudProvider}
                onChange={(e) => setCloudProvider(e.target.value)}
                className="rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
              >
                <option value="">Select provider...</option>
                <option value="linode">Linode</option>
                <option value="digitalocean">DigitalOcean</option>
                <option value="aws">AWS EKS</option>
                <option value="gcp">Google GKE</option>
                <option value="azure">Azure AKS</option>
                <option value="other">Other</option>
              </select>
            </div>

            {cloudProvider === 'linode' && (
              <div className="bg-blue-50 border-l-4 border-blue-400 p-4">
                <h3 className="text-sm font-medium text-blue-700">Linode LKE Instructions</h3>
                <ol className="mt-2 list-decimal list-inside text-sm text-blue-700">
                  <li>Log in to your Linode account</li>
                  <li>Navigate to the Kubernetes section</li>
                  <li>Select your cluster</li>
                  <li>Click on "Download Kubeconfig"</li>
                  <li>Save the file to your computer</li>
                  <li>Use the "Browse" button below to select the downloaded file</li>
                </ol>
              </div>
            )}

            {cloudProvider === 'digitalocean' && (
              <div className="bg-blue-50 border-l-4 border-blue-400 p-4">
                <h3 className="text-sm font-medium text-blue-700">DigitalOcean Kubernetes Instructions</h3>
                <ol className="mt-2 list-decimal list-inside text-sm text-blue-700">
                  <li>Log in to your DigitalOcean account</li>
                  <li>Navigate to the Kubernetes section</li>
                  <li>Select your cluster</li>
                  <li>Click on "Download Config File"</li>
                  <li>Save the file to your computer</li>
                  <li>Use the "Browse" button below to select the downloaded file</li>
                </ol>
              </div>
            )}

            {cloudProvider === 'aws' && (
              <div className="bg-blue-50 border-l-4 border-blue-400 p-4">
                <h3 className="text-sm font-medium text-blue-700">AWS EKS Instructions</h3>
                <ol className="mt-2 list-decimal list-inside text-sm text-blue-700">
                  <li>Install the AWS CLI and configure it with your credentials</li>
                  <li>Install the AWS IAM Authenticator for Kubernetes</li>
                  <li>Run the following command in your terminal:</li>
                  <li className="font-mono bg-blue-100 p-1 mt-1">aws eks update-kubeconfig --name YOUR_CLUSTER_NAME --region YOUR_REGION</li>
                  <li>Click "Check Connection" above to verify</li>
                </ol>
              </div>
            )}

            {cloudProvider === 'gcp' && (
              <div className="bg-blue-50 border-l-4 border-blue-400 p-4">
                <h3 className="text-sm font-medium text-blue-700">Google GKE Instructions</h3>
                <ol className="mt-2 list-decimal list-inside text-sm text-blue-700">
                  <li>Install the Google Cloud SDK and configure it with your credentials</li>
                  <li>Run the following command in your terminal:</li>
                  <li className="font-mono bg-blue-100 p-1 mt-1">gcloud container clusters get-credentials YOUR_CLUSTER_NAME --zone YOUR_ZONE --project YOUR_PROJECT</li>
                  <li>Click "Check Connection" above to verify</li>
                </ol>
              </div>
            )}

            {cloudProvider === 'azure' && (
              <div className="bg-blue-50 border-l-4 border-blue-400 p-4">
                <h3 className="text-sm font-medium text-blue-700">Azure AKS Instructions</h3>
                <ol className="mt-2 list-decimal list-inside text-sm text-blue-700">
                  <li>Install the Azure CLI and log in with your credentials</li>
                  <li>Run the following command in your terminal:</li>
                  <li className="font-mono bg-blue-100 p-1 mt-1">az aks get-credentials --resource-group YOUR_RESOURCE_GROUP --name YOUR_CLUSTER_NAME</li>
                  <li>Click "Check Connection" above to verify</li>
                </ol>
              </div>
            )}

            {cloudProvider === 'other' && (
              <div className="bg-blue-50 border-l-4 border-blue-400 p-4">
                <h3 className="text-sm font-medium text-blue-700">Other Kubernetes Providers</h3>
                <p className="mt-2 text-sm text-blue-700">
                  You'll need to obtain a kubeconfig file from your Kubernetes provider.
                  This file contains the necessary credentials and cluster information to connect to your cluster.
                  Once you have the file, use the "Browse" button below to select it.
                </p>
              </div>
            )}

            <div className="mt-4">
              <div className="flex items-center space-x-4">
                <TextField
                  label="Kubeconfig Path"
                  id="kubeConfigPath"
                  value={kubeConfigPath}
                  onChange={(e) => setKubeConfigPath(e.target.value)}
                  placeholder="Path to kubeconfig file"
                  className="flex-1"
                />
                <Button
                  onClick={browseKubeConfig}
                  variant="outline"
                  className="mt-6"
                >
                  Browse
                </Button>
              </div>

              <div className="mt-4">
                <Button
                  onClick={applyKubeConfig}
                  isLoading={isChecking && kubeConfigPath}
                  disabled={!kubeConfigPath || isChecking}
                >
                  Apply Kubeconfig
                </Button>
              </div>

              <div className="mt-4 bg-yellow-50 border-l-4 border-yellow-400 p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-yellow-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-yellow-700">
                      <strong>Note:</strong> The installer will attempt to copy your kubeconfig file to the default location
                      (<code className="bg-yellow-100 px-1 py-0.5 rounded">~/.kube/config</code>).
                      This ensures kubectl can find it without additional environment variables.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      <div className="flex justify-between">
        <Button to="/" variant="outline">
          Back
        </Button>

        <Button
          to="/prerequisites"
          disabled={connectionStatus !== 'success'}
        >
          Next
        </Button>
      </div>
    </div>
  );
};

export default KubectlSetup;
