import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useStore from '../../store';
import Button from '../../components/Button';
import Card from '../../components/Card';
import LogDisplay from '../../components/LogDisplay';

const RedisService = () => {
  const navigate = useNavigate();
  const [installing, setInstalling] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState(null);
  const [logs, setLogs] = useState([]);
  const [verified, setVerified] = useState(false);
  const { setInstallationStatus, markStepCompleted } = useStore();

  const addLog = (message, type = 'info') => {
    const typePrefix = type === 'error' ? '❌ ERROR: ' : 
                      type === 'success' ? '✅ SUCCESS: ' : 
                      '📋 INFO: ';
    setLogs(prev => [...prev, `${typePrefix}${message}`]);
  };

  /**
   * Applies a Kubernetes manifest from a string
   * @param {string} manifestContent - The manifest content as a string
   * @param {string} resourceName - The name of the resource for logging
   * @returns {Promise<Object>} - The result of the kubectl apply command
   */
  const applyManifestFromString = async (manifestContent, resourceName) => {
    try {
      // Apply the manifest directly using the API
      const result = await window.api.applyManifestFromString(manifestContent);
      
      return result;
    } catch (error) {
      console.error(`Error applying manifest for ${resourceName}:`, error);
      return { code: 1, stderr: error.message };
    }
  };

  const installRedis = async () => {
    setCompleted(false);
    setInstalling(true);
    setError(null);
    setLogs([]);
    
    try {
      addLog('Starting Redis installation...', 'info');
      
      // Generate a secure password for Redis
      addLog('Generating secure Redis password...', 'info');
      
      // Generate a secure password similar to database password
      const generatePassword = (length = 20) => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let password = '';
        const randomValues = new Uint8Array(length);
        window.crypto.getRandomValues(randomValues);
        for (let i = 0; i < length; i++) {
          password += chars[randomValues[i] % chars.length];
        }
        return password;
      };
      
      const redisPassword = generatePassword(24);
      
      addLog(`Redis password generated (length: ${redisPassword.length})`, 'info');
      
      // Create Redis credentials secret using btoa() for encoding
      addLog('Creating Redis credentials secret...', 'info');
      
      // Create the full Redis URL with the password
      const redisUrl = `redis://:${redisPassword}@redis:6379/0`;
      
      const secretYaml = `
apiVersion: v1
kind: Secret
metadata:
  name: redis-credentials
  namespace: default
type: Opaque
data:
  redis-password: ${btoa(redisPassword)}
  redis-url: ${btoa(redisUrl)}
`;
      
      const secretResult = await applyManifestFromString(secretYaml, 'redis-credentials secret');
      if (secretResult.code !== 0) {
        throw new Error(`Failed to create Redis credentials secret: ${secretResult.stderr}`);
      }
      addLog('Redis credentials secret created successfully.', 'success');
      
      // Verify that the Redis password was created correctly
      addLog('Verifying Redis password and URL...', 'info');
      
      const getRedisPasswordCmd = await window.api.executeCommand('kubectl', [
        'get',
        'secret',
        'redis-credentials',
        '-o',
        'jsonpath={.data.redis-password}'
      ]);
      
      if (getRedisPasswordCmd.code !== 0) {
        throw new Error(`Failed to get Redis password: ${getRedisPasswordCmd.stderr}`);
      }
      
      // Get the Redis URL from the secret
      const getRedisUrlCmd = await window.api.executeCommand('kubectl', [
        'get',
        'secret',
        'redis-credentials',
        '-o',
        'jsonpath={.data.redis-url}'
      ]);
      
      if (getRedisUrlCmd.code !== 0) {
        throw new Error(`Failed to get Redis URL: ${getRedisUrlCmd.stderr}`);
      }
      
      // Try to decode the password and URL to verify they match expected values
      const encodedPassword = getRedisPasswordCmd.stdout;
      const encodedUrl = getRedisUrlCmd.stdout;
      
      try {
        const decodedPassword = atob(encodedPassword);
        const decodedUrl = atob(encodedUrl);
        const expectedUrl = `redis://:${redisPassword}@redis:6379/0`;
        
        if (decodedPassword !== redisPassword) {
          addLog('Warning: Encoded password does not match original password', 'warning');
        } else {
          addLog('Redis password verified successfully', 'success');
        }
        
        if (decodedUrl !== expectedUrl) {
          addLog(`Warning: Encoded URL does not match expected URL: 
          Got: ${decodedUrl}
          Expected: ${expectedUrl}`, 'warning');
        } else {
          addLog('Redis URL verified successfully', 'success');
        }
      } catch (e) {
        addLog(`Warning: Error decoding Redis credentials: ${e.message}`, 'warning');
      }
      
      // Wait a bit for the secret to be fully available
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Create Redis PVC
      addLog('Creating Redis Persistent Volume Claim...', 'info');
      const redisPvcYaml = `
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: redis-pvc
  namespace: default
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 5Gi
`;
      const pvcResult = await applyManifestFromString(redisPvcYaml, 'redis-pvc');
      if (pvcResult.code !== 0) {
        throw new Error(`Failed to create Redis PVC: ${pvcResult.stderr}`);
      }
      addLog('Redis PVC created successfully.', 'success');

      // Create Redis ConfigMap
      addLog('Creating Redis ConfigMap...', 'info');
      const redisConfigMapYaml = `
apiVersion: v1
kind: ConfigMap
metadata:
  name: redis-config
  namespace: default
data:
  redis.conf: |
    # Redis configuration
    # Enable AOF persistence with improved settings
    appendonly yes
    appendfsync everysec
    no-appendfsync-on-rewrite yes
    auto-aof-rewrite-percentage 100
    auto-aof-rewrite-min-size 64mb
    
    # Memory management - allow Redis to use available container memory
    # No explicit maxmemory setting to allow scaling with container limits
    # Redis will naturally use memory up to the Kubernetes pod limit
    # Set policy for when system memory is under pressure
    maxmemory-policy allkeys-lru
    # Enable maxmemory-samples for better LRU algorithm performance
    maxmemory-samples 10
    
    # Security settings
    protected-mode yes
    # Authentication will be set via mounted secret
    # Allow connections from other pods in the cluster
    bind 0.0.0.0
    
    # Connection limits and timeouts
    timeout 300
    tcp-keepalive 60
    maxclients 10000
    
    # Performance tuning
    hz 5
    dynamic-hz yes
    
    # Lower thread count for minimal installations
    io-threads 2
    
    # Set appropriate log level
    loglevel warning
    
    # Optimize for queue workload
    # Disable saving to disk on time intervals (rely on AOF)
    save ""
    
    # Memory optimization
    activedefrag yes
    active-defrag-threshold-lower 5
    active-defrag-threshold-upper 20
    active-defrag-cycle-min 25
    active-defrag-cycle-max 75
    
    # Advanced performance settings
    io-threads-do-reads yes
    
    # Client output buffer limits
    client-output-buffer-limit normal 0 0 0
    client-output-buffer-limit replica 256mb 64mb 60
    client-output-buffer-limit pubsub 32mb 8mb 60
`;
      const configMapResult = await applyManifestFromString(redisConfigMapYaml, 'redis-config');
      if (configMapResult.code !== 0) {
        throw new Error(`Failed to create Redis ConfigMap: ${configMapResult.stderr}`);
      }
      addLog('Redis ConfigMap created successfully.', 'success');

      // Create Redis Deployment
      addLog('Creating Redis Deployment...', 'info');
      const redisDeploymentYaml = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: redis
  namespace: default
  labels:
    app: redis
spec:
  selector:
    matchLabels:
      app: redis
  replicas: 1
  template:
    metadata:
      labels:
        app: redis
    spec:
      volumes:
        - name: redis-data
          persistentVolumeClaim:
            claimName: redis-pvc
        - name: redis-config
          configMap:
            name: redis-config
        - name: redis-password
          secret:
            secretName: redis-credentials
      containers:
      - name: redis
        image: redis:7.2-alpine
        resources:
          limits:
            memory: "2Gi"
            cpu: "1000m"
          requests:
            memory: "128Mi"
            cpu: "50m"
        ports:
        - containerPort: 6379
        volumeMounts:
        - name: redis-data
          mountPath: /data
        - name: redis-config
          mountPath: /usr/local/etc/redis/redis.conf
          subPath: redis.conf
        command: ["redis-server", "/usr/local/etc/redis/redis.conf"]
        env:
        - name: REDIS_PASSWORD
          valueFrom:
            secretKeyRef:
              name: redis-credentials
              key: redis-password
        args:
        - --requirepass
        - $(REDIS_PASSWORD)
        livenessProbe:
          exec:
            command:
            - redis-cli
            - ping
          initialDelaySeconds: 30
          timeoutSeconds: 5
          periodSeconds: 10
        readinessProbe:
          exec:
            command:
            - redis-cli
            - ping
          initialDelaySeconds: 5
          timeoutSeconds: 5
          periodSeconds: 10
`;
      const deploymentResult = await applyManifestFromString(redisDeploymentYaml, 'redis-deployment');
      if (deploymentResult.code !== 0) {
        throw new Error(`Failed to create Redis Deployment: ${deploymentResult.stderr}`);
      }
      addLog('Redis Deployment created successfully.', 'success');

      // Create Redis Service
      addLog('Creating Redis Service...', 'info');
      const redisServiceYaml = `
apiVersion: v1
kind: Service
metadata:
  name: redis
  namespace: default
spec:
  selector:
    app: redis
  ports:
  - port: 6379
    targetPort: 6379
  type: ClusterIP
`;
      const serviceResult = await applyManifestFromString(redisServiceYaml, 'redis-service');
      if (serviceResult.code !== 0) {
        throw new Error(`Failed to create Redis Service: ${serviceResult.stderr}`);
      }
      addLog('Redis Service created successfully.', 'success');

      // Create HPA for Redis
      addLog('Creating Horizontal Pod Autoscaler for Redis...', 'info');
      const redisHpaYaml = `
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: redis-hpa
  namespace: default
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: redis
  minReplicas: 1
  maxReplicas: 3
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Percent
        value: 25
        periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
      - type: Percent
        value: 100
        periodSeconds: 60
`;
      const hpaResult = await applyManifestFromString(redisHpaYaml, 'redis-hpa');
      if (hpaResult.code !== 0) {
        addLog(`Warning: Failed to create HPA for Redis: ${hpaResult.stderr}`, 'warning');
        addLog('Continuing with installation. You can manually add HPA later.', 'info');
      } else {
        addLog('Horizontal Pod Autoscaler for Redis created successfully.', 'success');
      }

      // Create environment variables in core services to connect to Redis
      addLog('Updating core services with Redis environment variables...', 'info');
      
      // Update instance-manager deployment
      await updateDeploymentWithRedisEnv('instance-manager');
      addLog('Updated instance-manager with Redis configuration.', 'success');
      
      // Update dashboard deployment
      await updateDeploymentWithRedisEnv('dashboard');
      addLog('Updated dashboard with Redis configuration.', 'success');
      
      // Update database-controller deployment
      await updateDeploymentWithRedisEnv('database-controller');
      addLog('Updated database-controller with Redis configuration.', 'success');

      // Add a delay before verification to allow time for the Redis pod to start
      addLog('Waiting for Redis deployment to initialize...', 'info');
      await new Promise(resolve => setTimeout(resolve, 5000)); // 5 second wait

      // Verify Redis installation
      addLog('Starting Redis verification...', 'info');
      await verifyRedisInstallation();

      setCompleted(true);
      setInstallationStatus('redisService', 'installed');
      markStepCompleted('redis-service');
      addLog('Redis installation completed successfully!', 'success');
    } catch (error) {
      setError(error.message);
      addLog(`Installation failed: ${error.message}`, 'error');
    } finally {
      setInstalling(false);
    }
  };

  const updateDeploymentWithRedisEnv = async (deploymentName) => {
    try {
      // Get the deployment
      const deploymentResult = await window.api.executeCommand('kubectl', ['get', 'deployment', deploymentName, '-o', 'json']);
      if (deploymentResult.code !== 0) {
        throw new Error(`Failed to get deployment ${deploymentName}: ${deploymentResult.stderr}`);
      }
      
      const deployment = JSON.parse(deploymentResult.stdout);
      
      addLog(`Updating ${deploymentName} with Redis environment variables...`, 'info');
      
      // Add Redis environment variables to all containers in the deployment
      for (const container of deployment.spec.template.spec.containers) {
        // Check if environment variables exist
        if (!container.env) {
          container.env = [];
        }

        // Remove existing Redis-related variables
        container.env = container.env.filter(env => 
          !['REDIS_URL', 'REDIS_HOST', 'REDIS_PORT', 'REDIS_PASSWORD'].includes(env.name)
        );
        
        // Add Redis URL from the secret (complete URL including password)
        container.env.push({
          name: 'REDIS_URL',
          valueFrom: {
            secretKeyRef: {
              name: 'redis-credentials',
              key: 'redis-url'
            }
          }
        });
        
        // Also add individual Redis connection parameters for services that need them
        container.env.push({
          name: 'REDIS_HOST',
          value: 'redis'
        });
        
        container.env.push({
          name: 'REDIS_PORT',
          value: '6379'
        });
        
        container.env.push({
          name: 'REDIS_PASSWORD',
          valueFrom: {
            secretKeyRef: {
              name: 'redis-credentials',
              key: 'redis-password'
            }
          }
        });
      }
      
      // Apply the updated deployment using applyManifestFromString
      const deploymentYaml = JSON.stringify(deployment);
      const updateResult = await applyManifestFromString(deploymentYaml, deploymentName);
      if (updateResult.code !== 0) {
        throw new Error(`Failed to update deployment ${deploymentName}: ${updateResult.stderr}`);
      }
      
      return true;
    } catch (error) {
      addLog(`Error updating ${deploymentName} with Redis environment: ${error.message}`, 'error');
      throw error;
    }
  };

  const verifyRedisInstallation = async () => {
    addLog('Verifying Redis installation...', 'info');
    
    try {
      // Check if pods exist and wait for them to be ready
      addLog('Waiting for Redis pod to be fully ready...', 'info');
      
      // Wait for pod to exist and be Running
      let isRunning = false;
      let podAttempts = 0;
      const podMaxAttempts = 15; // Up to 30 seconds wait
      
      while (!isRunning && podAttempts < podMaxAttempts) {
        const podCheckResult = await window.api.executeCommand('kubectl', ['get', 'pods', '-l', 'app=redis', '-o', 'jsonpath={.items[0].status.phase}']);
        
        if (podCheckResult.code === 0 && podCheckResult.stdout.trim() === 'Running') {
          isRunning = true;
          addLog('Redis pod is running, checking readiness...', 'info');
        } else {
          podAttempts++;
          addLog(`Waiting for Redis pod to be running (attempt ${podAttempts}/${podMaxAttempts})...`, 'info');
          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds between checks
        }
      }
      
      if (!isRunning) {
        throw new Error('Timed out waiting for Redis pod to be running');
      }
      
      // Now wait for the container to be ready (all readiness probes passed)
      let isReady = false;
      let readyAttempts = 0;
      const readyMaxAttempts = 15; // Up to 30 seconds wait
      
      while (!isReady && readyAttempts < readyMaxAttempts) {
        const readyCheckResult = await window.api.executeCommand('kubectl', [
          'get', 'pods', '-l', 'app=redis', '-o', 'jsonpath={.items[0].status.containerStatuses[0].ready}'
        ]);
        
        if (readyCheckResult.code === 0 && readyCheckResult.stdout.trim() === 'true') {
          isReady = true;
          addLog('Redis pod is ready', 'success');
        } else {
          readyAttempts++;
          addLog(`Waiting for Redis container to be ready (attempt ${readyAttempts}/${readyMaxAttempts})...`, 'info');
          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds between checks
        }
      }
      
      if (!isReady) {
        throw new Error('Timed out waiting for Redis container to be ready');
      }
      
      // Test Redis connection using a pod with environment variables
      addLog('Testing Redis connection...', 'info');
      
      // Create a temporary pod to test Redis connection without hardcoding passwords
      const connectionTestYaml = `
apiVersion: v1
kind: Pod
metadata:
  name: redis-test
  labels:
    app: redis-test
spec:
  restartPolicy: Never
  containers:
  - name: redis-client
    image: redis:alpine
    command: ["/bin/sh", "-c"]
    args:
    - |
      # Get Redis password from environment
      if [ -n "$REDIS_PASSWORD" ]; then
        echo "Testing Redis connection with explicit password..."
        redis-cli -h redis -a "$REDIS_PASSWORD" PING
        RESULT=$?
        if [ $RESULT -eq 0 ]; then
          echo "Connection successful using explicit password"
        else
          echo "Connection failed using explicit password"
          exit 1
        fi
      fi
      exit 0
    env:
    - name: REDIS_PASSWORD
      valueFrom:
        secretKeyRef:
          name: redis-credentials
          key: redis-password
  `;
      
      // Apply the test pod manifest
      const testPodResult = await applyManifestFromString(connectionTestYaml, 'redis-test-pod');
      if (testPodResult.code !== 0) {
        throw new Error(`Failed to create Redis test pod: ${testPodResult.stderr}`);
      }
      
      // Wait for the test pod to complete
      addLog('Waiting for Redis test to complete...', 'info');
      let testCompleted = false;
      let testAttempts = 0;
      const testMaxAttempts = 10;
      
      while (!testCompleted && testAttempts < testMaxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds between checks
        
        const podStatusResult = await window.api.executeCommand('kubectl', [
          'get', 'pod', 'redis-test', '-o', 'jsonpath={.status.phase}'
        ]);
        
        if (podStatusResult.stdout.trim() === 'Succeeded') {
          testCompleted = true;
        } else if (podStatusResult.stdout.trim() === 'Failed') {
          // Get logs to see what failed
          const logsResult = await window.api.executeCommand('kubectl', ['logs', 'redis-test']);
          await window.api.executeCommand('kubectl', ['delete', 'pod', 'redis-test', '--ignore-not-found']);
          throw new Error(`Redis connection test failed: ${logsResult.stdout || logsResult.stderr}`);
        } else {
          testAttempts++;
        }
      }
      
      if (!testCompleted) {
        await window.api.executeCommand('kubectl', ['delete', 'pod', 'redis-test', '--ignore-not-found']);
        throw new Error('Redis connection test timed out');
      }
      
      // Get the test pod logs
      const logsResult = await window.api.executeCommand('kubectl', ['logs', 'redis-test']);
      
      // Clean up the test pod
      await window.api.executeCommand('kubectl', ['delete', 'pod', 'redis-test', '--ignore-not-found']);
      
      if (!logsResult.stdout.includes('PONG')) {
        throw new Error(`Redis connection test failed: ${logsResult.stdout || logsResult.stderr}`);
      }
      
      addLog('Redis connection test successful', 'success');
      
      // Check if instance-manager can connect to Redis
      addLog('Checking if instance-manager can connect to Redis...', 'info');
      // Get the instance-manager pod name
      const podResult = await window.api.executeCommand('kubectl', ['get', 'pods', '-l', 'app=instance-manager', '-o', 'jsonpath={.items[0].metadata.name}']);
      if (podResult.code !== 0 || !podResult.stdout) {
        throw new Error('Instance manager pod not found');
      }
      
      const podName = podResult.stdout.trim();
      
      // Execute a command in the instance-manager pod to check Redis health endpoint
      const imConnectionResult = await window.api.executeCommand('kubectl', [
        'exec', podName, '--', 'curl', '-s', 'http://localhost:5000/api/redis-health'
      ]);
      
      // Verify the response status is healthy
      const redisHealth = JSON.parse(imConnectionResult.stdout);
      if (imConnectionResult.code !== 0 || redisHealth.status !== 'healthy') {
        throw new Error(`Instance manager Redis health check failed: ${redisHealth.message || imConnectionResult.stderr || 'Unknown error'}`);
      }
      
      addLog('Instance manager successfully connected to Redis', 'success');
      addLog('Redis verification completed successfully', 'success');
      setVerified(true);
      return true;
    } catch (error) {
      addLog(`Redis verification failed: ${error.message}`, 'error');
      setVerified(false);
      return false;
    }
  };

  const uninstallRedis = async () => {
    setError(null);
    setLogs([]); // Clear previous logs
    addLog('Starting Redis uninstallation...', 'info');

    try {
      // Delete Redis Service
      addLog('Deleting Redis Service...', 'info');
      const serviceResult = await window.api.executeCommand('kubectl', [
        'delete',
        'service',
        'redis',
        '--ignore-not-found'
      ]);
      
      if (serviceResult.code !== 0) {
        addLog(`Warning: Failed to delete Redis Service: ${serviceResult.stderr}`, 'warning');
      } else {
        addLog('Redis Service deleted successfully.', 'success');
      }

      // Delete Redis Deployment
      addLog('Deleting Redis Deployment...', 'info');
      const deploymentResult = await window.api.executeCommand('kubectl', [
        'delete',
        'deployment',
        'redis',
        '--ignore-not-found'
      ]);
      
      if (deploymentResult.code !== 0) {
        addLog(`Warning: Failed to delete Redis Deployment: ${deploymentResult.stderr}`, 'warning');
      } else {
        addLog('Redis Deployment deleted successfully.', 'success');
      }

      // Delete Redis ConfigMap
      addLog('Deleting Redis ConfigMap...', 'info');
      const configMapResult = await window.api.executeCommand('kubectl', [
        'delete',
        'configmap',
        'redis-config',
        '--ignore-not-found'
      ]);
      
      if (configMapResult.code !== 0) {
        addLog(`Warning: Failed to delete Redis ConfigMap: ${configMapResult.stderr}`, 'warning');
      } else {
        addLog('Redis ConfigMap deleted successfully.', 'success');
      }

      // Delete Redis Credentials Secret
      addLog('Deleting Redis Credentials Secret...', 'info');
      const secretResult = await window.api.executeCommand('kubectl', [
        'delete',
        'secret',
        'redis-credentials',
        '--ignore-not-found'
      ]);
      
      if (secretResult.code !== 0) {
        addLog(`Warning: Failed to delete Redis Credentials Secret: ${secretResult.stderr}`, 'warning');
      } else {
        addLog('Redis Credentials Secret deleted successfully.', 'success');
      }

      // Keep the PVC for data persistence unless explicit delete is requested
      addLog('Note: Redis PVC (redis-data) has been preserved to maintain data. If you want to completely remove all Redis data, please manually delete the PVC.', 'info');

      setCompleted(false);
      setInstallationStatus('redisService', 'not-started');
      addLog('Redis uninstallation completed successfully!', 'success');
    } catch (error) {
      setError(error.message);
      addLog(`Uninstallation failed: ${error.message}`, 'error');
    }
  };

  return (
    <div className="p-6">
      <Button 
        variant="outline" 
        className="mb-4"
        onClick={() => navigate('/components-setup')}
      >
        Back to Components
      </Button>
      
      <Card
        title="Redis Service Installation"
        description="Redis is used for caching and message queuing in the EDURange platform."
      >
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md text-red-700">
            <p className="font-medium">Error</p>
            <p>{error}</p>
          </div>
        )}
        
        {completed && !error && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-md text-green-700">
            <p className="font-medium">Installation Complete</p>
            <p>Redis service has been successfully installed and configured.</p>
            {verified && <p className="font-semibold mt-2">✅ Redis connection verified successfully.</p>}
          </div>
        )}
        
        {installing && (
          <div className="mb-4">
            <div className="flex items-center mb-2">
              <span className="mr-2">Installing Redis...</span>
              <span className="text-xs text-gray-500">This may take a few minutes</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div className="bg-blue-600 h-2.5 rounded-full animate-pulse w-full"></div>
            </div>
          </div>
        )}

        <div className="flex space-x-4">
          {!installing && !completed && (
            <Button 
              onClick={installRedis}
              className="bg-blue-500 hover:bg-blue-600"
            >
              Install Redis
            </Button>
          )}
          
          {completed && !installing && (
            <Button 
              onClick={uninstallRedis}
              className="bg-red-500 hover:bg-red-600"
            >
              Uninstall Redis
            </Button>
          )}
        </div>

        {logs.length > 0 && (
          <div className="mt-4">
            <h3 className="text-lg font-semibold mb-2">Installation Logs</h3>
            <div className="border rounded-md p-4 bg-black text-white font-mono text-sm h-96 overflow-y-auto">
              {logs.map((log, index) => (
                <div key={index} className="mb-1">{log}</div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};

export const updateAllComponentsWithRedis = async (addCustomLog = null) => {
  const log = addCustomLog || ((message, type) => console.log(message));
  
  /**
   * Applies a Kubernetes manifest from a string
   * @param {string} manifestContent - The manifest content as a string
   * @param {string} resourceName - The name of the resource for logging
   * @returns {Promise<Object>} - The result of the kubectl apply command
   */
  const applyManifestFromString = async (manifestContent, resourceName) => {
    try {
      // Apply the manifest directly using the API
      const result = await window.api.applyManifestFromString(manifestContent);
      
      return result;
    } catch (error) {
      console.error(`Error applying manifest for ${resourceName}:`, error);
      return { code: 1, stderr: error.message };
    }
  };
  
  try {
    log('Updating all components with Redis environment variables...', 'info');
    
    // Get all deployments that might need Redis configuration
    const components = ['instance-manager', 'dashboard', 'database-controller'];
    
    for (const component of components) {
      try {
        // Check if the component exists
        const checkResult = await window.api.executeCommand('kubectl', [
          'get', 'deployment', component, '--ignore-not-found'
        ]);
        
        if (checkResult.stdout.includes(component)) {
          log(`Updating ${component} with Redis configuration...`, 'info');
          
          // Get the deployment
          const deploymentResult = await window.api.executeCommand('kubectl', ['get', 'deployment', component, '-o', 'json']);
          if (deploymentResult.code !== 0) {
            throw new Error(`Failed to get deployment ${component}: ${deploymentResult.stderr}`);
          }
          
          const deployment = JSON.parse(deploymentResult.stdout);
          
          log(`Updating ${component} with Redis environment variables...`, 'info');
          
          // Add Redis environment variables to all containers in the deployment
          for (const container of deployment.spec.template.spec.containers) {
            // Check if environment variables exist
            if (!container.env) {
              container.env = [];
            }

            // Remove existing Redis-related variables
            container.env = container.env.filter(env => 
              !['REDIS_URL', 'REDIS_HOST', 'REDIS_PORT', 'REDIS_PASSWORD'].includes(env.name)
            );
            
            // Add Redis URL from the secret (complete URL including password)
            container.env.push({
              name: 'REDIS_URL',
              valueFrom: {
                secretKeyRef: {
                  name: 'redis-credentials',
                  key: 'redis-url'
                }
              }
            });
            
            // Also add individual Redis connection parameters for services that need them
            container.env.push({
              name: 'REDIS_HOST',
              value: 'redis'
            });
            
            container.env.push({
              name: 'REDIS_PORT',
              value: '6379'
            });
            
            container.env.push({
              name: 'REDIS_PASSWORD',
              valueFrom: {
                secretKeyRef: {
                  name: 'redis-credentials',
                  key: 'redis-password'
                }
              }
            });
          }
          
          // Apply the updated deployment using applyManifestFromString
          const deploymentYaml = JSON.stringify(deployment);
          const updateResult = await applyManifestFromString(deploymentYaml, component);
          if (updateResult.code !== 0) {
            throw new Error(`Failed to update deployment ${component}: ${updateResult.stderr}`);
          }
          
          log(`Updated ${component} with Redis configuration.`, 'success');
        }
      } catch (error) {
        log(`Warning: Failed to update ${component}: ${error.message}`, 'warning');
      }
    }
    
    log('All components updated with Redis configuration.', 'success');
    return true;
  } catch (error) {
    log(`Error updating components with Redis: ${error.message}`, 'error');
    return false;
  }
};

export default RedisService; 