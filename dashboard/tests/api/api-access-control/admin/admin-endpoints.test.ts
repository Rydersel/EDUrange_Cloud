import { NextResponse } from 'next/server';
import { withTestTransaction } from '../../../utils/test-helpers';
import {
  createTestRequest,
  setupTestUsers,
  createTestChallenge,
  mockUserSession,
  resetMocks
} from '../base-test';

// Import the actual route handlers
import * as challengeInstallerRoute from '@/app/api/admin/challenge-installer/route';
import * as featuredModulesRoute from '@/app/api/admin/featured-modules/route';
import * as challengesIdRoute from '@/app/api/admin/challenges/[id]/route';

// Mock NextAuth
jest.mock('next-auth');

// Mock Prisma
jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    challenges: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation((data) => Promise.resolve(data.data)),
      findUnique: jest.fn(),
    },
    challengeType: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn().mockImplementation((data) => Promise.resolve({
        id: 'test-challenge-type-id',
        name: data.data.name,
        createdAt: new Date(),
        updatedAt: new Date()
      })),
    },
    challengeQuestion: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockImplementation((data) => Promise.resolve({
        id: 'test-question-id',
        challengeId: data.data.challengeId,
        content: data.data.content,
        type: data.data.type,
        points: data.data.points,
        answer: data.data.answer,
        order: data.data.order || 1,
        createdAt: new Date(),
        updatedAt: new Date()
      })),
    },
    activityLog: {
      create: jest.fn().mockResolvedValue({
        id: 'mock-activity-log-id',
        eventType: 'SYSTEM_ERROR',
        userId: 'mock-user-id',
        metadata: {},
        timestamp: new Date(),
        severity: 'INFO'
      }),
    },
  },
}));

/**
 * Admin API Endpoints Access Control Tests
 *
 * These tests verify that the admin API endpoints properly implement access controls.
 * Specifically, they test:
 *
 * 1. That admin users can access admin-only endpoints
 * 2. That non-admin users (instructors and students) receive a 403 Forbidden response
 * 3. That unauthenticated users receive a 401 Unauthorized response
 *
 * Unlike unit tests that mock the requireAdmin function, these tests call the actual
 * API endpoint handlers directly, testing the complete access control flow including:
 * - Session validation
 * - Role checking
 * - Integration with the requireAdmin middleware
 * - Proper error responses
 *
 * This approach provides more comprehensive testing by verifying that the access controls
 * are properly integrated into the real endpoints.
 *
 * Endpoints tested:
 * - POST /api/admin/challenge-installer
 * - GET /api/admin/featured-modules
 * - DELETE /api/admin/challenges/[id]
 */
