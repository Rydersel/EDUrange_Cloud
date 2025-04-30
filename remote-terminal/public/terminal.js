/**
 * Terminal client for EduRange remote terminal
 */

// Initialization and configuration
const term = new Terminal({
  cursorBlink: true,
  macOptionIsMeta: true,
  scrollback: 1000,
  theme: {
    background: '#1E1E1E',
    foreground: '#EFEFEF'
  }
});

const fitAddon = new FitAddon.FitAddon();
term.loadAddon(fitAddon);

// Connection state
let sessionId = null;
let eventSource = null;
let connected = false;
let reconnectAttempts = 0;
let maxReconnectAttempts = 5;
let reconnectDelay = 1000;
let heartbeatInterval = null;
let networkMetrics = {
  rttSamples: [],
  lastRtt: 0,
  avgRtt: 0,
  pendingMeasurements: {},
  measurementId: 0,
  clientProcessingTimeEstimate: 0,
  adaptationEnabled: true  // Whether to use network adaptation
};

// DOM elements initialization
window.onload = function() {
  const terminal = document.getElementById('terminal');
  
  if (terminal) {
    term.open(terminal);
    fitAddon.fit();
    
    // Get session ID from the URL
    const params = new URLSearchParams(window.location.search);
    sessionId = params.get('sessionId');
    
    if (!sessionId) {
      term.writeln('Error: No session ID provided');
      return;
    }
    
    // Initialize terminal connections
    createTerminalSession();
  }
};

// Window resize handler
window.onresize = function() {
  fitAddon.fit();
  if (connected) {
    resizeTerminal(term.cols, term.rows);
  }
};

// Create a new terminal session
async function createTerminalSession() {
  try {
    const response = await fetch(`/terminal/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        cols: term.cols,
        rows: term.rows
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      sessionId = data.sessionId;
      connectTerminal();
    } else {
      term.writeln(`Error: ${data.error}`);
    }
  } catch (error) {
    term.writeln(`Connection error: ${error.message}`);
  }
}

// Connect to an existing terminal session
function connectTerminal() {
  if (!sessionId) {
    term.writeln('Error: No session ID');
    return;
  }
  
  // Connect to terminal output
  connectOutput();
  
  // Set up terminal input handling
  term.onData(data => {
    if (connected) {
      sendInput(data);
    }
  });
  
  // Set resize handler
  term.onResize(size => {
    if (connected) {
      resizeTerminal(size.cols, size.rows);
    }
  });
  
  // Start network adaptation measurement cycle
  startNetworkMeasurements();
  
  // Set up heartbeat to keep session alive
  heartbeatInterval = setInterval(sendHeartbeat, 30000);
}

// Connect to terminal output stream
function connectOutput() {
  if (eventSource) {
    eventSource.close();
  }
  
  eventSource = new EventSource(`/terminal/output/${sessionId}`);
  
  eventSource.onopen = () => {
    console.log('SSE connection established');
    connected = true;
    reconnectAttempts = 0;
  };
  
  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      
      // Process RTT measurement if present
      if (data._rttMeasure) {
        const measureTime = data._rttMeasure;
        const receiveTime = Date.now();
        const processingStart = performance.now();
        
        // Process the data
        if (data.data) {
          term.write(data.data);
        }
        
        // Calculate client processing time
        const processingEnd = performance.now();
        const clientProcessingTime = processingEnd - processingStart;
        
        // Update running average of client processing time
        networkMetrics.clientProcessingTimeEstimate = 
          (networkMetrics.clientProcessingTimeEstimate * 0.8) + (clientProcessingTime * 0.2);
        
        // Send RTT measurement back to server
        reportRttMeasurement(measureTime, receiveTime, clientProcessingTime);
      } else if (data.data) {
        // Regular data without RTT measurement
        term.write(data.data);
      }
    } catch (e) {
      console.error('Error processing message:', e);
    }
  };
  
  eventSource.onerror = (error) => {
    console.error('SSE Error:', error);
    connected = false;
    
    // Reconnect logic
    if (reconnectAttempts < maxReconnectAttempts) {
      reconnectAttempts++;
      const delay = reconnectDelay * reconnectAttempts;
      console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttempts}/${maxReconnectAttempts})`);
      
      setTimeout(() => {
        connectOutput();
      }, delay);
    } else {
      term.writeln('\r\n\x1b[31mConnection lost. Please reload the page.\x1b[0m');
    }
  };
}

