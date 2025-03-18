import React, { useState, useEffect } from 'react';
import Card from '../../components/Card';
import Button from '../../components/Button';
import StatusBadge from '../../components/StatusBadge';
import useInstallStore from '../../store/installStore';

// Import components
import { checkOAuthConfiguration } from './OAuthVerification';
import { installDashboard, uninstallDashboard, forceCancelInstallation } from './InstallationManager';
import { checkDashboardStatus } from './StatusChecks';

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

const DashboardSetup = () => {
  const {
    setInstallationStatus,
    installationStatus,
    domain,
    registry,
    addLog,
    markStepCompleted
  } = useInstallStore();

  const [logs, setLogs] = useState([]);
  const [isInstalling, setIsInstalling] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [waitingForPod, setWaitingForPod] = useState(false);
  const [oauthStatus, setOauthStatus] = useState('checking');
  const [migrationStatus] = useState('not-started');
  const [migrationSteps] = useState({
    connecting: 'not-started',
    schemaCreation: 'not-started',
    tableMigration: 'not-started',
    verification: 'not-started',
    seeding: 'not-started'
  });
  const [forceCancelling, setForceCancelling] = useState(false);

  useEffect(() => {
    // Check if OAuth is configured when component mounts
    checkOAuthConfiguration({
      setOauthStatus,
      markStepCompleted
    });

    // Check dashboard status when component mounts
    const checkStatus = async () => {
      const status = await checkDashboardStatus({
        componentLog: (message) => {
          console.log(message);
        }
      });
      setInstallationStatus('dashboard', status);
    };

    checkStatus();
  }, []);

  const handleInstallDashboard = async () => {
    // Check if domain is set, try to get it from certificate if not
    if (!domain.name || domain.name.trim() === '') {
      addLog('Domain name not set. Attempting to retrieve from wildcard certificate...');
      const domainSet = await useInstallStore.getState().updateDomainFromCertificate();
      if (!domainSet) {
        addLog('Could not retrieve domain from certificate. Please set the domain name in the Domain Setup step.');
        return;
      }
      addLog(`Retrieved domain name from certificate: ${useInstallStore.getState().domain.name}`);
    }
    
    await installDashboard({
      setIsInstalling,
      setInstallationStatus,
      setIsCancelling,
      addLog,
      setLogs,
      domain: useInstallStore.getState().domain, // Get the latest domain in case it was updated
      registry,
      isCancelling,
      setWaitingForPod,
      waitingForPod,
      markStepCompleted
    });
  };

  const handleUninstallDashboard = async () => {
    await uninstallDashboard({
      setIsInstalling,
      setInstallationStatus,
      addLog,
      setLogs
    });
  };

  const handleForceCancelInstallation = async () => {
    // Set both cancellation states to true since we're using a single cancel button
    setIsCancelling(true);
    setForceCancelling(true);

    await forceCancelInstallation({
      setIsCancelling,
      setForceCancelling,
      setIsInstalling,
      setInstallationStatus,
      addLog,
      setLogs
    });
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Dashboard Setup</h1>

      <Card title="Dashboard Installation" className="mb-6">
        <div className="mb-4">
          <p className="mb-2">
            The Dashboard is the main user interface for EDURange Cloud. It allows users to manage challenges, view results, and administer the platform.
          </p>
          <p className="mb-4">
            Before installing the Dashboard, make sure you have completed the OAuth setup step to configure GitHub authentication.
          </p>

          <div className="flex items-center mb-4">
            <span className="mr-2 font-semibold">OAuth Status:</span>
            <StatusBadge
              status={oauthStatus === 'configured' ? 'installed' : oauthStatus === 'checking' ? 'pending' : 'error'}
              text={oauthStatus === 'configured' ? 'Configured' : oauthStatus === 'checking' ? 'Checking...' : 'Not Configured'}
            />
          </div>

          <div className="flex items-center mb-4">
            <span className="mr-2 font-semibold">Installation Status:</span>
            <StatusBadge
              status={
                installationStatus.dashboard === 'installed'
                  ? 'installed'
                  : installationStatus.dashboard === 'installing'
                  ? 'pending'
                  : installationStatus.dashboard === 'error'
                  ? 'error'
                  : 'not-started'
              }
              text={
                installationStatus.dashboard === 'installed'
                  ? 'Installed'
                  : installationStatus.dashboard === 'installing'
                  ? 'Installing...'
                  : installationStatus.dashboard === 'error'
                  ? 'Error'
                  : installationStatus.dashboard === 'deleting'
                  ? 'Deleting...'
                  : 'Not Installed'
              }
            />
          </div>

          {installationStatus.dashboard === 'installed' ? (
            <div className="mb-4">
              <p className="mb-2">
                Dashboard is installed and ready to use. You can access it at:
              </p>
              <a
                href={`https://dashboard.${domain.name}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:underline"
              >
                https://dashboard.{domain.name}
              </a>
            </div>
          ) : null}

          <div className="flex space-x-4 pt-2">
            {installationStatus.dashboard !== 'installed' && installationStatus.dashboard !== 'installing' && installationStatus.dashboard !== 'deleting' ? (
              <Button
                onClick={handleInstallDashboard}
                disabled={isInstalling || oauthStatus !== 'configured'}
                className="bg-blue-500 hover:bg-blue-600"
              >
                Install Dashboard
              </Button>
            ) : null}

            {installationStatus.dashboard === 'installed' && !isInstalling ? (
              <Button
                onClick={handleUninstallDashboard}
                className="bg-red-500 hover:bg-red-600"
              >
                Uninstall
              </Button>
            ) : null}

            {isInstalling && !forceCancelling ? (
              <Button
                onClick={handleForceCancelInstallation}
                disabled={forceCancelling}
                className="bg-red-500 hover:bg-red-600"
              >
                {forceCancelling ? 'Cancelling...' : 'Cancel'}
              </Button>
            ) : null}
          </div>
        </div>

        {logs.length > 0 && (
          <div className="mt-4">
            <h3 className="text-lg font-semibold mb-2">Installation Logs</h3>
            <LogDisplay logs={logs} maxHeight="400px" />
          </div>
        )}
      </Card>

      <Card title="Access URLs" className="mb-6">
        <div className="mb-4">
          <p className="mb-2">
            Once the installation is complete, you can access the following URLs:
          </p>
          <ul className="list-disc list-inside space-y-2">
            <li>
              <span className="font-semibold">Dashboard:</span>{' '}
              <a
                href={`https://dashboard.${domain.name}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:underline"
              >
                https://dashboard.{domain.name}
              </a>
            </li>
            <li>
              <span className="font-semibold">Database API:</span>{' '}
              <span className="text-amber-600">
                Internal access only - http://database-api-service.default.svc.cluster.local
              </span>
            </li>
            <li>
              <span className="font-semibold">Monitoring Service:</span>{' '}
              <a
                href={`https://monitoring.${domain.name}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:underline"
              >
                https://monitoring.{domain.name}
              </a>
            </li>
          </ul>
        </div>
      </Card>
    </div>
  );
};

export default DashboardSetup;
