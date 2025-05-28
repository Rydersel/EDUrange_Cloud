import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { CompetitionGroup } from '@prisma/client';

// We need to define a custom type that matches what we're getting from Prisma
type CompetitionWithRelations = CompetitionGroup & {
  members: Array<{
    id: string;
    name: string | null;
    image: string | null;
  }>;
  challenges: Array<{
    completions: Array<{
      userId: string;
      createdAt: Date | null;
    }>;
    questionCompletions: Array<{
      userId: string;
      createdAt: Date | null;
    }>;
  }>;
};

export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Check if competition exists and user is authorized to view it
    const competition = await prisma.competitionGroup.findFirst({
      where: {
        id: params.id,
        OR: [
          {
            members: {
              some: {
                id: session.user.id
              }
            }
          },
          {
            instructors: {
              some: {
                id: session.user.id
              }
            }
          }
        ]
      },
      include: {
        members: {
          select: {
            id: true,
            name: true,
            image: true,
          }
        },
        challenges: {
          include: {
            completions: true, // This will include all fields, including userId and createdAt
            questionCompletions: true // This will include all fields, including userId and createdAt
          }
        }
      }
    }) as unknown as CompetitionWithRelations; // Using unknown as intermediate step to safely cast

    if (!competition) {
      return new NextResponse('Competition not found or unauthorized', { status: 404 });
    }

    // Get the points for each member in this competition
    const groupPoints = await prisma.groupPoints.findMany({
      where: {
        groupId: params.id,
        userId: {
          in: competition.members.map(m => m.id)
        }
      },
      select: {
        userId: true,
        points: true
      }
    });

    // Get the most recent activity for each member (for last active date)
    const latestActivities = new Map<string, string>();
    
    // Process challenge completions and question completions to find the most recent activity
    competition.challenges.forEach(challenge => {
      // Process challenge completions
      challenge.completions.forEach(completion => {
        // Check if completion, userId, and createdAt are defined before using them
        if (completion && completion.userId && completion.createdAt) {
          const currentLatest = latestActivities.get(completion.userId);
          if (!currentLatest || new Date(completion.createdAt) > new Date(currentLatest)) {
            latestActivities.set(completion.userId, completion.createdAt.toISOString());
          }
        }
      });
      
      // Process question completions
      challenge.questionCompletions.forEach(completion => {
        // Check if completion, userId, and createdAt are defined before using them
        if (completion && completion.userId && completion.createdAt) {
          const currentLatest = latestActivities.get(completion.userId);
          if (!currentLatest || new Date(completion.createdAt) > new Date(currentLatest)) {
            latestActivities.set(completion.userId, completion.createdAt.toISOString());
          }
        }
      });
    });

    // Calculate solved challenges count for each member
    const solvedChallengesByUser = new Map<string, number>();
    
    competition.challenges.forEach(challenge => {
      // Get all unique user IDs from completions
      const completedUsers = new Set<string>();
      challenge.completions.forEach(completion => {
        if (completion && completion.userId) {
          completedUsers.add(completion.userId);
        }
      });
      
      // Increment solved count for each user
      completedUsers.forEach(userId => {
        solvedChallengesByUser.set(
          userId, 
          (solvedChallengesByUser.get(userId) || 0) + 1
        );
      });
    });

    // Create leaderboard data with sorting by points
    const leaderboardData = competition.members.map(member => {
      const pointsRecord = groupPoints.find(gp => gp.userId === member.id);
      return {
        id: member.id,
        username: member.name || 'Anonymous User',
        score: pointsRecord?.points || 0,
        solvedChallenges: solvedChallengesByUser.get(member.id) || 0,
        lastActive: latestActivities.get(member.id) || competition.createdAt.toISOString()
      };
    });

    // Sort by score in descending order
    leaderboardData.sort((a, b) => b.score - a.score);
    
    // Add rank based on sorted order
    const leaderboard = leaderboardData.map((entry, index) => ({
      ...entry,
      rank: index + 1
    }));

    return NextResponse.json(leaderboard);
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 