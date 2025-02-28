import * as dotenv from 'dotenv';
import path from 'path';
import { PrismaClient, UserRole, ActivityEventType } from '@prisma/client';
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

// Helper function to verify activity log entries
async function verifyActivityLog(eventType: ActivityEventType, userId: string, metadata: Record<string, any> = {}) {
  const log = await prisma.activityLog.findFirst({
    where: {
      eventType,
      userId
    },
    orderBy: {
      timestamp: 'desc'
    }
  });

  expect(log).toBeDefined();
  expect(log?.eventType).toBe(eventType);
  
  if (Object.keys(metadata).length > 0) {
    const logMetadata = typeof log?.metadata === 'string' 
      ? JSON.parse(log.metadata) 
      : log?.metadata;
      
    for (const [key, value] of Object.entries(metadata)) {
      expect(logMetadata[key]).toBeDefined();
      if (value !== undefined) {
        expect(logMetadata[key]).toBe(value);
      }
    }
  }
  
  return log;
}

describe('Authentication System', () => {
  // Test users for different roles
  let testAdminId: string;
  let testInstructorId: string;
  let testStudentId: string;
  
  beforeAll(async () => {
    // Create test users with different roles
    const admin = await prisma.user.create({
      data: {
        id: `test-admin-${uuidv4()}`,
        email: generateUniqueEmail('test-admin'),
        name: generateUniqueName('Test Admin'),
        role: UserRole.ADMIN
      }
    });
    testAdminId = admin.id;
    
    const instructor = await prisma.user.create({
      data: {
        id: `test-instructor-${uuidv4()}`,
        email: generateUniqueEmail('test-instructor'),
        name: generateUniqueName('Test Instructor'),
        role: UserRole.INSTRUCTOR
      }
    });
    testInstructorId = instructor.id;
    
    const student = await prisma.user.create({
      data: {
        id: `test-student-${uuidv4()}`,
        email: generateUniqueEmail('test-student'),
        name: generateUniqueName('Test Student'),
        role: UserRole.STUDENT
      }
    });
    testStudentId = student.id;
  });
  
  afterAll(async () => {
    // Clean up test data in correct order
    await prisma.activityLog.deleteMany({
      where: {
        userId: {
          in: [testAdminId, testInstructorId, testStudentId]
        }
      }
    });
    
    await prisma.session.deleteMany({
      where: {
        userId: {
          in: [testAdminId, testInstructorId, testStudentId]
        }
      }
    });
    
    await prisma.account.deleteMany({
      where: {
        userId: {
          in: [testAdminId, testInstructorId, testStudentId]
        }
      }
    });
    
    await prisma.user.deleteMany({
      where: {
        id: {
          in: [testAdminId, testInstructorId, testStudentId]
        }
      }
    });
    
    await prisma.$disconnect();
  });
  
  describe('User Management', () => {
    test('should create users with correct roles', async () => {
      // Create a dedicated user for this test
      const dedicatedUserId = `test-user-${uuidv4()}`;
      const dedicatedUser = await prisma.user.create({
        data: {
          id: dedicatedUserId,
          email: generateUniqueEmail('test-dedicated-user'),
          name: generateUniqueName('Test Dedicated User'),
          role: UserRole.STUDENT
        }
      });
      
      // Verify user was created with correct role
      const user = await prisma.user.findUnique({
        where: { id: dedicatedUserId }
      });
      
      expect(user).toBeDefined();
      expect(user?.role).toBe(UserRole.STUDENT);
      
      // Clean up
      await prisma.user.delete({
        where: { id: dedicatedUserId }
      });
    });
    
    test('should update user roles', async () => {
      // Create a dedicated user for this test
      const dedicatedUserId = `test-role-update-${uuidv4()}`;
      const dedicatedUser = await prisma.user.create({
        data: {
          id: dedicatedUserId,
          email: generateUniqueEmail('test-role-update'),
          name: generateUniqueName('Test Role Update'),
          role: UserRole.STUDENT
        }
      });
      
      // Update user role
      const updatedUser = await prisma.user.update({
        where: { id: dedicatedUserId },
        data: { role: UserRole.INSTRUCTOR }
      });
      
      expect(updatedUser.role).toBe(UserRole.INSTRUCTOR);
      
      // Log role change event
      await prisma.activityLog.create({
        data: {
          eventType: ActivityEventType.USER_ROLE_CHANGED,
          userId: dedicatedUserId,
          severity: 'WARNING',
          metadata: JSON.stringify({
            changedBy: testAdminId,
            oldRole: UserRole.STUDENT,
            newRole: UserRole.INSTRUCTOR,
            timestamp: new Date().toISOString()
          })
        }
      });
      
      // Verify activity log
      await verifyActivityLog(ActivityEventType.USER_ROLE_CHANGED, dedicatedUserId, {
        changedBy: testAdminId,
        oldRole: UserRole.STUDENT,
        newRole: UserRole.INSTRUCTOR
      });
      
      // Clean up
      await prisma.activityLog.deleteMany({
        where: { userId: dedicatedUserId }
      });
      
      await prisma.user.delete({
        where: { id: dedicatedUserId }
      });
    });
  });
  
  describe('Session Management', () => {
    test('should create and manage user sessions', async () => {
      // Create a dedicated user for this test
      const dedicatedUserId = `test-session-${uuidv4()}`;
      const dedicatedUser = await prisma.user.create({
        data: {
          id: dedicatedUserId,
          email: generateUniqueEmail('test-session'),
          name: generateUniqueName('Test Session'),
          role: UserRole.STUDENT
        }
      });
      
      // Create a session for the user
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 30); // 30 days from now
      
      const session = await prisma.session.create({
        data: {
          id: `test-session-${uuidv4()}`,
          sessionToken: `test-token-${uuidv4()}`,
          userId: dedicatedUserId,
          expires: expiryDate
        }
      });
      
      expect(session).toBeDefined();
      expect(session.userId).toBe(dedicatedUserId);
      
      // Verify session exists
      const foundSession = await prisma.session.findUnique({
        where: { id: session.id }
      });
      
      expect(foundSession).toBeDefined();
      expect(foundSession?.expires.getTime()).toBe(expiryDate.getTime());
      
      // Clean up
      await prisma.session.delete({
        where: { id: session.id }
      });
      
      await prisma.user.delete({
        where: { id: dedicatedUserId }
      });
    });
    
    test('should handle expired sessions', async () => {
      // Create a dedicated user for this test
      const dedicatedUserId = `test-expired-session-${uuidv4()}`;
      const dedicatedUser = await prisma.user.create({
        data: {
          id: dedicatedUserId,
          email: generateUniqueEmail('test-expired-session'),
          name: generateUniqueName('Test Expired Session'),
          role: UserRole.STUDENT
        }
      });
      
      // Create an expired session (1 day in the past)
      const expiredDate = new Date();
      expiredDate.setDate(expiredDate.getDate() - 1);
      
      const expiredSession = await prisma.session.create({
        data: {
          id: `test-expired-session-${uuidv4()}`,
          sessionToken: `test-expired-token-${uuidv4()}`,
          userId: dedicatedUserId,
          expires: expiredDate
        }
      });
      
      // Verify session is expired
      const now = new Date();
      expect(expiredSession.expires.getTime()).toBeLessThan(now.getTime());
      
      // Simulate session validation logic
      const isSessionValid = expiredSession.expires.getTime() > now.getTime();
      expect(isSessionValid).toBe(false);
      
      // Clean up
      await prisma.session.delete({
        where: { id: expiredSession.id }
      });
      
      await prisma.user.delete({
        where: { id: dedicatedUserId }
      });
    });
  });
  
  describe('OAuth Account Management', () => {
    test('should link OAuth accounts to users', async () => {
      // Create a dedicated user for this test
      const dedicatedUserId = `test-oauth-${uuidv4()}`;
      const dedicatedUser = await prisma.user.create({
        data: {
          id: dedicatedUserId,
          email: generateUniqueEmail('test-oauth'),
          name: generateUniqueName('Test OAuth'),
          role: UserRole.STUDENT
        }
      });
      
      // Create an OAuth account for the user
      const account = await prisma.account.create({
        data: {
          id: `test-account-${uuidv4()}`,
          userId: dedicatedUserId,
          type: 'oauth',
          provider: 'github',
          providerAccountId: `github-${uuidv4()}`,
          access_token: `access-${uuidv4()}`,
          token_type: 'bearer',
          scope: 'user:email'
        }
      });
      
      expect(account).toBeDefined();
      expect(account.provider).toBe('github');
      expect(account.userId).toBe(dedicatedUserId);
      
      // Verify account exists and is linked to user
      const foundAccount = await prisma.account.findFirst({
        where: {
          userId: dedicatedUserId,
          provider: 'github'
        }
      });
      
      expect(foundAccount).toBeDefined();
      expect(foundAccount?.providerAccountId).toBe(account.providerAccountId);
      
      // Clean up
      await prisma.account.delete({
        where: { id: account.id }
      });
      
      await prisma.user.delete({
        where: { id: dedicatedUserId }
      });
    });
  });
  
  describe('Authentication Activity Logging', () => {
    test('should log user registration events', async () => {
      // Create a dedicated user for this test
      const dedicatedUserId = `test-registration-${uuidv4()}`;
      const userEmail = generateUniqueEmail('test-registration');
      const userName = generateUniqueName('Test Registration');
      
      const dedicatedUser = await prisma.user.create({
        data: {
          id: dedicatedUserId,
          email: userEmail,
          name: userName,
          role: UserRole.STUDENT
        }
      });
      
      // Log registration event
      await prisma.activityLog.create({
        data: {
          eventType: ActivityEventType.USER_REGISTERED,
          userId: dedicatedUserId,
          severity: 'INFO',
          metadata: JSON.stringify({
            email: userEmail,
            name: userName,
            timestamp: new Date().toISOString()
          })
        }
      });
      
      // Verify activity log
      await verifyActivityLog(ActivityEventType.USER_REGISTERED, dedicatedUserId, {
        email: userEmail,
        name: userName
      });
      
      // Clean up
      await prisma.activityLog.deleteMany({
        where: { userId: dedicatedUserId }
      });
      
      await prisma.user.delete({
        where: { id: dedicatedUserId }
      });
    });
    
    test('should log user login events', async () => {
      // Create a dedicated user for this test
      const dedicatedUserId = `test-login-${uuidv4()}`;
      const userEmail = generateUniqueEmail('test-login');
      const userName = generateUniqueName('Test Login');
      
      const dedicatedUser = await prisma.user.create({
        data: {
          id: dedicatedUserId,
          email: userEmail,
          name: userName,
          role: UserRole.STUDENT
        }
      });
      
      // Log login event
      await prisma.activityLog.create({
        data: {
          eventType: ActivityEventType.USER_LOGGED_IN,
          userId: dedicatedUserId,
          severity: 'INFO',
          metadata: JSON.stringify({
            email: userEmail,
            name: userName,
            timestamp: new Date().toISOString()
          })
        }
      });
      
      // Verify activity log
      await verifyActivityLog(ActivityEventType.USER_LOGGED_IN, dedicatedUserId, {
        email: userEmail,
        name: userName
      });
      
      // Clean up
      await prisma.activityLog.deleteMany({
        where: { userId: dedicatedUserId }
      });
      
      await prisma.user.delete({
        where: { id: dedicatedUserId }
      });
    });
  });
  
  describe('Role-Based Access Control', () => {
    test('should enforce role-based permissions', async () => {
      // Create dedicated users for this test
      const studentId = `test-rbac-student-${uuidv4()}`;
      const student = await prisma.user.create({
        data: {
          id: studentId,
          email: generateUniqueEmail('test-rbac-student'),
          name: generateUniqueName('Test RBAC Student'),
          role: UserRole.STUDENT
        }
      });
      
      const adminId = `test-rbac-admin-${uuidv4()}`;
      const admin = await prisma.user.create({
        data: {
          id: adminId,
          email: generateUniqueEmail('test-rbac-admin'),
          name: generateUniqueName('Test RBAC Admin'),
          role: UserRole.ADMIN
        }
      });
      
      // Simulate access control check for admin-only resource
      const canStudentAccess = student.role === UserRole.ADMIN;
      const canAdminAccess = admin.role === UserRole.ADMIN;
      
      expect(canStudentAccess).toBe(false);
      expect(canAdminAccess).toBe(true);
      
      // Simulate access control check for instructor/admin resource
      const canStudentAccessInstructorResource = 
        student.role === UserRole.INSTRUCTOR || student.role === UserRole.ADMIN;
      const canAdminAccessInstructorResource = 
        admin.role === UserRole.INSTRUCTOR || admin.role === UserRole.ADMIN;
      
      expect(canStudentAccessInstructorResource).toBe(false);
      expect(canAdminAccessInstructorResource).toBe(true);
      
      // Clean up
      await prisma.user.deleteMany({
        where: {
          id: {
            in: [studentId, adminId]
          }
        }
      });
    });
  });
}); 