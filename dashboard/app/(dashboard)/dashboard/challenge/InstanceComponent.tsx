// /components/ChallengesComponent.tsx

'use client';

import { useState, useEffect } from 'react';
import { ChallengesClient } from '@/components/tables/challenge-tables/client';
import { getInstanceManagerUrl } from '@/lib/api-config';

export default function InstanceComponent() {
  const [challenges, setChallenges] = useState([]);
  const instanceManagerUrl = getInstanceManagerUrl();

  useEffect(() => {
    const fetchChallenges = async () => {
      const response = await fetch(`${instanceManagerUrl}/list-challenge-pods`);
      const data = await response.json();
      setChallenges(data.challenge_pods);
    };

    fetchChallenges();
  }, [instanceManagerUrl]);

  return <ChallengesClient data={challenges} />;
}
