import * as dotenv from 'dotenv';
import path from 'path';
import { UserRole } from '@prisma/client';
import { describe, test, expect } from '@jest/globals';
import { withTestTransaction, generateTestId, generateTestEmail, generateTestName } from '../utils/test-helpers';
import prisma from '../utils/prisma-test-client';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../.env') });

describe('Competition Isolation', () => {
  describe('Points Isolation', () => {
    test('should maintain points isolation between competitions', async () => {
      await withTestTransaction(async (tx) => {
        // Create test challenge type
        const challengeType = await tx.challengeType.create({
          data: {
            id: generateTestId('challenge-type'),
            name: generateTestName('Challenge Type')
          }
        });

        // Create test users
        const instructor1 = await tx.user.create({
          data: {
            id: generateTestId('instructor1'),
            email: generateTestEmail('instructor1'),
            name: generateTestName('Instructor 1'),
            role: UserRole.INSTRUCTOR
          }
        });

        const instructor2 = await tx.user.create({
          data: {
            id: generateTestId('instructor2'),
            email: generateTestEmail('instructor2'),
            name: generateTestName('Instructor 2'),
            role: UserRole.INSTRUCTOR
          }
        });

        const student1 = await tx.user.create({
          data: {
            id: generateTestId('student1'),
            email: generateTestEmail('student1'),
            name: generateTestName('Student 1'),
            role: UserRole.STUDENT
          }
        });

        const student2 = await tx.user.create({
          data: {
            id: generateTestId('student2'),
            email: generateTestEmail('student2'),
            name: generateTestName('Student 2'),
            role: UserRole.STUDENT
          }
        });

        // Create test competitions
        const competition1 = await tx.competitionGroup.create({
          data: {
            id: generateTestId('competition1'),
            name: generateTestName('Competition 1'),
            description: 'Test Description 1',
            startDate: new Date(),
            instructors: {
              connect: [{ id: instructor1.id }]
            },
            members: {
              connect: [{ id: student1.id }]
            }
          }
        });

        const competition2 = await tx.competitionGroup.create({
          data: {
            id: generateTestId('competition2'),
            name: generateTestName('Competition 2'),
            description: 'Test Description 2',
            startDate: new Date(),
            instructors: {
              connect: [{ id: instructor2.id }]
            },
            members: {
              connect: [{ id: student2.id }]
            }
          }
        });

        // Create dedicated challenges for this test
        const isolationChallenge1 = await tx.challenges.create({
          data: {
            id: generateTestId('isolation-challenge1'),
            name: generateTestName('Isolation Challenge 1'),
            description: 'Test Description for Isolation 1',
            difficulty: 'EASY',
            challengeImage: 'test-image-isolation-1.png',
            challengeType: {
              connect: { id: challengeType.id }
            }
          }
        });

        const isolationChallenge2 = await tx.challenges.create({
          data: {
            id: generateTestId('isolation-challenge2'),
            name: generateTestName('Isolation Challenge 2'),
            description: 'Test Description for Isolation 2',
            difficulty: 'MEDIUM',
            challengeImage: 'test-image-isolation-2.png',
            challengeType: {
              connect: { id: challengeType.id }
            }
          }
        });

        // Add challenges to competitions with different point values
        await tx.groupChallenge.create({
          data: {
            points: 100,
            groupId: competition1.id,
            challengeId: isolationChallenge1.id
          }
        });

        await tx.groupChallenge.create({
          data: {
            points: 200,
            groupId: competition2.id,
            challengeId: isolationChallenge1.id
          }
        });

        // Add points for student1 in competition1
        await tx.groupPoints.create({
          data: {
            userId: student1.id,
            groupId: competition1.id,
            points: 100
          }
        });

        // Add points for student2 in competition2
        await tx.groupPoints.create({
          data: {
            userId: student2.id,
            groupId: competition2.id,
            points: 200
          }
        });

        // Verify points isolation
        const student1Points = await tx.groupPoints.findUnique({
          where: {
            userId_groupId: {
              userId: student1.id,
              groupId: competition1.id
            }
          }
        });

        const student2Points = await tx.groupPoints.findUnique({
          where: {
            userId_groupId: {
              userId: student2.id,
              groupId: competition2.id
            }
          }
        });

        expect(student1Points).not.toBeNull();
        expect(student2Points).not.toBeNull();
        expect(student1Points?.points).toBe(100);
        expect(student2Points?.points).toBe(200);
      });
    });
  });

  describe('Challenge Instance Isolation', () => {
    test('should maintain challenge instance isolation between competitions', async () => {
      await withTestTransaction(async (tx) => {
        // Create test challenge type
        const challengeType = await tx.challengeType.create({
          data: {
            id: generateTestId('challenge-type'),
            name: generateTestName('Challenge Type')
          }
        });

        // Create test users
        const instructor1 = await tx.user.create({
          data: {
            id: generateTestId('instructor1'),
            email: generateTestEmail('instructor1'),
            name: generateTestName('Instructor 1'),
            role: UserRole.INSTRUCTOR
          }
        });

        const instructor2 = await tx.user.create({
          data: {
            id: generateTestId('instructor2'),
            email: generateTestEmail('instructor2'),
            name: generateTestName('Instructor 2'),
            role: UserRole.INSTRUCTOR
          }
        });

        const student1 = await tx.user.create({
          data: {
            id: generateTestId('student1'),
            email: generateTestEmail('student1'),
            name: generateTestName('Student 1'),
            role: UserRole.STUDENT
          }
        });

        // Create test competitions
        const competition1 = await tx.competitionGroup.create({
          data: {
            id: generateTestId('competition1'),
            name: generateTestName('Competition 1'),
            description: 'Test Description 1',
            startDate: new Date(),
            instructors: {
              connect: [{ id: instructor1.id }]
            },
            members: {
              connect: [{ id: student1.id }]
            }
          }
        });

        const competition2 = await tx.competitionGroup.create({
          data: {
            id: generateTestId('competition2'),
            name: generateTestName('Competition 2'),
            description: 'Test Description 2',
            startDate: new Date(),
            instructors: {
              connect: [{ id: instructor2.id }]
            }
          }
        });

        // Create test challenges
        const challenge1 = await tx.challenges.create({
          data: {
            id: generateTestId('challenge1'),
            name: generateTestName('Challenge 1'),
            description: 'Test Description 1',
            difficulty: 'EASY',
            challengeImage: 'test-image-1.png',
            challengeType: {
              connect: { id: challengeType.id }
            }
          }
        });

        // Create challenge instance for student1 in competition1
        const instance1 = await tx.challengeInstance.create({
          data: {
            id: generateTestId('instance1'),
            status: 'RUNNING',
            userId: student1.id,
            competitionId: competition1.id,
            challengeId: challenge1.id,
            challengeImage: 'test-image.png',
            challengeUrl: 'test-url-1',
            flagSecretName: 'test-secret-1',
            flag: 'test-flag-1'
          }
        });

        // Verify instance1 exists
        const foundInstance1 = await tx.challengeInstance.findUnique({
          where: { id: instance1.id }
        });
        expect(foundInstance1).not.toBeNull();
        expect(foundInstance1?.competitionId).toBe(competition1.id);

        // Verify no instance exists for student1 in competition2
        const instance2 = await tx.challengeInstance.findFirst({
          where: {
            userId: student1.id,
            competitionId: competition2.id
          }
        });
        expect(instance2).toBeNull();
      });
    });
  });

  describe('Question Completion Isolation', () => {
    test('should maintain question completion isolation between competitions', async () => {
      await withTestTransaction(async (tx) => {
        // Create test challenge type
        const challengeType = await tx.challengeType.create({
          data: {
            id: generateTestId('challenge-type'),
            name: generateTestName('Challenge Type')
          }
        });

        // Create test users
        const instructor1 = await tx.user.create({
          data: {
            id: generateTestId('instructor1'),
            email: generateTestEmail('instructor1'),
            name: generateTestName('Instructor 1'),
            role: UserRole.INSTRUCTOR
          }
        });

        const instructor2 = await tx.user.create({
          data: {
            id: generateTestId('instructor2'),
            email: generateTestEmail('instructor2'),
            name: generateTestName('Instructor 2'),
            role: UserRole.INSTRUCTOR
          }
        });

        const student1 = await tx.user.create({
          data: {
            id: generateTestId('student1'),
            email: generateTestEmail('student1'),
            name: generateTestName('Student 1'),
            role: UserRole.STUDENT
          }
        });

        // Create test competitions
        const competition1 = await tx.competitionGroup.create({
          data: {
            id: generateTestId('competition1'),
            name: generateTestName('Competition 1'),
            description: 'Test Description 1',
            startDate: new Date(),
            instructors: {
              connect: [{ id: instructor1.id }]
            },
            members: {
              connect: [{ id: student1.id }]
            }
          }
        });

        const competition2 = await tx.competitionGroup.create({
          data: {
            id: generateTestId('competition2'),
            name: generateTestName('Competition 2'),
            description: 'Test Description 2',
            startDate: new Date(),
            instructors: {
              connect: [{ id: instructor2.id }]
            }
          }
        });

        // Create test challenge
        const challenge1 = await tx.challenges.create({
          data: {
            id: generateTestId('challenge1'),
            name: generateTestName('Challenge 1'),
            description: 'Test Description 1',
            difficulty: 'EASY',
            challengeImage: 'test-image-1.png',
            challengeType: {
              connect: { id: challengeType.id }
            }
          }
        });

        // Create a challenge question
        const question = await tx.challengeQuestion.create({
          data: {
            id: generateTestId('question'),
            challengeId: challenge1.id,
            content: 'Test Question',
            type: 'TEXT',
            answer: 'Test Answer',
            points: 10,
            order: 1
          }
        });

        // Create group challenges for both competitions
        const groupChallenge1 = await tx.groupChallenge.create({
          data: {
            points: 100,
            groupId: competition1.id,
            challengeId: challenge1.id
          }
        });

        const groupChallenge2 = await tx.groupChallenge.create({
          data: {
            points: 200,
            groupId: competition2.id,
            challengeId: challenge1.id
          }
        });

        // Create question completion for student1 in competition1
        await tx.questionCompletion.create({
          data: {
            userId: student1.id,
            groupChallengeId: groupChallenge1.id,
            questionId: question.id,
            pointsEarned: 10,
            completedAt: new Date()
          }
        });

        // Verify question completion exists for student1 in competition1
        const completion1 = await tx.questionCompletion.findFirst({
          where: {
            userId: student1.id,
            groupChallengeId: groupChallenge1.id
          }
        });
        expect(completion1).not.toBeNull();
        expect(completion1?.questionId).toBe(question.id);
        expect(completion1?.pointsEarned).toBe(10);

        // Verify no question completion exists for student1 in competition2
        const completion2 = await tx.questionCompletion.findFirst({
          where: {
            userId: student1.id,
            groupChallengeId: groupChallenge2.id
          }
        });
        expect(completion2).toBeNull();
      });
    });
  });
});
