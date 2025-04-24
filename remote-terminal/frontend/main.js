const { Terminal } = require("xterm");
const { AttachAddon } = require("xterm-addon-attach");
const { FitAddon } = require("xterm-addon-fit");
const { WebLinksAddon } = require("xterm-addon-web-links");
const { SearchAddon } = require("xterm-addon-search");
const { Unicode11Addon } = require("xterm-addon-unicode11");
const { SerializeAddon } = require("xterm-addon-serialize");
const { WebglAddon } = require("xterm-addon-webgl");
const copyToClipboard = require("copy-to-clipboard");
const { macosMinimalTheme, solarizedDarkTheme, draculaTheme, oneDarkTheme } = require("./themes");


// DOM Elements
const terminalComponent = document.getElementById("terminal");
const statusIndicator = document.querySelector('.status-indicator');
const connectionStatus = document.getElementById('connection-status');
const rendererType = document.getElementById('renderer-type');
const commandCount = document.getElementById('command-count');
const terminalSize = document.getElementById('terminal-size');

// Terminal Configuration
const TERMINAL_CONFIG = {
  DIMENSIONS: {
    DEFAULT_COLS: 100,
    DEFAULT_ROWS: 24,
    MIN_COLS: 40,
    MIN_ROWS: 10
  },
  FONT: {
    DEFAULT_SIZE: 14,
    MIN_SIZE: 10,
    MAX_SIZE: 24,
    FAMILY: 'monospace, courier-new, courier, monospace'
  },
  SCROLLBACK: 5000
};

const DEFAULT_THEME = {
  ...macosMinimalTheme,
  background: '#000000'
};

const TERMINAL_OPTIONS = {
  cursorBlink: true,
  cursorStyle: 'block',
  fontSize: TERMINAL_CONFIG.FONT.DEFAULT_SIZE,
  fontFamily: TERMINAL_CONFIG.FONT.FAMILY,
  theme: DEFAULT_THEME,
  allowTransparency: true,
  scrollback: TERMINAL_CONFIG.SCROLLBACK,
  cols: TERMINAL_CONFIG.DIMENSIONS.DEFAULT_COLS,
  rows: TERMINAL_CONFIG.DIMENSIONS.DEFAULT_ROWS,
  allowProposedApi: true,
  convertEol: true,
  rightClickSelectsWord: true,
  drawBoldTextInBrightColors: true,
  bracketedPaste: false  // Disable bracketed paste mode
};


// Connection Configuration
const CONNECTION_CONFIG = {
  RECONNECT_ATTEMPTS: 5,
  RECONNECT_INTERVAL_MS: 2000,
  INITIAL_COMMAND_DELAY_MS: 500
};


// ASCII Art and Visual Elements
const EDURANGE_LOGO = `
\x1b[37m
███████╗██████╗ ██╗   ██╗██████╗  █████╗ ███╗   ██╗ ██████╗ ███████╗
██╔════╝██╔══██╗██║   ██║██╔══██╗██╔══██╗████╗  ██║██╔════╝ ██╔════╝
█████╗  ██║  ██║██║   ██║██████╔╝███████║██╔██╗ ██║██║  ███╗█████╗  
██╔══╝  ██║  ██║██║   ██║██╔══██╗██╔══██║██║╚██╗██║██║   ██║██╔══╝  
███████╗██████╔╝╚██████╔╝██║  ██║██║  ██║██║ ╚████║╚██████╔╝███████╗
╚══════╝╚═════╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝ ╚═════╝ ╚══════╝
\x1b[0m
\x1b[36m Welcome to EDURange Cloud Terminal \x1b[0m
`;

