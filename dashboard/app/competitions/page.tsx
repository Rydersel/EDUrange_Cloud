'use client';

import { MainNavigation } from '@/components/MainNavigation';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Trophy, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import {redirect, useRouter} from 'next/navigation';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { JoinCompetitionDialog } from '@/components/dialogs/join-competition-dialog';


interface Competition {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date | null;
  _count: {
    members: number;
    challenges: number;
  };
  challenges: Array<{
    points: number;
  }>;
  members: Array<{
    groupPoints: Array<{
      points: number;
    }>;
  }>;
}

interface CompetitionsData {
  active: Competition[];
  upcoming: Competition[];
  completed: Competition[];
  userRole: 'STUDENT' | 'INSTRUCTOR' | 'ADMIN';
}

export default function CompetitionsPage() {

  const [showDialog, setShowDialog] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [competitions, setCompetitions] = useState<CompetitionsData>({
    active: [],
    upcoming: [],
    completed: [],
    userRole: 'STUDENT'
  });
  const {toast} = useToast();
  const router = useRouter();


  useEffect(() => {
    const fetchCompetitions = async () => {
      try {
        const response = await fetch('/api/users/current/competitions');
        if (!response.ok) {
          throw new Error('Failed to fetch competitions');
        }
        const data = await response.json();
        setCompetitions(data);
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to load competitions",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchCompetitions();
  }, [toast]);

  const CompetitionCard = ({competition}: { competition: Competition }) => {
    // Calculate the actual completion percentage based on completed challenges
    const totalChallenges = competition._count.challenges || 0;
    
    // Get user's completed challenges count from the API response
    // We'll use the number of challenges with points > 0 as a proxy for completed challenges
    const completedChallenges = competition.members[0]?.groupPoints.length || 0;
    
    // Calculate percentage based on completed challenges / total challenges
    const progress = totalChallenges > 0 
      ? Math.round((completedChallenges / totalChallenges) * 100) / 2
      : 0;
    
    const canViewDetails = competitions.userRole !== 'STUDENT';

    return (
        <Card>
          <CardHeader>
            <CardTitle>{competition.name}</CardTitle>
            <CardDescription>
              {formatDistanceToNow(new Date(competition.startDate), {addSuffix: true})}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Your Progress</span>
                  <span className="font-medium">{progress}%</span>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div className="h-full bg-primary" style={{width: `${progress}%`}}/>
                </div>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Participants</span>
                <span className="font-medium">{competition._count.members}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Challenges</span>
                <span className="font-medium">{competition._count.challenges}</span>
              </div>
              <div className="flex flex-col gap-2">
                <Button className="w-full" asChild>
                  <Link href={`/competitions/${competition.id}`}>
                    Go to Competition
                  </Link>
                </Button>
                {canViewDetails && (
                    <Button className="w-full" variant="outline" asChild>
                      <Link href={`/dashboard/competitions/${competition.id}`}>
                        View Details
                      </Link>
                    </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
    );
  };

  if (isLoading) {
    return (
        <div className="min-h-screen bg-background">
          <MainNavigation/>
          <main className="container mx-auto p-6">
            <div className="flex h-[50vh] items-center justify-center">
              <div className="text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto"/>
                <p className="mt-2 text-muted-foreground">Loading competitions...</p>
              </div>
            </div>
          </main>
        </div>
    );
  }

  return (
      <div className="min-h-screen bg-background">
        <MainNavigation/>
        <main className="container mx-auto p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-4xl font-bold">Competitions</h1>
              <p className="text-xl text-muted-foreground mt-2">
                Join CTF competitions and compete with others
              </p>
            </div>
            <Button onClick={() => setShowDialog(true)}>Join Competition</Button>
          </div>

          <Tabs defaultValue="active" className="space-y-4">
            <TabsList>
              <TabsTrigger value="active">Active</TabsTrigger>
              <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
              <TabsTrigger value="completed">Completed</TabsTrigger>
            </TabsList>

            <TabsContent value="active" className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {competitions.active.map((competition) => (
                    <CompetitionCard key={competition.id} competition={competition}/>
                ))}
                {competitions.active.length === 0 && (
                    <Card className="col-span-full">
                      <CardHeader>
                        <CardTitle>No Active Competitions</CardTitle>
                        <CardDescription>
                          You haven&apos;t joined any active competitions yet. Use an access code to join one!
                        </CardDescription>
                      </CardHeader>
                    </Card>
                )}
              </div>
            </TabsContent>

            <TabsContent value="upcoming" className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {competitions.upcoming.map((competition) => (
                    <CompetitionCard key={competition.id} competition={competition}/>
                ))}
                {competitions.upcoming.length === 0 && (
                    <Card className="col-span-full">
                      <CardHeader>
                        <CardTitle>No Upcoming Competitions</CardTitle>
                        <CardDescription>
                          You haven&apos;t joined any upcoming competitions yet.
                        </CardDescription>
                      </CardHeader>
                    </Card>
                )}
              </div>
            </TabsContent>

            <TabsContent value="completed" className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {competitions.completed.map((competition) => (
                    <CompetitionCard key={competition.id} competition={competition}/>
                ))}
                {competitions.completed.length === 0 && (
                    <Card className="col-span-full">
                      <CardHeader>
                        <CardTitle>No Completed Competitions</CardTitle>
                        <CardDescription>
                          You haven&apos;t completed any competitions yet.
                        </CardDescription>
                      </CardHeader>
                    </Card>
                )}
              </div>
            </TabsContent>
          </Tabs>

          <JoinCompetitionDialog
              open={showDialog}
              onOpenChange={setShowDialog}
          />
        </main>
      </div>
  );
}
