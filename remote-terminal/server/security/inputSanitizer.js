/**
 * Input Sanitization Utility for EDURange Terminal
 * 
 * This module provides functions to sanitize terminal input and prevent
 * escape sequence attacks by filtering dangerous sequences.
 */

/**
 * Dangerous escape sequences that could be used for attacks
 * These include sequences that can:
 * - Change terminal settings
 * - Execute arbitrary commands
 * - Manipulate the display in malicious ways
 * - Exfiltrate data
 * - Trigger buffer overflows or other vulnerabilities
 * 
 * References:
 * - https://invisible-island.net/xterm/ctlseqs/ctlseqs.html
 * - https://www.owasp.org/index.php/Terminal_Escape_Injection
 */
const DANGEROUS_ESCAPE_SEQUENCES = [
  // Terminal reset and clear sequences
  /\x1bc/g,                       // Full terminal reset
  
  // Title setting and manipulation
  /\x1b\]0;.*\x07/g,              // OSC 0 - Set window title
  /\x1b\]1;.*\x07/g,              // OSC 1 - Set icon name
  /\x1b\]2;.*\x07/g,              // OSC 2 - Set window title and icon
  
  // Device control and terminal options
  /\x1b\[\?.*[hlm]/g,             // Set/reset terminal mode
  /\x1b\[\d*[ABCDEFGHJKST]/g,     // Cursor and scrolling control
  
  // Terminal keyboard remapping
  /\x1b\[\d*;.*p/g,               // Keyboard remapping
  
  // Function key definition
  /\x1b\[.*~"/g,                  // Function key definition
  
  // Bracketed paste mode
  /\x1b\[\?2004h/g,               // Enable bracketed paste mode
  
  // Various escape sequence attack vectors
  /\x1b\[\d+n/g,                  // Device status report
  /\x1b\[r/g,                     // Set scrolling region
  
  // DEC Special Character and Line Drawing Set
  /\x1b\(0/g,                     // Enable line drawing mode
  
  // Potentially dangerous Unicode 
  /[\u{0080}-\u{009F}]/gu         // C1 control codes
];

/**
 * Safe terminal commands whitelist (optional, uncomment if using whitelist approach)
 */
// const SAFE_COMMANDS_REGEX = /^(ls|cd|pwd|cat|grep|find|echo|mkdir|touch|rm|cp|mv|clear|exit|help|man)(\s+.*)?$/;

/**
 * Sanitizes terminal input by removing potentially dangerous escape sequences
 * 
 * @param {string} input - The raw terminal input to sanitize
 * @returns {string} - The sanitized terminal input
 */
function sanitizeTerminalInput(input) {
  if (!input) return input;
  
  // Remove dangerous escape sequences
  let sanitized = input;
  DANGEROUS_ESCAPE_SEQUENCES.forEach(pattern => {
    sanitized = sanitized.replace(pattern, '');
  });
  
  // Additional conversion of control characters to visible form
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  
  return sanitized;
}

/**
 * Detects if input contains potentially dangerous escape sequences
 * Can be used for logging or alerting purposes
 * 
 * @param {string} input - The input to check
 * @returns {boolean} - True if potentially dangerous sequences found
 */
function containsDangerousSequences(input) {
  if (!input) return false;
  
  // Skip detection for common, safe terminal navigation sequences
  // ESC key alone or ESC+Enter are normal terminal usage patterns
  if (input === '\x1b' || input === '\x1b\r' || input === '\x1b\n') {
    return false;
  }
  
  for (const pattern of DANGEROUS_ESCAPE_SEQUENCES) {
    if (pattern.test(input)) {
      return true;
    }
  }
  
  // Check for other suspicious patterns - but not single ESC characters
  // which are used for normal terminal navigation
  const suspiciousPatterns = [
    // Only detect ESC followed by something other than carriage return or newline
    /\x1b[^\r\n]/g, 
    /\x07/g,  // BEL character
    /\x1f/g   // Unit Separator
  ];
  
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(input)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Get list of dangerous escape sequence patterns
 * Useful for extending the security module
 * 
 * @returns {Array} Array of regex patterns
 */
function getDangerousPatterns() {
  return [...DANGEROUS_ESCAPE_SEQUENCES];
}

module.exports = {
  sanitizeTerminalInput,
  containsDangerousSequences,
  getDangerousPatterns
}; 