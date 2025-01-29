'use client';

import { Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useState, useEffect } from 'react';
import { ChallengeList } from '@/components/ChallengeList';
import { CompetitionNav } from '@/components/competition/CompetitionNav';

interface Competition {
  id: string;
  name: string;
  description: string | null;
  startDate: string;
  endDate: string | null;
}

interface CompetitionChallengesPageProps {
  params: {
    id: string;
  };
}

export default function CompetitionChallengesPage({ params }: CompetitionChallengesPageProps) {
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
        </div>
        <ChallengeList competitionId={params.id} />
      </main>
    </div>
  );
}
