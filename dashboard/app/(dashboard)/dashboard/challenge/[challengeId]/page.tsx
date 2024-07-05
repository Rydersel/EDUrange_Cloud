'use client';

import { useState, useEffect } from 'react';
import BreadCrumb from '@/components/breadcrumb';
import { useRouter } from 'next/navigation';
import { LoadingButton } from '@/components/ui/loading-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AppConfigModal } from '@/components/modal/AppConfigModal';
import { Button } from '@/components/ui/button';

const breadcrumbItems = [
  { title: 'Challenges', link: '/dashboard/challenge' },
  { title: 'Create', link: '/dashboard/challenge/new' }
];

export default function NewChallengePage() {
  const [userId, setUserId] = useState<string>('');
  const [challengeId, setChallengeId] = useState<string>('');
  const [challengeImage, setChallengeImage] = useState<string>('');
  const [challengeType, setChallengeType] = useState<string>('');

  const [challenges, setChallenges] = useState<any[]>([]);
  const [appsConfig, setAppsConfig] = useState<any[]>([]); // Initialize with empty array
  const [overriddenConfig, setOverriddenConfig] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const router = useRouter();

  useEffect(() => {
    async function fetchData() {
      try {
        const [challengesResponse, typesResponse] = await Promise.all([
          fetch('/api/challenges'),
          fetch('/api/challenge-types'),
        ]);
        const challenges = await challengesResponse.json();
        setChallenges(challenges);
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    }
    fetchData();
  }, []);

  const handleInputChange = (index: number, field: string, value: any) => {
    setOverriddenConfig((prevConfig) =>
      prevConfig.map((appConfig, i) =>
        i === index ? { ...appConfig, [field]: value } : appConfig
      )
    );
  };

  const handleCreateChallenge = async () => {
    setLoading(true);
    try {
      const appsConfigToUse = overriddenConfig.length > 0 ? overriddenConfig : appsConfig;
      const appsConfigString = JSON.stringify(appsConfigToUse);
      const response = await fetch('https://eductf.rydersel.cloud/instance-manager/api/start-challenge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user_id: userId, challenge_image: challengeImage, apps_config: appsConfigString, chal_type: challengeType }),
      });

      const contentType = response.headers.get('content-type');
      let result;
      if (contentType && contentType.includes('application/json')) {
        result = await response.json();
      } else {
        throw new Error('Invalid response format');
      }

      if (response.ok) {
        router.push('/dashboard/challenge');
      } else {
        console.log("Waiting for Challenge URL");
        alert(result.error || 'Error creating challenge');
      }
    } catch (error) {
      console.error('Error creating challenge:', error);
      alert('Error creating challenge');
    } finally {
      setLoading(false);
    }
  };

  const handleChallengeChange = (challengeId: string) => {
    setChallengeId(challengeId);
    const selectedChallenge = challenges.find(challenge => challenge.id === challengeId);
    if (selectedChallenge) {
      setAppsConfig(selectedChallenge.challengeType.AppsConfig);
      setOverriddenConfig(selectedChallenge.challengeType.AppsConfig); // Initialize overridden config (used for when changes are made via app configuration options)
      setChallengeType(selectedChallenge.challengeType.name); // Set the challenge type automatically
      setChallengeImage(selectedChallenge.challengeImage); // Set the challenge image automatically
    }
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 pt-6 md:p-8 bg-black text-white">
        <BreadCrumb items={breadcrumbItems} />
        <div className="space-y-4">
          <div>
            <Label htmlFor="userId">User ID</Label>
            <Input
              id="userId"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="bg-gray-800 text-white"
            />
          </div>
          <div>
            <Label htmlFor="challenge">Challenge</Label>
            <select
              id="challenge"
              value={challengeId}
              onChange={(e) => handleChallengeChange(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm h-10 px-3 py-2 bg-gray-800 text-white"
            >
              <option value="" disabled>Select a challenge</option>
              {challenges.map((challenge) => (
                <option key={challenge.id} value={challenge.id}>
                  {challenge.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="challengeType">Challenge Type</Label>
            <div className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm h-10 px-3 py-2 bg-gray-800 text-white flex items-center">
              {challengeType || 'Select a challenge to see its type'}
            </div>
          </div>
          <Button variant="secondary" size='sm' onClick={() => setIsModalOpen(true)}>
            Configure Apps
          </Button>
          <div className="mb-4">
            <LoadingButton onClick={handleCreateChallenge} loading={loading}>
              Create Challenge
            </LoadingButton>
          </div>

          <AppConfigModal
            appsConfig={overriddenConfig} // Pass the overridden config to the modal
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            onInputChange={handleInputChange}
          />
        </div>
      </div>
    </div>
  );
}
