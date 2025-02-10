import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ActivityLogger } from '@/lib/activity-logger';
import { ActivityEventType } from '@prisma/client';

export async function DELETE(
  req: Request,
  { params }: { params: { id: string; userId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Get the group and check permissions
    const group = await prisma.competitionGroup.findUnique({
      where: { id: params.id },
      include: {
        instructors: {
          select: { id: true }
        }
      }
    });

    if (!group) {
      return new NextResponse('Group not found', { status: 404 });
    }

    const isInstructor = group.instructors.some(i => i.id === session.user.id);
    const isSelfRemoval = session.user.id === params.userId;

    // Only allow instructors to remove others, or users to remove themselves
    if (!isInstructor && !isSelfRemoval) {
      return new NextResponse('Unauthorized', { status: 403 });
    }

    // Remove the user from the group
    await prisma.competitionGroup.update({
      where: { id: params.id },
      data: {
        members: {
          disconnect: { id: params.userId }
        }
      }
    });

    // Log the event
    if (isSelfRemoval) {
      await ActivityLogger.logGroupEvent(
        ActivityEventType.GROUP_LEFT,
        params.userId,
        params.id,
        {
          groupName: group.name
        }
      );
    } else {
      await ActivityLogger.logGroupEvent(
        ActivityEventType.GROUP_MEMBER_REMOVED,
        params.userId,
        params.id,
        {
          removedBy: session.user.id,
          groupName: group.name
        }
      );
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('Error removing user from group:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 