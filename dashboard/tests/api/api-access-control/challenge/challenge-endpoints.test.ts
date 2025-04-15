import { NextResponse } from 'next/server';
import { withTestTransaction } from '../../../utils/test-helpers';
import {
  createTestRequest,
  setupTestUsers,
  createTestGroup,
  createTestChallenge,
  mockUserSession,
  resetMocks
} from '../base-test';

// Mock the auth.ts module to avoid the @auth/prisma-adapter dependency
jest.mock('@/lib/auth', () => ({
  authOptions: {
    adapter: {},
    session: { strategy: 'jwt' },
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

// Mock the ActivityLogger to avoid errors
jest.mock('@/lib/activity-logger', () => ({
  ActivityLogger: {
    logChallengeEvent: jest.fn().mockResolvedValue({}),
    logEvent: jest.fn().mockResolvedValue({}),
  },
  ActivityEventType: {
    CHALLENGE_STARTED: 'CHALLENGE_STARTED',
    CHALLENGE_INSTANCE_CREATED: 'CHALLENGE_INSTANCE_CREATED',
    CHALLENGE_INSTANCE_DELETED: 'CHALLENGE_INSTANCE_DELETED',
  },
}));

// Mock the getInstanceManagerUrl function to avoid errors
jest.mock('@/lib/api-config', () => ({
  getInstanceManagerUrl: jest.fn().mockReturnValue('http://instance-manager.example.com'),
}));

// Mock the prisma client to avoid foreign key constraint errors
jest.mock('@/lib/prisma', () => {
  return {
    prisma: {
      user: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      challenges: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockImplementation((args) => {
          if (args?.where?.id) {
            return Promise.resolve({
              id: args.where.id,
              name: 'Test Challenge',
              description: 'Test description',
              difficulty: 'EASY',
              challengeTypeId: 'test-type-id',
              challengeImage: 'test-image.jpg',
              questions: [],
              appConfigs: [],
              challengeType: {
                id: 'test-type-id',
                name: 'test challenge type'
              }
            });
          }
          return Promise.resolve(null);
        }),
        create: jest.fn().mockImplementation((data) => {
          return Promise.resolve({
            id: 'test-challenge-id',
            name: data.data.name,
            description: data.data.description,
            difficulty: data.data.difficulty,
            challengeTypeId: data.data.challengeTypeId,
            challengeImage: data.data.challengeImage || 'test-image.jpg',
            challengeType: {
              id: data.data.challengeTypeId,
              name: 'test challenge type'
            }
          });
        }),
      },
      challengeType: {
        findUnique: jest.fn().mockResolvedValue({ id: 'test-type-id', name: 'test challenge type' }),
        findFirst: jest.fn().mockResolvedValue({ id: 'test-type-id', name: 'test challenge type' }),
        findMany: jest.fn().mockResolvedValue([
          { id: 'test-type-id', name: 'test challenge type' },
          { id: 'test-type-id-2', name: 'another challenge type' }
        ]),
      },
      challengeInstance: {
        findUnique: jest.fn().mockImplementation((args) => {
          if (args?.where?.id === 'test-instance-id') {
            return Promise.resolve({
              id: 'test-instance-id',
              challengeId: 'test-challenge-id',
              userId: 'test-student-id',
              challengeImage: 'test-image.jpg',
              challengeUrl: 'http://test-url.com',
              creationTime: new Date(),
              status: 'running',
              flagSecretName: 'test-flag-secret',
              competitionId: 'test-group-id'
            });
          }
          return Promise.resolve(null);
        }),
        findFirst: jest.fn().mockImplementation((args) => {
          // For the non-owners test case, return an instance with a different user ID
          if (args?.where?.id === 'test-instance-id-other-user') {
            return Promise.resolve({
              id: args.where.id,
              challengeId: 'test-challenge-id',
              userId: 'different-user-id', // Different from the session user ID
              competitionId: 'test-competition-id',
              challengeImage: 'test-image.jpg',
              challengeUrl: 'http://test-url.com',
              status: 'running',
              flagSecretName: 'test-flag-secret',
              flag: 'test-flag',
              user: {
                id: 'different-user-id',
                name: 'Different User',
                email: 'different@example.com',
                role: 'STUDENT'
              },
              competition: {
                id: 'test-competition-id',
                name: 'Test Competition',
                instructors: [] // No instructors, so the session user is not an instructor
              }
            });
          }

          // For the instructor test case
          if (args?.where?.id === 'test-instance-id-instructor') {
            return Promise.resolve({
              id: 'test-instance-id-instructor',
              challengeId: 'test-challenge-id',
              userId: 'test-student-id', // A student's instance
              competitionId: 'test-competition-id',
              challengeImage: 'test-image.jpg',
              challengeUrl: 'http://test-url.com',
              status: 'running',
              flagSecretName: 'test-flag-secret',
              flag: 'test-flag',
              user: {
                id: 'test-student-id',
                name: 'Test Student',
                email: 'student@example.com',
                role: 'STUDENT'
              },
              competition: {
                id: 'test-competition-id',
                name: 'Test Competition',
                instructors: [
                  {
                    id: 'test-instructor-id', // This should match the session user ID for the instructor
                    name: 'Test Instructor',
                    email: 'instructor@example.com',
                    role: 'INSTRUCTOR'
                  }
                ]
              }
            });
          }

          // Default case
          return Promise.resolve({
            id: args?.where?.id || 'test-instance-id',
            challengeId: 'test-challenge-id',
            userId: 'test-student-id',
            competitionId: 'test-group-id',
            challengeImage: 'test-image.jpg',
            challengeUrl: 'http://test-url.com',
            status: 'running',
            flagSecretName: 'test-flag-secret',
            flag: 'test-flag',
            user: {
              id: 'test-student-id',
              name: 'Test Student',
              email: 'student@example.com',
              role: 'STUDENT'
            },
            competition: {
              id: 'test-group-id',
              name: 'Test Group',
              instructors: []
            }
          });
        }),
        create: jest.fn().mockImplementation((data) => Promise.resolve({
          id: 'test-instance-id',
          ...data.data,
          creationTime: new Date(),
          status: 'running'
        })),
        update: jest.fn().mockImplementation((args) => {
          if (args?.where?.id === 'test-instance-id' || args?.where?.id === 'test-instance-id-instructor') {
            return Promise.resolve({
              id: args.where.id,
              challengeId: 'test-challenge-id',
              userId: 'test-student-id',
              challengeImage: 'test-image.jpg',
              challengeUrl: 'http://test-url.com',
              creationTime: new Date(),
              status: args.data.status || 'running',
              flagSecretName: 'test-flag-secret',
              competitionId: 'test-group-id'
            });
          }
          throw new Error('Record to update not found');
        }),
        count: jest.fn().mockResolvedValue(0),
      },
      challengeCompletion: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'test-completion-id',
            userId: 'test-student-id',
            groupChallengeId: 'test-group-challenge-id',
            pointsEarned: 10,
            completedAt: new Date(),
            groupChallenge: {
              id: 'test-group-challenge-id',
              groupId: 'test-group-id',
              challengeId: 'test-challenge-id',
              challenge: {
                id: 'test-challenge-id',
                name: 'Test Challenge',
                description: 'Test description',
                difficulty: 'EASY'
              },
              group: {
                id: 'test-group-id',
                name: 'Test Group'
              }
            }
          }
        ]),
      },
      competitionGroup: {
        findUnique: jest.fn(),
        findFirst: jest.fn().mockImplementation((args) => {
          // For the non-group members test
          if (args?.where?.id === 'test-group-non-member') {
            return Promise.resolve(null); // Return null to indicate the user is not a member of the group
          }

          // Default case
          return Promise.resolve({
            id: args?.where?.id || 'test-group-id',
            name: 'Test Group',
            description: 'Test Description',
            startDate: new Date(),
            endDate: null,
            instructors: [
              {
                id: 'test-instructor-id',
                name: 'Test Instructor',
                email: 'instructor@example.com',
                role: 'INSTRUCTOR'
              }
            ]
          });
        }),
      },
      activityLog: {
        create: jest.fn().mockResolvedValue({
          id: 'mock-activity-log-id',
          eventType: 'CHALLENGE_INSTANCE_CREATED',
          userId: 'test-student-id',
          challengeId: 'test-challenge-id',
          metadata: {},
          timestamp: new Date(),
          severity: 'INFO'
        }),
      },
      challengeQuestion: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    },
  };
});

