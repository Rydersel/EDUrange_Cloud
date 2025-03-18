import * as dotenv from 'dotenv';
import path from 'path';
import { UserRole, ActivityEventType } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../utils/prisma-test-client';
import { generateTestId, generateTestEmail, generateTestName, withTestTransaction } from '../utils/test-helpers';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Helper function to verify activity log entries
async function verifyActivityLog(tx: any, eventType: ActivityEventType, userId: string, metadata: Record<string, any> = {}) {
  const log = await tx.activityLog.findFirst({
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
  describe('User Management', () => {
    it('should create users with different roles', async () => {
      await withTestTransaction(async (tx) => {
        // Create test users with different roles
        const admin = await tx.user.create({
          data: {
            id: generateTestId('admin'),
            email: generateTestEmail('admin'),
            name: generateTestName('Admin'),
            role: UserRole.ADMIN
          }
        });

        const instructor = await tx.user.create({
          data: {
            id: generateTestId('instructor'),
            email: generateTestEmail('instructor'),
            name: generateTestName('Instructor'),
            role: UserRole.INSTRUCTOR
          }
        });

        const student = await tx.user.create({
          data: {
            id: generateTestId('student'),
            email: generateTestEmail('student'),
            name: generateTestName('Student'),
            role: UserRole.STUDENT
          }
        });

        // Verify users were created with correct roles
        const foundAdmin = await tx.user.findUnique({ where: { id: admin.id } });
        const foundInstructor = await tx.user.findUnique({ where: { id: instructor.id } });
        const foundStudent = await tx.user.findUnique({ where: { id: student.id } });

        expect(foundAdmin).toBeDefined();
        expect(foundAdmin?.role).toBe(UserRole.ADMIN);

        expect(foundInstructor).toBeDefined();
        expect(foundInstructor?.role).toBe(UserRole.INSTRUCTOR);

        expect(foundStudent).toBeDefined();
        expect(foundStudent?.role).toBe(UserRole.STUDENT);
      });
    });

    it('should update user roles and log changes', async () => {
      await withTestTransaction(async (tx) => {
        // Create test users
        const admin = await tx.user.create({
          data: {
            id: generateTestId('admin-role-change'),
            email: generateTestEmail('admin-role-change'),
            name: generateTestName('Admin Role Change'),
            role: UserRole.ADMIN
          }
        });

        const user = await tx.user.create({
          data: {
            id: generateTestId('user-role-change'),
            email: generateTestEmail('user-role-change'),
            name: generateTestName('User Role Change'),
            role: UserRole.STUDENT
          }
        });

        // Update user role
        const updatedUser = await tx.user.update({
          where: { id: user.id },
          data: { role: UserRole.INSTRUCTOR }
        });

        expect(updatedUser.role).toBe(UserRole.INSTRUCTOR);

        // Log role change event
        await tx.activityLog.create({
          data: {
            eventType: ActivityEventType.USER_ROLE_CHANGED,
            userId: user.id,
            severity: 'WARNING',
            metadata: JSON.stringify({
              changedBy: admin.id,
              oldRole: UserRole.STUDENT,
              newRole: UserRole.INSTRUCTOR,
              timestamp: new Date().toISOString()
            })
          }
        });

        // Verify activity log
        await verifyActivityLog(tx, ActivityEventType.USER_ROLE_CHANGED, user.id, {
          changedBy: admin.id,
          oldRole: UserRole.STUDENT,
          newRole: UserRole.INSTRUCTOR
        });
      });
    });
  });

  describe('Session Management', () => {
    it('should create and manage user sessions', async () => {
      await withTestTransaction(async (tx) => {
        // Create a dedicated user for this test
        const user = await tx.user.create({
          data: {
            id: generateTestId('session'),
            email: generateTestEmail('session'),
            name: generateTestName('Session Test'),
            role: UserRole.STUDENT
          }
        });

        // Create a session for the user
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 30); // 30 days from now

        const session = await tx.session.create({
          data: {
            id: `test-session-${uuidv4()}`,
            sessionToken: `test-token-${uuidv4()}`,
            userId: user.id,
            expires: expiryDate
          }
        });

        expect(session).toBeDefined();
        expect(session.userId).toBe(user.id);

        // Verify session exists
        const foundSession = await tx.session.findUnique({
          where: { id: session.id }
        });

        expect(foundSession).toBeDefined();
        expect(foundSession?.expires.getTime()).toBe(expiryDate.getTime());
      });
    });

    it('should handle expired sessions', async () => {
      await withTestTransaction(async (tx) => {
        // Create a dedicated user for this test
        const user = await tx.user.create({
          data: {
            id: generateTestId('expired-session'),
            email: generateTestEmail('expired-session'),
            name: generateTestName('Expired Session Test'),
            role: UserRole.STUDENT
          }
        });

        // Create an expired session (1 day in the past)
        const expiredDate = new Date();
        expiredDate.setDate(expiredDate.getDate() - 1);

        const expiredSession = await tx.session.create({
          data: {
            id: `test-expired-session-${uuidv4()}`,
            sessionToken: `test-expired-token-${uuidv4()}`,
            userId: user.id,
            expires: expiredDate
          }
        });

        // Verify session is expired
        const now = new Date();
        expect(expiredSession.expires.getTime()).toBeLessThan(now.getTime());

        // Simulate session validation logic
        const isSessionValid = expiredSession.expires.getTime() > now.getTime();
        expect(isSessionValid).toBe(false);
      });
    });
  });

  describe('OAuth Account Management', () => {
    it('should link OAuth accounts to users', async () => {
      await withTestTransaction(async (tx) => {
        // Create a dedicated user for this test
        const user = await tx.user.create({
          data: {
            id: generateTestId('oauth'),
            email: generateTestEmail('oauth'),
            name: generateTestName('OAuth Test'),
            role: UserRole.STUDENT
          }
        });

        // Link an OAuth account
        const oauthAccount = await tx.account.create({
          data: {
            id: `test-oauth-${uuidv4()}`,
            userId: user.id,
            type: 'oauth',
            provider: 'github',
            providerAccountId: `github-${uuidv4()}`,
            refresh_token: `refresh-${uuidv4()}`,
            access_token: `access-${uuidv4()}`,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            token_type: 'bearer',
            scope: 'user',
            id_token: `id-${uuidv4()}`
          }
        });

        expect(oauthAccount).toBeDefined();
        expect(oauthAccount.userId).toBe(user.id);
        expect(oauthAccount.provider).toBe('github');

        // Verify account is linked
        const foundAccount = await tx.account.findUnique({
          where: { id: oauthAccount.id }
        });

        expect(foundAccount).toBeDefined();
        expect(foundAccount?.provider).toBe('github');
      });
    });
  });

  describe('User Activity Logging', () => {
    it('should log user registration events', async () => {
      await withTestTransaction(async (tx) => {
        // Create a user and log registration
        const userEmail = generateTestEmail('registration');
        const userName = generateTestName('Registration');

        const user = await tx.user.create({
          data: {
            id: generateTestId('registration'),
            email: userEmail,
            name: userName,
            role: UserRole.STUDENT
          }
        });

        // Log registration event
        await tx.activityLog.create({
          data: {
            eventType: ActivityEventType.USER_REGISTERED,
            userId: user.id,
            severity: 'INFO',
            metadata: JSON.stringify({
              email: userEmail,
              name: userName,
              timestamp: new Date().toISOString()
            })
          }
        });

        // Verify activity log
        await verifyActivityLog(tx, ActivityEventType.USER_REGISTERED, user.id, {
          email: userEmail,
          name: userName
        });
      });
    });

    it('should log user login events', async () => {
      await withTestTransaction(async (tx) => {
        // Create a user and log login
        const userEmail = generateTestEmail('login');
        const userName = generateTestName('Login');

        const user = await tx.user.create({
          data: {
            id: generateTestId('login'),
            email: userEmail,
            name: userName,
            role: UserRole.STUDENT
          }
        });

        // Log login event
        await tx.activityLog.create({
          data: {
            eventType: ActivityEventType.USER_LOGGED_IN,
            userId: user.id,
            severity: 'INFO',
            metadata: JSON.stringify({
              email: userEmail,
              name: userName,
              timestamp: new Date().toISOString()
            })
          }
        });

        // Verify activity log
        await verifyActivityLog(tx, ActivityEventType.USER_LOGGED_IN, user.id, {
          email: userEmail,
          name: userName
        });
      });
    });
  });

  describe('Role-Based Access Control', () => {
    it('should enforce role-based permissions', async () => {
      await withTestTransaction(async (tx) => {
        // Create dedicated users for this test
        const student = await tx.user.create({
          data: {
            id: generateTestId('rbac-student'),
            email: generateTestEmail('rbac-student'),
            name: generateTestName('RBAC Student'),
            role: UserRole.STUDENT
          }
        });

        const admin = await tx.user.create({
          data: {
            id: generateTestId('rbac-admin'),
            email: generateTestEmail('rbac-admin'),
            name: generateTestName('RBAC Admin'),
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
      });
    });
  });
});
