import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ChallengesClient } from "./challenges-client";

export default async function CompetitionChallengesPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/auth/signin");
  }

  // Get active challenge instances for this competition
  const activeInstances = await prisma.challengeInstance.findMany({
    where: {
      userId: session.user.id,
      competitionId: params.id,
      status: {
        in: ["running", "creating", "active"]
      }
    },
    orderBy: {
      creationTime: 'desc'
    }
  });

  // Map instances to match component interface
  const mappedInstances = activeInstances.map(instance => ({
    id: instance.id,
    challengeUrl: instance.challengeUrl,
    status: instance.status === "active" ? "running" : instance.status,
    creationTime: instance.creationTime.toISOString(),
  }));

  return (
    <ChallengesClient 
      competitionId={params.id}
      activeInstances={mappedInstances}
    />
  );
} 