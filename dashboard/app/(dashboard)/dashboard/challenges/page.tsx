import { getServerSession } from 'next-auth/next';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import BreadCrumb from '@/components/breadcrumb';
import { Heading } from '@/components/ui/heading';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChallengeDifficulty } from '@prisma/client';
import Link from 'next/link';
import authConfig from '@/auth.config';
import { Button } from '@/components/ui/button';
import { PackagePlus } from 'lucide-react';
import { ChallengeRowActions } from '@/components/challenge-row-actions';

const breadcrumbItems = [{ title: 'Installed Challenges', link: '/dashboard/challenges' }];

export default async function InstalledChallengesPage() {
  const session = await getServerSession(authConfig);

  if (!session) {
    redirect('/'); // Redirect to sign-in page if not authenticated
  }

  // Check if user is admin
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true }
  });

  if (!user || user.role !== 'ADMIN') {
    redirect('/dashboard'); // Redirect if not admin
  }

  // Fetch all challenges from the database
  const challenges = await prisma.challenges.findMany({
    include: {
      challengeType: true,
      questions: {
        orderBy: {
          order: 'asc'
        }
      },
      appConfigs: true
    },
    orderBy: {
      name: 'asc'
    }
  });

  // Group challenges by type
  const challengesByType = challenges.reduce((acc, challenge) => {
    const typeName = challenge.challengeType.name;
    if (!acc[typeName]) {
      acc[typeName] = [];
    }
    acc[typeName].push(challenge);
    return acc;
  }, {} as Record<string, typeof challenges>);

  // Get difficulty badge color
  const getDifficultyColor = (difficulty: ChallengeDifficulty) => {
    switch (difficulty) {
      case 'EASY':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'MEDIUM':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'HARD':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400';
      case 'VERY_HARD':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
    }
  };

  return (
    <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
      <BreadCrumb items={breadcrumbItems} />

      <div className="flex items-start justify-between">
        <Heading
          title={`Installed Challenges (${challenges.length})`}
          description="View all challenges installed in the database"
        />
        <Link href="/dashboard/challenge-installer">
          <Button>
            <PackagePlus className="mr-2 h-4 w-4" />
            Install New Challenges
          </Button>
        </Link>
      </div>
      <Separator />

      <div className="grid gap-4">
        {/* Summary card */}
        <Card>
          <CardHeader>
            <CardTitle>Challenge Summary</CardTitle>
            <CardDescription>Overview of installed challenges by type and difficulty</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-primary/10 p-4 rounded-lg flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-foreground">{challenges.length}</span>
                <span className="text-sm text-muted-foreground">Total Challenges</span>
              </div>
              <div className="bg-primary/10 p-4 rounded-lg flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-foreground">
                  {Object.keys(challengesByType).length}
                </span>
                <span className="text-sm text-muted-foreground">Challenge Types</span>
              </div>
              <div className="bg-primary/10 p-4 rounded-lg flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-foreground">
                  {challenges.reduce((sum, challenge) => sum + challenge.questions.length, 0)}
                </span>
                <span className="text-sm text-muted-foreground">Total Questions</span>
              </div>
              <div className="bg-primary/10 p-4 rounded-lg flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-foreground">
                  {challenges.reduce((sum, challenge) => {
                    return sum + challenge.questions.reduce((qSum, q) => qSum + q.points, 0);
                  }, 0)}
                </span>
                <span className="text-sm text-muted-foreground">Total Points</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Challenges by type */}
        {Object.entries(challengesByType).map(([typeName, typesChallenges]) => (
          <Card key={typeName}>
            <CardHeader>
              <CardTitle>{typeName} Challenges</CardTitle>
              <CardDescription>{typesChallenges.length} challenges of this type</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Difficulty</TableHead>
                    <TableHead>Questions</TableHead>
                    <TableHead>Apps</TableHead>
                    <TableHead>Image</TableHead>
                    <TableHead className="w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {typesChallenges.map((challenge) => (
                    <TableRow key={challenge.id} className="hover:bg-muted/50">
                      <TableCell className="font-medium">
                        <Link 
                          href={`/dashboard/challenges/${challenge.id}`}
                          className="text-foreground hover:underline"
                        >
                          {challenge.name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge className={getDifficultyColor(challenge.difficulty)}>
                          {challenge.difficulty}
                        </Badge>
                      </TableCell>
                      <TableCell>{challenge.questions.length}</TableCell>
                      <TableCell>{challenge.appConfigs.length}</TableCell>
                      <TableCell className="max-w-xs truncate">
                        <code className="text-xs">{challenge.challengeImage}</code>
                      </TableCell>
                      <TableCell>
                        <ChallengeRowActions 
                          challengeId={challenge.id} 
                          challengeName={challenge.name} 
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
} 