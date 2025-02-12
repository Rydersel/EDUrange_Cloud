import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ActivityLogger } from '@/lib/activity-logger';
import { ActivityEventType } from '@prisma/client';

export async function POST(req: Request) {
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
          expiredAt: new Date().toISOString(),
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