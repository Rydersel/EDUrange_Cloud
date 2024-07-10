// /components/ChallengesComponent.tsx

'use client';

import { useState, useEffect } from 'react';
import { ChallengesClient } from '@/components/tables/challenge-tables/client';

export default function ChallengesComponent() {
  const [challenges, setChallenges] = useState([]);

  useEffect(() => {
    const fetchChallenges = async () => {
      const response = await fetch('https://eductf.rydersel.cloud/instance-manager/api/list-challenge-pods');
      const data = await response.json();

      setChallenges(data.challenge_pods);

      // Sync with local database
      const updateResponse = await fetch('/api/update-challenges', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ challengePods: data.challenge_pods }),
      });

      if (!updateResponse.ok) {
        console.error('Failed to update challenge instances');
      }
    };

    fetchChallenges();
  }, []);

  return <ChallengesClient data={challenges} />;
}
