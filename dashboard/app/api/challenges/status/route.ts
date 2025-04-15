import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getInstanceManagerUrl } from '@/lib/api-config';

export async function GET(req: NextRequest) {
  const requestStartTime = Date.now();
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const instanceId = searchParams.get('instanceId');

    if (!instanceId) {
      return NextResponse.json({ error: 'Missing instanceId parameter' }, { status: 400 });
    }

    console.log(`Status check for instance ${instanceId} by user ${session.user.id}`);

    // First check our database for the latest status
    const instance = await prisma.challengeInstance.findUnique({
      where: { id: instanceId },
      select: {
        id: true,
        status: true,
        challengeUrl: true,
        challengeId: true,
        competitionId: true,
        creationTime: true
      }
    });

    if (!instance) {
      console.log(`Challenge instance not found: ${instanceId}`);
      return NextResponse.json({ error: 'Challenge instance not found' }, { status: 404 });
    }

    // Check if this challenge instance belongs to the authenticated user
    const instanceOwnership = await prisma.challengeInstance.findFirst({
      where: {
        id: instanceId,
        userId: session.user.id
      }
    });

    if (!instanceOwnership && session.user.role !== 'ADMIN') {
      console.log(`User ${session.user.id} is not authorized to view instance ${instanceId}`);
      return NextResponse.json({ error: 'You are not authorized to view this challenge instance' }, { status: 403 });
    }

    // Calculate how long the instance has been in the current state
    const instanceAge = Date.now() - instance.creationTime.getTime();
    const instanceAgeMinutes = Math.floor(instanceAge / (1000 * 60));
    
    // Add some debug information to help troubleshoot issues
    const debug = {
      instanceAge: `${instanceAgeMinutes} minutes`,
      requestTime: new Date().toISOString(),
      userId: session.user.id
    };

    // Return the status directly from the database with some additional debugging info
    const response = {
      id: instance.id,
      status: instance.status,
      challengeUrl: instance.challengeUrl,
      challengeId: instance.challengeId,
      competitionId: instance.competitionId,
      debug
    };

    const requestEndTime = Date.now();
    const requestDuration = requestEndTime - requestStartTime;
    console.log(`Status check completed in ${requestDuration}ms for instance ${instanceId}`);

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
        'X-Response-Time': `${requestDuration}ms`
      }
    });
  } catch (error) {
    const requestEndTime = Date.now();
    const requestDuration = requestEndTime - requestStartTime;
    
    console.error(`Error checking challenge status (${requestDuration}ms):`, error);
    return NextResponse.json({ 
      error: 'Failed to check challenge status',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { 
      status: 500,
      headers: {
        'Cache-Control': 'no-store, max-age=0'
      }
    });
  }
} 