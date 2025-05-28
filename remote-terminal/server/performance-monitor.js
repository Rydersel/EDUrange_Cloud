/**
 * Terminal Server Performance Monitoring
 * 
 * Provides monitoring and logging for terminal performance metrics
 * to help diagnose performance issues and optimize configuration.
 */

// Collection interval for metrics (ms)
const METRICS_INTERVAL = 60000; // Log every minute
const DEBUG_MODE = process.env.DEBUG_PERF === 'true';

// Performance metrics storage
const metrics = {
  commandExecutions: {
    count: 0,
    totalRoundtripTime: 0,
    min: Infinity,
    max: 0,
    histogram: new Array(10).fill(0) // 0-100ms, 100-200ms, etc.
  },
  batching: {
    flushCount: 0,
    totalBytesSent: 0,
    totalBatchSize: 0,
    controlSequenceFlushes: 0,
    timeoutFlushes: 0,
    sizeThresholdFlushes: 0,
    batchSizeHistogram: new Array(10).fill(0) // 0-1KB, 1-2KB, etc.
  },
  networkAdaptation: {
    adaptationsApplied: 0,
    fallbacksTriggered: 0,
    measurementsReceived: 0,
    measurementsFailed: 0
  },
  sessionMetrics: {
    activeSessions: 0,
    totalCreated: 0,
    totalClosed: 0
  },
  // Timestamp
  lastResetTime: Date.now(),
  // Sessions by RTT ranges
  sessionsByRtt: {
    excellent: 0,    // < 50ms
    good: 0,         // 50-150ms
    fair: 0,         // 150-300ms
    poor: 0,         // > 300ms
    unknown: 0       // No RTT data yet
  }
};

// Trackers for command round-trip time
const commandTracking = new Map();

/**
 * Record the start of a command execution
 * @param {string} sessionId - Terminal session ID
 * @param {string} commandId - Unique command ID
 */
function startCommandTracking(sessionId, commandId) {
  const trackingKey = `${sessionId}:${commandId}`;
  commandTracking.set(trackingKey, {
    startTime: Date.now(),
    sessionId
  });
  
  // Clean up old tracking entries every 100 commands
  if (metrics.commandExecutions.count % 100 === 0) {
    const now = Date.now();
    commandTracking.forEach((data, key) => {
      if (now - data.startTime > 30000) { // 30 seconds timeout
        commandTracking.delete(key);
      }
    });
  }
}

/**
 * Record the completion of a command execution
 * @param {string} sessionId - Terminal session ID
 * @param {string} commandId - Unique command ID
 * @param {number} bytesSent - Bytes sent in response
 */
function endCommandTracking(sessionId, commandId, bytesSent) {
  const trackingKey = `${sessionId}:${commandId}`;
  const trackingData = commandTracking.get(trackingKey);
  
  if (!trackingData) return; // Command not found
  
  const endTime = Date.now();
  const roundtripTime = endTime - trackingData.startTime;
  
  // Update metrics
  metrics.commandExecutions.count++;
  metrics.commandExecutions.totalRoundtripTime += roundtripTime;
  metrics.commandExecutions.min = Math.min(metrics.commandExecutions.min, roundtripTime);
  metrics.commandExecutions.max = Math.max(metrics.commandExecutions.max, roundtripTime);
  
  // Update histogram
  const histogramBucket = Math.min(9, Math.floor(roundtripTime / 100));
  metrics.commandExecutions.histogram[histogramBucket]++;
  
  // Remove from tracking
  commandTracking.delete(trackingKey);
  
  // Debug logging if enabled
  if (DEBUG_MODE) {
    console.log(`[PERF] Command completed in ${roundtripTime}ms, ${bytesSent} bytes sent`);
  }
}

/**
 * Record a batch flush
 * @param {number} batchSize - Size of the batch in bytes
 * @param {string} reason - Reason for the flush
 */
function recordBatchFlush(batchSize, reason) {
  metrics.batching.flushCount++;
  metrics.batching.totalBytesSent += batchSize;
  metrics.batching.totalBatchSize += batchSize;
  
  // Update histogram
  const histogramBucket = Math.min(9, Math.floor(batchSize / 1024));
  metrics.batching.batchSizeHistogram[histogramBucket]++;
  
  // Record flush reason
  switch (reason) {
    case 'control':
      metrics.batching.controlSequenceFlushes++;
      break;
    case 'timeout':
      metrics.batching.timeoutFlushes++;
      break;
    case 'size':
      metrics.batching.sizeThresholdFlushes++;
      break;
  }
}

/**
 * Record network adaptation metrics
 * @param {string} event - Type of adaptation event
 */
function recordAdaptationEvent(event) {
  switch (event) {
    case 'adaptation':
      metrics.networkAdaptation.adaptationsApplied++;
      break;
    case 'fallback':
      metrics.networkAdaptation.fallbacksTriggered++;
      break;
    case 'measurement':
      metrics.networkAdaptation.measurementsReceived++;
      break;
    case 'failed':
      metrics.networkAdaptation.measurementsFailed++;
      break;
  }
}

/**
 * Update session count metrics
 * @param {string} event - Session event (create, close)
 */
