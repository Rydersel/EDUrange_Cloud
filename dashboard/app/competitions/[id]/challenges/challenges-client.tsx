'use client';

import { useState, useEffect } from 'react';
import { ChallengeList } from '@/components/challenges/ChallengeList';
import { CompetitionNav } from '@/components/competition/CompetitionNav';
import { ChallengeInstanceManager } from "@/components/challenges/ChallengeInstanceManager";
import { toast } from 'sonner';

// Create a client-side terminate function that calls the API
async function terminateChallenge(instanceId: string): Promise<void> {
  const response = await fetch('/api/challenges/terminate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ instanceId }),
  });
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to terminate challenge');
  }

  // Get the response data - this is now a direct response from the instance-manager
  const responseData = await response.json();
  console.log('Termination completed:', responseData);
  
  // No need to wait for callbacks, response indicates termination is complete
  return;
}

interface ChallengeInstance {
  id: string;
  challengeUrl: string;
  status: string;
  creationTime: string;
}

interface ChallengesClientProps {
  competitionId: string;
  activeInstances: ChallengeInstance[];
}

export function ChallengesClient({
  competitionId,
  activeInstances: initialInstances
}: ChallengesClientProps) {
  const [instances, setInstances] = useState<ChallengeInstance[]>(initialInstances);
  const [isInitialLoading, setIsInitialLoading] = useState(initialInstances.length === 0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);

  // Function to fetch updated instance data
  const fetchInstances = async () => {
    try {
      // Only set refresh state - not loading state for updates
      setIsRefreshing(true);
      setError(null);
      
      // Fetch challenge instance data via instance manager proxy
      const response = await fetch(`/api/instance-manager-proxy?path=list-challenge-pods`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch challenge instances');
      }
      
      const data = await response.json();
      
      if (data.instances && Array.isArray(data.instances)) {
        // Filter instances for this competition and the current user
        const relevantInstances = data.instances
          .filter((instance: any) => instance.groupId === competitionId)
          .map((instance: any) => ({
            id: instance.id,
            challengeUrl: instance.challengeUrl || '#',
            status: instance.status || 'UNKNOWN',
            creationTime: instance.creationTime || new Date().toISOString()
          }));
        
        setInstances(relevantInstances);
      }

      // Mark initial load as complete
      if (!initialLoadComplete) {
        setInitialLoadComplete(true);
      }
    } catch (err) {
      console.error('Error fetching challenge instances:', err);
      setError('Failed to fetch updated challenge instances');
      // Keep using the current instances rather than clearing them
    } finally {
      setIsInitialLoading(false);
      setIsRefreshing(false);
    }
  };

  // Initial fetch and set up polling
  useEffect(() => {
    // Initial fetch
    fetchInstances();
    
    // Set up polling interval (every 5 seconds)
    const intervalId = setInterval(fetchInstances, 5000);
    
    // Clean up interval on component unmount
    return () => clearInterval(intervalId);
  }, [competitionId]);

  return (
    <>
      <CompetitionNav competitionId={competitionId} />
      <div className="container py-8 h-[calc(100vh-64px)] overflow-y-auto">
        <div className="mb-8">
          <ChallengeInstanceManager
            instances={instances}
            onTerminate={terminateChallenge}
            isLoading={isInitialLoading && !initialLoadComplete}
          />
          {error && (
            <p className="text-red-500 text-sm mt-2">{error}</p>
          )}
        </div>
        <ChallengeList competitionId={competitionId} />
      </div>
    </>
  );
}
