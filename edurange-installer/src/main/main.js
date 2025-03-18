const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');
const log = require('electron-log');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');

// Store custom tool paths
let customToolPaths = {
  kubectl: '',
  helm: '',
  docker: ''
};

// Common paths for tools by platform
const commonToolPaths = {
  darwin: { // macOS
    kubectl: ['/usr/local/bin/kubectl', '/opt/homebrew/bin/kubectl', '/usr/bin/kubectl'],
    helm: ['/usr/local/bin/helm', '/opt/homebrew/bin/helm', '/usr/bin/helm'],
    docker: ['/usr/local/bin/docker', '/opt/homebrew/bin/docker', '/usr/bin/docker']
  },
  linux: {
    kubectl: ['/usr/local/bin/kubectl', '/usr/bin/kubectl', '/snap/bin/kubectl'],
    helm: ['/usr/local/bin/helm', '/usr/bin/helm', '/snap/bin/helm'],
    docker: ['/usr/local/bin/docker', '/usr/bin/docker', '/snap/bin/docker']
  },
  win32: { // Windows
    kubectl: ['C:\\Program Files\\kubectl\\kubectl.exe', 'C:\\Windows\\System32\\kubectl.exe'],
    helm: ['C:\\Program Files\\Helm\\helm.exe', 'C:\\Windows\\System32\\helm.exe'],
    docker: ['C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe', 'C:\\Program Files\\Docker\\Docker\\docker.exe']
  }
};

// Function to check if a file exists
const fileExists = (filePath) => {
  try {
    return fs.existsSync(filePath);
  } catch (error) {
    return false;
  }
};

// Configure logging
log.transports.file.level = 'info';
log.transports.console.level = 'info';
log.info('Application starting...');
log.info(`Running in ${isDev ? 'development' : 'production'} mode`);

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true,
      allowRunningInsecureContent: false,
      javascript: true
    },
    icon: path.join(__dirname, '../../assets/icon.png')
  });

  // Set Content Security Policy
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': ["default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';"]
      }
    });
  });

  // Load the React app
  const startUrl = isDev 
    ? 'http://localhost:3000' 
    : `file://${path.join(__dirname, '../renderer/build/index.html')}`;
  
  log.info(`Attempting to load app from: ${startUrl}`);
  
  // Check if the build directory exists in production mode
  if (!isDev) {
    const buildPath = path.join(__dirname, '../renderer/build');
    const indexPath = path.join(buildPath, 'index.html');
    
    if (fs.existsSync(buildPath)) {
      log.info(`Build directory exists at: ${buildPath}`);
      if (fs.existsSync(indexPath)) {
        log.info(`index.html exists at: ${indexPath}`);
        
        // Check if the main.js file exists
        const mainJsPath = path.join(buildPath, 'static/js/main.*.js');
        const mainJsFiles = fs.readdirSync(path.join(buildPath, 'static/js')).filter(file => file.startsWith('main.') && file.endsWith('.js'));
        
        if (mainJsFiles.length > 0) {
          log.info(`Found main.js file: ${mainJsFiles[0]}`);
        } else {
          log.error(`No main.js file found in ${path.join(buildPath, 'static/js')}`);
        }
      } else {
        log.error(`index.html not found at: ${indexPath}`);
      }
    } else {
      log.error(`Build directory not found at: ${buildPath}`);
    }
  }
  
  // In production mode, load the file directly
  if (!isDev) {
    // Uncomment the next line to test JavaScript functionality
    // mainWindow.loadFile(path.join(__dirname, '../renderer/build/test.html'))
    mainWindow.loadFile(path.join(__dirname, '../renderer/build/index.html'), { hash: '/' })
      .catch(err => {
        log.error(`Failed to load file: ${path.join(__dirname, '../renderer/build/index.html')}`, err);
      });
  } else {
    // In development mode, load from localhost
    mainWindow.loadURL(startUrl)
      .catch(err => {
        log.error(`Failed to load URL: ${startUrl}`, err);
        // If loading the development URL fails, try loading the production build
        const prodUrl = `file://${path.join(__dirname, '../renderer/build/index.html')}`;
        log.info(`Attempting to load production build at: ${prodUrl}`);
        mainWindow.loadFile(path.join(__dirname, '../renderer/build/index.html'), { hash: '/' });
      });
  }

  // Open DevTools in development mode - disabled by default
  // To enable DevTools, uncomment the following line
  // if (isDev) {
  //   mainWindow.webContents.openDevTools();
  // }
  // Uncomment the next line to open DevTools in production mode for debugging
  // mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  log.info('Main window created');
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC handlers for communication with the renderer process

