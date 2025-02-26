import * as dotenv from 'dotenv';
import path from 'path';
import { PrismaClient, UserRole, ActivityEventType as PrismaActivityEventType } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
});

// Helper function to generate unique email
function generateUniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}@test.edurange.org`;
}

// Helper function to verify event logging
async function verifyEvent(eventType: PrismaActivityEventType, userId: string, expectedMetadata: Record<string, any> = {}) {
  const event = await prisma.activityLog.findFirst({
    where: {
      eventType,
      userId,
    },
    orderBy: {
      timestamp: 'desc'
    }
  });

  expect(event).toBeDefined();
  expect(event?.eventType).toBe(eventType);
  expect(event?.userId).toBe(userId);

  if (Object.keys(expectedMetadata).length > 0) {
    const metadata = JSON.parse(event?.metadata as string);
    for (const [key, value] of Object.entries(expectedMetadata)) {
      expect(metadata[key]).toBeDefined();
      if (value !== undefined) {
        expect(metadata[key]).toBe(value);
      }
    }
  }

  return event;
}

describe('Activity Logging', () => {
  let testUserId: string;
  let testGroupId: string;
  let testChallengeId: string;
  let testChallengeTypeId: string;
  let testAccessCodeId: string;

  beforeAll(async () => {
    // Create test user
    const user = await prisma.user.create({
      data: {
        id: `test-${uuidv4()}`,
        email: generateUniqueEmail('test-user'),
        name: 'Test User',
        role: UserRole.STUDENT
      }
    });
    testUserId = user.id;

    // Create test challenge type
    const challengeType = await prisma.challengeType.create({
      data: {
        id: `test-${uuidv4()}`,
        name: 'Test Challenge Type'
      }
    });
    testChallengeTypeId = challengeType.id;

    // Create test challenge
    const challenge = await prisma.challenges.create({
      data: {
        id: `test-${uuidv4()}`,
        name: 'Test Challenge',
        description: 'Test Description',
        difficulty: 'EASY',
        challengeImage: 'test-image',
        challengeTypeId: challengeType.id
      }
    });
    testChallengeId = challenge.id;

    // Create test competition group
    const group = await prisma.competitionGroup.create({
      data: {
        id: `test-${uuidv4()}`,
        name: 'Test Competition',
        description: 'Test Description',
        startDate: new Date(),
        members: {
          connect: [{ id: testUserId }]
        }
      }
    });
    testGroupId = group.id;
  });

  afterAll(async () => {
    // Clean up in correct order
    await prisma.activityLog.deleteMany({
      where: {
        userId: testUserId
      }
    });

    await prisma.competitionAccessCode.deleteMany({
      where: {
        groupId: testGroupId
      }
    });

    await prisma.groupPoints.deleteMany({
      where: {
        userId: testUserId
      }
    });

    await prisma.groupChallenge.deleteMany({
      where: {
        groupId: testGroupId
      }
    });

    await prisma.challenges.deleteMany({
      where: {
        id: testChallengeId
      }
    });

    await prisma.challengeType.deleteMany({
      where: {
        id: testChallengeTypeId
      }
    });

    await prisma.competitionGroup.deleteMany({
      where: {
        id: testGroupId
      }
    });

    await prisma.user.deleteMany({
      where: {
        id: testUserId
      }
    });

    await prisma.$disconnect();
  });

  test('should log user events', async () => {
    // Test user registration event
    await prisma.activityLog.create({
      data: {
        eventType: PrismaActivityEventType.USER_REGISTERED,
        userId: testUserId,
        severity: 'INFO',
        metadata: JSON.stringify({
          email: 'test@test.edurange.org',
          timestamp: new Date().toISOString()
        })
      }
    });

    await verifyEvent(PrismaActivityEventType.USER_REGISTERED, testUserId, {
      email: 'test@test.edurange.org'
    });

    // Test user login event
    await prisma.activityLog.create({
      data: {
        eventType: PrismaActivityEventType.USER_LOGGED_IN,
        userId: testUserId,
        severity: 'INFO',
        metadata: JSON.stringify({
          timestamp: new Date().toISOString()
        })
      }
    });

    await verifyEvent(PrismaActivityEventType.USER_LOGGED_IN, testUserId);
  });

  test('should log group events', async () => {
    // Test group creation event
    await prisma.activityLog.create({
      data: {
        eventType: PrismaActivityEventType.GROUP_CREATED,
        userId: testUserId,
        severity: 'INFO',
        metadata: JSON.stringify({
          groupId: testGroupId,
          timestamp: new Date().toISOString()
        })
      }
    });

    await verifyEvent(PrismaActivityEventType.GROUP_CREATED, testUserId, {
      groupId: testGroupId
    });

    // Test group join event
    await prisma.activityLog.create({
      data: {
        eventType: PrismaActivityEventType.GROUP_JOINED,
        userId: testUserId,
        severity: 'INFO',
        metadata: JSON.stringify({
          groupId: testGroupId,
          timestamp: new Date().toISOString()
        })
      }
    });

    await verifyEvent(PrismaActivityEventType.GROUP_JOINED, testUserId, {
      groupId: testGroupId
    });
  });

  test('should log challenge events', async () => {
    // Create challenge instance
    const instance = await prisma.challengeInstance.create({
      data: {
        id: `test-${uuidv4()}`,
        challengeId: testChallengeId,
        userId: testUserId,
        competitionId: testGroupId,
        challengeImage: 'test-image',
        challengeUrl: 'test-url',
        status: 'creating',
        flagSecretName: 'test-secret',
        flag: 'test-flag'
      }
    });

    // Test challenge start event
    await prisma.activityLog.create({
      data: {
        eventType: PrismaActivityEventType.CHALLENGE_STARTED,
        userId: testUserId,
        severity: 'INFO',
        metadata: JSON.stringify({
          challengeId: testChallengeId,
          instanceId: instance.id,
          timestamp: new Date().toISOString()
        })
      }
    });

    await verifyEvent(PrismaActivityEventType.CHALLENGE_STARTED, testUserId, {
      challengeId: testChallengeId,
      instanceId: instance.id
    });

    // Clean up instance
    try {
    await prisma.challengeInstance.delete({
      where: { id: instance.id }
    });
    }
    catch (e) {
    }

  });

  test('should log access code events', async () => {
    // Create access code
    const accessCode = await prisma.competitionAccessCode.create({
      data: {
        code: 'TEST' + Date.now().toString().slice(-4),
        groupId: testGroupId,
        createdBy: testUserId,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      }
    });
    testAccessCodeId = accessCode.id;

    // Test access code generation event
    await prisma.activityLog.create({
      data: {
        eventType: PrismaActivityEventType.ACCESS_CODE_GENERATED,
        userId: testUserId,
        severity: 'INFO',
        metadata: JSON.stringify({
          accessCodeId: accessCode.id,
          groupId: testGroupId,
          timestamp: new Date().toISOString()
        })
      }
    });

    await verifyEvent(PrismaActivityEventType.ACCESS_CODE_GENERATED, testUserId, {
      accessCodeId: accessCode.id,
      groupId: testGroupId
    });
  });
});
