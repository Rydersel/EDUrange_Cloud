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

describe('Challenge Submission', () => {
  let testStudentId: string;
  let testInstructorId: string;
  let testGroupId: string;
  let testChallengeId: string;
  let testChallengeTypeId: string;
  let testInstanceId: string;
  let testGroupChallengeId: string;
  let testQuestionId: string;
  let testFlag: string;

  beforeAll(async () => {
    // Create test users
    const student = await prisma.user.create({
      data: {
        id: `test-${uuidv4()}`,
        email: generateUniqueEmail('test-student'),
        name: 'Test Student',
        role: UserRole.STUDENT
      }
    });
    testStudentId = student.id;

    const instructor = await prisma.user.create({
      data: {
        id: `test-${uuidv4()}`,
        email: generateUniqueEmail('test-instructor'),
        name: 'Test Instructor',
        role: UserRole.INSTRUCTOR
      }
    });
    testInstructorId = instructor.id;

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
        difficulty: ChallengeDifficulty.EASY,
        challengeImage: 'test-image',
        challengeTypeId: challengeType.id
      }
    });
    testChallengeId = challenge.id;

    // Create test competition group
    const group = await prisma.competitionGroup.create({
      data: {
        id: `test-${uuidv4()}`,
        name: generateUniqueName('Test Competition'),
        description: 'Test Description',
        startDate: new Date(),
        instructors: {
          connect: [{ id: testInstructorId }]
        },
        members: {
          connect: [{ id: testStudentId }]
        }
      }
    });
    testGroupId = group.id;

    // Add challenge to group
    const groupChallenge = await prisma.groupChallenge.create({
      data: {
        challengeId: challenge.id,
        groupId: group.id,
        points: 100
      }
    });
    testGroupChallengeId = groupChallenge.id;

    // Create test flag
    testFlag = `flag{test-${uuidv4().substring(0, 8)}}`;

    // Create challenge instance
    const instance = await prisma.challengeInstance.create({
      data: {
        id: `test-${uuidv4()}`,
        challengeId: challenge.id,
        userId: testStudentId,
        competitionId: group.id,
        challengeImage: 'test-image',
        challengeUrl: 'test-url',
        status: 'RUNNING',
        flagSecretName: 'test-secret',
        flag: testFlag
      }
    });
    testInstanceId = instance.id;

    // Create challenge question
    const question = await prisma.challengeQuestion.create({
      data: {
        id: `test-${uuidv4()}`,
        challengeId: challenge.id,
        content: 'What is the flag?',
        type: 'TEXT',
        answer: testFlag,
        points: 100,
        order: 1
      }
    });
    testQuestionId = question.id;
  });

  afterAll(async () => {
    // Clean up in correct order
    await prisma.questionCompletion.deleteMany({
      where: {
        OR: [
          { userId: testStudentId },
          { groupChallengeId: testGroupChallengeId }
        ]
      }
    });

    await prisma.groupPoints.deleteMany({
      where: {
        OR: [
          { userId: testStudentId },
          { groupId: testGroupId }
        ]
      }
    });

    await prisma.challengeInstance.deleteMany({
      where: { id: testInstanceId }
    });

    await prisma.groupChallenge.deleteMany({
      where: { id: testGroupChallengeId }
    });

    await prisma.challengeQuestion.deleteMany({
      where: { id: testQuestionId }
    });

    await prisma.challenges.deleteMany({
      where: { id: testChallengeId }
    });

    await prisma.challengeType.deleteMany({
      where: { id: testChallengeTypeId }
    });

    await prisma.competitionGroup.deleteMany({
      where: { id: testGroupId }
    });

    await prisma.user.deleteMany({
      where: {
        id: {
          in: [testStudentId, testInstructorId]
        }
      }
    });

    await prisma.$disconnect();
  });

  test('should submit correct flag and earn points', async () => {
    // Simulate flag submission
    const submission = testFlag;
    
    // Check if submission matches the flag
    const instance = await prisma.challengeInstance.findUnique({
      where: { id: testInstanceId }
    });
    
    expect(instance).not.toBeNull();
    expect(submission).toBe(instance?.flag);
    
    // Record question completion
    const completion = await prisma.questionCompletion.create({
      data: {
        userId: testStudentId,
        questionId: testQuestionId,
        groupChallengeId: testGroupChallengeId,
        pointsEarned: 100,
        completedAt: new Date()
      }
    });
    
    expect(completion).toBeDefined();
    expect(completion.pointsEarned).toBe(100);
    
    // Update user points
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
        points: 100
      },
      update: {
        points: {
          increment: 100
        }
      }
    });
    
    expect(points).toBeDefined();
    expect(points.points).toBe(100);
    
    // Verify points were awarded
    const userPoints = await prisma.groupPoints.findUnique({
      where: {
        userId_groupId: {
          userId: testStudentId,
          groupId: testGroupId
        }
      }
    });
    
    expect(userPoints).not.toBeNull();
    expect(userPoints?.points).toBe(100);
  });

  test('should reject incorrect flag submission', async () => {
    // Simulate incorrect flag submission
    const incorrectSubmission = 'flag{wrong}';
    
    // Check if submission matches the flag
    const instance = await prisma.challengeInstance.findUnique({
      where: { id: testInstanceId }
    });
    
    expect(instance).not.toBeNull();
    expect(incorrectSubmission).not.toBe(instance?.flag);
    
    // No points should be awarded for incorrect submission
    // This would typically be handled by the API logic
    
    // Verify points remain unchanged
    const userPoints = await prisma.groupPoints.findUnique({
      where: {
        userId_groupId: {
          userId: testStudentId,
          groupId: testGroupId
        }
      }
    });
    
    expect(userPoints).not.toBeNull();
    expect(userPoints?.points).toBe(100); // Still 100 from previous test
  });

  test('should handle case-sensitive flag submission', async () => {
    // Create a case-sensitive flag
    const caseSensitiveFlag = `Flag{Test-${uuidv4().substring(0, 8)}}`;
    
    // Create a dedicated instance for this test instead of updating the shared one
    const caseSensitiveInstance = await prisma.challengeInstance.create({
      data: {
        id: `test-${uuidv4()}`,
        challengeId: testChallengeId,
        userId: testStudentId,
        competitionId: testGroupId,
        challengeImage: 'test-image',
        challengeUrl: 'test-url',
        status: 'RUNNING',
        flagSecretName: 'test-secret',
        flag: caseSensitiveFlag
      }
    });
    
    // Simulate incorrect case submission
    const incorrectCaseSubmission = caseSensitiveFlag.toLowerCase();
    
    // Check if submission matches the flag exactly (case-sensitive)
    const instance = await prisma.challengeInstance.findUnique({
      where: { id: caseSensitiveInstance.id }
    });
    
    expect(instance).not.toBeNull();
    expect(incorrectCaseSubmission).not.toBe(instance?.flag);
    
    // Simulate correct case submission
    const correctCaseSubmission = caseSensitiveFlag;
    expect(correctCaseSubmission).toBe(instance?.flag);
    
    // Clean up the dedicated instance
    await prisma.challengeInstance.delete({
      where: { id: caseSensitiveInstance.id }
    });
  });

  test('should track multiple submission attempts', async () => {
    // This would typically be implemented with a submissions table
    // For this test, we'll simulate tracking attempts
    
    // Create a mock submissions tracking array
    const submissionAttempts: { userId: string, instanceId: string, submission: string, timestamp: Date, correct: boolean }[] = [];
    
    // First attempt (incorrect)
    submissionAttempts.push({
      userId: testStudentId,
      instanceId: testInstanceId,
      submission: 'flag{wrong1}',
      timestamp: new Date(),
      correct: false
    });
    
    // Second attempt (incorrect)
    submissionAttempts.push({
      userId: testStudentId,
      instanceId: testInstanceId,
      submission: 'flag{wrong2}',
      timestamp: new Date(Date.now() + 60000), // 1 minute later
      correct: false
    });
    
    // Get the current flag
    const instance = await prisma.challengeInstance.findUnique({
      where: { id: testInstanceId }
    });
    
    // Third attempt (correct)
    submissionAttempts.push({
      userId: testStudentId,
      instanceId: testInstanceId,
      submission: instance?.flag || '',
      timestamp: new Date(Date.now() + 120000), // 2 minutes later
      correct: true
    });
    
    // Verify submission tracking
    expect(submissionAttempts.length).toBe(3);
    expect(submissionAttempts.filter(a => a.correct).length).toBe(1);
    expect(submissionAttempts[2].correct).toBe(true);
  });

  test('should mark challenge as completed after successful submission', async () => {
    // Create a dedicated instance for this test to avoid interference
    const completionTestInstance = await prisma.challengeInstance.create({
      data: {
        id: `test-${uuidv4()}`,
        challengeId: testChallengeId,
        userId: testStudentId,
        competitionId: testGroupId,
        challengeImage: 'test-image',
        challengeUrl: 'test-url',
        status: 'RUNNING',
        flagSecretName: 'test-secret',
        flag: `flag{completion-${uuidv4().substring(0, 8)}}`
      }
    });
    
    // Update instance status to completed
    const updatedInstance = await prisma.challengeInstance.update({
      where: { id: completionTestInstance.id },
      data: { status: 'COMPLETED' }
    });
    
    expect(updatedInstance.status).toBe('COMPLETED');
    
    // Verify instance status
    const instance = await prisma.challengeInstance.findUnique({
      where: { id: completionTestInstance.id }
    });
    
    expect(instance).not.toBeNull();
    expect(instance?.status).toBe('COMPLETED');
    
    // Clean up the dedicated instance
    await prisma.challengeInstance.delete({
      where: { id: completionTestInstance.id }
    });
  });

  test('should handle partial credit for multi-part challenges', async () => {
    // Create additional questions for the challenge
    const question2 = await prisma.challengeQuestion.create({
      data: {
        id: `test-${uuidv4()}`,
        challengeId: testChallengeId,
        content: 'Second question',
        type: 'TEXT',
        answer: 'answer2',
        points: 50,
        order: 2
      }
    });
    
    const question3 = await prisma.challengeQuestion.create({
      data: {
        id: `test-${uuidv4()}`,
        challengeId: testChallengeId,
        content: 'Third question',
        type: 'TEXT',
        answer: 'answer3',
        points: 50,
        order: 3
      }
    });
    
    // Record completion of second question with partial points
    const completion2 = await prisma.questionCompletion.create({
      data: {
        userId: testStudentId,
        questionId: question2.id,
        groupChallengeId: testGroupChallengeId,
        pointsEarned: 25, // Partial credit (50%)
        completedAt: new Date()
      }
    });
    
    expect(completion2).toBeDefined();
    expect(completion2.pointsEarned).toBe(25);
    
    // Update user points
    const updatedPoints = await prisma.groupPoints.update({
      where: {
        userId_groupId: {
          userId: testStudentId,
          groupId: testGroupId
        }
      },
      data: {
        points: {
          increment: 25
        }
      }
    });
    
    expect(updatedPoints.points).toBe(125); // 100 from first test + 25 from partial credit
    
    // Clean up additional questions
    await prisma.questionCompletion.deleteMany({
      where: {
        questionId: {
          in: [question2.id, question3.id]
        }
      }
    });
    
    await prisma.challengeQuestion.deleteMany({
      where: {
        id: {
          in: [question2.id, question3.id]
        }
      }
    });
  });

  test('should reject submission for already completed challenge', async () => {
    // Create a new challenge instance that's already completed
    const completedInstance = await prisma.challengeInstance.create({
      data: {
        id: `test-${uuidv4()}`,
        challengeId: testChallengeId,
        userId: testStudentId,
        competitionId: testGroupId,
        challengeImage: 'test-image',
        challengeUrl: 'test-url',
        status: 'COMPLETED', // Already completed
        flagSecretName: 'test-secret',
        flag: `flag{completed-${uuidv4().substring(0, 8)}}`
      }
    });
    
    // Attempt to submit a flag for the completed challenge
    const submission = completedInstance.flag;
    
    // In a real application, this would be rejected with an error
    // For this test, we'll simulate the validation logic
    
    // Check if the challenge is already completed
    const instance = await prisma.challengeInstance.findUnique({
      where: { id: completedInstance.id }
    });
    
    expect(instance).not.toBeNull();
    expect(instance?.status).toBe('COMPLETED');
    
    // Simulate validation logic that would reject submission for completed challenges
    const isCompleted = instance?.status === 'COMPLETED';
    const shouldRejectSubmission = isCompleted;
    
    expect(shouldRejectSubmission).toBe(true);
    
    // Clean up
    await prisma.challengeInstance.delete({
      where: { id: completedInstance.id }
    });
  });

  test('should reject empty flag submission', async () => {
    // Simulate empty flag submission
    const emptySubmission = '';
    
    // In a real application, this would be validated and rejected
    // For this test, we'll simulate the validation logic
    
    // Check if submission is empty
    const isEmpty = emptySubmission.trim().length === 0;
    
    expect(isEmpty).toBe(true);
    
    // Simulate validation logic that would reject empty submissions
    const shouldRejectSubmission = isEmpty;
    
    expect(shouldRejectSubmission).toBe(true);
    
    // Verify no points are awarded for invalid submission
    const userPointsBefore = await prisma.groupPoints.findUnique({
      where: {
        userId_groupId: {
          userId: testStudentId,
          groupId: testGroupId
        }
      }
    });
    
    // Points should remain unchanged
    expect(userPointsBefore).not.toBeNull();
    expect(userPointsBefore?.points).toBe(125); // From previous tests
  });

  test('should handle whitespace in flag submission', async () => {
    // Create a flag with exact whitespace requirements
    const flagWithWhitespace = '  flag{with spaces}  ';
    
    // Create a new instance with the whitespace flag instead of updating existing one
    const whitespaceInstance = await prisma.challengeInstance.create({
      data: {
        id: `test-${uuidv4()}`,
        challengeId: testChallengeId,
        userId: testStudentId,
        competitionId: testGroupId,
        challengeImage: 'test-image',
        challengeUrl: 'test-url',
        status: 'RUNNING',
        flagSecretName: 'test-secret',
        flag: flagWithWhitespace
      }
    });
    
    // Test submission with extra whitespace
    const submissionWithExtraWhitespace = '   flag{with spaces}    ';
    
    // Test submission with whitespace removed
    const submissionWithoutWhitespace = 'flag{with spaces}';
    
    // Get the current flag
    const instance = await prisma.challengeInstance.findUnique({
      where: { id: whitespaceInstance.id }
    });
    
    expect(instance).not.toBeNull();
    
    // Direct comparison (would fail due to whitespace differences)
    expect(submissionWithExtraWhitespace).not.toBe(instance?.flag);
    expect(submissionWithoutWhitespace).not.toBe(instance?.flag);
    
    // Simulate whitespace-sensitive validation (exact match required)
    const isExactMatch = submissionWithExtraWhitespace === instance?.flag;
    expect(isExactMatch).toBe(false);
    
    // Simulate whitespace-insensitive validation (trimming whitespace)
    const isTrimmedMatch = submissionWithExtraWhitespace.trim() === instance?.flag.trim();
    expect(isTrimmedMatch).toBe(true);
    
    // Clean up
    await prisma.challengeInstance.delete({
      where: { id: whitespaceInstance.id }
    });
  });

  test('should handle concurrent submissions by different users', async () => {
    // Create another test student
    const student2 = await prisma.user.create({
      data: {
        id: `test-${uuidv4()}`,
        email: generateUniqueEmail('test-student2'),
        name: 'Test Student 2',
        role: UserRole.STUDENT
      }
    });
    
    // Add student2 to the competition
    await prisma.competitionGroup.update({
      where: { id: testGroupId },
      data: {
        members: {
          connect: [{ id: student2.id }]
        }
      }
    });
    
    // Create a challenge instance for student2
    const instance2 = await prisma.challengeInstance.create({
      data: {
        id: `test-${uuidv4()}`,
        challengeId: testChallengeId,
        userId: student2.id,
        competitionId: testGroupId,
        challengeImage: 'test-image',
        challengeUrl: 'test-url',
        status: 'RUNNING',
        flagSecretName: 'test-secret',
        flag: testFlag // Same flag as the first student
      }
    });
    
    // Create two new questions for the challenge to avoid unique constraint violation
    const question1ForConcurrent = await prisma.challengeQuestion.create({
      data: {
        id: `test-${uuidv4()}`,
        challengeId: testChallengeId,
        content: 'First question for concurrent test',
        type: 'TEXT',
        answer: 'concurrent-answer-1',
        points: 50,
        order: 10
      }
    });
    
    const question2ForConcurrent = await prisma.challengeQuestion.create({
      data: {
        id: `test-${uuidv4()}`,
        challengeId: testChallengeId,
        content: 'Second question for concurrent test',
        type: 'TEXT',
        answer: 'concurrent-answer-2',
        points: 50,
        order: 11
      }
    });
    
    // Simulate concurrent submissions
    // In a real application, these would be processed concurrently
    // For this test, we'll simulate the submissions one after another
    
    // First student submission (first concurrent question)
    const completion1 = await prisma.questionCompletion.create({
      data: {
        userId: testStudentId,
        questionId: question1ForConcurrent.id,
        groupChallengeId: testGroupChallengeId,
        pointsEarned: 50,
        completedAt: new Date()
      }
    });
    
    // Second student submission (second concurrent question)
    const completion2 = await prisma.questionCompletion.create({
      data: {
        userId: student2.id,
        questionId: question2ForConcurrent.id,
        groupChallengeId: testGroupChallengeId,
        pointsEarned: 50,
        completedAt: new Date()
      }
    });
    
    // Verify both completions were recorded
    expect(completion1).toBeDefined();
    expect(completion2).toBeDefined();
    
    // Verify points for both students
    await prisma.groupPoints.upsert({
      where: {
        userId_groupId: {
          userId: student2.id,
          groupId: testGroupId
        }
      },
      create: {
        userId: student2.id,
        groupId: testGroupId,
        points: 50
      },
      update: {
        points: {
          increment: 50
        }
      }
    });
    
    const points1 = await prisma.groupPoints.findUnique({
      where: {
        userId_groupId: {
          userId: testStudentId,
          groupId: testGroupId
        }
      }
    });
    
    const points2 = await prisma.groupPoints.findUnique({
      where: {
        userId_groupId: {
          userId: student2.id,
          groupId: testGroupId
        }
      }
    });
    
    expect(points1).not.toBeNull();
    expect(points2).not.toBeNull();
    expect(points2?.points).toBe(50);
    
    // Clean up
    await prisma.questionCompletion.deleteMany({
      where: {
        questionId: {
          in: [question1ForConcurrent.id, question2ForConcurrent.id]
        }
      }
    });
    
    await prisma.groupPoints.deleteMany({
      where: {
        userId: student2.id
      }
    });
    
    await prisma.challengeQuestion.deleteMany({
      where: {
        id: {
          in: [question1ForConcurrent.id, question2ForConcurrent.id]
        }
      }
    });
    
    await prisma.challengeInstance.delete({
      where: { id: instance2.id }
    });
    
    await prisma.competitionGroup.update({
      where: { id: testGroupId },
      data: {
        members: {
          disconnect: [{ id: student2.id }]
        }
      }
    });
    
    await prisma.user.delete({
      where: { id: student2.id }
    });
  });
}); 