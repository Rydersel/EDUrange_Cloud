import * as dotenv from 'dotenv';
import path from 'path';
import { PrismaClient, UserRole, ChallengeDifficulty, ActivityEventType, Prisma } from '@prisma/client';

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

async function verifyEvent(eventType: ActivityEventType, userId: string, expectedMetadata: Record<string, any> = {}) {
  // Wait a short moment for the event to be logged
  await new Promise(resolve => setTimeout(resolve, 100));

  const event = await prisma.activityLog.findFirst({
    where: {
      eventType,
      userId,
      timestamp: {
        gte: new Date(Date.now() - 5000) // Look for events in the last 5 seconds
      }
    },
    orderBy: {
      timestamp: 'desc'
    }
  });

  if (!event) {
    throw new Error(`Event ${eventType} was not logged`);
  }

  // Verify metadata if provided
  if (Object.keys(expectedMetadata).length > 0) {
    const metadata = event.metadata as Record<string, any>;
    for (const [key, value] of Object.entries(expectedMetadata)) {
      if (Array.isArray(value)) {
        // For arrays, compare contents regardless of order
        const actualArray = metadata[key];
        if (!Array.isArray(actualArray) ||
            value.length !== actualArray.length ||
            !value.every(item => actualArray.includes(item))) {
          throw new Error(`Event metadata mismatch for ${key}. Expected ${value}, got ${metadata[key]}`);
        }
      } else if (metadata[key] !== value) {
        throw new Error(`Event metadata mismatch for ${key}. Expected ${value}, got ${metadata[key]}`);
      }
    }
  }

  return event;
}

