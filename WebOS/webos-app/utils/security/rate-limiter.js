/**
 * Enhanced Rate Limiter Utility for WebOS
 *
 * Provides robust rate limiting for API endpoints to protect against:
 * - Brute force attacks on authentication and verification endpoints
 * - Excessive usage that could impact system performance
 * - Automated scraping or abuse of the API
 *
 * Features:
 * - In-memory storage with automatic cleanup
 * - Configurable window sizes, attempt limits, and lockout periods
 * - Detailed rate limit information for client responses
 * - Support for different rate limit strategies per endpoint
 */

import { logger } from '../logger';
import { extractInstanceId } from '../url-helpers';

// Default configuration
const DEFAULT_CONFIG = {
  windowMs: 60 * 1000,         // 1 minute window
  maxAttempts: 50,             
  lockoutMs: 2 * 60 * 1000,    // 2 minutes
  cleanupIntervalMs: 5 * 60 * 1000  // Cleanup interval (5 minutes)
};

class RateLimiter {
  constructor(config = {}) {
    // Merge provided config with defaults
    this.config = {
      ...DEFAULT_CONFIG,
      ...config
    };

    // Store for rate limit data
    this.store = new Map();

    // Start cleanup task
    this.startCleanupTask();

    logger.debug('Rate limiter initialized with config', this.config);
  }

  /**
   * Start periodic cleanup task to prevent memory leaks
   */
  startCleanupTask() {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      let cleanedEntries = 0;

      for (const [key, data] of this.store.entries()) {
        // Remove entries older than the lockout period
        if (now - data.timestamp > this.config.lockoutMs) {
          this.store.delete(key);
          cleanedEntries++;
        }
      }

      if (cleanedEntries > 0) {
        logger.debug(`Rate limiter cleanup: removed ${cleanedEntries} expired entries`);
      }
    }, this.config.cleanupIntervalMs);

    // Ensure cleanup task doesn't prevent Node from exiting
    this.cleanupInterval.unref();
  }

  /**
   * Generate a rate limit key from provided identifiers
   * @param {...string} identifiers - Unique identifiers to combine
   * @returns {string} - Combined key string
   */
  generateKey(...identifiers) {
    return identifiers.join(':');
  }

  /**
   * Check if a request is rate limited
   * @param {string} key - Unique identifier for the rate limited entity
   * @returns {Object} - Rate limit status: { limited, remainingAttempts, resetTime }
   */
  check(key) {
    const now = Date.now();

    // Get existing data or create new entry
    let data = this.store.get(key);
    if (!data) {
      data = { attempts: 0, timestamp: now, locked: false };
      this.store.set(key, data);
    }

    // Check if in lockout period
    if (data.locked) {
      const lockoutEnds = data.timestamp + this.config.lockoutMs;
      if (now < lockoutEnds) {
        return {
          limited: true,
          remainingAttempts: 0,
          resetTime: new Date(lockoutEnds)
        };
      } else {
        // Lockout period has ended, reset the counter
        data.attempts = 0;
        data.locked = false;
      }
    }

    // Check if in rate limit window
    if (now - data.timestamp > this.config.windowMs) {
      // Outside window, reset counter
      data.attempts = 0;
      data.timestamp = now;
    }

    // Update attempts
    data.attempts++;

    // Check if rate limit exceeded
    if (data.attempts > this.config.maxAttempts) {
      // Apply lockout
      data.locked = true;
      data.timestamp = now;

      logger.warn(`Rate limit exceeded for key: ${key}. Locked until ${new Date(now + this.config.lockoutMs)}`);

      return {
        limited: true,
        remainingAttempts: 0,
        resetTime: new Date(now + this.config.lockoutMs)
      };
    }

    // Not limited, return remaining attempts
    return {
      limited: false,
      remainingAttempts: this.config.maxAttempts - data.attempts,
      resetTime: new Date(data.timestamp + this.config.windowMs)
    };
  }

  /**
   * Generate HTTP headers for rate limit information
   * @param {Object} rateLimitStatus - Output from check() method
   * @returns {Object} - HTTP headers object
   */
  getHeaders(rateLimitStatus) {
    return {
      'X-RateLimit-Limit': this.config.maxAttempts.toString(),
      'X-RateLimit-Remaining': rateLimitStatus.remainingAttempts.toString(),
      'X-RateLimit-Reset': rateLimitStatus.resetTime.toISOString(),
      ...(rateLimitStatus.limited && {
        'Retry-After': Math.ceil((rateLimitStatus.resetTime - new Date()) / 1000).toString()
      })
    };
  }

  /**
   * Reset rate limit for a specific key
   * @param {string} key - Key to reset limits for
   */
  reset(key) {
    this.store.delete(key);
    logger.debug(`Rate limit reset for key: ${key}`);
  }

  /**
   * Clean up resources when no longer needed
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.store.clear();
    logger.debug('Rate limiter destroyed');
  }
}

// Create a singleton instance with default config
const defaultLimiter = new RateLimiter();

/**
 * Middleware creator for Next.js API routes
 * @param {Function} keyGenerator - Function to generate key from request (req => string)
 * @param {Object} options - Custom options for this specific limiter
 * @returns {Function} - Middleware function
 */
export function createRateLimitMiddleware(keyGenerator, options = {}) {
  const limiter = options.useCustomConfig ? new RateLimiter(options) : defaultLimiter;

  return async (req) => {
    const key = keyGenerator(req);
    const rateLimit = limiter.check(key);

    return {
      rateLimit,
      headers: limiter.getHeaders(rateLimit),
      exceeded: rateLimit.limited
    };
  };
}

/**
 * Create a specialized rate limiter for flag verification endpoints
 * Uses a more restrictive configuration to protect against brute force attacks
 */
export const flagVerificationLimiter = createRateLimitMiddleware(
  (req) => {
    const hostname = req.headers.get('host') || 'unknown';
    const domainName = process.env.DOMAIN_NAME || process.env.NEXT_PUBLIC_DOMAIN_NAME || '';
    const instanceId = extractInstanceId(hostname, domainName);
    // Get questionId from body - must be set on req object after body is parsed
    const questionId = req.questionId || 'unknown';
    return `flag:${instanceId}:${questionId}`;
  },
  {
    useCustomConfig: true,
    windowMs: 60 * 1000,        // 1 minute window
    maxAttempts: 10,           // Increased from 3 to 10
    lockoutMs: 5 * 60 * 1000,  // Reduced from 15 minutes to 5 minutes
  }
);

// Export both the class and singleton for flexibility
export { defaultLimiter, RateLimiter };

export default defaultLimiter;