describe('Admin API Endpoints Access Control', () => {
  // Reset mocks before each test
  beforeEach(() => {
    resetMocks();
  });

  // Test POST /api/admin/challenge-installer
  describe('POST /api/admin/challenge-installer', () => {
    /**
     * Test: Admin users should be able to access the challenge installer endpoint
     *
     * This test verifies that:
     * 1. When an admin user makes a request to the challenge installer endpoint
     * 2. The request is not rejected with a 401 or 403 status code
     * 3. The access control check in the endpoint allows the request to proceed
     *
     * Note: The actual response might still be an error (e.g., 400 Bad Request) due to
     * validation or other issues, but we're only testing that the admin check passes.
     */
    it('should allow admin users to access the endpoint', async () => {
      await withTestTransaction(async (tx) => {
        const { adminUser } = await setupTestUsers(tx);
        mockUserSession(adminUser);

        const req = createTestRequest('/api/admin/challenge-installer', 'POST', {
          moduleName: 'Test Module',
          challenges: [{
            name: 'Test Challenge',
            description: 'Test description',
            difficulty: 'EASY',
            questions: [{
              content: 'Test question',
              type: 'text',
              points: 10,
              answer: 'Test answer'
            }]
          }]
        });

        // Call the actual route handler
        const response = await challengeInstallerRoute.POST(req);

        // Verify that the response is not a 401 or 403
        expect(response.status).not.toBe(401);
        expect(response.status).not.toBe(403);

        // The actual response might be a 400 or other error due to validation or other issues,
        // but we're only testing that the admin check passes
      });
    });

    /**
     * Test: Instructor users should be denied access to the challenge installer endpoint
     *
     * This test verifies that:
     * 1. When an instructor user makes a request to the challenge installer endpoint
     * 2. The request is rejected with a 403 Forbidden status code
     * 3. The response contains an error message indicating "Forbidden"
     * 4. The access control check in the endpoint correctly identifies non-admin users
     */
    it('should deny access to instructor users', async () => {
      await withTestTransaction(async (tx) => {
        const { instructorUser } = await setupTestUsers(tx);
        mockUserSession(instructorUser);

        const req = createTestRequest('/api/admin/challenge-installer', 'POST');

        // Call the actual route handler
        const response = await challengeInstallerRoute.POST(req);

        // Verify that the response is a 403 Forbidden
        expect(response.status).toBe(403);
        const data = await response.json();
        expect(data.error).toBe('Forbidden');
      });
    });

    /**
     * Test: Student users should be denied access to the challenge installer endpoint
     *
     * This test verifies that:
     * 1. When a student user makes a request to the challenge installer endpoint
     * 2. The request is rejected with a 403 Forbidden status code
     * 3. The response contains an error message indicating "Forbidden"
     * 4. The access control check in the endpoint correctly identifies non-admin users
     */
    it('should deny access to student users', async () => {
      await withTestTransaction(async (tx) => {
        const { studentUser } = await setupTestUsers(tx);
        mockUserSession(studentUser);

        const req = createTestRequest('/api/admin/challenge-installer', 'POST');

        // Call the actual route handler
        const response = await challengeInstallerRoute.POST(req);

        // Verify that the response is a 403 Forbidden
        expect(response.status).toBe(403);
        const data = await response.json();
        expect(data.error).toBe('Forbidden');
      });
    });

    /**
     * Test: Unauthenticated users should be denied access to the challenge installer endpoint
     *
     * This test verifies that:
     * 1. When an unauthenticated user makes a request to the challenge installer endpoint
     * 2. The request is rejected with a 401 Unauthorized status code
     * 3. The response contains an error message indicating "Unauthorized"
     * 4. The access control check in the endpoint correctly identifies unauthenticated users
     */
    it('should deny access to unauthenticated users', async () => {
      await withTestTransaction(async (tx) => {
        mockUserSession(null);

        const req = createTestRequest('/api/admin/challenge-installer', 'POST');

        // Call the actual route handler
        const response = await challengeInstallerRoute.POST(req);

        // Verify that the response is a 401 Unauthorized
        expect(response.status).toBe(401);
        const data = await response.json();
        expect(data.error).toBe('Unauthorized');
      });
    });
  });

  // Test GET /api/admin/featured-modules
  describe('GET /api/admin/featured-modules', () => {
    /**
     * Test: Admin users should be able to access the featured modules endpoint
     *
     * This test verifies that:
     * 1. When an admin user makes a request to the featured modules endpoint
     * 2. The request is not rejected with a 401 or 403 status code
     * 3. The access control check in the endpoint allows the request to proceed
     */
    it('should allow admin users to access the endpoint', async () => {
      await withTestTransaction(async (tx) => {
        const { adminUser } = await setupTestUsers(tx);
        mockUserSession(adminUser);

        const req = createTestRequest('/api/admin/featured-modules');

        // Call the actual route handler
        const response = await featuredModulesRoute.GET(req);

        // Verify that the response is not a 401 or 403
        expect(response.status).not.toBe(401);
        expect(response.status).not.toBe(403);
      });
    });

    /**
     * Test: Instructor users should be denied access to the featured modules endpoint
     *
     * This test verifies that:
     * 1. When an instructor user makes a request to the featured modules endpoint
     * 2. The request is rejected with a 403 Forbidden status code
     * 3. The response contains an error message indicating "Forbidden"
     */
    it('should deny access to instructor users', async () => {
      await withTestTransaction(async (tx) => {
        const { instructorUser } = await setupTestUsers(tx);
        mockUserSession(instructorUser);

        const req = createTestRequest('/api/admin/featured-modules');

        // Call the actual route handler
        const response = await featuredModulesRoute.GET(req);

        // Verify that the response is a 403 Forbidden
        expect(response.status).toBe(403);
        const data = await response.json();
        expect(data.error).toBe('Forbidden');
      });
    });

    /**
     * Test: Student users should be denied access to the featured modules endpoint
     *
     * This test verifies that:
     * 1. When a student user makes a request to the featured modules endpoint
     * 2. The request is rejected with a 403 Forbidden status code
     * 3. The response contains an error message indicating "Forbidden"
     */
    it('should deny access to student users', async () => {
      await withTestTransaction(async (tx) => {
        const { studentUser } = await setupTestUsers(tx);
        mockUserSession(studentUser);

        const req = createTestRequest('/api/admin/featured-modules');

        // Call the actual route handler
        const response = await featuredModulesRoute.GET(req);

        // Verify that the response is a 403 Forbidden
        expect(response.status).toBe(403);
        const data = await response.json();
        expect(data.error).toBe('Forbidden');
      });
    });

    /**
     * Test: Unauthenticated users should be denied access to the featured modules endpoint
     *
     * This test verifies that:
     * 1. When an unauthenticated user makes a request to the featured modules endpoint
     * 2. The request is rejected with a 401 Unauthorized status code
     * 3. The response contains an error message indicating "Unauthorized"
     */
    it('should deny access to unauthenticated users', async () => {
      await withTestTransaction(async (tx) => {
        mockUserSession(null);

        const req = createTestRequest('/api/admin/featured-modules');

        // Call the actual route handler
        const response = await featuredModulesRoute.GET(req);

        // Verify that the response is a 401 Unauthorized
        expect(response.status).toBe(401);
        const data = await response.json();
        expect(data.error).toBe('Unauthorized');
      });
    });
  });

  // Test DELETE /api/admin/challenges/[id]
  describe('DELETE /api/admin/challenges/[id]', () => {
    /**
     * Test: Admin users should be able to access the challenge delete endpoint
     *
     * This test verifies that:
     * 1. When an admin user makes a request to delete a challenge
     * 2. The request is not rejected with a 401 or 403 status code
     * 3. The access control check in the endpoint allows the request to proceed
     */
    it('should allow admin users to access the endpoint', async () => {
      await withTestTransaction(async (tx) => {
        const { adminUser } = await setupTestUsers(tx);
        const { challenge } = await createTestChallenge(tx);

        mockUserSession(adminUser);

        const req = createTestRequest(`/api/admin/challenges/${challenge.id}`, 'DELETE');

        // Call the actual route handler
        const response = await challengesIdRoute.DELETE(req, {
          params: Promise.resolve({ id: challenge.id }),
        });

        // Verify that the response is not a 401 or 403
        expect(response.status).not.toBe(401);
        expect(response.status).not.toBe(403);
      });
    });

    /**
     * Test: Instructor users should be denied access to the challenge delete endpoint
     *
     * This test verifies that:
     * 1. When an instructor user makes a request to delete a challenge
     * 2. The request is rejected with a 403 Forbidden status code
     * 3. The response contains an error message indicating "Forbidden"
     */
    it('should deny access to instructor users', async () => {
      await withTestTransaction(async (tx) => {
        const { instructorUser } = await setupTestUsers(tx);
        const { challenge } = await createTestChallenge(tx);

        mockUserSession(instructorUser);

        const req = createTestRequest(`/api/admin/challenges/${challenge.id}`, 'DELETE');

        // Call the actual route handler
        const response = await challengesIdRoute.DELETE(req, {
          params: Promise.resolve({ id: challenge.id }),
        });

        // Verify that the response is a 403 Forbidden
        expect(response.status).toBe(403);
        const data = await response.json();
        expect(data.error).toBe('Forbidden');
      });
    });

    /**
     * Test: Student users should be denied access to the challenge delete endpoint
     *
     * This test verifies that:
     * 1. When a student user makes a request to delete a challenge
     * 2. The request is rejected with a 403 Forbidden status code
     * 3. The response contains an error message indicating "Forbidden"
     */
    it('should deny access to student users', async () => {
      await withTestTransaction(async (tx) => {
        const { studentUser } = await setupTestUsers(tx);
        const { challenge } = await createTestChallenge(tx);

        mockUserSession(studentUser);

        const req = createTestRequest(`/api/admin/challenges/${challenge.id}`, 'DELETE');

        // Call the actual route handler
        const response = await challengesIdRoute.DELETE(req, {
          params: Promise.resolve({ id: challenge.id }),
        });

        // Verify that the response is a 403 Forbidden
        expect(response.status).toBe(403);
        const data = await response.json();
        expect(data.error).toBe('Forbidden');
      });
    });

    /**
     * Test: Unauthenticated users should be denied access to the challenge delete endpoint
     *
     * This test verifies that:
     * 1. When an unauthenticated user makes a request to delete a challenge
     * 2. The request is rejected with a 401 Unauthorized status code
     * 3. The response contains an error message indicating "Unauthorized"
     */
    it('should deny access to unauthenticated users', async () => {
      await withTestTransaction(async (tx) => {
        const { challenge } = await createTestChallenge(tx);

        mockUserSession(null);

        const req = createTestRequest(`/api/admin/challenges/${challenge.id}`, 'DELETE');

        // Call the actual route handler
        const response = await challengesIdRoute.DELETE(req, {
          params: Promise.resolve({ id: challenge.id }),
        });

        // Verify that the response is a 401 Unauthorized
        expect(response.status).toBe(401);
        const data = await response.json();
        expect(data.error).toBe('Unauthorized');
      });
    });
  });
});
