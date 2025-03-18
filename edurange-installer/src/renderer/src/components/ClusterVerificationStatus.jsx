import React, { useState, useEffect } from 'react';
import useInstallStore from '../store/installStore';
import { verifyAllSteps } from '../services/clusterVerificationService';

const ClusterVerificationStatus = () => {
  const [isVerifying, setIsVerifying] = useState(false);
  const [lastVerified, setLastVerified] = useState(null);
  const [verificationError, setVerificationError] = useState(null);
  
  const { 
    installationStatus, 
    prerequisites,
    completedSteps,
    setPrerequisite,
    markStepCompleted,
    setInstallationStatus
  } = useInstallStore();

  // Format the last verified time
  const formattedLastVerified = lastVerified 
    ? new Date(lastVerified).toLocaleString() 
    : 'Never';

  // Define the steps to check
  const steps = {
    prerequisites: {
      title: 'Prerequisites',
      completed: prerequisites.kubectl && 
                prerequisites.helm && 
                prerequisites.docker && 
                prerequisites.kubeConnection
    },
    domain: {
      title: 'Domain Configuration',
      completed: completedSteps.includes('domain-setup')
    },
    nginxIngress: {
      title: 'NGINX Ingress',
      completed: installationStatus.ingressController === 'success'
    },
    certManager: {
      title: 'Cert Manager',
      completed: installationStatus.certManager === 'success'
    },
    database: {
      title: 'Database',
      completed: installationStatus.database === 'success'
    },
    databaseController: {
      title: 'Database Controller',
      completed: installationStatus.databaseController === 'success'
    },
    instanceManager: {
      title: 'Instance Manager',
      completed: installationStatus.instanceManager === 'success'
    },
    monitoringService: {
      title: 'Monitoring Service',
      completed: installationStatus.monitoringService === 'success'
    },
    dashboard: {
      title: 'Dashboard',
      completed: installationStatus.dashboard === 'success'
    },
    oauth: {
      title: 'OAuth Configuration',
      completed: completedSteps.includes('oauth-setup')
    }
  };

  // Count completed steps
  const completedStepsCount = Object.values(steps).filter(step => step.completed).length;
  const totalSteps = Object.values(steps).length;

  // Handle manual verification
  const handleVerify = async () => {
    setIsVerifying(true);
    setVerificationError(null);
    
    try {
      const results = await verifyAllSteps();
      
      // Update the store based on verification results
      if (results.kubectlConnected) {
        setPrerequisite('kubeConnection', true);
      } else {
        setPrerequisite('kubeConnection', false);
      }
      
      // Update installation steps status
      if (results.nginxIngress) {
        markStepCompleted('ingress-setup');
        setInstallationStatus('ingressController', 'success');
      }
      
      if (results.certManager && results.wildcardCertificate) {
        markStepCompleted('cert-manager-setup');
        setInstallationStatus('certManager', 'success');
      }
      
      if (results.database) {
        markStepCompleted('database-setup');
        setInstallationStatus('database', 'success');
      }
      
      if (results.databaseController) {
        setInstallationStatus('databaseController', 'success');
      }
      
      if (results.instanceManager) {
        setInstallationStatus('instanceManager', 'success');
      }
      
      if (results.monitoringService) {
        setInstallationStatus('monitoringService', 'success');
      }
      
      // If all components are installed, mark the components-setup step as completed
      if (results.databaseController && results.instanceManager && results.monitoringService) {
        markStepCompleted('components-setup');
      }
      
      if (results.oauth) {
        markStepCompleted('oauth-setup');
      }
      
      if (results.dashboard) {
        markStepCompleted('dashboard-setup');
        setInstallationStatus('dashboard', 'success');
      }
      
      if (results.domain && results.domain.configured) {
        markStepCompleted('domain-setup');
      }
      
      setLastVerified(new Date());
    } catch (error) {
      console.error('Error verifying cluster state:', error);
      setVerificationError(error.message || 'Failed to verify cluster state');
    } finally {
      setIsVerifying(false);
    }
  };

  // Run verification on component mount
  useEffect(() => {
    handleVerify();
    
    // Set up a periodic verification (every 5 minutes)
    const intervalId = setInterval(() => {
      handleVerify();
    }, 5 * 60 * 1000);
    
    return () => clearInterval(intervalId);
  }, []);

  return (
    <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-4 mb-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-gray-800 dark:text-white">Cluster Status</h2>
        <button
          onClick={handleVerify}
          disabled={isVerifying}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isVerifying ? 'Verifying...' : 'Verify Now'}
        </button>
      </div>

      {verificationError && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4">
          <p className="font-bold">Error</p>
          <p>{verificationError}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <p className="text-sm text-gray-600 dark:text-gray-400">Last Verified</p>
          <p className="font-medium">{formattedLastVerified}</p>
        </div>
        <div>
          <p className="text-sm text-gray-600 dark:text-gray-400">Kubectl Connection</p>
          <p className={`font-medium ${prerequisites.kubeConnection ? 'text-green-600' : 'text-red-600'}`}>
            {prerequisites.kubeConnection ? 'Connected' : 'Not Connected'}
          </p>
        </div>
      </div>

      <div className="mb-4">
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Installation Progress</p>
        <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
          <div 
            className="bg-blue-600 h-2.5 rounded-full" 
            style={{ width: `${(completedStepsCount / totalSteps) * 100}%` }}
          ></div>
        </div>
        <p className="text-xs text-right mt-1 text-gray-600 dark:text-gray-400">
          {completedStepsCount} of {totalSteps} steps completed
        </p>
      </div>

      <div className="mt-4">
        <h3 className="text-md font-semibold mb-2 text-gray-800 dark:text-white">Component Status</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {Object.entries(steps).map(([key, step]) => (
            <div key={key} className="flex items-center">
              <span className={`h-3 w-3 rounded-full mr-2 ${
                step.completed ? 'bg-green-500' : 'bg-red-500'
              }`}></span>
              <span className="capitalize">{step.title}</span>
              <span className="ml-auto text-xs text-gray-500">
                {step.completed ? 'Installed' : 'Not Installed'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ClusterVerificationStatus; 