'use client';

import { Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useState, useEffect, use } from 'react';
import { Leaderboard } from '@/components/competition/Leaderboard';
import { CompetitionNav } from '@/components/competition/CompetitionNav';

interface Competition {
  id: string;
  name: string;
  description: string;
  startDate: Date;
  endDate: Date | null;
  totalPoints: number;
  userPoints: number;
}

interface CompetitionLeaderboardPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default function CompetitionLeaderboardPage(props: CompetitionLeaderboardPageProps) {
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
          <h1 className="text-3xl font-bold">{competition.name} - Leaderboard</h1>
          {competition.description && (
            <p className="mt-2 text-muted-foreground">{competition.description}</p>
          )}
        </div>

        <div className="w-full">
          <Leaderboard />
        </div>
      </main>
    </div>
  );
}
