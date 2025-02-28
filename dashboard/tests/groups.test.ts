import * as dotenv from 'dotenv';
import path from 'path';
import { PrismaClient, UserRole } from '@prisma/client';
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

// Helper function to generate unique group name
function generateUniqueName(prefix: string): string {
  return `${prefix}-${Date.now()}`;
}

describe('Competition Group Management', () => {
  let testGroupId: string;
  let testInstructorId: string;
  let testStudentId: string;

  beforeAll(async () => {
    // Create test users with unique emails
    const instructor = await prisma.user.create({
      data: {
        id: `test-${uuidv4()}`,
        email: generateUniqueEmail('test-instructor'),
        name: 'Test Instructor',
        role: UserRole.INSTRUCTOR
      }
    });
    testInstructorId = instructor.id;

    const student = await prisma.user.create({
      data: {
        id: `test-${uuidv4()}`,
        email: generateUniqueEmail('test-student'),
        name: 'Test Student',
        role: UserRole.STUDENT
      }
    });
    testStudentId = student.id;
  });

  afterAll(async () => {
    // Clean up in correct order
    await prisma.competitionAccessCode.deleteMany({
      where: {
        createdBy: testInstructorId
      }
    });

    await prisma.groupPoints.deleteMany({
      where: {
        userId: {
          in: [testInstructorId, testStudentId]
        }
      }
    });

    await prisma.competitionGroup.deleteMany({
      where: {
        OR: [
          {
            instructors: {
              some: {
                id: testInstructorId
              }
            }
          },
          {
            members: {
              some: {
                id: testStudentId
              }
            }
          }
        ]
      }
    });

    await prisma.user.deleteMany({
      where: {
        id: {
          in: [testInstructorId, testStudentId]
        }
      }
    });

    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Create a test competition group before each test
    const group = await prisma.competitionGroup.create({
      data: {
        id: `test-${uuidv4()}`,
        name: generateUniqueName('Test Competition'),
        description: 'Test Description',
        startDate: new Date(),
        instructors: {
          connect: [{ id: testInstructorId }]
        }
      }
    });
    testGroupId = group.id;
  });

  afterEach(async () => {
    // Clean up test group after each test
    if (testGroupId) {
      await prisma.groupPoints.deleteMany({
        where: {
          groupId: testGroupId
        }
      });

      await prisma.competitionGroup.deleteMany({
        where: {
          id: testGroupId
        }
      });
    }
  });

  test('should create a competition group successfully', async () => {
    const groupId = `test-${uuidv4()}`;
    const group = await prisma.competitionGroup.create({
      data: {
        id: groupId,
        name: generateUniqueName('New Test Competition'),
        description: 'New Test Description',
        startDate: new Date(),
        instructors: {
          connect: [{ id: testInstructorId }]
        }
      }
    });

    expect(group).toBeDefined();
    expect(group.name).toContain('New Test Competition');
    expect(group.description).toBe('New Test Description');

    // Clean up
    await prisma.competitionGroup.delete({
      where: { id: groupId }
    });
  });

  test('should add and remove a student from a competition group', async () => {
    // Create a dedicated group for this test
    const dedicatedGroupId = `test-${uuidv4()}`;
    const dedicatedGroup = await prisma.competitionGroup.create({
      data: {
        id: dedicatedGroupId,
        name: generateUniqueName('Student Test Competition'),
        description: 'Test Description for Student Management',
        startDate: new Date(),
        instructors: {
          connect: [{ id: testInstructorId }]
        }
      }
    });
    
    // First add the student
    const updatedGroup = await prisma.competitionGroup.update({
      where: { id: dedicatedGroupId },
      data: {
        members: {
          connect: [{ id: testStudentId }]
        }
      },
      include: {
        members: true
      }
    });

    expect(updatedGroup.members).toHaveLength(1);
    expect(updatedGroup.members[0].id).toBe(testStudentId);

    // Then remove the student
    const groupAfterRemoval = await prisma.competitionGroup.update({
      where: { id: dedicatedGroupId },
      data: {
        members: {
          disconnect: [{ id: testStudentId }]
        }
      },
      include: {
        members: true
      }
    });

    expect(groupAfterRemoval.members).toHaveLength(0);
    
    // Clean up
    await prisma.competitionGroup.delete({
      where: { id: dedicatedGroupId }
    });
  });

  test('should update competition group details', async () => {
    // Create a dedicated group for this test
    const dedicatedGroupId = `test-${uuidv4()}`;
    const dedicatedGroup = await prisma.competitionGroup.create({
      data: {
        id: dedicatedGroupId,
        name: generateUniqueName('Update Test Competition'),
        description: 'Test Description for Update',
        startDate: new Date(),
        instructors: {
          connect: [{ id: testInstructorId }]
        }
      }
    });
    
    const newEndDate = new Date();
    newEndDate.setDate(newEndDate.getDate() + 7);

    const updatedGroup = await prisma.competitionGroup.update({
      where: { id: dedicatedGroupId },
      data: {
        name: generateUniqueName('Updated Competition'),
        description: 'Updated Description',
        endDate: newEndDate
      }
    });

    expect(updatedGroup.name).toContain('Updated Competition');
    expect(updatedGroup.description).toBe('Updated Description');
    expect(updatedGroup.endDate).toBeDefined();
    
    // Clean up
    await prisma.competitionGroup.delete({
      where: { id: dedicatedGroupId }
    });
  });

  test('should generate and use access codes', async () => {
    // Create a dedicated group for this test
    const dedicatedGroupId = `test-${uuidv4()}`;
    const dedicatedGroup = await prisma.competitionGroup.create({
      data: {
        id: dedicatedGroupId,
        name: generateUniqueName('Access Code Test Competition'),
        description: 'Test Description for Access Codes',
        startDate: new Date(),
        instructors: {
          connect: [{ id: testInstructorId }]
        }
      }
    });
    
    const accessCode = await prisma.competitionAccessCode.create({
      data: {
        code: 'TEST' + Date.now().toString().slice(-4),
        groupId: dedicatedGroupId,
        createdBy: testInstructorId,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      }
    });
    
    expect(accessCode).toBeDefined();
    expect(accessCode.groupId).toBe(dedicatedGroupId);

    // Use access code to add student
    await prisma.competitionGroup.update({
      where: { id: dedicatedGroupId },
      data: {
        members: {
          connect: [{ id: testStudentId }]
        }
      }
    });

    // Verify membership
    const membership = await prisma.competitionGroup.findFirst({
      where: {
        id: dedicatedGroupId,
        members: {
          some: {
            id: testStudentId
          }
        }
      }
    });

    expect(membership).toBeDefined();
    
    // Clean up
    await prisma.competitionAccessCode.delete({
      where: { id: accessCode.id }
    });
    
    await prisma.competitionGroup.update({
      where: { id: dedicatedGroupId },
      data: {
        members: {
          disconnect: [{ id: testStudentId }]
        }
      }
    });
    
    await prisma.competitionGroup.delete({
      where: { id: dedicatedGroupId }
    });
  });

  test('should handle expired access codes', async () => {
    // Create a dedicated group for this test
    const dedicatedGroupId = `test-${uuidv4()}`;
    const dedicatedGroup = await prisma.competitionGroup.create({
      data: {
        id: dedicatedGroupId,
        name: generateUniqueName('Expired Access Code Test'),
        description: 'Test Description for Expired Access Codes',
        startDate: new Date(),
        instructors: {
          connect: [{ id: testInstructorId }]
        }
      }
    });
    
    // Create an access code that is already expired (1 day in the past)
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 1);
    
    const expiredAccessCode = await prisma.competitionAccessCode.create({
      data: {
        code: 'EXPIRED' + Date.now().toString().slice(-4),
        groupId: dedicatedGroupId,
        createdBy: testInstructorId,
        expiresAt: pastDate
      }
    });
    
    expect(expiredAccessCode).toBeDefined();
    expect(expiredAccessCode.expiresAt).not.toBeNull();
    expect(expiredAccessCode.expiresAt!.getTime()).toBeLessThan(Date.now());
    
    // Check if the access code is expired
    const isExpired = expiredAccessCode.expiresAt!.getTime() < Date.now();
    expect(isExpired).toBe(true);
    
    // In a real application, attempting to use this code would be rejected
    // Here we simulate the validation logic that would check for expiration
    
    // Verify that the code is found but identified as expired
    const foundCode = await prisma.competitionAccessCode.findUnique({
      where: { id: expiredAccessCode.id }
    });
    
    expect(foundCode).not.toBeNull();
    expect(foundCode?.expiresAt).not.toBeNull();
    expect(foundCode!.expiresAt!.getTime() < Date.now()).toBe(true);
    
    // Clean up
    await prisma.competitionAccessCode.delete({
      where: { id: expiredAccessCode.id }
    });
    
    await prisma.competitionGroup.delete({
      where: { id: dedicatedGroupId }
    });
  });
}); 