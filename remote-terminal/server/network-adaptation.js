/**
 * Network Condition Adaptation for Terminal Server
 * 
 * This module provides adaptive terminal batching based on network conditions
 * It measures RTT, estimates bandwidth, and provides optimized parameters
 * for batching terminal output for different network conditions.
 */

const DEFAULT_PARAMS = {
  // Default terminal batching parameters
  FLUSH_THRESHOLD: 8192,    // 8KB batch size threshold
  MAX_DELAY: 50,            // Maximum milliseconds to hold data
  MIN_DELAY: 12,            // Optimal milliseconds between flushes
  HIGH_ACTIVITY_THRESHOLD: 10, // Number of rapid updates that triggers batch mode
  
  // Network adaptation parameters
  RTT_SAMPLES_MAX: 20,      // Maximum number of RTT samples to keep
  RTT_MEASUREMENT_INTERVAL: 5000, // Milliseconds between measurements
  RTT_OUTLIER_FACTOR: 3,    // Factor for RTT outlier detection
  BANDWIDTH_SAMPLES_MAX: 10, // Maximum number of bandwidth samples
  MIN_BATCH_SIZE: 2048,     // Minimum batch size in bytes
  MAX_BATCH_SIZE: 32768,    // Maximum batch size in bytes
  TARGET_TRANSMIT_TIME: 50, // Target batch transmission time in ms
  MEASUREMENT_TIMEOUT: 10000, // Milliseconds before measurement is considered failed
  
  // Fallback settings
  ADAPTATION_ENABLED: true, // Whether adaptation is enabled
  UNSTABLE_THRESHOLD: 1.0,  // RTT variation/avg above which network is considered unstable
  FAILING_MEASUREMENTS_THRESHOLD: 5 // Consecutive failed measurements before falling back
};

/**
 * Creates network metrics tracking for a session
 * @returns {Object} Network metrics object
 */
