/**
 * Functions for checking the status of the database installation
 */

/**
 * Checks if a database is already installed in the cluster
 * @param {Object} params - Parameters
 * @param {Function} params.setExistingInstallation - Function to set existing installation state
 * @param {Function} params.setInstallationStatus - Function to set installation status
 * @param {Function} params.addLog - Function to add logs
 * @returns {Promise<boolean>} - True if database exists, false otherwise
 */
export const checkExistingDatabase = async ({ 
  setExistingInstallation, 
  setInstallationStatus, 
  addLog 
}) => {
  try {
    // Check for existing database deployment
    const deploymentResult = await window.api.executeCommand('kubectl', [
      'get',
      'deployment',
      'postgres',
      '-o',
      'json'
    ]);

    // Check for existing database secrets
    const secretResult = await window.api.executeCommand('kubectl', [
      'get',
      'secret',
      'database-secrets',
      '-o',
      'json'
    ]);

    if (deploymentResult.code === 0 && secretResult.code === 0) {
      setExistingInstallation(true);
      setInstallationStatus('database', 'success');
      addLog('Existing PostgreSQL database installation detected.');
      return true;
    } else {
      // Database not found, update UI state
      setExistingInstallation(false);
      setInstallationStatus('database', 'not-started');
      return false;
    }
  } catch (error) {
    // Error occurred, assume database not found
    setExistingInstallation(false);
    setInstallationStatus('database', 'not-started');
    return false;
  }
};

/**
 * Waits for a pod to be ready and checks its logs
 * @param {string} podSelector - Selector for the pod
 * @param {string} namespace - Namespace where the pod is running
 * @param {number} timeout - Timeout in seconds
 * @returns {Promise<boolean>} - True if pod is ready, false otherwise
 */
export const waitForPodAndCheckLogs = async (podSelector, namespace, timeout) => {
  try {
    // Wait for pod to be ready
    const waitResult = await window.api.waitForPod(podSelector, namespace, timeout);
    if (waitResult.code !== 0) {
      throw new Error(`Timed out waiting for pod: ${waitResult.stderr}`);
    }

    // Get the pod name
    const podListResult = await window.api.executeCommand('kubectl', [
      'get',
      'pods',
      '-l',
      podSelector,
      '-n',
      namespace,
      '-o',
      'jsonpath={.items[0].metadata.name}'
    ]);

    if (podListResult.code !== 0) {
      throw new Error(`Failed to get pod name: ${podListResult.stderr}`);
    }

    const podName = podListResult.stdout;

    // Check pod status
    const podStatusResult = await window.api.executeCommand('kubectl', [
      'get',
      'pod',
      podName,
      '-n',
      namespace,
      '-o',
      'jsonpath={.status.phase}'
    ]);

    // Only throw error if pod is in Failed or Unknown state
    if (podStatusResult.stdout === 'Error' || podStatusResult.stdout === 'CrashLoopBackOff' || podStatusResult.stdout === 'Unknown') {
      // Get pod logs
      const logsResult = await window.api.executeCommand('kubectl', [
        'logs',
        podName,
        '-n',
        namespace
      ]);

      throw new Error(`Pod is in ${podStatusResult.stdout} state. Logs:\n${logsResult.stdout}`);
    }

    // Additional check for pod readiness
    const readyResult = await window.api.executeCommand('kubectl', [
      'get',
      'pod',
      podName,
      '-n',
      namespace,
      '-o',
      'jsonpath={.status.containerStatuses[0].ready}'
    ]);

    if (readyResult.stdout !== 'true') {
      const logsResult = await window.api.executeCommand('kubectl', [
        'logs',
        podName,
        '-n',
        namespace
      ]);

      throw new Error(`Pod is not ready. Logs:\n${logsResult.stdout}`);
    }

    return true;
  } catch (error) {
    throw error;
  }
}; 