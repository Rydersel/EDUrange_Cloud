// page.tsx
import React from 'react';
import { CTFHomePageClient } from '@/components/ui/home';
import {getServerSession} from "next-auth/next";
import authConfig from "@/auth.config";
import {redirect} from "next/navigation";



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

export default async function Home() {

  const session = await getServerSession(authConfig);
  if (!session) {
    redirect('/'); // Redirect to sign-in page if not authenticated
  }

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
