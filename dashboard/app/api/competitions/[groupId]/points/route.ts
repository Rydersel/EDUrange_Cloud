import { NextResponse, NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import rateLimit from '@/lib/rate-limit';
import { validateAndSanitize, validationSchemas } from '@/lib/validation';

// Create a rate limiter for competition points operations
const pointsRateLimiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  limit: 30, // 30 requests per minute
});

// Schema for validating points update request
const pointsUpdateSchema = z.object({
  userId: validationSchemas.id.describe('User ID to update points for'),
  points: z.number().int().min(0, 'Points must be a non-negative integer'),
});

// Schema for validating URL parameters
const paramsSchema = z.object({
  groupId: validationSchemas.id.describe('Competition group ID'),
});

// Schema for validating query parameters
const querySchema = z.object({
  userId: validationSchemas.id.optional().describe('Filter points for a specific user'),
});

interface GroupPoints {
  id: string;
  points: number;
  userId: string;
  groupId: string;
  createdAt: Date;
  updatedAt: Date;
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
}

interface DbUser {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
}

export async function POST(req: NextRequest, props: { params: Promise<{ groupId: string }> }) {
  const params = await props.params;
  try {
    // Apply rate limiting
    const rateLimitResult = await pointsRateLimiter.check(req);
    if (rateLimitResult) return rateLimitResult;
    
    // Validate the groupId parameter
    const paramsValidation = validateAndSanitize(paramsSchema, params);
    if (!paramsValidation.success) {
      return NextResponse.json({ 
        success: false, 
        error: `Invalid parameters: ${paramsValidation.error}` 
      }, { status: 400 });
    }
    
    const session = await getServerSession(authOptions);
    const user = session?.user as DbUser | undefined;

    if (!user?.id) {
      return NextResponse.json({ 
        success: false, 
        error: 'Unauthorized' 
      }, { status: 401 });
    }

    // Validate and sanitize request body
    const json = await req.json();
    const validationResult = validateAndSanitize(pointsUpdateSchema, json);
    
    if (!validationResult.success) {
      return NextResponse.json({ 
        success: false, 
        error: `Validation error: ${validationResult.error}` 
      }, { status: 400 });
    }
    
    const { userId, points } = validationResult.data;

    // Check if user is an instructor of the group
    const group = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "CompetitionGroup"
      WHERE id = ${params.groupId}
      AND EXISTS (
        SELECT 1 FROM "_GroupInstructors"
        WHERE "A" = ${params.groupId}
        AND "B" = ${user.id}
      )
    `;

    if (!group?.length) {
      return NextResponse.json({ 
        success: false, 
        error: 'Unauthorized or group not found' 
      }, { status: 403 });
    }

    // Update or create points record
    const pointsResult = await prisma.$queryRaw<GroupPoints[]>`
      INSERT INTO "GroupPoints" ("userId", "groupId", points)
      VALUES (${userId}, ${params.groupId}, ${points})
      ON CONFLICT ("userId", "groupId")
      DO UPDATE SET points = ${points}
      RETURNING *
    `;

    return NextResponse.json({
      success: true,
      data: pointsResult[0]
    });
  } catch (error) {
    console.error('Error updating points:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Internal Server Error' 
    }, { status: 500 });
  }
}

export async function GET(req: NextRequest, props: { params: Promise<{ groupId: string }> }) {
  const params = await props.params;
  try {
    // Validate the groupId parameter
    const paramsValidation = validateAndSanitize(paramsSchema, params);
    if (!paramsValidation.success) {
      return NextResponse.json({ 
        success: false, 
        error: `Invalid parameters: ${paramsValidation.error}` 
      }, { status: 400 });
    }
    
    const session = await getServerSession(authOptions);
    const user = session?.user as DbUser | undefined;

    if (!user?.id) {
      return NextResponse.json({ 
        success: false, 
        error: 'Unauthorized' 
      }, { status: 401 });
    }

    const searchParams = new URL(req.url).searchParams;
    const userId = searchParams.get('userId');
    
    // If userId is provided, validate it
    if (userId) {
      const queryValidation = validateAndSanitize(querySchema, { userId });
      if (!queryValidation.success) {
        return NextResponse.json({ 
          success: false, 
          error: `Invalid query parameters: ${queryValidation.error}` 
        }, { status: 400 });
      }
      
      // Get points for a specific user
      const points = await prisma.$queryRaw<GroupPoints[]>`
        SELECT gp.*, 
               json_build_object(
                 'id', u.id,
                 'name', u.name,
                 'email', u.email,
                 'image', u.image
               ) as user
        FROM "GroupPoints" gp
        JOIN "User" u ON u.id = gp."userId"
        WHERE gp."groupId" = ${params.groupId}
        AND gp."userId" = ${userId}
      `;

      return NextResponse.json({
        success: true,
        data: points[0] || { points: 0 }
      });
    }

    // Get points for all users in the group
    const points = await prisma.$queryRaw<GroupPoints[]>`
      SELECT gp.*, 
             json_build_object(
               'id', u.id,
               'name', u.name,
               'email', u.email,
               'image', u.image
             ) as user
      FROM "GroupPoints" gp
      JOIN "User" u ON u.id = gp."userId"
      WHERE gp."groupId" = ${params.groupId}
      ORDER BY gp.points DESC
    `;

    return NextResponse.json({
      success: true,
      data: points
    });
  } catch (error) {
    console.error('Error fetching points:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Internal Server Error' 
    }, { status: 500 });
  }
} 