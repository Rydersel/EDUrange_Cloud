import * as dotenv from 'dotenv';
import path from 'path';
import { UserRole } from '@prisma/client';
import { withTestTransaction, generateTestId, generateTestEmail, generateTestName } from './test-helpers';
import prisma from './prisma-test-client';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../.env') });

describe('Competition Group Management', () => {
  test('should create a competition group', async () => {
    await withTestTransaction(async (tx) => {
      // Create test instructor
      const instructor = await tx.user.create({
        data: {
          id: generateTestId('instructor'),
          email: generateTestEmail('instructor'),
          name: 'Test Instructor',
          role: UserRole.INSTRUCTOR
        }
      });

      // Create a competition group
      const group = await tx.competitionGroup.create({
        data: {
          id: generateTestId('group'),
          name: generateTestName('Competition'),
          description: 'Test Description',
          startDate: new Date(),
          instructors: {
            connect: [{ id: instructor.id }]
          }
        }
      });

      expect(group).toBeDefined();
      expect(group.name).toContain('Competition');
      expect(group.description).toBe('Test Description');

      // Verify instructor is connected to the group
      const groupWithInstructors = await tx.competitionGroup.findUnique({
        where: { id: group.id },
        include: { instructors: true }
      });

      expect(groupWithInstructors?.instructors).toHaveLength(1);
      expect(groupWithInstructors?.instructors[0].id).toBe(instructor.id);
    });
  });

  test('should add a student to a competition group', async () => {
    await withTestTransaction(async (tx) => {
      // Create test users
      const instructor = await tx.user.create({
        data: {
          id: generateTestId('instructor'),
          email: generateTestEmail('instructor'),
          name: 'Test Instructor',
          role: UserRole.INSTRUCTOR
        }
      });

      const student = await tx.user.create({
        data: {
          id: generateTestId('student'),
          email: generateTestEmail('student'),
          name: 'Test Student',
          role: UserRole.STUDENT
        }
      });

      // Create a competition group
      const group = await tx.competitionGroup.create({
        data: {
          id: generateTestId('group'),
          name: generateTestName('Competition'),
          description: 'Test Description',
          startDate: new Date(),
          instructors: {
            connect: [{ id: instructor.id }]
          }
        }
      });

      // Add student to the group
      await tx.competitionGroup.update({
        where: { id: group.id },
        data: {
          members: {
            connect: [{ id: student.id }]
          }
        }
      });

      // Verify student is added to the group
      const groupWithMembers = await tx.competitionGroup.findUnique({
        where: { id: group.id },
        include: { members: true }
      });

      expect(groupWithMembers?.members).toHaveLength(1);
      expect(groupWithMembers?.members[0].id).toBe(student.id);
    });
  });

  test('should generate and use access codes', async () => {
    await withTestTransaction(async (tx) => {
      // Create test users
      const instructor = await tx.user.create({
        data: {
          id: generateTestId('instructor'),
          email: generateTestEmail('instructor'),
          name: 'Test Instructor',
          role: UserRole.INSTRUCTOR
        }
      });

      const student = await tx.user.create({
        data: {
          id: generateTestId('student'),
          email: generateTestEmail('student'),
          name: 'Test Student',
          role: UserRole.STUDENT
        }
      });

      // Create a competition group
      const group = await tx.competitionGroup.create({
        data: {
          id: generateTestId('group'),
          name: generateTestName('Competition'),
          description: 'Test Description',
          startDate: new Date(),
          instructors: {
            connect: [{ id: instructor.id }]
          }
        }
      });

      // Generate access code
      const accessCode = await tx.competitionAccessCode.create({
        data: {
          code: 'TEST' + Date.now().toString().slice(-4),
          groupId: group.id,
          createdBy: instructor.id,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours from now
        }
      });

      expect(accessCode).toBeDefined();
      expect(accessCode.groupId).toBe(group.id);

      // Simulate using the access code to join the group
      await tx.competitionGroup.update({
        where: { id: group.id },
        data: {
          members: {
            connect: [{ id: student.id }]
          }
        }
      });

      // Verify student is added to the group
      const groupWithMembers = await tx.competitionGroup.findUnique({
        where: { id: group.id },
        include: { members: true }
      });

      expect(groupWithMembers?.members).toHaveLength(1);
      expect(groupWithMembers?.members[0].id).toBe(student.id);
    });
  });

  test('should track points for group members', async () => {
    await withTestTransaction(async (tx) => {
      // Create test users
      const instructor = await tx.user.create({
        data: {
          id: generateTestId('instructor'),
          email: generateTestEmail('instructor'),
          name: 'Test Instructor',
          role: UserRole.INSTRUCTOR
        }
      });

      const student = await tx.user.create({
        data: {
          id: generateTestId('student'),
          email: generateTestEmail('student'),
          name: 'Test Student',
          role: UserRole.STUDENT
        }
      });

      // Create a competition group
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

      // Add points for the student
      const points = await tx.groupPoints.create({
        data: {
          userId: student.id,
          groupId: group.id,
          points: 100
        }
      });

      expect(points).toBeDefined();
      expect(points.points).toBe(100);

      // Update points
      const updatedPoints = await tx.groupPoints.update({
        where: {
          userId_groupId: {
            userId: student.id,
            groupId: group.id
          }
        },
        data: {
          points: {
            increment: 50
          }
        }
      });

      expect(updatedPoints.points).toBe(150);
    });
  });

  test('should remove a student from a competition group', async () => {
    await withTestTransaction(async (tx) => {
      // Create test users
      const instructor = await tx.user.create({
        data: {
          id: generateTestId('instructor'),
          email: generateTestEmail('instructor'),
          name: 'Test Instructor',
          role: UserRole.INSTRUCTOR
        }
      });

      const student = await tx.user.create({
        data: {
          id: generateTestId('student'),
          email: generateTestEmail('student'),
          name: 'Test Student',
          role: UserRole.STUDENT
        }
      });

      // Create a competition group with the student
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

      // Verify student is in the group
      let groupWithMembers = await tx.competitionGroup.findUnique({
        where: { id: group.id },
        include: { members: true }
      });
      expect(groupWithMembers?.members).toHaveLength(1);

      // Remove student from the group
      await tx.competitionGroup.update({
        where: { id: group.id },
        data: {
          members: {
            disconnect: [{ id: student.id }]
          }
        }
      });

      // Verify student is removed
      groupWithMembers = await tx.competitionGroup.findUnique({
        where: { id: group.id },
        include: { members: true }
      });
      expect(groupWithMembers?.members).toHaveLength(0);
    });
  });
}); 