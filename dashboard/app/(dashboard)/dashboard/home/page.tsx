// page.tsx
import React from 'react';
import { CTFHomePageClient } from '@/components/home';

const leaderboardData = [
  { rank: 1, username: 'l33thax0r', points: 1500 },
  { rank: 2, username: 'cyberninja', points: 1350 },
  { rank: 3, username: 'securityguru', points: 1200 },
];

const pointsBreakdown = [
  { category: 'Web', points: 500 },
  { category: 'Cryptography', points: 300 },
  { category: 'Forensics', points: 200 },
  { category: 'Reverse Engineering', points: 400 },
];

export default function Home() {
  // Temp hard coded
  const totalPoints = pointsBreakdown.reduce((sum, entry) => sum + entry.points, 0);

  return (
    <CTFHomePageClient
      leaderboardData={leaderboardData}
      pointsBreakdown={pointsBreakdown}
      totalPoints={totalPoints}
    />
  );
}