function recordSessionEvent(event, rttCategory = null) {
  switch (event) {
    case 'create':
      metrics.sessionMetrics.totalCreated++;
      metrics.sessionMetrics.activeSessions++;
      metrics.sessionsByRtt.unknown++;
      break;
    case 'close':
      metrics.sessionMetrics.totalClosed++;
      metrics.sessionMetrics.activeSessions = Math.max(0, metrics.sessionMetrics.activeSessions - 1);
      break;
    case 'rtt-update':
      if (rttCategory) {
        // Remove from previous category if any
        Object.keys(metrics.sessionsByRtt).forEach(cat => {
          if (cat !== rttCategory && cat !== 'unknown') {
            metrics.sessionsByRtt[cat]--;
          }
        });
        
        // Add to new category
        metrics.sessionsByRtt[rttCategory]++;
        
        // Remove from unknown if previously unclassified
        if (metrics.sessionsByRtt.unknown > 0) {
          metrics.sessionsByRtt.unknown--;
        }
      }
      break;
  }
}

/**
 * Categorize session by RTT
 * @param {number} rtt - Round trip time in ms
 * @returns {string} RTT category
 */
function getRttCategory(rtt) {
  if (rtt < 50) return 'excellent';
  if (rtt < 150) return 'good';
  if (rtt < 300) return 'fair';
  return 'poor';
}

/**
 * Log current performance metrics to stdout
 */
function logPerformanceMetrics() {
  const now = Date.now();
  const timeRunning = (now - metrics.lastResetTime) / 1000;
  
  // Calculate derived metrics
  const avgRoundtripTime = metrics.commandExecutions.count > 0 
    ? metrics.commandExecutions.totalRoundtripTime / metrics.commandExecutions.count 
    : 0;
  
  const avgBatchSize = metrics.batching.flushCount > 0 
    ? metrics.batching.totalBatchSize / metrics.batching.flushCount 
    : 0;
  
  // Build performance report
  const report = {
    timestamp: new Date().toISOString(),
    timeRunning: `${Math.floor(timeRunning / 60)}m ${Math.floor(timeRunning % 60)}s`,
    commands: {
      total: metrics.commandExecutions.count,
      avgRoundtripTime: Math.round(avgRoundtripTime),
      min: metrics.commandExecutions.min === Infinity ? 0 : metrics.commandExecutions.min,
      max: metrics.commandExecutions.max,
      ratePerMinute: Math.round((metrics.commandExecutions.count / timeRunning) * 60)
    },
    batching: {
      flushes: metrics.batching.flushCount,
      totalBytesSent: formatBytes(metrics.batching.totalBytesSent),
      avgBatchSize: formatBytes(avgBatchSize),
      byReason: {
        controlSequence: metrics.batching.controlSequenceFlushes,
        timeout: metrics.batching.timeoutFlushes,
        sizeThreshold: metrics.batching.sizeThresholdFlushes
      }
    },
    adaptation: {
      adaptationsApplied: metrics.networkAdaptation.adaptationsApplied,
      fallbacksTriggered: metrics.networkAdaptation.fallbacksTriggered,
      measurementSuccessRate: metrics.networkAdaptation.measurementsReceived > 0 
        ? (1 - metrics.networkAdaptation.measurementsFailed / metrics.networkAdaptation.measurementsReceived).toFixed(2) 
        : 'N/A'
    },
    sessions: {
      active: metrics.sessionMetrics.activeSessions,
      totalCreated: metrics.sessionMetrics.totalCreated,
      totalClosed: metrics.sessionMetrics.totalClosed,
      byRttCategory: {
        excellent: metrics.sessionsByRtt.excellent,
        good: metrics.sessionsByRtt.good,
        fair: metrics.sessionsByRtt.fair,
        poor: metrics.sessionsByRtt.poor,
        unknown: metrics.sessionsByRtt.unknown
      }
    }
  };
  
  console.log(`\n========== TERMINAL PERFORMANCE METRICS ==========`);
  console.log(JSON.stringify(report, null, 2));
  console.log(`==================================================\n`);
}

/**
 * Format bytes into human-readable format
 * @param {number} bytes - Bytes to format
 * @returns {string} Formatted string
 */
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Reset all metrics
 */
function resetMetrics() {
  metrics.commandExecutions.count = 0;
  metrics.commandExecutions.totalRoundtripTime = 0;
  metrics.commandExecutions.min = Infinity;
  metrics.commandExecutions.max = 0;
  metrics.commandExecutions.histogram.fill(0);
  
  metrics.batching.flushCount = 0;
  metrics.batching.totalBytesSent = 0;
  metrics.batching.totalBatchSize = 0;
  metrics.batching.controlSequenceFlushes = 0;
  metrics.batching.timeoutFlushes = 0;
  metrics.batching.sizeThresholdFlushes = 0;
  metrics.batching.batchSizeHistogram.fill(0);
  
  metrics.networkAdaptation.adaptationsApplied = 0;
  metrics.networkAdaptation.fallbacksTriggered = 0;
  metrics.networkAdaptation.measurementsReceived = 0;
  metrics.networkAdaptation.measurementsFailed = 0;
  
  // Don't reset active sessions, just closed and created
  metrics.sessionMetrics.totalCreated = 0;
  metrics.sessionMetrics.totalClosed = 0;
  
  metrics.lastResetTime = Date.now();
}

/**
 * Start the performance monitoring system
 */
function startMonitoring() {
  // Reset metrics
  resetMetrics();
  
  // Set up periodic logging
  setInterval(() => {
    logPerformanceMetrics();
  }, METRICS_INTERVAL);
  
  console.log(`[PERF] Performance monitoring started, logging every ${METRICS_INTERVAL/1000} seconds`);
}

// Export the module functions
module.exports = {
  startMonitoring,
  startCommandTracking,
  endCommandTracking,
  recordBatchFlush,
  recordAdaptationEvent,
  recordSessionEvent,
  getRttCategory,
  resetMetrics,
  logPerformanceMetrics
}; 