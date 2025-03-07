import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    // Use Prisma client instead of raw SQL
    const challengeTypes = await prisma.challengeType.findMany();
    
    // Transform the data to match the frontend interface
    const parsedChallengeTypes = challengeTypes.map(type => ({
      id: type.id,
      name: type.name,
      // Provide an empty array as default for DefaultAppsConfig
      DefaultAppsConfig: []
    }));
    
    return NextResponse.json(parsedChallengeTypes);
  } catch (error) {
    console.error("Error fetching challenge types:", error);
    return NextResponse.json({ error: 'Error fetching challenge types' }, { status: 500 });
  }
}
