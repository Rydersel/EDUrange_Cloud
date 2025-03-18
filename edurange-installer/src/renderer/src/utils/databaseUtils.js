/**
 * Global utility functions for database verification and operations
 */

/**
 * Verifies database credentials by checking if the database URL is valid
 * @param {Object} params - Parameters
 * @param {string} params.dbUrl - Database URL (optional, will be fetched from secrets if not provided)
 * @param {Function} params.addLog - Function to add logs (optional)
 * @param {Function} params.setLogs - Function to set logs (optional)
 * @param {Function} params.componentLog - Alternative logging function (optional)
 * @returns {Promise<boolean|Object>} - True if credentials are valid, or object with credentials
 */
export const verifyDatabaseCredentials = async ({
  dbUrl,
  addLog,
  setLogs,
  componentLog
}) => {
  // Unified logging function that works with different logging patterns
  const log = (message) => {
    if (addLog) addLog(message);
    if (setLogs) setLogs(prev => [...prev, message]);
    if (componentLog) componentLog(message);
  };

  try {
    log('Verifying database credentials...');

    // If dbUrl is not provided, fetch it from database-secrets
    if (!dbUrl) {
      // Get database URL from database-secrets
      const getDatabaseUrlCmd = await window.api.executeCommand('kubectl', [
        'get',
        'secret',
        'database-secrets',
        '-o',
        'jsonpath={.data.database-url}'
      ]);

      if (getDatabaseUrlCmd.code !== 0) {
        throw new Error('Failed to get database URL from database-secrets');
      }

      const encodedDatabaseUrl = getDatabaseUrlCmd.stdout;

      // Get postgres password from database-secrets
      const getPasswordCmd = await window.api.executeCommand('kubectl', [
        'get',
        'secret',
        'database-secrets',
        '-o',
        'jsonpath={.data.postgres-password}'
      ]);

      if (getPasswordCmd.code !== 0) {
        throw new Error('Failed to get postgres password from database-secrets');
      }

      const encodedPassword = getPasswordCmd.stdout;

      // Decode the values
      const databaseUrl = atob(encodedDatabaseUrl);
      const postgresPassword = atob(encodedPassword);

      log(`Database URL: ${databaseUrl.replace(/:[^:]*@/, ':****@')}`);
      log(`Postgres password is set and has ${postgresPassword.length} characters`);

      // Check if dashboard-secrets exists
      const dashboardSecretsExistsCmd = await window.api.executeCommand('kubectl', [
        'get',
        'secret',
        'dashboard-secrets',
        '--ignore-not-found'
      ]);

      if (!dashboardSecretsExistsCmd.stdout.includes('dashboard-secrets')) {
        log('dashboard-secrets does not exist. It will be created during dashboard installation.');
        return { databaseUrl, postgresPassword };
      }

      // Get database URL from dashboard-secrets
      const getDashboardDbUrlCmd = await window.api.executeCommand('kubectl', [
        'get',
        'secret',
        'dashboard-secrets',
        '-o',
        'jsonpath={.data.database-url}',
        '--ignore-not-found'
      ]);

      // If dashboard-secrets exists but doesn't have database-url, we'll add it during installation
      if (!getDashboardDbUrlCmd.stdout) {
        log('dashboard-secrets exists but does not have database-url. It will be added during dashboard installation.');
        return { databaseUrl, postgresPassword };
      }

      const encodedDashboardDbUrl = getDashboardDbUrlCmd.stdout;
      const dashboardDbUrl = atob(encodedDashboardDbUrl);

      // Check if the database URLs match
      if (databaseUrl !== dashboardDbUrl) {
        log('Warning: Database URL in dashboard-secrets does not match database-secrets. It will be updated during dashboard installation.');
      } else {
        log('Database URL in dashboard-secrets matches database-secrets.');
      }

      return { databaseUrl, postgresPassword };
    } else {
      // If dbUrl is provided, test the connection directly
      // Create a temporary pod to test the database connection
      const podName = `db-verify-${Date.now()}`;
      const podYaml = `
apiVersion: v1
kind: Pod
metadata:
  name: ${podName}
spec:
  restartPolicy: Never
  containers:
  - name: db-verify
    image: postgres:latest
    command: ["/bin/sh", "-c"]
    args:
      - |
        echo "Testing connection to database..."
        export PGPASSWORD=$(echo $DATABASE_URL | sed -E 's/.*:([^@]*)@.*/\\1/')
        export PGUSER=$(echo $DATABASE_URL | sed -E 's/.*:\/\/([^:]*).*/\\1/')
        export PGHOST=$(echo $DATABASE_URL | sed -E 's/.*@([^:]*).*/\\1/')
        export PGPORT=$(echo $DATABASE_URL | sed -E 's/.*:([0-9]*)\/.*/\\1/')
        export PGDATABASE=$(echo $DATABASE_URL | sed -E 's/.*\\/([^?]*).*/\\1/')
        
        echo "Connecting to PostgreSQL at $PGHOST:$PGPORT as $PGUSER..."
        pg_isready -h $PGHOST -p $PGPORT -U $PGUSER
        
        if [ $? -eq 0 ]; then
          echo "Connection successful!"
          exit 0
        else
          echo "Connection failed!"
          exit 1
        fi
    env:
    - name: DATABASE_URL
      value: "${dbUrl}"
`;

      // Apply the pod
      log('Creating verification pod...');

      const podResult = await window.api.applyManifestFromString(podYaml);
      if (podResult.code !== 0) {
        throw new Error(`Failed to create verification pod: ${podResult.stderr}`);
      }

      // Wait for the pod to complete
      log('Waiting for verification to complete...');

      let podStatus = '';
      let attempts = 0;
      const maxAttempts = 30;

      while (attempts < maxAttempts) {
        attempts++;

        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds

        const statusResult = await window.api.executeCommand('kubectl', [
          'get',
          'pod',
          podName,
          '-o',
          'jsonpath={.status.phase}'
        ]);

        if (statusResult.code !== 0) {
          log(`Error checking pod status: ${statusResult.stderr}`);
          continue;
        }

        podStatus = statusResult.stdout;

        if (podStatus === 'Succeeded' || podStatus === 'Failed') {
          break;
        }

        log(`Verification in progress... (${attempts}/${maxAttempts})`);
      }

      // Get the logs
      const logsResult = await window.api.executeCommand('kubectl', [
        'logs',
        podName
      ]);

      if (logsResult.code === 0) {
        logsResult.stdout.split('\n').forEach(line => {
          if (line.trim()) {
            log(line);
          }
        });
      }

      // Clean up the pod
      await window.api.executeCommand('kubectl', [
        'delete',
        'pod',
        podName,
        '--ignore-not-found'
      ]);

      if (podStatus === 'Succeeded') {
        log('Database credentials verified successfully.');
        return true;
      } else {
        log('Failed to verify database credentials.');
        return false;
      }
    }
  } catch (error) {
    log(`Error verifying database credentials: ${error.message}`);
    if (componentLog) {
      throw error;
    }
    return false;
  }
};

