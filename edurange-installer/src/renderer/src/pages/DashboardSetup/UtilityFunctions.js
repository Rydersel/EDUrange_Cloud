// Helper function for safe command execution
const safeExecuteCommand = async (command, args, errorMessage, componentLog) => {
  // Get kubectl path if the command is kubectl
  let actualCommand = command;
  if (command === 'kubectl') {
    try {
      const kubectlCheck = await window.api.checkCommand('kubectl');
      if (kubectlCheck.exists) {
        actualCommand = kubectlCheck.path;
        componentLog(`Using kubectl at: ${actualCommand}`);
      }
    } catch (error) {
      componentLog(`Warning: Could not verify kubectl path: ${error.message}`);
    }
  }

  componentLog(`Executing: ${actualCommand} ${args.join(' ')}`);
  try {
    const result = await window.api.executeCommand(actualCommand, args);
    if (result.code !== 0) {
      throw new Error(`${errorMessage}: ${result.stderr}`);
    }
    return result;
  } catch (error) {
    componentLog(`Command execution error: ${error.message}`);
    throw error;
  }
};

export const waitForPodWithCancel = async ({
  selector,
  namespace,
  timeout,
  isCancelling,
  setWaitingForPod
}) => {
  setWaitingForPod(true);

  try {
    return await window.api.waitForPod(selector, namespace, timeout, (progress) => {
      if (isCancelling) {
        return true; // Signal to cancel the wait
      }
      return false;
    });
  } finally {
    setWaitingForPod(false);
  }
};

export const renderIngressYaml = ({
  name,
  serviceName,
  subdomainKey,
  domain,
  namespace = 'default',
  pathConfig = { path: '/' },
  annotations = {}
}) => {
  const subdomain = subdomainKey ? `${subdomainKey}.` : '';
  const host = `${subdomain}${domain.name}`;
  
  // Default annotations
  const defaultAnnotations = {
    'kubernetes.io/ingress.class': 'nginx',
    'nginx.ingress.kubernetes.io/ssl-redirect': 'true',
    'nginx.ingress.kubernetes.io/force-ssl-redirect': 'true',
    'nginx.ingress.kubernetes.io/proxy-body-size': '0'
  };
  
  // Merge default annotations with custom annotations
  const mergedAnnotations = { ...defaultAnnotations, ...annotations };
  
  // Convert annotations to YAML format
  const annotationsYaml = Object.entries(mergedAnnotations)
    .map(([key, value]) => `    ${key}: "${value}"`)
    .join('\n');
  
  return `
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ${name}
  namespace: ${namespace}
  annotations:
${annotationsYaml}
spec:
  rules:
  - host: "${host}"
    http:
      paths:
      - path: "${pathConfig.path || '/'}"
        pathType: "${pathConfig.pathType || 'Prefix'}"
        backend:
          service:
            name: ${serviceName}
            port:
              number: ${pathConfig.port || 80}
  tls:
  - hosts:
    - "${host}"
    secretName: wildcard-domain-certificate-prod
`;
};

export const checkDashboard = async ({
  componentLog
}) => {
  try {
    componentLog('Checking if dashboard is already installed...');
    
    // Check if dashboard deployment exists
    const deploymentExists = await safeExecuteCommand(
      'kubectl',
      [
        'get',
        'deployment',
        'dashboard',
        '--ignore-not-found'
      ],
      'Failed to check if dashboard deployment exists',
      componentLog
    );
    
    if (deploymentExists.stdout.includes('dashboard')) {
      componentLog('Dashboard deployment found.');
      return true;
    }
    
    componentLog('Dashboard is not installed.');
    return false;
  } catch (error) {
    console.error('Error checking dashboard:', error);
    componentLog(`Error checking dashboard: ${error.message}`);
    return false;
  }
}; 