// Send terminal input
async function sendInput(data) {
  try {
    const response = await fetch(`/terminal/input/${sessionId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ data })
    });
    
    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }
  } catch (error) {
    console.error('Error sending input:', error);
  }
}

// Resize terminal
async function resizeTerminal(cols, rows) {
  try {
    const response = await fetch(`/terminal/resize/${sessionId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ cols, rows })
    });
    
    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }
  } catch (error) {
    console.error('Error resizing terminal:', error);
  }
}

// Send heartbeat to keep session alive
async function sendHeartbeat() {
  if (!connected || !sessionId) return;
  
  try {
    await fetch(`/terminal/heartbeat/${sessionId}`);
  } catch (error) {
    console.error('Heartbeat error:', error);
  }
}

// Close the terminal session
async function closeTerminal() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
  }
  
  if (eventSource) {
    eventSource.close();
  }
  
  if (sessionId) {
    try {
      await fetch(`/terminal/close/${sessionId}`, { method: 'POST' });
    } catch (error) {
      console.error('Error closing terminal:', error);
    }
  }
}

// Set up a direct RTT measurement cycle to measure network conditions
function startNetworkMeasurements() {
  // Schedule periodic RTT measurements
  setInterval(measureNetworkRtt, 5000);
  
  // Do an initial measurement right away
  setTimeout(measureNetworkRtt, 1000);
}

// Measure network RTT using ping/pong
async function measureNetworkRtt() {
  if (!connected || !sessionId || !networkMetrics.adaptationEnabled) return;
  
  try {
    const startTime = performance.now();
    const response = await fetch(`/terminal/ping/${sessionId}`);
    
    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }
    
    const data = await response.json();
    const endTime = performance.now();
    const rtt = endTime - startTime;
    
    // Update local RTT metrics
    updateRttMetrics(rtt);
    
    // Report the RTT to the server
    await fetch(`/terminal/report-rtt/${sessionId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        rtt,
        timestamp: data.timestamp
      })
    });
  } catch (error) {
    console.error('Error measuring RTT:', error);
  }
}

// Report SSE-based RTT measurement
async function reportRttMeasurement(measureTime, receiveTime, clientProcessingTime) {
  if (!connected || !sessionId || !networkMetrics.adaptationEnabled) return;
  
  try {
    // Generate a unique measurement ID
    const measurementId = `sse_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    await fetch(`/terminal/report-rtt/${sessionId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        measurementId,
        timestamp: measureTime,
        receiveTime,
        clientProcessingTime
      })
    });
  } catch (error) {
    console.error('Error reporting RTT measurement:', error);
  }
}

// Update local RTT metrics for client-side use
function updateRttMetrics(rtt) {
  // Discard invalid values
  if (isNaN(rtt) || rtt <= 0 || rtt > 10000) return;
  
  networkMetrics.lastRtt = rtt;
  networkMetrics.rttSamples.push(rtt);
  
  // Keep only the last 10 samples
  if (networkMetrics.rttSamples.length > 10) {
    networkMetrics.rttSamples.shift();
  }
  
  // Calculate average
  networkMetrics.avgRtt = networkMetrics.rttSamples.reduce((sum, val) => sum + val, 0) / 
                          networkMetrics.rttSamples.length;
  
  // Log RTT for debugging
  console.log(`Network RTT: ${rtt.toFixed(2)}ms, Avg: ${networkMetrics.avgRtt.toFixed(2)}ms`);
}

// Fetch the current network adaptation status
async function getNetworkStatus() {
  if (!connected || !sessionId) return null;
  
  try {
    const response = await fetch(`/terminal/network-status/${sessionId}`);
    
    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching network status:', error);
    return null;
  }
}

// Reset network adaptation to defaults
async function resetNetworkAdaptation() {
  if (!connected || !sessionId) return false;
  
  try {
    const response = await fetch(`/terminal/reset-network/${sessionId}`, {
      method: 'POST'
    });
    
    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }
    
    console.log('Network adaptation reset to defaults');
    return true;
  } catch (error) {
    console.error('Error resetting network adaptation:', error);
    return false;
  }
}

// Handle page unload
window.addEventListener('beforeunload', closeTerminal); 