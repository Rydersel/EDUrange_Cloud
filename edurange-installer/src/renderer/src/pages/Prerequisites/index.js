import React, { useState, useEffect } from 'react';
import Card from '../../components/Card';
import Button from '../../components/Button';
import StatusBadge from '../../components/StatusBadge';
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/solid';
import useInstallStore from '../../store/installStore';
import { verifyAllSteps } from '../../services/clusterVerificationService';

const PrerequisiteItem = ({ name, description, status, errorMessage, version, onBrowse }) => {
  return (
    <div className="flex items-start py-4 border-b border-gray-200 last:border-b-0">
      <div className="flex-shrink-0 mt-1">
        {status === 'success' ? (
          <CheckCircleIcon className="h-6 w-6 text-green-500" />
        ) : status === 'error' ? (
          <XCircleIcon className="h-6 w-6 text-red-500" />
        ) : (
          <div className="h-6 w-6 rounded-full bg-gray-200 animate-pulse"></div>
        )}
      </div>
      <div className="ml-3 flex-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <h3 className="text-sm font-medium text-gray-900">{name}</h3>
            <div className="ml-2">
              <StatusBadge status={status} />
            </div>
          </div>
          {status === 'error' && onBrowse && (
            <Button onClick={onBrowse} variant="outline" size="sm">
              Specify Path
            </Button>
          )}
        </div>
        <p className="mt-1 text-sm text-gray-500">{description}</p>
        {status === 'error' && errorMessage && (
          <p className="mt-1 text-sm text-red-600">{errorMessage}</p>
        )}
        {version && (
          <p className="mt-1 text-sm text-gray-500">Version: {version}</p>
        )}
      </div>
    </div>
  );
};

