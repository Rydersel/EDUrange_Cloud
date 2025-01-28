import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { Session } from 'next-auth';
import { z } from 'zod';

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
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  startDate: z.string().transform(str => new Date(str)),
  endDate: z.string().optional().transform(str => str ? new Date(str) : undefined),
  challengeIds: z.array(z.string()),
  instructorIds: z.array(z.string()),
  generateAccessCode: z.boolean(),
});

function generateAccessCode(): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const length = Math.floor(Math.random() * 6) + 5; // Random length between 5-10
  return Array.from({ length }, () => characters[Math.floor(Math.random() * characters.length)]).join('');
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions) as CustomSession | null;
    
    if (!session?.user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Only allow instructors and admins to create groups
    if (session.user.role !== 'INSTRUCTOR' && session.user.role !== 'ADMIN') {
      return new NextResponse('Forbidden', { status: 403 });
    }

    const body = await request.json();
    const validatedData = createGroupSchema.parse(body);

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

    // Add challenges to the group
    await prisma.groupChallenge.createMany({
      data: validatedData.challengeIds.map(challengeId => ({
        challengeId,
        groupId: group.id,
        points: 0, // Points are now fixed per challenge
      })),
    });

    // Generate access code if requested
    if (validatedData.generateAccessCode) {
      await prisma.competitionAccessCode.create({
        data: {
          code: generateAccessCode(),
          groupId: group.id,
          createdBy: session.user.id,
        },
      });
    }

    return NextResponse.json({ 
      success: true, 
      groupId: group.id 
    });
  } catch (error) {
    console.error('Error creating competition group:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ 
        success: false, 
        errors: error.errors 
      }, { status: 400 });
    }
    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 