function createNetworkMetrics() {
  return {
    // RTT measurement
    rttSamples: [],
    rttSampleCount: 0,
    rttSum: 0,
    rttMin: Infinity,
    rttMax: 0,
    rttAvg: 0,
    rttDeviation: 0,
    lastMeasurementTime: Date.now(),
    measurementInterval: DEFAULT_PARAMS.RTT_MEASUREMENT_INTERVAL,
    pendingMeasurements: {},
    measuringEnabled: true,
    failedMeasurements: 0,
    
    // Bandwidth estimation
    bandwidthSamples: [],
    bandwidthEstimate: 0,  // bytes/second
    
    // Adaptation state
    adaptationEnabled: DEFAULT_PARAMS.ADAPTATION_ENABLED,
    isUsingFallback: false,
    adaptationLog: [],
    
    /**
     * Add a new RTT sample and update statistics
     * @param {number} rtt Round-trip time in milliseconds
     * @returns {boolean} True if sample was accepted, false if rejected as outlier
     */
    addRttSample(rtt) {
      // Reset failed measurements counter on success
      this.failedMeasurements = 0;
      
      // Check for invalid values
      if (isNaN(rtt) || rtt <= 0) {
        return false;
      }
      
      // Discard outliers if we have enough samples
      if (this.rttSamples.length > 5 && 
          (rtt < this.rttMin / DEFAULT_PARAMS.RTT_OUTLIER_FACTOR || 
           rtt > this.rttMax * DEFAULT_PARAMS.RTT_OUTLIER_FACTOR)) {
        return false;
      }
      
      this.rttSamples.push(rtt);
      this.rttSampleCount++;
      this.rttSum += rtt;
      
      // Keep only the most recent samples
      if (this.rttSamples.length > DEFAULT_PARAMS.RTT_SAMPLES_MAX) {
        const removed = this.rttSamples.shift();
        this.rttSum -= removed;
        this.rttSampleCount--;
      }
      
      // Update statistics
      this.rttMin = Math.min(...this.rttSamples);
      this.rttMax = Math.max(...this.rttSamples);
      this.rttAvg = this.rttSum / this.rttSampleCount;
      
      // Calculate standard deviation
      const sumSquaredDifferences = this.rttSamples.reduce((sum, value) => {
        return sum + Math.pow(value - this.rttAvg, 2);
      }, 0);
      this.rttDeviation = Math.sqrt(sumSquaredDifferences / this.rttSampleCount);
      
      // Check if network is unstable based on variation
      const variabilityFactor = this.rttDeviation / this.rttAvg;
      if (variabilityFactor > DEFAULT_PARAMS.UNSTABLE_THRESHOLD) {
        this.logAdaptation(`Network unstable: variation factor ${variabilityFactor.toFixed(2)}`);
      }
      
      return true;
    },
    
    /**
     * Record a failed measurement attempt
     */
    recordFailedMeasurement() {
      this.failedMeasurements++;
      
      // Check if we should fall back to defaults
      if (this.failedMeasurements >= DEFAULT_PARAMS.FAILING_MEASUREMENTS_THRESHOLD) {
        if (!this.isUsingFallback) {
          this.isUsingFallback = true;
          this.logAdaptation(`Falling back to default parameters after ${this.failedMeasurements} failed measurements`);
        }
      }
      
      return this.isUsingFallback;
    },
    
    /**
     * Start a new RTT measurement
     * @param {string} id Unique identifier for this measurement
     * @returns {number} Timestamp when measurement started
     */
    startMeasurement(id) {
      const timestamp = Date.now();
      this.pendingMeasurements[id] = timestamp;
      
      // Set timeout to clean up and mark as failed if no response
      setTimeout(() => {
        if (this.pendingMeasurements[id]) {
          delete this.pendingMeasurements[id];
          this.recordFailedMeasurement();
        }
      }, DEFAULT_PARAMS.MEASUREMENT_TIMEOUT);
      
      return timestamp;
    },
    
    /**
     * Complete an RTT measurement
     * @param {string} id Measurement identifier
     * @param {number} clientProcessingTime Optional client processing time to subtract from RTT
     * @returns {number} Measured RTT or -1 if measurement not found
     */
    completeMeasurement(id, clientProcessingTime = 0) {
      if (!this.pendingMeasurements[id]) {
        return -1;
      }
      
      const startTime = this.pendingMeasurements[id];
      const rtt = Date.now() - startTime - clientProcessingTime;
      
      delete this.pendingMeasurements[id];
      
      if (rtt > 0) {
        this.addRttSample(rtt);
        return rtt;
      }
      
      return -1;
    },
    
    /**
     * Update bandwidth estimate based on bytes sent and time taken
     * @param {number} bytesSent Number of bytes sent
     * @param {number} timeTaken Time taken in milliseconds
     */
    updateBandwidthEstimate(bytesSent, timeTaken) {
      if (timeTaken <= 0 || bytesSent <= 0) return false;
      
      const bytesPerSecond = (bytesSent * 1000) / timeTaken;
      this.bandwidthSamples.push(bytesPerSecond);
      
      // Keep only recent samples
      if (this.bandwidthSamples.length > DEFAULT_PARAMS.BANDWIDTH_SAMPLES_MAX) {
        this.bandwidthSamples.shift();
      }
      
      // Calculate average, excluding outliers
      if (this.bandwidthSamples.length >= 3) {
        const sorted = [...this.bandwidthSamples].sort((a, b) => a - b);
        // Remove top and bottom 20% if we have enough samples
        const startIdx = Math.floor(sorted.length * 0.2);
        const endIdx = Math.ceil(sorted.length * 0.8);
        const filteredSamples = sorted.slice(startIdx, endIdx);
        
        if (filteredSamples.length > 0) {
          this.bandwidthEstimate = filteredSamples.reduce((sum, val) => sum + val, 0) / 
                                 filteredSamples.length;
        }
      } else {
        // Not enough samples for filtering, use simple average
        this.bandwidthEstimate = this.bandwidthSamples.reduce((sum, val) => sum + val, 0) / 
                               this.bandwidthSamples.length;
      }
      
      return true;
    },
    
    /**
     * Get the optimal delay for the current network conditions
     * @returns {number} Optimal delay in milliseconds
     */
    getOptimalDelay() {
      // If adaptation is disabled or we're in fallback mode, use default
      if (!this.adaptationEnabled || this.isUsingFallback) {
        return DEFAULT_PARAMS.MIN_DELAY;
      }
      
      // If we don't have enough RTT samples, use default
      if (this.rttSampleCount < 5) {
        return DEFAULT_PARAMS.MIN_DELAY;
      }
      
      // Calculate optimal delay based on network conditions
      let optimalDelay;
      
      if (this.rttAvg < 20) {
        // Excellent connection - minimal batching needed
        optimalDelay = Math.max(5, Math.min(DEFAULT_PARAMS.MIN_DELAY, this.rttAvg * 0.5));
      } else if (this.rttAvg < 50) {
        // Good connection - standard batching
        optimalDelay = DEFAULT_PARAMS.MIN_DELAY;
      } else if (this.rttAvg < 150) {
        // Medium latency - increase batch size
        optimalDelay = DEFAULT_PARAMS.MIN_DELAY * 1.5;
      } else if (this.rttAvg < 300) {
        // High latency - larger batches to reduce overhead
        optimalDelay = DEFAULT_PARAMS.MIN_DELAY * 2;
      } else {
        // Very high latency - maximum batching
        optimalDelay = Math.min(DEFAULT_PARAMS.MAX_DELAY * 0.75, DEFAULT_PARAMS.MIN_DELAY * 3);
      }
      
      // Adjust for variability - more variable connections need larger batches
      const variabilityFactor = this.rttDeviation / this.rttAvg;
      if (variabilityFactor > 0.5) {
        optimalDelay *= (1 + (variabilityFactor - 0.5));
      }
      
      // Constrain to reasonable bounds
      return Math.max(DEFAULT_PARAMS.MIN_DELAY / 2, 
                     Math.min(DEFAULT_PARAMS.MAX_DELAY * 0.8, optimalDelay));
    },
    
    /**
     * Get optimal batch size based on bandwidth estimate
     * @returns {number} Optimal batch size in bytes
     */
    getOptimalBatchSize() {
      // If adaptation is disabled or we're in fallback mode, use default
      if (!this.adaptationEnabled || this.isUsingFallback) {
        return DEFAULT_PARAMS.FLUSH_THRESHOLD;
      }
      
      const bandwidth = this.bandwidthEstimate;
      
      // No data yet, use default
      if (bandwidth <= 0) {
        return DEFAULT_PARAMS.FLUSH_THRESHOLD;
      }
      
      // Scale batch size with bandwidth
      // Aim for batches that transmit in ~50ms on the user's connection
      const targetTransmitTime = DEFAULT_PARAMS.TARGET_TRANSMIT_TIME; // ms
      const bytesPerMs = bandwidth / 1000;
      const optimalSize = bytesPerMs * targetTransmitTime;
      
      // Constrain to reasonable limits
      return Math.max(DEFAULT_PARAMS.MIN_BATCH_SIZE, 
                     Math.min(DEFAULT_PARAMS.MAX_BATCH_SIZE, optimalSize));
    },
    
    /**
     * Check if we should attempt network measurements
     * @returns {boolean} True if we should measure
     */
    shouldMeasure() {
      return this.measuringEnabled && 
             Date.now() - this.lastMeasurementTime > this.measurementInterval;
    },
    
    /**
     * Log adaptation decision for debugging
     * @param {string} message Message to log
     */
    logAdaptation(message) {
      this.adaptationLog.push({
        time: Date.now(),
        message,
        rttAvg: this.rttAvg.toFixed(2),
        rttDev: this.rttDeviation.toFixed(2),
        bandwidth: (this.bandwidthEstimate / 1024).toFixed(2) + 'KB/s'
      });
      
      // Keep log size reasonable
      if (this.adaptationLog.length > 100) {
        this.adaptationLog.shift();
      }
    },
    
    /**
     * Reset to default values
     */
    resetToDefaults() {
      this.isUsingFallback = true;
      this.logAdaptation('Manually reset to default parameters');
    },
    
    /**
     * Get current adaptation status
     * @returns {Object} Status object with current metrics and state
     */
    getStatus() {
      return {
        rtt: {
          avg: this.rttAvg,
          min: this.rttMin,
          max: this.rttMax,
          deviation: this.rttDeviation,
          samples: this.rttSampleCount
        },
        bandwidth: this.bandwidthEstimate,
        adaptation: {
          enabled: this.adaptationEnabled,
          usingFallback: this.isUsingFallback,
          failedMeasurements: this.failedMeasurements,
          optimalDelay: this.getOptimalDelay(),
          optimalBatchSize: this.getOptimalBatchSize()
        }
      };
    }
  };
}

module.exports = {
  DEFAULT_PARAMS,
  createNetworkMetrics
}; 