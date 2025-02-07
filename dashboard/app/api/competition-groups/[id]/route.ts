import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const competition = await prisma.competitionGroup.findUnique({
      where: {
        id: params.id,
      },
      include: {
        _count: {
          select: {
            members: true,
            challenges: true,
          }
        },
        challenges: {
          include: {
            challenge: {
              include: {
                challengeType: true,
                appConfigs: true
              }
            },
            completions: {
              where: {
                userId: session.user.id
              }
            }
          }
        },
        members: {
          where: {
            id: session.user.id
          },
          include: {
            groupPoints: {
              where: {
                groupId: params.id
              }
            }
          }
        }
      },
    });

    if (!competition) {
      return new NextResponse('Competition not found', { status: 404 });
    }

    // Check if user is a member of this competition
    const isMember = competition.members.length > 0;
    if (!isMember) {
      return new NextResponse('Unauthorized', { status: 403 });
    }

    // Calculate total points and user points
    const totalPoints = competition.challenges.reduce((sum, c) => sum + (c.points || 0), 0);
    const userPoints = competition.members[0]?.groupPoints[0]?.points || 0;

    // Format challenges data
    const challenges = competition.challenges.map(c => ({
      id: c.challenge.id,
      name: c.challenge.name,
      difficulty: c.challenge.difficulty,
      AppsConfig: c.challenge.appConfigs,
      points: c.points,
      completed: c.completions.length > 0,
      challengeType: c.challenge.challengeType
    }));

    return NextResponse.json({
      id: competition.id,
      name: competition.name,
      description: competition.description,
      startDate: competition.startDate,
      endDate: competition.endDate,
      _count: competition._count,
      challenges,
      userPoints,
      totalPoints
    });
  } catch (error) {
    console.error('Error fetching competition:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
