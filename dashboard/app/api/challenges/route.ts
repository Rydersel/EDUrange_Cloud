import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { Challenges, ChallengeType } from '@prisma/client';

type ChallengeWithType = Challenges & {
  challengeType: ChallengeType;
};

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Fetch all challenges with their types
    const challenges = await prisma.challenges.findMany({
      include: {
        challengeType: true,
      },
    });

    // Transform the data into the required format
    const formattedChallenges = challenges.map((challenge: ChallengeWithType) => ({
      id: challenge.id,
      name: challenge.name,
      challengeImage: challenge.challengeImage,
      challengeType: challenge.challengeType,
      description: challenge.description || '',
      difficulty: challenge.difficulty,
      AppsConfig: challenge.AppsConfig,
    }));

    return NextResponse.json(formattedChallenges);
  } catch (error) {
    console.error('Error fetching challenges:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
