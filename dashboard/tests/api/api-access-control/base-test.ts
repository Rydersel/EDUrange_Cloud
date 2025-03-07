import { NextRequest, NextResponse } from 'next/server';
import { withTestTransaction, generateTestId, generateTestEmail, generateTestName } from '../../utils/test-helpers';
import { UserRole } from '@prisma/client';
import { getServerSession } from 'next-auth/next';

// Mock auth.config.ts to avoid the @auth/prisma-adapter dependency
jest.mock('@/auth.config', () => ({
  default: {
    providers: [],
    session: { strategy: 'jwt' },
  },
}));

// Mock NextAuth to return our test session
jest.mock('next-auth/next', () => ({
  getServerSession: jest.fn(),
}));

// Mock the auth-utils functions
jest.mock('@/lib/auth-utils', () => ({
  requireAdmin: jest.fn(async (req) => {
    // Get the mocked session
    const session = await getServerSession();

    // Check if user is authenticated
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Return null if user is admin (allowing the request to proceed)
    return null;
  }),
  checkIsAdmin: jest.fn(),
  requireAdminAccess: jest.fn(),
}));

// Import the mocked requireAdmin function
import { requireAdmin } from '@/lib/auth-utils';

/**
 * Helper function to create a test request
 */
export const createTestRequest = (path: string, method = 'GET', body?: any) => {
  const url = new URL(`http://localhost:3000${path}`);

  if (body) {
    return new NextRequest(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  }

  return new NextRequest(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  });
};

/**
 * Helper function to set up test users with different roles
 */
export const setupTestUsers = async (tx: any) => {
  // Create an admin user
  const adminUser = await tx.user.create({
    data: {
      id: generateTestId('admin'),
      name: generateTestName('Admin'),
      email: generateTestEmail('admin'),
      role: UserRole.ADMIN,
    },
  });

  // Create an instructor user
  const instructorUser = await tx.user.create({
    data: {
      id: generateTestId('instructor'),
      name: generateTestName('Instructor'),
      email: generateTestEmail('instructor'),
      role: UserRole.INSTRUCTOR,
    },
  });

  // Create a student user
  const studentUser = await tx.user.create({
    data: {
      id: generateTestId('student'),
      name: generateTestName('Student'),
      email: generateTestEmail('student'),
      role: UserRole.STUDENT,
    },
  });

  // Create another student user (for testing access to other users' data)
  const otherStudentUser = await tx.user.create({
    data: {
      id: generateTestId('other-student'),
      name: generateTestName('Other Student'),
      email: generateTestEmail('other-student'),
      role: UserRole.STUDENT,
    },
  });

  return { adminUser, instructorUser, studentUser, otherStudentUser };
};

/**
 * Helper function to create a test competition group
 */
export const createTestGroup = async (tx: any, instructorId: string, studentIds: string[] = []) => {
  const group = await tx.competitionGroup.create({
    data: {
      id: generateTestId('group'),
      name: generateTestName('Group'),
      description: 'Test group description',
      startDate: new Date(),
      instructors: {
        connect: [{ id: instructorId }]
      },
      members: {
        connect: studentIds.map(id => ({ id }))
      }
    },
  });

  return group;
};

/**
 * Helper function to create a test challenge
 */
export const createTestChallenge = async (tx: any) => {
  // Create a challenge type first
  const challengeType = await tx.challengeType.create({
    data: {
      id: generateTestId('challenge-type'),
      name: generateTestName('Challenge Type'),
    },
  });

  // Create the challenge
  const challenge = await tx.challenges.create({
    data: {
      id: generateTestId('challenge'),
      name: generateTestName('Challenge'),
      description: 'Test challenge description',
      difficulty: 'EASY',
      challengeTypeId: challengeType.id,
      challengeImage: 'test-image.jpg',
    },
  });

  return { challenge, challengeType };
};

/**
 * Helper function to mock a user session
 */
export const mockUserSession = (user: any) => {
  if (!user) {
    (getServerSession as jest.Mock).mockResolvedValue(null);
    return;
  }

  (getServerSession as jest.Mock).mockResolvedValue({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  });
};

/**
 * Helper function to reset all mocks
 */
export const resetMocks = () => {
  jest.clearAllMocks();
};
