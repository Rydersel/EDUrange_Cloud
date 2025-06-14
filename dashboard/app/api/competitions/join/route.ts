import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { ActivityLogger, ActivityEventType, LogSeverity } from '@/lib/activity-logger';
import { z } from 'zod';
import { validateAndSanitize } from '@/lib/validation';
import rateLimit from '@/lib/rate-limit';
import { NextRequest } from 'next/server';

// Create a rate limiter for join operations
const joinRateLimiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  limit: 15, 
});

// Define validation schema for join request
const joinSchema = z.object({
  code: z.string().min(1, 'Access code is required')
});

export async function POST(req: NextRequest) {
  try {
    // Apply rate limiting
    const rateLimitResult = await joinRateLimiter.check(req);
    if (rateLimitResult) return rateLimitResult;
    
    // Get user session - log session data for debugging
    const session = await getServerSession(authOptions);
    console.log('Session data for join request:', JSON.stringify(session, null, 2));
    
    // Check if user is authenticated
    if (!session || !session.user || !session.user.id) {
      console.error('Unauthorized access attempt - missing session or user data');
      return NextResponse.json({ 
        success: false, 
        error: 'Unauthorized access' 
      }, { status: 401 });
    }

    const body = await req.json();
    
    // Validate and sanitize input
    const validationResult = validateAndSanitize(joinSchema, body);
    
    if (!validationResult.success) {
      return NextResponse.json({ 
        success: false, 
        error: validationResult.error 
      }, { status: 400 });
    }
    
    const { code } = validationResult.data;
    
    // Convert the access code to uppercase to make it case-insensitive
    const normalizedCode = code.toUpperCase();

    // Find valid access code - only check if the code exists and is not expired
    // No role-based filtering to ensure all users can join with valid codes
    const accessCode = await prisma.competitionAccessCode.findFirst({
      where: {
        code: normalizedCode,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } }
        ]
      },
      include: {
        group: true
      }
    });

    if (!accessCode) {
      // Log the invalid access code attempt
      await ActivityLogger.logInvalidAccessCode(session.user.id, {
        code: code,
        attemptTimestamp: new Date().toISOString()
      });
      return NextResponse.json({ 
        success: false, 
        error: 'Invalid or expired access code' 
      }, { status: 400 });
    }

    // Check if user is already a member
    const existingMember = await prisma.competitionGroup.findFirst({
      where: {
        id: accessCode.groupId,
        members: {
          some: {
            id: session.user.id
          }
        }
      }
    });

    if (existingMember) {
      return NextResponse.json({ 
        success: false, 
        error: 'You are already a member of this competition',
        competitionId: existingMember.id
      }, { status: 400 });
    }

    // Add user to competition
    await prisma.competitionGroup.update({
      where: {
        id: accessCode.groupId
      },
      data: {
        members: {
          connect: {
            id: session.user.id
          }
        }
      }
    });

    // Increment the usedCount of the access code
    await prisma.competitionAccessCode.update({
      where: { id: accessCode.id },
      data: { usedCount: { increment: 1 } }
    });

    // Log the access code usage
    await ActivityLogger.logAccessCodeEvent(
      ActivityEventType.ACCESS_CODE_USED,
      session.user.id,
      accessCode.id,
      accessCode.groupId,
      {
        code: accessCode.code,
        timestamp: new Date().toISOString()
      }
    );

    // Log the group join event
    await ActivityLogger.logGroupEvent(
      ActivityEventType.GROUP_JOINED,
      session.user.id,
      accessCode.groupId,
      {
        groupName: accessCode.group.name,
        joinMethod: 'access_code',
        timestamp: new Date().toISOString()
      }
    );

    return NextResponse.json({
      success: true,
      message: 'Successfully joined competition',
      competition: accessCode.group
    });
  } catch (error) {
    console.error('Error joining competition:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ 
        success: false, 
        errors: error.errors 
      }, { status: 400 });
    }
    return NextResponse.json({ 
      success: false, 
      error: 'Internal Server Error' 
    }, { status: 500 });
  }
} 