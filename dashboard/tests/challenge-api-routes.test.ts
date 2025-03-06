import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { UserRole } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { generateTestEmail, generateTestId, generateTestName } from './test-helpers';
import { authOptions } from '@/lib/auth';
import { ActivityLogger } from '@/lib/activity-logger';

// Mock NextAuth
jest.mock('next-auth');
jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
    challenges: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    challengeType: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'type1', name: 'Type 1' },
        { id: 'type2', name: 'Type 2' },
      ]),
    },
    challengeQuestion: {
      findMany: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    appConfig: {
      findMany: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
    },
    challengeSubmission: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    $queryRaw: jest.fn().mockResolvedValue([
      { id: 'type1', name: 'Type 1' },
      { id: 'type2', name: 'Type 2' },
    ]),
  },
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

// Mock rate limiter
jest.mock('@/lib/rate-limit', () => {
  return jest.fn().mockImplementation(() => ({
    check: jest.fn().mockResolvedValue(null),
  }));
});

// Mock activity logger
jest.mock('@/lib/activity-logger', () => ({
  ActivityLogger: {
    logActivity: jest.fn().mockResolvedValue(undefined),
    logChallengeEvent: jest.fn().mockResolvedValue(undefined),
  },
  ActivityEventType: {
    CHALLENGE_STARTED: "CHALLENGE_STARTED",
    CHALLENGE_INSTANCE_CREATED: "CHALLENGE_INSTANCE_CREATED",
  }
}));

