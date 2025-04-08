import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ActivityLogger, ActivityEventType } from '@/lib/activity-logger';

export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Check if the challenge ID is valid
    if (!params.id) {
      return NextResponse.json({ error: 'Challenge ID is required' }, { status: 400 });
    }

    const challenge = await prisma.challenge.findUnique({
      where: { id: params.id },
      include: {
        challengeType: true,
        questions: true
      }
    });

    if (!challenge) {
      return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
    }

    // Log challenge start event
    try {
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
          challengeId: challenge.id,
          challengeUrl: undefined,
          creationTime: new Date().toISOString()
        }
      );
    } catch (logError) {
      console.error('Error logging challenge events:', logError);
      // Continue even if logging fails
    }

    return NextResponse.json(challenge);
  } catch (error) {
    console.error('Error fetching challenge:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
} 