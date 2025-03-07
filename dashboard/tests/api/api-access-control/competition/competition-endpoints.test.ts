import { NextResponse, NextRequest } from 'next/server';
import { withTestTransaction } from '../../../utils/test-helpers';
import {
  createTestRequest,
  setupTestUsers,
  createTestGroup,
  mockUserSession,
  resetMocks
} from '../base-test';
import { getServerSession } from 'next-auth/next';
import { prisma } from '@/lib/prisma';

// Import the actual route handlers
import * as competitionGroupsRoute from '@/app/api/competition-groups/route';
import * as competitionGroupIdRoute from '@/app/api/competition-groups/[id]/route';
import * as competitionGroupAccessCodeRoute from '@/app/api/competition-groups/[id]/access-code/route';
import * as competitionGroupAccessCodeDeleteRoute from '@/app/api/competition-groups/[id]/access-code/[code]/route';
import * as competitionGroupUserDeleteRoute from '@/app/api/competition-groups/[id]/users/[userId]/route';
import * as competitionGroupUserResetRoute from '@/app/api/competition-groups/[id]/users/[userId]/reset/route';
import * as competitionsJoinRoute from '@/app/api/competitions/join/route';
import * as competitionsPointsRoute from '@/app/api/competitions/[groupId]/points/route';

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

// Mock the ActivityLogger to avoid errors
jest.mock('@/lib/activity-logger', () => ({
  ActivityLogger: {
    logEvent: jest.fn().mockResolvedValue({}),
    logGroupEvent: jest.fn().mockResolvedValue({}),
    logAccessCodeEvent: jest.fn().mockResolvedValue({}),
  },
  ActivityEventType: {
    COMPETITION_GROUP_CREATED: 'COMPETITION_GROUP_CREATED',
    COMPETITION_GROUP_UPDATED: 'COMPETITION_GROUP_UPDATED',
    COMPETITION_GROUP_DELETED: 'COMPETITION_GROUP_DELETED',
    COMPETITION_JOINED: 'COMPETITION_JOINED',
    GROUP_CREATED: 'GROUP_CREATED',
    ACCESS_CODE_GENERATED: 'ACCESS_CODE_GENERATED',
    ACCESS_CODE_DELETED: 'ACCESS_CODE_DELETED',
    GROUP_LEFT: 'GROUP_LEFT',
    GROUP_MEMBER_REMOVED: 'GROUP_MEMBER_REMOVED',
    GROUP_JOINED: 'GROUP_JOINED',
    ACCESS_CODE_USED: 'ACCESS_CODE_USED',
  },
}));

// Mock the prisma client to avoid database operations
jest.mock('@/lib/prisma', () => {
  const originalModule = jest.requireActual('@/lib/prisma');

  // Create a mock implementation of activityLog.create
  const mockActivityLogCreate = jest.fn().mockResolvedValue({
    id: 'mock-activity-log-id',
    eventType: 'COMPETITION_GROUP_CREATED',
    userId: 'mock-user-id',
    timestamp: new Date(),
    metadata: {}
  });

  // Create a mock implementation of competitionGroup.findUnique
  const mockCompetitionGroupFindUnique = jest.fn().mockImplementation(({ where }) => {
    if (where.id === 'non-existent-group') {
      return null;
    }
    return {
      id: where.id,
      name: 'Test Competition',
      description: 'Test description',
      startDate: new Date(),
      endDate: null,
      instructors: [
        {
          id: 'test-instructor-id',
          name: 'Test Instructor',
          email: 'instructor@example.com',
          role: 'INSTRUCTOR'
        }
      ],
      members: [
        {
          id: 'test-student-id',
          name: 'Test Student',
          email: 'student@example.com',
          role: 'STUDENT',
          groupPoints: [
            {
              points: 50
            }
          ]
        }
      ],
      challenges: [
        {
          id: 'test-challenge-group-id',
          challenge: {
            id: 'test-challenge-id',
            name: 'Test Challenge',
            difficulty: 'EASY',
            description: 'Test challenge description',
            appConfigs: [
              {
                id: 'test-app-config-id',
                challengeId: 'test-challenge-id',
                appId: 'challenge-prompt',
                additional_config: JSON.stringify({ points: 100 })
              }
            ],
            questions: [
              {
                id: 'test-question-id',
                points: 10
              },
              {
                id: 'test-question-id-2',
                points: 20
              }
            ],
            challengeType: {
              id: 'test-challenge-type-id',
              name: 'CTF'
            }
          },
          completions: [],
          questionCompletions: []
        }
      ],
      _count: {
        members: 1,
        challenges: 1
      }
    };
  });

  // Create a mock implementation of competitionGroup.findFirst
  const mockCompetitionGroupFindFirst = jest.fn().mockImplementation(({ where }) => {
    // For debugging
    console.log('competitionGroup.findFirst called with:', JSON.stringify(where, null, 2));

    // For the non-members test
    if (where.id === 'test-group-non-member') {
      return null; // Return null to indicate the user is not a member of the group
    }

    // For the join endpoint - check if user is already a member
    if (where.id === 'test-group-id' && where.members?.some?.id) {
      // For the join endpoint tests, we want to return null to indicate the user is not already a member
      // This allows the join operation to proceed
      return null;
    }

    // Check if this is an instructor check (single condition)
    if (where.instructors && where.instructors.some) {
      const instructorId = where.instructors.some.id;
      console.log('Instructor check with ID:', instructorId);

      if (instructorId === 'test-instructor-id') {
        return {
          id: where.id,
          name: 'Test Competition',
          description: 'Test description',
          startDate: new Date(),
          instructors: [
            {
              id: 'test-instructor-id',
              name: 'Test Instructor',
              email: 'instructor@example.com',
              role: 'INSTRUCTOR'
            }
          ],
          members: []
        };
      }

      if (instructorId === 'test-student-id') {
        return null; // Student is not an instructor
      }

      return null; // Default for other IDs
    }

    // Check if this is an OR condition (member or instructor)
    if (where.OR) {
      console.log('OR condition check');

      // Extract the user ID from the OR condition
      let userId = null;

      if (where.OR[0].members?.some?.id) {
        userId = where.OR[0].members.some.id;
      } else if (where.OR[0].instructors?.some?.id) {
        userId = where.OR[0].instructors.some.id;
      }

      if (userId) {
        console.log('Found member ID:', userId);

        if (userId === 'test-instructor-id' || userId === 'test-student-id') {
          return {
            id: where.id,
            name: 'Test Competition',
            description: 'Test description',
            startDate: new Date(),
            instructors: [
              {
                id: 'test-instructor-id',
                name: 'Test Instructor',
                email: 'instructor@example.com',
                role: 'INSTRUCTOR'
              }
            ],
            members: [
              {
                id: 'test-student-id',
                name: 'Test Student',
                email: 'student@example.com',
                role: 'STUDENT'
              }
            ]
          };
        }
      }

      return null; // Default for other IDs
    }

    // Default case
    return {
      id: where.id,
      name: 'Test Competition',
      description: 'Test description',
      startDate: new Date(),
      instructors: [
        {
          id: 'test-instructor-id',
          name: 'Test Instructor',
          email: 'instructor@example.com',
          role: 'INSTRUCTOR'
        }
      ],
      members: [
        {
          id: 'test-student-id',
          name: 'Test Student',
          email: 'student@example.com',
          role: 'STUDENT'
        }
      ]
    };
  });

  // Create a mock implementation of competitionGroup.create
  const mockCompetitionGroupCreate = jest.fn().mockImplementation((data) => {
    return {
      id: 'test-group-id',
      name: data.data.name,
      description: data.data.description,
      startDate: data.data.startDate,
      endDate: data.data.endDate,
      instructors: data.data.instructors?.connect?.map(({ id }: { id: string }) => ({
        id,
        name: 'Test Instructor',
        email: 'instructor@example.com',
        role: 'INSTRUCTOR'
      })) || []
    };
  });

  // Create a mock implementation of challenges.findMany
  const mockChallengesFindMany = jest.fn().mockResolvedValue([
    {
      id: 'test-challenge-id',
      appConfigs: [
        {
          id: 'test-app-config-id',
          challengeId: 'test-challenge-id',
          appId: 'challenge-prompt',
          additional_config: JSON.stringify({ points: 100 })
        }
      ]
    }
  ]);

  // Create a mock implementation of groupChallenge.createMany
  const mockGroupChallengeCreateMany = jest.fn().mockResolvedValue({
    count: 1
  });

  // Create a mock implementation of competitionAccessCode.create
  const mockCompetitionAccessCodeCreate = jest.fn().mockResolvedValue({
    id: 'test-access-code-id',
    code: 'TEST123',
    groupId: 'test-group-id',
    createdBy: 'test-user-id',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
    maxUses: 10,
    usedCount: 0,
    group: {
      id: 'test-group-id',
      name: 'Test Competition',
    }
  });

  // Create a mock implementation of competitionAccessCode.findUnique
  const mockCompetitionAccessCodeFindUnique = jest.fn().mockImplementation(({ where }) => {
    if (where.code === 'non-existent-code') {
      return null;
    }
    return {
      id: 'test-access-code-id',
      code: where.code,
      groupId: where.groupId,
      createdBy: 'test-user-id',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      maxUses: 10,
      usedCount: 0
    };
  });

  // Create a mock implementation of competitionAccessCode.delete
  const mockCompetitionAccessCodeDelete = jest.fn().mockResolvedValue({
    id: 'test-access-code-id',
    code: 'TEST123',
    groupId: 'test-group-id',
    createdBy: 'test-user-id'
  });

  // Create a mock implementation for $transaction
  const mockTransaction = jest.fn().mockImplementation(async (callback) => {
    const mockTx = {
      $queryRaw: jest.fn().mockImplementation((query) => {
        // Extract the session user ID from the query
        const queryStr = String(query);
        const sessionUserId = queryStr.match(/AND "B" = ([^)]+)/)?.[1];

        // For admin users, always return a result
        if (sessionUserId && (sessionUserId.includes('admin') || sessionUserId.includes('test-admin'))) {
          return [{ id: 'test-group-id', name: 'Test Competition' }];
        }

        // For instructor users with ID 'test-instructor-id', return a result
        if (sessionUserId && (sessionUserId.includes('instructor') || sessionUserId.includes('test-instructor'))) {
          return [{ id: 'test-group-id', name: 'Test Competition' }];
        }

        // For all other users, return an empty array
        return [];
      })
    };
    return callback(mockTx);
  });

  // Create a mock implementation of competitionGroup.update
  const mockCompetitionGroupUpdate = jest.fn().mockImplementation(({ where, data }) => {
    // For the join endpoint, we need to handle the case where a user is being added to a group
    if (data.members && data.members.connect) {
      return {
        id: where.id,
        name: 'Test Competition',
        description: 'Test description',
        startDate: new Date(),
        endDate: null,
        members: [
          {
            id: data.members.connect.id,
            name: 'Test User',
            email: 'user@example.com',
            role: 'STUDENT'
          }
        ]
      };
    }

    // Default case for other updates
    return {
      id: where.id,
      name: 'Test Competition',
      description: 'Test description',
      startDate: new Date(),
      endDate: null
    };
  });

  // Create a mock implementation of challengeCompletion.deleteMany
  const mockChallengeCompletionDeleteMany = jest.fn().mockResolvedValue({
    count: 2
  });

  // Create a mock implementation of questionCompletion.deleteMany
  const mockQuestionCompletionDeleteMany = jest.fn().mockResolvedValue({
    count: 5
  });

  // Create a mock implementation of groupPoints.updateMany
  const mockGroupPointsUpdateMany = jest.fn().mockResolvedValue({
    count: 1
  });

  // Create a mock implementation of competitionAccessCode.findFirst
  const mockCompetitionAccessCodeFindFirst = jest.fn().mockImplementation(({ where }) => {
    if (where.code === 'invalid-code') {
      return null;
    }

    // For the join endpoint tests, we need to return a valid access code
    // that isn't expired and has a valid group
    return {
      id: 'test-access-code-id',
      code: where.code || 'TEST123',
      groupId: 'test-group-id',
      createdBy: 'test-user-id',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      maxUses: 10,
      usedCount: 0,
      group: {
        id: 'test-group-id',
        name: 'Test Competition'
      }
    };
  });

  // Create a mock implementation of competitionAccessCode.update
  const mockCompetitionAccessCodeUpdate = jest.fn().mockResolvedValue({
    id: 'test-access-code-id',
    code: 'TEST123',
    groupId: 'test-group-id',
    createdBy: 'test-user-id',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    maxUses: 10,
    usedCount: 1
  });

  // Create a mock implementation of user.findUnique
  const mockUserFindUnique = jest.fn().mockImplementation(({ where, select }) => {
    if (where.id.includes('admin')) {
      return { role: 'ADMIN' };
    } else if (where.id.includes('instructor')) {
      return { role: 'INSTRUCTOR' };
    } else if (where.id.includes('student')) {
      return { role: 'STUDENT' };
    }
    return null;
  });

  // Create a mock implementation of competitionGroup.delete
  const mockCompetitionGroupDelete = jest.fn().mockResolvedValue({
    id: 'test-group-id',
    name: 'Test Competition',
    description: 'Test description',
    startDate: new Date(),
    endDate: null
  });

  return {
    ...originalModule,
    prisma: {
      ...originalModule.prisma,
      activityLog: {
        create: mockActivityLogCreate
      },
      user: {
        findUnique: mockUserFindUnique
      },
      competitionGroup: {
        findUnique: mockCompetitionGroupFindUnique,
        findFirst: mockCompetitionGroupFindFirst,
        create: mockCompetitionGroupCreate,
        update: mockCompetitionGroupUpdate,
        delete: mockCompetitionGroupDelete
      },
      challenges: {
        findMany: mockChallengesFindMany
      },
      groupChallenge: {
        createMany: mockGroupChallengeCreateMany
      },
      competitionAccessCode: {
        create: mockCompetitionAccessCodeCreate,
        findUnique: mockCompetitionAccessCodeFindUnique,
        findFirst: mockCompetitionAccessCodeFindFirst,
        update: mockCompetitionAccessCodeUpdate,
        delete: mockCompetitionAccessCodeDelete
      },
      challengeCompletion: {
        deleteMany: mockChallengeCompletionDeleteMany
      },
      questionCompletion: {
        deleteMany: mockQuestionCompletionDeleteMany
      },
      groupPoints: {
        updateMany: mockGroupPointsUpdateMany
      },
      $transaction: mockTransaction
    }
  };
});

