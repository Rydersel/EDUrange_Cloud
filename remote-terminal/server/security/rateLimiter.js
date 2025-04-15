/**
 * Rate Limiting Security Module for EDURange Terminal
 * 
 * This module provides rate limiting functionality to protect 
 * against brute force, DoS attacks, and API abuse.
 */

const { RateLimiterMemory } = require("rate-limiter-flexible");

/**
 * General rate limiter for all endpoints
 * Limits overall API usage per client
 */
const generalLimiter = new RateLimiterMemory({
  points: 250,             
  duration: 60,             // Per 60 seconds
  blockDuration: 60         // 1 minute
});

/**
 * Terminal creation limiter
 * More strict to prevent terminal spamming
 */
const terminalCreateLimiter = new RateLimiterMemory({
  points: 15,               
  duration: 60,             // Per 60 seconds
  blockDuration: 60 * 2     // 2 minutes
});

/**
 * Terminal input limiter
 * More generous to allow normal terminal usage
 */
const inputLimiter = new RateLimiterMemory({
  points: 300,             
  duration: 60,             // Per 60 seconds
  blockDuration: 30         // 30 seconds
});

/**
 * Apply general rate limiting to a request
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
const applyGeneralRateLimiting = async (req, res, next) => {
  // Skip rate limiting for static resources and output streams
  if (req.path.startsWith('/static') || req.path.match(/^\/terminal\/output\/[^\/]+$/)) {
    return next();
  }
  
  try {
    // Use IP address as key
    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
    await generalLimiter.consume(clientIP);
    next();
  } catch (error) {
    console.warn(`Rate limit exceeded for ${req.ip} on ${req.path}`);
    res.status(429).json({ 
      error: 'Too many requests, please try again later', 
      retryAfter: Math.ceil(error.msBeforeNext / 1000) || 60
    });
  }
};

/**
 * Apply terminal creation rate limiting
 * @param {string} clientIP - Client IP address
 * @returns {Promise<Object>} Result object with success flag and error if applicable
 */
const applyTerminalCreateRateLimiting = async (clientIP) => {
  try {
    await terminalCreateLimiter.consume(clientIP);
    return { success: true };
  } catch (error) {
    console.warn(`Terminal creation rate limit exceeded for ${clientIP}`);
    return { 
      success: false,
      error: 'Too many terminal sessions created. Please try again later.',
      status: 429,
      retryAfter: Math.ceil(error.msBeforeNext / 1000) || 300
    };
  }
};

/**
 * Apply input rate limiting
 * @param {string} clientIP - Client IP address
 * @param {string} sessionId - Terminal session ID
 * @returns {Promise<Object>} Result object with success flag and error if applicable
 */
const applyInputRateLimiting = async (clientIP, sessionId) => {
  try {
    await inputLimiter.consume(`${clientIP}:${sessionId}`);
    return { success: true };
  } catch (error) {
    console.warn(`Terminal input rate limit exceeded for ${clientIP} on session ${sessionId}`);
    return { 
      success: false,
      error: 'Too many inputs sent. Please slow down.',
      status: 429,
      retryAfter: Math.ceil(error.msBeforeNext / 1000) || 60
    };
  }
};

module.exports = {
  generalLimiter,
  terminalCreateLimiter,
  inputLimiter,
  applyGeneralRateLimiting,
  applyTerminalCreateRateLimiting,
  applyInputRateLimiting
}; 