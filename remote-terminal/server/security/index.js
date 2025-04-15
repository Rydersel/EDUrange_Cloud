/**
 * EDURange Terminal Security Module
 * 
 * This is the main entry point for all security-related functionality.
 * It combines and exports functions from all security sub-modules.
 */

// Import all security sub-modules
const { 
  sanitizeTerminalInput, 
  containsDangerousSequences,
  getDangerousPatterns 
} = require('./inputSanitizer');

const { 
  securityTracker, 
  logSuspiciousInput 
} = require('./securityTracker');

const { 
  applySecurityHeaders, 
  applyCorsHeaders 
} = require('./securityHeaders');

const { 
  applyGeneralRateLimiting,
  applyTerminalCreateRateLimiting,
  applyInputRateLimiting 
} = require('./rateLimiter');

const { 
  validateTerminalParams, 
  validateResizeParams,
  validateInputData 
} = require('./inputValidator');

// Export all security functions
module.exports = {
  // Input Sanitization
  sanitizeTerminalInput,
  containsDangerousSequences,
  getDangerousPatterns,
  
  // Security Tracking
  securityTracker,
  logSuspiciousInput,
  
  // Security Headers
  applySecurityHeaders,
  applyCorsHeaders,
  
  // Rate Limiting
  applyGeneralRateLimiting,
  applyTerminalCreateRateLimiting,
  applyInputRateLimiting,
  
  // Input Validation
  validateTerminalParams,
  validateResizeParams,
  validateInputData
}; 