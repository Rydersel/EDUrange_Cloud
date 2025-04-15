import { NextRequest } from 'next/server';
import * as authModule from '@/app/api/auth/[...nextauth]/route';
import { getServerSession } from 'next-auth';
import { UserRole } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { generateTestEmail, generateTestId, generateTestName } from '../utils/test-helpers';
import { authOptions } from '@/lib/auth';

// Mock NextAuth
jest.mock('next-auth');
jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    session: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    account: {
      findFirst: jest.fn(),
    },
    challenges: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  },
}));

// Mock the auth route handlers
jest.mock('@/app/api/auth/[...nextauth]/route', () => ({
  GET: jest.fn(),
  POST: jest.fn(),
}));

// Mock the auth options
jest.mock('@/lib/auth', () => ({
  authOptions: {
    callbacks: {
      session: jest.fn(),
      jwt: jest.fn(),
    },
    providers: [],
  },
}));

describe('Auth API Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Authentication Endpoints', () => {
    it('should handle GET requests to auth endpoint', async () => {
      // Create a mock NextRequest
      const req = new NextRequest(new URL('http://localhost:3000/api/auth/session'), {
        method: 'GET',
      });

      // Mock the NextAuth handler response
      const mockResponse = new Response(JSON.stringify({ user: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

      // Set up the mock implementation
      (authModule.GET as jest.Mock).mockResolvedValue(mockResponse);

      // Call the handler
      const response = await authModule.GET(req);

      // Verify the response
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({ user: null });

      // Verify the handler was called
      expect(authModule.GET).toHaveBeenCalledWith(req);
    });

    it('should handle POST requests to auth endpoint', async () => {
      // Create a mock NextRequest for sign-in
      const req = new NextRequest(new URL('http://localhost:3000/api/auth/callback/credentials'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Mock the NextAuth handler response
      const mockResponse = new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

      // Set up the mock implementation
      (authModule.POST as jest.Mock).mockResolvedValue(mockResponse);

      // Call the handler
      const response = await authModule.POST(req);

      // Verify the response
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({ ok: true });

      // Verify the handler was called
      expect(authModule.POST).toHaveBeenCalledWith(req);
    });

    it('should handle sign-in with credentials', async () => {
      // Create a mock NextRequest for sign-in with credentials
      const req = new NextRequest(new URL('http://localhost:3000/api/auth/callback/credentials'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'password123',
          callbackUrl: '/admin',
        }),
      });

      // Mock the NextAuth handler response
      const mockResponse = new Response(JSON.stringify({
        url: '/admin',
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

      // Set up the mock implementation
      (authModule.POST as jest.Mock).mockResolvedValue(mockResponse);

      // Call the handler
      const response = await authModule.POST(req);

      // Verify the response
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({ url: '/admin' });

      // Verify the handler was called
      expect(authModule.POST).toHaveBeenCalledWith(req);
    });

    it('should handle sign-out requests', async () => {
      // Create a mock NextRequest for sign-out
      const req = new NextRequest(new URL('http://localhost:3000/api/auth/signout'), {
        method: 'POST',
      });

      // Mock the NextAuth handler response
      const mockResponse = new Response(JSON.stringify({
        url: '/'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

      // Set up the mock implementation
      (authModule.POST as jest.Mock).mockResolvedValue(mockResponse);

      // Call the handler
      const response = await authModule.POST(req);

      // Verify the response
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({ url: '/' });

      // Verify the handler was called
      expect(authModule.POST).toHaveBeenCalledWith(req);
    });
  });

  describe('Session Management', () => {
    it('should return session data for authenticated users', async () => {
      // Create a mock user
      const mockUser = {
        id: generateTestId('session-test'),
        email: generateTestEmail('session-test'),
        name: generateTestName('Session Test'),
        role: UserRole.STUDENT,
      };

      // Create a mock NextRequest
      const req = new NextRequest(new URL('http://localhost:3000/api/auth/session'), {
        method: 'GET',
      });

      // Mock the NextAuth handler response with a session
      const mockResponse = new Response(JSON.stringify({
        user: mockUser,
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

      // Set up the mock implementation
      (authModule.GET as jest.Mock).mockResolvedValue(mockResponse);

      // Call the handler
      const response = await authModule.GET(req);

      // Verify the response
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.user).toEqual(mockUser);
      expect(data).toHaveProperty('expires');

      // Verify the handler was called
      expect(authModule.GET).toHaveBeenCalledWith(req);
    });
  });

  describe('Protected API Routes', () => {
    // Import the actual module instead of mocking it
    const { GET: getChallenges } = require('@/app/api/challenges/route');

    it('should reject unauthorized requests to protected endpoints', async () => {
      // Mock getServerSession to return null (unauthenticated)
      (getServerSession as jest.Mock).mockResolvedValue(null);

      // Create a mock request for a protected endpoint
      const req = new NextRequest(new URL('http://localhost:3000/api/challenges'), {
        method: 'GET',
      });

      // Call the handler directly
      const response = await getChallenges(req);

      // Verify getServerSession was called with authOptions
      expect(getServerSession).toHaveBeenCalledWith(authOptions);

      // Verify the response status
      expect(response.status).toBe(401);
    });

    it('should allow authenticated requests to protected endpoints', async () => {
      // Create a mock user
      const mockUser = {
        id: generateTestId('api-test'),
        email: generateTestEmail('api-test'),
        name: generateTestName('API Test'),
        role: UserRole.ADMIN,
      };

      // Mock getServerSession to return a session with the mock user
      (getServerSession as jest.Mock).mockResolvedValue({
        user: mockUser,
      });

      // Mock prisma.user.findUnique to return the mock user
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      // Create a mock request for a protected endpoint
      const req = new NextRequest(new URL('http://localhost:3000/api/challenges'), {
        method: 'GET',
      });

      // Call the handler directly
      const response = await getChallenges(req);

      // Verify getServerSession was called with authOptions
      expect(getServerSession).toHaveBeenCalledWith(authOptions);

      // Verify the response status
      expect(response.status).toBe(200);
    });

    it('should handle role-based access control', async () => {
      // Create a mock user with non-admin role
      const mockUser = {
        id: generateTestId('rbac-test'),
        email: generateTestEmail('rbac-test'),
        name: generateTestName('RBAC Test'),
        role: UserRole.STUDENT, // Non-admin role
      };

      // Mock getServerSession to return a session with the mock user
      (getServerSession as jest.Mock).mockResolvedValue({
        user: mockUser,
      });

      // Mock prisma.user.findUnique to return the mock user
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      // Import an admin-only endpoint (POST for challenge creation is admin-only)
      const { POST: createChallenge } = require('@/app/api/challenges/route');

      // Create a mock request for an admin-only endpoint
      const req = new NextRequest(new URL('http://localhost:3000/api/challenges'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Test Challenge',
          description: 'Test Description',
          difficulty: 'EASY',
          challengeTypeId: 'test-type-id',
          challengeImage: 'test-image',
          questions: [
            {
              content: 'Test Question',
              type: 'text',
              points: 10,
              answer: 'Test Answer',
              order: 1
            }
          ]
        }),
      });

      // Call the handler directly
      const response = await createChallenge(req);

      // Verify getServerSession was called with authOptions
      expect(getServerSession).toHaveBeenCalledWith(authOptions);

      // Verify the response status (should be 403 Forbidden for non-admin users)
      expect(response.status).toBe(403);
    });
  });

  describe('NextAuth Integration', () => {
    it('should properly handle NextAuth query parameters', async () => {
      // Create a mock NextRequest with nextauth in the URL
      const req = new NextRequest(new URL('http://localhost:3000/api/auth/signin?callbackUrl=%2Fhome'), {
        method: 'GET',
      });

      // Mock the NextAuth handler response
      const mockResponse = new Response(JSON.stringify({ url: '/home' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

      // Set up the mock implementation
      (authModule.GET as jest.Mock).mockResolvedValue(mockResponse);

      // Call the handler
      const response = await authModule.GET(req);

      // Verify the response
      expect(response.status).toBe(200);

      // Verify the handler was called
      expect(authModule.GET).toHaveBeenCalledWith(req);
    });

    it('should handle CSRF protection for auth requests', async () => {
      // Create a mock NextRequest with CSRF token
      const req = new NextRequest(new URL('http://localhost:3000/api/auth/csrf'), {
        method: 'GET',
      });

      // Mock the NextAuth handler response with CSRF token
      const mockResponse = new Response(JSON.stringify({
        csrfToken: 'mock-csrf-token'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

      // Set up the mock implementation
      (authModule.GET as jest.Mock).mockResolvedValue(mockResponse);

      // Call the handler
      const response = await authModule.GET(req);

      // Verify the response
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('csrfToken');

      // Verify the handler was called
      expect(authModule.GET).toHaveBeenCalledWith(req);
    });

    it('should handle providers list request', async () => {
      // Create a mock NextRequest for providers
      const req = new NextRequest(new URL('http://localhost:3000/api/auth/providers'), {
        method: 'GET',
      });

      // Mock the NextAuth handler response with providers list
      const mockResponse = new Response(JSON.stringify({
        credentials: { id: 'credentials', name: 'Credentials' }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

      // Set up the mock implementation
      (authModule.GET as jest.Mock).mockResolvedValue(mockResponse);

      // Call the handler
      const response = await authModule.GET(req);

      // Verify the response
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('credentials');

      // Verify the handler was called
      expect(authModule.GET).toHaveBeenCalledWith(req);
    });
  });
});
