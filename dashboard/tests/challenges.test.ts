import * as dotenv from 'dotenv';
import path from 'path';
import { ChallengeDifficulty, UserRole } from '@prisma/client';
import { withTestTransaction, generateTestId, generateTestEmail, generateTestName } from './test-helpers';
import prisma from './prisma-test-client';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../.env') });

describe('Challenge Management', () => {
  test('should create and manage a challenge successfully', async () => {
    await withTestTransaction(async (tx) => {
      // Create a test challenge type
      const challengeType = await tx.challengeType.create({
        data: {
          id: generateTestId('challenge-type'),
          name: 'Test Challenge Type'
        }
      });

      // Create test student
      const student = await tx.user.create({
        data: {
          id: generateTestId('student'),
          email: generateTestEmail('test-student'),
          name: 'Test Student',
          role: UserRole.STUDENT
        }
      });

      // Create test competition group
      const group = await tx.competitionGroup.create({
        data: {
          id: generateTestId('group'),
          name: generateTestName('Competition'),
          description: 'Test Description',
          startDate: new Date(),
          members: {
            connect: [{ id: student.id }]
          }
        }
      });

      // Create challenge
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
      expect(challenge).toBeDefined();

      // Add challenge to group
      const groupChallenge = await tx.groupChallenge.create({
        data: {
          challengeId: challenge.id,
          groupId: group.id,
          points: 100
        }
      });
      expect(groupChallenge).toBeDefined();

      // Create challenge instance
      const instance = await tx.challengeInstance.create({
        data: {
          id: generateTestId('instance'),
          challengeId: challenge.id,
          userId: student.id,
          competitionId: group.id,
          challengeImage: 'test-image',
          challengeUrl: 'test-url',
          status: 'creating',
          flagSecretName: 'test-secret',
          flag: 'test-flag'
        }
      });
      expect(instance).toBeDefined();

      // Add question to challenge
      const question = await tx.challengeQuestion.create({
        data: {
          content: 'Test Question',
          answer: 'test answer',
          points: 10,
          order: 1,
          type: 'TEXT',
          challengeId: challenge.id
        }
      });
      expect(question).toBeDefined();

      // Complete question
      const completion = await tx.questionCompletion.create({
        data: {
          userId: student.id,
          questionId: question.id,
          groupChallengeId: groupChallenge.id,
          pointsEarned: 10
        }
      });
      expect(completion).toBeDefined();

      // Update group points
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
          points: 10
        },
        update: {
          points: {
            increment: 10
          }
        }
      });
      expect(points).toBeDefined();
    });
  });

  test('should retrieve a challenge by ID', async () => {
    await withTestTransaction(async (tx) => {
      // Create a test challenge type
      const challengeType = await tx.challengeType.create({
        data: {
          id: generateTestId('challenge-type'),
          name: 'Test Challenge Type'
        }
      });
      
      // Create a dedicated challenge for this test
      const retrieveChallenge = await tx.challenges.create({
        data: {
          id: generateTestId('retrieve-challenge'),
          name: 'Retrieve Test Challenge',
          description: 'Test Description for Retrieval',
          difficulty: ChallengeDifficulty.EASY,
          challengeImage: 'test-image',
          challengeTypeId: challengeType.id
        }
      });
      
      const challenge = await tx.challenges.findUnique({
        where: { id: retrieveChallenge.id }
      });
      expect(challenge).toBeDefined();
      expect(challenge?.name).toBe('Retrieve Test Challenge');
    });
  });

  test('should update a challenge', async () => {
    await withTestTransaction(async (tx) => {
      // Create a test challenge type
      const challengeType = await tx.challengeType.create({
        data: {
          id: generateTestId('challenge-type'),
          name: 'Test Challenge Type'
        }
      });
      
      // Create a dedicated challenge for this test
      const updateChallenge = await tx.challenges.create({
        data: {
          id: generateTestId('update-challenge'),
          name: 'Update Test Challenge',
          description: 'Test Description for Update',
          difficulty: ChallengeDifficulty.EASY,
          challengeImage: 'test-image',
          challengeTypeId: challengeType.id
        }
      });
      
      const updatedChallenge = await tx.challenges.update({
        where: { id: updateChallenge.id },
        data: {
          name: 'Updated Challenge Name',
          difficulty: ChallengeDifficulty.HARD
        }
      });
      expect(updatedChallenge.name).toBe('Updated Challenge Name');
      expect(updatedChallenge.difficulty).toBe(ChallengeDifficulty.HARD);
    });
  });
}); 