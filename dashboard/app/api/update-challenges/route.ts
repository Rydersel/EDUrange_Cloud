// /pages/api/update-challenges.ts

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function updateChallengeInstances(challengePods) {
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
          challengeImage,
          challengeUrl,
          creationTime: new Date(creationTime),
          status,
          flagSecretName,
          flag,
        },
      });
    } else {
      // Create a new instance
      await prisma.challengeInstance.create({
        data: {
          id,
          userId,
          challengeId: "temp",
          challengeImage,
          challengeUrl,
          creationTime: new Date(creationTime),
          status,
          flagSecretName,
          flag,
        },
      });
    }
  }
}

export async function POST(req) {
  const body = await req.json();
  try {
    await updateChallengeInstances(body.challengePods);
    return NextResponse.json({ message: 'Challenge instances updated successfully' });
  } catch (error) {
    console.error('Error updating challenge instances:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
