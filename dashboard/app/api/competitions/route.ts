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
  startDate: z.union([
    z.date(),
    z.string().transform(str => new Date(str))
  ]),
  endDate: z.union([
    z.date(),
    z.string().transform(str => str ? new Date(str) : null),
    z.null()
  ]).optional().nullable(),
  accessCodeFormat: z.enum(['random', 'custom']),
  codeExpiration: z.enum(['never', '24h', '7d', 'custom']),
  challenges: z.array(z.object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
    points: z.number(),
    customPoints: z.number().optional(),
  })),
  instructorIds: z.array(z.string()).optional(),
  generateAccessCode: z.boolean().optional(),
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
    console.log('Received competition data:', JSON.stringify(json, null, 2));
    
    // Check if instructorIds is provided in the request
    if (json.instructorIds && !Array.isArray(json.instructorIds)) {
      return NextResponse.json({ 
        success: false, 
        error: { message: 'instructorIds must be an array' }
      }, { status: 400 });
    }
    
    // First parse with Zod directly to handle date transformations
    try {
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
        console.error('Validation failed:', validationResult.error);
        return NextResponse.json({ 
          success: false, 
          error: validationResult.error 
        }, { status: 400 });
      }
      
      const body = validationResult.data;

      // --- Use Prisma Transaction for atomicity --- 
      const competition = await prisma.$transaction(async (tx) => {
        const createdCompetition = await tx.competitionGroup.create({
          data: {
            name: body.name,
            description: body.description,
            startDate: body.startDate,
            endDate: body.endDate,
            // Link the creator as an instructor
            instructors: {
              connect: [{ id: session.user.id }]
            }
            // Challenges are created in the next step of the transaction
          },
        });

        // Create GroupChallenge records for selected challenges
        if (body.challenges && body.challenges.length > 0) {
          await tx.groupChallenge.createMany({
            data: body.challenges.map((challenge) => ({
              groupId: createdCompetition.id, // Link to the new competition
              challengeId: challenge.id,      // Link to the selected Challenge
              points: challenge.customPoints || challenge.points, // Use custom or default points
            })),
            skipDuplicates: true // Ignore if the same challenge is accidentally sent twice
          });
        }
        
        return createdCompetition; // Return the created competition from the transaction
      });
      // --- End Prisma Transaction --- 

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

      let createdAccessCode = null;
      if (accessCode) {
        createdAccessCode = await prisma.competitionAccessCode.create({
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

      // Return the competition data along with the access code if generated
      return NextResponse.json({
        ...competition,
        accessCode: accessCode
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error('Zod validation error:', JSON.stringify(error.format(), null, 2));
        return NextResponse.json({ 
          success: false, 
          errors: error.errors 
        }, { status: 400 });
      }
      throw error; // Re-throw other errors to be caught by the outer try-catch
    }
  } catch (error) {
    console.error('Error creating competition:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 