const express = require("express");
const app = express();
const http = require("http");
const env = require("./env");
const bodyParser = require("body-parser");
const pty = require("node-pty");

// Import the unified security module
const security = require("./security");

// Import network adaptation module
const networkAdaptation = require("./network-adaptation");

// Import performance monitoring module
const perfMonitor = require("./performance-monitor");

// Initialize terminal sessions storage
const terminalSessions = {};

// Pre-compiled control sequence detection pattern for performance
const CONTROL_SEQUENCE_PATTERN = /(\x1b[\[\]OP\\_\^]([0-9;:]*|\?[0-9;:]*|\![0-9;:]*)[@-~A-Za-z]|\x1b[@-Z\\-_]|\x1b[\[\]]\d*\;?\d*[\x07\x1b\\])/;

/**
 * Terminal control sequence detection
 * Detects a comprehensive set of terminal control sequences for optimal responsiveness
 * @param {string} data - Terminal output data to check
 * @returns {boolean} - Whether control sequences were detected
 */
const hasControlSequences = (data) => {
  // Early return if no escape character is present (optimization)
  if (data.indexOf('\x1b') === -1) return false;

  // For large chunks, only test portions with ESC
  if (data.length > 256) {
    const chunks = data.split('\x1b');
    if (chunks.length > 1) {
      // ESC was found, check if it forms a control sequence (test only the first 20 chars after ESC)
      return chunks.some((chunk, index) =>
        index > 0 && CONTROL_SEQUENCE_PATTERN.test('\x1b' + chunk.substring(0, 20)));
    }
    return false;
  }

  // Standard test for smaller chunks
  return CONTROL_SEQUENCE_PATTERN.test(data);
};

// Terminal optimization constants
const TERMINAL_BATCH = {
  FLUSH_THRESHOLD: 8192,    // 8KB batch size threshold
  MAX_DELAY: 50,            // Maximum milliseconds to hold data
  MIN_DELAY: 12,            // Optimal milliseconds between flushes
  HIGH_ACTIVITY_THRESHOLD: 10, // Number of rapid updates that indicates high activity
};

// Configure Express
app.use(bodyParser.json());
app.use(express.static("public"));
app.use("/static", express.static("public/static"));

// Apply security middlewares
app.use(security.applyGeneralRateLimiting);
app.use(security.applySecurityHeaders);
app.use(security.applyCorsHeaders);

// Create standard HTTP server - we'll let the ingress/load balancer handle TLS and HTTP/2
let server = http.createServer(app);

// Listen for connections
server.on('connection', (socket) => {
  // Optimize socket for reduced latency
  socket.setNoDelay(true);
});

// Environment variables endpoint for client
app.get("/env", (req, res) => {
  res.json({
    POD_NAME: env.POD_NAME,
    CONTAINER_NAME: env.CONTAINER_NAME,
  });
});

