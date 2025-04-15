import { NextRequest, NextResponse } from 'next/server';
import { getRedisClient, isRedisAvailable } from './redis-client';

interface RateLimiterOptions {
  interval?: number;  // time window in milliseconds
  limit?: number;     // maximum requests per interval
  blockDuration?: number; // how long to block if limit exceeded, in milliseconds
}

/**
 * Redis-based rate limiter with in-memory fallback
 */
class RateLimiter {
  private redisClient: any;
  private useRedis: boolean = false;
  private keyPrefix: string;
  private points: number;
  private duration: number;
  private blockDuration: number;
  private memoryStore: {
    counters: Record<string, { count: number, resetAt: Date }>;
    blocks: Record<string, Date>;
  };

  constructor(options: RateLimiterOptions = {}) {
    this.redisClient = getRedisClient();
    this.useRedis = this.redisClient !== null;
    this.keyPrefix = 'dashboard_rate_limit';
    this.points = options.limit || 10;
    this.duration = options.interval || 60000; // 1 minute in milliseconds
    this.blockDuration = options.blockDuration || 120000; // 2 minutes in milliseconds
    
    // Initialize memory store for fallback
    this.memoryStore = {
      counters: {},
      blocks: {}
    };
    
    if (this.useRedis) {
      console.log('Using Redis-based rate limiting');
    } else {
      console.log('Using memory-based rate limiting');
    }
  }

  /**
   * Check if a request should be rate limited
   */
  async check(req: NextRequest, customLimit?: number, customToken?: string): Promise<NextResponse | null> {
    const token = customToken || extractIP(req);
    const limit = customLimit || this.points;
    
    try {
      if (this.useRedis) {
        return await this.checkRedis(token, limit);
      } else {
        return this.checkMemory(token, limit);
      }
    } catch (error) {
      console.error('Rate limiting error:', error);
      // On error, allow the request
      return null;
    }
  }

  /**
   * Check rate limit using Redis
   */
  private async checkRedis(token: string, limit: number): Promise<NextResponse | null> {
    // Check if token is blocked
    const blockKey = `${this.keyPrefix}:${token}:block`;
    const isBlocked = await this.redisClient.exists(blockKey);
    
    if (isBlocked) {
      const ttl = await this.redisClient.ttl(blockKey);
      const retryAfter = Math.max(1, ttl);
      
      return createRateLimitResponse(retryAfter);
    }
    
    // Get or create counter
    const counterKey = `${this.keyPrefix}:${token}`;
    const current = await this.redisClient.get(counterKey);
    
    if (current === null) {
      // First request, set counter to 1 with expiration
      await this.redisClient.setex(counterKey, Math.floor(this.duration / 1000), 1);
      return null;
    }
    
    const count = parseInt(current, 10);
    if (count >= limit) {
      // Block the token
      const blockDurationSeconds = Math.floor(this.blockDuration / 1000);
      await this.redisClient.setex(blockKey, blockDurationSeconds, 1);
      
      return createRateLimitResponse(blockDurationSeconds);
    }
    
    // Increment the counter
    await this.redisClient.incr(counterKey);
    return null;
  }

  /**
   * Check rate limit using in-memory store (fallback)
   */
  private checkMemory(token: string, limit: number): NextResponse | null {
    const now = new Date();
    
    // Check if token is blocked
    if (this.memoryStore.blocks[token]) {
      const blockUntil = this.memoryStore.blocks[token];
      if (now < blockUntil) {
        const secondsRemaining = Math.ceil((blockUntil.getTime() - now.getTime()) / 1000);
        return createRateLimitResponse(secondsRemaining);
      } else {
        // Remove expired block
        delete this.memoryStore.blocks[token];
      }
    }
    
    // Get or create counter
    if (!this.memoryStore.counters[token]) {
      this.memoryStore.counters[token] = {
        count: 1,
        resetAt: new Date(now.getTime() + this.duration)
      };
      return null;
    }
    
    const counter = this.memoryStore.counters[token];
    
    // Reset if expired
    if (now > counter.resetAt) {
      counter.count = 1;
      counter.resetAt = new Date(now.getTime() + this.duration);
      return null;
    }
    
    // Check if limit exceeded
    if (counter.count >= limit) {
      // Block the token
      this.memoryStore.blocks[token] = new Date(now.getTime() + this.blockDuration);
      
      const secondsUntilUnblocked = Math.ceil(this.blockDuration / 1000);
      return createRateLimitResponse(secondsUntilUnblocked);
    }
    
    // Increment the counter
    counter.count += 1;
    return null;
  }
  
  /**
   * Get remaining tokens for a key (for debugging/metrics)
   */
  async getRemainingTokens(token: string): Promise<number> {
    if (this.useRedis) {
      const counterKey = `${this.keyPrefix}:${token}`;
      const current = await this.redisClient.get(counterKey);
      if (current === null) return this.points;
      return this.points - parseInt(current, 10);
    } else {
      if (!this.memoryStore.counters[token]) return this.points;
      return this.points - this.memoryStore.counters[token].count;
    }
  }
}

/**
 * Create a rate limit response with proper headers
 */
function createRateLimitResponse(retryAfter: number): NextResponse {
  const response = NextResponse.json(
    { 
      error: 'Too Many Requests', 
      message: `Rate limit exceeded. Try again in ${retryAfter} seconds.` 
    },
    { status: 429 }
  );
  
  response.headers.set('Retry-After', String(retryAfter));
  return response;
}

/**
 * Extract IP address from request
 */
function extractIP(req: NextRequest): string {
  // Get IP from X-Forwarded-For header or fallback to connection remote address
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }
  
  // Fallback to connection remote address
  return 'unknown-ip';
}

/**
 * Rate limiting middleware factory function
 */
export default function rateLimit(options: RateLimiterOptions = {}) {
  const limiter = new RateLimiter(options);
  
  return {
    check: (req: NextRequest, customLimit?: number, customToken?: string) => 
      limiter.check(req, customLimit, customToken)
  };
} 