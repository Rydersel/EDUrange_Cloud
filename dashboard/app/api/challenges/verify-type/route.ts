import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const { challengeType } = body;

    if (!challengeType) {
      return NextResponse.json({ error: 'Missing challenge type' }, { status: 400 });
    }

    // Use instance-manager-proxy route
    const response = await fetch('/api/instance-manager-proxy?path=verify-type', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': request.headers.get('cookie') || '', // Forward cookies for auth
      },
      body: JSON.stringify({
        challenge_type: challengeType.toLowerCase()
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Instance manager error:', error);
      return NextResponse.json({ error: 'Failed to verify challenge type' }, { status: 500 });
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error verifying challenge type:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
} 