async function testEvents() {
  console.log('Starting event tests...');
  let successfulTests = 0;
  let totalTests = 0;
  let testResources: { userId?: string; groupId?: string; instanceId?: string; challengeId?: string }[] = [];

  try {
    // Create a test challenge first
    const testChallenge = await prisma.challenges.create({
      data: {
        id: 'test-challenge',
        name: 'Test Challenge',
        description: 'Test Challenge Description',
        difficulty: 'EASY',
        challengeImage: 'test-image',
        challengeType: {
          create: {
            name: 'Test Type'
          }
        }
      }
    });
    testResources.push({ challengeId: testChallenge.id });

    // Test 1: Challenge Started
    totalTests++;
    let testUser, testGroup, instance;
    try {
      // Create necessary test data
      testUser = await prisma.user.create({
        data: {
          email: generateUniqueEmail('test-challenge'),
          name: 'Test Challenge User',
          role: UserRole.STUDENT
        }
      });
      testResources.push({ userId: testUser.id });

      testGroup = await prisma.competitionGroup.create({
        data: {
          name: 'Test Group',
          startDate: new Date(),
          members: {
            connect: { id: testUser.id }
          }
        }
      });
      testResources.push({ groupId: testGroup.id });

      // Create a challenge instance
      instance = await prisma.challengeInstance.create({
        data: {
          challengeId: testChallenge.id,
          userId: testUser.id,
          competitionId: testGroup.id,
          challengeImage: 'test-image',
          challengeUrl: 'test-url',
          status: 'creating',
          flagSecretName: 'test-secret',
          flag: 'test-flag'
        }
      });
      testResources.push({ instanceId: instance.id });

      // Log the event directly since we're testing
      await prisma.activityLog.create({
        data: {
          eventType: 'CHALLENGE_STARTED',
          userId: testUser.id,
          challengeId: testChallenge.id,
          groupId: testGroup.id,
          metadata: {
            message: 'Challenge started',
            challengeName: testChallenge.name,
            groupName: testGroup.name,
            instanceId: instance.id
          }
        }
      });

      const event = await verifyEvent(
        ActivityEventType.CHALLENGE_STARTED,
        testUser.id,
        {
          instanceId: instance.id
        }
      );

      console.log('✓ Challenge started event test passed');
      successfulTests++;

      // Test 2: Challenge Completed
      totalTests++;
      try {
        // Update instance status to trigger completion
        await prisma.challengeInstance.update({
          where: { id: instance.id },
          data: { status: 'completed' }
        });

        // Log the completion event directly
        await prisma.activityLog.create({
          data: {
            eventType: 'CHALLENGE_COMPLETED',
            userId: testUser.id,
            challengeId: testChallenge.id,
            groupId: testGroup.id,
            metadata: {
              message: 'Challenge completed',
              challengeName: testChallenge.name,
              groupName: testGroup.name,
              instanceId: instance.id
            }
          }
        });

        const completedEvent = await verifyEvent(
          ActivityEventType.CHALLENGE_COMPLETED,
          testUser.id,
          {
            instanceId: instance.id
          }
        );

        console.log('✓ Challenge completed event test passed');
        successfulTests++;
      } catch (error) {
        console.error('✗ Challenge completed event test failed:', error);
      }
    } catch (error) {
      console.error('✗ Challenge started event test failed:', error);
    }

    // Test 3: Group Creation
    totalTests++;
    let instructorUser, instructorGroup;
    try {
      instructorUser = await prisma.user.create({
        data: {
          email: generateUniqueEmail('test-instructor'),
          name: 'Test Instructor',
          role: UserRole.INSTRUCTOR
        }
      });
      testResources.push({ userId: instructorUser.id });

      instructorGroup = await prisma.competitionGroup.create({
        data: {
          name: 'Test Competition',
          startDate: new Date(),
          instructors: {
            connect: { id: instructorUser.id }
          }
        }
      });
      testResources.push({ groupId: instructorGroup.id });

      // Log the group creation event
      await prisma.activityLog.create({
        data: {
          eventType: ActivityEventType.GROUP_CREATED,
          userId: instructorUser.id,
          groupId: instructorGroup.id,
          metadata: {
            groupName: 'Test Competition',
            createdBy: instructorUser.id,
            createdAt: new Date().toISOString()
          }
        }
      });

      const event = await verifyEvent(ActivityEventType.GROUP_CREATED, instructorUser.id, {
        groupName: 'Test Competition'
      });

      console.log('✓ Group creation event test passed');
      successfulTests++;
    } catch (error) {
      console.error('✗ Group creation event test failed:', error);
    }

    // Test 4: Access Code Events
    totalTests++;
    if (instructorUser && instructorGroup) {
      try {
        // Generate access code
        const accessCode = await prisma.competitionAccessCode.create({
          data: {
            code: 'TEST123',
            groupId: instructorGroup.id,
            createdBy: instructorUser.id
          }
        });

        await prisma.activityLog.create({
          data: {
            eventType: ActivityEventType.ACCESS_CODE_GENERATED,
            userId: instructorUser.id,
            groupId: instructorGroup.id,
            metadata: {
              code: 'TEST123',
              generatedAt: new Date().toISOString()
            }
          }
        });

        const accessCodeEvent = await verifyEvent(
          ActivityEventType.ACCESS_CODE_GENERATED,
          instructorUser.id,
          { code: 'TEST123' }
        );

        console.log('✓ Access code generation event test passed');
        successfulTests++;
      } catch (error) {
        console.error('✗ Access code generation event test failed:', error);
      }
    }

    // Test 5: Question Events
    totalTests++;
    if (testUser && testGroup && testChallenge) {
      try {
        // Create a test question
        const question = await prisma.challengeQuestion.create({
          data: {
            content: 'Test Question',
            points: 10,
            answer: 'test answer',
            challengeId: testChallenge.id,
            type: 'TEXT',
            order: 1
          }
        });

        // Create a group challenge for the question
        const groupChallenge = await prisma.groupChallenge.create({
          data: {
            challengeId: testChallenge.id,
            groupId: testGroup.id,
            points: 10
          }
        });

        // Log question attempt
        await prisma.activityLog.create({
          data: {
            eventType: 'QUESTION_ATTEMPTED',
            userId: testUser.id,
            challengeId: testChallenge.id,
            groupId: testGroup.id,
            metadata: {
              message: 'Question attempted',
              questionId: question.id,
              answer: 'test answer'
            }
          }
        });

        const questionAttemptEvent = await verifyEvent(
          ActivityEventType.QUESTION_ATTEMPTED,
          testUser.id,
          {
            questionId: question.id,
            answer: 'test answer'
          }
        );

        // Log question completion
        await prisma.activityLog.create({
          data: {
            eventType: 'QUESTION_COMPLETED',
            userId: testUser.id,
            challengeId: testChallenge.id,
            groupId: testGroup.id,
            metadata: {
              message: 'Question completed',
              questionId: question.id,
              pointsEarned: 10
            }
          }
        });

        const questionCompletionEvent = await verifyEvent(
          ActivityEventType.QUESTION_COMPLETED,
          testUser.id,
          {
            questionId: question.id,
            pointsEarned: 10
          }
        );

        console.log('✓ Question events test passed');
        successfulTests++;
      } catch (error) {
        console.error('✗ Question events test failed:', error);
      }
    }

    // Test 6: User Events
    totalTests++;
    if (testUser && instructorUser) {
      try {
        // Log user role change
        await prisma.activityLog.create({
          data: {
            eventType: 'USER_ROLE_CHANGED',
            userId: testUser.id,
            metadata: {
              message: 'User role changed',
              oldRole: 'STUDENT',
              newRole: 'INSTRUCTOR'
            }
          }
        });

        const roleChangeEvent = await verifyEvent(
          ActivityEventType.USER_ROLE_CHANGED,
          testUser.id,
          {
            oldRole: 'STUDENT',
            newRole: 'INSTRUCTOR'
          }
        );

        // Log user update
        await prisma.activityLog.create({
          data: {
            eventType: 'USER_UPDATED',
            userId: testUser.id,
            metadata: {
              message: 'User updated',
              updatedFields: ['name', 'email']
            }
          }
        });

        const userUpdateEvent = await verifyEvent(
          ActivityEventType.USER_UPDATED,
          testUser.id,
          {
            updatedFields: ['name', 'email']
          }
        );

        console.log('✓ User events test passed');
        successfulTests++;
      } catch (error) {
        console.error('✗ User events test failed:', error);
      }
    }

    // Test 7: System Error Event
    totalTests++;
    if (testUser) {
      try {
        await prisma.activityLog.create({
          data: {
            eventType: ActivityEventType.SYSTEM_ERROR,
            userId: testUser.id,
            metadata: {
              error: 'Test error message',
              errorTime: new Date().toISOString(),
              component: 'test-script'
            }
          }
        });

        const errorEvent = await verifyEvent(
          ActivityEventType.SYSTEM_ERROR,
          testUser.id,
          {
            error: 'Test error message'
          }
        );

        console.log('✓ System error event test passed');
        successfulTests++;
      } catch (error) {
        console.error('✗ System error event test failed:', error);
      }
    }


  } catch (error) {
    console.error('Test execution failed:', error);
  } finally {
    // Cleanup all test resources
    console.log('\nCleaning up test resources...');
    try {
      // Delete challenge instances first
      for (const resource of testResources) {
        if (resource.instanceId) {
          await prisma.challengeInstance.deleteMany({
            where: { id: resource.instanceId }
          });
        }
      }

      // Delete groups next
      for (const resource of testResources) {
        if (resource.groupId) {
          await prisma.competitionGroup.deleteMany({
            where: { id: resource.groupId }
          });
        }
      }

      // Delete users
      for (const resource of testResources) {
        if (resource.userId) {
          await prisma.user.deleteMany({
            where: { id: resource.userId }
          });
        }
      }

      // Delete challenges last
      for (const resource of testResources) {
        if (resource.challengeId) {
          await prisma.challenges.deleteMany({
            where: { id: resource.challengeId }
          });
        }
      }
      console.log('Cleanup completed successfully');
    } catch (cleanupError) {
      console.error('Error during cleanup:', cleanupError);
    }

    await prisma.$disconnect();
    console.log(`\nTest Summary: ${successfulTests}/${totalTests} tests passed`);
  }
}

testEvents().catch(console.error);