// Mock the validation module to accept test IDs
jest.mock('@/lib/validation', () => {
  const originalModule = jest.requireActual('@/lib/validation');

  return {
    ...originalModule,
    validationSchemas: {
      ...originalModule.validationSchemas,
      // Override the id schema to accept test IDs
      id: originalModule.validationSchemas.id.or(jest.requireActual('zod').z.string().startsWith('test-')),
    },
  };
});

// Import the actual route handlers
import * as challengesRoute from '@/app/api/challenges/route';
import * as challengeIdRoute from '@/app/api/challenges/[id]/route';
import * as challengeStartRoute from '@/app/api/challenges/start/route';
import * as challengeTerminateRoute from '@/app/api/challenges/terminate/route';
import * as challengeInstanceRoute from '@/app/api/challenges/instance/route';
import * as challengeTypesRoute from '@/app/api/challenge-types/route';
import * as profileChallengeCompletionsRoute from '@/app/api/profile/challenge-completions/route';

/**
 * Challenge API Endpoints Access Control Tests
 *
 * Tests for the following endpoints:
 * - GET /api/challenges (Authenticated)
 * - POST /api/challenges (Admin only)
 * - GET /api/challenges/[id] (Authenticated)
 * - POST /api/challenges/start (Group members only)
 * - POST /api/challenges/terminate (Owner or Admin)
 * - POST /api/challenges/instance (Authenticated)
 * - GET /api/challenge-types (Authenticated)
 * - GET /api/profile/challenge-completions (Owner or Admin)
 */