// Create a new terminal session
app.post("/terminal/create", async (req, res) => {
  try {
    // Apply terminal creation rate limiting
    const clientIP = req.ip || req.socket.remoteAddress || 'unknown';
    const rateLimitResult = await security.applyTerminalCreateRateLimiting(clientIP);

    if (!rateLimitResult.success) {
      return res.status(rateLimitResult.status).json({
        success: false,
        error: rateLimitResult.error,
        retryAfter: rateLimitResult.retryAfter
      });
    }

    const { cols = 80, rows = 24 } = req.body;
    const pod = req.body.pod || env.POD_NAME;
    const container = req.body.container || env.CONTAINER_NAME;

    // Validate pod and container names
    const validationResult = security.validateTerminalParams(pod, container);
    if (!validationResult.success) {
      return res.status(validationResult.status).json({
        success: false,
        error: validationResult.error
      });
    }

    console.log(`Creating terminal session for pod: ${pod}, container: ${container}`);

    // Generate a unique session ID
    const sessionId = `term_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // Create a new terminal process using node-pty
    const term = pty.spawn("kubectl", [
      "exec",
      "-it",
      `-c=${container}`,
      pod,
      "--",
      "/bin/bash",
      "-c",
      "export HISTSIZE=1000 HISTFILESIZE=2000 HISTCONTROL=ignoredups; " +
      "export TERM=xterm-256color; " +
      "export VIM_TERMINAL=1; " +
      "echo 'PS1=\"\\[\\e[32m\\]\\u\\[\\e[0m\\]:\\[\\e[94m\\]\\w\\[\\e[0m\\] $ \"' > ~/.bashrc; " +
      // Improve vim experience
      "echo 'set nocompatible' > ~/.vimrc; " +
      "echo 'set backspace=indent,eol,start' >> ~/.vimrc; " +
      "echo 'set term=xterm-256color' >> ~/.vimrc; " +
      "echo 'set t_Co=256' >> ~/.vimrc; " +
      "echo 'set timeout timeoutlen=1000 ttimeoutlen=100' >> ~/.vimrc; " +
      "echo 'set encoding=utf-8' >> ~/.vimrc; " +
      "echo 'set ttyfast' >> ~/.vimrc; " +
      "echo 'set visualbell' >> ~/.vimrc; " +
      "echo 'set mouse=' >> ~/.vimrc; " +
      "[ -f ~/.inputrc ] && echo -e '\"\\e[A\": history-search-backward\\n\"\\e[B\": history-search-forward' >> ~/.inputrc || " +
      "echo -e '\"\\e[A\": history-search-backward\\n\"\\e[B\": history-search-forward' > ~/.inputrc; " +
      "[ -f /etc/bash_completion ] && source /etc/bash_completion; " +
      "TERM=xterm-256color exec bash --login || TERM=xterm-256color exec sh"
    ], {
      name: "xterm-256color",
      cols: cols,
      rows: rows,
      env: Object.assign({}, process.env, {
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
        VIM_TERMINAL: "1",
        LANG: "en_US.UTF-8",
        LC_ALL: "en_US.UTF-8",
        EDITOR: "vim"
      })
    });

    // Store output chunks to be sent to the client
    const outputBuffer = [];

    // When terminal produces output, store it in the buffer
    term.onData((data) => {
      outputBuffer.push({
        timestamp: Date.now(),
        data: data
      });
      // Limit buffer size to prevent memory issues
      if (outputBuffer.length > 1000) {
        outputBuffer.shift();
      }
    });

    // Store the terminal session
    terminalSessions[sessionId] = {
      term,
      outputBuffer,
      lastAccessed: Date.now(),
      pod,
      container,
      clients: new Set(),
      commandCounter: 0,
      totalBytesSent: 0
    };

    // Record session creation in performance metrics
    perfMonitor.recordSessionEvent('create');

    // Schedule cleanup of idle sessions
    setupSessionCleanup();

    res.json({
      success: true,
      sessionId,
      message: "Terminal session created successfully"
    });
  } catch (error) {
    console.error(`Error creating terminal session: ${error.message}`);
    res.status(500).json({
      success: false,
      error: `Failed to create terminal session: ${error.message}`
    });
  }
});

// Process terminal input
app.post("/terminal/input/:sessionId", async (req, res) => {
  const sessionId = req.params.sessionId;
  const session = terminalSessions[sessionId];

  if (!session) {
    return res.status(404).json({ error: "Terminal session not found" });
  }

  // Apply input rate limiting
  const clientIP = req.ip || req.socket.remoteAddress || 'unknown';
  const rateLimitResult = await security.applyInputRateLimiting(clientIP, sessionId);

  if (!rateLimitResult.success) {
    return res.status(rateLimitResult.status).json({
      success: false,
      error: rateLimitResult.error,
      retryAfter: rateLimitResult.retryAfter
    });
  }

  // Update last accessed time
  session.lastAccessed = Date.now();

  // Get the input data from the request
  const { data, isSignal } = req.body;

  // Validate input data
  const validationResult = security.validateInputData(data);
  if (!validationResult.success) {
    return res.status(validationResult.status).json({
      success: false,
      error: validationResult.error
    });
  }

  try {
    // Create a unique command ID for tracking
    session.commandCounter = (session.commandCounter || 0) + 1;
    const commandId = `cmd_${Date.now()}_${session.commandCounter}`;

    // Start tracking this command for performance metrics
    perfMonitor.startCommandTracking(sessionId, commandId);

    // Attach command ID to session for output tracking
    session.currentCommandId = commandId;

    // Direct passthrough of data for vim support
    session.term.write(data);

    // Respond immediately to reduce latency
    res.json({ success: true });
  } catch (error) {
    console.error(`Error writing to terminal: ${error.message}`);
    res.status(500).json({
      success: false,
      error: `Failed to write to terminal: ${error.message}`
    });
  }
});

// Resize terminal
app.post("/terminal/resize/:sessionId", (req, res) => {
  const sessionId = req.params.sessionId;
  const session = terminalSessions[sessionId];

  if (!session) {
    return res.status(404).json({ error: "Terminal session not found" });
  }

  // Update last accessed time
  session.lastAccessed = Date.now();

  // Get dimensions from request
  const { cols, rows } = req.body;

  // Validate resize parameters
  const validationResult = security.validateResizeParams(cols, rows);
  if (!validationResult.success) {
    return res.status(validationResult.status).json({
      success: false,
      error: validationResult.error
    });
  }

  try {
    // Resize the terminal
    session.term.resize(validationResult.cols, validationResult.rows);
    res.json({ success: true });
  } catch (error) {
    console.error(`Error resizing terminal: ${error.message}`);
    res.status(500).json({
      success: false,
      error: `Failed to resize terminal: ${error.message}`
    });
  }
});

// SSE endpoint for terminal output streaming
app.get("/terminal/output/:sessionId", (req, res) => {
  const sessionId = req.params.sessionId;
  const session = terminalSessions[sessionId];

  if (!session) {
    return res.status(404).json({ error: "Terminal session not found" });
  }

  // Update last accessed time
  session.lastAccessed = Date.now();

  // Check if using HTTP/2
  const isHttp2 = req.httpVersion === '2.0';

  // Set headers for either HTTP/2 or HTTP/1.1 SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", isHttp2 ? undefined : "keep-alive");

  // Optimize for reduced latency
  res.setHeader("X-Accel-Buffering", "no"); // Disable Nginx buffering if present

  // Set a longer timeout for the connection
  if (req.socket) {
    req.socket.setTimeout(0); // Disable timeout

    // Disable any Node.js internal buffering for this response
    if (typeof req.socket.setNoDelay === 'function') {
      req.socket.setNoDelay(true);
    }
  }

  // Disable any Node.js internal buffering for this response
  if (res.socket && typeof res.socket.setNoDelay === 'function') {
    res.socket.setNoDelay(true);
  }

  // HTTP/2 specific optimizations
  if (isHttp2) {
    // Set stream priority to high for terminal output
    if (res.stream && typeof res.stream.priority === 'function') {
      res.stream.priority({ weight: 256, exclusive: false });
    }
  }

  // Initialize or get network metrics for this session
  if (!session.networkMetrics) {
    session.networkMetrics = networkAdaptation.createNetworkMetrics();
    console.log(`Initialized network adaptation for session ${sessionId}`);
  }

  // Send any buffered output immediately
  const initialData = session.outputBuffer
    .filter(item => item.timestamp > Date.now() - 5000) // Last 5 seconds of output
    .map(item => item.data).join("");

  if (initialData) {
    res.write(`data: ${JSON.stringify({ data: initialData })}\n\n`);
    // Force a flush to ensure data is sent immediately
    if (typeof res.flush === 'function') res.flush();
  }

  // Keep track of this client
  const clientId = Date.now().toString();
  session.clients.add(clientId);

  // Create batching buffer for this client
  const dataBuffer = {
    data: [],
    totalSize: 0,
    lastFlushTime: Date.now(),
    timer: null,
    activityCounter: 0
  };

  // Function to flush the buffer and send data to client
  const flushBuffer = () => {
    if (dataBuffer.data.length === 0) return;

    const flushStartTime = Date.now();

    // Join all data and send as one event
    const payload = dataBuffer.data.join('');
    res.write(`data: ${JSON.stringify({ 
      data: payload,
      _rttMeasure: session.networkMetrics.shouldMeasure() ? flushStartTime : undefined 
    })}\n\n`);

    // Force flush to client
    if (typeof res.flush === 'function') res.flush();

    // Track bytes sent for this session
    session.totalBytesSent = (session.totalBytesSent || 0) + payload.length;

    // Determine flush reason
    let flushReason = 'timeout'; // Default
    if (dataBuffer.flushReason === 'control') {
      flushReason = 'control';
    } else if (dataBuffer.flushReason === 'size') {
      flushReason = 'size';
    }

    // Record batch flush in performance metrics
    perfMonitor.recordBatchFlush(payload.length, flushReason);

    // If this is a response to a command, track it
    if (session.currentCommandId) {
      perfMonitor.endCommandTracking(sessionId, session.currentCommandId, payload.length);
      session.currentCommandId = null;
    }

    // Update bandwidth estimate
    const flushEndTime = Date.now();
    const timeTaken = flushEndTime - flushStartTime;

    if (timeTaken > 0 && payload.length > 0) {
      try {
        session.networkMetrics.updateBandwidthEstimate(payload.length, timeTaken);
      } catch (e) {
        console.error(`Error updating bandwidth estimate: ${e.message}`);
      }
    }

    // Reset buffer state
    dataBuffer.data = [];
    dataBuffer.totalSize = 0;
    dataBuffer.lastFlushTime = Date.now();
    dataBuffer.timer = null;
    dataBuffer.flushReason = null;
    dataBuffer.activityCounter = Math.max(0, dataBuffer.activityCounter - 5); // Decrease activity counter
  };

  // Function to add data to buffer with intelligent batching
  const addToBuffer = (data) => {
    // Add to buffer
    dataBuffer.data.push(data);
    dataBuffer.totalSize += data.length;
    dataBuffer.activityCounter++;

    // Get optimal delay from network metrics if available, or use default
    let currentDelay = TERMINAL_BATCH.MIN_DELAY;

    try {
      // Use network adaptation if available and not in fallback mode
      if (session.networkMetrics && !session.networkMetrics.isUsingFallback) {
        currentDelay = session.networkMetrics.getOptimalDelay();
        // Record adaptation event in performance metrics
        perfMonitor.recordAdaptationEvent('adaptation');
      } else {
        // Fallback: Use activity-based batching
        if (dataBuffer.activityCounter > TERMINAL_BATCH.HIGH_ACTIVITY_THRESHOLD) {
          currentDelay = TERMINAL_BATCH.MIN_DELAY * 1.5;
        }
      }
    } catch (e) {
      console.error(`Error getting optimal delay: ${e.message}`);
      // Fall back to default on error
      currentDelay = TERMINAL_BATCH.MIN_DELAY;
    }

    // Clear existing timer if any
    if (dataBuffer.timer) {
      clearTimeout(dataBuffer.timer);
    }

    // Get optimal batch size from network metrics or use default
    let flushThreshold = TERMINAL_BATCH.FLUSH_THRESHOLD;
    try {
      if (session.networkMetrics && !session.networkMetrics.isUsingFallback) {
        flushThreshold = session.networkMetrics.getOptimalBatchSize();
      }
    } catch (e) {
      console.error(`Error getting optimal batch size: ${e.message}`);
    }

    // Set conditions for immediate flush
    const shouldFlushImmediately =
      dataBuffer.totalSize >= flushThreshold || // Size threshold exceeded
      (Date.now() - dataBuffer.lastFlushTime) > TERMINAL_BATCH.MAX_DELAY; // Max delay exceeded

    // This maintains vim, tmux, and other terminal app responsiveness
    const hasControlSequence = hasControlSequences(data);

    if (shouldFlushImmediately || hasControlSequence) {
      // Record flush reason
      if (hasControlSequence) {
        dataBuffer.flushReason = 'control';
      } else if (dataBuffer.totalSize >= flushThreshold) {
        dataBuffer.flushReason = 'size';
      } else {
        dataBuffer.flushReason = 'timeout';
      }

      flushBuffer();
    } else {
      // Schedule a flush
      dataBuffer.timer = setTimeout(flushBuffer, currentDelay);
    }
  };

  // Set up data handler for new output
  const dataHandler = (data) => {
    addToBuffer(data);
  };

  // Add event listener
  session.term.onData(dataHandler);

  // Send a keepalive every 10 seconds to prevent connection timeouts
  // For HTTP/2 we can use a longer interval
  const keepaliveInterval = setInterval(() => {
    res.write(`:keepalive\n\n`);
    if (typeof res.flush === 'function') res.flush();
  }, isHttp2 ? 30000 : 10000);

  // Handle client disconnect
  req.on("close", () => {
    clearInterval(keepaliveInterval);
    session.term.removeListener("data", dataHandler);
    session.clients.delete(clientId);

    // Clear any pending flush timer
    if (dataBuffer.timer) {
      clearTimeout(dataBuffer.timer);
    }

    console.log(`Client ${clientId} disconnected from session ${sessionId}`);
  });

  // Send initial connection message
  const connectionTypeMsg = isHttp2 ? "HTTP/2" : "HTTP streaming";
  addToBuffer(`\r\n\x1b[32m[✓] Connection established through ${connectionTypeMsg}\x1b[0m\r\n`);

  // Clear the connection message after a brief delay to prevent double prompts
  setTimeout(() => {
    addToBuffer("\x1b[1A\x1b[2K"); // Move up one line and clear it
  }, 500);
});

// Terminal session status
app.get("/terminal/status/:sessionId", (req, res) => {
  const sessionId = req.params.sessionId;
  const session = terminalSessions[sessionId];

  if (!session) {
    return res.status(404).json({ error: "Terminal session not found" });
  }

  // Update last accessed time
  session.lastAccessed = Date.now();

  res.json({
    success: true,
    active: true,
    clients: session.clients.size,
    lastAccessed: session.lastAccessed,
    pod: session.pod,
    container: session.container
  });
});

// Lightweight heartbeat endpoint to keep sessions alive
app.get("/terminal/heartbeat/:sessionId", (req, res) => {
  const sessionId = req.params.sessionId;
  const session = terminalSessions[sessionId];

  if (!session) {
    return res.status(404).json({ error: "Terminal session not found" });
  }

  // Just update last accessed time
  session.lastAccessed = Date.now();

  // Send minimal response
  res.json({ success: true });
});

// Close terminal session
app.post("/terminal/close/:sessionId", (req, res) => {
  const sessionId = req.params.sessionId;
  const session = terminalSessions[sessionId];

  if (!session) {
    return res.status(404).json({ error: "Terminal session not found" });
  }

  try {
    // Record session closure in performance metrics
    perfMonitor.recordSessionEvent('close');

    // Kill the terminal process
    session.term.kill();
    // Remove the session
    delete terminalSessions[sessionId];

    res.json({ success: true, message: "Terminal session closed" });
  } catch (error) {
    console.error(`Error closing terminal session: ${error.message}`);
    res.status(500).json({
      success: false,
      error: `Failed to close terminal session: ${error.message}`
    });
  }
});

// Cleanup function for idle sessions
function setupSessionCleanup() {
  // Check for idle sessions every 5 minutes
  const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
  const MAX_IDLE_TIME = 60 * 60 * 1000;   // 1 hour

  setInterval(() => {
    const now = Date.now();

    Object.keys(terminalSessions).forEach(sessionId => {
      const session = terminalSessions[sessionId];

      // If session has been idle for too long and has no connected clients
      if (now - session.lastAccessed > MAX_IDLE_TIME && session.clients.size === 0) {
        console.log(`Cleaning up idle terminal session: ${sessionId}`);

        try {
          session.term.kill();
        } catch (e) {
          console.error(`Error killing terminal process: ${e.message}`);
        }

        delete terminalSessions[sessionId];
      }
    });
  }, CLEANUP_INTERVAL);
}

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "OK" });
});

// RTT measurement endpoint
app.get("/terminal/ping/:sessionId", (req, res) => {
  const sessionId = req.params.sessionId;
  const session = terminalSessions[sessionId];

  if (!session) {
    return res.status(404).json({ error: "Terminal session not found" });
  }

  // Send a timestamp in the response
  res.json({
    timestamp: Date.now(),
    pong: true
  });
});

// RTT reporting endpoint
app.post("/terminal/report-rtt/:sessionId", async (req, res) => {
  const sessionId = req.params.sessionId;
  const session = terminalSessions[sessionId];

  if (!session) {
    return res.status(404).json({ error: "Terminal session not found" });
  }

  // Apply rate limiting for RTT measurements
  const clientIP = req.ip || req.socket.remoteAddress || 'unknown';
  const rateLimitResult = await security.applyGeneralRateLimiting(req, res, () => {});

  if (rateLimitResult) {
    return;
  }

  try {
    const { rtt, timestamp, clientProcessingTime = 0, measurementId } = req.body;

    // Update network metrics
    if (session.networkMetrics) {
      // Record measurement received in performance metrics
      perfMonitor.recordAdaptationEvent('measurement');

      let success = false;

      if (measurementId) {
        // Complete a pending measurement
        const result = session.networkMetrics.completeMeasurement(measurementId, clientProcessingTime);
        success = result > 0;
      } else if (rtt) {
        // Direct RTT measurement from client
        success = session.networkMetrics.addRttSample(rtt);
      }

      if (!success) {
        // Record failed measurement in performance metrics
        perfMonitor.recordAdaptationEvent('failed');
      } else if (session.networkMetrics.isUsingFallback) {
        // Record fallback status in performance metrics
        perfMonitor.recordAdaptationEvent('fallback');
      }

      // Update session RTT category
      if (rtt && success) {
        const category = perfMonitor.getRttCategory(rtt);
        perfMonitor.recordSessionEvent('rtt-update', category);
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error(`Error processing RTT report: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Add network metrics status endpoint
app.get("/terminal/network-status/:sessionId", async (req, res) => {
  const sessionId = req.params.sessionId;
  const session = terminalSessions[sessionId];

  if (!session) {
    return res.status(404).json({ error: "Terminal session not found" });
  }

  // Apply rate limiting
  const clientIP = req.ip || req.socket.remoteAddress || 'unknown';
  const rateLimitResult = await security.applyGeneralRateLimiting(req, res, () => {});

  if (rateLimitResult) {
    return; // Rate limit was applied
  }

  if (!session.networkMetrics) {
    return res.json({
      success: false,
      error: "Network metrics not initialized",
      defaults: networkAdaptation.DEFAULT_PARAMS
    });
  }

  res.json({
    success: true,
    metrics: session.networkMetrics.getStatus(),
    defaults: networkAdaptation.DEFAULT_PARAMS
  });
});

// Add network adaptation reset endpoint
app.post("/terminal/reset-network/:sessionId", async (req, res) => {
  const sessionId = req.params.sessionId;
  const session = terminalSessions[sessionId];

  if (!session) {
    return res.status(404).json({ error: "Terminal session not found" });
  }

  // Apply rate limiting
  const clientIP = req.ip || req.socket.remoteAddress || 'unknown';
  const rateLimitResult = await security.applyGeneralRateLimiting(req, res, () => {});

  if (rateLimitResult) {
    return; // Rate limit was applied
  }

  if (session.networkMetrics) {
    session.networkMetrics.resetToDefaults();
    res.json({ success: true, message: "Network adaptation reset to defaults" });
  } else {
    session.networkMetrics = networkAdaptation.createNetworkMetrics();
    session.networkMetrics.isUsingFallback = true;
    res.json({ success: true, message: "Network metrics initialized with defaults" });
  }
});

// Performance metrics endpoint
app.get("/terminal/performance", (req, res) => {
  // Force log current metrics
  perfMonitor.logPerformanceMetrics();
  res.json({ success: true, message: "Performance metrics logged to console" });
});

// Start the server
server.listen(env.PORT, () => {
  console.log(`Terminal server listening on port ${env.PORT} with ${server.constructor.name}`);

  // Start performance monitoring
  perfMonitor.startMonitoring();
});

// Handle server shutdown gracefully
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully");

  // Kill all terminal sessions
  Object.keys(terminalSessions).forEach(sessionId => {
    try {
      terminalSessions[sessionId].term.kill();
    } catch (e) {
      console.error(`Error killing terminal process: ${e.message}`);
    }
  });

  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});
