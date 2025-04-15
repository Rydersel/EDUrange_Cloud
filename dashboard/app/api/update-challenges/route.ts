// /pages/api/update-challenges.ts

import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

// Helper function to map status strings to valid ChallengeStatus enum values
function mapStatusToEnum(status: string): 'CREATING' | 'ACTIVE' | 'TERMINATING' | 'ERROR' {
  const statusMap: Record<string, 'CREATING' | 'ACTIVE' | 'TERMINATING' | 'ERROR'> = {
    'unknown': 'ERROR',
    'running': 'ACTIVE',
    'pending': 'CREATING',
    'creating': 'CREATING',
    'terminating': 'TERMINATING',
    'terminated': 'ERROR',
    'error': 'ERROR',
    'failed': 'ERROR'
  };
  
  return statusMap[status.toLowerCase()] || 'ERROR';
}

async function updateChallengeInstances(challengePods: ChallengePod[]) {
  const existingInstanceIds = new Set(
    challengePods.map(pod => pod.pod_name)
  );

  // Fetch all existing challenge instances
  const existingInstances = await prisma.challengeInstance.findMany();

  // Identify instances that need to be deleted
  const instancesToDelete = existingInstances.filter(
    instance => !existingInstanceIds.has(instance.id)
  );

  // Delete instances that no longer exist
  for (const instance of instancesToDelete) {
    await prisma.challengeInstance.delete({
      where: { id: instance.id },
    });
  }

  // Update or create challenge instances based on the API response
  for (const pod of challengePods) {
    const {
      pod_name: id,
      user_id: userId,
      challenge_image: challengeImage,
      challenge_url: challengeUrl,
      creation_time: creationTime,
      status = 'unknown',
      flag_secret_name: flagSecretName,
      flag = '',
    } = pod;

    // Map string status to enum value
    const statusEnum = mapStatusToEnum(status);

    // Find the user's competition group
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { memberOf: true }
    });

    // Skip if user or competition group not found
    if (!user || !user.memberOf || user.memberOf.length === 0) {
      console.warn(`Skipping pod ${id}: User or competition group not found`);
      continue;
    }

    // Use the first competition group the user is a member of
    const competitionId = user.memberOf[0].id;

    const existingInstance = await prisma.challengeInstance.findUnique({
      where: { id },
    });

    if (existingInstance) {
      // Update the existing instance
      await prisma.challengeInstance.update({
        where: { id },
        data: {
          userId,
          challengeId: "temp",
          challengeUrl,
          creationTime: new Date(creationTime),
          status: statusEnum,
          flagSecretName,
          flag,
          competitionId,
        },
      });
    } else {
      // Create a new instance
      await prisma.challengeInstance.create({
        data: {
          id,
          userId,
          challengeId: "temp",
          challengeUrl,
          creationTime: new Date(creationTime),
          status: statusEnum,
          flagSecretName,
          flag,
          competitionId,
        },
      });
    }
  }
}

// Add retry logic for API calls
async function fetchWithRetry(url: string, options = {}, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      if (i < retries - 1) {
        console.warn(`Retrying... (${i + 1}/${retries})`);
      } else {
        console.error('Failed to fetch after retries:', error);
        throw error;
      }
    }
  }
}

// Define ChallengePod type with a generic structure
interface ChallengePod {
  pod_name: string;
  user_id: string;
  challenge_image: string;
  challenge_url: string;
  creation_time: string;
  status?: string;
  flag_secret_name: string;
  flag?: string;
}

export async function POST(req: NextRequest) {
  try {
    // Validate cron secret
    const cronSecret = req.headers.get('x-cron-secret');
    const validCronSecret = process.env.CRON_SECRET;
    
    if (!cronSecret || cronSecret !== validCronSecret) {
      return NextResponse.json({ error: 'Unauthorized - Invalid or missing cron secret' }, { status: 401 });
    }
    
    const body = await fetchWithRetry(req.url, { method: 'POST', body: req.body });
    await updateChallengeInstances(body.challengePods as ChallengePod[]);
    return NextResponse.json({ message: 'Challenge instances updated successfully' });
  } catch (error) {
    console.error('Error updating challenge instances:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
