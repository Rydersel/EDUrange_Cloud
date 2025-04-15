import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const competitionId = searchParams.get('competitionId');

    if (!competitionId) {
      return NextResponse.json({ error: 'Missing competitionId parameter' }, { status: 400 });
    }

    // Get all active instances for this user and competition
    const instances = await prisma.challengeInstance.findMany({
      where: {
        userId: session.user.id,
        competitionId: competitionId,
        status: {
          in: ['ACTIVE', 'CREATING', 'QUEUED', 'TERMINATING']
        }
      },
      select: {
        id: true,
        challengeId: true,
        challengeUrl: true,
        status: true,
        creationTime: true,
        competitionId: true
      },
      orderBy: {
        creationTime: 'desc'
      }
    });

    // Format the instances for the client
    const formattedInstances = instances.map(instance => ({
      id: instance.id,
      challengeId: instance.challengeId,
      challengeUrl: instance.challengeUrl || '',
      status: instance.status,
      creationTime: instance.creationTime.toISOString(),
      competitionId: instance.competitionId
    }));

    return NextResponse.json({ 
      instances: formattedInstances,
      timestamp: new Date().toISOString() 
    });
  } catch (error) {
    console.error('Error fetching challenge instances:', error);
    return NextResponse.json({ error: 'Failed to fetch challenge instances' }, { status: 500 });
  }
} 