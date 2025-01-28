import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { ChallengeType, Challenges } from '@prisma/client';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Fetch all challenge types with their challenges
    const challengeTypes = await prisma.challengeType.findMany({
      include: {
        challenges: true,
      },
    });

    // Transform the data into the required format
    const groupedChallenges = challengeTypes.reduce((acc: Record<string, any[]>, type: ChallengeType & { challenges: Challenges[] }) => {
      acc[type.name] = type.challenges.map(challenge => ({
        id: challenge.id,
        name: challenge.name,
        image: challenge.challengeImage,
      }));
      return acc;
    }, {});

    return NextResponse.json(groupedChallenges);
  } catch (error) {
    console.error('Error fetching challenges:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