// Check if a command exists
ipcMain.handle('check-command', async (event, command) => {
  log.info(`Checking if command exists: ${command}`);
  
  // First check if we have a stored custom path for this tool
  const isKnownTool = ['kubectl', 'helm', 'docker'].includes(command);
  if (isKnownTool && customToolPaths[command]) {
    const customPath = customToolPaths[command];
    log.info(`Using stored custom path for ${command}: ${customPath}`);
    
    return {
      exists: true,
      path: customPath,
      error: null
    };
  }
  
  return new Promise((resolve) => {
    const checkCommand = process.platform === 'win32'
      ? spawn('where', [command])
      : spawn('which', [command]);
    
    let stdout = '';
    let stderr = '';
    
    checkCommand.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    checkCommand.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    checkCommand.on('error', (error) => {
      log.error(`Error checking command ${command}: ${error.message}`);
      
      // If there was an error running which/where, check common locations
      if (isKnownTool && commonToolPaths[process.platform] && commonToolPaths[process.platform][command]) {
        log.info(`Checking common locations for ${command}...`);
        
        for (const commonPath of commonToolPaths[process.platform][command]) {
          log.info(`Checking ${commonPath}...`);
          
          if (fileExists(commonPath)) {
            log.info(`Found ${command} at common location: ${commonPath}`);
            
            // Store this path for future use
            customToolPaths[command] = commonPath;
            
            resolve({
              exists: true,
              path: commonPath,
              error: null
            });
            return;
          }
        }
      }
      
      resolve({
        exists: false,
        error: error.message,
        path: null
      });
    });
    
    checkCommand.on('close', (code) => {
      const exists = code === 0;
      const path = exists ? stdout.trim() : null;
      
      if (exists) {
        log.info(`Command ${command} exists at ${path}`);
        
        // Store this path for future use if it's a known tool
        if (isKnownTool) {
          customToolPaths[command] = path;
          log.info(`Storing path for ${command}: ${path}`);
        }
        
        resolve({
          exists,
          path,
          error: stderr.trim() || null
        });
      } else {
        log.info(`Command ${command} does not exist`);
        
        // Check common locations for known tools
        if (isKnownTool && commonToolPaths[process.platform] && commonToolPaths[process.platform][command]) {
          log.info(`Checking common locations for ${command}...`);
          
          for (const commonPath of commonToolPaths[process.platform][command]) {
            log.info(`Checking ${commonPath}...`);
            
            if (fileExists(commonPath)) {
              log.info(`Found ${command} at common location: ${commonPath}`);
              
              // Store this path for future use
              customToolPaths[command] = commonPath;
              
              resolve({
                exists: true,
                path: commonPath,
                error: null
              });
              return;
            }
          }
        }
        
        resolve({
          exists,
          path,
          error: stderr.trim() || null
        });
      }
    });
  });
});

