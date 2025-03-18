/**
 * Utility functions for database operations
 */

/**
 * Encodes a string to base64
 * @param {string} str - String to encode
 * @returns {string} - Base64 encoded string
 */
export const btoa = (str) => {
  // Use the browser's built-in btoa function
  return window.btoa(str);
};

/**
 * Decodes a base64 string
 * @param {string} b64Encoded - Base64 encoded string
 * @returns {string} - Decoded string
 */
export const atob = (b64Encoded) => {
  // Use the browser's built-in atob function
  return window.atob(b64Encoded);
};

/**
 * Waits for a pod with the given selector to be ready
 * @param {Object} params - Parameters
 * @param {string} params.podSelector - Selector for the pod
 * @param {string} params.namespace - Namespace where the pod is running
 * @param {number} params.timeout - Timeout in seconds
 * @param {Function} params.onCancel - Function to call when cancellation is requested
 * @param {boolean} params.isCancelling - Flag indicating if cancellation is requested
 * @param {Function} params.addLog - Function to add logs
 * @param {Function} params.setLogs - Function to set logs
 * @returns {Promise<boolean>} - True if pod is ready, false otherwise
 */
export const waitForPodWithCancel = async ({
  podSelector,
  namespace,
  timeout,
  onCancel,
  isCancelling,
  addLog,
  setLogs
}) => {
  try {
    addLog(`Waiting for pod with selector "${podSelector}" to be ready...`);
    setLogs(prev => [...prev, `Waiting for pod with selector "${podSelector}" to be ready...`]);

    const startTime = Date.now();
    const timeoutMs = timeout * 1000;
    let podReady = false;

    while (!podReady && Date.now() - startTime < timeoutMs) {
      // Check if cancellation was requested
      if (isCancelling) {
        addLog('Operation cancelled by user.');
        setLogs(prev => [...prev, 'Operation cancelled by user.']);
        if (onCancel) {
          await onCancel();
        }
        return false;
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

      if (podListResult.code !== 0 || !podListResult.stdout) {
        addLog(`Pod not found yet. Waiting... (${Math.round((Date.now() - startTime) / 1000)}s elapsed)`);
        setLogs(prev => [...prev, `Pod not found yet. Waiting... (${Math.round((Date.now() - startTime) / 1000)}s elapsed)`]);
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
        continue;
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

      if (podStatusResult.stdout === 'Running') {
        // Check if all containers are ready
        const readyResult = await window.api.executeCommand('kubectl', [
          'get',
          'pod',
          podName,
          '-n',
          namespace,
          '-o',
          'jsonpath={.status.containerStatuses[0].ready}'
        ]);

        if (readyResult.stdout === 'true') {
          podReady = true;
          addLog(`Pod ${podName} is ready.`);
          setLogs(prev => [...prev, `Pod ${podName} is ready.`]);
        } else {
          addLog(`Pod ${podName} is running but not ready yet. Waiting...`);
          setLogs(prev => [...prev, `Pod ${podName} is running but not ready yet. Waiting...`]);
        }
      } else if (podStatusResult.stdout === 'Failed' || podStatusResult.stdout === 'Error' || podStatusResult.stdout === 'CrashLoopBackOff') {
        // Get pod logs
        const logsResult = await window.api.executeCommand('kubectl', [
          'logs',
          podName,
          '-n',
          namespace
        ]);

        throw new Error(`Pod ${podName} is in ${podStatusResult.stdout} state. Logs:\n${logsResult.stdout}`);
      } else {
        addLog(`Pod ${podName} status: ${podStatusResult.stdout}. Waiting...`);
        setLogs(prev => [...prev, `Pod ${podName} status: ${podStatusResult.stdout}. Waiting...`]);
      }

      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
    }

    if (!podReady) {
      throw new Error(`Timed out waiting for pod with selector "${podSelector}" to be ready after ${timeout} seconds.`);
    }

    return true;
  } catch (error) {
    addLog(`Error waiting for pod: ${error.message}`);
    setLogs(prev => [...prev, `Error waiting for pod: ${error.message}`]);
    throw error;
  }
}; 