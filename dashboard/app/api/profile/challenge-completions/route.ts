import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import authConfig from '@/auth.config';
import { prisma } from '@/lib/prisma';

interface DailyChallenge {
  name: string;
  competition: string;
  points: number;
  type: string;
}

export async function GET(req: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authConfig);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get query parameters
    const searchParams = req.nextUrl.searchParams;
    const userId = searchParams.get('userId');
    const year = parseInt(searchParams.get('year') || new Date().getFullYear().toString());

    // Validate userId
    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    // Check if the requesting user is the same as the userId or is an admin
    if (session.user.id !== userId) {
      // Check if user is admin directly from the session
      if (session.user.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    // Set date range for the requested year
    const startDate = new Date(year, 0, 1); // January 1st of the requested year
    const endDate = new Date(year, 11, 31, 23, 59, 59, 999); // December 31st of the requested year

    // Fetch question completions for the user within the date range
    const questionCompletions = await prisma.questionCompletion.findMany({
      where: {
        userId: userId,
        completedAt: {
          gte: startDate,
          lte: endDate
        }
      },
      include: {
        question: {
          include: {
            challenge: {
              include: {
                challengeType: true
              }
            }
          }
        },
        groupChallenge: {
          include: {
            group: true
          }
        }
      },
      orderBy: {
        completedAt: 'asc'
      }
    });

    // Group completions by date and challenge
    const completionsByDate = new Map();
    const challengeCompletions = new Map(); // Track completed challenges

    questionCompletions.forEach(completion => {
      const dateStr = completion.completedAt.toISOString().split('T')[0]; // YYYY-MM-DD format
      const challengeId = completion.question.challengeId;
      
      // Initialize date entry if it doesn't exist
      if (!completionsByDate.has(dateStr)) {
        completionsByDate.set(dateStr, {
          date: dateStr,
          count: 0,
          challenges: []
        });
      }

      // Track challenge completions
      if (!challengeCompletions.has(challengeId)) {
        challengeCompletions.set(challengeId, {
          totalQuestions: 0,
          completedQuestions: 0,
          name: completion.question.challenge.name,
          competition: completion.groupChallenge.group.name,
          points: 0,
          lastCompletedAt: completion.completedAt
        });
      }

      const challengeData = challengeCompletions.get(challengeId);
      challengeData.completedQuestions += 1;
      challengeData.points += completion.question.points;
      challengeData.lastCompletedAt = completion.completedAt;

      // If this is a new completion for the day, add it to the day's count
      const dateData = completionsByDate.get(dateStr);
      dateData.count += 1;

      // Add unique challenges to the day's challenges list
      if (!dateData.challenges.some((c: DailyChallenge) => c.name === completion.question.challenge.name)) {
        dateData.challenges.push({
          name: completion.question.challenge.name,
          competition: completion.groupChallenge.group.name,
          points: challengeData.points,
          type: completion.question.challenge.challengeType.name
        } as DailyChallenge);
      }
    });

    // Convert Map to Array for response
    const completions = Array.from(completionsByDate.values());

    return NextResponse.json({
      completions,
      totalCompletions: challengeCompletions.size,
      totalPoints: Array.from(challengeCompletions.values()).reduce((sum, c) => sum + c.points, 0)
    });
  } catch (error) {
    console.error('Error fetching challenge completions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch challenge completions' },
      { status: 500 }
    );
  }
} 