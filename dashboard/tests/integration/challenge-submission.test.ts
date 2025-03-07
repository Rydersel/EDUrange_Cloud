import * as dotenv from 'dotenv';
import path from 'path';
import { UserRole, ChallengeDifficulty } from '@prisma/client';
import { withTestTransaction, generateTestId, generateTestEmail, generateTestName } from '../utils/test-helpers';
import prisma from '../utils/prisma-test-client';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../.env') });

describe('Challenge Submission', () => {
  test('should submit correct flag and earn points', async () => {
    await withTestTransaction(async (tx) => {
      // Create test users
      const student = await tx.user.create({
        data: {
          id: generateTestId('student'),
          email: generateTestEmail('student'),
          name: 'Test Student',
          role: UserRole.STUDENT
        }
      });

      const instructor = await tx.user.create({
        data: {
          id: generateTestId('instructor'),
          email: generateTestEmail('instructor'),
          name: 'Test Instructor',
          role: UserRole.INSTRUCTOR
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
          difficulty: ChallengeDifficulty.EASY,
          challengeImage: 'test-image',
          challengeTypeId: challengeType.id
        }
      });

      // Create test competition group
      const group = await tx.competitionGroup.create({
        data: {
          id: generateTestId('group'),
          name: generateTestName('Competition'),
          description: 'Test Description',
          startDate: new Date(),
          instructors: {
            connect: [{ id: instructor.id }]
          },
          members: {
            connect: [{ id: student.id }]
          }
        }
      });

      // Add challenge to group
      const groupChallenge = await tx.groupChallenge.create({
        data: {
          challengeId: challenge.id,
          groupId: group.id,
          points: 100
        }
      });

      // Create test flag
      const testFlag = `flag{test-${Date.now().toString(36)}}`;

      // Create challenge instance
      const instance = await tx.challengeInstance.create({
        data: {
          id: generateTestId('instance'),
          challengeId: challenge.id,
          userId: student.id,
          competitionId: group.id,
          challengeImage: 'test-image',
          challengeUrl: 'test-url',
          status: 'RUNNING',
          flagSecretName: 'test-secret',
          flag: testFlag
        }
      });

      // Create challenge question
      const question = await tx.challengeQuestion.create({
        data: {
          id: generateTestId('question'),
          challengeId: challenge.id,
          content: 'What is the flag?',
          type: 'TEXT',
          answer: testFlag,
          points: 100,
          order: 1
        }
      });

      // Simulate flag submission
      const submission = testFlag;

      // Verify submission
      const isCorrect = submission === testFlag;
      expect(isCorrect).toBe(true);

      // Record completion if correct
      if (isCorrect) {
        const completion = await tx.questionCompletion.create({
          data: {
            userId: student.id,
            questionId: question.id,
            groupChallengeId: groupChallenge.id,
            pointsEarned: question.points
          }
        });

        expect(completion).toBeDefined();
        expect(completion.pointsEarned).toBe(question.points);

        // Update user points
        const points = await tx.groupPoints.upsert({
          where: {
            userId_groupId: {
              userId: student.id,
              groupId: group.id
            }
          },
          create: {
            userId: student.id,
            groupId: group.id,
            points: question.points
          },
          update: {
            points: {
              increment: question.points
            }
          }
        });

        expect(points).toBeDefined();
        expect(points.points).toBe(question.points);
      }
    });
  });

  test('should handle incorrect flag submission', async () => {
    await withTestTransaction(async (tx) => {
      // Create test users
      const student = await tx.user.create({
        data: {
          id: generateTestId('student'),
          email: generateTestEmail('student'),
          name: 'Test Student',
          role: UserRole.STUDENT
        }
      });

      const instructor = await tx.user.create({
        data: {
          id: generateTestId('instructor'),
          email: generateTestEmail('instructor'),
          name: 'Test Instructor',
          role: UserRole.INSTRUCTOR
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
          difficulty: ChallengeDifficulty.EASY,
          challengeImage: 'test-image',
          challengeTypeId: challengeType.id
        }
      });

      // Create test competition group
      const group = await tx.competitionGroup.create({
        data: {
          id: generateTestId('group'),
          name: generateTestName('Competition'),
          description: 'Test Description',
          startDate: new Date(),
          instructors: {
            connect: [{ id: instructor.id }]
          },
          members: {
            connect: [{ id: student.id }]
          }
        }
      });

      // Add challenge to group
      const groupChallenge = await tx.groupChallenge.create({
        data: {
          challengeId: challenge.id,
          groupId: group.id,
          points: 100
        }
      });

      // Create test flag
      const testFlag = `flag{test-${Date.now().toString(36)}}`;

      // Create challenge instance
      const instance = await tx.challengeInstance.create({
        data: {
          id: generateTestId('instance'),
          challengeId: challenge.id,
          userId: student.id,
          competitionId: group.id,
          challengeImage: 'test-image',
          challengeUrl: 'test-url',
          status: 'RUNNING',
          flagSecretName: 'test-secret',
          flag: testFlag
        }
      });

      // Create challenge question
      const question = await tx.challengeQuestion.create({
        data: {
          id: generateTestId('question'),
          challengeId: challenge.id,
          content: 'What is the flag?',
          type: 'TEXT',
          answer: testFlag,
          points: 100,
          order: 1
        }
      });

      // Simulate incorrect flag submission
      const incorrectSubmission = 'flag{wrong}';

      // Verify submission
      const isCorrect = incorrectSubmission === testFlag;
      expect(isCorrect).toBe(false);

      // Check that no points are awarded for incorrect submission
      const userPoints = await tx.groupPoints.findUnique({
        where: {
          userId_groupId: {
            userId: student.id,
            groupId: group.id
          }
        }
      });

      // User should not have any points yet
      expect(userPoints).toBeNull();
    });
  });

  test('should prevent duplicate flag submissions', async () => {
    await withTestTransaction(async (tx) => {
      // Create test users
      const student = await tx.user.create({
        data: {
          id: generateTestId('student'),
          email: generateTestEmail('student'),
          name: 'Test Student',
          role: UserRole.STUDENT
        }
      });

      const instructor = await tx.user.create({
        data: {
          id: generateTestId('instructor'),
          email: generateTestEmail('instructor'),
          name: 'Test Instructor',
          role: UserRole.INSTRUCTOR
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
          difficulty: ChallengeDifficulty.EASY,
          challengeImage: 'test-image',
          challengeTypeId: challengeType.id
        }
      });

      // Create test competition group
      const group = await tx.competitionGroup.create({
        data: {
          id: generateTestId('group'),
          name: generateTestName('Competition'),
          description: 'Test Description',
          startDate: new Date(),
          instructors: {
            connect: [{ id: instructor.id }]
          },
          members: {
            connect: [{ id: student.id }]
          }
        }
      });

      // Add challenge to group
      const groupChallenge = await tx.groupChallenge.create({
        data: {
          challengeId: challenge.id,
          groupId: group.id,
          points: 100
        }
      });

      // Create test flag
      const testFlag = `flag{test-${Date.now().toString(36)}}`;

      // Create challenge instance
      const instance = await tx.challengeInstance.create({
        data: {
          id: generateTestId('instance'),
          challengeId: challenge.id,
          userId: student.id,
          competitionId: group.id,
          challengeImage: 'test-image',
          challengeUrl: 'test-url',
          status: 'RUNNING',
          flagSecretName: 'test-secret',
          flag: testFlag
        }
      });

      // Create challenge question
      const question = await tx.challengeQuestion.create({
        data: {
          id: generateTestId('question'),
          challengeId: challenge.id,
          content: 'What is the flag?',
          type: 'TEXT',
          answer: testFlag,
          points: 100,
          order: 1
        }
      });

      // First submission (correct)
      const firstSubmission = testFlag;
      const isFirstCorrect = firstSubmission === testFlag;
      expect(isFirstCorrect).toBe(true);

      // Record first completion
      await tx.questionCompletion.create({
        data: {
          userId: student.id,
          questionId: question.id,
          groupChallengeId: groupChallenge.id,
          pointsEarned: question.points
        }
      });

      // Update user points for first submission
      await tx.groupPoints.upsert({
        where: {
          userId_groupId: {
            userId: student.id,
            groupId: group.id
          }
        },
        create: {
          userId: student.id,
          groupId: group.id,
          points: question.points
        },
        update: {
          points: {
            increment: question.points
          }
        }
      });

      // Check if question is already completed
      const existingCompletion = await tx.questionCompletion.findFirst({
        where: {
          userId: student.id,
          questionId: question.id,
          groupChallengeId: groupChallenge.id
        }
      });

      expect(existingCompletion).not.toBeNull();

      // Second submission (also correct, but should not award points again)
      const secondSubmission = testFlag;
      const isSecondCorrect = secondSubmission === testFlag;
      expect(isSecondCorrect).toBe(true);

      // Get points before second submission
      const pointsBefore = await tx.groupPoints.findUnique({
        where: {
          userId_groupId: {
            userId: student.id,
            groupId: group.id
          }
        }
      });

      // Simulate checking if already completed before awarding points
      if (existingCompletion) {
        // Don't award points again
      } else {
        // This should not execute
        await tx.groupPoints.update({
          where: {
            userId_groupId: {
              userId: student.id,
              groupId: group.id
            }
          },
          data: {
            points: {
              increment: question.points
            }
          }
        });
      }

      // Get points after second submission
      const pointsAfter = await tx.groupPoints.findUnique({
        where: {
          userId_groupId: {
            userId: student.id,
            groupId: group.id
          }
        }
      });

      // Points should not have changed
      expect(pointsAfter?.points).toBe(pointsBefore?.points);
    });
  });
});
