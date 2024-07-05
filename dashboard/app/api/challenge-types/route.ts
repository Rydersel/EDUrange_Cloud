import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET() {
  try {
    const challengeTypes = await prisma.challengeType.findMany();
    return NextResponse.json(challengeTypes);
  } catch (error) {
    return NextResponse.json({ error: 'Error fetching challenge types' }, { status: 500 });
  }
}
