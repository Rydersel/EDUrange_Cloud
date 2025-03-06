import * as dotenv from 'dotenv';
import path from 'path';
import { UserRole, ActivityEventType as PrismaActivityEventType } from '@prisma/client';
import { withTestTransaction, generateTestId, generateTestEmail } from './test-helpers';
import prisma from './prisma-test-client';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Helper function to verify event logging
async function verifyEvent(tx: any, eventType: PrismaActivityEventType, userId: string, expectedMetadata: Record<string, any> = {}) {
  const event = await tx.activityLog.findFirst({
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
  test('should log user events', async () => {
    await withTestTransaction(async (tx) => {
      // Create test user
      const user = await tx.user.create({
        data: {
          id: generateTestId('user'),
          email: generateTestEmail('user'),
          name: 'Test User',
          role: UserRole.STUDENT
        }
      });

      // Test user registration event
      await tx.activityLog.create({
        data: {
          eventType: PrismaActivityEventType.USER_REGISTERED,
          userId: user.id,
          severity: 'INFO',
          metadata: JSON.stringify({
            email: 'test@test.edurange.org',
            timestamp: new Date().toISOString()
          })
        }
      });

      await verifyEvent(tx, PrismaActivityEventType.USER_REGISTERED, user.id, {
        email: 'test@test.edurange.org'
      });

      // Test user login event
      await tx.activityLog.create({
        data: {
          eventType: PrismaActivityEventType.USER_LOGGED_IN,
          userId: user.id,
          severity: 'INFO',
          metadata: JSON.stringify({
            timestamp: new Date().toISOString()
          })
        }
      });

      await verifyEvent(tx, PrismaActivityEventType.USER_LOGGED_IN, user.id);
    });
  });

  test('should log group events', async () => {
    await withTestTransaction(async (tx) => {
      // Create test user
      const user = await tx.user.create({
        data: {
          id: generateTestId('user'),
          email: generateTestEmail('user'),
          name: 'Test User',
          role: UserRole.STUDENT
        }
      });

      // Create test competition group
      const group = await tx.competitionGroup.create({
        data: {
          id: generateTestId('group'),
          name: 'Test Competition',
          description: 'Test Description',
          startDate: new Date(),
          members: {
            connect: [{ id: user.id }]
          }
        }
      });

      // Test group creation event
      await tx.activityLog.create({
        data: {
          eventType: PrismaActivityEventType.GROUP_CREATED,
          userId: user.id,
          severity: 'INFO',
          metadata: JSON.stringify({
            groupId: group.id,
            timestamp: new Date().toISOString()
          })
        }
      });

      await verifyEvent(tx, PrismaActivityEventType.GROUP_CREATED, user.id, {
        groupId: group.id
      });

      // Test group join event
      await tx.activityLog.create({
        data: {
          eventType: PrismaActivityEventType.GROUP_JOINED,
          userId: user.id,
          severity: 'INFO',
          metadata: JSON.stringify({
            groupId: group.id,
            timestamp: new Date().toISOString()
          })
        }
      });

      await verifyEvent(tx, PrismaActivityEventType.GROUP_JOINED, user.id, {
        groupId: group.id
      });
    });
  });

  test('should log challenge events', async () => {
    await withTestTransaction(async (tx) => {
      // Create test user
      const user = await tx.user.create({
        data: {
          id: generateTestId('user'),
          email: generateTestEmail('user'),
          name: 'Test User',
          role: UserRole.STUDENT
        }
      });

      // Create test challenge type
      const challengeType = await tx.challengeType.create({
        data: {
          id: generateTestId('challenge-type'),
          name: 'Test Challenge Type'
        }
      });

      // Create test challenge
      const challenge = await tx.challenges.create({
        data: {
          id: generateTestId('challenge'),
          name: 'Test Challenge',
          description: 'Test Description',
          difficulty: 'EASY',
          challengeImage: 'test-image',
          challengeTypeId: challengeType.id
        }
      });

      // Create test competition group
      const group = await tx.competitionGroup.create({
        data: {
          id: generateTestId('group'),
          name: 'Test Competition',
          description: 'Test Description',
          startDate: new Date(),
          members: {
            connect: [{ id: user.id }]
          }
        }
      });

      // Create a dedicated challenge instance for this test
      const dedicatedChallengeInstance = await tx.challengeInstance.create({
        data: {
          id: generateTestId('challenge-instance'),
          challengeId: challenge.id,
          userId: user.id,
          competitionId: group.id,
          challengeImage: 'test-image',
          challengeUrl: 'test-url',
          status: 'creating',
          flagSecretName: 'test-secret',
          flag: 'test-flag'
        }
      });

      // Test challenge start event
      await tx.activityLog.create({
        data: {
          eventType: PrismaActivityEventType.CHALLENGE_STARTED,
          userId: user.id,
          severity: 'INFO',
          metadata: JSON.stringify({
            challengeId: challenge.id,
            instanceId: dedicatedChallengeInstance.id,
            timestamp: new Date().toISOString()
          })
        }
      });

      await verifyEvent(tx, PrismaActivityEventType.CHALLENGE_STARTED, user.id, {
        challengeId: challenge.id,
        instanceId: dedicatedChallengeInstance.id
      });

      // Test challenge completion event
      await tx.activityLog.create({
        data: {
          eventType: PrismaActivityEventType.CHALLENGE_COMPLETED,
          userId: user.id,
          severity: 'INFO',
          metadata: JSON.stringify({
            challengeId: challenge.id,
            instanceId: dedicatedChallengeInstance.id,
            timestamp: new Date().toISOString()
          })
        }
      });

      await verifyEvent(tx, PrismaActivityEventType.CHALLENGE_COMPLETED, user.id, {
        challengeId: challenge.id,
        instanceId: dedicatedChallengeInstance.id
      });
    });
  });

  test('should log flag submission events', async () => {
    await withTestTransaction(async (tx) => {
      // Create test user
      const user = await tx.user.create({
        data: {
          id: generateTestId('user'),
          email: generateTestEmail('user'),
          name: 'Test User',
          role: UserRole.STUDENT
        }
      });

      // Create test challenge type
      const challengeType = await tx.challengeType.create({
        data: {
          id: generateTestId('challenge-type'),
          name: 'Test Challenge Type'
        }
      });

      // Create test challenge
      const challenge = await tx.challenges.create({
        data: {
          id: generateTestId('challenge'),
          name: 'Test Challenge',
          description: 'Test Description',
          difficulty: 'EASY',
          challengeImage: 'test-image',
          challengeTypeId: challengeType.id
        }
      });

      // Create test competition group
      const group = await tx.competitionGroup.create({
        data: {
          id: generateTestId('group'),
          name: 'Test Competition',
          description: 'Test Description',
          startDate: new Date(),
          members: {
            connect: [{ id: user.id }]
          }
        }
      });

      // Create a dedicated challenge instance for this test
      const dedicatedChallengeInstance = await tx.challengeInstance.create({
        data: {
          id: generateTestId('challenge-instance'),
          challengeId: challenge.id,
          userId: user.id,
          competitionId: group.id,
          challengeImage: 'test-image',
          challengeUrl: 'test-url',
          status: 'RUNNING',
          flagSecretName: 'test-secret',
          flag: 'test-flag'
        }
      });
      
      // Test flag submission event
      await tx.activityLog.create({
        data: {
          eventType: PrismaActivityEventType.QUESTION_ATTEMPTED,
          userId: user.id,
          severity: 'INFO',
          metadata: JSON.stringify({
            challengeId: challenge.id,
            instanceId: dedicatedChallengeInstance.id,
            correct: true,
            timestamp: new Date().toISOString()
          })
        }
      });

      await verifyEvent(tx, PrismaActivityEventType.QUESTION_ATTEMPTED, user.id, {
        challengeId: challenge.id,
        instanceId: dedicatedChallengeInstance.id,
        correct: true
      });
    });
  });

  test('should log access code events', async () => {
    await withTestTransaction(async (tx) => {
      // Create test user
      const user = await tx.user.create({
        data: {
          id: generateTestId('user'),
          email: generateTestEmail('user'),
          name: 'Test User',
          role: UserRole.STUDENT
        }
      });

      // Create test competition group
      const group = await tx.competitionGroup.create({
        data: {
          id: generateTestId('group'),
          name: 'Test Competition',
          description: 'Test Description',
          startDate: new Date(),
          members: {
            connect: [{ id: user.id }]
          }
        }
      });

      // Create a dedicated access code for this test
      const dedicatedAccessCode = await tx.competitionAccessCode.create({
        data: {
          code: 'TEST' + Date.now().toString().slice(-4),
          groupId: group.id,
          createdBy: user.id,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
        }
      });
      
      // Test access code creation event
      await tx.activityLog.create({
        data: {
          eventType: PrismaActivityEventType.ACCESS_CODE_GENERATED,
          userId: user.id,
          severity: 'INFO',
          metadata: JSON.stringify({
            groupId: group.id,
            code: dedicatedAccessCode.code,
            timestamp: new Date().toISOString()
          })
        }
      });

      await verifyEvent(tx, PrismaActivityEventType.ACCESS_CODE_GENERATED, user.id, {
        groupId: group.id,
        code: dedicatedAccessCode.code
      });

      // Test access code used event
      await tx.activityLog.create({
        data: {
          eventType: PrismaActivityEventType.GROUP_JOINED,
          userId: user.id,
          severity: 'INFO',
          metadata: JSON.stringify({
            groupId: group.id,
            code: dedicatedAccessCode.code,
            timestamp: new Date().toISOString()
          })
        }
      });

      await verifyEvent(tx, PrismaActivityEventType.GROUP_JOINED, user.id, {
        groupId: group.id,
        code: dedicatedAccessCode.code
      });
    });
  });
});
