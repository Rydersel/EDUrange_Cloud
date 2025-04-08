import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ActivityLogger, ActivityEventType, LogSeverity } from '@/lib/activity-logger';
import { getInstanceManagerUrl } from '@/lib/api-config';

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Check if user is authenticated and has admin role
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const id = params.id;
    if (!id) {
      return NextResponse.json({ error: 'Challenge type ID is required' }, { status: 400 });
    }

    // Get the challenge type to check if it exists and get its name
    const challengeType = await prisma.challengeType.findUnique({
      where: { id },
      include: { challenges: true }
    });

    if (!challengeType) {
      return NextResponse.json({ error: 'Challenge type not found' }, { status: 404 });
    }

    // Check if there are associated challenges
    if (challengeType.challenges.length > 0) {
      return NextResponse.json({ 
        error: 'Cannot delete challenge type with associated challenges',
        count: challengeType.challenges.length
      }, { status: 409 });
    }

    // Delete from the instance manager first
    const instanceManagerUrl = getInstanceManagerUrl();
    const response = await fetch(`${instanceManagerUrl}/api/delete-ctd/${challengeType.name}`, {
      method: 'DELETE',
    });

    let instanceManagerResult = null;
    try {
      instanceManagerResult = await response.json();
    } catch (e) {
      console.error('Error parsing instance manager response:', e);
    }

    // Even if the instance manager delete fails, we can still delete from the database
    // Just log the error but continue

    let instanceManagerSuccess = false;
    if (response.ok && instanceManagerResult?.success) {
      instanceManagerSuccess = true;
    } else {
      console.warn('Instance manager could not delete the CTD file, but continuing with database deletion');
      console.warn('Instance manager response:', response.status, instanceManagerResult);
    }

    // Delete from the database
    await prisma.challengeType.delete({
      where: { id }
    });

    // Log the deletion event
    await ActivityLogger.logActivity({
      eventType: ActivityEventType.CHALLENGE_PACK_INSTALLED, // Reuse this event type for now
      userId: session.user.id,
      severity: LogSeverity.WARNING, // Deletions are warning level events
      metadata: {
        action: 'delete',
        typeId: id,
        typeName: challengeType.name,
        instanceManagerDeleted: instanceManagerSuccess,
        timestamp: new Date().toISOString()
      }
    });

    return NextResponse.json({
      success: true,
      message: `Successfully deleted challenge type: ${challengeType.name}`,
      typeId: id,
      typeName: challengeType.name,
      instanceManagerSuccess
    });

  } catch (error) {
    console.error('Error deleting challenge type:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'An unexpected error occurred during deletion',
      },
      { status: 500 }
    );
  }
} 