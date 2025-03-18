const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
  'api', {
    // Command execution
    checkCommand: async (command) => {
      const result = await ipcRenderer.invoke('check-command', command);
      // For backward compatibility, return just the exists boolean if called from old code
      return result.exists !== undefined ? result : { exists: result };
    },
    executeCommand: (command, args) => ipcRenderer.invoke('execute-command', command, args),
    
    // Store custom tool path
    storeToolPath: (tool, path) => {
      // This is just a convenience method that calls executeCommand with the absolute path
      // The main process will store this path for future use
      return ipcRenderer.invoke('execute-command', path, ['--version']);
    },
    
    // System information
    getPlatform: () => {
      return ipcRenderer.invoke('get-platform');
    },
    
    // Configuration management
    saveConfig: (config) => ipcRenderer.invoke('save-config', config),
    loadConfig: () => ipcRenderer.invoke('load-config'),
    
    // File dialogs
    showDialog: (options) => ipcRenderer.invoke('show-dialog', options),
    
    // Kubernetes operations
    checkKubectlConnection: () => {
      return ipcRenderer.invoke('execute-command', 'kubectl', ['cluster-info']);
    },
    getKubeConfig: () => {
      return ipcRenderer.invoke('execute-command', 'kubectl', ['config', 'view', '--minify', '-o', 'json']);
    },
    installNginxIngress: () => {
      return ipcRenderer.invoke('execute-command', 'kubectl', [
        'apply', 
        '-f', 
        'https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/cloud/deploy.yaml'
      ]);
    },
    installCertManager: () => {
      return ipcRenderer.invoke('execute-command', 'kubectl', [
        'apply',
        '-f',
        'https://github.com/cert-manager/cert-manager/releases/download/v1.12.2/cert-manager.yaml'
      ]);
    },
    installCertManagerWithHelm: () => {
      // We'll execute a series of commands to install cert-manager with Helm
      return ipcRenderer.invoke('execute-helm-cert-manager');
    },
    applyManifest: (manifestPath) => {
      return ipcRenderer.invoke('execute-command', 'kubectl', ['apply', '-f', manifestPath]);
    },
    createNamespace: (namespace) => {
      return ipcRenderer.invoke('execute-command', 'kubectl', ['create', 'namespace', namespace]);
    },
    getExternalIP: (service, namespace) => {
      return ipcRenderer.invoke('execute-command', 'kubectl', [
        'get', 
        'svc', 
        service, 
        '-n', 
        namespace, 
        '-o', 
        'jsonpath={.status.loadBalancer.ingress[0].ip}'
      ]);
    },
    waitForPod: (selector, namespace, timeout) => {
      return ipcRenderer.invoke('execute-command', 'kubectl', [
        'wait',
        '--namespace',
        namespace,
        '--for=condition=ready',
        'pod',
        `--selector=${selector}`,
        `--timeout=${timeout}s`
      ]);
    },
    executeStep: (step) => {
      return ipcRenderer.invoke('execute-step', step);
    },
    applyManifestFromString: (manifestContent) => {
      return ipcRenderer.invoke('apply-manifest-from-string', manifestContent);
    }
  }
); 