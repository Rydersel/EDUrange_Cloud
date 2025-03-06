import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ActivityLogger, ActivityEventType } from '@/lib/activity-logger';

export async function POST(req: NextRequest) {
  try {
    // Find all expired access codes that haven't been marked as expired
    const expiredCodes = await prisma.competitionAccessCode.findMany({
      where: {
        expiresAt: {
          lt: new Date()
        }
      },
      include: {
        group: true
      }
    });

    // Log expiration for each code
    const logPromises = expiredCodes.map(code =>
      ActivityLogger.logAccessCodeEvent(
        ActivityEventType.ACCESS_CODE_EXPIRED,
        code.createdBy,
        code.id,
        code.groupId,
        {
          code: code.code,
          expirationTime: code.expiresAt,
          timestamp: new Date().toISOString(),
          groupName: code.group.name
        }
      )
    );

    await Promise.all(logPromises);

    return NextResponse.json({
      message: `Processed ${expiredCodes.length} expired access codes`,
      expiredCodes: expiredCodes.map(code => code.code)
    });
  } catch (error) {
    console.error('Error processing expired access codes:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 