// Execute a shell command
ipcMain.handle('execute-command', async (event, command, args) => {
  log.info(`Executing command: ${command} ${args.join(' ')}`);
  
  // Check if this is a custom path for a known tool
  const isKnownTool = ['kubectl', 'helm', 'docker'].includes(command);
  
  // If this is a direct path to an executable, store it for future use if it's a known tool name
  if (path.isAbsolute(command)) {
    const toolName = path.basename(command).replace(/\.exe$/i, '');
    if (['kubectl', 'helm', 'docker'].includes(toolName)) {
      customToolPaths[toolName] = command;
      log.info(`Storing custom path for ${toolName}: ${command}`);
    }
  }
  
  // Get the system PATH
  const envPath = process.env.PATH || '';
  log.info(`Current PATH: ${envPath}`);
  
  // Find the command in the PATH
  let commandPath = command;
  
  // Only search for the command in PATH if it's not an absolute path
  if (!path.isAbsolute(command)) {
    // Check if we have a stored custom path for this tool
    if (isKnownTool && customToolPaths[command]) {
      commandPath = customToolPaths[command];
      log.info(`Using stored custom path for ${command}: ${commandPath}`);
    } else {
      try {
        // Check if command exists directly
        const checkCommand = process.platform === 'win32'
          ? await new Promise(resolve => {
              const proc = spawn('where', [command]);
              let output = '';
              proc.stdout.on('data', data => { output += data.toString(); });
              proc.on('close', code => {
                resolve(code === 0 ? output.trim().split('\r\n')[0] : null);
              });
            })
          : await new Promise(resolve => {
              const proc = spawn('which', [command]);
              let output = '';
              proc.stdout.on('data', data => { output += data.toString(); });
              proc.on('close', code => {
                resolve(code === 0 ? output.trim() : null);
              });
            });
        
        if (checkCommand) {
          commandPath = checkCommand;
          log.info(`Found command at: ${commandPath}`);
          
          // Store this path for future use if it's a known tool
          if (isKnownTool) {
            customToolPaths[command] = commandPath;
            log.info(`Storing path for ${command}: ${commandPath}`);
          }
        } else {
          log.warn(`Command not found in PATH: ${command}`);
          
          // Check common locations for known tools
          if (isKnownTool && commonToolPaths[process.platform] && commonToolPaths[process.platform][command]) {
            log.info(`Checking common locations for ${command}...`);
            
            for (const commonPath of commonToolPaths[process.platform][command]) {
              log.info(`Checking ${commonPath}...`);
              
              if (fileExists(commonPath)) {
                log.info(`Found ${command} at common location: ${commonPath}`);
                commandPath = commonPath;
                
                // Store this path for future use
                customToolPaths[command] = commandPath;
                
                break;
              }
            }
            
            // If we still haven't found the command, show error
            if (commandPath === command) {
              log.warn(`${command} not found in common locations`);
              
              // For common commands, suggest installation instructions
              if (command === 'kubectl') {
                return {
                  code: 1,
                  stdout: '',
                  stderr: `kubectl command not found. Please install kubectl and make sure it's in your PATH, or specify the path manually.\n
                  Installation instructions: https://kubernetes.io/docs/tasks/tools/`
                };
              } else if (command === 'helm') {
                return {
                  code: 1,
                  stdout: '',
                  stderr: `helm command not found. Please install Helm and make sure it's in your PATH, or specify the path manually.\n
                  Installation instructions: https://helm.sh/docs/intro/install/`
                };
              } else if (command === 'docker') {
                return {
                  code: 1,
                  stdout: '',
                  stderr: `docker command not found. Please install Docker and make sure it's in your PATH, or specify the path manually.\n
                  Installation instructions: https://docs.docker.com/get-docker/`
                };
              }
            }
          } else {
            // For common commands, suggest installation instructions
            if (command === 'kubectl') {
              return {
                code: 1,
                stdout: '',
                stderr: `kubectl command not found. Please install kubectl and make sure it's in your PATH, or specify the path manually.\n
                Installation instructions: https://kubernetes.io/docs/tasks/tools/`
              };
            } else if (command === 'helm') {
              return {
                code: 1,
                stdout: '',
                stderr: `helm command not found. Please install Helm and make sure it's in your PATH, or specify the path manually.\n
                Installation instructions: https://helm.sh/docs/intro/install/`
              };
            } else if (command === 'docker') {
              return {
                code: 1,
                stdout: '',
                stderr: `docker command not found. Please install Docker and make sure it's in your PATH, or specify the path manually.\n
                Installation instructions: https://docs.docker.com/get-docker/`
              };
            }
          }
        }
      } catch (error) {
        log.error(`Error finding command: ${error.message}`);
      }
    }
  }
  
  return new Promise((resolve) => {
    // Set up environment with PATH
    const env = { ...process.env };
    
    // Log the command being executed
    log.info(`Spawning process: ${commandPath} ${args.join(' ')}`);
    
    const childProcess = spawn(commandPath, args, { env });
    
    let stdout = '';
    let stderr = '';
    
    childProcess.stdout.on('data', (data) => {
      const chunk = data.toString();
      stdout += chunk;
      log.info(`[STDOUT] ${chunk}`);
    });
    
    childProcess.stderr.on('data', (data) => {
      const chunk = data.toString();
      stderr += chunk;
      log.warn(`[STDERR] ${chunk}`);
    });
    
    childProcess.on('error', (error) => {
      log.error(`Process error: ${error.message}`);
      stderr += `Process error: ${error.message}\n`;
    });
    
    childProcess.on('close', (code) => {
      log.info(`Process exited with code: ${code}`);
      resolve({
        code,
        stdout,
        stderr
      });
    });
  });
});

