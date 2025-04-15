import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { ActivityLogger, ActivityEventType } from '@/lib/activity-logger';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { challengeId, packId } = body;

    if (!challengeId || !packId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Use instance-manager-proxy route
    const response = await fetch('/api/instance-manager-proxy?path=install-challenge', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': request.headers.get('cookie') || '', // Forward cookies for auth
      },
      body: JSON.stringify({
        challengeId,
        packId,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to install challenge: ${error}`);
    }

    const result = await response.json();

    // Log the challenge installation
    await ActivityLogger.logChallengePackInstalled(session.user.id, {
      challengeId,
      packId,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error installing challenge:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to install challenge' },
      { status: 500 }
    );
  }
} 