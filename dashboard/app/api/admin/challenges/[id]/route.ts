import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import authConfig from '@/auth.config';
import { prisma } from '@/lib/prisma';

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    // Check authentication and authorization
    const session = await getServerSession(authConfig);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true }
    });

    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const challengeId = params.id;

    // Check if challenge exists
    const challenge = await prisma.challenges.findUnique({
      where: { id: challengeId },
      include: {
        questions: true,
        appConfigs: true
      }
    });

    if (!challenge) {
      return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
    }

    // Delete related records first (questions and app configs)
    // This is necessary because of foreign key constraints
    await prisma.challengeQuestion.deleteMany({
      where: { challengeId }
    });

    await prisma.challengeAppConfig.deleteMany({
      where: { challengeId }
    });

    // Delete the challenge
    await prisma.challenges.delete({
      where: { id: challengeId }
    });

    // Log the activity
    await prisma.activityLog.create({
      data: {
        eventType: 'SYSTEM_ERROR',
        severity: 'INFO',
        userId: session.user.id,
        metadata: {
          action: 'CHALLENGE_DELETED',
          challengeName: challenge.name,
          challengeId: challengeId
        }
      }
    });

    return NextResponse.json({
      success: true,
      message: `Successfully deleted challenge "${challenge.name}"`
    });
  } catch (error) {
    console.error('Error deleting challenge:', error);
    return NextResponse.json({ error: 'Failed to delete challenge' }, { status: 500 });
  }
} 