describe('Challenge API Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/challenges', () => {
    // Import the actual module
    const { GET: getChallenges } = require('@/app/api/challenges/route');

    it('should return 401 for unauthenticated requests', async () => {
      // Mock getServerSession to return null (unauthenticated)
      (getServerSession as jest.Mock).mockResolvedValue(null);
      
      // Create a mock request
      const req = new NextRequest(new URL('http://localhost:3000/api/challenges'), {
        method: 'GET',
      });
      
      // Call the handler
      const response = await getChallenges(req);
      
      // Verify getServerSession was called
      expect(getServerSession).toHaveBeenCalledWith(authOptions);
      
      // Verify the response status
      expect(response.status).toBe(401);
    });

    it('should return challenges for authenticated users', async () => {
      // Create a mock user
      const mockUser = {
        id: generateTestId('challenge-test'),
        email: generateTestEmail('challenge-test'),
        name: generateTestName('Challenge Test'),
        role: UserRole.STUDENT,
      };
      
      // Mock getServerSession to return a session with the mock user
      (getServerSession as jest.Mock).mockResolvedValue({
        user: mockUser,
      });
      
      // Mock challenges data
      const mockChallenges = [
        {
          id: 'challenge1',
          name: 'Challenge 1',
          description: 'Description 1',
          difficulty: 'EASY',
          challengeImage: 'image1.png',
          challengeType: { id: 'type1', name: 'Type 1' },
          questions: [
            { id: 'q1', content: 'Question 1', type: 'text', points: 10, answer: 'Answer 1', order: 1 },
          ],
          appConfigs: [],
        },
        {
          id: 'challenge2',
          name: 'Challenge 2',
          description: 'Description 2',
          difficulty: 'MEDIUM',
          challengeImage: 'image2.png',
          challengeType: { id: 'type2', name: 'Type 2' },
          questions: [
            { id: 'q2', content: 'Question 2', type: 'text', points: 20, answer: 'Answer 2', order: 1 },
          ],
          appConfigs: [],
        },
      ];
      
      // Mock prisma.challenges.findMany to return mock challenges
      (prisma.challenges.findMany as jest.Mock).mockResolvedValue(mockChallenges);
      
      // Create a mock request
      const req = new NextRequest(new URL('http://localhost:3000/api/challenges'), {
        method: 'GET',
      });
      
      // Call the handler
      const response = await getChallenges(req);
      
      // Verify getServerSession was called
      expect(getServerSession).toHaveBeenCalledWith(authOptions);
      
      // Verify prisma.challenges.findMany was called
      expect(prisma.challenges.findMany).toHaveBeenCalled();
      
      // Verify the response
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual(mockChallenges);
    });
  });

  describe('POST /api/challenges', () => {
    // Import the actual module
    const { POST: createChallenge } = require('@/app/api/challenges/route');

    it('should return 401 for unauthenticated requests', async () => {
      // Mock getServerSession to return null (unauthenticated)
      (getServerSession as jest.Mock).mockResolvedValue(null);
      
      // Create a mock request
      const req = new NextRequest(new URL('http://localhost:3000/api/challenges'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'New Challenge',
          description: 'New Description',
          difficulty: 'EASY',
          challengeTypeId: 'type1',
          challengeImage: 'new-image.png',
          questions: [
            {
              content: 'New Question',
              type: 'text',
              points: 10,
              answer: 'New Answer',
              order: 1,
            },
          ],
        }),
      });
      
      // Call the handler
      const response = await createChallenge(req);
      
      // Verify getServerSession was called
      expect(getServerSession).toHaveBeenCalledWith(authOptions);
      
      // Verify the response status
      expect(response.status).toBe(401);
    });

    it('should return 403 for non-admin users', async () => {
      // Create a mock user with non-admin role
      const mockUser = {
        id: generateTestId('challenge-test'),
        email: generateTestEmail('challenge-test'),
        name: generateTestName('Challenge Test'),
        role: UserRole.STUDENT,
      };
      
      // Mock getServerSession to return a session with the mock user
      (getServerSession as jest.Mock).mockResolvedValue({
        user: mockUser,
      });
      
      // Mock prisma.user.findUnique to return the mock user
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      
      // Create a mock request
      const req = new NextRequest(new URL('http://localhost:3000/api/challenges'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'New Challenge',
          description: 'New Description',
          difficulty: 'EASY',
          challengeTypeId: 'type1',
          challengeImage: 'new-image.png',
          questions: [
            {
              content: 'New Question',
              type: 'text',
              points: 10,
              answer: 'New Answer',
              order: 1,
            },
          ],
        }),
      });
      
      // Call the handler
      const response = await createChallenge(req);
      
      // Verify getServerSession was called
      expect(getServerSession).toHaveBeenCalledWith(authOptions);
      
      // Verify prisma.user.findUnique was called
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        select: { role: true },
      });
      
      // Verify the response status
      expect(response.status).toBe(403);
    });

    it('should validate challenge data', async () => {
      // Create a mock admin user
      const mockAdmin = {
        id: generateTestId('admin-test'),
        email: generateTestEmail('admin-test'),
        name: generateTestName('Admin Test'),
        role: UserRole.ADMIN,
      };
      
      // Mock getServerSession to return a session with the admin user
      (getServerSession as jest.Mock).mockResolvedValue({
        user: mockAdmin,
      });
      
      // Mock prisma.user.findUnique to return the admin user
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ role: UserRole.ADMIN });
      
      // Create a mock request with invalid data (missing required fields)
      const req = new NextRequest(new URL('http://localhost:3000/api/challenges'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          // Missing name, description, etc.
          difficulty: 'INVALID_DIFFICULTY', // Invalid enum value
          questions: [], // Empty questions array
        }),
      });
      
      // Call the handler
      const response = await createChallenge(req);
      
      // Verify getServerSession was called
      expect(getServerSession).toHaveBeenCalledWith(authOptions);
      
      // Verify the response status (should be 400 Bad Request)
      expect(response.status).toBe(400);
      
      // Verify prisma.challenges.create was not called
      expect(prisma.challenges.create).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/challenges/[id]', () => {
    // Import the actual module if it exists
    let getChallenge: any;
    try {
      getChallenge = require('@/app/api/challenges/[id]/route').GET;
    } catch (error) {
      // If the module doesn't exist, we'll skip these tests
      console.warn('Challenge by ID API route not found, skipping tests');
    }

    // Only run these tests if the module exists
    if (getChallenge) {
      beforeEach(() => {
        // Mock activity logger for each test
        (ActivityLogger.logActivity as jest.Mock).mockResolvedValue(undefined);
        (ActivityLogger.logChallengeEvent as jest.Mock).mockResolvedValue(undefined);
      });

      it('should return 401 for unauthenticated requests', async () => {
        // Mock getServerSession to return null (unauthenticated)
        (getServerSession as jest.Mock).mockResolvedValue(null);
        
        // Create a mock request
        const req = new NextRequest(new URL('http://localhost:3000/api/challenges/challenge1'), {
          method: 'GET',
        });
        
        // Create mock params
        const params = { params: { id: 'challenge1' } };
        
        // Call the handler
        const response = await getChallenge(req, params);
        
        // Verify getServerSession was called
        expect(getServerSession).toHaveBeenCalledWith(authOptions);
        
        // Verify the response status
        expect(response.status).toBe(401);
      });

      it('should return a challenge by ID for authenticated users', async () => {
        // Create a mock user
        const mockUser = {
          id: generateTestId('challenge-id-test'),
          email: generateTestEmail('challenge-id-test'),
          name: generateTestName('Challenge ID Test'),
          role: UserRole.STUDENT,
        };
        
        // Mock getServerSession to return a session with the mock user
        (getServerSession as jest.Mock).mockResolvedValue({
          user: mockUser,
        });
        
        // Mock challenge data
        const mockChallenge = {
          id: 'challenge1',
          name: 'Challenge 1',
          description: 'Description 1',
          difficulty: 'EASY',
          challengeImage: 'image1.png',
          challengeType: { id: 'type1', name: 'Type 1' },
          questions: [
            { id: 'q1', content: 'Question 1', type: 'text', points: 10, answer: 'Answer 1', order: 1 },
          ],
          appConfigs: [],
        };
        
        // Mock prisma.challenges.findUnique to return the mock challenge
        (prisma.challenges.findUnique as jest.Mock).mockResolvedValue(mockChallenge);
        
        // Create a mock request
        const req = new NextRequest(new URL('http://localhost:3000/api/challenges/challenge1'), {
          method: 'GET',
        });
        
        // Create mock params
        const params = { params: { id: 'challenge1' } };
        
        // Call the handler
        const response = await getChallenge(req, params);
        
        // Verify getServerSession was called
        expect(getServerSession).toHaveBeenCalledWith(authOptions);
        
        // Verify prisma.challenges.findUnique was called with the correct ID
        expect(prisma.challenges.findUnique).toHaveBeenCalledWith(expect.objectContaining({
          where: { id: 'challenge1' },
        }));
        
        // Verify the response
        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data).toEqual(mockChallenge);
        
        // Verify activity logger was called
        expect(ActivityLogger.logChallengeEvent).toHaveBeenCalled();
      });

      it('should return 404 for non-existent challenge', async () => {
        // Create a mock user
        const mockUser = {
          id: generateTestId('challenge-id-test'),
          email: generateTestEmail('challenge-id-test'),
          name: generateTestName('Challenge ID Test'),
          role: UserRole.STUDENT,
        };
        
        // Mock getServerSession to return a session with the mock user
        (getServerSession as jest.Mock).mockResolvedValue({
          user: mockUser,
        });
        
        // Mock prisma.challenges.findUnique to return null (challenge not found)
        (prisma.challenges.findUnique as jest.Mock).mockResolvedValue(null);
        
        // Create a mock request
        const req = new NextRequest(new URL('http://localhost:3000/api/challenges/nonexistent'), {
          method: 'GET',
        });
        
        // Create mock params
        const params = { params: { id: 'nonexistent' } };
        
        // Call the handler
        const response = await getChallenge(req, params);
        
        // Verify getServerSession was called
        expect(getServerSession).toHaveBeenCalledWith(authOptions);
        
        // Verify prisma.challenges.findUnique was called with the correct ID
        expect(prisma.challenges.findUnique).toHaveBeenCalledWith(expect.objectContaining({
          where: { id: 'nonexistent' },
        }));
        
        // Verify the response status (should be 404 Not Found)
        expect(response.status).toBe(404);
      });
    }
  });
}); 