const NO_CONNECTION_ASCII = `
\x1b[37m
⠀⠀⠀⠀⠀⠀⠀⣀⣤⣶⣿⠷⠾⠛⠛⠛⠛⠷⠶⢶⣶⣤⣄⡀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⣀⣴⡾⠛⠉⠁⠀⣰⡶⠶⠶⠶⠶⠶⣶⡄⠀⠉⠛⠿⣷⣄⡀⠀⠀⠀
⠀⠀⣠⣾⠟⠁⠀⠀⠀⠀⠀⢸⡇⠀⠀⠀⠀⠀⣼⠃⠀⠀⠀⠀⠈⠛⢿⣦⡀⠀
⢠⣼⠟⠁⠀⠀⠀⠀⣠⣴⣶⣿⡇⠀⠀⠀⠀⠀⣿⣷⣦⣄⠀⠀⠀⠀⠀⠙⣧⡀
⣿⡇⠀⠀⠀⢀⣴⣾⣿⣿⣿⣿⣇⠀⠀⠀⠀⠸⣿⣿⣿⣿⣿⣦⡀⠀⠀⠀⢈⣷
⣿⣿⣦⡀⣠⣾⣿⣿⣿⡿⠟⢻⣿⠀⠀⠀⠀⢠⣿⠻⢿⣿⣿⣿⣿⣆⣀⣠⣾⣿
⠉⠻⣿⣿⣿⣿⣽⡿⠋⠀⠀⠸⣿⠀⠀⠀⠀⢸⡿⠀⠀⠉⠻⣿⣿⣿⣿⣿⠟⠁
⠀⠀⠈⠙⠛⣿⣿⠀⠀⠀⠀⢀⣿⠀⠀⠀⠀⢸⣇⠀⠀⠀⠀⣹⣿⡟⠋⠁⠀⠀
⠀⠀⠀⠀⠀⢿⣿⣷⣄⣀⣴⣿⣿⣤⣤⣤⣤⣼⣿⣷⣀⣀⣾⣿⣿⠇⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠈⠻⢿⣿⣿⣿⣿⣿⠟⠛⠛⠻⣿⣿⣿⣿⣿⡿⠛⠉⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠉⠉⠁⣿⡇⠀⠀⠀⠀⢸⣿⡏⠙⠋⠁⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣿⣷⣄⠀⠀⣀⣾⣿⡇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠙⢿⣿⣿⣿⣿⣿⣏⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀`;


// Status Messages
const STATUS_MESSAGES = {
  CONNECTING: {
    INITIAL: '\x1b[36m[*] Initializing terminal connection...\x1b[0m',
    ATTEMPT: '\x1b[36m[*] Attempting to establish secure connection to pod...\x1b[0m'
  },
  CONNECTED: {
    SUCCESS: '\x1b[32m[✓] Connection established\x1b[0m',
    RECONNECTED: '\x1b[32m[✓] Connection successfully re-established!\x1b[0m',
    READY: '\x1b[32m[✓] Terminal ready for input\x1b[0m'
  },
  DISCONNECTED: {
    LOST: '\x1b[31m[*] Connection lost. Attempting to restore connection...\x1b[0m',
    ATTEMPT: '\x1b[31m[*] Reconnection attempt {current}/{max}\x1b[0m',
    MAX_ATTEMPTS: '\x1b[31m[!] Maximum reconnection attempts reached.\x1b[0m',
    REFRESH: '\x1b[31m[!] Please refresh the page to try again.\x1b[0m'
  },
  ERROR: {
    WEBSOCKET: '\x1b[31m[!] Connection error: {message}\x1b[0m',
    CONNECTION: '\x1b[31m[!] Failed to connect: {message}\x1b[0m',
    ENV_VARS: '\x1b[31m[!] Failed to fetch environment variables: {message}\x1b[0m'
  }
};


// Global State Variables
let term = null;
let fitAddon = null;
let webglAddon = null;
let commandCounter = 0;
let reconnectAttempts = 0;
let reconnectTimeout = null;
let lastPod = null;
let lastContainer = null;
let currentFontSize = TERMINAL_CONFIG.FONT.DEFAULT_SIZE;
let sessionId = null;
let eventSource = null;
let lastCtrlCTime = 0; // Track last Ctrl+C time for debouncing

