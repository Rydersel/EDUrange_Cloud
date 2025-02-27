import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import authConfig from '@/auth.config';
import { prisma } from '@/lib/prisma';

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
      const requestingUser = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { role: true }
      });

      if (!requestingUser || requestingUser.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    // Set date range for the requested year
    const startDate = new Date(year, 0, 1); // January 1st of the requested year
    const endDate = new Date(year, 11, 31, 23, 59, 59, 999); // December 31st of the requested year

    // Fetch challenge completions for the user within the date range
    const challengeCompletions = await prisma.challengeCompletion.findMany({
      where: {
        userId: userId,
        completedAt: {
          gte: startDate,
          lte: endDate
        }
      },
      include: {
        groupChallenge: {
          include: {
            challenge: true,
            group: true
          }
        }
      },
      orderBy: {
        completedAt: 'asc'
      }
    });

    // Group completions by date
    const completionsByDate = new Map();

    challengeCompletions.forEach(completion => {
      const dateStr = completion.completedAt.toISOString().split('T')[0]; // YYYY-MM-DD format
      
      if (!completionsByDate.has(dateStr)) {
        completionsByDate.set(dateStr, {
          date: dateStr,
          count: 0,
          challenges: []
        });
      }
      
      const dateData = completionsByDate.get(dateStr);
      dateData.count += 1;
      dateData.challenges.push({
        name: completion.groupChallenge.challenge.name,
        competition: completion.groupChallenge.group.name,
        points: completion.pointsEarned
      });
    });

    // Convert Map to Array for response
    const completions = Array.from(completionsByDate.values());

    return NextResponse.json({
      completions,
      totalCompletions: challengeCompletions.length
    });
  } catch (error) {
    console.error('Error fetching challenge completions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch challenge completions' },
      { status: 500 }
    );
  }
} 