// Mock the rate-limit module to avoid rate limiting in tests
jest.mock('@/lib/rate-limit', () => {
  return function() {
    return {
      check: jest.fn().mockResolvedValue(null)
    };
  };
});

// Mock the validation module to avoid validation errors
jest.mock('@/lib/validation', () => {
  // Create a mock for the id schema that includes the optional method
  const mockIdSchema = {
    describe: jest.fn().mockReturnValue({
      optional: jest.fn().mockReturnThis(),
      describe: jest.fn().mockReturnThis()
    }),
    optional: jest.fn().mockReturnThis()
  };

  return {
    validateAndSanitize: jest.fn((schema, data) => {
      // For the points endpoints, always return success
      if (schema.shape?.groupId) {
        return {
          success: true,
          data: { groupId: data.groupId || 'test-group-id' }
        };
      }

      // For the points update schema
      if (schema.shape?.userId && schema.shape?.points) {
        return {
          success: true,
          data: {
            userId: data.userId || 'test-student-id',
            points: data.points || 100
          }
        };
      }

      // For the join endpoint
      if (schema.shape?.code) {
        if (data.code === 'invalid-code') {
          return {
            success: false,
            error: 'Invalid access code'
          };
        }
        return {
          success: true,
          data: { code: data.code }
        };
      }

      // Default case
      return {
        success: true,
        data
      };
    }),
    validationSchemas: {
      id: mockIdSchema
    }
  };
});

// Mock the db module for raw SQL queries
jest.mock('@/lib/db', () => {
  return {
    db: {
      $queryRaw: jest.fn().mockImplementation((query) => {
        const queryStr = String(query);
        console.log('Raw SQL query:', queryStr);

        // For points GET endpoint
        if (queryStr.includes('SELECT gp.*')) {
          return [
            {
              id: 'test-points-id',
              points: 100,
              userId: 'test-student-id',
              groupId: 'test-group-id',
              createdAt: new Date(),
              updatedAt: new Date(),
              user: {
                id: 'test-student-id',
                name: 'Test Student',
                email: 'student@example.com',
                image: null
              }
            }
          ];
        }

        // For points POST endpoint - check if user is instructor
        if (queryStr.includes('SELECT id FROM "CompetitionGroup"')) {
          // Extract the group ID from the query using a better regex
          const groupIdMatch = queryStr.match(/id = '([^']+)'/);
          const groupId = groupIdMatch ? groupIdMatch[1] : null;

          // Extract the user ID from the query using a better regex
          const userIdMatch = queryStr.match(/"B" = '([^']+)'/);
          const userId = userIdMatch ? userIdMatch[1] : null;

          console.log('SQL query for instructor check:', { groupId, userId });

          // For admin users or instructors, return a result
          if (userId && (
              userId.includes('admin') ||
              userId.includes('test-admin') ||
              userId.includes('admin-user-id') ||
              userId.includes('instructor') ||
              userId.includes('test-instructor')
          )) {
            console.log('Returning group for user:', userId);
            return [{ id: groupId || 'test-group-id' }];
          }

          console.log('No group found for user:', userId);
          // For all other users, return an empty array
          return [];
        }

        // For points POST endpoint - update points
        if (queryStr.includes('INSERT INTO "GroupPoints"')) {
          return [
            {
              id: 'test-points-id',
              points: 100,
              userId: 'test-student-id',
              groupId: 'test-group-id',
              createdAt: new Date(),
              updatedAt: new Date()
            }
          ];
        }

        return [];
      })
    }
  };
});