/**
 * Helper function to decode base64 strings
 * @param {string} b64Encoded - Base64 encoded string
 * @returns {string} - Decoded string
 */
const atob = (b64Encoded) => {
  // Use the browser's built-in atob function
  return window.atob(b64Encoded);
};

/**
 * Helper function to encode strings to base64
 * @param {string} str - String to encode
 * @returns {string} - Base64 encoded string
 */
export const btoa = (str) => {
  // Use the browser's built-in btoa function
  return window.btoa(str);
};

/**
 * Verifies that the database password is consistent across all secrets
 * @param {Object} params - Parameters
 * @param {string} params.dbPassword - Database password
 * @param {Function} params.addLog - Function to add logs
 * @param {Function} params.setLogs - Function to set logs
 * @param {Function} params.componentLog - Alternative logging function (optional)
 * @returns {Promise<boolean>} - True if password is consistent, false otherwise
 */
export const verifyDatabasePasswordConsistency = async ({
  dbPassword,
  addLog,
  setLogs,
  componentLog
}) => {
  // Unified logging function that works with different logging patterns
  const log = (message) => {
    if (addLog) addLog(message);
    if (setLogs) setLogs(prev => [...prev, message]);
    if (componentLog) componentLog(message);
  };

  try {
    log('Verifying database password consistency...');

    // Get database URL from database-secrets
    const getDatabaseUrlCmd = await window.api.executeCommand('kubectl', [
      'get',
      'secret',
      'database-secrets',
      '-o',
      'jsonpath={.data.database-url}'
    ]);

    if (getDatabaseUrlCmd.code !== 0) {
      throw new Error(`Failed to get database URL: ${getDatabaseUrlCmd.stderr}`);
    }

    const encodedDatabaseUrl = getDatabaseUrlCmd.stdout;
    const decodedDatabaseUrl = atob(encodedDatabaseUrl);

    // Extract password from database URL
    const urlPasswordMatch = decodedDatabaseUrl.match(/postgresql:\/\/[^:]+:([^@]+)@/);
    const urlPassword = urlPasswordMatch ? urlPasswordMatch[1] : null;

    if (!urlPassword) {
      throw new Error('Could not extract password from database URL');
    }

    // Check if passwords match
    if (urlPassword !== dbPassword) {
      log('WARNING: Password in database URL does not match postgres-password!');
      log('Updating database URL with correct password...');

      // Get database connection details
      const urlUserMatch = decodedDatabaseUrl.match(/postgresql:\/\/([^:]+):/);
      const urlHostMatch = decodedDatabaseUrl.match(/@([^:]+):/);
      const urlPortMatch = decodedDatabaseUrl.match(/:([0-9]+)\//);
      const urlDbNameMatch = decodedDatabaseUrl.match(/\/([^?]+)($|\?)/);

      const dbUser = urlUserMatch ? urlUserMatch[1] : 'postgres';
      const dbHost = urlHostMatch ? urlHostMatch[1] : 'postgres';
      const dbPort = urlPortMatch ? urlPortMatch[1] : '5432';
      const dbName = urlDbNameMatch ? urlDbNameMatch[1] : 'postgres';

      // Create corrected database URL
      const correctedUrl = `postgresql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbName}`;
      const encodedCorrectedUrl = btoa(correctedUrl);

      // Update database-secrets
      const updateDbSecretsCmd = await window.api.executeCommand('kubectl', [
        'patch',
        'secret',
        'database-secrets',
        '-p',
        `{"data":{"database-url":"${encodedCorrectedUrl}"}}`
      ]);

      if (updateDbSecretsCmd.code !== 0) {
        throw new Error(`Failed to update database-secrets: ${updateDbSecretsCmd.stderr}`);
      }

      log('Updated database-secrets with corrected database URL.');

      // Check if dashboard-secrets exists and update it too if needed
      const dashboardSecretsExistsCmd = await window.api.executeCommand('kubectl', [
        'get',
        'secret',
        'dashboard-secrets',
        '--ignore-not-found'
      ]);

      if (dashboardSecretsExistsCmd.stdout.includes('dashboard-secrets')) {
        // Get database URL from dashboard-secrets
        const getDashboardDbUrlCmd = await window.api.executeCommand('kubectl', [
          'get',
          'secret',
          'dashboard-secrets',
          '-o',
          'jsonpath={.data.database-url}',
          '--ignore-not-found'
        ]);

        if (getDashboardDbUrlCmd.stdout) {
          // Update dashboard-secrets
          const updateDashboardSecretsCmd = await window.api.executeCommand('kubectl', [
            'patch',
            'secret',
            'dashboard-secrets',
            '-p',
            `{"data":{"database-url":"${encodedCorrectedUrl}"}}`
          ]);

          if (updateDashboardSecretsCmd.code !== 0) {
            throw new Error(`Failed to update dashboard-secrets: ${updateDashboardSecretsCmd.stderr}`);
          }

          log('Updated dashboard-secrets with corrected database URL.');
        }
      }
    } else {
      log('Database password is consistent across all secrets.');
    }

    return true;
  } catch (error) {
    log(`Error verifying database password consistency: ${error.message}`);
    if (componentLog) {
      throw error;
    }
    return false;
  }
};
