import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

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
    const accessCode = await prisma.$transaction(async (tx) => {
      const result = await tx.$queryRaw`
        INSERT INTO "CompetitionAccessCode" (id, code, "groupId", "createdBy", "expiresAt", "createdAt")
        VALUES (
          gen_random_uuid(),
          ${generateAccessCode()},
          ${params.id},
          ${session.user.id},
          ${expiresAt ? new Date(expiresAt) : null},
          NOW()
        )
        RETURNING *
      `;
      return (result as any[])[0];
    });

    return NextResponse.json(accessCode);
  } catch (error) {
    console.error('Error generating access code:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
