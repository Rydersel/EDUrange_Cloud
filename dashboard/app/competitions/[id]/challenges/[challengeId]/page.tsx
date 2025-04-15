import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ChallengeEmbeddedView } from "./challenge-embedded";

export default async function EmbeddedChallengePage(
  props: {
    params: Promise<{ id: string; challengeId: string }>;
  }
) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  
  if (!session?.user) {
    redirect("/auth/signin");
  }

  // Get the challenge details with all necessary relations
  const challenge = await prisma.challenge.findUnique({
    where: { id: params.challengeId },
    include: {
      challengeType: true,
      appConfigs: true
    }
  });

  if (!challenge) {
    redirect(`/competitions/${params.id}/challenges`);
  }
  
  // Debug logging to see what fields are available
  console.log("Challenge data:", {
    id: challenge.id,
    name: challenge.name,
    description: challenge.description,
    hasCdfContent: !!challenge.cdf_content,
    hasAppConfigs: challenge.appConfigs?.length > 0,
    challengeType: challenge.challengeType?.name,
    // Log all challenge properties to see what's available
    allProperties: Object.keys(challenge)
  });

  // Get active challenge instance for this competition and challenge
  const challengeInstance = await prisma.challengeInstance.findFirst({
    where: {
      userId: session.user.id,
      challengeId: params.challengeId,
      competitionId: params.id,
      status: {
        in: ["ACTIVE", "CREATING", "QUEUED", "TERMINATING"]
      }
    },
    orderBy: {
      creationTime: 'desc'
    }
  });

  // If no instance exists, redirect to challenges page
  if (!challengeInstance) {
    redirect(`/competitions/${params.id}/challenges`);
  }

  return (
    <ChallengeEmbeddedView 
      competitionId={params.id}
      challenge={challenge}
      challengeInstance={challengeInstance}
    />
  );
} 