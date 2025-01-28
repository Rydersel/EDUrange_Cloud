import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const { code } = await req.json();

    // Find valid access code
    const accessCode = await prisma.CompetitionAccessCode.findFirst({
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
    const existingMember = await prisma.CompetitionGroup.findFirst({
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
    await prisma.CompetitionGroup.update({
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

    return NextResponse.json({
      message: 'Successfully joined competition',
      competition: accessCode.group
    });
  } catch (error) {
    console.error('Error joining competition:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 