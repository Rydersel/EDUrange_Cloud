import React, { useState, useEffect } from 'react';
import Card from '../../components/Card';
import Button from '../../components/Button';
import TextField from '../../components/TextField';
import StatusBadge from '../../components/StatusBadge';
import useInstallStore from '../../store/installStore';

// Import components and functions from other files
import { checkExistingDatabase } from './StatusChecks';
import { installDatabase, deleteExistingDatabase, forceCancelInstallation } from './InstallationManager';
import { generateRandomPassword } from './PasswordManager';

const DatabaseSetup = () => {
  const { 
    database, 
    setDatabase, 
    setInstallationStatus, 
    installationStatus, 
    addLog,
    markStepCompleted,
    removeStepCompleted
  } = useInstallStore();
  const [isInstalling, setIsInstalling] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [logs, setLogs] = useState([]);
  const [errors, setErrors] = useState({});
  const [existingInstallation, setExistingInstallation] = useState(false);
  const [forceCancelling, setForceCancelling] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isLinodeEnvironment, setIsLinodeEnvironment] = useState(false);
  const [cleanupOrphanedVolumes, setCleanupOrphanedVolumes] = useState(false);

  useEffect(() => {
    const checkDatabase = async () => {
      const exists = await checkExistingDatabase({
        setExistingInstallation,
        setInstallationStatus,
        addLog
      });
      setExistingInstallation(exists);
      
      // If database exists, mark the step as completed
      if (exists) {
        markStepCompleted('database-setup');
      } else {
        // If database doesn't exist, make sure it's not marked as completed
        removeStepCompleted('database-setup');
      }
    };

    checkDatabase();
  }, [addLog, setInstallationStatus, markStepCompleted, removeStepCompleted]);

  // Check if we're running on Linode
  useEffect(() => {
    const checkLinodeEnvironment = async () => {
      try {
        const storageClassResult = await window.api.executeCommand('kubectl', [
          'get',
          'storageclass',
          'linode-block-storage',
          '--no-headers',
          '--ignore-not-found'
        ]);
        
        if (storageClassResult.code === 0 && storageClassResult.stdout.trim()) {
          setIsLinodeEnvironment(true);
        }
      } catch (error) {
        console.error('Error checking for Linode environment:', error);
      }
    };
    
    checkLinodeEnvironment();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setDatabase(name, value);

    // Clear error when user types
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: null }));
    }
  };

  const handleCheckboxChange = (e) => {
    const { name, checked } = e.target;
    setDatabase(name, checked);
  };

  const handleGenerateRandomPassword = () => {
    const password = generateRandomPassword();
    setDatabase('password', password);
  };

  const validateForm = () => {
    const newErrors = {};

    if (!database.useExistingDatabase) {
      // No validation needed for in-cluster database
      return true;
    }

    if (!database.host) {
      newErrors.host = 'Database host is required';
    }

    if (!database.name) {
      newErrors.name = 'Database name is required';
    }

    if (!database.user) {
      newErrors.user = 'Database user is required';
    }

    if (!database.password) {
      newErrors.password = 'Database password is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInstallDatabase = async () => {
    // Run the Linode volume cleanup if enabled
    if (isLinodeEnvironment && cleanupOrphanedVolumes) {
      addLog('Running Linode volume cleanup to remove orphaned volumes...');
      
      try {
        // Run the command to clean up orphaned volumes
        addLog('Listing orphaned Linode volumes...');
        const listVolumesResult = await window.api.executeCommand('linode-cli', [
          'volumes', 
          'list', 
          '--json'
        ]);
        
        if (listVolumesResult.code !== 0) {
          addLog(`Warning: Failed to list Linode volumes: ${listVolumesResult.stderr}`);
        } else {
          // Parse the JSON output and extract orphaned volume IDs
          try {
            addLog('Identifying orphaned volumes (not attached to any Linode)...');
            const volumesOutput = await window.api.executeCommand('bash', [
              '-c',
              'linode-cli volumes list --json | jq -r \'.[] | select(.linode_id == null) | .id\''
            ]);
            
            if (volumesOutput.code === 0 && volumesOutput.stdout.trim()) {
              const orphanedVolumeIds = volumesOutput.stdout.trim().split('\n');
              
              if (orphanedVolumeIds.length > 0 && orphanedVolumeIds[0] !== '') {
                addLog(`Found ${orphanedVolumeIds.length} orphaned volumes to clean up.`);
                
                // Delete each orphaned volume
                for (const volumeId of orphanedVolumeIds) {
                  addLog(`Deleting orphaned volume ID: ${volumeId}`);
                  const deleteResult = await window.api.executeCommand('linode-cli', [
                    'volumes',
                    'delete',
                    volumeId
                  ]);
                  
                  if (deleteResult.code === 0) {
                    addLog(`Successfully deleted volume ${volumeId}`);
                  } else {
                    addLog(`Warning: Failed to delete volume ${volumeId}: ${deleteResult.stderr}`);
                  }
                }
                
                addLog('Orphaned volume cleanup completed.');
              } else {
                addLog('No orphaned volumes found. Continuing with installation.');
              }
            } else {
              addLog('No orphaned volumes found or error processing volumes. Continuing with installation.');
            }
          } catch (error) {
            addLog(`Warning: Error processing volume list: ${error.message}`);
          }
        }
      } catch (error) {
        addLog(`Warning: Error during Linode volume cleanup: ${error.message}`);
        addLog('Continuing with installation anyway...');
      }
    }
    
    // Validate form before proceeding with installation
    if (!validateForm()) {
      return;
    }
    
    // Continue with regular database installation
    await installDatabase({
      database,
      setDatabase,
      setIsInstalling,
      setInstallationStatus,
      addLog,
      setLogs,
      validateForm
    });
  };

  const handleDeleteExistingDatabase = async () => {
    await deleteExistingDatabase({
      setIsDeleting,
      setInstallationStatus,
      setExistingInstallation,
      addLog,
      setLogs
    });
  };

  const handleForceCancelInstallation = async () => {
    await forceCancelInstallation({
      setForceCancelling,
      setInstallationStatus,
      setIsInstalling,
      addLog,
      setLogs
    });
  };

  // Toggle password visibility
  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Database Setup</h1>
        <p className="mt-2 text-gray-600">
          Set up the PostgreSQL database for EDURange Cloud.
        </p>
      </div>

      <Card title="Database Configuration">
        <div className="space-y-6">
          {existingInstallation && (
            <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-blue-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2h-1V9a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3 flex-1">
                  <p className="text-sm text-blue-700">
                    An existing PostgreSQL database installation was detected. You can proceed with this installation or use the "Uninstall" button at the bottom of this card to start fresh.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-start">
            <div className="flex items-center h-5">
              <input
                id="useExistingDatabase"
                name="useExistingDatabase"
                type="checkbox"
                checked={database.useExistingDatabase}
                onChange={handleCheckboxChange}
                className="focus:ring-primary-500 h-4 w-4 text-primary-600 border-gray-300 rounded"
              />
            </div>
            <div className="ml-3 text-sm">
              <label htmlFor="useExistingDatabase" className="font-medium text-gray-700">
                Use existing PostgreSQL database
              </label>
              <p className="text-gray-500">
                Check this if you want to use an existing PostgreSQL database instead of deploying one in the cluster.
              </p>
            </div>
          </div>

          {database.useExistingDatabase ? (
            <div className="space-y-4">
              <TextField
                label="Database Host"
                id="host"
                name="host"
                value={database.host}
                onChange={handleChange}
                placeholder="e.g., my-postgres.example.com"
                error={errors.host}
                helpText="The hostname or IP address of your PostgreSQL server"
                required
              />

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <TextField
                  label="Database Name"
                  id="name"
                  name="name"
                  value={database.name}
                  onChange={handleChange}
                  placeholder="postgres"
                  error={errors.name}
                  helpText="The name of the database"
                  required
                />

                <TextField
                  label="Database User"
                  id="user"
                  name="user"
                  value={database.user}
                  onChange={handleChange}
                  placeholder="admin"
                  error={errors.user}
                  helpText="The database user"
                  required
                />

                <div className="relative">
                  <TextField
                    label="Database Password"
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    value={database.password}
                    onChange={handleChange}
                    placeholder="••••••••••••••••"
                    error={errors.password}
                    helpText="The database password"
                    required
                  />
                  <button
                    type="button"
                    onClick={handleGenerateRandomPassword}
                    className="absolute right-2 top-8 text-xs text-primary-600 hover:text-primary-500"
                  >
                    Generate
                  </button>
                  <button
                    type="button"
                    onClick={togglePasswordVisibility}
                    className="absolute right-16 top-8 text-gray-500 hover:text-gray-700"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clipRule="evenodd" />
                        <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                        <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-yellow-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-yellow-700">
                      Make sure your PostgreSQL server is accessible from the Kubernetes cluster and has the necessary permissions.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">
                A PostgreSQL database will be deployed in your Kubernetes cluster.
                You can configure the database name, user, and password below.
              </p>

              <div className="flex items-start">
                <div className="flex items-center h-5">
                  <input
                    id="enableStorageCleanup"
                    name="enableStorageCleanup"
                    type="checkbox"
                    checked={database.enableStorageCleanup}
                    onChange={handleCheckboxChange}
                    className="focus:ring-primary-500 h-4 w-4 text-primary-600 border-gray-300 rounded"
                  />
                </div>
                <div className="ml-3 text-sm">
                  <label htmlFor="enableStorageCleanup" className="font-medium text-gray-700">
                    Enable storage cleanup before installation
                  </label>
                  <p className="text-gray-500">
                    Check this to automatically clean up unused storage resources before installation. Helpful when hitting cloud provider storage limits.
                  </p>
                </div>
              </div>

              <div className="flex items-start">
                <div className="flex items-center h-5">
                  <input
                    id="enableDebugSidecar"
                    name="enableDebugSidecar"
                    type="checkbox"
                    checked={database.enableDebugSidecar}
                    onChange={handleCheckboxChange}
                    className="focus:ring-primary-500 h-4 w-4 text-primary-600 border-gray-300 rounded"
                  />
                </div>
                <div className="ml-3 text-sm">
                  <label htmlFor="enableDebugSidecar" className="font-medium text-gray-700">
                    Enable debug sidecar container
                  </label>
                  <p className="text-gray-500">
                    Check this to include a debug sidecar container in the migration pod. Useful for troubleshooting database migration issues.
                  </p>
                </div>
              </div>

              {isLinodeEnvironment && (
                <div className="flex items-start">
                  <div className="flex items-center h-5">
                    <input
                      id="cleanupOrphanedVolumes"
                      name="cleanupOrphanedVolumes"
                      type="checkbox"
                      checked={cleanupOrphanedVolumes}
                      onChange={(e) => setCleanupOrphanedVolumes(e.target.checked)}
                      className="focus:ring-primary-500 h-4 w-4 text-primary-600 border-gray-300 rounded"
                    />
                  </div>
                  <div className="ml-3 text-sm">
                    <label htmlFor="cleanupOrphanedVolumes" className="font-medium text-gray-700">
                      Clean up orphaned Linode volumes
                    </label>
                    <p className="text-gray-500">
                      Automatically deletes orphaned Linode volumes (not attached to any Linode) before installation. Requires linode-cli to be installed.
                    </p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <TextField
                  label="Database Name"
                  id="name"
                  name="name"
                  value={database.name}
                  onChange={handleChange}
                  placeholder="postgres"
                  error={errors.name}
                  helpText="The name of the database"
                />

                <TextField
                  label="Database User"
                  id="user"
                  name="user"
                  value={database.user}
                  onChange={handleChange}
                  placeholder="admin"
                  error={errors.user}
                  helpText="The database user"
                />

                <div className="relative">
                  <TextField
                    label="Database Password"
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    value={database.password}
                    onChange={handleChange}
                    placeholder="••••••••••••••••"
                    error={errors.password}
                    helpText="The database password"
                  />
                  <button
                    type="button"
                    onClick={handleGenerateRandomPassword}
                    className="absolute right-2 top-8 text-xs text-primary-600 hover:text-primary-500"
                  >
                    Generate
                  </button>
                  <button
                    type="button"
                    onClick={togglePasswordVisibility}
                    className="absolute right-16 top-8 text-gray-500 hover:text-gray-700"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clipRule="evenodd" />
                        <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                        <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <div className="bg-blue-50 border-l-4 border-blue-400 p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-blue-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2h-1V9a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-blue-700">
                      The database will be deployed with a persistent volume to store data.
                      Make sure your Kubernetes cluster supports persistent volumes.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-4">
            <div className="flex items-center">
              <span className="font-medium text-gray-900 mr-2">Status:</span>
              <StatusBadge status={installationStatus.database} />
            </div>

            {installationStatus.database === 'success' ? (
              <Button
                onClick={handleDeleteExistingDatabase}
                isLoading={isDeleting}
                disabled={isDeleting || installationStatus.database === 'installing' || installationStatus.database === 'deleting'}
                variant="danger"
              >
                Uninstall
              </Button>
            ) : (
              <div className="flex justify-end space-x-3">
                {!existingInstallation && (
                  <Button
                    onClick={handleInstallDatabase}
                    isLoading={isInstalling && !forceCancelling}
                    disabled={isInstalling || isDeleting || installationStatus.database === 'installing' || installationStatus.database === 'deleting'}
                  >
                    Install Database
                  </Button>
                )}

                {isInstalling && (
                  <Button
                    onClick={handleForceCancelInstallation}
                    variant="danger"
                    isLoading={forceCancelling}
                    disabled={forceCancelling}
                  >
                    Force Cancel
                  </Button>
                )}
              </div>
            )}
          </div>

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
        </div>
      </Card>

      <div className="flex justify-between">
        <Button to="/cert-manager-setup" variant="outline">
          Back
        </Button>

        <Button
          to="/components-setup"
          disabled={installationStatus.database !== 'success'}
        >
          Next
        </Button>
      </div>
    </div>
  );
};

export default DatabaseSetup;
