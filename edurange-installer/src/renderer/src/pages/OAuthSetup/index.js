import React, { useState } from 'react';
import Card from '../../components/Card';
import Button from '../../components/Button';
import StatusBadge from '../../components/StatusBadge';
import useInstallStore from '../../store/installStore';
import { generatePassword } from '../../utils/helpers';

const OAuthSetup = () => {
  const {
    setInstallationStatus,
    installationStatus,
    domain,
    addLog,
    markStepCompleted,
    removeStepCompleted
  } = useInstallStore();

  const [isConfiguring, setIsConfiguring] = useState(false);
  const [isUninstalling, setIsUninstalling] = useState(false);
  const [githubClientId, setGithubClientId] = useState('');
  const [githubClientSecret, setGithubClientSecret] = useState('');
  const [logs, setLogs] = useState([]);

  const addComponentLog = (message) => {
    addLog(`OAuth Setup: ${message}`);
    setLogs(prev => [...prev, message]);
  };

  const configureGitHubOAuth = async () => {
    setIsConfiguring(true);
    setInstallationStatus('oauth', 'installing');

    try {
      addComponentLog('Configuring GitHub OAuth...');

      if (!githubClientId || !githubClientSecret) {
        throw new Error('Please provide both GitHub Client ID and Client Secret');
      }
      
      // Check if domain is set, try to get it from certificate if not
      if (!domain.name || domain.name.trim() === '') {
        addComponentLog('Domain name not set. Attempting to retrieve from wildcard certificate...');
        const domainSet = await useInstallStore.getState().updateDomainFromCertificate();
        if (!domainSet) {
          addComponentLog('Could not retrieve domain from certificate. Please set the domain name in the Domain Setup step.');
          throw new Error('Domain name is required for OAuth configuration');
        }
        addComponentLog(`Retrieved domain name from certificate: ${useInstallStore.getState().domain.name}`);
      }

      // Generate a random NextAuth secret
      const nextAuthSecret = generatePassword(32);
      addComponentLog('Generated NextAuth secret for secure session management.');

      // Check if dashboard-secrets already exists
      const secretExists = await window.api.executeCommand('kubectl', [
        'get',
        'secret',
        'dashboard-secrets',
        '--ignore-not-found'
      ]);

      let existingDatabaseUrl = '';

      // If the secret exists, get the database-url from it
      if (secretExists.stdout.includes('dashboard-secrets')) {
        addComponentLog('Existing dashboard-secrets found, retrieving database URL...');

        const getDatabaseUrlCmd = await window.api.executeCommand('kubectl', [
          'get',
          'secret',
          'dashboard-secrets',
          '-o',
          'jsonpath={.data.database-url}',
          '--ignore-not-found'
        ]);

        if (getDatabaseUrlCmd.code === 0 && getDatabaseUrlCmd.stdout) {
          existingDatabaseUrl = getDatabaseUrlCmd.stdout;
          addComponentLog('Retrieved existing database URL from dashboard-secrets.');
        } else {
          // Try to get database URL from database-secrets
          const getDbSecretCmd = await window.api.executeCommand('kubectl', [
            'get',
            'secret',
            'database-secrets',
            '-o',
            'jsonpath={.data.database-url}',
            '--ignore-not-found'
          ]);

          if (getDbSecretCmd.code === 0 && getDbSecretCmd.stdout) {
            existingDatabaseUrl = getDbSecretCmd.stdout;
            addComponentLog('Retrieved database URL from database-secrets.');
          } else {
            addComponentLog('Warning: Could not retrieve database URL. It will need to be set during dashboard installation.');
          }
        }
      } else {
        // Try to get database URL from database-secrets
        const getDbSecretCmd = await window.api.executeCommand('kubectl', [
          'get',
          'secret',
          'database-secrets',
          '-o',
          'jsonpath={.data.database-url}',
          '--ignore-not-found'
        ]);

        if (getDbSecretCmd.code === 0 && getDbSecretCmd.stdout) {
          existingDatabaseUrl = getDbSecretCmd.stdout;
          addComponentLog('Retrieved database URL from database-secrets.');
        } else {
          addComponentLog('Warning: Could not retrieve database URL. It will need to be set during dashboard installation.');
        }
      }

      // Create or update dashboard-secrets with all required keys
      let secretYaml = `
apiVersion: v1
kind: Secret
metadata:
  name: dashboard-secrets
type: Opaque
data:
  github-client-id: ${btoa(githubClientId)}
  github-client-secret: ${btoa(githubClientSecret)}
  nextauth-secret: ${btoa(nextAuthSecret)}
`;

      // Add database-url if we have it
      if (existingDatabaseUrl) {
        secretYaml += `  database-url: ${existingDatabaseUrl}\n`;
      }

      const secretResult = await window.api.applyManifestFromString(secretYaml);

      if (secretResult.code !== 0) {
        throw new Error(`Failed to update dashboard secrets: ${secretResult.stderr}`);
      }

      addComponentLog('GitHub OAuth credentials and NextAuth secret updated successfully.');

      // Check if dashboard is already deployed
      const dashboardExists = await window.api.executeCommand('kubectl', [
        'get',
        'deployment',
        'dashboard',
        '--ignore-not-found'
      ]);

      if (dashboardExists.stdout.includes('dashboard')) {
        // Dashboard exists, restart it to apply new credentials
        addComponentLog('Dashboard is already deployed. Restarting to apply new credentials...');

        const restartResult = await window.api.executeCommand('kubectl', [
          'rollout',
          'restart',
          'deployment',
          'dashboard'
        ]);

        if (restartResult.code !== 0) {
          throw new Error(`Failed to restart dashboard: ${restartResult.stderr}`);
        }

        // Wait for the dashboard pod to be ready
        addComponentLog('Waiting for dashboard pod to be ready...');

        const waitResult = await window.api.waitForPod('app=dashboard', 'default', 180);
        if (waitResult.code !== 0) {
          throw new Error(`Timed out waiting for dashboard pod: ${waitResult.stderr}`);
        }

        addComponentLog('Dashboard pod is ready with new OAuth configuration.');
      } else {
        // Dashboard doesn't exist yet, just save the credentials
        addComponentLog('Dashboard is not deployed yet. OAuth credentials and NextAuth secret are saved and will be used when the dashboard is deployed.');
      }

      // Mark the step as completed regardless of whether dashboard is deployed
      setInstallationStatus('oauth', 'installed');

      // Save the step state
      await window.api.executeStep('oauth-setup');

      // Mark step as completed
      markStepCompleted('oauth-setup');

    } catch (error) {
      console.error('Error configuring OAuth:', error);
      setInstallationStatus('oauth', 'error');
      addComponentLog(`Error: ${error.message}`);
    } finally {
      setIsConfiguring(false);
    }
  };

  const uninstallOAuth = async () => {
    if (window.confirm('Are you sure you want to uninstall the OAuth configuration? This will remove the GitHub OAuth credentials.')) {
      setIsUninstalling(true);
      setInstallationStatus('oauth', 'deleting');
      setLogs([]);
      addComponentLog('Uninstalling OAuth configuration...');

      try {
        // Check if dashboard-secrets exists
        const secretExists = await window.api.executeCommand('kubectl', [
          'get',
          'secret',
          'dashboard-secrets',
          '--ignore-not-found'
        ]);

        if (secretExists.stdout.includes('dashboard-secrets')) {
          // Get the database URL to preserve it
          const getDatabaseUrlCmd = await window.api.executeCommand('kubectl', [
            'get',
            'secret',
            'dashboard-secrets',
            '-o',
            'jsonpath={.data.database-url}',
            '--ignore-not-found'
          ]);

          let databaseUrl = '';
          if (getDatabaseUrlCmd.code === 0 && getDatabaseUrlCmd.stdout) {
            databaseUrl = getDatabaseUrlCmd.stdout;
            addComponentLog('Retrieved existing database URL to preserve it.');
          }

          // Create a new secret with placeholder values for OAuth credentials
          let secretYaml = `
apiVersion: v1
kind: Secret
metadata:
  name: dashboard-secrets
type: Opaque
data:
  github-client-id: ${btoa('placeholder')}
  github-client-secret: ${btoa('placeholder')}
  nextauth-secret: ${btoa(generatePassword(32))}
`;

          // Add database-url if we have it
          if (databaseUrl) {
            secretYaml += `  database-url: ${databaseUrl}\n`;
          }

          const secretResult = await window.api.applyManifestFromString(secretYaml);

          if (secretResult.code !== 0) {
            throw new Error(`Failed to update dashboard secrets: ${secretResult.stderr}`);
          }

          addComponentLog('OAuth credentials have been reset to placeholder values.');

          // Check if dashboard is deployed and restart it if needed
          const dashboardExists = await window.api.executeCommand('kubectl', [
            'get',
            'deployment',
            'dashboard',
            '--ignore-not-found'
          ]);

          if (dashboardExists.stdout.includes('dashboard')) {
            addComponentLog('Dashboard is deployed. Restarting to apply changes...');

            const restartResult = await window.api.executeCommand('kubectl', [
              'rollout',
              'restart',
              'deployment',
              'dashboard'
            ]);

            if (restartResult.code !== 0) {
              throw new Error(`Failed to restart dashboard: ${restartResult.stderr}`);
            }

            addComponentLog('Dashboard restarted. OAuth will no longer work until reconfigured.');
          }
        } else {
          addComponentLog('No dashboard-secrets found. Nothing to uninstall.');
        }

        setInstallationStatus('oauth', 'not-started');
        addComponentLog('OAuth configuration uninstalled successfully.');
        
        // Remove the step from completedSteps
        removeStepCompleted('oauth-setup');
      } catch (error) {
        console.error('Error uninstalling OAuth:', error);
        setInstallationStatus('oauth', 'error');
        addComponentLog(`Error: ${error.message}`);
      } finally {
        setIsUninstalling(false);
      }
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">OAuth Configuration</h1>
        <p className="mt-2 text-gray-600">
          Configure authentication providers for the EDURange Cloud dashboard.
        </p>
      </div>

      <Card
        title="GitHub OAuth Setup"
        description="Configure GitHub OAuth to enable user authentication."
      >
        <div className="space-y-4">
          <div className="bg-blue-50 border-l-4 border-blue-400 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-blue-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2h-1V9a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-blue-700">
                  Follow these steps to set up GitHub OAuth:
                </p>
                <ol className="mt-2 text-sm text-blue-700 list-decimal list-inside">
                  <li>Go to <a href="https://github.com/settings/developers" target="_blank" rel="noopener noreferrer" className="underline">GitHub Developer Settings</a></li>
                  <li>Click "New OAuth App"</li>
                  <li>Set Homepage URL to: <code className="bg-blue-100 px-1">https://{domain.dashboardSubdomain}.{domain.name}</code></li>
                  <li>Set Authorization callback URL to: <code className="bg-blue-100 px-1">https://{domain.dashboardSubdomain}.{domain.name}/api/auth/callback/github</code></li>
                  <li>Copy the Client ID and Client Secret and enter them below</li>
                </ol>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor="githubClientId" className="block text-sm font-medium text-gray-700">
                GitHub Client ID
              </label>
              <input
                type="text"
                id="githubClientId"
                value={githubClientId}
                onChange={(e) => setGithubClientId(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                placeholder="Enter your GitHub Client ID"
              />
            </div>

            <div>
              <label htmlFor="githubClientSecret" className="block text-sm font-medium text-gray-700">
                GitHub Client Secret
              </label>
              <input
                type="password"
                id="githubClientSecret"
                value={githubClientSecret}
                onChange={(e) => setGithubClientSecret(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                placeholder="Enter your GitHub Client Secret"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <span className="font-medium text-gray-900 mr-2">Status:</span>
              <StatusBadge status={installationStatus.oauth || 'not-started'} />
            </div>

            <div className="flex space-x-3">
              {installationStatus.oauth === 'installed' && (
                <Button
                  onClick={uninstallOAuth}
                  isLoading={isUninstalling}
                  disabled={isUninstalling || isConfiguring}
                  variant="danger"
                >
                  Uninstall
                </Button>
              )}
              <Button
                onClick={configureGitHubOAuth}
                isLoading={isConfiguring}
                disabled={isConfiguring || isUninstalling || !githubClientId || !githubClientSecret}
              >
                Configure GitHub OAuth
              </Button>
            </div>
          </div>

          {logs.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-medium text-gray-900">Configuration Logs</h3>
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

      <Card
        title="Additional OAuth Providers"
        description="More authentication providers will be available soon."
      >
        <div className="space-y-4">
          <div className="flex items-center space-x-4 text-gray-500">
            <span>Coming soon:</span>
            <span>Google OAuth</span>
            <span>•</span>
            <span>Microsoft OAuth</span>
            <span>•</span>
            <span>GitLab OAuth</span>
          </div>
        </div>
      </Card>

      <div className="flex justify-between">
        <Button to="/components-setup" variant="outline">
          Back
        </Button>

        <Button
          to="/dashboard-setup"
          disabled={installationStatus.oauth !== 'success'}
        >
          Next
        </Button>
      </div>
    </div>
  );
};

export default OAuthSetup;
