import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET() {
  try {
    const challenges = await prisma.challenges.findMany({
      include: {
        challengeType: true,
      },
    });
    return NextResponse.json(challenges);
  } catch (error) {
    return NextResponse.json({ error: 'Error fetching challenges' }, { status: 500 });
  }
}