// Save configuration to a file
ipcMain.handle('save-config', async (event, config) => {
  log.info('Saving configuration');
  
  try {
    const userDataPath = app.getPath('userData');
    const configPath = path.join(userDataPath, 'config.json');
    
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    
    return { success: true, path: configPath };
  } catch (error) {
    log.error('Error saving configuration:', error);
    return { success: false, error: error.message };
  }
});

// Load configuration from a file
ipcMain.handle('load-config', async () => {
  log.info('Loading configuration');
  
  try {
    const userDataPath = app.getPath('userData');
    const configPath = path.join(userDataPath, 'config.json');
    
    if (fs.existsSync(configPath)) {
      const configData = fs.readFileSync(configPath, 'utf8');
      return { success: true, config: JSON.parse(configData) };
    } else {
      return { success: false, error: 'Configuration file not found' };
    }
  } catch (error) {
    log.error('Error loading configuration:', error);
    return { success: false, error: error.message };
  }
});

// Show file dialog
ipcMain.handle('show-dialog', async (event, options) => {
  log.info('Showing file dialog');
  
  const result = await dialog.showOpenDialog(mainWindow, options);
  return result;
});

// Function to update step state
function updateStepState(step, status) {
  const userDataPath = app.getPath('userData');
  const configPath = path.join(userDataPath, 'config.json');
  let config = {};

  if (fs.existsSync(configPath)) {
    const configData = fs.readFileSync(configPath, 'utf8');
    config = JSON.parse(configData);
  }

  config[step] = status;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

// Function to check step state
function isStepCompleted(step) {
  const userDataPath = app.getPath('userData');
  const configPath = path.join(userDataPath, 'config.json');

  if (fs.existsSync(configPath)) {
    const configData = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(configData);
    return config[step] === 'completed';
  }
  return false;
}

// Example usage in a step
ipcMain.handle('execute-step', async (event, step) => {
  if (isStepCompleted(step)) {
    log.info(`Step ${step} already completed, skipping.`);
    return { success: true, message: `Step ${step} already completed.` };
  }

  // Execute the step logic here
  // ...

  // Mark step as completed
  updateStepState(step, 'completed');
  return { success: true, message: `Step ${step} completed.` };
});

// Apply manifest from string
ipcMain.handle('apply-manifest-from-string', async (event, manifestContent) => {
  log.info('Applying manifest from string');
  
  try {
    const tempDir = app.getPath('temp');
    const manifestPath = path.join(tempDir, `manifest-${Date.now()}.yaml`);
    
    fs.writeFileSync(manifestPath, manifestContent);
    
    // Find kubectl path - use stored path if available
    let kubectlPath = 'kubectl';
    if (customToolPaths['kubectl']) {
      kubectlPath = customToolPaths['kubectl'];
      log.info(`Using stored kubectl path: ${kubectlPath}`);
    } else {
      // Try to find kubectl in common locations
      log.info('No stored kubectl path, checking common locations...');
      if (commonToolPaths[process.platform] && commonToolPaths[process.platform]['kubectl']) {
        for (const commonPath of commonToolPaths[process.platform]['kubectl']) {
          if (fileExists(commonPath)) {
            kubectlPath = commonPath;
            customToolPaths['kubectl'] = kubectlPath;
            log.info(`Found kubectl at common location: ${kubectlPath}`);
            break;
          }
        }
      }
    }
    
    log.info(`Applying manifest with kubectl at: ${kubectlPath}`);
    const result = await new Promise((resolve) => {
      const childProcess = spawn(kubectlPath, ['apply', '-f', manifestPath]);
      
      let stdout = '';
      let stderr = '';
      
      childProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      childProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      childProcess.on('error', (error) => {
        log.error(`Process error: ${error.message}`);
        stderr += `Process error: ${error.message}\n`;
      });
      
      childProcess.on('close', (code) => {
        resolve({
          code,
          stdout,
          stderr
        });
      });
    });
    
    // Clean up the temporary file
    fs.unlinkSync(manifestPath);
    
    return result;
  } catch (error) {
    log.error('Error applying manifest from string:', error);
    return { 
      code: 1, 
      stdout: '', 
      stderr: error.message 
    };
  }
});

// Install cert-manager using Helm
ipcMain.handle('execute-helm-cert-manager', async () => {
  log.info('Installing cert-manager using Helm');
  
  try {
    // Step 1: Add the Jetstack Helm repository
    log.info('Adding Jetstack Helm repository');
    const addRepo = await new Promise((resolve) => {
      const childProcess = spawn('helm', ['repo', 'add', 'jetstack', 'https://charts.jetstack.io']);
      
      let stdout = '';
      let stderr = '';
      
      childProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      childProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      childProcess.on('close', (code) => {
        resolve({
          code,
          stdout,
          stderr
        });
      });
    });
    
    if (addRepo.code !== 0) {
      throw new Error(`Failed to add Jetstack Helm repository: ${addRepo.stderr}`);
    }
    
    // Step 2: Update Helm repositories
    log.info('Updating Helm repositories');
    const updateRepo = await new Promise((resolve) => {
      const childProcess = spawn('helm', ['repo', 'update']);
      
      let stdout = '';
      let stderr = '';
      
      childProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      childProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      childProcess.on('close', (code) => {
        resolve({
          code,
          stdout,
          stderr
        });
      });
    });
    
    if (updateRepo.code !== 0) {
      throw new Error(`Failed to update Helm repositories: ${updateRepo.stderr}`);
    }
    
    // Step 3: Create cert-manager namespace
    log.info('Creating cert-manager namespace');
    const createNamespace = await new Promise((resolve) => {
      const childProcess = spawn('kubectl', ['create', 'namespace', 'cert-manager', '--dry-run=client', '-o', 'yaml']);
      
      let stdout = '';
      let stderr = '';
      
      childProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      childProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      childProcess.on('close', (code) => {
        resolve({
          code,
          stdout,
          stderr
        });
      });
    });
    
    // Apply the namespace YAML
    if (createNamespace.stdout) {
      const applyNamespace = await new Promise((resolve) => {
        const childProcess = spawn('kubectl', ['apply', '-f', '-'], {
          stdio: ['pipe', 'pipe', 'pipe']
        });
        
        childProcess.stdin.write(createNamespace.stdout);
        childProcess.stdin.end();
        
        let stdout = '';
        let stderr = '';
        
        childProcess.stdout.on('data', (data) => {
          stdout += data.toString();
        });
        
        childProcess.stderr.on('data', (data) => {
          stderr += data.toString();
        });
        
        childProcess.on('close', (code) => {
          resolve({
            code,
            stdout,
            stderr
          });
        });
      });
      
      if (applyNamespace.code !== 0 && !applyNamespace.stderr.includes('already exists')) {
        throw new Error(`Failed to create cert-manager namespace: ${applyNamespace.stderr}`);
      }
    }
    
    // Step 4: Install cert-manager using Helm with CRDs
    log.info('Installing cert-manager using Helm');
    const installCertManager = await new Promise((resolve) => {
      const childProcess = spawn('helm', [
        'install',
        'cert-manager',
        'jetstack/cert-manager',
        '--namespace', 'cert-manager',
        '--create-namespace',
        '--version', 'v1.13.3',  // Use a specific version for consistency
        '--set', 'installCRDs=true',
        '--set', 'extraArgs={--feature-gates=ExperimentalGatewayAPISupport=true}',
        '--set', 'webhook.timeoutSeconds=30',  // Increase webhook timeout
        '--set', 'cainjector.extraArgs={--leader-election-namespace=cert-manager}'  // Ensure CA injector works properly
      ]);
      
      let stdout = '';
      let stderr = '';
      
      childProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      childProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      childProcess.on('close', (code) => {
        resolve({
          code,
          stdout,
          stderr
        });
      });
    });
    
    if (installCertManager.code !== 0) {
      throw new Error(`Failed to install cert-manager: ${installCertManager.stderr}`);
    }
    
    return installCertManager;
  } catch (error) {
    log.error('Error installing cert-manager with Helm:', error);
    return { 
      code: 1, 
      stdout: '', 
      stderr: error.message 
    };
  }
});

// Get platform information
ipcMain.handle('get-platform', () => {
  log.info(`Getting platform information: ${process.platform}`);
  return process.platform;
}); 