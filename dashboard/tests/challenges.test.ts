import * as dotenv from 'dotenv';
import path from 'path';
import { PrismaClient, UserRole, ChallengeDifficulty } from '@prisma/client';
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

// Helper function to generate unique name
function generateUniqueName(prefix: string): string {
  return `${prefix}-${Date.now()}`;
}

describe('Challenge Management', () => {
  let testChallengeId: string;
  let testChallengeTypeId: string;
  let testStudentId: string;
  let testGroupId: string;
  let testGroupChallengeId: string;
  let testQuestionId: string;
  let testInstanceId: string;

  beforeAll(async () => {
    // Create a test challenge type
    const challengeType = await prisma.challengeType.create({
      data: {
        id: `test-${uuidv4()}`,
        name: 'Test Challenge Type'
      }
    });
    testChallengeTypeId = challengeType.id;

    // Create test student
    const student = await prisma.user.create({
      data: {
        id: `test-${uuidv4()}`,
        email: generateUniqueEmail('test-student'),
        name: 'Test Student',
        role: UserRole.STUDENT
      }
    });
    testStudentId = student.id;

    // Create test competition group
    const group = await prisma.competitionGroup.create({
      data: {
        id: `test-${uuidv4()}`,
        name: generateUniqueName('Test Competition'),
        description: 'Test Description',
        startDate: new Date(),
        members: {
          connect: [{ id: testStudentId }]
        }
      }
    });
    testGroupId = group.id;
  });

  afterAll(async () => {
    // Clean up in correct order
    await prisma.questionCompletion.deleteMany({
      where: {
        userId: testStudentId
      }
    });

    await prisma.groupPoints.deleteMany({
      where: {
        userId: testStudentId
      }
    });

    await prisma.challengeInstance.deleteMany({
      where: {
        userId: testStudentId
      }
    });

    await prisma.groupChallenge.deleteMany({
      where: {
        groupId: testGroupId
      }
    });

    await prisma.challengeQuestion.deleteMany({
      where: {
        challengeId: testChallengeId
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
        id: testStudentId
      }
    });

    await prisma.$disconnect();
  });

  test('should create and manage a challenge successfully', async () => {
    // Create challenge
    const challenge = await prisma.challenges.create({
      data: {
        id: `test-${uuidv4()}`,
        name: 'Test Challenge',
        description: 'Test Description',
        difficulty: ChallengeDifficulty.EASY,
        challengeImage: 'test-image',
        challengeTypeId: testChallengeTypeId
      }
    });
    testChallengeId = challenge.id;
    expect(challenge).toBeDefined();

    // Add challenge to group
    const groupChallenge = await prisma.groupChallenge.create({
      data: {
        challengeId: challenge.id,
        groupId: testGroupId,
        points: 100
      }
    });
    testGroupChallengeId = groupChallenge.id;
    expect(groupChallenge).toBeDefined();

    // Create challenge instance
    const instance = await prisma.challengeInstance.create({
      data: {
        id: `test-${uuidv4()}`,
        challengeId: challenge.id,
        userId: testStudentId,
        competitionId: testGroupId,
        challengeImage: 'test-image',
        challengeUrl: 'test-url',
        status: 'creating',
        flagSecretName: 'test-secret',
        flag: 'test-flag'
      }
    });
    testInstanceId = instance.id;
    expect(instance).toBeDefined();

    // Add question to challenge
    const question = await prisma.challengeQuestion.create({
      data: {
        content: 'Test Question',
        answer: 'test answer',
        points: 10,
        order: 1,
        type: 'TEXT',
        challengeId: challenge.id
      }
    });
    testQuestionId = question.id;
    expect(question).toBeDefined();

    // Complete question
    const completion = await prisma.questionCompletion.create({
      data: {
        userId: testStudentId,
        questionId: question.id,
        groupChallengeId: groupChallenge.id,
        pointsEarned: 10
      }
    });
    expect(completion).toBeDefined();

    // Update group points
    const points = await prisma.groupPoints.upsert({
      where: {
        userId_groupId: {
          userId: testStudentId,
          groupId: testGroupId
        }
      },
      create: {
        userId: testStudentId,
        groupId: testGroupId,
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

  test('should retrieve a challenge by ID', async () => {
    // Create a dedicated challenge for this test
    const retrieveChallenge = await prisma.challenges.create({
      data: {
        id: `test-retrieve-${uuidv4()}`,
        name: 'Retrieve Test Challenge',
        description: 'Test Description for Retrieval',
        difficulty: ChallengeDifficulty.EASY,
        challengeImage: 'test-image',
        challengeTypeId: testChallengeTypeId
      }
    });
    
    const challenge = await prisma.challenges.findUnique({
      where: { id: retrieveChallenge.id }
    });
    expect(challenge).toBeDefined();
    expect(challenge?.name).toBe('Retrieve Test Challenge');
    
    // Clean up
    await prisma.challenges.delete({
      where: { id: retrieveChallenge.id }
    });
  });

  test('should update a challenge', async () => {
    // Create a dedicated challenge for this test
    const updateChallenge = await prisma.challenges.create({
      data: {
        id: `test-update-${uuidv4()}`,
        name: 'Update Test Challenge',
        description: 'Test Description for Update',
        difficulty: ChallengeDifficulty.EASY,
        challengeImage: 'test-image',
        challengeTypeId: testChallengeTypeId
      }
    });
    
    const updatedChallenge = await prisma.challenges.update({
      where: { id: updateChallenge.id },
      data: {
        name: 'Updated Challenge Name',
        difficulty: ChallengeDifficulty.HARD
      }
    });
    expect(updatedChallenge.name).toBe('Updated Challenge Name');
    expect(updatedChallenge.difficulty).toBe(ChallengeDifficulty.HARD);
    
    // Clean up
    await prisma.challenges.delete({
      where: { id: updateChallenge.id }
    });
  });
}); 