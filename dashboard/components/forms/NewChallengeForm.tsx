'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import BreadCrumb from '@/components/breadcrumb';
import { LoadingButton } from '@/components/ui/loading-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AppConfigModal } from '@/components/modal/AppConfigModal';
import { Button } from '@/components/ui/button';
import { v4 as uuidv4 } from 'uuid';

const breadcrumbItems = [
  { title: 'Challenges', link: '/dashboard/challenge' },
  { title: 'Create', link: '/dashboard/challenge/new' }
];

const generateUserId = (email: string) => {
  const randomNumbers = Math.floor(1000 + Math.random() * 9000).toString();
  return email.slice(0, 5) + randomNumbers;
};

interface NewChallengeFormProps {
  userId: string;
}

interface AppConfig {
  id: string;
  appId: string;
  title: string;
  icon: string;
  width: number;
  height: number;
  screen: string;
  disabled: boolean;
  favourite: boolean;
  desktop_shortcut: boolean;
  launch_on_startup: boolean;
  pages: {
    instructions: string;
    questions: {
      type: string;
      content: string;
      id: string;
      points: number;
    }[];
  }[];
}

export default function NewChallengeForm({ userId }: NewChallengeFormProps) {
  const [challengeImage, setChallengeImage] = useState<string>('');
  const [challengeType, setChallengeType] = useState<string>('');
  const [challenges, setChallenges] = useState<any[]>([]);
  const [appsConfig, setAppsConfig] = useState<AppConfig[]>([]);
  const [overriddenConfig, setOverriddenConfig] = useState<AppConfig[]>([]);
  const [selectedChallengeId, setSelectedChallengeId] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [userEmail, setUserEmail] = useState<string>('');
  const router = useRouter();

  useEffect(() => {
    async function fetchUserEmail() {
      try {
        const response = await fetch(`/api/users/${userId}`);
        const user = await response.json();
        if (response.ok) {
          setUserEmail(user.email);
        } else {
          throw new Error(user.error || 'Failed to fetch user email');
        }
      } catch (error) {
        console.error('Error fetching user email:', error);
      }
    }

    async function fetchChallenges() {
      try {
        const response = await fetch('/api/challenges');
        if (!response.ok) {
          throw new Error('Failed to fetch challenges');
        }
        const data = await response.json();
        console.log('Fetched challenges:', data); // Debug log
        setChallenges(data);
      } catch (error) {
        console.error('Error fetching challenges:', error);
      }
    }

    fetchUserEmail();
    fetchChallenges();
  }, [userId]);

  const handleInputChange = (index: number, field: string, value: any) => {
    setOverriddenConfig((prevConfig) =>
      prevConfig.map((appConfig, i) =>
        i === index ? { ...appConfig, [field]: value } : appConfig
      )
    );
  };

  const handleAddQuestion = (index: number, pageIndex: number) => {
    setAppsConfig(prevConfig => {
      const newConfig = [...prevConfig];
      const app = newConfig[index];
      
      if (app && app.pages && app.pages[pageIndex]) {
        const newPages = [...app.pages];
        const page = newPages[pageIndex];
        
        if (page && page.questions) {
          newPages[pageIndex] = {
            ...page,
            questions: [
              ...page.questions,
              {
                id: uuidv4(),
                type: 'text',
                content: '',
                points: 10
              }
            ]
          };
        }
        
        return newConfig.map((appConfig, i) => 
          i === index ? { ...appConfig, pages: newPages } : appConfig
        );
      }
      
      return newConfig;
    });
  };

  const handleRemoveQuestion = (index: number, pageIndex: number, questionIndex: number) => {
    setAppsConfig(prevConfig => {
      const newConfig = [...prevConfig];
      const app = newConfig[index];
      
      if (app && app.pages && app.pages[pageIndex]) {
        const newPages = [...app.pages];
        const page = newPages[pageIndex];
        
        if (page && page.questions) {
          newPages[pageIndex] = {
            ...page,
            questions: page.questions.filter((_, k: number) => k !== questionIndex)
          };
        }
        
        return newConfig.map((appConfig, i) => 
          i === index ? { ...appConfig, pages: newPages } : appConfig
        );
      }
      
      return newConfig;
    });
  };

  const handleCreateChallenge = async () => {
    setLoading(true);
    try {
      const appsConfigToUse = overriddenConfig.length > 0 ? overriddenConfig : appsConfig;
      const appsConfigString = JSON.stringify(appsConfigToUse);

      const response = await fetch('/api/challenges', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: '',
          description: '',
          challengeImage,
          challengeTypeId: '',
          difficulty: '',
          appsConfig: appsConfigString
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create challenge');
      }

      router.push('/dashboard/challenge');
    } catch (error) {
      console.error('Error creating challenge:', error);
      alert(error instanceof Error ? error.message : 'Error creating challenge');
    } finally {
      setLoading(false);
    }
  };

  const handleChallengeChange = (selectedChallengeId: string) => {
    setSelectedChallengeId(selectedChallengeId);
    const selectedChallenge = challenges.find(challenge => challenge.id === selectedChallengeId);
    if (selectedChallenge) {
      console.log('Selected challenge:', selectedChallenge); // Debug log
      setChallengeType(selectedChallenge.challengeType?.name || '');
      setChallengeImage(selectedChallenge.challengeImage || '');
      
      // Set app configs if available
      if (selectedChallenge.appConfigs && selectedChallenge.appConfigs.length > 0) {
        setAppsConfig(selectedChallenge.appConfigs);
        setOverriddenConfig(selectedChallenge.appConfigs);
      }
    }
  };

  return (
    <div className="flex-1 space-y-4 p-4 pt-6 md:p-8 bg-black text-white">
      <BreadCrumb items={breadcrumbItems} />
      <div className="space-y-4">
        <div>
          <Label htmlFor="userEmail">User Email</Label>
          <Input
              id="userEmail"
              value={userEmail}
              className="bg-gray-800 text-white"
              readOnly
          />
        </div>
        <div>
          <Label htmlFor="challenge">Challenge</Label>
          <select
              id="challenge"
              value={selectedChallengeId}
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
          <div
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm h-10 px-3 py-2 bg-gray-800 text-white flex items-center">
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
            appsConfig={overriddenConfig}
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            onInputChange={handleInputChange}
            onAddQuestion={handleAddQuestion}
            onRemoveQuestion={handleRemoveQuestion}
        />
      </div>
    </div>
  );
}
