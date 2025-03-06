import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { ActivityLogger, ActivityEventType } from '@/lib/activity-logger';
import { z } from 'zod';
import { validateAndSanitize } from '@/lib/validation';
import rateLimit from '@/lib/rate-limit';
import { NextRequest } from 'next/server';

// Create a rate limiter for join operations
const joinRateLimiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  limit: 10, // 10 requests per minute
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
    
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return new NextResponse('Unauthorized', { status: 401 });
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

    // Find valid access code
    const accessCode = await prisma.competitionAccessCode.findFirst({
      where: {
        code,
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
      return new NextResponse('Invalid or expired access code', { status: 400 });
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
      return new NextResponse('You are already a member of this competition', { status: 400 });
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
    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 