const Prerequisites = () => {
  const [isChecking, setIsChecking] = useState(false);
  const [checkComplete, setCheckComplete] = useState(false);
  const [versions, setVersions] = useState({
    kubectl: '',
    helm: '',
    docker: ''
  });
  const [customPaths, setCustomPaths] = useState({
    kubectl: '',
    helm: '',
    docker: ''
  });
  const { prerequisites, setPrerequisite, markStepCompleted } = useInstallStore();

  const browseForExecutable = async (tool) => {
    try {
      const result = await window.api.showDialog({
        title: `Select ${tool} executable`,
        properties: ['openFile'],
        filters: [
          { name: 'Executables', extensions: ['exe', '*'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });

      if (!result.canceled && result.filePaths.length > 0) {
        const execPath = result.filePaths[0];
        setCustomPaths(prev => ({ ...prev, [tool]: execPath }));
        
        // Verify the selected executable
        await verifyExecutable(tool, execPath);
      }
    } catch (error) {
      console.error(`Error browsing for ${tool}:`, error);
    }
  };

  const verifyExecutable = async (tool, execPath) => {
    try {
      let versionArgs = [];
      
      switch (tool) {
        case 'kubectl':
          versionArgs = ['version', '--client', '-o', 'json'];
          break;
        case 'helm':
          versionArgs = ['version', '--short'];
          break;
        case 'docker':
          versionArgs = ['version', '--format', '{{.Client.Version}}'];
          break;
        default:
          versionArgs = ['--version'];
      }

      const versionResult = await window.api.executeCommand(execPath, versionArgs);
      
      if (versionResult.code === 0) {
        setPrerequisite(tool, true);
        
        // Parse version information
        if (tool === 'kubectl') {
          try {
            const version = JSON.parse(versionResult.stdout);
            setVersions(prev => ({ ...prev, kubectl: version.clientVersion.gitVersion }));
          } catch (error) {
            console.error('Error parsing kubectl version:', error);
            setVersions(prev => ({ ...prev, kubectl: 'Error parsing version' }));
          }
        } else if (tool === 'helm') {
          setVersions(prev => ({ ...prev, helm: versionResult.stdout.trim() }));
        } else if (tool === 'docker') {
          setVersions(prev => ({ ...prev, docker: versionResult.stdout.trim() }));
        }
        
        // If it's kubectl, also check the connection
        if (tool === 'kubectl') {
          const connectionResult = await window.api.executeCommand(execPath, ['cluster-info']);
          setPrerequisite('kubeConnection', connectionResult.code === 0);
        }
        
        return true;
      } else {
        console.error(`Invalid ${tool} executable:`, versionResult.stderr);
        return false;
      }
    } catch (error) {
      console.error(`Error verifying ${tool} executable:`, error);
      return false;
    }
  };

  const verifyKubernetesConnection = async () => {
    // Implementation of verifyKubernetesConnection
  };

  const checkPrerequisites = async () => {
    setIsChecking(true);
    setCheckComplete(false);
    
    try {
      // Check kubectl
      await verifyExecutable('kubectl', 'kubectl');
      
      // Check helm
      await verifyExecutable('helm', 'helm');
      
      // Check docker
      await verifyExecutable('docker', 'docker');
      
      // Check kubernetes connection
      await verifyKubernetesConnection();
      
      // Run cluster verification
      await verifyAllSteps();
    } catch (error) {
      console.error('Error checking prerequisites:', error);
    } finally {
      setCheckComplete(true);
      setIsChecking(false);
    }
  };

  useEffect(() => {
    checkPrerequisites();
  }, [customPaths]);

  const allPrerequisitesMet = Object.values(prerequisites).every(Boolean);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Prerequisites Check</h1>
        <p className="mt-2 text-gray-600">
          Let's make sure your system has all the required tools to install EDURange Cloud.
        </p>
      </div>

      <Card>
        <div className="space-y-4">
          <PrerequisiteItem
            name="kubectl"
            description="The Kubernetes command-line tool, used to deploy and manage applications on Kubernetes."
            status={prerequisites.kubectl ? 'success' : isChecking ? 'pending' : 'error'}
            errorMessage={!prerequisites.kubectl && checkComplete ? "kubectl not found. Please install kubectl or specify its path." : null}
            version={versions.kubectl}
            onBrowse={() => browseForExecutable('kubectl')}
          />

          <PrerequisiteItem
            name="Helm"
            description="The package manager for Kubernetes, used to install and manage Kubernetes applications."
            status={prerequisites.helm ? 'success' : isChecking ? 'pending' : 'error'}
            errorMessage={!prerequisites.helm && checkComplete ? "Helm not found. Please install Helm or specify its path." : null}
            version={versions.helm}
            onBrowse={() => browseForExecutable('helm')}
          />

          <PrerequisiteItem
            name="Docker"
            description="The container runtime, used to build and run containerized applications."
            status={prerequisites.docker ? 'success' : isChecking ? 'pending' : 'error'}
            errorMessage={!prerequisites.docker && checkComplete ? "Docker not found. Please install Docker or specify its path." : null}
            version={versions.docker}
            onBrowse={() => browseForExecutable('docker')}
          />

          <PrerequisiteItem
            name="Kubernetes Connection"
            description="Connection to a Kubernetes cluster. Make sure your kubeconfig is properly set up."
            status={prerequisites.kubeConnection ? 'success' : isChecking ? 'pending' : 'error'}
            errorMessage={!prerequisites.kubeConnection && checkComplete ? "Could not connect to a Kubernetes cluster. Please check your kubeconfig." : null}
          />
        </div>
      </Card>

      <div className="flex justify-between">
        <Button
          onClick={checkPrerequisites}
          variant="outline"
          isLoading={isChecking}
          disabled={isChecking}
        >
          {isChecking ? 'Checking...' : 'Check Again'}
        </Button>

        <Button
          onClick={() => window.location.href = '/domain-setup'}
          disabled={!allPrerequisitesMet || isChecking}
        >
          Next
        </Button>
      </div>
    </div>
  );
};

export default Prerequisites;
