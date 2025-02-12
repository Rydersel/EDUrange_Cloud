import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface RawChallengeType {
  id: string;
  name: string;
  defaultAppsConfig: any;
}

export async function GET() {
  try {
    const challengeTypes = await prisma.$queryRaw<RawChallengeType[]>`
      SELECT id, name, default_apps_config as "defaultAppsConfig"
      FROM challenge_types
    `;
    
    // Transform the data to match the frontend interface
    const parsedChallengeTypes = challengeTypes.map(type => ({
      id: type.id,
      name: type.name,
      DefaultAppsConfig: type.defaultAppsConfig
    }));
    
    return NextResponse.json(parsedChallengeTypes);
  } catch (error) {
    console.error("Error fetching challenge types:", error);
    return NextResponse.json({ error: 'Error fetching challenge types' }, { status: 500 });
  }
}
