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
  FONT: {
    DEFAULT_SIZE: 14,
    MIN_SIZE: 8,
    MAX_SIZE: 24,
    FAMILY: 'Menlo, Monaco, "Courier New", monospace'
  },
  DIMENSIONS: {
    DEFAULT_COLS: 150,
    DEFAULT_ROWS: 40
  },
  SCROLLBACK: 10000
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
  drawBoldTextInBrightColors: true
};


// Connection Configuration
const CONNECTION_CONFIG = {
  MAX_RECONNECT_ATTEMPTS: 5,
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
    WEBSOCKET: '\x1b[31m[!] WebSocket error: {message}\x1b[0m',
    CONNECTION: '\x1b[31m[!] Failed to connect: {message}\x1b[0m',
    ENV_VARS: '\x1b[31m[!] Failed to fetch environment variables: {message}\x1b[0m'
  }
};


// Global State Variables
let socket = null;
let term = null;
let fitAddon = null;
let webglAddon = null;
let commandCounter = 0;
let reconnectAttempts = 0;
let reconnectTimeout = null;
let lastPod = null;
let lastContainer = null;
let currentFontSize = TERMINAL_CONFIG.FONT.DEFAULT_SIZE;

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
    // Ctrl+Shift+C to copy
    if (event.ctrlKey && event.shiftKey && event.code === 'KeyC') {
      const selection = term.getSelection();
      if (selection) copyToClipboard(selection);
      return false;
    }
    // Ctrl+Shift+F to search
    if (event.ctrlKey && event.shiftKey && event.code === 'KeyF') {
      searchAddon.show();
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
  if (document.visibilityState === 'visible' && socket?.readyState !== WebSocket.OPEN) {
    reconnectAttempts = 0; // Reset attempts when manually triggering reconnect
    if (lastPod && lastContainer) {
      connectToTerminalSession(lastPod, lastContainer);
    }
  }
};

const handleReconnectionAttempt = () => {
  if (reconnectAttempts < CONNECTION_CONFIG.MAX_RECONNECT_ATTEMPTS && lastPod && lastContainer) {
    reconnectAttempts++;
    term.writeln('\r\n');
    term.writeln(NO_CONNECTION_ASCII);
    term.writeln('\r\n' + STATUS_MESSAGES.DISCONNECTED.LOST);
    term.writeln(STATUS_MESSAGES.DISCONNECTED.ATTEMPT
      .replace('{current}', reconnectAttempts)
      .replace('{max}', CONNECTION_CONFIG.MAX_RECONNECT_ATTEMPTS));
    connectToTerminalSession(lastPod, lastContainer);
  } else if (reconnectAttempts >= CONNECTION_CONFIG.MAX_RECONNECT_ATTEMPTS) {
    term.writeln('\r\n');
    term.writeln(NO_CONNECTION_ASCII);
    term.writeln('\r\n' + STATUS_MESSAGES.DISCONNECTED.MAX_ATTEMPTS);
    term.writeln(STATUS_MESSAGES.DISCONNECTED.REFRESH);
    updateConnectionStatusDisplay('Reconnection failed', 'error');
  }
};

const connectToTerminalSession = async (pod, container) => {
  // Store the last connection details for reconnection
  lastPod = pod;
  lastContainer = container;

  if (socket !== null) {
    terminalComponent.innerHTML = "";
    socket.close();
    socket = null;
    await new Promise(resolve => setTimeout(resolve, 1200));
    return connectToTerminalSession(pod, container);
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
    term.writeln(EDURANGE_LOGO);
    term.writeln('');
    term.writeln(NO_CONNECTION_ASCII);
    term.writeln('\r\n' + STATUS_MESSAGES.CONNECTING.INITIAL);
    term.writeln(STATUS_MESSAGES.CONNECTING.ATTEMPT + '\r\n');
  }

  updateConnectionStatusDisplay('Connecting...', 'info');
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const wsUrl = `${protocol}://${window.location.host}/ws?pod=${pod}&container=${container}`;
  
  try {
    socket = new WebSocket(wsUrl);
    
    socket.addEventListener("open", () => {
      reconnectAttempts = 0; // Reset attempts on successful connection
      const attachAddon = new AttachAddon(socket);
      term.loadAddon(attachAddon);
      updateConnectionStatusDisplay('Connected', 'success');
      
      // Clear terminal and show appropriate message based on connection type
      term.clear();
      
      // Show reconnection success message if this was a reconnection
      if (reconnectAttempts > 0) {
        term.writeln(NO_CONNECTION_ASCII);
        term.writeln('\r\n' + STATUS_MESSAGES.CONNECTED.RECONNECTED);
        term.writeln(STATUS_MESSAGES.CONNECTED.READY + '\r\n');
      } else {
        // Show connection established message for first connection
        term.writeln(STATUS_MESSAGES.CONNECTED.SUCCESS + '\r\n');
      }
      
      // Send initial command after connection
      setTimeout(() => {
        socket.send("hostname\n");
      }, CONNECTION_CONFIG.INITIAL_COMMAND_DELAY_MS);
    });

    socket.addEventListener("close", (event) => {
      term.writeln("");
      term.writeln("  \x1b[31m[!] Lost connection\x1b[0m");
      updateConnectionStatusDisplay('Disconnected', 'error');
      
      // Attempt to reconnect after delay
      reconnectTimeout = setTimeout(handleReconnectionAttempt, CONNECTION_CONFIG.RECONNECT_INTERVAL_MS);
    });

    socket.addEventListener("error", (error) => {
      term.writeln("");
      term.writeln(NO_CONNECTION_ASCII);
      term.writeln("");
      term.writeln(STATUS_MESSAGES.ERROR.WEBSOCKET.replace('{message}', error.message));
      updateConnectionStatusDisplay('Connection error', 'error');
    });

  } catch (error) {
    term.writeln("");
    term.writeln(NO_CONNECTION_ASCII);
    term.writeln("");
    term.writeln(`  \x1b[31m[!] Failed to connect: ${error.message}\x1b[0m`);
    updateConnectionStatusDisplay('Connection failed', 'error');
    // Attempt to reconnect after error
    reconnectTimeout = setTimeout(handleReconnectionAttempt, CONNECTION_CONFIG.RECONNECT_INTERVAL_MS);
  }
};

// Update handleResize to include terminal size update
const handleResize = () => {
  if (fitAddon) {
    fitAddon.fit();
    updateTerminalSize();
  }
};

window.addEventListener('resize', handleResize);

// Initialize on load
window.onload = async () => {
  try {
    const response = await fetch('/env');
    const envData = await response.json();
    const { POD_NAME, CONTAINER_NAME } = envData;
    connectToTerminalSession(POD_NAME, CONTAINER_NAME);
  } catch (error) {
    console.error('Error fetching environment variables:', error);
    if (term) {
      term.writeln(`  \x1b[31m[!] Failed to fetch environment variables: ${error.message}\x1b[0m`);
      updateConnectionStatusDisplay('Failed to fetch environment', 'error');
    }
  }
};

// Add visibility change listener
document.addEventListener('visibilitychange', handleVisibilityChange);
