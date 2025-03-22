import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { ChallengeInstanceManager } from "@/components/challenges/ChallengeInstanceManager";
import { Button } from "@/components/ui/button";
import { Play } from "lucide-react";

interface Props {
  params: Promise<{
    competitionId: string;
  }>;
}

export default async function CompetitionChallengesPage(props: Props) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/auth/signin");
  }

  // Get competition details and verify membership
  const competition = await prisma.competitionGroup.findFirst({
    where: {
      id: params.competitionId,
      OR: [
        { members: { some: { id: session.user.id } } },
        { instructors: { some: { id: session.user.id } } },
      ],
    },
    include: {
      challenges: {
        include: {
          challenge: true,
        },
      },
    },
  });

  if (!competition) {
    redirect("/competitions");
  }

  // Get active challenge instances for this competition
  const activeInstances = await prisma.challengeInstance.findMany({
    where: {
      userId: session.user.id,
      AND: {
        competitionId: params.competitionId,
        status: "running",
      },
    },
  });

  // Map instances to match component interface
  const mappedInstances = activeInstances.map(instance => ({
    id: instance.id,
    challengeUrl: instance.challengeUrl,
    status: instance.status,
    creationTime: instance.creationTime.toISOString(),
  }));

  return (
    <div className="container py-8">
      <h1 className="text-3xl font-bold mb-8">
        {competition.name} - Challenges
      </h1>

      <div className="mb-8">
        <ChallengeInstanceManager
          instances={mappedInstances}
          onTerminate={async (instanceId) => {
            "use server";
            await fetch("/api/challenges/terminate", {
              method: "POST",
              body: JSON.stringify({ instanceId }),
            });
          }}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {competition.challenges.map((groupChallenge) => (
          <div
            key={groupChallenge.id}
            className="bg-card text-card-foreground rounded-lg border p-6"
          >
            <h3 className="text-xl font-semibold mb-2">
              {groupChallenge.challenge.name}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Points: {groupChallenge.points}
            </p>
            <form action="/api/challenges/start" method="POST">
              <input
                type="hidden"
                name="challengeId"
                value={groupChallenge.challengeId}
              />
              <input
                type="hidden"
                name="competitionId"
                value={params.competitionId}
              />
              <Button
                type="submit"
                className="w-full"
                disabled={activeInstances.length >= 3}
              >
                <Play className="w-4 h-4 mr-2" />
                Start Challenge
              </Button>
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}
