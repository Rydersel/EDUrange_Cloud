// /scripts/sync-challenge-instances.ts

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function syncChallengeInstances() {
  try {
    const response = await fetch('https://eductf.rydersel.cloud/instance-manager/api/list-challenge-pods');
    const data = await response.json();

    if (response.ok) {
      const activePods = data.challenge_pods;

      // Clear existing challenge instances
      await prisma.challengeInstance.deleteMany();

      // Insert new challenge instances
      for (const pod of activePods) {
        await prisma.challengeInstance.create({
          data: {
            id: pod.pod_name,
            challengeId: pod.challenge_id,
            userId: pod.user_id,
            challengeImage: pod.challenge_image,
            challengeUrl: pod.challenge_url,
            creationTime: new Date(pod.creation_time),
            status: pod.status,
            flagSecretName: pod.flag_secret_name,
            flag: pod.flag,
          },
        });
      }

      console.log('Challenge instances synchronized successfully.');
    } else {
      console.error('Failed to fetch challenge pods:', data.error);
    }
  } catch (error) {
    console.error('Error synchronizing challenge instances:', error);
  } finally {
    await prisma.$disconnect();
  }
}

syncChallengeInstances();
