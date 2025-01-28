import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function DELETE(
  req: Request,
  { params }: { params: { id: string; code: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

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

    // Delete the access code
    await prisma.CompetitionAccessCode.delete({
      where: {
        code: params.code,
        groupId: params.id
      }
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('Error revoking access code:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 