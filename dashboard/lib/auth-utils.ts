import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { redirect } from 'next/navigation';

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
