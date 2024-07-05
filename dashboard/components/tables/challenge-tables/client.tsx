'use client';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { Heading } from '@/components/ui/heading';
import { Separator } from '@/components/ui/separator';
import { Challenge } from '@/constants/data';
import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { getColumns } from './columns';
import { ChallengeDetailsModal } from '@/components/modal/challenge-details-modal';

function timeSince(date: Date) {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  let interval = seconds / 31536000;

  if (interval > 1) {
    return Math.floor(interval) + ' years ago';
  }
  interval = seconds / 2592000;
  if (interval > 1) {
    return Math.floor(interval) + ' months ago';
  }
  interval = seconds / 86400;
  if (interval > 1) {
    return Math.floor(interval) + ' days ago';
  }
  interval = seconds / 3600;
  if (interval > 1) {
    return Math.floor(interval) + ' hours ago';
  }
  interval = seconds / 60;
  if (interval > 1) {
    return Math.floor(interval) + ' minutes ago';
  }
  return Math.floor(seconds) + ' seconds ago';
}

interface ChallengesClientProps {
  data: Challenge[];
}

export const ChallengesClient: React.FC<ChallengesClientProps> = ({ data }) => {
  const router = useRouter();
  const [challenges, setChallenges] = useState<Challenge[]>(data);
  const [selectedChallenge, setSelectedChallenge] = useState<Challenge | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchChallenges = async () => {
    const response = await fetch('https://eductf.rydersel.cloud/instance-manager/api/list-challenge-pods');
    const result = await response.json();
    if (response.ok) {
      const challengePods = result.challenge_pods.map((challenge: any) => ({
        id: challenge.pod_name,
        time_alive: timeSince(new Date(challenge.creation_time)),
        user_id: challenge.user_id,
        challenge_image: challenge.challenge_image,
        challenge_url: challenge.challenge_url,
        status: 'Loading...', // Initial status value
        flag_secret_name: challenge.flag_secret_name,
        flag: 'Loading...' // Initial flag value
      }));

      // Fetch flags and statuses for each challenge
      const challengesWithFlagsAndStatus = await Promise.all(
        challengePods.map(async (challenge: { id: string; flag_secret_name: string; flag: string; status: string; }) => {
          // Fetch flag
          const flagResponse = await fetch('https://eductf.rydersel.cloud/instance-manager/api/get-secret', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ secret_name: challenge.flag_secret_name })
          });
          const flagResult = await flagResponse.json();
          if (flagResponse.ok) {
            challenge.flag = flagResult.secret_value;
          } else {
            challenge.flag = 'Error fetching flag';
          }

          // Fetch status
          const statusResponse = await fetch(`https://eductf.rydersel.cloud/instance-manager/api/get-pod-status?pod_name=${challenge.id}`);
          const statusResult = await statusResponse.json();
          if (statusResponse.ok) {
            challenge.status = statusResult.status;
          } else {
            challenge.status = 'Error fetching status';
          }

          return challenge;
        })
      );

      return challengesWithFlagsAndStatus;
    } else {
      alert(result.error || 'Error fetching challenges');
    }
  };

  const refreshStatus = async () => {
    const fetchedChallenges = await fetchChallenges();
    if (fetchedChallenges) {
      setChallenges((prevChallenges) => {
        const hasChanged = fetchedChallenges.some((fetchedChallenge, index) => {
          const prevChallenge = prevChallenges[index];
          return (
            fetchedChallenge.status !== prevChallenge.status ||
            fetchedChallenge.flag !== prevChallenge.flag
          );
        });
        if (hasChanged) {
          return fetchedChallenges;
        }
        return prevChallenges;
      });
    }
  };

  useEffect(() => {
    // @ts-ignore
    fetchChallenges().then(setChallenges);

    const intervalId = setInterval(() => {
      refreshStatus();
    }, 2500); // Refresh status every 5 seconds

    return () => clearInterval(intervalId); // Cleanup interval on component unmount
  }, []);

  const updateChallengeStatus = (id: string, status: string) => {
    setChallenges((prevChallenges) =>
      prevChallenges.map((challenge) =>
        challenge.id === id ? { ...challenge, status } : challenge
      )
    );
  };

  const handleRowClick = (challenge: Challenge) => {
    setSelectedChallenge(challenge);
    setIsModalOpen(true);
  };

  return (
    <>
      <div className="flex items-start justify-between">
        <Heading
          title={`Challenges (${challenges.length})`}
          description="Manage challenge pods"
        />
        <Button
          className="text-xs md:text-sm"
          onClick={() => router.push('/dashboard/challenge/new')}
        >
          <Plus className="mr-2 h-4 w-4" /> Add New
        </Button>
      </div>
      <Separator />
      <DataTable
        searchKey="user_id"
        columns={getColumns(updateChallengeStatus)}
        data={challenges}
        onRowClick={handleRowClick}
      />
      <ChallengeDetailsModal
        challenge={selectedChallenge}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
};
