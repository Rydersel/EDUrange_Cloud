import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getInstanceManagerUrl } from '@/lib/api-config';

export async function POST(request: Request) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const { challengeImage, appsConfig, challengeType } = body;

    if (!challengeImage || !challengeType) {
      return new NextResponse('Missing required fields', { status: 400 });
    }

    // Get the instance manager URL
    const instanceManagerUrl = getInstanceManagerUrl();

    // Make request to instance manager
    const response = await fetch(`${instanceManagerUrl}/start-challenge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id: session.user.id,
        challenge_image: challengeImage,
        apps_config: appsConfig,
        chal_type: challengeType
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Instance manager error:', error);
      return new NextResponse('Failed to create challenge instance', { status: 500 });
    }

    const result = await response.json();

    // Log the challenge creation
    await prisma.activityLog.create({
      data: {
        eventType: 'CHALLENGE_INSTANCE_CREATED',
        userId: session.user.id,
        metadata: {
          challengeImage,
          challengeType,
          deploymentName: result.deployment_name
        }
      }
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error creating challenge instance:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 