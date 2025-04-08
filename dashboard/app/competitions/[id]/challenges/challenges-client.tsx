'use client';

import { ChallengeList } from '@/components/challenges/ChallengeList';
import { CompetitionNav } from '@/components/competition/CompetitionNav';
import { ChallengeInstanceManager } from "@/components/challenges/ChallengeInstanceManager";

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
  activeInstances
}: ChallengesClientProps) {
  return (
    <>
      <CompetitionNav competitionId={competitionId} />
      <div className="container py-8 h-[calc(100vh-64px)] overflow-y-auto">
        <div className="mb-8">
          <ChallengeInstanceManager
            instances={activeInstances}
            onTerminate={terminateChallenge}
          />
        </div>
        <ChallengeList competitionId={competitionId} />
      </div>
    </>
  );
}
