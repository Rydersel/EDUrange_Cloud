import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useInstallStore from '../../store/installStore';
import Card from '../../components/Card';
import Button from '../../components/Button';
import StatusBadge from '../../components/StatusBadge';
import LogDisplay from '../../components/LogDisplay';

const UserManagement = () => {
  const { domain, markStepCompleted, addLog: storeAddLog } = useInstallStore();
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [logs, setLogs] = useState([]);
  const [status, setStatus] = useState('not-started');

  const addLog = (message) => {
    setLogs(prev => [...prev, message]);
    storeAddLog(message);
  };

  // Fetch users from the database
  const fetchUsers = async () => {
    setIsLoading(true);
    addLog('Fetching users from the database...');

    try {
      // Delete any existing pod first
      await window.api.executeCommand('kubectl', [
        'delete',
        'pod',
        'fetch-users-pod',
        '--ignore-not-found'
      ]);

      addLog('Preparing database query pod...');

      // Create a unique pod name with timestamp
      const timestamp = new Date().getTime();
      const podName = `fetch-users-pod-${timestamp}`;

      // Create a temporary pod to query the database
      const fetchUsersPodYaml = `
apiVersion: v1
kind: Pod
metadata:
  name: ${podName}
spec:
  containers:
  - name: fetch-users
    image: postgres:15-alpine
    command: ["/bin/sh", "-c"]
    args:
    - |
      # Try connecting with postgres user first
      if PGPASSWORD=$POSTGRES_PASSWORD psql -h $POSTGRES_HOST -U postgres -d postgres -c "SELECT 1" > /dev/null 2>&1; then
        echo "Connected with postgres user to postgres database"
        PGPASSWORD=$POSTGRES_PASSWORD psql -h $POSTGRES_HOST -U postgres -d postgres -t -c "SELECT id, name, email, role FROM \\\"User\\\" ORDER BY email;"
      else
        # Fall back to the provided credentials
        echo "Falling back to provided credentials"
        PGPASSWORD=$POSTGRES_PASSWORD psql -h $POSTGRES_HOST -U $POSTGRES_USER -d $POSTGRES_DB -t -c "SELECT id, name, email, role FROM \\\"User\\\" ORDER BY email;"
      fi
    env:
    - name: POSTGRES_HOST
      valueFrom:
        secretKeyRef:
          name: database-secrets
          key: postgres-host
    - name: POSTGRES_USER
      valueFrom:
        secretKeyRef:
          name: database-secrets
          key: postgres-user
    - name: POSTGRES_PASSWORD
      valueFrom:
        secretKeyRef:
          name: database-secrets
          key: postgres-password
    - name: POSTGRES_DB
      valueFrom:
        secretKeyRef:
          name: database-secrets
          key: postgres-name
  restartPolicy: Never
  activeDeadlineSeconds: 60
`;

      const podResult = await window.api.applyManifestFromString(fetchUsersPodYaml);

      if (podResult.code !== 0) {
        throw new Error(`Failed to create fetch-users pod: ${podResult.stderr}`);
      }

      addLog('Waiting for user data...');

      // Wait for the pod to complete
      let podCompleted = false;
      let attempts = 0;
      const maxAttempts = 30;

      while (!podCompleted && attempts < maxAttempts) {
        attempts++;

        const podStatusResult = await window.api.executeCommand('kubectl', [
          'get',
          'pod',
          podName,
          '-o',
          'jsonpath={.status.phase}'
        ]);

        if (podStatusResult.stdout === 'Succeeded') {
          podCompleted = true;
        } else if (podStatusResult.stdout === 'Failed') {
          throw new Error('Failed to fetch users from the database');
        } else {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      if (!podCompleted) {
        throw new Error('Timed out waiting for user data');
      }

      // Get the logs from the pod
      const logsResult = await window.api.executeCommand('kubectl', [
        'logs',
        podName
      ]);

      if (logsResult.code !== 0) {
        throw new Error(`Failed to get user data: ${logsResult.stderr}`);
      }

      // Parse the user data
      const userLines = logsResult.stdout.split('\n').filter(line => line.trim());
      const parsedUsers = userLines.map(line => {
        const [id, name, email, role] = line.split('|').map(item => item.trim());
        return { id, name, email, role };
      });

      setUsers(parsedUsers);
      addLog(`Found ${parsedUsers.length} users in the database.`);

      // Clean up the pod
      await window.api.executeCommand('kubectl', [
        'delete',
        'pod',
        podName,
        '--ignore-not-found'
      ]);

      setStatus('success');
    } catch (error) {
      console.error('Error fetching users:', error);
      addLog(`Error fetching users: ${error.message}`);
      setStatus('error');
    } finally {
      setIsLoading(false);
    }
  };

  // Restart the dashboard pod to clear any cached user data
  const restartDashboard = async () => {
    try {
      addLog('Restarting dashboard to apply role changes...');

      // Scale down the dashboard deployment
      const scaleDownResult = await window.api.executeCommand('kubectl', [
        'scale',
        'deployment',
        'dashboard',
        '--replicas=0'
      ]);

      if (scaleDownResult.code !== 0) {
        throw new Error(`Failed to scale down dashboard: ${scaleDownResult.stderr}`);
      }

      // Wait for pods to terminate
      addLog('Waiting for dashboard pods to terminate...');
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Scale up the dashboard deployment
      const scaleUpResult = await window.api.executeCommand('kubectl', [
        'scale',
        'deployment',
        'dashboard',
        '--replicas=1'
      ]);

      if (scaleUpResult.code !== 0) {
        throw new Error(`Failed to scale up dashboard: ${scaleUpResult.stderr}`);
      }

      addLog('Dashboard restarted successfully. Role changes will take effect on next login.');

      return true;
    } catch (error) {
      console.error('Error restarting dashboard:', error);
      addLog(`Error restarting dashboard: ${error.message}`);
      return false;
    }
  };

  // Grant admin access to the selected user
  const grantAdminAccess = async () => {
    if (!selectedUser) {
      addLog('Please select a user first.');
      return;
    }

    setIsLoading(true);
    addLog(`Granting admin access to user: ${selectedUser.email}...`);

    try {
      // Delete any existing pod first
      await window.api.executeCommand('kubectl', [
        'delete',
        'pod',
        'update-user-pod',
        '--ignore-not-found'
      ]);

      addLog('Preparing database update pod...');

      // Create a unique pod name with timestamp
      const timestamp = new Date().getTime();
      const podName = `update-user-pod-${timestamp}`;

      // Create a temporary pod to update the user role
      const updateUserPodYaml = `
apiVersion: v1
kind: Pod
metadata:
  name: ${podName}
spec:
  containers:
  - name: update-user
    image: postgres:15-alpine
    command: ["/bin/sh", "-c"]
    args:
    - |
      # Try connecting with postgres user first
      if PGPASSWORD=$POSTGRES_PASSWORD psql -h $POSTGRES_HOST -U postgres -d postgres -c "SELECT 1" > /dev/null 2>&1; then
        echo "Connected with postgres user to postgres database"
        PGPASSWORD=$POSTGRES_PASSWORD psql -h $POSTGRES_HOST -U postgres -d postgres -c "UPDATE \\\"User\\\" SET role = 'ADMIN' WHERE id = '${selectedUser.id}';"
      else
        # Fall back to the provided credentials
        echo "Falling back to provided credentials"
        PGPASSWORD=$POSTGRES_PASSWORD psql -h $POSTGRES_HOST -U $POSTGRES_USER -d $POSTGRES_DB -c "UPDATE \\\"User\\\" SET role = 'ADMIN' WHERE id = '${selectedUser.id}';"
      fi
    env:
    - name: POSTGRES_HOST
      valueFrom:
        secretKeyRef:
          name: database-secrets
          key: postgres-host
    - name: POSTGRES_USER
      valueFrom:
        secretKeyRef:
          name: database-secrets
          key: postgres-user
    - name: POSTGRES_PASSWORD
      valueFrom:
        secretKeyRef:
          name: database-secrets
          key: postgres-password
    - name: POSTGRES_DB
      valueFrom:
        secretKeyRef:
          name: database-secrets
          key: postgres-name
  restartPolicy: Never
  activeDeadlineSeconds: 60
`;

      const podResult = await window.api.applyManifestFromString(updateUserPodYaml);

      if (podResult.code !== 0) {
        throw new Error(`Failed to create update-user pod: ${podResult.stderr}`);
      }

      addLog('Waiting for user update to complete...');

      // Wait for the pod to complete
      let podCompleted = false;
      let attempts = 0;
      const maxAttempts = 30;

      while (!podCompleted && attempts < maxAttempts) {
        attempts++;

        const podStatusResult = await window.api.executeCommand('kubectl', [
          'get',
          'pod',
          podName,
          '-o',
          'jsonpath={.status.phase}'
        ]);

        if (podStatusResult.stdout === 'Succeeded') {
          podCompleted = true;
        } else if (podStatusResult.stdout === 'Failed') {
          throw new Error('Failed to update user role');
        } else {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      if (!podCompleted) {
        throw new Error('Timed out waiting for user update');
      }

      // Get the logs from the pod
      const logsResult = await window.api.executeCommand('kubectl', [
        'logs',
        podName
      ]);

      addLog(`Update result: ${logsResult.stdout}`);

      // Clean up the pod
      await window.api.executeCommand('kubectl', [
        'delete',
        'pod',
        podName,
        '--ignore-not-found'
      ]);

      addLog(`Successfully granted admin access to ${selectedUser.email}.`);

      // Restart the dashboard to apply role changes
      await restartDashboard();

      addLog('You can now log in to the dashboard with admin privileges.');

      // Update the selected user in the state
      setUsers(prevUsers =>
        prevUsers.map(user =>
          user.id === selectedUser.id
            ? { ...user, role: 'ADMIN' }
            : user
        )
      );

      setSelectedUser(prev => ({ ...prev, role: 'ADMIN' }));

      // Mark step as completed
      await window.api.executeStep('user-management');
      markStepCompleted('user-management');

      setStatus('success');
    } catch (error) {
      console.error('Error granting admin access:', error);
      addLog(`Error granting admin access: ${error.message}`);
      setStatus('error');
    } finally {
      setIsLoading(false);
    }
  };

  // Check if dashboard is deployed
  const checkDashboardDeployment = async () => {
    try {
      const deploymentResult = await window.api.executeCommand('kubectl', [
        'get',
        'deployment',
        'dashboard',
        '--ignore-not-found'
      ]);

      return deploymentResult.stdout.includes('dashboard');
    } catch (error) {
      console.error('Error checking dashboard deployment:', error);
      return false;
    }
  };

  useEffect(() => {
    const checkAndFetchUsers = async () => {
      const isDashboardDeployed = await checkDashboardDeployment();

      // Clear any existing logs first
      setLogs([]);

      if (isDashboardDeployed) {
        addLog('Dashboard is deployed. You can now fetch users and grant admin access.');
      } else {
        addLog('Dashboard is not yet deployed. Please complete the dashboard installation first.');
      }
    };

    checkAndFetchUsers();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
        <p className="mt-2 text-gray-600">
          Grant admin access to your user account in the EDURange Cloud platform.
        </p>
      </div>

      <Card title="User Access Management">
        <div className="space-y-4">
          <div className="bg-blue-50 border-l-4 border-blue-400 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-blue-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-blue-700">
                  To grant admin access, first log in to the dashboard at <a href={`https://${domain.dashboardSubdomain}.${domain.name}`} target="_blank" rel="noopener noreferrer" className="font-medium underline">https://{domain.dashboardSubdomain}.{domain.name}</a> using GitHub OAuth. Then return here to select your user account and grant admin privileges.
                </p>
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center">
            <Button
              onClick={fetchUsers}
              disabled={isLoading}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isLoading ? 'Loading...' : 'Fetch Users'}
            </Button>

            <StatusBadge
              status={status}
              text={
                status === 'success' ? 'Users Loaded' :
                status === 'running' ? 'Loading Users...' :
                status === 'error' ? 'Error Loading Users' :
                'Not Started'
              }
            />
          </div>

          {users.length > 0 && (
            <div className="mt-4">
              <h3 className="text-lg font-medium text-gray-900 mb-2">Select Your User Account</h3>
              <div className="bg-white shadow overflow-hidden border-b border-gray-200 sm:rounded-lg">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Select
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Name
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Email
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Role
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {users.map(user => (
                      <tr key={user.id} className={selectedUser?.id === user.id ? 'bg-blue-50' : ''}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <input
                            type="radio"
                            name="selectedUser"
                            checked={selectedUser?.id === user.id}
                            onChange={() => setSelectedUser(user)}
                            className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300"
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{user.name || 'N/A'}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-500">{user.email}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            user.role === 'ADMIN' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                          }`}>
                            {user.role}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {selectedUser && (
            <div className="flex justify-between items-center mt-4">
              <div>
                <p className="text-sm text-gray-700">
                  Selected user: <span className="font-medium">{selectedUser.email}</span>
                </p>
                {selectedUser.role === 'ADMIN' && (
                  <p className="text-sm text-green-600 mt-1">
                    This user already has admin privileges.
                  </p>
                )}
              </div>

              <Button
                onClick={grantAdminAccess}
                disabled={isLoading || selectedUser.role === 'ADMIN'}
                className={`${
                  selectedUser.role === 'ADMIN' 
                    ? 'bg-gray-400 cursor-not-allowed' 
                    : 'bg-green-600 hover:bg-green-700'
                } text-white`}
              >
                {isLoading ? 'Processing...' : 'Grant Admin Access'}
              </Button>
            </div>
          )}

          {selectedUser && selectedUser.role === 'ADMIN' && (
            <div className="mt-4 p-4 bg-green-50 border-l-4 border-green-400 text-green-700">
              <p className="font-medium">Admin access granted successfully!</p>
              <p className="mt-1">
                Please log out of the dashboard and log back in for the changes to take effect.
                You can access the dashboard at{' '}
                <a
                  href={`https://${domain.dashboardSubdomain}.${domain.name}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-medium"
                >
                  https://{domain.dashboardSubdomain}.{domain.name}
                </a>
              </p>
            </div>
          )}
        </div>
      </Card>

      <Card title="Logs">
        <LogDisplay logs={logs} />
      </Card>
    </div>
  );
};

export default UserManagement;
