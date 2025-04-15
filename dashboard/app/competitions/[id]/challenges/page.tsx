import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ChallengesClient } from "./challenges-client";

export default async function CompetitionChallengesPage(
  props: {
    params: Promise<{ id: string }>;
  }
) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/auth/signin");
  }

  // Get active challenge instances for this competition
  // Include all relevant statuses: ACTIVE, CREATING, QUEUED, TERMINATING
  const activeInstances = await prisma.challengeInstance.findMany({
    where: {
      userId: session.user.id,
      competitionId: params.id,
      status: {
        in: ["ACTIVE", "CREATING", "QUEUED", "TERMINATING"]
      }
    },
    orderBy: {
      creationTime: 'desc'
    }
  });

  // Get challenge details for mapping
  const challengeIds = activeInstances.map(instance => instance.challengeId);
  const challenges = await prisma.challenge.findMany({
    where: {
      id: {
        in: challengeIds
      }
    },
    select: {
      id: true,
      name: true
    }
  });

  // Create a lookup map for challenge data
  const challengeMap = new Map();
  challenges.forEach(challenge => {
    challengeMap.set(challenge.id, challenge);
  });

  // Map instances to match component interface
  const mappedInstances = activeInstances.map(instance => {
    const challenge = challengeMap.get(instance.challengeId);
    return {
      id: instance.id,
      challengeUrl: instance.challengeUrl || '',
      status: instance.status || 'UNKNOWN',
      creationTime: instance.creationTime.toISOString(),
      // Include the direct challengeId reference for easier mapping
      challengeId: instance.challengeId,
      competitionId: instance.competitionId,
      // Include challenge name if available from the lookup
      challengeName: challenge?.name || null
    };
  });

  console.log(`Found ${activeInstances.length} active instances for user in competition ${params.id}`);

  return (
    <ChallengesClient 
      competitionId={params.id}
      activeInstances={mappedInstances}
    />
  );
} 