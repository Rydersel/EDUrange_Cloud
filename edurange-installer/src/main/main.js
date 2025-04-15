const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');
const log = require('electron-log');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const { exec } = require('child_process');
const { promisify } = require('util');
const { writeFile, unlink } = require('fs/promises');

const execAsync = promisify(exec);

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
  try {
    const { stdout, stderr } = await execAsync(`${command} ${args.join(' ')}`);
    return { code: 0, stdout, stderr };
  } catch (error) {
    return { code: 1, stdout: '', stderr: error.message };
  }
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
ipcMain.handle('apply-manifest-from-string', async (event, manifestYaml) => {
  try {
    // Create a temporary file for the manifest
    const tempFile = path.join(os.tmpdir(), `manifest-${Date.now()}.yaml`);
    await writeFile(tempFile, manifestYaml);

    // Apply the manifest using kubectl
    const { stdout, stderr } = await execAsync(`kubectl apply -f ${tempFile}`);
    
    // Clean up the temporary file
    await unlink(tempFile);

    return { code: 0, stdout, stderr };
  } catch (error) {
    return { code: 1, stdout: '', stderr: error.message };
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