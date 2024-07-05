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
    };

    fetchChallenges();
  }, []);

  return (
    <ChallengesClient data={challenges} />
  );
}