describe('Challenge API Endpoints Access Control', () => {
  // Reset mocks before each test
  beforeEach(() => {
    resetMocks();
  });

  // Test GET /api/challenges (Authenticated)
  describe('GET /api/challenges', () => {
    /**
     * Test: Admin users should be able to access the challenges endpoint
     *
     * This test verifies that:
     * 1. When an admin user makes a request to the challenges endpoint
     * 2. The request is not rejected with a 401 or 403 status code
     * 3. The access control check in the endpoint allows the request to proceed
     * 4. The response contains a successful status code (200)
     */
    it('should allow admin users to access the endpoint', async () => {
      await withTestTransaction(async (tx) => {
        const { adminUser } = await setupTestUsers(tx);
        mockUserSession(adminUser);

        const req = createTestRequest('/api/challenges');
        const response = await challengesRoute.GET(req);

        expect(response.status).toBe(200);
      });
    });

    /**
     * Test: Instructor users should be able to access the challenges endpoint
     *
     * This test verifies that:
     * 1. When an instructor user makes a request to the challenges endpoint
     * 2. The request is not rejected with a 401 or 403 status code
     * 3. The access control check in the endpoint allows the request to proceed
     * 4. The response contains a successful status code (200)
     */
    it('should allow instructor users to access the endpoint', async () => {
      await withTestTransaction(async (tx) => {
        const { instructorUser } = await setupTestUsers(tx);
        mockUserSession(instructorUser);

        const req = createTestRequest('/api/challenges');
        const response = await challengesRoute.GET(req);

        expect(response.status).toBe(200);
      });
    });

    /**
     * Test: Student users should be able to access the challenges endpoint
     *
     * This test verifies that:
     * 1. When a student user makes a request to the challenges endpoint
     * 2. The request is not rejected with a 401 or 403 status code
     * 3. The access control check in the endpoint allows the request to proceed
     * 4. The response contains a successful status code (200)
     */
    it('should allow student users to access the endpoint', async () => {
      await withTestTransaction(async (tx) => {
        const { studentUser } = await setupTestUsers(tx);
        mockUserSession(studentUser);

        const req = createTestRequest('/api/challenges');
        const response = await challengesRoute.GET(req);

        expect(response.status).toBe(200);
      });
    });

    /**
     * Test: Unauthenticated users should be denied access to the challenges endpoint
     *
     * This test verifies that:
     * 1. When an unauthenticated user makes a request to the challenges endpoint
     * 2. The request is rejected with a 401 Unauthorized status code
     * 3. The access control check in the endpoint correctly identifies unauthenticated users
     */
    it('should deny access to unauthenticated users', async () => {
      await withTestTransaction(async (tx) => {
        mockUserSession(null);

        const req = createTestRequest('/api/challenges');
        const response = await challengesRoute.GET(req);

        expect(response.status).toBe(401);
      });
    });
  });

  // Test POST /api/challenges (Admin only)
  describe('POST /api/challenges', () => {
    /**
     * Test: Admin users should be able to create challenges
     *
     * This test verifies that:
     * 1. When an admin user makes a request to create a challenge
     * 2. The request is not rejected with a 401 or 403 status code
     * 3. The access control check in the endpoint allows the request to proceed
     * 4. The response contains a successful status code (201)
     */
    it('should allow admin users to create challenges', async () => {
      await withTestTransaction(async (tx) => {
        const { adminUser } = await setupTestUsers(tx);
        const { challengeType } = await createTestChallenge(tx);

        mockUserSession(adminUser);

        const req = createTestRequest('/api/challenges', 'POST', {
          name: 'Test Challenge',
          description: 'Test description',
          difficulty: 'EASY',
          challengeTypeId: challengeType.id,
          challengeImage: 'test-image.jpg',
          questions: [
            {
              content: 'Test question',
              type: 'text',
              points: 10,
              answer: 'Test answer',
            },
          ],
        });

        const response = await challengesRoute.POST(req);

        expect(response.status).toBe(201);
      });
    });

    /**
     * Test: Instructor users should be denied access to create challenges
     *
     * This test verifies that:
     * 1. When an instructor user makes a request to create a challenge
     * 2. The request is rejected with a 403 Forbidden status code
     * 3. The response contains an error message indicating "Forbidden"
     * 4. The access control check in the endpoint correctly identifies non-admin users
     */
    it('should deny access to instructor users', async () => {
      await withTestTransaction(async (tx) => {
        const { instructorUser } = await setupTestUsers(tx);
        const { challengeType } = await createTestChallenge(tx);

        mockUserSession(instructorUser);

        const req = createTestRequest('/api/challenges', 'POST', {
          name: 'Test Challenge',
          description: 'Test description',
          difficulty: 'EASY',
          challengeTypeId: challengeType.id,
          challengeImage: 'test-image.jpg',
          questions: [
            {
              content: 'Test question',
              type: 'text',
              points: 10,
              answer: 'Test answer',
            },
          ],
        });

        const response = await challengesRoute.POST(req);

        expect(response.status).toBe(403);
        const data = await response.json();
        expect(data.error).toBe('Forbidden');
      });
    });

    /**
     * Test: Student users should be denied access to create challenges
     *
     * This test verifies that:
     * 1. When a student user makes a request to create a challenge
     * 2. The request is rejected with a 403 Forbidden status code
     * 3. The response contains an error message indicating "Forbidden"
     * 4. The access control check in the endpoint correctly identifies non-admin users
     */
    it('should deny access to student users', async () => {
      await withTestTransaction(async (tx) => {
        const { studentUser } = await setupTestUsers(tx);
        const { challengeType } = await createTestChallenge(tx);

        mockUserSession(studentUser);

        const req = createTestRequest('/api/challenges', 'POST', {
          name: 'Test Challenge',
          description: 'Test description',
          difficulty: 'EASY',
          challengeTypeId: challengeType.id,
          challengeImage: 'test-image.jpg',
          questions: [
            {
              content: 'Test question',
              type: 'text',
              points: 10,
              answer: 'Test answer',
            },
          ],
        });

        const response = await challengesRoute.POST(req);

        expect(response.status).toBe(403);
        const data = await response.json();
        expect(data.error).toBe('Forbidden');
      });
    });

    /**
     * Test: Unauthenticated users should be denied access to create challenges
     *
     * This test verifies that:
     * 1. When an unauthenticated user makes a request to create a challenge
     * 2. The request is rejected with a 401 Unauthorized status code
     * 3. The access control check in the endpoint correctly identifies unauthenticated users
     */
    it('should deny access to unauthenticated users', async () => {
      await withTestTransaction(async (tx) => {
        const { challengeType } = await createTestChallenge(tx);

        mockUserSession(null);

        const req = createTestRequest('/api/challenges', 'POST', {
          name: 'Test Challenge',
          description: 'Test description',
          difficulty: 'EASY',
          challengeTypeId: challengeType.id,
          challengeImage: 'test-image.jpg',
          questions: [
            {
              content: 'Test question',
              type: 'text',
              points: 10,
              answer: 'Test answer',
            },
          ],
        });

        const response = await challengesRoute.POST(req);

        expect(response.status).toBe(401);
      });
    });
  });

  // Test GET /api/challenges/[id] (Authenticated)
  describe('GET /api/challenges/[id]', () => {
    /**
     * Test: Admin users should be able to access a specific challenge
     *
     * This test verifies that:
     * 1. When an admin user makes a request to view a specific challenge
     * 2. The request is not rejected with a 401 or 403 status code
     * 3. The access control check in the endpoint allows the request to proceed
     * 4. The response contains a successful status code (200)
     */
    it('should allow admin users to access the endpoint', async () => {
      await withTestTransaction(async (tx) => {
        const { adminUser } = await setupTestUsers(tx);
        const { challenge } = await createTestChallenge(tx);

        mockUserSession(adminUser);

        const req = createTestRequest(`/api/challenges/${challenge.id}`);
        const response = await challengeIdRoute.GET(req, {
          params: Promise.resolve({ id: challenge.id }),
        });

        expect(response.status).toBe(200);
      });
    });

    /**
     * Test: Instructor users should be able to access a specific challenge
     *
     * This test verifies that:
     * 1. When an instructor user makes a request to view a specific challenge
     * 2. The request is not rejected with a 401 or 403 status code
     * 3. The access control check in the endpoint allows the request to proceed
     * 4. The response contains a successful status code (200)
     */
    it('should allow instructor users to access the endpoint', async () => {
      await withTestTransaction(async (tx) => {
        const { instructorUser } = await setupTestUsers(tx);
        const { challenge } = await createTestChallenge(tx);

        mockUserSession(instructorUser);

        const req = createTestRequest(`/api/challenges/${challenge.id}`);
        const response = await challengeIdRoute.GET(req, {
          params: Promise.resolve({ id: challenge.id }),
        });

        expect(response.status).toBe(200);
      });
    });

    /**
     * Test: Student users should be able to access a specific challenge
     *
     * This test verifies that:
     * 1. When a student user makes a request to view a specific challenge
     * 2. The request is not rejected with a 401 or 403 status code
     * 3. The access control check in the endpoint allows the request to proceed
     * 4. The response contains a successful status code (200)
     */
    it('should allow student users to access the endpoint', async () => {
      await withTestTransaction(async (tx) => {
        const { studentUser } = await setupTestUsers(tx);
        const { challenge } = await createTestChallenge(tx);

        mockUserSession(studentUser);

        const req = createTestRequest(`/api/challenges/${challenge.id}`);
        const response = await challengeIdRoute.GET(req, {
          params: Promise.resolve({ id: challenge.id }),
        });

        expect(response.status).toBe(200);
      });
    });

    /**
     * Test: Unauthenticated users should be denied access to view a specific challenge
     *
     * This test verifies that:
     * 1. When an unauthenticated user makes a request to view a specific challenge
     * 2. The request is rejected with a 401 Unauthorized status code
     * 3. The access control check in the endpoint correctly identifies unauthenticated users
     */
    it('should deny access to unauthenticated users', async () => {
      await withTestTransaction(async (tx) => {
        const { challenge } = await createTestChallenge(tx);

        mockUserSession(null);

        const req = createTestRequest(`/api/challenges/${challenge.id}`);
        const response = await challengeIdRoute.GET(req, {
          params: Promise.resolve({ id: challenge.id }),
        });

        expect(response.status).toBe(401);
      });
    });
  });

  // Test POST /api/challenges/start (Group members only)
  describe('POST /api/challenges/start', () => {
    /**
     * Test: Group member students should be able to start a challenge
     *
     * This test verifies that:
     * 1. When a student who is a member of the competition group makes a request to start a challenge
     * 2. The request is not rejected with a 401 or 403 status code
     * 3. The access control check in the endpoint allows the request to proceed
     *
     * Note: The actual response might still be an error due to other validations or the instance manager,
     * but we're only testing that the access control check passes.
     */
    it('should allow group member students to start a challenge', async () => {
      await withTestTransaction(async (tx) => {
        const { studentUser } = await setupTestUsers(tx);
        const { challenge } = await createTestChallenge(tx);

        // Create a group with the student as a member
        const group = await createTestGroup(tx, studentUser.id, [studentUser.id]);

        mockUserSession(studentUser);

        const req = createTestRequest('/api/challenges/start', 'POST', {
          challengeId: challenge.id,
          competitionId: group.id
        });

        // Mock the fetch function to avoid actual API calls to the instance manager
        global.fetch = jest.fn().mockImplementation(() =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              deployment_name: 'test-deployment',
              challenge_url: 'http://test-url.com',
              flag_secret_name: 'test-flag-secret'
            }),
            text: () => Promise.resolve(''),
          })
        );

        try {
          const response = await challengeStartRoute.POST(req);

          // We're only testing that the access control check passes
          if (response) {
            expect(response.status).not.toBe(401);
            expect(response.status).not.toBe(403);
          }
        } finally {
          // Restore the original fetch
          jest.restoreAllMocks();
        }
      });
    });

    /**
     * Test: Group instructor should be able to start a challenge
     *
     * This test verifies that:
     * 1. When an instructor of the competition group makes a request to start a challenge
     * 2. The request is not rejected with a 401 or 403 status code
     * 3. The access control check in the endpoint allows the request to proceed
     *
     * Note: The actual response might still be an error due to other validations or the instance manager,
     * but we're only testing that the access control check passes.
     */
    it('should allow group instructors to start a challenge', async () => {
      await withTestTransaction(async (tx) => {
        const { instructorUser } = await setupTestUsers(tx);
        const { challenge } = await createTestChallenge(tx);

        // Create a group with the instructor
        const group = await createTestGroup(tx, instructorUser.id);

        mockUserSession(instructorUser);

        const req = createTestRequest('/api/challenges/start', 'POST', {
          challengeId: challenge.id,
          competitionId: group.id
        });

        // Mock the fetch function to avoid actual API calls to the instance manager
        global.fetch = jest.fn().mockImplementation(() =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              deployment_name: 'test-deployment',
              challenge_url: 'http://test-url.com',
              flag_secret_name: 'test-flag-secret'
            }),
            text: () => Promise.resolve(''),
          })
        );

        try {
          const response = await challengeStartRoute.POST(req);

          // We're only testing that the access control check passes
          if (response) {
            expect(response.status).not.toBe(401);
            expect(response.status).not.toBe(403);
          }
        } finally {
          // Restore the original fetch
          jest.restoreAllMocks();
        }
      });
    });

    /**
     * Test: Non-group members should be denied access to start a challenge
     *
     * This test verifies that:
     * 1. When a user who is not a member of the competition group makes a request to start a challenge
     * 2. The request is rejected with a 403 Forbidden status code
     * 3. The response contains an error message indicating they are not a member of the competition
     */
    it('should deny access to non-group members', async () => {
      await withTestTransaction(async (tx) => {
        const { studentUser } = await setupTestUsers(tx);
        const { challenge } = await createTestChallenge(tx);

        mockUserSession(studentUser);

        const req = createTestRequest('/api/challenges/start', 'POST', {
          challengeId: challenge.id,
          competitionId: 'test-group-non-member' // Use the special group ID
        });

        const response = await challengeStartRoute.POST(req);

        expect(response.status).toBe(403);
        const data = await response.json();
        expect(data.error).toBe('Not a member of this competition');
      });
    });

    /**
     * Test: Unauthenticated users should be denied access to start a challenge
     *
     * This test verifies that:
     * 1. When an unauthenticated user makes a request to start a challenge
     * 2. The request is rejected with a 401 Unauthorized status code
     * 3. The access control check in the endpoint correctly identifies unauthenticated users
     */
    it('should deny access to unauthenticated users', async () => {
      await withTestTransaction(async (tx) => {
        const { challenge } = await createTestChallenge(tx);
        const { instructorUser } = await setupTestUsers(tx);

        // Create a group
        const group = await createTestGroup(tx, instructorUser.id);

        mockUserSession(null);

        const req = createTestRequest('/api/challenges/start', 'POST', {
          challengeId: challenge.id,
          competitionId: group.id
        });

        const response = await challengeStartRoute.POST(req);

        expect(response.status).toBe(401);
        const data = await response.json();
        expect(data.error).toBe('Unauthorized');
      });
    });
  });

  // Test POST /api/challenges/terminate (Owner or Admin)
  describe('POST /api/challenges/terminate', () => {
    /**
     * Test: Challenge instance owners should be able to terminate their instances
     *
     * This test verifies that:
     * 1. When a user who owns a challenge instance makes a request to terminate it
     * 2. The request is not rejected with a 401 or 403 status code
     * 3. The access control check in the endpoint allows the request to proceed
     *
     * Note: The actual response might still be an error due to other validations or the instance manager,
     * but we're only testing that the access control check passes.
     */
    it('should allow instance owners to terminate their instances', async () => {
      await withTestTransaction(async (tx) => {
        // Create a student user with a specific ID that matches our mock
        const studentUser = {
          id: 'test-student-id',
          name: 'Test Student',
          email: 'student@example.com',
          role: 'STUDENT'
        };

        const { challenge } = await createTestChallenge(tx);

        mockUserSession(studentUser);

        const req = createTestRequest('/api/challenges/terminate', 'POST', {
          instanceId: 'test-instance-id'
        });

        // Mock the fetch function to avoid actual API calls to the instance manager
        global.fetch = jest.fn().mockImplementation(() =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve({}),
            text: () => Promise.resolve(''),
          })
        );

        try {
          const response = await challengeTerminateRoute.POST(req);

          // We're only testing that the access control check passes
          if (response) {
            expect(response.status).not.toBe(401);
            expect(response.status).not.toBe(403);
          }
        } finally {
          // Restore the original fetch
          jest.restoreAllMocks();
        }
      });
    });

    /**
     * Test: Group instructors should be able to terminate instances in their group
     *
     * This test verifies that:
     * 1. When an instructor of the competition group makes a request to terminate a challenge instance
     * 2. The request is not rejected with a 401 or 403 status code
     * 3. The access control check in the endpoint allows the request to proceed
     *
     * Note: The actual response might still be an error due to other validations or the instance manager,
     * but we're only testing that the access control check passes.
     */
    it('should allow group instructors to terminate instances in their group', async () => {
      await withTestTransaction(async (tx) => {
        // Create an instructor user with a specific ID that matches our mock
        const instructorUser = {
          id: 'test-instructor-id',
          name: 'Test Instructor',
          email: 'instructor@example.com',
          role: 'INSTRUCTOR'
        };

        const { challenge } = await createTestChallenge(tx);

        mockUserSession(instructorUser);

        const req = createTestRequest('/api/challenges/terminate', 'POST', {
          instanceId: 'test-instance-id-instructor' // Use the special instance ID for instructors
        });

        // Mock the fetch function to avoid actual API calls to the instance manager
        global.fetch = jest.fn().mockImplementation(() =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve({}),
            text: () => Promise.resolve(''),
          })
        );

        try {
          const response = await challengeTerminateRoute.POST(req);

          // We're only testing that the access control check passes
          if (response) {
            expect(response.status).not.toBe(401);
            expect(response.status).not.toBe(403);
          }
        } finally {
          // Restore the original fetch
          jest.restoreAllMocks();
        }
      });
    });

    /**
     * Test: Non-owners and non-instructors should be denied access to terminate instances
     *
     * This test verifies that:
     * 1. When a user who is neither the owner nor an instructor of the group makes a request to terminate an instance
     * 2. The request is rejected with a 403 Forbidden status code
     * 3. The response contains an error message indicating they are not authorized
     */
    it('should deny access to non-owners and non-instructors', async () => {
      await withTestTransaction(async (tx) => {
        const { studentUser, instructorUser, otherStudentUser } = await setupTestUsers(tx);
        const { challenge } = await createTestChallenge(tx);

        // Create a group with the instructor and student
        const group = await createTestGroup(tx, instructorUser.id, [studentUser.id]);

        // Log in as a different student who is not the owner
        mockUserSession(otherStudentUser);

        const req = createTestRequest('/api/challenges/terminate', 'POST', {
          instanceId: 'test-instance-id-other-user' // Use the special instance ID
        });

        const response = await challengeTerminateRoute.POST(req);

        if (response) {
          expect(response.status).toBe(403);
          const data = await response.json();
          expect(data.error).toBe('Not authorized to terminate this instance');
        }
      });
    });

    /**
     * Test: Unauthenticated users should be denied access to terminate instances
     *
     * This test verifies that:
     * 1. When an unauthenticated user makes a request to terminate a challenge instance
     * 2. The request is rejected with a 401 Unauthorized status code
     * 3. The access control check in the endpoint correctly identifies unauthenticated users
     */
    it('should deny access to unauthenticated users', async () => {
      await withTestTransaction(async (tx) => {
        const { studentUser, instructorUser } = await setupTestUsers(tx);
        const { challenge } = await createTestChallenge(tx);

        // Create a group with the instructor and student
        const group = await createTestGroup(tx, instructorUser.id, [studentUser.id]);

        // Create a challenge instance for the student
        const instance = await tx.challengeInstance.create({
          data: {
            id: 'test-instance-id',
            challengeId: challenge.id,
            userId: studentUser.id,
            competitionId: group.id,
            challengeImage: 'test-image.jpg',
            challengeUrl: 'http://test-url.com',
            status: 'running',
            flagSecretName: 'test-flag-secret',
            flag: 'test-flag',
          }
        });

        mockUserSession(null);

        const req = createTestRequest('/api/challenges/terminate', 'POST', {
          instanceId: instance.id
        });

        const response = await challengeTerminateRoute.POST(req);

        if (response) {
          expect(response.status).toBe(401);
          const data = await response.json();
          expect(data.error).toBe('Unauthorized');
        }
      });
    });
  });

  // Test POST /api/challenges/instance (Authenticated)
  describe('POST /api/challenges/instance', () => {
    /**
     * Test: Admin users should be able to create challenge instances
     *
     * This test verifies that:
     * 1. When an admin user makes a request to create a challenge instance
     * 2. The request is not rejected with a 401 or 403 status code
     * 3. The access control check in the endpoint allows the request to proceed
     *
     * Note: The actual response might still be an error due to other validations or the instance manager,
     * but we're only testing that the access control check passes.
     */
    it('should allow admin users to create challenge instances', async () => {
      await withTestTransaction(async (tx) => {
        const { adminUser } = await setupTestUsers(tx);

        mockUserSession(adminUser);

        const req = createTestRequest('/api/challenges/instance', 'POST', {
          challengeImage: 'test-image.jpg',
          appsConfig: JSON.stringify([]),
          challengeType: 'fullos'
        });

        // Mock the fetch function to avoid actual API calls to the instance manager
        global.fetch = jest.fn().mockImplementation(() =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              deployment_name: 'test-deployment',
              challenge_url: 'http://test-url.com'
            }),
            text: () => Promise.resolve(''),
          })
        );

        try {
          const response = await challengeInstanceRoute.POST(req);

          // We're only testing that the access control check passes
          if (response) {
            expect(response.status).not.toBe(401);
            expect(response.status).not.toBe(403);
          }
        } finally {
          // Restore the original fetch
          jest.restoreAllMocks();
        }
      });
    });

    /**
     * Test: Instructor users should be able to create challenge instances
     *
     * This test verifies that:
     * 1. When an instructor user makes a request to create a challenge instance
     * 2. The request is not rejected with a 401 or 403 status code
     * 3. The access control check in the endpoint allows the request to proceed
     *
     * Note: The actual response might still be an error due to other validations or the instance manager,
     * but we're only testing that the access control check passes.
     */
    it('should allow instructor users to create challenge instances', async () => {
      await withTestTransaction(async (tx) => {
        const { instructorUser } = await setupTestUsers(tx);

        mockUserSession(instructorUser);

        const req = createTestRequest('/api/challenges/instance', 'POST', {
          challengeImage: 'test-image.jpg',
          appsConfig: JSON.stringify([]),
          challengeType: 'fullos'
        });

        // Mock the fetch function to avoid actual API calls to the instance manager
        global.fetch = jest.fn().mockImplementation(() =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              deployment_name: 'test-deployment',
              challenge_url: 'http://test-url.com'
            }),
            text: () => Promise.resolve(''),
          })
        );

        try {
          const response = await challengeInstanceRoute.POST(req);

          // We're only testing that the access control check passes
          if (response) {
            expect(response.status).not.toBe(401);
            expect(response.status).not.toBe(403);
          }
        } finally {
          // Restore the original fetch
          jest.restoreAllMocks();
        }
      });
    });

    /**
     * Test: Student users should be able to create challenge instances
     *
     * This test verifies that:
     * 1. When a student user makes a request to create a challenge instance
     * 2. The request is not rejected with a 401 or 403 status code
     * 3. The access control check in the endpoint allows the request to proceed
     *
     * Note: The actual response might still be an error due to other validations or the instance manager,
     * but we're only testing that the access control check passes.
     */
    it('should allow student users to create challenge instances', async () => {
      await withTestTransaction(async (tx) => {
        const { studentUser } = await setupTestUsers(tx);

        mockUserSession(studentUser);

        const req = createTestRequest('/api/challenges/instance', 'POST', {
          challengeImage: 'test-image.jpg',
          appsConfig: JSON.stringify([]),
          challengeType: 'fullos'
        });

        // Mock the fetch function to avoid actual API calls to the instance manager
        global.fetch = jest.fn().mockImplementation(() =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              deployment_name: 'test-deployment',
              challenge_url: 'http://test-url.com'
            }),
            text: () => Promise.resolve(''),
          })
        );

        try {
          const response = await challengeInstanceRoute.POST(req);

          // We're only testing that the access control check passes
          if (response) {
            expect(response.status).not.toBe(401);
            expect(response.status).not.toBe(403);
          }
        } finally {
          // Restore the original fetch
          jest.restoreAllMocks();
        }
      });
    });

    /**
     * Test: Unauthenticated users should be denied access to create challenge instances
     *
     * This test verifies that:
     * 1. When an unauthenticated user makes a request to create a challenge instance
     * 2. The request is rejected with a 401 Unauthorized status code
     * 3. The access control check in the endpoint correctly identifies unauthenticated users
     */
    it('should deny access to unauthenticated users', async () => {
      await withTestTransaction(async (tx) => {
        mockUserSession(null);

        const req = createTestRequest('/api/challenges/instance', 'POST', {
          challengeImage: 'test-image.jpg',
          appsConfig: JSON.stringify([]),
          challengeType: 'fullos'
        });

        const response = await challengeInstanceRoute.POST(req);

        expect(response.status).toBe(401);
      });
    });
  });

  // Test GET /api/challenge-types (Authenticated)
  describe('GET /api/challenge-types', () => {
    /**
     * Test: Admin users should be able to access challenge types
     *
     * This test verifies that:
     * 1. When an admin user makes a request to get challenge types
     * 2. The request is not rejected with a 401 or 403 status code
     * 3. The access control check in the endpoint allows the request to proceed
     * 4. The response contains a successful status code (200)
     */
    it('should allow admin users to access challenge types', async () => {
      await withTestTransaction(async (tx) => {
        const { adminUser } = await setupTestUsers(tx);

        mockUserSession(adminUser);

        const req = createTestRequest('/api/challenge-types');
        const response = await challengeTypesRoute.GET();

        expect(response.status).toBe(200);
      });
    });

    /**
     * Test: Instructor users should be able to access challenge types
     *
     * This test verifies that:
     * 1. When an instructor user makes a request to get challenge types
     * 2. The request is not rejected with a 401 or 403 status code
     * 3. The access control check in the endpoint allows the request to proceed
     * 4. The response contains a successful status code (200)
     */
    it('should allow instructor users to access challenge types', async () => {
      await withTestTransaction(async (tx) => {
        const { instructorUser } = await setupTestUsers(tx);

        mockUserSession(instructorUser);

        const req = createTestRequest('/api/challenge-types');
        const response = await challengeTypesRoute.GET();

        expect(response.status).toBe(200);
      });
    });

    /**
     * Test: Student users should be able to access challenge types
     *
     * This test verifies that:
     * 1. When a student user makes a request to get challenge types
     * 2. The request is not rejected with a 401 or 403 status code
     * 3. The access control check in the endpoint allows the request to proceed
     * 4. The response contains a successful status code (200)
     */
    it('should allow student users to access challenge types', async () => {
      await withTestTransaction(async (tx) => {
        const { studentUser } = await setupTestUsers(tx);

        mockUserSession(studentUser);

        const req = createTestRequest('/api/challenge-types');
        const response = await challengeTypesRoute.GET();

        expect(response.status).toBe(200);
      });
    });

    /**
     * Test: Unauthenticated users should be able to access challenge types
     *
     * This test verifies that:
     * 1. When an unauthenticated user makes a request to get challenge types
     * 2. The request is not rejected with a 401 or 403 status code
     * 3. The access control check in the endpoint allows the request to proceed
     * 4. The response contains a successful status code (200)
     *
     * Note: This endpoint does not require authentication, so unauthenticated users should be able to access it.
     */
    it('should allow unauthenticated users to access challenge types', async () => {
      await withTestTransaction(async (tx) => {
        mockUserSession(null);

        const req = createTestRequest('/api/challenge-types');
        const response = await challengeTypesRoute.GET();

        expect(response.status).toBe(200);
      });
    });
  });

  // Test GET /api/profile/challenge-completions (Owner or Admin)
  describe('GET /api/profile/challenge-completions', () => {
    /**
     * Test: Users should be able to access their own challenge completions
     *
     * This test verifies that:
     * 1. When a user makes a request to get their own challenge completions
     * 2. The request is not rejected with a 401 or 403 status code
     * 3. The access control check in the endpoint allows the request to proceed
     * 4. The response contains a successful status code (200)
     */
    it('should allow users to access their own challenge completions', async () => {
      await withTestTransaction(async (tx) => {
        const { studentUser } = await setupTestUsers(tx);

        mockUserSession(studentUser);

        const req = createTestRequest(`/api/profile/challenge-completions?userId=${studentUser.id}`);
        const response = await profileChallengeCompletionsRoute.GET(req);

        expect(response.status).toBe(200);
      });
    });

    /**
     * Test: Admin users should be able to access any user's challenge completions
     *
     * This test verifies that:
     * 1. When an admin user makes a request to get another user's challenge completions
     * 2. The request is not rejected with a 401 or 403 status code
     * 3. The access control check in the endpoint allows the request to proceed
     * 4. The response contains a successful status code (200)
     */
    it('should allow admin users to access any user\'s challenge completions', async () => {
      await withTestTransaction(async (tx) => {
        const { adminUser, studentUser } = await setupTestUsers(tx);

        mockUserSession(adminUser);

        const req = createTestRequest(`/api/profile/challenge-completions?userId=${studentUser.id}`);
        const response = await profileChallengeCompletionsRoute.GET(req);

        expect(response.status).toBe(200);
      });
    });

    /**
     * Test: Non-admin users should be denied access to other users' challenge completions
     *
     * This test verifies that:
     * 1. When a non-admin user makes a request to get another user's challenge completions
     * 2. The request is rejected with a 403 Forbidden status code
     * 3. The response contains an error message indicating "Forbidden"
     * 4. The access control check in the endpoint correctly identifies unauthorized access
     */
    it('should deny access to non-admin users trying to access other users\' challenge completions', async () => {
      await withTestTransaction(async (tx) => {
        const { instructorUser, studentUser } = await setupTestUsers(tx);

        mockUserSession(instructorUser);

        const req = createTestRequest(`/api/profile/challenge-completions?userId=${studentUser.id}`);
        const response = await profileChallengeCompletionsRoute.GET(req);

        expect(response.status).toBe(403);
        const data = await response.json();
        expect(data.error).toBe('Forbidden');
      });
    });

    /**
     * Test: Unauthenticated users should be denied access to challenge completions
     *
     * This test verifies that:
     * 1. When an unauthenticated user makes a request to get challenge completions
     * 2. The request is rejected with a 401 Unauthorized status code
     * 3. The access control check in the endpoint correctly identifies unauthenticated users
     */
    it('should deny access to unauthenticated users', async () => {
      await withTestTransaction(async (tx) => {
        const { studentUser } = await setupTestUsers(tx);

        mockUserSession(null);

        const req = createTestRequest(`/api/profile/challenge-completions?userId=${studentUser.id}`);
        const response = await profileChallengeCompletionsRoute.GET(req);

        expect(response.status).toBe(401);
        const data = await response.json();
        expect(data.error).toBe('Unauthorized');
      });
    });
  });
});
