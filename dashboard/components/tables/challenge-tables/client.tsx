'use client';
import {useEffect, useState} from 'react';
import {Button} from '@/components/ui/button';
import {DataTable} from '@/components/ui/data-table';
import {Heading} from '@/components/ui/heading';
import {Separator} from '@/components/ui/separator';
import {Challenge} from '@/constants/data';
import {Plus} from 'lucide-react';
import {useRouter} from 'next/navigation';
import {getColumns} from './columns';
import {ChallengeDetailsModal} from '@/components/modal/challenge-details-modal';
import { getInstanceManagerUrl } from '@/lib/api-config';

function calcTimeSince(date: Date) {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  const intervals = [
    { interval: 31536000, label: 'years' },
    { interval: 2592000, label: 'months' },
    { interval: 86400, label: 'days' },
    { interval: 3600, label: 'hours' },
    { interval: 60, label: 'minutes' },
  ];

  for (const { interval, label } of intervals) {
    if (seconds / interval >= 1) {
      return Math.floor(seconds / interval) + ' ' + label + ' ago';
    }
  }

  if (seconds < 60) {
    return 'less than a minute ago';
  }

  return Math.floor(seconds) + ' seconds ago';
}
interface ChallengesClientProps {
  data: Challenge[];
  isLoading?: boolean;
}

export const ChallengesClient: React.FC<ChallengesClientProps> = ({ data, isLoading = false }) => {
  const router = useRouter();
  const [challenges, setChallenges] = useState<Challenge[]>(data);
  const [selectedChallenge, setSelectedChallenge] = useState<Challenge | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const instanceManagerUrl = getInstanceManagerUrl();

  const fetchUserEmail = async (userId: string) => {
    try {
      const response = await fetch(`/api/users/${userId}`);
      if (response.ok) {
        const user = await response.json();
        return user.email;
      }
      return 'Unknown Email';
    } catch (error) {
      return 'Unknown Email';
    }
  };

  const fetchChallenges = async () => {
    const response = await fetch(`${instanceManagerUrl}/list-challenge-pods`);
    const result = await response.json();
    if (response.ok) {
      const challengePods = await Promise.all(
        result.challenge_pods.map(async (challenge: any) => {
          const userEmail = await fetchUserEmail(challenge.user_id);
          return {
            id: challenge.pod_name,
            time_alive: calcTimeSince(new Date(challenge.creation_time)),
            user_id: challenge.user_id,
            userEmail,
            challenge_image: challenge.challenge_image,
            challenge_url: challenge.challenge_url,
            status: 'Loading...', // Initial status value
            flag_secret_name: challenge.flag_secret_name,
            flag: 'Loading...' // Initial flag value
          };
        })
      );

      // Fetch flags and statuses for each challenge
      return await Promise.all(
          challengePods.map(async (challenge) => {
            try {
              // Fetch flag
              const flagResponse = await fetch(`${instanceManagerUrl}/get-secret`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({secret_name: challenge.flag_secret_name})
              });
              if (flagResponse.ok) {
                const flagResult = await flagResponse.json();
                challenge.flag = flagResult.secret_value;
              } else {
                challenge.flag = 'Error fetching flag';
              }
            } catch (error) {
              challenge.flag = 'Error fetching flag';
            }

            try {
              // Fetch status
              const statusResponse = await fetch(`${instanceManagerUrl}/get-pod-status?pod_name=${challenge.id}`);
              if (statusResponse.ok) {
                const statusResult = await statusResponse.json();
                challenge.status = statusResult.status;
              } else {
                challenge.status = 'Error fetching status';
              }
            } catch (error) {
              challenge.status = 'Error fetching status';
            }

            return challenge;
          })
      );
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
    }, 2500); // Refresh status every 2.5 seconds

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
          title={`Challenge Instances (${challenges.length})`}
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
      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
        </div>
      ) : (
        <DataTable
          searchKey="userEmail"
          columns={getColumns(updateChallengeStatus)}
          data={challenges}
          onRowClick={handleRowClick}
        />
      )}
      <ChallengeDetailsModal
        challenge={selectedChallenge}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
};
