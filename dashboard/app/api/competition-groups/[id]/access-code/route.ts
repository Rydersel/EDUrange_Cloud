import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { ActivityLogger } from '@/lib/activity-logger';
import { ActivityEventType } from '@prisma/client';

function generateAccessCode(): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const length = 8;
  return Array.from({ length }, () => characters[Math.floor(Math.random() * characters.length)]).join('');
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const body = await req.json();
    const { expiresAt } = body;

    // Check if user is an instructor or admin for this competition
    const competition = await prisma.$transaction(async (tx) => {
      const result = await tx.$queryRaw`
        SELECT * FROM "CompetitionGroup"
        WHERE id = ${params.id}
        AND EXISTS (
          SELECT 1 FROM "_GroupInstructors"
          WHERE "A" = "CompetitionGroup".id
          AND "B" = ${session.user.id}
        )
        LIMIT 1
      `;
      return result as any[];
    });

    if (!competition || competition.length === 0) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    // Generate and save new access code
    const code = generateAccessCode();
    const accessCode = await prisma.competitionAccessCode.create({
      data: {
        code,
        groupId: params.id,
        createdBy: session.user.id,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
      include: {
        group: true
      }
    });

    // Log access code generation
    await ActivityLogger.logAccessCodeEvent(
      ActivityEventType.ACCESS_CODE_GENERATED,
      session.user.id,
      accessCode.id,
      params.id,
      {
        code: code,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        groupName: accessCode.group.name,
        generatedAt: new Date().toISOString()
      }
    );

    return NextResponse.json(accessCode);
  } catch (error) {
    console.error('Error generating access code:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
