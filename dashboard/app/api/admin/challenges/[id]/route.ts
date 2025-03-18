import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import authConfig from '@/auth.config';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-utils';

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    // Check if user is admin using the utility function
    const adminCheckResult = await requireAdmin(req);
    if (adminCheckResult) return adminCheckResult;

    // Get session for activity logging
    const session = await getServerSession(authConfig);

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
        userId: session?.user?.id || 'unknown',
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