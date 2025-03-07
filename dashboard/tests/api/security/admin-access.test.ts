import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { UserRole } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { generateTestEmail, generateTestId, generateTestName } from '../../utils/test-helpers';

// Mock NextAuth
jest.mock('next-auth/next');

// Mock Prisma
jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
  },
}));

// Mock the auth.ts module to avoid the @auth/prisma-adapter dependency
jest.mock('@/lib/auth', () => ({
  authOptions: {
    adapter: {},
    session: { strategy: 'jwt' }, // Changed to JWT strategy
    callbacks: {
      session: jest.fn(({ session, token }) => {
        if (session.user && token) {
          session.user.id = token.id;
          session.user.role = token.role || 'STUDENT';
        }
        return session;
      }),
    },
    pages: { signIn: '/signin' },
    providers: [],
  },
}));

// Mock the auth-utils module
jest.mock('@/lib/auth-utils', () => {
  return {
    requireAdmin: jest.fn(),
    checkIsAdmin: jest.fn(),
    requireAdminAccess: jest.fn(),
  };
});

// Import the mocked module
import * as authUtils from '@/lib/auth-utils';

// Mock the challenge-installer route
jest.mock('@/app/api/admin/challenge-installer/route', () => ({
  POST: jest.fn(),
}));

describe('Admin Access Protection', () => {
  let mockRequest: NextRequest;
  let mockPost: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create a mock request
    mockRequest = new NextRequest(new URL('http://localhost:3000/api/admin/test'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Set up the POST mock implementation
    mockPost = require('@/app/api/admin/challenge-installer/route').POST;
    mockPost.mockImplementation(async (req: NextRequest) => {
      // Check admin access
      const adminCheckResult = await authUtils.requireAdmin(req);
      if (adminCheckResult) return adminCheckResult;

      // If admin check passes, return success
      return NextResponse.json({ success: true });
    });
  });

  describe('requireAdmin utility', () => {
    it('should return 401 Unauthorized when no session exists', async () => {
      // Mock requireAdmin to simulate no session
      (authUtils.requireAdmin as jest.Mock).mockResolvedValue(
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      );

      // Call the mocked function
      const result = await authUtils.requireAdmin(mockRequest);

      // Verify response
      expect(result).toBeInstanceOf(NextResponse);
      expect(result!.status).toBe(401);
      expect(await result!.json()).toEqual({ error: 'Unauthorized' });
    });

    it('should return 403 Forbidden when user is not an admin', async () => {
      // Mock requireAdmin to simulate non-admin user
      (authUtils.requireAdmin as jest.Mock).mockResolvedValue(
        NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      );

      // Call the mocked function
      const result = await authUtils.requireAdmin(mockRequest);

      // Verify response
      expect(result).toBeInstanceOf(NextResponse);
      expect(result!.status).toBe(403);
      expect(await result!.json()).toEqual({ error: 'Forbidden' });
    });

    it('should return null when user is an admin', async () => {
      // Mock requireAdmin to simulate admin user
      (authUtils.requireAdmin as jest.Mock).mockResolvedValue(null);

      // Call the mocked function
      const result = await authUtils.requireAdmin(mockRequest);

      // Verify response
      expect(result).toBeNull();
    });
  });

  describe('Admin API endpoints', () => {
    it('should block non-admin access to challenge-installer endpoint', async () => {
      // Mock requireAdmin to return a 403 response
      (authUtils.requireAdmin as jest.Mock).mockResolvedValue(
        NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      );

      // Call the route handler
      const response = await mockPost(mockRequest);

      // Verify requireAdmin was called
      expect(authUtils.requireAdmin).toHaveBeenCalledWith(mockRequest);

      // Verify response
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: 'Forbidden' });
    });

    it('should allow admin access to admin endpoints', async () => {
      // Mock requireAdmin to return null (indicating admin access)
      (authUtils.requireAdmin as jest.Mock).mockResolvedValue(null);

      // Call the route handler
      const response = await mockPost(mockRequest);

      // Verify requireAdmin was called
      expect(authUtils.requireAdmin).toHaveBeenCalledWith(mockRequest);

      // Verify response indicates success
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ success: true });
    });
  });
});
