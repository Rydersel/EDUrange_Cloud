import { getServerSession } from 'next-auth/next';
import { redirect, notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import BreadCrumb from '@/components/navigation/breadcrumb';
import { Heading } from '@/components/ui/heading';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChallengeDifficulty } from '@prisma/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { ArrowLeft, FileQuestion, Server, Info } from 'lucide-react';
import Link from 'next/link';
import authConfig from '@/auth.config';
import { ChallengeActions } from '@/components/challenges/challenge-actions';
import {requireAdminAccess} from "@/lib/auth-utils";

interface ChallengeDetailPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function ChallengeDetailPage(props: ChallengeDetailPageProps) {


  const params = await props.params;
  await requireAdminAccess()
  const session = await getServerSession(authConfig);

  if (!session) {
    redirect('/'); // Redirect to sign-in page if not authenticated
  }



  // Fetch the challenge from the database
  const challenge = await prisma.challenge.findUnique({
    where: {
      id: params.id
    },
    include: {
      challengeType: true,
      questions: {
        orderBy: {
          order: 'asc'
        }
      },
      appConfigs: true
    }
  });

  if (!challenge) {
    notFound();
  }

  // Get difficulty badge color
  const getDifficultyColor = (difficulty: ChallengeDifficulty) => {
    switch (difficulty) {
      case 'EASY':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'MEDIUM':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'HARD':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400';
      case 'EXPERT':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
    }
  };

  const breadcrumbItems = [
    { title: 'Installed Challenges', link: '/admin/challenges' },
    { title: challenge.name, link: `/admin/challenges/${challenge.id}` }
  ];

  // Calculate total points
  const totalPoints = challenge.questions.reduce((sum: number, question: any) => sum + question.points, 0);

  return (
    <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
      <BreadCrumb items={breadcrumbItems} />

      <div className="flex items-start justify-between">
        <Heading
          title={challenge.name}
          description={challenge.description || 'No description provided'}
        />
        <div className="flex items-center space-x-2">
          <ChallengeActions
            challengeId={challenge.id}
            challengeName={challenge.name}
          />
          <Link href="/admin/challenges">
            <Button variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Challenges
            </Button>
          </Link>
        </div>
      </div>
      <Separator />

      <div className="grid gap-4">
        {/* Challenge info card */}
        <Card>
          <CardHeader>
            <CardTitle>Challenge Information</CardTitle>
            <CardDescription>Details about this challenge</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-primary/10 p-4 rounded-lg flex flex-col items-center justify-center">
                <Badge className={getDifficultyColor(challenge.challengeType.name as ChallengeDifficulty)}>
                  {challenge.challengeType.name}
                </Badge>
                <span className="text-sm text-muted-foreground mt-2">Difficulty</span>
              </div>
              <div className="bg-primary/10 p-4 rounded-lg flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-foreground">{challenge.challengeType.name}</span>
                <span className="text-sm text-muted-foreground">Type</span>
              </div>
              <div className="bg-primary/10 p-4 rounded-lg flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-foreground">{challenge.questions?.length || 0}</span>
                <span className="text-sm text-muted-foreground">Questions</span>
              </div>
              <div className="bg-primary/10 p-4 rounded-lg flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-foreground">{totalPoints}</span>
                <span className="text-sm text-muted-foreground">Total Points</span>
              </div>
            </div>

            <div className="p-4 bg-muted rounded-md">
              <h3 className="text-sm font-medium mb-2">Challenge ID</h3>
              <code className="text-xs">{challenge.id}</code>
            </div>
          </CardContent>
        </Card>

        {/* Tabs for questions and app configs */}
        <Tabs defaultValue="questions" className="w-full">
          <TabsList>
            <TabsTrigger value="questions" className="flex items-center">
              <FileQuestion className="mr-2 h-4 w-4" />
              Questions ({challenge.questions?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="appConfigs" className="flex items-center">
              <Server className="mr-2 h-4 w-4" />
              App Configurations ({challenge.appConfigs?.length || 0})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="questions" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Challenge Questions</CardTitle>
                <CardDescription>Questions and answers for this challenge</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Content</TableHead>
                      <TableHead>Points</TableHead>
                      <TableHead>Answer</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {challenge.questions.map((question: any) => (
                      <TableRow key={question.id}>
                        <TableCell>{question.order}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{question.type}</Badge>
                        </TableCell>
                        <TableCell className="max-w-xs truncate">{question.content}</TableCell>
                        <TableCell>{question.points}</TableCell>
                        <TableCell className="max-w-xs truncate">{question.answer}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="appConfigs" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>App Configurations</CardTitle>
                <CardDescription>App configurations for this challenge</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>App ID</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Screen</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Settings</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {challenge.appConfigs.map((config: any) => (
                      <TableRow key={config.id}>
                        <TableCell>{config.appId}</TableCell>
                        <TableCell>{config.title}</TableCell>
                        <TableCell>{config.screen}</TableCell>
                        <TableCell>{config.width}x{config.height}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {config.disabled && <Badge variant="outline">Disabled</Badge>}
                            {config.favourite && <Badge variant="outline">Favorite</Badge>}
                            {config.desktop_shortcut && <Badge variant="outline">Desktop</Badge>}
                            {config.launch_on_startup && <Badge variant="outline">Startup</Badge>}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
