import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ActivityLogger } from '@/lib/activity-logger';
import { ActivityEventType } from '@prisma/client';

export async function POST(
  req: Request,
  { params }: { params: { id: string; userId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Check if the current user is an instructor for this competition
    const competition = await prisma.competitionGroup.findFirst({
      where: {
        id: params.id,
        instructors: {
          some: {
            id: session.user.id
          }
        }
      }
    });

    if (!competition) {
      return new NextResponse('Unauthorized - Only instructors can reset user progress', { status: 403 });
    }

    // Delete all challenge completions
    await prisma.challengeCompletion.deleteMany({
      where: {
        userId: params.userId,
        groupChallenge: {
          groupId: params.id
        }
      }
    });

    // Delete all question completions
    await prisma.questionCompletion.deleteMany({
      where: {
        userId: params.userId,
        groupChallenge: {
          groupId: params.id
        }
      }
    });

    // Reset user points
    await prisma.groupPoints.updateMany({
      where: {
        userId: params.userId,
        groupId: params.id
      },
      data: {
        points: 0
      }
    });

    // Log the reset event
    await ActivityLogger.logGroupEvent(
      ActivityEventType.GROUP_UPDATED,
      params.userId,
      params.id,
      {
        action: 'progress_reset',
        resetBy: session.user.id,
        resetTime: new Date().toISOString(),
        groupName: competition.name
      }
    );

    return NextResponse.json({ message: 'User progress reset successfully' });
  } catch (error) {
    console.error('Error resetting user progress:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 