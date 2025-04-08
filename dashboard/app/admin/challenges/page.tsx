import { getServerSession } from 'next-auth/next';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import BreadCrumb from '@/components/navigation/breadcrumb';
import { Heading } from '@/components/ui/heading';
import { Separator } from '@/components/ui/separator';
import Link from 'next/link';
import authConfig from '@/auth.config';
import { Button } from '@/components/ui/button';
import { PackagePlus } from 'lucide-react';
import { requireAdminAccess } from "@/lib/auth-utils";
import { ChallengeSummaryCard } from '@/components/challenges/challenge-summary-card';
import { ChallengeTypeCard } from '@/components/challenges/challenge-type-card';
import { Challenge, ChallengesByType, ChallengeSummary } from '@/types/challenge';
import { ChallengeDifficulty, Prisma } from '@prisma/client';

const breadcrumbItems = [{ title: 'Installed Challenges', link: '/admin/challenges' }];

const challengeSelect = {
  id: true,
  name: true,
  description: true,
  difficulty: true,
  challengeTypeId: true,
  pack_id: true,
  pack_challenge_id: true,
  challengeType: {
    select: {
      id: true,
      name: true,
    },
  },
  questions: {
    select: {
      id: true,
      points: true,
    },
  },
  appConfigs: {
    select: {
      id: true,
    },
  },
} as const;

type ChallengeWithRelations = Prisma.ChallengeGetPayload<{
  select: typeof challengeSelect;
}>;

async function getChallengesData() {
  // Fetch all challenges with necessary relations in a single query
  const challenges = await prisma.challenge.findMany({
    select: challengeSelect,
    orderBy: {
      name: 'asc',
    },
  });

  // Group challenges by type
  const challengesByType = challenges.reduce((acc: ChallengesByType, challenge: ChallengeWithRelations) => {
    const typeName = challenge.challengeType.name;
    if (!acc[typeName]) {
      acc[typeName] = [];
    }

    const formattedChallenge: Challenge = {
      id: challenge.id,
      name: challenge.name,
      description: challenge.description || '',
      difficulty: challenge.difficulty as ChallengeDifficulty,
      challengeTypeId: challenge.challengeTypeId,
      pack_id: challenge.pack_id,
      pack_challenge_id: challenge.pack_challenge_id,
      challengeType: challenge.challengeType,
      questions: challenge.questions,
      appConfigs: challenge.appConfigs,
    };

    acc[typeName].push(formattedChallenge);
    return acc;
  }, {});

  // Calculate summary statistics
  const summary: ChallengeSummary = {
    totalChallenges: challenges.length,
    totalTypes: Object.keys(challengesByType).length,
    totalQuestions: challenges.reduce((sum: number, challenge: ChallengeWithRelations) =>
      sum + challenge.questions.length, 0),
    totalPoints: challenges.reduce((sum: number, challenge: ChallengeWithRelations) =>
      sum + challenge.questions.reduce((qSum: number, q) => qSum + (q.points || 0), 0), 0
    ),
  };

  return { challengesByType, summary };
}

export default async function InstalledChallengesPage() {
  await requireAdminAccess();
  const session = await getServerSession(authConfig);

  if (!session) {
    redirect('/');
  }

  const { challengesByType, summary } = await getChallengesData();

  return (
    <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
      <BreadCrumb items={breadcrumbItems} />

      <div className="flex items-start justify-between">
        <Heading
          title={`Installed Challenges (${summary.totalChallenges})`}
          description="View all challenges installed in the database"
        />
        <Link href="/admin/challenge-installer">
          <Button>
            <PackagePlus className="mr-2 h-4 w-4" />
            Install New Challenges
          </Button>
        </Link>
      </div>
      <Separator />

      <div className="grid gap-4 overflow-y-auto max-h-[calc(100vh-220px)] pr-2 pb-4">
        <ChallengeSummaryCard summary={summary} />

        {Object.entries(challengesByType).map(([typeName, challenges]) => (
          <ChallengeTypeCard
            key={typeName}
            typeName={typeName}
            challenges={challenges}
          />
        ))}
      </div>
    </div>
  );
}
