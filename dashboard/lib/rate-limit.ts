import { NextRequest, NextResponse } from 'next/server';

type Options = {
  uniqueTokenPerInterval?: number;
  interval?: number;
  limit?: number;
};

// Simple in-memory cache implementation
class SimpleCache {
  private cache: Map<string, { count: number; timestamp: number }>;
  private maxSize: number;
  private ttl: number;

  constructor(maxSize: number, ttl: number) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttl = ttl;
  }

  get(key: string): number | undefined {
    const item = this.cache.get(key);
    if (!item) return undefined;
    
    // Check if the item has expired
    if (Date.now() - item.timestamp > this.ttl) {
      this.cache.delete(key);
      return undefined;
    }
    
    return item.count;
  }

  set(key: string, count: number): void {
    // Clean up expired items if we're at capacity
    if (this.cache.size >= this.maxSize) {
      this.cleanup();
    }
    
    this.cache.set(key, { count, timestamp: Date.now() });
  }

  private cleanup(): void {
    const now = Date.now();
    // Use Array.from to avoid MapIterator issues
    const entries = Array.from(this.cache.entries());
    for (const [key, item] of entries) {
      if (now - item.timestamp > this.ttl) {
        this.cache.delete(key);
      }
    }
  }
}

/**
 * Rate limiting middleware using a simple in-memory cache
 */
export default function rateLimit(options: Options = {}) {
  const interval = options.interval || 60000; // 1 minute in milliseconds
  const maxSize = options.uniqueTokenPerInterval || 500;
  const tokenCache = new SimpleCache(maxSize, interval);

  return {
    check: (req: NextRequest, limit: number = options.limit || 10, token: string = extractIP(req)) =>
      new Promise<NextResponse | null>((resolve) => {
        const currentCount = tokenCache.get(token) || 0;
        
        // Increment the count
        const newCount = currentCount + 1;
        tokenCache.set(token, newCount);
        
        // Check if rate limited - only limit if we've exceeded the limit
        // This allows exactly 'limit' number of requests before blocking
        const isRateLimited = newCount > limit;
        
        if (isRateLimited) {
          const retryAfter = Math.floor(interval / 1000);
          const response = NextResponse.json(
            { error: 'Too Many Requests', message: `Rate limit exceeded. Try again in ${retryAfter} seconds.` },
            { status: 429 }
          );
          response.headers.set('Retry-After', String(retryAfter));
          return resolve(response);
        }
        
        return resolve(null);
      }),
  };
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