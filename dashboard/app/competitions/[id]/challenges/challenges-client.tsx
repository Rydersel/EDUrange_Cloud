'use client';

import { useState, useEffect } from 'react';
import { ChallengeList } from '@/components/challenges/ChallengeList';
import { CompetitionNav } from '@/components/competition/CompetitionNav';
import { toast } from 'sonner';

// Create a client-side terminate function that calls the API and updates local state
async function terminateChallenge(instanceId: string, updateInstanceStatus: (id: string, status: string) => void): Promise<void> {
  // Immediately update local state for responsive UI feedback
  updateInstanceStatus(instanceId, 'TERMINATING');
  
  try {
    // Prevent potential race conditions with synchronous request
    const response = await fetch('/api/challenges/terminate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ instanceId }),
      // Ensure we don't have caching issues
      cache: 'no-store'
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to terminate challenge');
    }

    // Get the response data - this is now a direct response from the instance-manager
    const responseData = await response.json();
    console.log('Termination completed:', responseData);
    
    // Immediately update the status to TERMINATED for faster UI feedback
    // This will be overridden by the next polling cycle if needed
    updateInstanceStatus(instanceId, 'TERMINATED');
    
    return;
  } catch (error) {
    console.error("Error terminating challenge:", error);
    // Even if there's an error, keep the terminating status as the database has been updated
    toast.error("An error occurred while terminating the challenge. The process will continue in the background.");
  }
}

interface ChallengeInstance {
  id: string;
  challengeUrl: string;
  status: string;
  creationTime: string;
  challengeId?: string;
  competitionId?: string;
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

  // Function to update instance status immediately in the UI
  const updateInstanceStatus = (instanceId: string, newStatus: string) => {
    setInstances(prev => 
      prev.map(instance => 
        instance.id === instanceId 
          ? { ...instance, status: newStatus } 
          : instance
      )
    );
  };

  // Function to fetch updated instance data
  const fetchInstances = async () => {
    try {
      // Only set refresh state - not loading state for updates
      setIsRefreshing(true);
      setError(null);
      
      // Use a dedicated API endpoint to get challenge instances for this competition
      const response = await fetch(`/api/challenges/instances?competitionId=${competitionId}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch challenge instances');
      }
      
      const data = await response.json();
      
      if (data.instances && Array.isArray(data.instances)) {
        console.log('Received instances:', data.instances);
        setInstances(data.instances);
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

  // Custom termination handler that includes status update function
  const handleTerminate = (instanceId: string) => {
    return terminateChallenge(instanceId, updateInstanceStatus);
  };

  return (
    <>
      <CompetitionNav competitionId={competitionId} />
      <div className="container py-8 h-[calc(100vh-64px)] overflow-y-auto">
        <ChallengeList 
          competitionId={competitionId} 
          activeInstances={instances}
          onTerminateInstance={handleTerminate}
        />
      </div>
    </>
  );
}
