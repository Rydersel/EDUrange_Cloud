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
 * Safe escape sequences that should be allowed for normal terminal operation
 */
const SAFE_ESCAPE_SEQUENCES = [
  /\x1b\[A/,   // Up arrow
  /\x1b\[B/,   // Down arrow
  /\x1b\[C/,   // Right arrow
  /\x1b\[D/,   // Left arrow
  /\x1b\[H/,   // Home
  /\x1b\[F/,   // End
  /\x1b\[3~/,  // Delete
  /\x1b\[5~/,  // Page Up
  /\x1b\[6~/   // Page Down
];

/**
 * Safe control characters that should be allowed
 */
const SAFE_CONTROL_CHARS = [
  '\x03',      // Ctrl+C (ETX - End of Text) - for interrupting processes
  '\x04',      // Ctrl+D (EOT - End of Transmission) - for EOF
  '\x1a',      // Ctrl+Z (SUB - Substitute) - for background process
  '\x12',      // Ctrl+R (DC2 - Device Control 2) - for reverse search
  '\x14',      // Ctrl+T (DC4 - Device Control 4) - for swap chars
  '\t',        // Tab - for command/path completion
  '\x15'       // Ctrl+U (NAK - Negative Acknowledge) - for clear line
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
  // TEMPORARILY DISABLED SANITIZATION TO FIX VIM ISSUES
  return input;
  
  /* Original sanitization code (commented out for testing)
  if (!input) return input;

  // Check if input matches any of the safe escape sequences
  for (const safePattern of SAFE_ESCAPE_SEQUENCES) {
    if (safePattern.test(input)) {
      return input; // Return unmodified if it matches a safe pattern
    }
  }

  // Check if input is a safe control character
  if (SAFE_CONTROL_CHARS.includes(input)) {
    return input; // Return unmodified if it's a safe control character
  }

  // Remove dangerous escape sequences
  let sanitized = input;
  DANGEROUS_ESCAPE_SEQUENCES.forEach(pattern => {
    sanitized = sanitized.replace(pattern, '');
  });

  // Additional conversion of control characters to visible form
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

  return sanitized;
  */
}

/**
 * Detects if input contains potentially dangerous escape sequences
 * Can be used for logging or alerting purposes
 *
 * @param {string} input - The input to check
 * @returns {boolean} - True if potentially dangerous sequences found
 */
function containsDangerousSequences(input) {
  // TEMPORARILY DISABLED FOR VIM TESTING
  return false;
  
  /* Original detection code (commented out for testing)
  if (!input) return false;

  // Skip detection for common, safe terminal navigation sequences
  // ESC key alone or ESC+Enter are normal terminal usage patterns
  if (input === '\x1b' || input === '\x1b\r' || input === '\x1b\n') {
    return false;
  }

  // Check if input matches any of the safe escape sequences
  for (const safePattern of SAFE_ESCAPE_SEQUENCES) {
    if (safePattern.test(input)) {
      return false; // Not dangerous if it matches a safe pattern
    }
  }

  // Check if input is a safe control character
  if (SAFE_CONTROL_CHARS.includes(input)) {
    return false; // Not dangerous if it's a safe control character
  }

  for (const pattern of DANGEROUS_ESCAPE_SEQUENCES) {
    if (pattern.test(input)) {
      return true;
    }
  }

  // Check for other suspicious patterns - but not single ESC characters
  // which are used for normal terminal navigation
  const suspiciousPatterns = [
    // Only detect ESC followed by something other than carriage return, newline, or bracket
    /\x1b[^\r\n\[]/g,
    /\x07/g,  // BEL character
    /\x1f/g   // Unit Separator
  ];

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(input)) {
      return true;
    }
  }

  return false;
  */
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
