import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { ActivityLogger, ActivityEventType } from '@/lib/activity-logger';

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const { code } = await req.json();

    // Find valid access code
    const accessCode = await prisma.competitionAccessCode.findFirst({
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
    const existingMember = await prisma.competitionGroup.findFirst({
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
    await prisma.competitionGroup.update({
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

    // Increment the usedCount of the access code
    await prisma.competitionAccessCode.update({
      where: { id: accessCode.id },
      data: { usedCount: { increment: 1 } }
    });

    // Log the access code usage
    await ActivityLogger.logAccessCodeEvent(
      ActivityEventType.ACCESS_CODE_USED,
      session.user.id,
      accessCode.id,
      accessCode.groupId,
      {
        code: accessCode.code,
        timestamp: new Date().toISOString()
      }
    );

    // Log the group join event
    await ActivityLogger.logGroupEvent(
      ActivityEventType.GROUP_JOINED,
      session.user.id,
      accessCode.groupId,
      {
        groupName: accessCode.group.name,
        joinMethod: 'access_code',
        timestamp: new Date().toISOString()
      }
    );

    return NextResponse.json({
      message: 'Successfully joined competition',
      competition: accessCode.group
    });
  } catch (error) {
    console.error('Error joining competition:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 