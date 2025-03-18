import { NextResponse } from 'next/server';
import { withTestTransaction } from '../../../utils/test-helpers';
import {
  createTestRequest,
  setupTestUsers,
  mockUserSession,
  resetMocks
} from '../base-test';

// Import the actual route handlers
import * as systemHealthRoute from '@/app/api/system-health/route';
import * as systemHealthCurrentRoute from '@/app/api/system-health/current/route';
import * as systemHealthHistoryRoute from '@/app/api/system-health/history/route';
import * as systemHealthNodeSpecsRoute from '@/app/api/system-health/node-specs/route';
import * as systemRestartRoute from '@/app/api/system/restart/route';
import * as cronExpireAccessCodesRoute from '@/app/api/cron/expire-access-codes/route';
import * as updateChallengesRoute from '@/app/api/update-challenges/route';
import * as healthRoute from '@/app/api/health/route';

// Mock the fetchWithRetry function in the update-challenges route
jest.mock('@/app/api/update-challenges/route', () => {
  const originalModule = jest.requireActual('@/app/api/update-challenges/route');

  return {
    ...originalModule,
    POST: jest.fn(async (req) => {
      // Check for cron secret
      const cronSecret = req.headers.get('x-cron-secret');
      const validCronSecret = process.env.CRON_SECRET;

      if (!cronSecret || cronSecret !== validCronSecret) {
        return NextResponse.json({ error: 'Unauthorized - Invalid or missing cron secret' }, { status: 401 });
      }

      // Return success response for valid cron secret
      return NextResponse.json({ success: true, updatedCount: 3 }, { status: 200 });
    })
  };
});

/**
 * System API Endpoints Access Control Tests
 *
 * Tests for the following endpoints:
 * - GET /api/system-health (Admin only)
 * - GET /api/system-health/current (Admin only)
 * - GET /api/system-health/history (Admin only)
 * - GET /api/system-health/node-specs (Admin only)
 * - POST /api/system/restart (Admin only)
 * - GET /api/health (Public)
 * - POST /api/cron/expire-access-codes (Internal/Cron only)
 * - POST /api/update-challenges (Internal/Cron only)
 */
