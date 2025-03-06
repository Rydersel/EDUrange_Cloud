import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { validateAndSanitize, validationSchemas } from '@/lib/validation';
import { ActivityLogger, ActivityEventType } from '@/lib/activity-logger';
import rateLimit from '@/lib/rate-limit';
import { NextRequest } from 'next/server';

// Create a rate limiter for competition operations
const competitionRateLimiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  limit: 20, // 20 requests per minute
});

const competitionSchema = z.object({
  name: validationSchemas.competitionName || z.string().min(1, 'Name is required'),
  description: validationSchemas.competitionDescription || z.string().min(1, 'Description is required'),
  startDate: z.date(),
  endDate: z.date().optional().nullable(),
  accessCodeFormat: z.enum(['random', 'custom']),
  codeExpiration: z.enum(['never', '24h', '7d', 'custom']),
  challenges: z.array(z.object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
    points: z.number(),
    customPoints: z.number().optional(),
  })),
});

export async function POST(req: NextRequest) {
  try {
    // Apply rate limiting
    const rateLimitResult = await competitionRateLimiter.check(req);
    if (rateLimitResult) return rateLimitResult;
    
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const json = await req.json();
    
    // First parse with Zod directly to handle date transformations
    const parsedData = competitionSchema.parse(json);
    
    // Then use validateAndSanitize for sanitization
    const validationResult = validateAndSanitize(z.object({
      name: z.string(),
      description: z.string(),
      startDate: z.date(),
      endDate: z.date().optional().nullable(),
      accessCodeFormat: z.enum(['random', 'custom']),
      codeExpiration: z.enum(['never', '24h', '7d', 'custom']),
      challenges: z.array(z.object({
        id: z.string(),
        name: z.string(),
        type: z.string(),
        points: z.number(),
        customPoints: z.number().optional(),
      })),
    }), parsedData);
    
    if (!validationResult.success) {
      return NextResponse.json({ 
        success: false, 
        error: validationResult.error 
      }, { status: 400 });
    }
    
    const body = validationResult.data;

    const competition = await prisma.competitionGroup.create({
      data: {
        name: body.name,
        description: body.description,
        startDate: body.startDate,
        endDate: body.endDate,
        challenges: {
          create: body.challenges.map((challenge, index) => ({
            challengeId: challenge.id,
            points: challenge.customPoints || challenge.points,
            order: index,
          })),
        },
      },
    });

    // Log competition creation
    await ActivityLogger.logGroupEvent(
      ActivityEventType.GROUP_CREATED,
      session.user.id,
      competition.id,
      {
        name: competition.name,
        description: competition.description,
        startDate: competition.startDate.toISOString(),
        endDate: competition.endDate?.toISOString() || null,
        challengeCount: body.challenges.length,
        createdAt: new Date().toISOString()
      }
    );

    // Generate access code based on format
    const accessCode = body.accessCodeFormat === 'random' 
      ? Math.random().toString(36).substring(2, 8).toUpperCase()
      : null;

    if (accessCode) {
      const createdAccessCode = await prisma.competitionAccessCode.create({
        data: {
          code: accessCode,
          groupId: competition.id,
          createdBy: session.user.id,
          expiresAt: body.codeExpiration === '24h' 
            ? new Date(Date.now() + 24 * 60 * 60 * 1000)
            : body.codeExpiration === '7d'
            ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
            : null,
        },
      });

      // Log access code generation
      await ActivityLogger.logAccessCodeEvent(
        ActivityEventType.ACCESS_CODE_GENERATED,
        session.user.id,
        createdAccessCode.id,
        competition.id,
        {
          code: accessCode,
          expiresAt: createdAccessCode.expiresAt?.toISOString() || null,
          generatedAt: new Date().toISOString(),
          generationType: 'automatic',
          competitionName: competition.name
        }
      );
    }

    return NextResponse.json(competition);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ 
        success: false, 
        errors: error.errors 
      }, { status: 400 });
    }

    console.error('Error creating competition:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 