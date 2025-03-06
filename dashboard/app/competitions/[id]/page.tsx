'use client';

import { Loader2, Clock, Trophy, Target, Users, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useState, useEffect, use } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { CompetitionNav } from '@/components/competition/CompetitionNav';
import Link from 'next/link';

interface Competition {
  id: string;
  name: string;
  description: string | null;
  startDate: string;
  endDate: string | null;
  challengeCount?: number;
  participantCount?: number;
  completedChallenges?: number;
  accuracy?: number;
  totalPoints?: number;
  userPoints?: number;
}

interface CompetitionOverviewPageProps {
  params: Promise<{
    id: string;
  }>;
}

function CountdownTimer({ endDate }: { endDate: string }) {
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  }>({ days: 0, hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    const calculateTimeLeft = () => {
      const difference = new Date(endDate).getTime() - new Date().getTime();
      
      if (difference > 0) {
        setTimeLeft({
          days: Math.floor(difference / (1000 * 60 * 60 * 24)),
          hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
          minutes: Math.floor((difference / 1000 / 60) % 60),
          seconds: Math.floor((difference / 1000) % 60)
        });
      } else {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
      }
    };

    calculateTimeLeft();
    const timer = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(timer);
  }, [endDate]);

  return (
    <div className="grid grid-cols-4 gap-4 text-center">
      <div className="bg-card rounded-lg p-4">
        <div className="text-4xl font-bold text-green-400">{timeLeft.days}</div>
        <div className="text-sm text-muted-foreground">Days</div>
      </div>
      <div className="bg-card rounded-lg p-4">
        <div className="text-4xl font-bold text-green-400">{timeLeft.hours}</div>
        <div className="text-sm text-muted-foreground">Hours</div>
      </div>
      <div className="bg-card rounded-lg p-4">
        <div className="text-4xl font-bold text-green-400">{timeLeft.minutes}</div>
        <div className="text-sm text-muted-foreground">Minutes</div>
      </div>
      <div className="bg-card rounded-lg p-4">
        <div className="text-4xl font-bold text-green-400">{timeLeft.seconds}</div>
        <div className="text-sm text-muted-foreground">Seconds</div>
      </div>
    </div>
  );
}

export default function CompetitionOverviewPage(props: CompetitionOverviewPageProps) {
  const params = use(props.params);
  const { toast } = useToast();
  const [competition, setCompetition] = useState<Competition | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCompetition = async () => {
      try {
        const response = await fetch(`/api/competition-groups/${params.id}`);
        if (!response.ok) {
          throw new Error('Failed to fetch competition');
        }
        const data = await response.json();
        setCompetition(data);
      } catch (error) {
        console.error('Error fetching competition:', error);
        toast({
          title: "Error",
          description: "Failed to load competition details",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchCompetition();
  }, [params.id, toast]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!competition) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p>Competition not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <CompetitionNav competitionId={competition.id} />
      <main className="container mx-auto p-4 pt-6 md:p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">{competition.name}</h1>
          {competition.description && (
            <p className="mt-2 text-muted-foreground">{competition.description}</p>
          )}
        </div>

        {competition.endDate && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-green-400" />
                Time Remaining
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CountdownTimer endDate={competition.endDate} />
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Progress</CardTitle>
              <CardDescription>Your challenge completion status</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-400" />
                    <span>Completed Challenges</span>
                  </div>
                  <span className="font-bold">{competition.completedChallenges || 0}/{competition.challengeCount || 0}</span>
                </div>
                <Progress value={competition.challengeCount ? (competition.completedChallenges || 0) / competition.challengeCount * 100 : 0} className="h-2" />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Target className="h-5 w-5 text-green-400" />
                    <span>Accuracy</span>
                  </div>
                  <span className="font-bold">{competition.accuracy || 0}%</span>
                </div>
                <Progress value={competition.accuracy || 0} className="h-2" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Points</CardTitle>
              <CardDescription>Your current standing</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Trophy className="h-5 w-5 text-yellow-500" />
                    <span>Your Points</span>
                  </div>
                  <span className="font-bold">{competition.userPoints || 0}</span>
                </div>
                <Progress 
                  value={competition.totalPoints ? (competition.userPoints || 0) / competition.totalPoints * 100 : 0} 
                  className="h-2" 
                />
                <div className="text-sm text-muted-foreground text-right">
                  Out of {competition.totalPoints || 0} total points
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Common competition actions</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button className="w-full" asChild>
                <Link href={`/competitions/${competition.id}/challenges`}>
                  View Challenges
                </Link>
              </Button>
              <Button className="w-full" variant="outline" asChild>
                <Link href={`/competitions/${competition.id}/leaderboard`}>
                  View Leaderboard
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
} 