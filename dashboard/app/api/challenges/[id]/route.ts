import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ActivityLogger, ActivityEventType } from '@/lib/activity-logger';

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const challenge = await prisma.challenges.findUnique({
      where: { id: params.id },
      include: {
        challengeType: true,
        questions: true
      }
    });

    if (!challenge) {
      return new NextResponse('Challenge not found', { status: 404 });
    }

    // Log challenge start event
    await ActivityLogger.logChallengeEvent(
      ActivityEventType.CHALLENGE_STARTED,
      session.user.id,
      challenge.id,
      undefined,
      {
        challengeName: challenge.name,
        challengeType: challenge.challengeType.name,
        startTime: new Date().toISOString()
      }
    );

    // Log challenge instance creation
    await ActivityLogger.logChallengeEvent(
      ActivityEventType.CHALLENGE_INSTANCE_CREATED,
      session.user.id,
      params.id,
      undefined,
      {
        competitionId: undefined,
        challengeImage: challenge.challengeImage,
        challengeUrl: undefined,
        creationTime: new Date().toISOString()
      }
    );

    return NextResponse.json(challenge);
  } catch (error) {
    console.error('Error fetching challenge:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 