const updateConnectionStatusDisplay = (message, type = 'info') => {
  connectionStatus.textContent = message;
  statusIndicator.className = 'status-indicator';
  if (type === 'success') {
    statusIndicator.classList.add('connected');
  } else if (type === 'error') {
    statusIndicator.classList.add('disconnected');
  }
  document.querySelector('.status-bar').className = `status-bar status-${type}`;
};

const updateTerminalSize = () => {
  if (term) {
    const { rows, cols } = term;
    terminalSize.textContent = `Size: ${cols}x${rows}`;
  }
};

const updateCommandCount = () => {
  commandCount.textContent = `Commands: ${commandCounter}`;
};

const updateFontSize = () => {
  if (term) {
    document.getElementById('font-size').textContent = `${currentFontSize}px`;
  }
};

const initializeTerminal = () => {
  term = new Terminal(TERMINAL_OPTIONS);
  
  // Initialize addons
  fitAddon = new FitAddon();
  const webLinksAddon = new WebLinksAddon();
  const searchAddon = new SearchAddon();
  const unicode11Addon = new Unicode11Addon();
  const serializeAddon = new SerializeAddon();

  // Try to load WebGL addon
  try {
    webglAddon = new WebglAddon();
    webglAddon.onContextLoss(e => {
      console.warn('WebGL context lost - falling back to canvas renderer', e);
      webglAddon.dispose();
      updateConnectionStatusDisplay('WebGL disabled - using canvas renderer', 'warning');
      rendererType.textContent = 'Renderer: Canvas';
    });
    term.loadAddon(webglAddon);
    updateConnectionStatusDisplay('WebGL enabled', 'success');
    rendererType.textContent = 'Renderer: WebGL';
  } catch (e) {
    console.warn('WebGL initialization failed - falling back to canvas renderer', e);
    updateConnectionStatusDisplay('WebGL not available - using canvas renderer', 'warning');
    rendererType.textContent = 'Renderer: Canvas';
  }

  // Load other addons
  term.loadAddon(fitAddon);
  term.loadAddon(webLinksAddon);
  term.loadAddon(searchAddon);
  term.loadAddon(unicode11Addon);
  term.loadAddon(serializeAddon);

  // Open terminal
  term.open(terminalComponent);
  fitAddon.fit();
  updateTerminalSize();
  updateFontSize();

  // Track commands
  term.onData(data => {
    if (data === '\r') { // Enter key
      commandCounter++;
      updateCommandCount();
    }
  });

  // Setup keyboard event handlers
  term.attachCustomKeyEventHandler((event) => {
    // Only handle keydown events for special keys
    if (event.type !== 'keydown') {
      return true;
    }

    // Ctrl+Shift+C to copy
    if (event.ctrlKey && event.shiftKey && event.code === 'KeyC') {
      const selection = term.getSelection();
      if (selection) copyToClipboard(selection);
      event.preventDefault();
      event.stopPropagation();
      return false;
    }
    // Ctrl+Shift+F to search
    if (event.ctrlKey && event.shiftKey && event.code === 'KeyF') {
      searchAddon.show();
      event.preventDefault();
      event.stopPropagation();
      return false;
    }
    // Ctrl+C to interrupt (when no text is selected)
    if ((event.ctrlKey || event.metaKey) && event.code === 'KeyC' && !term.hasSelection()) {
      // Prevent default browser behavior
      event.preventDefault();
      event.stopPropagation();
      
      // Debounce multiple rapid Ctrl+C presses
      const now = Date.now();
      if (now - lastCtrlCTime < 300) { // Ignore if less than 300ms since last Ctrl+C
        return false;
      }
      lastCtrlCTime = now;
      
      // Send the interrupt character exactly once
      if (sessionId) {
        fetch(`/terminal/input/${sessionId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ data: '\x03' }) // Send ETX character (Ctrl+C)
        }).catch(error => {
          console.error('Error sending interrupt signal:', error);
        });
      }
      return false;
    }
    // Ctrl+U to clear line (delete from cursor to beginning of line)
    if (event.ctrlKey && event.code === 'KeyU') {
      event.preventDefault();
      event.stopPropagation();
      
      if (sessionId) {
        fetch(`/terminal/input/${sessionId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ data: '\x15' }) // Send NAK character (Ctrl+U)
        }).catch(error => {
          console.error('Error sending clear line signal:', error);
        });
      }
      return false;
    }
    // Tab key for autocomplete
    if (event.key === 'Tab') {
      // Send tab character to terminal
      if (sessionId) {
        fetch(`/terminal/input/${sessionId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: '\t' })
        }).catch(error => {
          console.error('Error sending tab character:', error);
        });
      }
      event.preventDefault();
      event.stopPropagation();
      return false;
    }
    return true;
  });

  // Setup font size controls
  document.getElementById('font-increase').addEventListener('click', () => {
    currentFontSize = Math.min(currentFontSize + 1, TERMINAL_CONFIG.FONT.MAX_SIZE);
    term.options.fontSize = currentFontSize;
    fitAddon.fit();
    updateFontSize();
  });

  document.getElementById('font-decrease').addEventListener('click', () => {
    currentFontSize = Math.max(currentFontSize - 1, TERMINAL_CONFIG.FONT.MIN_SIZE);
    term.options.fontSize = currentFontSize;
    fitAddon.fit();
    updateFontSize();
  });

  return term;
};

const handleVisibilityChange = () => {
  if (document.visibilityState === 'visible' && !eventSource && sessionId) {
    // Try to reconnect to the existing session
    fetch(`/terminal/status/${sessionId}`)
      .then(response => {
        if (response.ok) {
          // Session still exists, reconnect
          connectToTerminalSession(lastPod, lastContainer);
        } else {
          // Session doesn't exist, create a new one
          sessionId = null;
          connectToTerminalSession(lastPod, lastContainer);
        }
      })
      .catch(() => {
        // Error checking session, try to create a new one
        sessionId = null;
        connectToTerminalSession(lastPod, lastContainer);
      });
  }
};

const handleReconnectionAttempt = () => {
  reconnectAttempts++;

  if (reconnectAttempts <= CONNECTION_CONFIG.RECONNECT_ATTEMPTS) {
    term.writeln(
      STATUS_MESSAGES.DISCONNECTED.ATTEMPT
        .replace('{current}', reconnectAttempts)
        .replace('{max}', CONNECTION_CONFIG.RECONNECT_ATTEMPTS)
    );
    connectToTerminalSession(lastPod, lastContainer);
  } else {
    term.writeln(STATUS_MESSAGES.DISCONNECTED.MAX_ATTEMPTS);
    term.writeln(STATUS_MESSAGES.DISCONNECTED.REFRESH);
    updateConnectionStatusDisplay('Connection lost', 'error');
  }
};

const connectToTerminalSession = async (pod, container) => {
  // Store the last connection details for reconnection
  lastPod = pod;
  lastContainer = container;

  // Close existing EventSource if it exists
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }

  // Initialize terminal if not already done
  if (!term) {
    term = initializeTerminal();
  }

  // Clear any existing reconnection timeouts
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  // Display the EDURange logo only on first connect
  if (reconnectAttempts === 0) {
    term.clear();
    // Skip displaying the logo and connecting messages
  }

  updateConnectionStatusDisplay('Connecting...', 'info');

  try {
    // Create a new terminal session
    const createResponse = await fetch('/terminal/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        pod,
        container,
        cols: term.cols,
        rows: term.rows
      })
    });

    if (!createResponse.ok) {
      const errorData = await createResponse.json();
      throw new Error(errorData.error || `HTTP error! status: ${createResponse.status}`);
    }

    const sessionData = await createResponse.json();
    sessionId = sessionData.sessionId;

    // Set up event source for terminal output
    eventSource = new EventSource(`/terminal/output/${sessionId}`);
    
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.data) {
        term.write(data.data);
      }
    };

    eventSource.onopen = () => {
      reconnectAttempts = 0; // Reset attempts on successful connection
      updateConnectionStatusDisplay('Connected', 'success');
      
      if (reconnectAttempts > 0) {
        term.writeln(STATUS_MESSAGES.CONNECTED.RECONNECTED);
        term.writeln(STATUS_MESSAGES.CONNECTED.READY + '\r\n');
      } else {
        term.writeln(STATUS_MESSAGES.CONNECTED.SUCCESS + '\r\n');
        
        // Clear the terminal after connection is established
        setTimeout(() => {
          term.clear();
          
          // Send a command to the terminal to display the prompt
          if (sessionId) {
            fetch(`/terminal/input/${sessionId}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ data: '\r' })
            }).catch(error => {
              console.error('Error sending initial prompt:', error);
            });
          }
        }, 1000); // Wait 1 second before clearing
      }
    };

    eventSource.onerror = (error) => {
      console.error('EventSource error:', error);
      eventSource.close();
      eventSource = null;
      
      term.writeln('\r\n' + STATUS_MESSAGES.DISCONNECTED.LOST);
      updateConnectionStatusDisplay('Disconnected', 'error');
      
      // Attempt to reconnect after delay
      reconnectTimeout = setTimeout(handleReconnectionAttempt, CONNECTION_CONFIG.RECONNECT_INTERVAL_MS);
    };

    // Set up terminal input handling
    term.onData((data) => {
      if (sessionId) {
        fetch(`/terminal/input/${sessionId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ data })
        }).catch(error => {
          console.error('Error sending terminal input:', error);
        });
        
        // Increment command counter if Enter key is pressed
        if (data === '\r' || data === '\n') {
          commandCounter++;
          updateCommandCount();
        }
      }
    });

    // Initial terminal resize
    handleResize();

  } catch (error) {
    console.error('Error connecting to terminal session:', error);
    term.writeln("");
    term.writeln("");
    term.writeln(STATUS_MESSAGES.ERROR.CONNECTION.replace('{message}', error.message));
    updateConnectionStatusDisplay('Connection failed', 'error');
    
    // Attempt to reconnect after error
    reconnectTimeout = setTimeout(handleReconnectionAttempt, CONNECTION_CONFIG.RECONNECT_INTERVAL_MS);
  }
};

// Update handleResize to include terminal size update
const handleResize = () => {
  if (fitAddon && term) {
    fitAddon.fit();
    updateTerminalSize();

    // Send new terminal dimensions to server
    if (sessionId) {
      fetch(`/terminal/resize/${sessionId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          cols: term.cols,
          rows: term.rows
        })
      }).catch(error => {
        console.error('Error resizing terminal:', error);
      });
    }
  }
};

