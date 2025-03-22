/**
 * Security Tracker Module for EDURange Terminal
 * 
 * This module provides functionality to track and monitor 
 * suspicious activities for security monitoring purposes.
 */

/**
 * Security tracking system for monitoring potential attack patterns
 */
const securityTracker = {
  suspiciousActivities: new Map(), // Track by IP or session
  thresholds: {
    warningThreshold: 3,   // Number of suspicious inputs before warning
    blockThreshold: 10     // Number of suspicious inputs before suggesting blocking
  },
  
  /**
   * Record a suspicious activity for a client
   * @param {string} identifier - Client identifier (IP, session ID)
   * @param {string} activityType - Type of suspicious activity
   * @param {any} details - Additional activity details
   * @returns {number} - Current count of suspicious activities for this client
   */
  recordActivity(identifier, activityType, details = {}) {
    if (!this.suspiciousActivities.has(identifier)) {
      this.suspiciousActivities.set(identifier, {
        count: 0,
        activities: [],
        firstSeen: new Date(),
        lastSeen: new Date()
      });
    }
    
    const record = this.suspiciousActivities.get(identifier);
    record.count++;
    record.lastSeen = new Date();
    
    // Keep only the last 10 activities to avoid memory issues
    if (record.activities.length >= 10) {
      record.activities.shift();
    }
    
    record.activities.push({
      timestamp: new Date(),
      type: activityType,
      details
    });
    
    // Check if thresholds are exceeded
    if (record.count === this.thresholds.warningThreshold) {
      console.warn(`Security Warning: Client ${identifier} has triggered ${record.count} suspicious actions`);
    }
    
    if (record.count === this.thresholds.blockThreshold) {
      console.error(`Security Alert: Client ${identifier} has triggered ${record.count} suspicious actions - consider blocking`);
      // In production, this could trigger automated blocking
    }
    
    return record.count;
  },
  
  /**
   * Get security record for a client
   * @param {string} identifier - Client identifier
   * @returns {object|null} - Security record or null if not found
   */
  getClientRecord(identifier) {
    return this.suspiciousActivities.get(identifier) || null;
  },
  
  /**
   * Get all security records
   * @returns {Array} - Array of all client records
   */
  getAllRecords() {
    const records = [];
    this.suspiciousActivities.forEach((record, identifier) => {
      records.push({
        identifier,
        ...record
      });
    });
    return records;
  },
  
  /**
   * Clean up old records to prevent memory leaks
   * @param {number} maxAge - Maximum age in milliseconds (default: 24 hours)
   */
  cleanupOldRecords(maxAge = 24 * 60 * 60 * 1000) {
    const now = new Date();
    
    this.suspiciousActivities.forEach((record, identifier) => {
      if (now - record.lastSeen > maxAge) {
        this.suspiciousActivities.delete(identifier);
      }
    });
  }
};

// Schedule periodic cleanup of old security records
setInterval(() => {
  securityTracker.cleanupOldRecords();
}, 60 * 60 * 1000); // Run every hour

/**
 * Logs potentially malicious terminal input attempts
 * 
 * @param {string} input - The suspicious input
 * @param {object} context - Additional context (session ID, user info, etc.)
 */
function logSuspiciousInput(input, context = {}) {
  const securityLog = {
    timestamp: new Date().toISOString(),
    event: 'suspicious_terminal_input',
    input: input.substring(0, 100) + (input.length > 100 ? '...' : ''), // Truncate for log safety
    ...context
  };
  
  console.warn('SECURITY WARNING: Potential terminal escape sequence attack detected', securityLog);
  
  // Track this suspicious activity
  const clientIdentifier = context.clientIP || context.sessionId || 'unknown';
  securityTracker.recordActivity(clientIdentifier, 'suspicious_terminal_input', {
    inputFragment: input.substring(0, 30),
    sessionId: context.sessionId
  });
  
  // In a production environment, you might want to send this to a security monitoring system
  // sendToSecurityMonitoring(securityLog);
}

module.exports = {
  securityTracker,
  logSuspiciousInput
}; 