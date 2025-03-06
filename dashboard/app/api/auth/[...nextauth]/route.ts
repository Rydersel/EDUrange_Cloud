import { NextRequest, NextResponse } from 'next/server';
import { GET as NextAuthGET, POST as NextAuthPOST } from '@/auth';
import rateLimit from '@/lib/rate-limit';

// Create a rate limiter with specific options for authentication
const authLimiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 500,
  limit: 5, // 5 requests per minute per IP
});

export async function GET(req: NextRequest) {
  // Apply rate limiting for sign-in attempts
  const path = req.nextUrl.pathname;
  if (path.includes('/api/auth/signin') || path.includes('/api/auth/callback')) {
    const rateLimitResult = await authLimiter.check(req);
    if (rateLimitResult) return rateLimitResult;
  }
  
  return NextAuthGET(req);
}

export async function POST(req: NextRequest) {
  // Apply rate limiting for sign-in attempts
  const path = req.nextUrl.pathname;
  if (path.includes('/api/auth/signin') || path.includes('/api/auth/callback')) {
    const rateLimitResult = await authLimiter.check(req);
    if (rateLimitResult) return rateLimitResult;
  }
  
  return NextAuthPOST(req);
}