// Load environment variables
const loadEnvironmentVariables = async () => {
  try {
    const response = await fetch('/env');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return {
      pod: data.POD_NAME,
      container: data.CONTAINER_NAME
    };
  } catch (error) {
    console.error('Error fetching environment variables:', error);
    term.writeln(STATUS_MESSAGES.ERROR.ENV_VARS.replace('{message}', error.message));
    throw error;
  }
};

// Main initialization function
const initializeApplication = async () => {
  try {
    // Load environment variables
    const env = await loadEnvironmentVariables();
    
    // Initialize terminal and connect to session
    await connectToTerminalSession(env.pod, env.container);
    
    // Set up event listeners
    window.addEventListener('resize', handleResize);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Set up font size controls
    // ... existing code for font size controls ...
    
  } catch (error) {
    console.error('Error initializing application:', error);
    if (term) {
      term.writeln(`\r\n\x1b[31m[!] Initialization error: ${error.message}\x1b[0m`);
    }
  }
};

// Clean up function for page unload
const cleanupSession = () => {
  if (sessionId) {
    // Use the sendBeacon API for reliable delivery during page unload
    navigator.sendBeacon(`/terminal/close/${sessionId}`);
  }
  
  if (eventSource) {
    eventSource.close();
  }
};

// Initialize on page load
window.addEventListener('load', initializeApplication);
window.addEventListener('beforeunload', cleanupSession);

