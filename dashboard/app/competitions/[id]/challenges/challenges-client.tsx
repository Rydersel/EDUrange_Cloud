'use client';

import { ChallengeList } from '@/components/ChallengeList';
import { CompetitionNav } from '@/components/competition/CompetitionNav';
import { ChallengeInstanceManager } from "@/components/ChallengeInstanceManager";
import { terminateChallenge } from './actions';

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