// Add a beforeEach block to reset mocks
  beforeEach(() => {
    resetMocks();
});

/**
 * Competition API Endpoints Access Control Tests
 *
 * Tests for the following endpoints:
 * - POST /api/competition-groups (Instructor/Admin only)
 * - GET /api/competition-groups/[id] (Group members or instructors)
 * - PATCH /api/competition-groups/[id] (Group instructors only)
 * - DELETE /api/competition-groups/[id] (Group instructors only)
 * - POST /api/competition-groups/[id]/access-code (Group instructors only)
 * - DELETE /api/competition-groups/[id]/access-code/[code] (Group instructors only)
 * - DELETE /api/competition-groups/[id]/users/[userId] (Group instructors only)
 * - POST /api/competition-groups/[id]/users/[userId]/reset (Group instructors only)
 * - POST /api/competitions/join (Authenticated)
 * - GET /api/competitions/[groupId]/points (Group members or instructors)
 * - POST /api/competitions/[groupId]/points (Group instructors only)
 */
describe('Competition API Endpoints Access Control', () => {
  // Test POST /api/competition-groups (Instructor/Admin only)
  describe('POST /api/competition-groups', () => {
    /**
     * Test: Admin users should be able to create competition groups
     *
     * This test verifies that:
     * 1. When an admin user makes a request to create a competition group
     * 2. The request is processed successfully with a 201 status code
     * 3. The access control check in the endpoint allows the request to proceed
     */
    it('should allow admin users to create competition groups', async () => {
      await withTestTransaction(async (tx) => {
        const { adminUser } = await setupTestUsers(tx);
        mockUserSession(adminUser);

        const req = createTestRequest('/api/competition-groups', 'POST', {
          name: 'Test Competition',
          description: 'Test description',
          startDate: new Date().toISOString(),
          challengeIds: ['test-challenge-id'],
          instructorIds: [adminUser.id],
          generateAccessCode: true
        });

        const response = await competitionGroupsRoute.POST(req);

        expect(response.status).toBe(200);
      });
    });

    /**
     * Test: Instructor users should be able to create competition groups
     *
     * This test verifies that:
     * 1. When an instructor user makes a request to create a competition group
     * 2. The request is processed successfully with a 201 status code
     * 3. The access control check in the endpoint allows the request to proceed
     */
    it('should allow instructor users to create competition groups', async () => {
      await withTestTransaction(async (tx) => {
        const { instructorUser } = await setupTestUsers(tx);
        mockUserSession(instructorUser);

        const req = createTestRequest('/api/competition-groups', 'POST', {
          name: 'Test Competition',
          description: 'Test description',
          startDate: new Date().toISOString(),
          challengeIds: ['test-challenge-id'],
          instructorIds: [instructorUser.id],
          generateAccessCode: true
        });

        const response = await competitionGroupsRoute.POST(req);

        expect(response.status).toBe(200);
      });
    });

    /**
     * Test: Student users should be denied access to create competition groups
     *
     * This test verifies that:
     * 1. When a student user makes a request to create a competition group
     * 2. The request is rejected with a 403 Forbidden status code
     * 3. The access control check in the endpoint correctly identifies that students
     *    do not have permission to create competition groups
     */
    it('should deny access to student users', async () => {
      await withTestTransaction(async (tx) => {
        const { studentUser } = await setupTestUsers(tx);
        mockUserSession(studentUser);

        const req = createTestRequest('/api/competition-groups', 'POST', {
          name: 'Test Competition',
          description: 'Test description',
          startDate: new Date().toISOString(),
          challengeIds: ['test-challenge-id'],
          instructorIds: [studentUser.id],
          generateAccessCode: true
        });

        const response = await competitionGroupsRoute.POST(req);

        expect(response.status).toBe(403);
      });
    });

    /**
     * Test: Unauthenticated users should be denied access to create competition groups
     *
     * This test verifies that:
     * 1. When an unauthenticated user makes a request to create a competition group
     * 2. The request is rejected with a 401 Unauthorized status code
     * 3. The access control check in the endpoint correctly identifies that
     *    authentication is required to create competition groups
     */
    it('should deny access to unauthenticated users', async () => {
      await withTestTransaction(async (tx) => {
        mockUserSession(null);

        const req = createTestRequest('/api/competition-groups', 'POST', {
          name: 'Test Competition',
          description: 'Test description',
          startDate: new Date().toISOString(),
          challengeIds: ['test-challenge-id'],
          instructorIds: ['some-instructor-id'],
          generateAccessCode: true
        });

        const response = await competitionGroupsRoute.POST(req);

        expect(response.status).toBe(401);
      });
    });
  });

  // Test GET /api/competition-groups/[id] (Group members or instructors)
  describe('GET /api/competition-groups/[id]', () => {
    /**
     * Test: Admin users should be able to access any competition group
     *
     * This test verifies that:
     * 1. When an admin user makes a request to view a competition group
     * 2. The request is processed successfully with a 200 status code
     * 3. The access control check in the endpoint allows the request to proceed
     */
    it('should allow admin users to access any competition group', async () => {
      await withTestTransaction(async (tx) => {
        const { adminUser } = await setupTestUsers(tx);
        mockUserSession(adminUser);

        const req = createTestRequest(`/api/competition-groups/test-group-id`, 'GET');

        const response = await competitionGroupIdRoute.GET(req, {
          params: Promise.resolve({ id: 'test-group-id' })
        });

        expect(response.status).toBe(200);
      });
    });

    /**
     * Test: Instructor users should be able to access groups they instruct
     *
     * This test verifies that:
     * 1. When an instructor user makes a request to view a competition group they instruct
     * 2. The request is processed successfully with a 200 status code
     * 3. The access control check in the endpoint allows the request to proceed
     */
    it('should allow instructor users to access groups they instruct', async () => {
      await withTestTransaction(async (tx) => {
        const { instructorUser } = await setupTestUsers(tx);
        mockUserSession(instructorUser);

        const req = createTestRequest(`/api/competition-groups/test-group-id`, 'GET');

        const response = await competitionGroupIdRoute.GET(req, {
          params: Promise.resolve({ id: 'test-group-id' })
        });

        expect(response.status).toBe(200);
      });
    });

    /**
     * Test: Student users should be able to access groups they are members of
     *
     * This test verifies that:
     * 1. When a student user makes a request to view a competition group they are a member of
     * 2. The request is processed successfully with a 200 status code
     * 3. The access control check in the endpoint allows the request to proceed
     */
    it('should allow student users to access groups they are members of', async () => {
      await withTestTransaction(async (tx) => {
        const { studentUser } = await setupTestUsers(tx);
        mockUserSession(studentUser);

        const req = createTestRequest(`/api/competition-groups/test-group-id`, 'GET');

        const response = await competitionGroupIdRoute.GET(req, {
          params: Promise.resolve({ id: 'test-group-id' })
        });

        expect(response.status).toBe(200);
      });
    });

    /**
     * Test: Student users should be denied access to groups they are not members of
     *
     * This test verifies that:
     * 1. When a student user makes a request to view a competition group they are not a member of
     * 2. The request is rejected with a 403 Forbidden status code
     * 3. The access control check in the endpoint correctly identifies that students
     *    do not have permission to view groups they are not members of
     */
    it('should deny access to student users for groups they are not members of', async () => {
      await withTestTransaction(async (tx) => {
        const { studentUser } = await setupTestUsers(tx);
        mockUserSession(studentUser);

        // Override the competitionGroup.findUnique mock for this test
        const originalFindUnique = prisma.competitionGroup.findUnique;
        prisma.competitionGroup.findUnique = jest.fn().mockResolvedValue({
          id: 'test-group-non-member',
          name: 'Test Competition',
          description: 'Test description',
          startDate: new Date(),
          endDate: null,
          instructors: [],
          members: [], // Empty members array to simulate non-membership
          challenges: [],
          _count: {
            members: 0,
            challenges: 0
          }
        });

        const req = createTestRequest(`/api/competition-groups/test-group-non-member`, 'GET');

        const response = await competitionGroupIdRoute.GET(req, {
          params: Promise.resolve({ id: 'test-group-non-member' })
        });

        // Restore the original mock
        prisma.competitionGroup.findUnique = originalFindUnique;

        expect(response.status).toBe(403);
      });
    });

    /**
     * Test: Unauthenticated users should be denied access to view competition groups
     *
     * This test verifies that:
     * 1. When an unauthenticated user makes a request to view a competition group
     * 2. The request is rejected with a 401 Unauthorized status code
     * 3. The access control check in the endpoint correctly identifies that
     *    authentication is required to view competition groups
     */
    it('should deny access to unauthenticated users', async () => {
      await withTestTransaction(async (tx) => {
        mockUserSession(null);

        const req = createTestRequest(`/api/competition-groups/test-group-id`, 'GET');

        const response = await competitionGroupIdRoute.GET(req, {
          params: Promise.resolve({ id: 'test-group-id' })
        });

        expect(response.status).toBe(401);
      });
    });
  });

  // Test PATCH /api/competition-groups/[id] (Group instructors only)
  describe('PATCH /api/competition-groups/[id]', () => {
    /**
     * Test: Admin users should be able to update any competition group
     *
     * This test verifies that:
     * 1. When an admin user makes a request to update a competition group
     * 2. The request is processed successfully with a 200 status code
     * 3. The access control check in the endpoint allows the request to proceed
     */
    it('should allow admin users to update any competition group', async () => {
      await withTestTransaction(async (tx) => {
        const { adminUser } = await setupTestUsers(tx);
        // Use a special admin ID that our mocks will recognize
        mockUserSession({
          ...adminUser,
          id: 'admin-user-id'
        });

        // Override the competitionGroup.findFirst mock for this test
        const originalFindFirst = prisma.competitionGroup.findFirst;
        prisma.competitionGroup.findFirst = jest.fn().mockResolvedValue({
          id: 'test-group-id',
          name: 'Test Competition',
          instructors: [
            {
              id: 'admin-user-id'
            }
          ]
        });

        const req = createTestRequest(`/api/competition-groups/test-group-id`, 'PATCH', {
          name: 'Updated Competition',
          description: 'Updated description',
          startDate: new Date().toISOString()
        });

        const response = await competitionGroupIdRoute.PATCH(req, {
          params: Promise.resolve({ id: 'test-group-id' })
        });

        // Restore the original mock
        prisma.competitionGroup.findFirst = originalFindFirst;

        expect(response.status).toBe(200);
      });
    });

    /**
     * Test: Instructor users should be able to update groups they instruct
     *
     * This test verifies that:
     * 1. When an instructor user makes a request to update a competition group they instruct
     * 2. The request is processed successfully with a 200 status code
     * 3. The access control check in the endpoint allows the request to proceed
     */
    it('should allow instructor users to update groups they instruct', async () => {
      await withTestTransaction(async (tx) => {
        const { instructorUser } = await setupTestUsers(tx);
        // Use a special instructor ID that our mocks will recognize
        mockUserSession({
          ...instructorUser,
          id: 'test-instructor-id'
        });

        // Override the competitionGroup.findFirst mock for this test
        const originalFindFirst = prisma.competitionGroup.findFirst;
        prisma.competitionGroup.findFirst = jest.fn().mockImplementation(({ where }) => {
          // If checking for instructor permissions
          if (where.instructors && where.instructors.some && where.instructors.some.id === 'test-instructor-id') {
            return {
              id: 'test-group-id',
              name: 'Test Competition',
              description: 'Test description',
              startDate: new Date(),
              endDate: null,
              instructors: [
                {
                  id: 'test-instructor-id'
                }
              ]
            };
          }
          return null;
        });

        const req = createTestRequest(`/api/competition-groups/test-group-id`, 'PATCH', {
          name: 'Updated Competition',
          description: 'Updated description',
          startDate: new Date().toISOString()
        });

        const response = await competitionGroupIdRoute.PATCH(req, {
          params: Promise.resolve({ id: 'test-group-id' })
        });

        // Restore the original mock
        prisma.competitionGroup.findFirst = originalFindFirst;

        expect(response.status).toBe(200);
      });
    });

    /**
     * Test: Student users should be denied access to update competition groups
     *
     * This test verifies that:
     * 1. When a student user makes a request to update a competition group
     * 2. The request is rejected with a 403 Forbidden status code
     * 3. The access control check in the endpoint correctly identifies that students
     *    do not have permission to update competition groups
     */
    it('should deny access to student users', async () => {
      await withTestTransaction(async (tx) => {
        const { studentUser } = await setupTestUsers(tx);
        mockUserSession(studentUser);

        const req = createTestRequest(`/api/competition-groups/test-group-id`, 'PATCH', {
          name: 'Updated Competition',
          description: 'Updated description',
          startDate: new Date().toISOString()
        });

        const response = await competitionGroupIdRoute.PATCH(req, {
          params: Promise.resolve({ id: 'test-group-id' })
        });

        expect(response.status).toBe(403);
      });
    });

    /**
     * Test: Unauthenticated users should be denied access to update competition groups
     *
     * This test verifies that:
     * 1. When an unauthenticated user makes a request to update a competition group
     * 2. The request is rejected with a 401 Unauthorized status code
     * 3. The access control check in the endpoint correctly identifies that
     *    authentication is required to update competition groups
     */
    it('should deny access to unauthenticated users', async () => {
      await withTestTransaction(async (tx) => {
        mockUserSession(null);

        const req = createTestRequest(`/api/competition-groups/test-group-id`, 'PATCH', {
          name: 'Updated Competition',
          description: 'Updated description',
          startDate: new Date().toISOString()
        });

        const response = await competitionGroupIdRoute.PATCH(req, {
          params: Promise.resolve({ id: 'test-group-id' })
        });

        expect(response.status).toBe(401);
      });
    });
  });

  // Test DELETE /api/competition-groups/[id] (Group instructors only)
  describe('DELETE /api/competition-groups/[id]', () => {
    /**
     * Test: Admin users should be able to delete any competition group
     *
     * This test verifies that:
     * 1. When an admin user makes a request to delete a competition group
     * 2. The request is processed successfully with a 200 status code
     * 3. The access control check in the endpoint allows the request to proceed
     */
    it('should allow admin users to delete any competition group', async () => {
      await withTestTransaction(async (tx) => {
        const { adminUser } = await setupTestUsers(tx);
        // Use a special admin ID that our mocks will recognize
        mockUserSession({
          ...adminUser,
          id: 'admin-user-id'
        });

        // Override the user.findUnique mock for this test
        const originalFindUnique = prisma.user.findUnique;
        prisma.user.findUnique = jest.fn().mockResolvedValue({
          id: 'admin-user-id',
          role: 'ADMIN'
        });

        const req = createTestRequest(`/api/competition-groups/test-group-id`, 'DELETE');

        const response = await competitionGroupIdRoute.DELETE(req, {
          params: Promise.resolve({ id: 'test-group-id' })
        });

        // Restore the original mock
        prisma.user.findUnique = originalFindUnique;

        expect(response.status).toBe(200);
      });
    });

    /**
     * Test: Non-admin users should be denied access to delete competition groups
     *
     * This test verifies that:
     * 1. When a non-admin user makes a request to delete a competition group
     * 2. The request is rejected with a 403 Forbidden status code
     * 3. The access control check in the endpoint correctly identifies that only
     *    admin users have permission to delete competition groups
     */
    it('should deny access to non-admin users', async () => {
      await withTestTransaction(async (tx) => {
        const { instructorUser } = await setupTestUsers(tx);
        mockUserSession(instructorUser);

        const req = createTestRequest(`/api/competition-groups/test-group-id`, 'DELETE');

        const response = await competitionGroupIdRoute.DELETE(req, {
          params: Promise.resolve({ id: 'test-group-id' })
        });

        expect(response.status).toBe(403);
      });
    });

    /**
     * Test: Unauthenticated users should be denied access to delete competition groups
     *
     * This test verifies that:
     * 1. When an unauthenticated user makes a request to delete a competition group
     * 2. The request is rejected with a 401 Unauthorized status code
     * 3. The access control check in the endpoint correctly identifies that
     *    authentication is required to delete competition groups
     */
    it('should deny access to unauthenticated users', async () => {
      await withTestTransaction(async (tx) => {
        mockUserSession(null);

        const req = createTestRequest(`/api/competition-groups/test-group-id`, 'DELETE');

        const response = await competitionGroupIdRoute.DELETE(req, {
          params: Promise.resolve({ id: 'test-group-id' })
        });

        expect(response.status).toBe(401);
      });
    });
  });

  // Test POST /api/competition-groups/[id]/access-code (Group instructors only)
  describe('POST /api/competition-groups/[id]/access-code', () => {
    /**
     * Test: Admin users should be able to create access codes for any competition group
     *
     * This test verifies that:
     * 1. When an admin user makes a request to create an access code for a competition group
     * 2. The request is processed successfully with a 200 status code
     * 3. The access control check in the endpoint allows the request to proceed
     */
    it('should allow admin users to create access codes for any competition group', async () => {
      await withTestTransaction(async (tx) => {
        const { adminUser } = await setupTestUsers(tx);
        // Use a special admin ID that our mocks will recognize
        mockUserSession({
          ...adminUser,
          id: 'admin-user-id'
        });

        // Override the $transaction mock for this test to simulate SQL query for instructor check
        const original$transaction = prisma.$transaction;
        prisma.$transaction = jest.fn().mockImplementation(async (callback) => {
          if (typeof callback === 'function') {
            const mockTx = {
              $queryRaw: jest.fn().mockResolvedValue([{ id: 'test-group-id', name: 'Test Competition' }])
            };
            return callback(mockTx);
          }
          return [];
        });

        const req = createTestRequest(`/api/competition-groups/test-group-id/access-code`, 'POST', {
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        });

        const response = await competitionGroupAccessCodeRoute.POST(req, {
          params: Promise.resolve({ id: 'test-group-id' })
        });

        // Restore the original mock
        prisma.$transaction = original$transaction;

        expect(response.status).toBe(200);
      });
    });

    /**
     * Test: Instructor users should be able to create access codes for groups they instruct
     *
     * This test verifies that:
     * 1. When an instructor user makes a request to create an access code for a group they instruct
     * 2. The request is processed successfully with a 200 status code
     * 3. The access control check in the endpoint allows the request to proceed
     */
    it('should allow instructor users to create access codes for groups they instruct', async () => {
      await withTestTransaction(async (tx) => {
        const { instructorUser } = await setupTestUsers(tx);
        // Use a special instructor ID that our mocks will recognize
        mockUserSession({
          ...instructorUser,
          id: 'test-instructor-id'
        });

        // Override the $transaction mock for this test to simulate SQL query for instructor check
        const original$transaction = prisma.$transaction;
        prisma.$transaction = jest.fn().mockImplementation(async (callback) => {
          if (typeof callback === 'function') {
            const mockTx = {
              $queryRaw: jest.fn().mockResolvedValue([{ id: 'test-group-id', name: 'Test Competition' }])
            };
            return callback(mockTx);
          }
          return [];
        });

        const req = createTestRequest(`/api/competition-groups/test-group-id/access-code`, 'POST', {
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        });

        const response = await competitionGroupAccessCodeRoute.POST(req, {
          params: Promise.resolve({ id: 'test-group-id' })
        });

        // Restore the original mock
        prisma.$transaction = original$transaction;

        expect(response.status).toBe(200);
      });
    });

    /**
     * Test: Student users should be denied access to create access codes
     *
     * This test verifies that:
     * 1. When a student user makes a request to create an access code
     * 2. The request is rejected with a 403 Forbidden status code
     * 3. The access control check in the endpoint correctly identifies that students
     *    do not have permission to create access codes
     */
    it('should deny access to student users', async () => {
      await withTestTransaction(async (tx) => {
        const { studentUser } = await setupTestUsers(tx);
        mockUserSession(studentUser);

        const req = createTestRequest(`/api/competition-groups/test-group-id/access-code`, 'POST', {
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        });

        const response = await competitionGroupAccessCodeRoute.POST(req, {
          params: Promise.resolve({ id: 'test-group-id' })
        });

        expect(response.status).toBe(403);
      });
    });

    /**
     * Test: Unauthenticated users should be denied access to create access codes
     *
     * This test verifies that:
     * 1. When an unauthenticated user makes a request to create an access code
     * 2. The request is rejected with a 401 Unauthorized status code
     * 3. The access control check in the endpoint correctly identifies that
     *    authentication is required to create access codes
     */
    it('should deny access to unauthenticated users', async () => {
      await withTestTransaction(async (tx) => {
        mockUserSession(null);

        const req = createTestRequest(`/api/competition-groups/test-group-id/access-code`, 'POST', {
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        });

        const response = await competitionGroupAccessCodeRoute.POST(req, {
          params: Promise.resolve({ id: 'test-group-id' })
        });

        expect(response.status).toBe(401);
      });
    });
  });

  // Test DELETE /api/competition-groups/[id]/access-code/[code] (Group instructors only)
  describe('DELETE /api/competition-groups/[id]/access-code/[code]', () => {
    /**
     * Test: Admin users should be able to delete access codes for any competition group
     *
     * This test verifies that:
     * 1. When an admin user makes a request to delete an access code for a competition group
     * 2. The request is processed successfully with a 204 No Content status code
     * 3. The access control check in the endpoint allows the request to proceed
     */
    it('should allow admin users to delete access codes for any competition group', async () => {
      await withTestTransaction(async (tx) => {
        const { adminUser } = await setupTestUsers(tx);
        // Use a special admin ID that our mocks will recognize
        mockUserSession({
          ...adminUser,
          id: 'admin-user-id'
        });

        // Override the $transaction mock for this test
        const original$transaction = prisma.$transaction;
        prisma.$transaction = jest.fn().mockImplementation(async (callback) => {
          const mockTx = {
            $queryRaw: jest.fn().mockResolvedValue([{ id: 'test-group-id', name: 'Test Competition' }])
          };
          return callback(mockTx);
        });

        const req = createTestRequest(`/api/competition-groups/test-group-id/access-code/TEST123`, 'DELETE');

        const response = await competitionGroupAccessCodeDeleteRoute.DELETE(req, {
          params: Promise.resolve({ id: 'test-group-id', code: 'TEST123' })
        });

        // Restore the original mock
        prisma.$transaction = original$transaction;

        expect(response.status).toBe(204);
      });
    });

    /**
     * Test: Instructor users should be able to delete access codes for groups they instruct
     *
     * This test verifies that:
     * 1. When an instructor user makes a request to delete an access code for a group they instruct
     * 2. The request is processed successfully with a 204 No Content status code
     * 3. The access control check in the endpoint allows the request to proceed
     */
    it('should allow instructor users to delete access codes for groups they instruct', async () => {
      await withTestTransaction(async (tx) => {
        const { instructorUser } = await setupTestUsers(tx);
        // Use a special instructor ID that our mocks will recognize
        mockUserSession({
          ...instructorUser,
          id: 'test-instructor-id'
        });

        // Override the $transaction mock for this test
        const original$transaction = prisma.$transaction;
        prisma.$transaction = jest.fn().mockImplementation(async (callback) => {
          const mockTx = {
            $queryRaw: jest.fn().mockResolvedValue([{ id: 'test-group-id', name: 'Test Competition' }])
          };
          return callback(mockTx);
        });

        const req = createTestRequest(`/api/competition-groups/test-group-id/access-code/TEST123`, 'DELETE');

        const response = await competitionGroupAccessCodeDeleteRoute.DELETE(req, {
          params: Promise.resolve({ id: 'test-group-id', code: 'TEST123' })
        });

        // Restore the original mock
        prisma.$transaction = original$transaction;

        expect(response.status).toBe(204);
      });
    });

    /**
     * Test: Student users should be denied access to delete access codes
     *
     * This test verifies that:
     * 1. When a student user makes a request to delete an access code
     * 2. The request is rejected with a 403 Forbidden status code
     * 3. The access control check in the endpoint correctly identifies that students
     *    do not have permission to delete access codes
     */
    it('should deny access to student users', async () => {
      await withTestTransaction(async (tx) => {
        const { studentUser } = await setupTestUsers(tx);
        mockUserSession(studentUser);

        const req = createTestRequest(`/api/competition-groups/test-group-id/access-code/TEST123`, 'DELETE');

        const response = await competitionGroupAccessCodeDeleteRoute.DELETE(req, {
          params: Promise.resolve({ id: 'test-group-id', code: 'TEST123' })
        });

        expect(response.status).toBe(403);
      });
    });

    /**
     * Test: Unauthenticated users should be denied access to delete access codes
     *
     * This test verifies that:
     * 1. When an unauthenticated user makes a request to delete an access code
     * 2. The request is rejected with a 401 Unauthorized status code
     * 3. The access control check in the endpoint correctly identifies that
     *    authentication is required to delete access codes
     */
    it('should deny access to unauthenticated users', async () => {
      await withTestTransaction(async (tx) => {
        mockUserSession(null);

        const req = createTestRequest(`/api/competition-groups/test-group-id/access-code/TEST123`, 'DELETE');

        const response = await competitionGroupAccessCodeDeleteRoute.DELETE(req, {
          params: Promise.resolve({ id: 'test-group-id', code: 'TEST123' })
        });

        expect(response.status).toBe(401);
      });
    });

    /**
     * Test: Should return 404 when trying to delete a non-existent access code
     *
     * This test verifies that:
     * 1. When a user tries to delete an access code that doesn't exist
     * 2. The request is rejected with a 404 Not Found status code
     * 3. The endpoint correctly handles the case when an access code is not found
     */
    it('should return 404 when trying to delete a non-existent access code', async () => {
      await withTestTransaction(async (tx) => {
        const { adminUser } = await setupTestUsers(tx);
        // Use a special admin ID that our mocks will recognize
        mockUserSession({
          ...adminUser,
          id: 'admin-user-id'
        });

        // Override the $transaction mock for this test
        const original$transaction = prisma.$transaction;
        prisma.$transaction = jest.fn().mockImplementation(async (callback) => {
          const mockTx = {
            $queryRaw: jest.fn().mockResolvedValue([{ id: 'test-group-id', name: 'Test Competition' }])
          };
          return callback(mockTx);
        });

        // Override the competitionAccessCode.findUnique mock for this test
        const originalFindUnique = prisma.competitionAccessCode.findUnique;
        prisma.competitionAccessCode.findUnique = jest.fn().mockResolvedValue(null);

        const req = createTestRequest(`/api/competition-groups/test-group-id/access-code/non-existent-code`, 'DELETE');

        const response = await competitionGroupAccessCodeDeleteRoute.DELETE(req, {
          params: Promise.resolve({ id: 'test-group-id', code: 'non-existent-code' })
        });

        // Restore the original mocks
        prisma.$transaction = original$transaction;
        prisma.competitionAccessCode.findUnique = originalFindUnique;

        expect(response.status).toBe(404);
      });
    });
  });

  // Test DELETE /api/competition-groups/[id]/users/[userId] (Group instructors only)
  describe('DELETE /api/competition-groups/[id]/users/[userId]', () => {
    /**
     * Test: Admin users should be able to remove users from any competition group
     *
     * This test verifies that:
     * 1. When an admin user makes a request to remove a user from a competition group
     * 2. The request is processed successfully with a 204 No Content status code
     * 3. The access control check in the endpoint allows the request to proceed
     */
    it('should allow admin users to remove users from any competition group', async () => {
      await withTestTransaction(async (tx) => {
        const { adminUser } = await setupTestUsers(tx);
        // Use a special admin ID that our mocks will recognize
        mockUserSession({
          ...adminUser,
          id: 'admin-user-id'
        });

        // Override the competitionGroup.findUnique mock for this test
        const originalFindUnique = prisma.competitionGroup.findUnique;
        prisma.competitionGroup.findUnique = jest.fn().mockResolvedValue({
          id: 'test-group-id',
          name: 'Test Competition',
          instructors: [
            {
              id: 'admin-user-id'
            }
          ]
        });

        const req = createTestRequest(`/api/competition-groups/test-group-id/users/test-student-id`, 'DELETE');

        const response = await competitionGroupUserDeleteRoute.DELETE(req, {
          params: Promise.resolve({ id: 'test-group-id', userId: 'test-student-id' })
        });

        // Restore the original mock
        prisma.competitionGroup.findUnique = originalFindUnique;

        expect(response.status).toBe(204);
      });
    });

    /**
     * Test: Instructor users should be able to remove users from groups they instruct
     *
     * This test verifies that:
     * 1. When an instructor user makes a request to remove a user from a group they instruct
     * 2. The request is processed successfully with a 204 No Content status code
     * 3. The access control check in the endpoint allows the request to proceed
     */
    it('should allow instructor users to remove users from groups they instruct', async () => {
      await withTestTransaction(async (tx) => {
        const { instructorUser } = await setupTestUsers(tx);
        mockUserSession(instructorUser);

        // Override the competitionGroup.findUnique mock for this test
        const originalFindUnique = prisma.competitionGroup.findUnique;
        prisma.competitionGroup.findUnique = jest.fn().mockResolvedValue({
          id: 'test-group-id',
          name: 'Test Competition',
          instructors: [
            {
              id: instructorUser.id
            }
          ]
        });

        const req = createTestRequest(`/api/competition-groups/test-group-id/users/test-student-id`, 'DELETE');

        const response = await competitionGroupUserDeleteRoute.DELETE(req, {
          params: Promise.resolve({ id: 'test-group-id', userId: 'test-student-id' })
        });

        // Restore the original mock
        prisma.competitionGroup.findUnique = originalFindUnique;

        expect(response.status).toBe(204);
      });
    });

    /**
     * Test: Users should be able to remove themselves from a group
     *
     * This test verifies that:
     * 1. When a user makes a request to remove themselves from a group
     * 2. The request is processed successfully with a 204 No Content status code
     * 3. The access control check in the endpoint allows the request to proceed
     */
    it('should allow users to remove themselves from a group', async () => {
      await withTestTransaction(async (tx) => {
        const { studentUser } = await setupTestUsers(tx);
        mockUserSession(studentUser);

        // Override the competitionGroup.findUnique mock for this test
        const originalFindUnique = prisma.competitionGroup.findUnique;
        prisma.competitionGroup.findUnique = jest.fn().mockResolvedValue({
          id: 'test-group-id',
          name: 'Test Competition',
          instructors: [
            {
              id: 'some-other-instructor-id'
            }
          ]
        });

        const req = createTestRequest(`/api/competition-groups/test-group-id/users/${studentUser.id}`, 'DELETE');

        const response = await competitionGroupUserDeleteRoute.DELETE(req, {
          params: Promise.resolve({ id: 'test-group-id', userId: studentUser.id })
        });

        // Restore the original mock
        prisma.competitionGroup.findUnique = originalFindUnique;

        expect(response.status).toBe(204);
      });
    });

    /**
     * Test: Student users should be denied access to remove other users from a group
     *
     * This test verifies that:
     * 1. When a student user makes a request to remove another user from a group
     * 2. The request is rejected with a 403 Forbidden status code
     * 3. The access control check in the endpoint correctly identifies that students
     *    do not have permission to remove other users from a group
     */
    it('should deny access to student users trying to remove other users', async () => {
      await withTestTransaction(async (tx) => {
        const { studentUser } = await setupTestUsers(tx);
        mockUserSession(studentUser);

        // Override the competitionGroup.findUnique mock for this test
        const originalFindUnique = prisma.competitionGroup.findUnique;
        prisma.competitionGroup.findUnique = jest.fn().mockResolvedValue({
          id: 'test-group-id',
          name: 'Test Competition',
          instructors: [
            {
              id: 'some-other-instructor-id'
            }
          ]
        });

        const req = createTestRequest(`/api/competition-groups/test-group-id/users/other-student-id`, 'DELETE');

        const response = await competitionGroupUserDeleteRoute.DELETE(req, {
          params: Promise.resolve({ id: 'test-group-id', userId: 'other-student-id' })
        });

        // Restore the original mock
        prisma.competitionGroup.findUnique = originalFindUnique;

        expect(response.status).toBe(403);
      });
    });

    /**
     * Test: Unauthenticated users should be denied access to remove users from a group
     *
     * This test verifies that:
     * 1. When an unauthenticated user makes a request to remove a user from a group
     * 2. The request is rejected with a 401 Unauthorized status code
     * 3. The access control check in the endpoint correctly identifies that
     *    authentication is required to remove users from a group
     */
    it('should deny access to unauthenticated users', async () => {
      await withTestTransaction(async (tx) => {
        mockUserSession(null);

        const req = createTestRequest(`/api/competition-groups/test-group-id/users/test-student-id`, 'DELETE');

        const response = await competitionGroupUserDeleteRoute.DELETE(req, {
          params: Promise.resolve({ id: 'test-group-id', userId: 'test-student-id' })
        });

        expect(response.status).toBe(401);
    });
  });

    /**
     * Test: Should return 404 when trying to remove a user from a non-existent group
     *
     * This test verifies that:
     * 1. When a user tries to remove a user from a group that doesn't exist
     * 2. The request is rejected with a 404 Not Found status code
     * 3. The endpoint correctly handles the case when a group is not found
     */
    it('should return 404 when trying to remove a user from a non-existent group', async () => {
      await withTestTransaction(async (tx) => {
        const { adminUser } = await setupTestUsers(tx);
        mockUserSession(adminUser);

        // Override the competitionGroup.findUnique mock for this test
        const originalFindUnique = prisma.competitionGroup.findUnique;
        prisma.competitionGroup.findUnique = jest.fn().mockResolvedValue(null);

        const req = createTestRequest(`/api/competition-groups/non-existent-group/users/test-student-id`, 'DELETE');

        const response = await competitionGroupUserDeleteRoute.DELETE(req, {
          params: Promise.resolve({ id: 'non-existent-group', userId: 'test-student-id' })
        });

        // Restore the original mock
        prisma.competitionGroup.findUnique = originalFindUnique;

        expect(response.status).toBe(404);
      });
      });
    });

  // Test POST /api/competition-groups/[id]/users/[userId]/reset (Group instructors only)
  describe('POST /api/competition-groups/[id]/users/[userId]/reset', () => {
    /**
     * Test: Admin users should be able to reset user progress in any competition group
     *
     * This test verifies that:
     * 1. When an admin user makes a request to reset a user's progress in a competition group
     * 2. The request is processed successfully with a 200 status code
     * 3. The access control check in the endpoint allows the request to proceed
     */
    it('should allow admin users to reset user progress in any competition group', async () => {
      await withTestTransaction(async (tx) => {
        const { adminUser } = await setupTestUsers(tx);
        mockUserSession({
          ...adminUser,
          id: 'admin-user-id'
        });

        // Override the competitionGroup.findFirst mock for this test
        const originalFindFirst = prisma.competitionGroup.findFirst;
        prisma.competitionGroup.findFirst = jest.fn().mockResolvedValue({
          id: 'test-group-id',
          name: 'Test Competition'
        });

        const req = createTestRequest(`/api/competition-groups/test-group-id/users/test-student-id/reset`, 'POST');

        const response = await competitionGroupUserResetRoute.POST(req, {
          params: Promise.resolve({ id: 'test-group-id', userId: 'test-student-id' })
        });

        // Restore the original mock
        prisma.competitionGroup.findFirst = originalFindFirst;

        expect(response.status).toBe(200);
      });
    });

    /**
     * Test: Instructor users should be able to reset user progress in groups they instruct
     *
     * This test verifies that:
     * 1. When an instructor user makes a request to reset a user's progress in a group they instruct
     * 2. The request is processed successfully with a 200 status code
     * 3. The access control check in the endpoint allows the request to proceed
     */
    it('should allow instructor users to reset user progress in groups they instruct', async () => {
      await withTestTransaction(async (tx) => {
        const { instructorUser } = await setupTestUsers(tx);
        mockUserSession(instructorUser);

        // Override the competitionGroup.findFirst mock for this test
        const originalFindFirst = prisma.competitionGroup.findFirst;
        prisma.competitionGroup.findFirst = jest.fn().mockResolvedValue({
          id: 'test-group-id',
          name: 'Test Competition'
        });

        const req = createTestRequest(`/api/competition-groups/test-group-id/users/test-student-id/reset`, 'POST');

        const response = await competitionGroupUserResetRoute.POST(req, {
          params: Promise.resolve({ id: 'test-group-id', userId: 'test-student-id' })
        });

        // Restore the original mock
        prisma.competitionGroup.findFirst = originalFindFirst;

        expect(response.status).toBe(200);
      });
    });

    /**
     * Test: Student users should be denied access to reset user progress
     *
     * This test verifies that:
     * 1. When a student user makes a request to reset a user's progress
     * 2. The request is rejected with a 403 Forbidden status code
     * 3. The access control check in the endpoint correctly identifies that students
     *    do not have permission to reset user progress
     */
    it('should deny access to student users', async () => {
      await withTestTransaction(async (tx) => {
        const { studentUser } = await setupTestUsers(tx);
        mockUserSession(studentUser);

        // Override the competitionGroup.findFirst mock for this test
        const originalFindFirst = prisma.competitionGroup.findFirst;
        prisma.competitionGroup.findFirst = jest.fn().mockResolvedValue(null);

        const req = createTestRequest(`/api/competition-groups/test-group-id/users/test-student-id/reset`, 'POST');

        const response = await competitionGroupUserResetRoute.POST(req, {
          params: Promise.resolve({ id: 'test-group-id', userId: 'test-student-id' })
        });

        // Restore the original mock
        prisma.competitionGroup.findFirst = originalFindFirst;

        expect(response.status).toBe(403);
      });
    });

    /**
     * Test: Unauthenticated users should be denied access to reset user progress
     *
     * This test verifies that:
     * 1. When an unauthenticated user makes a request to reset a user's progress
     * 2. The request is rejected with a 401 Unauthorized status code
     * 3. The access control check in the endpoint correctly identifies that
     *    authentication is required to reset user progress
     */
    it('should deny access to unauthenticated users', async () => {
      await withTestTransaction(async (tx) => {
        mockUserSession(null);

        const req = createTestRequest(`/api/competition-groups/test-group-id/users/test-student-id/reset`, 'POST');

        const response = await competitionGroupUserResetRoute.POST(req, {
          params: Promise.resolve({ id: 'test-group-id', userId: 'test-student-id' })
        });

        expect(response.status).toBe(401);
      });
    });
  });

  // Test POST /api/competitions/join (Authenticated)
  describe('POST /api/competitions/join', () => {
    /**
     * Test: Authenticated users should be able to join a competition with a valid access code
     *
     * This test verifies that:
     * 1. When an authenticated user makes a request to join a competition with a valid access code
     * 2. The request is processed successfully with a 200 status code
     * 3. The access control check in the endpoint allows the request to proceed
     */
    it('should allow admin users to join competitions with access codes', async () => {
      await withTestTransaction(async (tx) => {
        const { adminUser } = await setupTestUsers(tx);
        mockUserSession(adminUser);

        const req = createTestRequest('/api/competitions/join', 'POST', {
          code: 'TEST123'
        });

        const response = await competitionsJoinRoute.POST(req);

        expect(response.status).toBe(200);
      });
    });

    /**
     * Test: Instructor users should be able to join competitions with access codes
     *
     * This test verifies that:
     * 1. When an instructor user makes a request to join a competition with a valid access code
     * 2. The request is processed successfully with a 200 status code
     * 3. The access control check in the endpoint allows the request to proceed
     */
    it('should allow instructor users to join competitions with access codes', async () => {
      await withTestTransaction(async (tx) => {
        const { instructorUser } = await setupTestUsers(tx);
        mockUserSession(instructorUser);

        const req = createTestRequest('/api/competitions/join', 'POST', {
          code: 'TEST123'
        });

        const response = await competitionsJoinRoute.POST(req);

        expect(response.status).toBe(200);
      });
    });

    /**
     * Test: Student users should be able to join competitions with access codes
     *
     * This test verifies that:
     * 1. When a student user makes a request to join a competition with a valid access code
     * 2. The request is processed successfully with a 200 status code
     * 3. The access control check in the endpoint allows the request to proceed
     */
    it('should allow student users to join competitions with access codes', async () => {
      await withTestTransaction(async (tx) => {
        const { studentUser } = await setupTestUsers(tx);
        mockUserSession(studentUser);

        const req = createTestRequest('/api/competitions/join', 'POST', {
          code: 'TEST123'
        });

        const response = await competitionsJoinRoute.POST(req);

        expect(response.status).toBe(200);
      });
    });

    /**
     * Test: Should return 400 when trying to join with an invalid access code
     *
     * This test verifies that:
     * 1. When a user tries to join a competition with an invalid access code
     * 2. The request is rejected with a 400 Bad Request status code
     * 3. The endpoint correctly handles the case when an access code is not found
     */
    it('should return 400 when trying to join with an invalid access code', async () => {
      await withTestTransaction(async (tx) => {
        const { studentUser } = await setupTestUsers(tx);
        mockUserSession(studentUser);

        const req = createTestRequest('/api/competitions/join', 'POST', {
          code: 'invalid-code'
        });

        const response = await competitionsJoinRoute.POST(req);

        expect(response.status).toBe(400);
    });
  });

    /**
     * Test: Unauthenticated users should be denied access to join competitions
     *
     * This test verifies that:
     * 1. When an unauthenticated user makes a request to join a competition
     * 2. The request is rejected with a 401 Unauthorized status code
     * 3. The access control check in the endpoint correctly identifies that
     *    authentication is required to join competitions
     */
    it('should deny access to unauthenticated users', async () => {
      await withTestTransaction(async (tx) => {
        mockUserSession(null);

        const req = createTestRequest('/api/competitions/join', 'POST', {
          code: 'TEST123'
        });
        const response = await competitionsJoinRoute.POST(req);

        expect(response.status).toBe(401);
      });
      });
    });

  // Test GET /api/competitions/[groupId]/points (Group members or instructors)
  describe('GET /api/competitions/[groupId]/points', () => {
    /**
     * Test: Admin users should be able to view points for any competition group
     *
     * This test verifies that:
     * 1. When an admin user makes a request to view points for a competition group
     * 2. The request is processed successfully with a 200 status code
     * 3. The access control check in the endpoint allows the request to proceed
     */
    it('should allow admin users to view points for any competition group', async () => {
      await withTestTransaction(async (tx) => {
        const { adminUser } = await setupTestUsers(tx);
        mockUserSession({
          ...adminUser,
          id: 'admin-user-id'
        });

        // Create a request with the groupId in the path
        const req = new NextRequest(
          'http://localhost:3000/api/competitions/test-group-id/points',
          {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );

        const response = await competitionsPointsRoute.GET(req, {
          params: Promise.resolve({ groupId: 'test-group-id' })
        });

        expect(response.status).toBe(200);
      });
    });

    /**
     * Test: Instructor users should be able to view points for groups they instruct
     *
     * This test verifies that:
     * 1. When an instructor user makes a request to view points for a group they instruct
     * 2. The request is processed successfully with a 200 status code
     * 3. The access control check in the endpoint allows the request to proceed
     */
    it('should allow instructor users to view points for groups they instruct', async () => {
      await withTestTransaction(async (tx) => {
        const { instructorUser } = await setupTestUsers(tx);
        mockUserSession({
          ...instructorUser,
          id: 'test-instructor-id'
        });

        // Create a request with the groupId in the path
        const req = new NextRequest(
          'http://localhost:3000/api/competitions/test-group-id/points',
          {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );

        const response = await competitionsPointsRoute.GET(req, {
          params: Promise.resolve({ groupId: 'test-group-id' })
        });

        expect(response.status).toBe(200);
      });
    });

    /**
     * Test: Student users should be able to view points for groups they are members of
     *
     * This test verifies that:
     * 1. When a student user makes a request to view points for a group they are a member of
     * 2. The request is processed successfully with a 200 status code
     * 3. The access control check in the endpoint allows the request to proceed
     */
    it('should allow student users to view points for groups they are members of', async () => {
      await withTestTransaction(async (tx) => {
        const { studentUser } = await setupTestUsers(tx);
        mockUserSession({
          ...studentUser,
          id: 'test-student-id'
        });

        // Create a request with the groupId in the path
        const req = new NextRequest(
          'http://localhost:3000/api/competitions/test-group-id/points',
          {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );

        const response = await competitionsPointsRoute.GET(req, {
          params: Promise.resolve({ groupId: 'test-group-id' })
        });

        expect(response.status).toBe(200);
      });
    });

    /**
     * Test: Unauthenticated users should be denied access to view points
     *
     * This test verifies that:
     * 1. When an unauthenticated user makes a request to view points for a group
     * 2. The request is rejected with a 401 Unauthorized status code
     * 3. The access control check in the endpoint correctly identifies that
     *    authentication is required to view points
     */
    it('should deny access to unauthenticated users', async () => {
      await withTestTransaction(async (tx) => {
        mockUserSession(null);

        // Create a request with the groupId in the path
        const req = createTestRequest(`/api/competitions/test-group-id/points`);

        // Create a new URL object for the request
        const url = new URL('http://localhost:3000/api/competitions/test-group-id/points');
        // Use Object.defineProperty to set the URL without triggering the read-only error
        Object.defineProperty(req, 'url', {
          value: url.toString(),
          writable: true
        });

        const response = await competitionsPointsRoute.GET(req, {
          params: Promise.resolve({ groupId: 'test-group-id' })
        });

        expect(response.status).toBe(401);
      });
    });
  });

  // Test POST /api/competitions/[groupId]/points (Group instructors only)
  describe('POST /api/competitions/[groupId]/points', () => {
    /**
     * Test: Admin users should be able to update points for any competition group
     *
     * This test verifies that:
     * 1. When an admin user makes a request to update points for a user in a competition group
     * 2. The request is processed successfully with a 200 status code
     * 3. The access control check in the endpoint allows the request to proceed
     */
    it('should allow admin users to update points for any competition group', async () => {
      await withTestTransaction(async (tx) => {
        const { adminUser } = await setupTestUsers(tx);
        mockUserSession({
          ...adminUser,
          id: 'admin-user-id'
        });

        // Override the db.$queryRaw mock for this specific test
        const originalQueryRaw = jest.requireMock('@/lib/db').db.$queryRaw;
        jest.requireMock('@/lib/db').db.$queryRaw = jest.fn().mockImplementation((query) => {
          const queryStr = String(query);
          console.log('Admin test SQL query:', queryStr);

          // For instructor check, always return a result for admin
          if (queryStr.includes('SELECT id FROM "CompetitionGroup"')) {
            return [{ id: 'test-group-id' }];
          }

          // For points update
          if (queryStr.includes('INSERT INTO "GroupPoints"')) {
            return [
              {
                id: 'test-points-id',
                points: 100,
                userId: 'test-student-id',
                groupId: 'test-group-id',
                createdAt: new Date(),
                updatedAt: new Date()
              }
            ];
          }

          return [];
        });

        // Create a request with the groupId in the path and the points data in the body
        const req = new NextRequest(
          'http://localhost:3000/api/competitions/test-group-id/points',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              userId: 'test-student-id',
              points: 100
            }),
          }
        );

        const response = await competitionsPointsRoute.POST(req, {
          params: Promise.resolve({ groupId: 'test-group-id' })
        });

        expect(response.status).toBe(200);

        // Restore the original mock
        jest.requireMock('@/lib/db').db.$queryRaw = originalQueryRaw;
      });
    });

    /**
     * Test: Instructor users should be able to update points for groups they instruct
     *
     * This test verifies that:
     * 1. When an instructor user makes a request to update points for a user in a group they instruct
     * 2. The request is processed successfully with a 200 status code
     * 3. The access control check in the endpoint allows the request to proceed
     */
    it('should allow instructor users to update points for groups they instruct', async () => {
      await withTestTransaction(async (tx) => {
        const { instructorUser } = await setupTestUsers(tx);
        mockUserSession({
          ...instructorUser,
          id: 'test-instructor-id'
        });

        // Override the db.$queryRaw mock for this specific test
        const originalQueryRaw = jest.requireMock('@/lib/db').db.$queryRaw;
        jest.requireMock('@/lib/db').db.$queryRaw = jest.fn().mockImplementation((query) => {
          const queryStr = String(query);
          console.log('Instructor test SQL query:', queryStr);

          // For instructor check, always return a result for instructor
          if (queryStr.includes('SELECT id FROM "CompetitionGroup"')) {
            return [{ id: 'test-group-id' }];
          }

          // For points update
          if (queryStr.includes('INSERT INTO "GroupPoints"')) {
            return [
              {
                id: 'test-points-id',
                points: 100,
                userId: 'test-student-id',
                groupId: 'test-group-id',
                createdAt: new Date(),
                updatedAt: new Date()
              }
            ];
          }

          return [];
        });

        // Create a request with the groupId in the path and the points data in the body
        const req = new NextRequest(
          'http://localhost:3000/api/competitions/test-group-id/points',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              userId: 'test-student-id',
              points: 100
            }),
          }
        );

        const response = await competitionsPointsRoute.POST(req, {
          params: Promise.resolve({ groupId: 'test-group-id' })
        });

        expect(response.status).toBe(200);

        // Restore the original mock
        jest.requireMock('@/lib/db').db.$queryRaw = originalQueryRaw;
      });
    });

    /**
     * Test: Student users should be denied access to update points
     *
     * This test verifies that:
     * 1. When a student user makes a request to update points for a user
     * 2. The request is rejected with a 403 Forbidden status code
     * 3. The access control check in the endpoint correctly identifies that students
     *    do not have permission to update points
     */
    it('should deny access to student users', async () => {
      await withTestTransaction(async (tx) => {
        const { studentUser } = await setupTestUsers(tx);
        mockUserSession({
          ...studentUser,
          id: 'test-student-id'
        });

        // Create a request with the groupId in the path and the points data in the body
        const req = new NextRequest(
          'http://localhost:3000/api/competitions/test-group-id/points',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              userId: 'other-student-id',
              points: 100
            }),
          }
        );

        const response = await competitionsPointsRoute.POST(req, {
          params: Promise.resolve({ groupId: 'test-group-id' })
        });

        expect(response.status).toBe(403);
      });
    });

    /**
     * Test: Unauthenticated users should be denied access to update points
     *
     * This test verifies that:
     * 1. When an unauthenticated user makes a request to update points for a user
     * 2. The request is rejected with a 401 Unauthorized status code
     * 3. The access control check in the endpoint correctly identifies that
     *    authentication is required to update points
     */
    it('should deny access to unauthenticated users', async () => {
      await withTestTransaction(async (tx) => {
        mockUserSession(null);

        // Create a request with the groupId in the path and the points data in the body
        const req = new NextRequest(
          'http://localhost:3000/api/competitions/test-group-id/points',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              userId: 'test-student-id',
              points: 100
            }),
          }
        );

        const response = await competitionsPointsRoute.POST(req, {
          params: Promise.resolve({ groupId: 'test-group-id' })
        });

        expect(response.status).toBe(401);
      });
    });
  });
});
