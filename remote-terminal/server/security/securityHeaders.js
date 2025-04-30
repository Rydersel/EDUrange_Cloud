/**
 * Security Headers Module for EDURange Terminal
 * 
 * This module implements HTTP security headers to protect against
 * common web vulnerabilities like XSS, clickjacking, MIME sniffing, etc.
 */

/**
 * Apply security headers to all responses
 * 
 * Headers implemented:
 * - X-Frame-Options: Prevents clickjacking attacks
 * - X-XSS-Protection: Enables browser's XSS filter
 * - X-Content-Type-Options: Prevents MIME type sniffing
 * - Content-Security-Policy: Restricts resource loading
 * - Cache-Control: Prevents caching of sensitive data
 * - Strict-Transport-Security: Enforces HTTPS
 * - Referrer-Policy: Enhances privacy
 * - Permissions-Policy: Restricts browser features
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const applySecurityHeaders = (req, res, next) => {
  // Prevent clickjacking attacks
  res.setHeader("X-Frame-Options", "DENY");
  
  // Enable XSS protection in browsers
  res.setHeader("X-XSS-Protection", "1; mode=block");
  
  // Prevent MIME type sniffing
  res.setHeader("X-Content-Type-Options", "nosniff");
  
  // Strict Content Security Policy
  res.setHeader("Content-Security-Policy", 
    "default-src 'self'; " +
    "script-src 'self'; " +
    "connect-src 'self' http: https:; " +
    "img-src 'self' data:; " +
    "style-src 'self' 'unsafe-inline'; " +
    "font-src 'self'; " +
    "frame-src 'none'; " +
    "object-src 'none'"
  );
  
  // Disable caching of sensitive pages
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  
  // HTTP Strict Transport Security (when behind HTTPS)
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  
  // Disable Referrer for privacy
  res.setHeader("Referrer-Policy", "no-referrer");
  
  // Disable feature policy to reduce risk
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  
  next();
};

/**
 * Apply CORS headers for cross-origin requests
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const applyCorsHeaders = (req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  next();
};

module.exports = {
  applySecurityHeaders,
  applyCorsHeaders
}; 