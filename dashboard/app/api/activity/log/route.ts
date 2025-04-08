import { NextRequest, NextResponse } from 'next/server';
import { getDatabaseApiUrl } from '@/lib/api-config';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

/**
 * Direct route for activity logging with fallback to local database
 * This ensures activity logs work even when the database API is unavailable
 */
export async function POST(req: NextRequest) {
  try {
    // Validate authentication
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const body = await req.json();
    
    // Log first via direct database access
    try {
      await prisma.activityLog.create({
        data: {
          eventType: body.eventType,
          userId: body.userId,
          severity: body.severity || 'INFO',
          metadata: body.metadata || {},
          challengeId: body.challengeId,
          groupId: body.groupId,
          challengeInstanceId: body.challengeInstanceId,
          accessCodeId: body.accessCodeId,
        }
      });
      
      console.log(`Activity log saved locally: ${body.eventType}`);
    } catch (dbError) {
      console.error("Failed to save activity log locally:", dbError);
    }
    
    // Then try to forward to database API service as backup
    try {
      const databaseApiUrl = getDatabaseApiUrl();
      const response = await fetch(`${databaseApiUrl}/activity/log`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.user.id}`
        },
        body: JSON.stringify(body)
      });
      
      if (response.ok) {
        console.log(`Activity log forwarded to database API: ${body.eventType}`);
        return NextResponse.json({ success: true });
      } else {
        console.warn(`Database API returned error for activity log: ${response.status}`);
        return NextResponse.json({ success: true, source: 'local' });
      }
    } catch (apiError) {
      console.warn("Failed to forward activity log to database API:", apiError);
      return NextResponse.json({ success: true, source: 'local' });
    }
  } catch (error) {
    console.error("Error in activity log API route:", error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
} 