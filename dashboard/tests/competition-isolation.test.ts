import * as dotenv from 'dotenv';
import path from 'path';
import { PrismaClient, UserRole } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';

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

// Helper function to generate unique name
function generateUniqueName(prefix: string): string {
  return `${prefix}-${Date.now()}`;
}

describe('Competition Isolation', () => {
  let testInstructor1Id: string;
  let testInstructor2Id: string;
  let testStudent1Id: string;
  let testStudent2Id: string;
  let competition1Id: string;
  let competition2Id: string;
  let challenge1Id: string;
  let challenge2Id: string;
  let challengeTypeId: string;

  beforeAll(async () => {
    // Create test challenge type
    const challengeType = await prisma.challengeType.create({
      data: {
        id: `test-${uuidv4()}`,
        name: generateUniqueName('Test Challenge Type')
      }
    });
    challengeTypeId = challengeType.id;

    // Create test users
    const instructor1 = await prisma.user.create({
      data: {
        id: `test-${uuidv4()}`,
        email: generateUniqueEmail('test-instructor1'),
        name: generateUniqueName('Test Instructor 1'),
        role: UserRole.INSTRUCTOR
      }
    });
    testInstructor1Id = instructor1.id;

    const instructor2 = await prisma.user.create({
      data: {
        id: `test-${uuidv4()}`,
        email: generateUniqueEmail('test-instructor2'),
        name: generateUniqueName('Test Instructor 2'),
        role: UserRole.INSTRUCTOR
      }
    });
    testInstructor2Id = instructor2.id;

    const student1 = await prisma.user.create({
      data: {
        id: `test-${uuidv4()}`,
        email: generateUniqueEmail('test-student1'),
        name: generateUniqueName('Test Student 1'),
        role: UserRole.STUDENT
      }
    });
    testStudent1Id = student1.id;

    const student2 = await prisma.user.create({
      data: {
        id: `test-${uuidv4()}`,
        email: generateUniqueEmail('test-student2'),
        name: generateUniqueName('Test Student 2'),
        role: UserRole.STUDENT
      }
    });
    testStudent2Id = student2.id;

    // Create test competitions
    const competition1 = await prisma.competitionGroup.create({
      data: {
        id: `test-${uuidv4()}`,
        name: generateUniqueName('Test Competition 1'),
        description: 'Test Description 1',
        startDate: new Date(),
        instructors: {
          connect: [{ id: testInstructor1Id }]
        },
        members: {
          connect: [{ id: testStudent1Id }]
        }
      }
    });
    competition1Id = competition1.id;

    const competition2 = await prisma.competitionGroup.create({
      data: {
        id: `test-${uuidv4()}`,
        name: generateUniqueName('Test Competition 2'),
        description: 'Test Description 2',
        startDate: new Date(),
        instructors: {
          connect: [{ id: testInstructor2Id }]
        },
        members: {
          connect: [{ id: testStudent2Id }]
        }
      }
    });
    competition2Id = competition2.id;

    // Create test challenges
    const challenge1 = await prisma.challenges.create({
      data: {
        id: `test-${uuidv4()}`,
        name: generateUniqueName('Test Challenge 1'),
        description: 'Test Description 1',
        difficulty: 'EASY',
        challengeImage: 'test-image-1.png',
        challengeType: {
          connect: { id: challengeTypeId }
        }
      }
    });
    challenge1Id = challenge1.id;

    const challenge2 = await prisma.challenges.create({
      data: {
        id: `test-${uuidv4()}`,
        name: generateUniqueName('Test Challenge 2'),
        description: 'Test Description 2',
        difficulty: 'MEDIUM',
        challengeImage: 'test-image-2.png',
        challengeType: {
          connect: { id: challengeTypeId }
        }
      }
    });
    challenge2Id = challenge2.id;
  });

  afterAll(async () => {
    // Clean up test data in correct order
    await prisma.groupPoints.deleteMany({
      where: {
        OR: [
          { groupId: competition1Id },
          { groupId: competition2Id }
        ]
      }
    });

    await prisma.questionCompletion.deleteMany({
      where: {
        userId: {
          in: [testStudent1Id, testStudent2Id]
        }
      }
    });

    await prisma.challengeInstance.deleteMany({
      where: {
        OR: [
          { competitionId: competition1Id },
          { competitionId: competition2Id }
        ]
      }
    });

    await prisma.groupChallenge.deleteMany({
      where: {
        OR: [
          { groupId: competition1Id },
          { groupId: competition2Id }
        ]
      }
    });

    await prisma.challengeQuestion.deleteMany({
      where: {
        challengeId: {
          in: [challenge1Id, challenge2Id]
        }
      }
    });

    await prisma.challenges.deleteMany({
      where: {
        id: {
          in: [challenge1Id, challenge2Id]
        }
      }
    });

    await prisma.challengeType.delete({
      where: { id: challengeTypeId }
    });

    await prisma.competitionGroup.deleteMany({
      where: {
        id: {
          in: [competition1Id, competition2Id]
        }
      }
    });

    await prisma.user.deleteMany({
      where: {
        id: {
          in: [testInstructor1Id, testInstructor2Id, testStudent1Id, testStudent2Id]
        }
      }
    });

    await prisma.$disconnect();
  });

  describe('Points Isolation', () => {
    test('should maintain points isolation between competitions', async () => {
      // Create dedicated challenges for this test
      const isolationChallenge1 = await prisma.challenges.create({
        data: {
          id: `test-isolation-${uuidv4()}`,
          name: generateUniqueName('Isolation Test Challenge 1'),
          description: 'Test Description for Isolation 1',
          difficulty: 'EASY',
          challengeImage: 'test-image-isolation-1.png',
          challengeType: {
            connect: { id: challengeTypeId }
          }
        }
      });
      
      const isolationChallenge2 = await prisma.challenges.create({
        data: {
          id: `test-isolation-${uuidv4()}`,
          name: generateUniqueName('Isolation Test Challenge 2'),
          description: 'Test Description for Isolation 2',
          difficulty: 'MEDIUM',
          challengeImage: 'test-image-isolation-2.png',
          challengeType: {
            connect: { id: challengeTypeId }
          }
        }
      });
      
      // Add challenges to competitions with different point values
      await prisma.groupChallenge.create({
        data: {
          points: 100,
          groupId: competition1Id,
          challengeId: isolationChallenge1.id
        }
      });

      await prisma.groupChallenge.create({
        data: {
          points: 200,
          groupId: competition2Id,
          challengeId: isolationChallenge1.id
        }
      });

      // Add points for student1 in competition1
      await prisma.groupPoints.create({
        data: {
          userId: testStudent1Id,
          groupId: competition1Id,
          points: 100
        }
      });

      // Add points for student2 in competition2
      await prisma.groupPoints.create({
        data: {
          userId: testStudent2Id,
          groupId: competition2Id,
          points: 200
        }
      });

      // Verify points isolation
      const student1Points = await prisma.groupPoints.findUnique({
        where: {
          userId_groupId: {
            userId: testStudent1Id,
            groupId: competition1Id
          }
        }
      });

      const student2Points = await prisma.groupPoints.findUnique({
        where: {
          userId_groupId: {
            userId: testStudent2Id,
            groupId: competition2Id
          }
        }
      });

      expect(student1Points).not.toBeNull();
      expect(student2Points).not.toBeNull();
      expect(student1Points?.points).toBe(100);
      expect(student2Points?.points).toBe(200);

      // Clean up
      await prisma.groupPoints.deleteMany({
        where: {
          OR: [
            { userId: testStudent1Id, groupId: competition1Id },
            { userId: testStudent2Id, groupId: competition2Id }
          ]
        }
      });
      
      await prisma.groupChallenge.deleteMany({
        where: {
          challengeId: {
            in: [isolationChallenge1.id, isolationChallenge2.id]
          }
        }
      });
      
      await prisma.challenges.deleteMany({
        where: {
          id: {
            in: [isolationChallenge1.id, isolationChallenge2.id]
          }
        }
      });
    });
  });

  describe('Challenge Instance Isolation', () => {
    test('should maintain challenge instance isolation between competitions', async () => {
      // Create challenge instance for student1 in competition1
      const instance1 = await prisma.challengeInstance.create({
        data: {
          id: `test-${uuidv4()}`,
          status: 'RUNNING',
          userId: testStudent1Id,
          competitionId: competition1Id,
          challengeId: challenge1Id,
          challengeImage: 'test-image.png',
          challengeUrl: 'test-url-1',
          flagSecretName: 'test-secret-1',
          flag: 'test-flag-1'
        }
      });

      // Verify instance1 exists
      const foundInstance1 = await prisma.challengeInstance.findUnique({
        where: { id: instance1.id }
      });
      expect(foundInstance1).not.toBeNull();
      expect(foundInstance1?.competitionId).toBe(competition1Id);

      // Verify no instance exists for student1 in competition2
      const instance2 = await prisma.challengeInstance.findFirst({
        where: {
          userId: testStudent1Id,
          competitionId: competition2Id
        }
      });
      expect(instance2).toBeNull();
    });
  });

  describe('Question Completion Isolation', () => {
    let testQuestionId: string;
    let groupChallenge1Id: string;
    let groupChallenge2Id: string;

    beforeAll(async () => {
      // Create a challenge question
      const question = await prisma.challengeQuestion.create({
        data: {
          id: `test-${uuidv4()}`,
          challengeId: challenge1Id,
          content: 'Test Question',
          type: 'TEXT',
          answer: 'Test Answer',
          points: 10,
          order: 1
        }
      });
      testQuestionId = question.id;

      // Create group challenges for both competitions
      const groupChallenge1 = await prisma.groupChallenge.upsert({
        where: {
          challengeId_groupId: {
            challengeId: challenge1Id,
            groupId: competition1Id
          }
        },
        create: {
          points: 100,
          groupId: competition1Id,
          challengeId: challenge1Id
        },
        update: {}
      });
      groupChallenge1Id = groupChallenge1.id;

      const groupChallenge2 = await prisma.groupChallenge.upsert({
        where: {
          challengeId_groupId: {
            challengeId: challenge1Id,
            groupId: competition2Id
          }
        },
        create: {
          points: 200,
          groupId: competition2Id,
          challengeId: challenge1Id
        },
        update: {}
      });
      groupChallenge2Id = groupChallenge2.id;
    });

    afterAll(async () => {
      // Clean up question completions
      await prisma.questionCompletion.deleteMany({
        where: {
          groupChallengeId: {
            in: [groupChallenge1Id, groupChallenge2Id]
          }
        }
      });

      // Clean up the question
      await prisma.challengeQuestion.delete({
        where: { id: testQuestionId }
      });
    });

    test('should maintain question completion isolation between competitions', async () => {
      // Create question completion for student1 in competition1
      const completion = await prisma.questionCompletion.create({
        data: {
          userId: testStudent1Id,
          groupChallengeId: groupChallenge1Id,
          questionId: testQuestionId,
          pointsEarned: 10,
          completedAt: new Date()
        }
      });

      // Verify question completion exists for student1 in competition1
      const completion1 = await prisma.questionCompletion.findFirst({
        where: {
          userId: testStudent1Id,
          groupChallengeId: groupChallenge1Id
        }
      });
      expect(completion1).not.toBeNull();
      expect(completion1?.questionId).toBe(testQuestionId);
      expect(completion1?.pointsEarned).toBe(10);

      // Verify no question completion exists for student1 in competition2
      const completion2 = await prisma.questionCompletion.findFirst({
        where: {
          userId: testStudent1Id,
          groupChallengeId: groupChallenge2Id
        }
      });
      expect(completion2).toBeNull();
    });
  });
});
