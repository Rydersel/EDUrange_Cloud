import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

// Get the domain from environment variable or use a default
// Edge Runtime can access process.env directly but not dotenv.config()
const CONNECT_SRC_DOMAIN = process.env.CONNECT_SRC_DOMAIN || '*.localhost';

// Define protected routes
const ADMIN_ROUTES = [
  '/admin', // This will match all paths that start with /admin
];

// Authenticated routes that require login
const AUTHENTICATED_ROUTES = [
  '/profile',
  '/competitions',
];

// Public routes that should never redirect
const PUBLIC_ROUTES = [
  '/signin',
  '/api',
  '/',
  '/login',
  '/home',
];

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Skip middleware for public routes and static assets
  if (PUBLIC_ROUTES.some(route => path.startsWith(route)) ||
      path.match(/\.(js|css|svg|png|jpg|jpeg|gif|ico|json)$/)) {
    return NextResponse.next();
  }

  // Check if the path is protected
  // For /admin paths, we'll check if it starts with /admin
  const isAdminRoute = path.startsWith('/admin') || ADMIN_ROUTES;
  const isAuthenticatedRoute = AUTHENTICATED_ROUTES.some(route => path.startsWith(route)) || isAdminRoute;

  // If it's a protected route, verify the token
  if (isAuthenticatedRoute) {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });

    // If no token or token is invalid, redirect to signin page
    if (!token) {
      // Redirect to signin page with callback URL
      const callbackUrl = encodeURIComponent(request.nextUrl.pathname);
      return NextResponse.redirect(new URL(`/auth/signin?callbackUrl=${callbackUrl}`, request.url));
    }

    // For admin routes, check if user is an admin
    if (isAdminRoute && token.role !== 'ADMIN') {
      // Redirect non-admin users to home page
      return NextResponse.redirect(new URL('/invalid-permission', request.url));
    }
  }

  // Get the response
  const response = NextResponse.next();

  // Set security headers
  const headers = response.headers;

  // Content Security Policy
  headers.set(
    'Content-Security-Policy',
    `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://utfs.io https://avatars.githubusercontent.com; font-src 'self' data:; connect-src 'self' https://${CONNECT_SRC_DOMAIN};`
  );

  // Prevent MIME type sniffing
  headers.set('X-Content-Type-Options', 'nosniff');

  // Prevent clickjacking
  headers.set('X-Frame-Options', 'DENY');

  // Enable strict XSS protection
  headers.set('X-XSS-Protection', '1; mode=block');

  // HTTP Strict Transport Security
  headers.set(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains; preload'
  );

  // Control referrer information
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions Policy
  headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), interest-cohort=()'
  );

  return response;
}

// Default export for Next.js middleware
export default middleware;

// Specify which paths this middleware should run on
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    {
      source: '/((?!_next/static|_next/image|favicon.ico|.*\\.svg$|.*\\.png$|.*\\.jpg$|.*\\.ico$).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
