import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ActivityLogger, ActivityEventType } from '@/lib/activity-logger';
import { UserRole } from '@prisma/client';
import { z } from 'zod';
import { validateAndSanitize } from '@/lib/validation';
import rateLimit from '@/lib/rate-limit';
import { NextRequest } from 'next/server';

// Create a rate limiter for user role operations
const userRoleRateLimiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  limit: 15, // 15 requests per minute
});

const roleUpdateSchema = z.object({
  role: z.enum(['ADMIN', 'INSTRUCTOR', 'STUDENT'])
});

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    // Apply rate limiting
    const rateLimitResult = await userRoleRateLimiter.check(req);
    if (rateLimitResult) return rateLimitResult;
    
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'ADMIN') {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const body = await req.json();
    
    // Validate and sanitize input
    const validationResult = validateAndSanitize(roleUpdateSchema, body);
    
    if (!validationResult.success) {
      return NextResponse.json({ 
        success: false, 
        error: validationResult.error 
      }, { status: 400 });
    }
    
    const { role } = validationResult.data;

    // Get the user's current role before updating
    const currentUser = await prisma.user.findUnique({
      where: { id: params.id },
      select: { role: true }
    });

    if (!currentUser) {
      return new NextResponse('User not found', { status: 404 });
    }

    // Update the user's role
    const updatedUser = await prisma.user.update({
      where: { id: params.id },
      data: { role },
      select: {
        id: true,
        name: true,
        email: true,
        role: true
      }
    });

    // Log the role change
    await ActivityLogger.logUserEvent(
      ActivityEventType.USER_ROLE_CHANGED,
      params.id,
      {
        changedBy: session.user.id,
        oldRole: currentUser.role,
        newRole: role,
        timestamp: new Date().toISOString()
      }
    );

    return NextResponse.json(updatedUser);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ 
        success: false, 
        errors: error.errors 
      }, { status: 400 });
    }
    console.error('Error updating user role:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 