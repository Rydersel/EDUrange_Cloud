import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { createErrorResponse } from '@/lib/utils';
import { User } from '@prisma/client';
import { Session } from 'next-auth';

/**
 * Checks if the current user is an admin
 * @returns Object containing isAdmin boolean and user data
 */
export async function checkIsAdmin() {
  const session = await getServerSession(authOptions);

  if (!session) {
    return { isAdmin: false, user: null, session: null };
  }

  // With JWT strategy, we can get the role directly from the session
  const isAdmin = session.user.role === 'ADMIN';

  return { isAdmin, user: session.user, session };
}

/**
 * Middleware to check if the current user is an admin in API routes
 * @param req NextRequest object
 * @returns NextResponse if user is not admin, null if user is admin
 */
export async function requireAdmin(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // With JWT strategy, we can get the role directly from the session
  if (session.user.role !== 'ADMIN') {
    redirect('/invalid-permission');
  }

  return null; // Return null if user is admin (no error response)
}

/**
 * Server component function to require admin access
 * Redirects to home page if user is not admin
 * @returns The user object if admin, otherwise redirects
 */
export async function requireAdminAccess() {
  const { isAdmin, user, session } = await checkIsAdmin();

  if (!session) {
    redirect('/');
  }

  if (!isAdmin) {
    redirect('/invalid-permission');
  }

  return user;
}

/**
 * Used in API routes to require a valid user session
 * @returns Object containing session, authorized status, and error response if not authorized
 */
export async function requireUser() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return {
      session: null,
      authorized: false,
      error: createErrorResponse('Unauthorized', 401)
    };
  }

  return {
    session,
    authorized: true,
    error: null
  };
}

/**
 * Checks if a user has authorization to perform actions on a challenge instance
 * Authorization is granted if:
 * 1. User owns the instance (own challenges)
 * 2. User is an instructor for the competition (instructor permission)
 * 3. User is an admin (global permission)
 * 
 * @param instanceId The ID of the challenge instance to check
 * @param session The user's session from getServerSession
 * @returns Object containing authorized status and error response if not authorized
 */
export async function authorizeProxyAction(
  instanceId: string,
  session: Session | null
): Promise<{ authorized: boolean; error?: NextResponse; instance?: any }> {
  // Check authentication
  if (!session?.user) {
    return { 
      authorized: false, 
      error: createErrorResponse('Unauthorized', 401) 
    };
  }

  // Get instance details to verify authorization
  const instance = await prisma.challengeInstance.findFirst({
    where: { id: instanceId },
    include: {
      user: true,
      competition: {
        include: {
          instructors: true
        }
      }
    }
  });

  if (!instance) {
    return {
      authorized: false,
      error: createErrorResponse('Challenge instance not found', 404)
    };
  }

  // Verify user has permission to terminate this instance
  const authenticatedUserId = session.user.id;
  const isInstructor = instance.competition?.instructors?.some(
    (instructor: User) => instructor.id === authenticatedUserId
  ) || false;
  const isAdmin = session.user.role === 'ADMIN';

  if (instance.userId !== authenticatedUserId && !isInstructor && !isAdmin) {
    return {
      authorized: false,
      error: createErrorResponse('Not authorized to perform this action on the instance', 403)
    };
  }

  // User is authorized
  return { 
    authorized: true,
    instance 
  };
}
