import { NextRequest, NextResponse } from 'next/server';
import rateLimit from '../lib/rate-limit';

// Mock NextRequest
const createMockRequest = (ip: string = '127.0.0.1', path: string = '/api/auth/signin') => {
  const headers = new Headers();
  headers.set('x-forwarded-for', ip);
  
  return {
    headers: headers,
    nextUrl: { pathname: path }
  } as unknown as NextRequest;
};

describe('Rate Limit Utility', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should allow requests under the limit', async () => {
    const limiter = rateLimit({ limit: 3, interval: 60000 });
    const req = createMockRequest();
    
    // First request
    let result = await limiter.check(req);
    expect(result).toBeNull();
    
    // Second request
    result = await limiter.check(req);
    expect(result).toBeNull();
    
    // Third request (at the limit)
    result = await limiter.check(req);
    expect(result).toBeNull();
  });

  it('should block requests over the limit', async () => {
    const limiter = rateLimit({ limit: 3, interval: 60000 });
    const req = createMockRequest();
    
    // Make 3 requests (at the limit)
    await limiter.check(req);
    await limiter.check(req);
    await limiter.check(req);
    
    // Fourth request (over the limit)
    const result = await limiter.check(req);
    expect(result).not.toBeNull();
    expect(result?.status).toBe(429);
    
    // Check response headers
    const headers = result?.headers;
    expect(headers?.get('Retry-After')).toBe('60');
  });

  it('should reset after the interval', async () => {
    const limiter = rateLimit({ limit: 3, interval: 60000 });
    const req = createMockRequest();
    
    // Make 3 requests (at the limit)
    await limiter.check(req);
    await limiter.check(req);
    await limiter.check(req);
    
    // Fourth request (over the limit)
    let result = await limiter.check(req);
    expect(result?.status).toBe(429);
    
    // Advance time past the interval
    jest.advanceTimersByTime(61000);
    
    // Should be allowed again
    result = await limiter.check(req);
    expect(result).toBeNull();
  });

  it('should track different IPs separately', async () => {
    const limiter = rateLimit({ limit: 3, interval: 60000 });
    const req1 = createMockRequest('192.168.1.1');
    const req2 = createMockRequest('192.168.1.2');
    
    // Make 3 requests from IP1 (at the limit)
    await limiter.check(req1);
    await limiter.check(req1);
    await limiter.check(req1);
    
    // Fourth request from IP1 (over the limit)
    const resultIP1 = await limiter.check(req1);
    expect(resultIP1?.status).toBe(429);
    
    // First request from IP2 (should be allowed)
    const resultIP2 = await limiter.check(req2);
    expect(resultIP2).toBeNull();
  });

  it('should handle missing X-Forwarded-For header', async () => {
    const limiter = rateLimit({ limit: 2, interval: 60000 });
    
    // Create a request without X-Forwarded-For header
    const req = {
      headers: new Headers(),
      nextUrl: { pathname: '/api/auth/signin' }
    } as unknown as NextRequest;
    
    // Should still work with fallback IP
    let result = await limiter.check(req);
    expect(result).toBeNull();
    
    result = await limiter.check(req);
    expect(result).toBeNull();
    
    result = await limiter.check(req);
    expect(result?.status).toBe(429);
  });

  it('should use custom token instead of IP if provided', async () => {
    const limiter = rateLimit({ limit: 2, interval: 60000 });
    const req1 = createMockRequest('192.168.1.1');
    const req2 = createMockRequest('192.168.1.2');
    
    // Use custom token "user123" for both requests from different IPs
    await limiter.check(req1, 2, 'user123');
    await limiter.check(req1, 2, 'user123');
    
    // Third request with same token should be limited, even from different IP
    const result = await limiter.check(req2, 2, 'user123');
    expect(result?.status).toBe(429);
  });

  it('should handle custom limits per check call', async () => {
    const limiter = rateLimit({ limit: 5, interval: 60000 }); // Default limit is 5
    const req = createMockRequest();
    
    // Override with limit of 2 for this specific check
    await limiter.check(req, 2);
    await limiter.check(req, 2);
    
    // Third request should be limited because we specified limit=2
    const result = await limiter.check(req, 2);
    expect(result?.status).toBe(429);
  });

  it('should handle multiple concurrent requests', async () => {
    const limiter = rateLimit({ limit: 3, interval: 60000 });
    const req = createMockRequest();
    
    // Send 5 concurrent requests
    const results = await Promise.all([
      limiter.check(req),
      limiter.check(req),
      limiter.check(req),
      limiter.check(req),
      limiter.check(req)
    ]);
    
    // First 3 should be allowed, last 2 should be limited
    expect(results[0]).toBeNull();
    expect(results[1]).toBeNull();
    expect(results[2]).toBeNull();
    expect(results[3]?.status).toBe(429);
    expect(results[4]?.status).toBe(429);
  });

  it('should handle very short intervals correctly', async () => {
    const limiter = rateLimit({ limit: 2, interval: 1000 }); // 1 second interval
    const req = createMockRequest();
    
    // First 2 requests
    await limiter.check(req);
    await limiter.check(req);
    
    // Third request (should be limited)
    let result = await limiter.check(req);
    expect(result?.status).toBe(429);
    
    // Advance time by 1.1 seconds
    jest.advanceTimersByTime(1100);
    
    // Should be allowed again
    result = await limiter.check(req);
    expect(result).toBeNull();
  });

  it('should clean up expired entries', async () => {
    // Create a limiter with small maxSize to force cleanup
    const limiter = rateLimit({ 
      limit: 2, 
      interval: 1000, 
      uniqueTokenPerInterval: 3 // Only store 3 IPs at a time
    });
    
    // Make requests from 3 different IPs
    await limiter.check(createMockRequest('192.168.1.1'));
    await limiter.check(createMockRequest('192.168.1.2'));
    await limiter.check(createMockRequest('192.168.1.3'));
    
    // Advance time to expire the first entries
    jest.advanceTimersByTime(1100);
    
    // Make a request from a 4th IP, which should trigger cleanup
    await limiter.check(createMockRequest('192.168.1.4'));
    
    // The first IP's limit should be reset due to cleanup
    const result = await limiter.check(createMockRequest('192.168.1.1'));
    expect(result).toBeNull(); // Should be allowed again
  });
}); 