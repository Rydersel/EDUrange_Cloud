import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { Session } from 'next-auth';
import { z } from 'zod';
import { validateAndSanitize, validationSchemas } from '@/lib/validation';
import { extractChallengePoints } from '@/lib/utils';
import { ActivityLogger, ActivityEventType } from '@/lib/activity-logger';
import rateLimit from '@/lib/rate-limit';
import { NextRequest } from 'next/server';

// Create a rate limiter for competition group operations
const competitionGroupRateLimiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  limit: 20, // 20 requests per minute
});

interface CustomSession extends Session {
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    role: 'STUDENT' | 'INSTRUCTOR' | 'ADMIN';
  }
}

// Validation schema for the request body
const createGroupSchema = z.object({
  name: validationSchemas.competitionName || z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  startDate: z.string().transform(str => new Date(str)),
  endDate: z.string().nullable().optional().transform(str => str ? new Date(str) : null),
  challengeIds: z.array(z.string()),
  instructorIds: z.array(z.string()),
  generateAccessCode: z.boolean(),
});

// Define the expected output type of the schema
type CreateGroupInput = z.infer<typeof createGroupSchema>;

function generateAccessCode(): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const length = Math.floor(Math.random() * 6) + 5; // Random length between 5-10
  return Array.from({ length }, () => characters[Math.floor(Math.random() * characters.length)]).join('');
}

export async function POST(request: NextRequest) {
  try {
    // Apply rate limiting
    const rateLimitResult = await competitionGroupRateLimiter.check(request);
    if (rateLimitResult) return rateLimitResult;
    
    const session = await getServerSession(authOptions) as CustomSession | null;
    
    if (!session?.user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Only allow instructors and admins to create groups
    if (session.user.role !== 'INSTRUCTOR' && session.user.role !== 'ADMIN') {
      return new NextResponse('Forbidden', { status: 403 });
    }

    const body = await request.json();
    
    // Use try-catch to handle validation errors
    try {
      // First parse with Zod directly to handle transformations
      const parsedData = createGroupSchema.parse(body);
      
      // Then use validateAndSanitize for sanitization
      const validationResult = validateAndSanitize(z.object({
        name: z.string(),
        description: z.string().optional(),
        startDate: z.date(),
        endDate: z.date().nullable().optional(),
        challengeIds: z.array(z.string()),
        instructorIds: z.array(z.string()),
        generateAccessCode: z.boolean(),
      }), parsedData);
      
      if (!validationResult.success) {
        return NextResponse.json({ 
          success: false, 
          error: validationResult.error 
        }, { status: 400 });
      }
      
      const validatedData = validationResult.data;

      // Get all challenges to extract points
      const challenges = await prisma.challenge.findMany({
        where: {
          id: {
            in: validatedData.challengeIds
          }
        },
        select: {
          id: true,
          appConfigs: true
        }
      });

      // Create the competition group
      const group = await prisma.competitionGroup.create({
        data: {
          name: validatedData.name,
          description: validatedData.description,
          startDate: validatedData.startDate,
          endDate: validatedData.endDate,
          instructors: {
            connect: validatedData.instructorIds.map(id => ({ id })),
          },
        },
      });

      // Log group creation
      await ActivityLogger.logGroupEvent(
        ActivityEventType.GROUP_CREATED,
        session.user.id,
        group.id,
        {
          groupName: group.name,
          description: group.description,
          startDate: group.startDate,
          endDate: group.endDate,
          timestamp: new Date().toISOString()
        }
      );

      // Add challenges to the group with points from appConfigs
      await prisma.groupChallenge.createMany({
        data: challenges.map((challenge: any) => ({
          challengeId: challenge.id,
          groupId: group.id,
          points: extractChallengePoints(challenge.appConfigs),
        })),
      });

      // Generate access code if requested
      if (validatedData.generateAccessCode) {
        const code = generateAccessCode();
        await prisma.competitionAccessCode.create({
          data: {
            code,
            groupId: group.id,
            createdBy: session.user.id,
          },
        });
        
        return NextResponse.json({ 
          success: true, 
          groupId: group.id,
          accessCode: code
        });
      }

      return NextResponse.json({ 
        success: true, 
        groupId: group.id 
      });
    } catch (validationError) {
      if (validationError instanceof z.ZodError) {
        return NextResponse.json({ 
          success: false, 
          errors: validationError.errors 
        }, { status: 400 });
      }
      throw validationError; // Re-throw if it's not a validation error
    }
  } catch (error) {
    console.error('Error creating competition group:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 
