/**
 * Simple logger utility for WebOS
 * Provides consistent logging with prefix and additional contextual information
 * Enhanced with privacy protections for production environments
 */

// Determine if we're in development mode
const isDev = process.env.NODE_ENV === 'development';
const isTest = process.env.NODE_ENV === 'test';
const isProd = process.env.NODE_ENV === 'production';

// Only include detailed logs in non-production environments by default
// Can be overridden with LOG_LEVEL environment variable
const shouldLog = (level) => {
  // Always log errors regardless of environment
  if (level === 'error') return true;
  
  // For other levels, only log in development/test OR if explicitly enabled
  return !isProd || process.env.LOG_LEVEL === level;
};

/**
 * Sanitizes sensitive data from logs in production
 * @param {any} data - Data to sanitize
 * @returns {any} - Sanitized data safe for logging
 */
const sanitizeForProduction = (data) => {
  if (!isProd || !data) return data;
  
  // Don't process primitive values or errors
  if (typeof data !== 'object' || data instanceof Error) return data;
  
  // If it's an array, sanitize each item
  if (Array.isArray(data)) {
    return data.map(item => sanitizeForProduction(item));
  }
  
  // For objects, create a safe copy
  const sanitized = { ...data };
  
  // List of sensitive fields to redact
  const sensitiveFields = [
    'flag', 'secret', 'password', 'token', 'key', 'auth', 
    'credential', 'secret_value', 'flagSecretName'
  ];
  
  // Redact sensitive fields
  for (const key in sanitized) {
    // Check if the key contains any sensitive terms
    if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
      sanitized[key] = '[REDACTED]';
    } 
    // Recursively sanitize nested objects
    else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
      sanitized[key] = sanitizeForProduction(sanitized[key]);
    }
  }
  
  return sanitized;
};

// Create logger object with different log levels
export const logger = {
  /**
   * Log informational message
   * @param {string} message - The message to log
   * @param {Object} data - Optional data to include
   */
  info: (message, data) => {
    if (shouldLog('info')) {
      console.log(`[WebOS:INFO] ${message}`, data ? sanitizeForProduction(data) : '');
    }
  },
  
  /**
   * Log warning message
   * @param {string} message - The message to log
   * @param {Object} data - Optional data to include
   */
  warn: (message, data) => {
    if (shouldLog('warn')) {
      console.warn(`[WebOS:WARN] ${message}`, data ? sanitizeForProduction(data) : '');
    }
  },
  
  /**
   * Log error message
   * @param {string} message - The message to log
   * @param {Object|Error} error - Optional error to include
   */
  error: (message, error) => {
    console.error(`[WebOS:ERROR] ${message}`, error ? sanitizeForProduction(error) : '');
  },
  
  /**
   * Log debug message (only in development mode)
   * @param {string} message - The message to log
   * @param {Object} data - Optional data to include
   */
  debug: (message, data) => {
    if (shouldLog('debug')) {
      console.log(`[WebOS:DEBUG] ${message}`, data ? sanitizeForProduction(data) : '');
    }
  }
};

export default logger; 