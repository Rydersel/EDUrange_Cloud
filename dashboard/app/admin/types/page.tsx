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
import { ChallengeTypesList } from '@/components/challenge-types/challenge-types-list';
import { ChallengeTypeSummaryCard } from '@/components/challenge-types/challenge-type-summary-card';
import { Prisma } from '@prisma/client';

const breadcrumbItems = [{ title: 'Installed Types', link: '/admin/types' }];

const challengeTypeSelect = {
  id: true,
  name: true,
  challenges: {
    select: {
      id: true,
    },
  },
} as const;

type ChallengeTypeWithRelations = Prisma.ChallengeTypeGetPayload<{
  select: typeof challengeTypeSelect;
}>;

interface TypesSummary {
  totalTypes: number;
  totalAssociatedChallenges: number;
}

async function getChallengeTypesData() {
  // Fetch all challenge types with necessary relations in a single query
  const challengeTypes = await prisma.challengeType.findMany({
    select: challengeTypeSelect,
    orderBy: {
      name: 'asc',
    },
  });

  // Calculate summary statistics
  const summary: TypesSummary = {
    totalTypes: challengeTypes.length,
    totalAssociatedChallenges: challengeTypes.reduce(
      (sum: number, type: ChallengeTypeWithRelations) => sum + type.challenges.length, 
      0
    ),
  };

  return { challengeTypes, summary };
}

export default async function InstalledTypesPage() {
  await requireAdminAccess();
  const session = await getServerSession(authConfig);

  if (!session) {
    redirect('/');
  }

  const { challengeTypes, summary } = await getChallengeTypesData();

  return (
    <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
      <BreadCrumb items={breadcrumbItems} />

      <div className="flex items-start justify-between">
        <Heading
          title={`Installed Challenge Types (${summary.totalTypes})`}
          description="View and manage all challenge types available in the system"
        />
        <Link href="/admin/type-installer">
          <Button>
            <PackagePlus className="mr-2 h-4 w-4" />
            Install New Type
          </Button>
        </Link>
      </div>
      <Separator />

      <div className="grid gap-4 overflow-y-auto max-h-[calc(100vh-220px)] pr-2 pb-4">
        <ChallengeTypeSummaryCard summary={summary} />
        <ChallengeTypesList challengeTypes={challengeTypes} />
      </div>
    </div>
  );
} 