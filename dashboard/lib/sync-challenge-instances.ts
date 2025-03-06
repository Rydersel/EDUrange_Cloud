// /scripts/sync-challenge-instances.ts

import { getInstanceManagerUrl } from './api-config';
import { prisma } from './prisma';

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

async function syncChallengeInstances() {
  try {
    const instanceManagerUrl = getInstanceManagerUrl();
    const data = await fetchWithRetry(`${instanceManagerUrl}/list-challenge-pods`);

    if (data.ok) {
      const activePods = data.challenge_pods;

      // Clear existing challenge instances
      await prisma.challengeInstance.deleteMany();

      // Insert new challenge instances
      for (const pod of activePods) {
        // Find the user's competition group
        const user = await prisma.user.findUnique({
          where: { id: pod.user_id },
          include: { memberOf: true }
        });

        // Skip if user or competition group not found
        if (!user || !user.memberOf || user.memberOf.length === 0) {
          console.warn(`Skipping pod ${pod.pod_name}: User or competition group not found`);
          continue;
        }

        // Use the first competition group the user is a member of
        const competitionId = user.memberOf[0].id;

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
            competitionId: competitionId,
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