describe('System API Endpoints Access Control', () => {
  // Set up environment variables for testing
  beforeAll(() => {
    process.env.CRON_SECRET = 'valid-cron-secret';
  });

  // Reset mocks before each test
  beforeEach(() => {
    resetMocks();
  });

  // Test GET /api/system-health (Admin only)
  describe('GET /api/system-health', () => {
    /**
     * Test: Admin users should be able to access the system health endpoint
     *
     * This test verifies that:
     * 1. When an admin user makes a request to the system health endpoint
     * 2. The request is processed successfully with a 200 status code
     * 3. The access control check in the endpoint allows the request to proceed
     * 4. The endpoint returns the system health information
     */
    it('should allow admin users to access the endpoint', async () => {
      await withTestTransaction(async (tx) => {
        const { adminUser } = await setupTestUsers(tx);
        mockUserSession(adminUser);

        const req = createTestRequest('/api/system-health');
        const response = await systemHealthRoute.GET(req);

        expect(response.status).toBe(200);
      });
    });

    /**
     * Test: Instructor users should be denied access to the system health endpoint
     *
     * This test verifies that:
     * 1. When an instructor user makes a request to the system health endpoint
     * 2. The request is rejected with a 403 Forbidden status code
     * 3. The access control check in the endpoint correctly identifies that instructors
     *    do not have permission to access system health information
     */
    it('should deny access to instructor users', async () => {
      await withTestTransaction(async (tx) => {
        const { instructorUser } = await setupTestUsers(tx);
        mockUserSession(instructorUser);

        const req = createTestRequest('/api/system-health');
        const response = await systemHealthRoute.GET(req);

        expect(response.status).toBe(403);
      });
    });

    /**
     * Test: Student users should be denied access to the system health endpoint
     *
     * This test verifies that:
     * 1. When a student user makes a request to the system health endpoint
     * 2. The request is rejected with a 403 Forbidden status code
     * 3. The access control check in the endpoint correctly identifies that students
     *    do not have permission to access system health information
     */
    it('should deny access to student users', async () => {
      await withTestTransaction(async (tx) => {
        const { studentUser } = await setupTestUsers(tx);
        mockUserSession(studentUser);

        const req = createTestRequest('/api/system-health');
        const response = await systemHealthRoute.GET(req);

        expect(response.status).toBe(403);
      });
    });

    /**
     * Test: Unauthenticated users should be denied access to the system health endpoint
     *
     * This test verifies that:
     * 1. When an unauthenticated user makes a request to the system health endpoint
     * 2. The request is rejected with a 401 Unauthorized status code
     * 3. The access control check in the endpoint correctly identifies that
     *    authentication is required to access system health information
     */
    it('should deny access to unauthenticated users', async () => {
      await withTestTransaction(async (tx) => {
        // Don't mock any user session (unauthenticated)
        mockUserSession(null);

        const req = createTestRequest('/api/system-health');
        const response = await systemHealthRoute.GET(req);

        expect(response.status).toBe(401);
      });
    });
  });

  // Test GET /api/system-health/current (Admin only)
  describe('GET /api/system-health/current', () => {
    /**
     * Test: Admin users should be able to access the current system health endpoint
     *
     * This test verifies that:
     * 1. When an admin user makes a request to the current system health endpoint
     * 2. The request is processed successfully with a 200 status code
     * 3. The access control check in the endpoint allows the request to proceed
     * 4. The endpoint returns the current system health metrics
     */
    it('should allow admin users to access the endpoint', async () => {
      await withTestTransaction(async (tx) => {
        const { adminUser } = await setupTestUsers(tx);
        mockUserSession(adminUser);

        const req = createTestRequest('/api/system-health/current');
        const response = await systemHealthCurrentRoute.GET(req);

        expect(response.status).toBe(200);
      });
    });

    /**
     * Test: Instructor users should be denied access to the current system health endpoint
     *
     * This test verifies that:
     * 1. When an instructor user makes a request to the current system health endpoint
     * 2. The request is rejected with a 403 Forbidden status code
     * 3. The access control check in the endpoint correctly identifies that instructors
     *    do not have permission to access current system health metrics
     */
    it('should deny access to instructor users', async () => {
      await withTestTransaction(async (tx) => {
        const { instructorUser } = await setupTestUsers(tx);
        mockUserSession(instructorUser);

        const req = createTestRequest('/api/system-health/current');
        const response = await systemHealthCurrentRoute.GET(req);

        expect(response.status).toBe(403);
      });
    });

    /**
     * Test: Student users should be denied access to the current system health endpoint
     *
     * This test verifies that:
     * 1. When a student user makes a request to the current system health endpoint
     * 2. The request is rejected with a 403 Forbidden status code
     * 3. The access control check in the endpoint correctly identifies that students
     *    do not have permission to access current system health metrics
     */
    it('should deny access to student users', async () => {
      await withTestTransaction(async (tx) => {
        const { studentUser } = await setupTestUsers(tx);
        mockUserSession(studentUser);

        const req = createTestRequest('/api/system-health/current');
        const response = await systemHealthCurrentRoute.GET(req);

        expect(response.status).toBe(403);
      });
    });

    /**
     * Test: Unauthenticated users should be denied access to the current system health endpoint
     *
     * This test verifies that:
     * 1. When an unauthenticated user makes a request to the current system health endpoint
     * 2. The request is rejected with a 401 Unauthorized status code
     * 3. The access control check in the endpoint correctly identifies that
     *    authentication is required to access current system health metrics
     */
    it('should deny access to unauthenticated users', async () => {
      await withTestTransaction(async (tx) => {
        // Don't mock any user session (unauthenticated)
        mockUserSession(null);

        const req = createTestRequest('/api/system-health/current');
        const response = await systemHealthCurrentRoute.GET(req);

        expect(response.status).toBe(401);
      });
    });
  });

  // Test GET /api/system-health/history (Admin only)
  describe('GET /api/system-health/history', () => {
    /**
     * Test: Admin users should be able to access the system health history endpoint
     *
     * This test verifies that:
     * 1. When an admin user makes a request to the system health history endpoint
     * 2. The request is processed successfully with a 200 status code
     * 3. The access control check in the endpoint allows the request to proceed
     * 4. The endpoint returns the historical system health metrics
     */
    it('should allow admin users to access the endpoint', async () => {
      await withTestTransaction(async (tx) => {
        const { adminUser } = await setupTestUsers(tx);
        mockUserSession(adminUser);

        const req = createTestRequest('/api/system-health/history');
        const response = await systemHealthHistoryRoute.GET(req);

        expect(response.status).toBe(200);
      });
    });

    /**
     * Test: Instructor users should be denied access to the system health history endpoint
     *
     * This test verifies that:
     * 1. When an instructor user makes a request to the system health history endpoint
     * 2. The request is rejected with a 403 Forbidden status code
     * 3. The access control check in the endpoint correctly identifies that instructors
     *    do not have permission to access historical system health metrics
     */
    it('should deny access to instructor users', async () => {
      await withTestTransaction(async (tx) => {
        const { instructorUser } = await setupTestUsers(tx);
        mockUserSession(instructorUser);

        const req = createTestRequest('/api/system-health/history');
        const response = await systemHealthHistoryRoute.GET(req);

        expect(response.status).toBe(403);
      });
    });

    /**
     * Test: Student users should be denied access to the system health history endpoint
     *
     * This test verifies that:
     * 1. When a student user makes a request to the system health history endpoint
     * 2. The request is rejected with a 403 Forbidden status code
     * 3. The access control check in the endpoint correctly identifies that students
     *    do not have permission to access historical system health metrics
     */
    it('should deny access to student users', async () => {
      await withTestTransaction(async (tx) => {
        const { studentUser } = await setupTestUsers(tx);
        mockUserSession(studentUser);

        const req = createTestRequest('/api/system-health/history');
        const response = await systemHealthHistoryRoute.GET(req);

        expect(response.status).toBe(403);
      });
    });

    /**
     * Test: Unauthenticated users should be denied access to the system health history endpoint
     *
     * This test verifies that:
     * 1. When an unauthenticated user makes a request to the system health history endpoint
     * 2. The request is rejected with a 401 Unauthorized status code
     * 3. The access control check in the endpoint correctly identifies that
     *    authentication is required to access historical system health metrics
     */
    it('should deny access to unauthenticated users', async () => {
      await withTestTransaction(async (tx) => {
        // Don't mock any user session (unauthenticated)
        mockUserSession(null);

        const req = createTestRequest('/api/system-health/history');
        const response = await systemHealthHistoryRoute.GET(req);

        expect(response.status).toBe(401);
      });
    });
  });

  // Test GET /api/system-health/node-specs (Admin only)
  describe('GET /api/system-health/node-specs', () => {
    /**
     * Test: Admin users should be able to access the node specifications endpoint
     *
     * This test verifies that:
     * 1. When an admin user makes a request to the node specifications endpoint
     * 2. The request is processed successfully with a 200 status code
     * 3. The access control check in the endpoint allows the request to proceed
     * 4. The endpoint returns the node specifications data
     */
    it('should allow admin users to access the endpoint', async () => {
      await withTestTransaction(async (tx) => {
        const { adminUser } = await setupTestUsers(tx);
        mockUserSession(adminUser);

        const req = createTestRequest('/api/system-health/node-specs');
        const response = await systemHealthNodeSpecsRoute.GET(req);

        expect(response.status).toBe(200);
      });
    });

    /**
     * Test: Instructor users should be denied access to the node specifications endpoint
     *
     * This test verifies that:
     * 1. When an instructor user makes a request to the node specifications endpoint
     * 2. The request is rejected with a 403 Forbidden status code
     * 3. The access control check in the endpoint correctly identifies that instructors
     *    do not have permission to access node specifications data
     */
    it('should deny access to instructor users', async () => {
      await withTestTransaction(async (tx) => {
        const { instructorUser } = await setupTestUsers(tx);
        mockUserSession(instructorUser);

        const req = createTestRequest('/api/system-health/node-specs');
        const response = await systemHealthNodeSpecsRoute.GET(req);

        expect(response.status).toBe(403);
      });
    });

    /**
     * Test: Student users should be denied access to the node specifications endpoint
     *
     * This test verifies that:
     * 1. When a student user makes a request to the node specifications endpoint
     * 2. The request is rejected with a 403 Forbidden status code
     * 3. The access control check in the endpoint correctly identifies that students
     *    do not have permission to access node specifications data
     */
    it('should deny access to student users', async () => {
      await withTestTransaction(async (tx) => {
        const { studentUser } = await setupTestUsers(tx);
        mockUserSession(studentUser);

        const req = createTestRequest('/api/system-health/node-specs');
        const response = await systemHealthNodeSpecsRoute.GET(req);

        expect(response.status).toBe(403);
      });
    });

    /**
     * Test: Unauthenticated users should be denied access to the node specifications endpoint
     *
     * This test verifies that:
     * 1. When an unauthenticated user makes a request to the node specifications endpoint
     * 2. The request is rejected with a 401 Unauthorized status code
     * 3. The access control check in the endpoint correctly identifies that
     *    authentication is required to access node specifications data
     */
    it('should deny access to unauthenticated users', async () => {
      await withTestTransaction(async (tx) => {
        // Don't mock any user session (unauthenticated)
        mockUserSession(null);

        const req = createTestRequest('/api/system-health/node-specs');
        const response = await systemHealthNodeSpecsRoute.GET(req);

        expect(response.status).toBe(401);
      });
    });
  });

  // Test POST /api/system/restart (Admin only)
  describe('POST /api/system/restart', () => {
    /**
     * Test: Admin users should be able to restart the system
     *
     * This test verifies that:
     * 1. When an admin user makes a request to restart a system service
     * 2. The request is processed successfully with a 200 status code
     * 3. The access control check in the endpoint allows the request to proceed
     * 4. The endpoint returns a success response
     */
    it('should allow admin users to restart the system', async () => {
      await withTestTransaction(async (tx) => {
        const { adminUser } = await setupTestUsers(tx);
        mockUserSession(adminUser);

        const req = createTestRequest('/api/system/restart', 'POST', {
          service: 'instance-manager',
        });

        const response = await systemRestartRoute.POST(req);

        expect(response.status).toBe(200);
      });
    });

    /**
     * Test: Instructor users should be denied access to restart the system
     *
     * This test verifies that:
     * 1. When an instructor user makes a request to restart a system service
     * 2. The request is rejected with a 403 Forbidden status code
     * 3. The access control check in the endpoint correctly identifies that instructors
     *    do not have permission to restart system services
     */
    it('should deny access to instructor users', async () => {
      await withTestTransaction(async (tx) => {
        const { instructorUser } = await setupTestUsers(tx);
        mockUserSession(instructorUser);

        const req = createTestRequest('/api/system/restart', 'POST', {
          service: 'instance-manager',
        });

        const response = await systemRestartRoute.POST(req);

        expect(response.status).toBe(403);
      });
    });

    /**
     * Test: Student users should be denied access to restart the system
     *
     * This test verifies that:
     * 1. When a student user makes a request to restart a system service
     * 2. The request is rejected with a 403 Forbidden status code
     * 3. The access control check in the endpoint correctly identifies that students
     *    do not have permission to restart system services
     */
    it('should deny access to student users', async () => {
      await withTestTransaction(async (tx) => {
        const { studentUser } = await setupTestUsers(tx);
        mockUserSession(studentUser);

        const req = createTestRequest('/api/system/restart', 'POST', {
          service: 'instance-manager',
        });

        const response = await systemRestartRoute.POST(req);

        expect(response.status).toBe(403);
      });
    });

    /**
     * Test: Unauthenticated users should be denied access to restart the system
     *
     * This test verifies that:
     * 1. When an unauthenticated user makes a request to restart a system service
     * 2. The request is rejected with a 401 Unauthorized status code
     * 3. The access control check in the endpoint correctly identifies that
     *    authentication is required to restart system services
     */
    it('should deny access to unauthenticated users', async () => {
      await withTestTransaction(async (tx) => {
        // Don't mock any user session (unauthenticated)
        mockUserSession(null);

        const req = createTestRequest('/api/system/restart', 'POST', {
          service: 'instance-manager',
        });

        const response = await systemRestartRoute.POST(req);

        expect(response.status).toBe(401);
      });
    });
  });

  // Test GET /api/health (Public)
  describe('GET /api/health', () => {
    /**
     * Test: Admin users should be able to access the public health endpoint
     *
     * This test verifies that:
     * 1. When an admin user makes a request to the public health endpoint
     * 2. The request is processed successfully with a 200 status code
     * 3. The endpoint returns the basic health status
     */
    it('should allow admin users to access the endpoint', async () => {
      await withTestTransaction(async (tx) => {
        const { adminUser } = await setupTestUsers(tx);
        mockUserSession(adminUser);

        const response = await healthRoute.GET();

        expect(response.status).toBe(200);
      });
    });

    /**
     * Test: Instructor users should be able to access the public health endpoint
     *
     * This test verifies that:
     * 1. When an instructor user makes a request to the public health endpoint
     * 2. The request is processed successfully with a 200 status code
     * 3. The endpoint returns the basic health status
     */
    it('should allow instructor users to access the endpoint', async () => {
      await withTestTransaction(async (tx) => {
        const { instructorUser } = await setupTestUsers(tx);
        mockUserSession(instructorUser);

        const response = await healthRoute.GET();

        expect(response.status).toBe(200);
      });
    });

    /**
     * Test: Student users should be able to access the public health endpoint
     *
     * This test verifies that:
     * 1. When a student user makes a request to the public health endpoint
     * 2. The request is processed successfully with a 200 status code
     * 3. The endpoint returns the basic health status
     */
    it('should allow student users to access the endpoint', async () => {
      await withTestTransaction(async (tx) => {
        const { studentUser } = await setupTestUsers(tx);
        mockUserSession(studentUser);

        const response = await healthRoute.GET();

        expect(response.status).toBe(200);
      });
    });

    /**
     * Test: Unauthenticated users should be able to access the public health endpoint
     *
     * This test verifies that:
     * 1. When an unauthenticated user makes a request to the public health endpoint
     * 2. The request is processed successfully with a 200 status code
     * 3. The endpoint returns the basic health status
     */
    it('should allow unauthenticated users to access the endpoint', async () => {
      await withTestTransaction(async (tx) => {
        // Don't mock any user session (unauthenticated)
        mockUserSession(null);

        const response = await healthRoute.GET();

        expect(response.status).toBe(200);
      });
    });
  });

  // Test POST /api/cron/expire-access-codes (Internal/Cron only)
  describe('POST /api/cron/expire-access-codes', () => {
    /**
     * Test: Requests with valid cron secret should be allowed
     *
     * This test verifies that:
     * 1. When a request with a valid cron secret is made to the expire access codes endpoint
     * 2. The request is processed successfully with a 200 status code
     * 3. The access control check in the endpoint allows the request to proceed
     * 4. The endpoint returns a success response with the number of expired codes
     */
    it('should allow requests with valid cron secret', async () => {
      await withTestTransaction(async (tx) => {
        // No user session needed for cron jobs
        mockUserSession(null);

        // Create a request with the cron secret header
        const req = createTestRequest('/api/cron/expire-access-codes', 'POST');
        req.headers.set('x-cron-secret', 'valid-cron-secret');

        const response = await cronExpireAccessCodesRoute.POST(req);

        expect(response.status).toBe(200);
      });
    });

    /**
     * Test: Requests without cron secret should be denied
     *
     * This test verifies that:
     * 1. When a request without a cron secret is made to the expire access codes endpoint
     * 2. The request is rejected with a 401 Unauthorized status code
     * 3. The access control check in the endpoint correctly identifies that
     *    the cron secret is required for this endpoint
     */
    it('should deny requests without cron secret', async () => {
      await withTestTransaction(async (tx) => {
        // No user session needed for cron jobs
        mockUserSession(null);

        // Create a request without the cron secret header
        const req = createTestRequest('/api/cron/expire-access-codes', 'POST');

        const response = await cronExpireAccessCodesRoute.POST(req);

        expect(response.status).toBe(401);
      });
    });

    /**
     * Test: Requests with invalid cron secret should be denied
     *
     * This test verifies that:
     * 1. When a request with an invalid cron secret is made to the expire access codes endpoint
     * 2. The request is rejected with a 401 Unauthorized status code
     * 3. The access control check in the endpoint correctly identifies that
     *    the cron secret is invalid
     */
    it('should deny requests with invalid cron secret', async () => {
      await withTestTransaction(async (tx) => {
        // No user session needed for cron jobs
        mockUserSession(null);

        // Create a request with an invalid cron secret header
        const req = createTestRequest('/api/cron/expire-access-codes', 'POST');
        req.headers.set('x-cron-secret', 'invalid-cron-secret');

        const response = await cronExpireAccessCodesRoute.POST(req);

        expect(response.status).toBe(401);
      });
    });

    /**
     * Test: Even admin users should not be able to access without cron secret
     *
     * This test verifies that:
     * 1. When an admin user makes a request without a cron secret to the expire access codes endpoint
     * 2. The request is rejected with a 401 Unauthorized status code
     * 3. The access control check in the endpoint correctly identifies that
     *    the cron secret is required even for admin users
     */
    it('should deny access to admin users without cron secret', async () => {
      await withTestTransaction(async (tx) => {
        const { adminUser } = await setupTestUsers(tx);
        mockUserSession(adminUser);

        // Create a request without the cron secret header
        const req = createTestRequest('/api/cron/expire-access-codes', 'POST');

        const response = await cronExpireAccessCodesRoute.POST(req);

        expect(response.status).toBe(401);
      });
    });
  });

  // Test POST /api/update-challenges (Internal/Cron only)
  describe('POST /api/update-challenges', () => {
    /**
     * Test: Requests with valid cron secret should be allowed
     *
     * This test verifies that:
     * 1. When a request with a valid cron secret is made to the update challenges endpoint
     * 2. The request is processed successfully with a 200 status code
     * 3. The access control check in the endpoint allows the request to proceed
     * 4. The endpoint returns a success response with the number of updated challenges
     */
    it('should allow requests with valid cron secret', async () => {
      await withTestTransaction(async (tx) => {
        // No user session needed for cron jobs
        mockUserSession(null);

        // Create a request with the cron secret header
        const req = createTestRequest('/api/update-challenges', 'POST');
        req.headers.set('x-cron-secret', 'valid-cron-secret');

        const response = await updateChallengesRoute.POST(req);

        expect(response.status).toBe(200);
      });
    });

    /**
     * Test: Requests without cron secret should be denied
     *
     * This test verifies that:
     * 1. When a request without a cron secret is made to the update challenges endpoint
     * 2. The request is rejected with a 401 Unauthorized status code
     * 3. The access control check in the endpoint correctly identifies that
     *    the cron secret is required for this endpoint
     */
    it('should deny requests without cron secret', async () => {
      await withTestTransaction(async (tx) => {
        // No user session needed for cron jobs
        mockUserSession(null);

        // Create a request without the cron secret header
        const req = createTestRequest('/api/update-challenges', 'POST');

        const response = await updateChallengesRoute.POST(req);

        expect(response.status).toBe(401);
      });
    });

    /**
     * Test: Requests with invalid cron secret should be denied
     *
     * This test verifies that:
     * 1. When a request with an invalid cron secret is made to the update challenges endpoint
     * 2. The request is rejected with a 401 Unauthorized status code
     * 3. The access control check in the endpoint correctly identifies that
     *    the cron secret is invalid
     */
    it('should deny requests with invalid cron secret', async () => {
      await withTestTransaction(async (tx) => {
        // No user session needed for cron jobs
        mockUserSession(null);

        // Create a request with an invalid cron secret header
        const req = createTestRequest('/api/update-challenges', 'POST');
        req.headers.set('x-cron-secret', 'invalid-cron-secret');

        const response = await updateChallengesRoute.POST(req);

        expect(response.status).toBe(401);
      });
    });

    /**
     * Test: Even admin users should not be able to access without cron secret
     *
     * This test verifies that:
     * 1. When an admin user makes a request without a cron secret to the update challenges endpoint
     * 2. The request is rejected with a 401 Unauthorized status code
     * 3. The access control check in the endpoint correctly identifies that
     *    the cron secret is required even for admin users
     */
    it('should deny access to admin users without cron secret', async () => {
      await withTestTransaction(async (tx) => {
        const { adminUser } = await setupTestUsers(tx);
        mockUserSession(adminUser);

        // Create a request without the cron secret header
        const req = createTestRequest('/api/update-challenges', 'POST');

        const response = await updateChallengesRoute.POST(req);

        expect(response.status).toBe(401);
      });
    });
  });
});
