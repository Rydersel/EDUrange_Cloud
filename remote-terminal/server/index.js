const express = require("express");
const app = express();
const http = require("http");
const server = http.createServer(app);
const env = require("./env");
const bodyParser = require("body-parser");
const pty = require("node-pty");
const { createSecureContext } = require("tls");

// Import the unified security module
const security = require("./security");

// Initialize terminal sessions storage
const terminalSessions = {};

// Configure Express
app.use(bodyParser.json());
app.use(express.static("public"));
app.use("/static", express.static("public/static"));

// Apply security middlewares
app.use(security.applyGeneralRateLimiting);
app.use(security.applySecurityHeaders);
app.use(security.applyCorsHeaders);

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
    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
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
      "/bin/sh",
      "-c", 
      "TERM=xterm-256color sh"
    ], {
      name: "xterm-color",
      cols: cols,
      rows: rows,
      env: Object.assign({}, process.env, {
        TERM: "xterm-256color",
        COLORTERM: "truecolor"
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
      clients: new Set()
    };
    
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
  const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
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
  const { data } = req.body;
  
  // Validate input data
  const validationResult = security.validateInputData(data);
  if (!validationResult.success) {
    return res.status(validationResult.status).json({ 
      success: false,
      error: validationResult.error
    });
  }
  
  try {
    // Check for potentially dangerous sequences before writing to the terminal
    if (security.containsDangerousSequences(data)) {
      security.logSuspiciousInput(data, { 
        sessionId,
        pod: session.pod,
        container: session.container,
        clientIP
      });
    }
    
    // Sanitize the input to remove potentially dangerous escape sequences
    const sanitizedData = security.sanitizeTerminalInput(data);
    
    // Write the sanitized input to the terminal
    session.term.write(sanitizedData);
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
  
  // Set headers for SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  
  // Send any buffered output immediately
  const initialData = session.outputBuffer
    .filter(item => item.timestamp > Date.now() - 5000) // Last 5 seconds of output
    .map(item => item.data).join("");
  
  if (initialData) {
    res.write(`data: ${JSON.stringify({ data: initialData })}\n\n`);
  }
  
  // Keep track of this client
  const clientId = Date.now().toString();
  session.clients.add(clientId);
  
  // Function to send data to this specific client
  const sendData = (data) => {
    res.write(`data: ${JSON.stringify({ data })}\n\n`);
  };
  
  // Set up data handler for new output
  const dataHandler = (data) => {
    sendData(data);
  };
  
  // Add event listener
  session.term.onData(dataHandler);
  
  // Send a keepalive every 30 seconds to prevent connection timeouts
  const keepaliveInterval = setInterval(() => {
    res.write(`:keepalive\n\n`);
  }, 30000);
  
  // Handle client disconnect
  req.on("close", () => {
    clearInterval(keepaliveInterval);
    session.term.removeListener("data", dataHandler);
    session.clients.delete(clientId);
    console.log(`Client ${clientId} disconnected from session ${sessionId}`);
  });
  
  // Send initial connection message
  sendData("\r\n\x1b[32m[✓] Connection established through HTTP streaming\x1b[0m\r\n");
  
  // Clear the connection message after a brief delay to prevent double prompts
  setTimeout(() => {
    sendData("\x1b[1A\x1b[2K"); // Move up one line and clear it
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

// Close terminal session
app.post("/terminal/close/:sessionId", (req, res) => {
  const sessionId = req.params.sessionId;
  const session = terminalSessions[sessionId];
  
  if (!session) {
    return res.status(404).json({ error: "Terminal session not found" });
  }
  
  try {
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

// Start the server
server.listen(env.PORT, () => {
  console.log(`Terminal server listening on port ${env.PORT}`);
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
