import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { z } from 'zod';

const competitionSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().min(1, 'Description is required'),
  startDate: z.date(),
  endDate: z.date().optional().nullable(),
  maxParticipants: z.number().min(0),
  accessCodeFormat: z.enum(['random', 'custom']),
  codeExpiration: z.enum(['never', '24h', '7d', 'custom']),
  requiresApproval: z.boolean(),
  challenges: z.array(z.object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
    points: z.number(),
    customPoints: z.number().optional(),
  })),
});

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const json = await req.json();
    const body = competitionSchema.parse(json);

    const competition = await db.competition.create({
      data: {
        name: body.name,
        description: body.description,
        startDate: body.startDate,
        endDate: body.endDate,
        maxParticipants: body.maxParticipants,
        accessCodeFormat: body.accessCodeFormat,
        codeExpiration: body.codeExpiration,
        requiresApproval: body.requiresApproval,
        createdById: session.user.id,
        challenges: {
          create: body.challenges.map((challenge, index) => ({
            challengeId: challenge.id,
            points: challenge.customPoints || challenge.points,
            order: index,
          })),
        },
      },
    });

    // Generate access code based on format
    const accessCode = body.accessCodeFormat === 'random' 
      ? Math.random().toString(36).substring(2, 8).toUpperCase()
      : null;

    if (accessCode) {
      await db.competitionAccessCode.create({
        data: {
          code: accessCode,
          competitionId: competition.id,
          expiresAt: body.codeExpiration === '24h' 
            ? new Date(Date.now() + 24 * 60 * 60 * 1000)
            : body.codeExpiration === '7d'
            ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
            : null,
        },
      });
    }

    return NextResponse.json(competition);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return new NextResponse(JSON.stringify(error.errors), { status: 400 });
    }

    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 