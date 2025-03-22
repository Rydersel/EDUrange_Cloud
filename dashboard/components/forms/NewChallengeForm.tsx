'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import BreadCrumb from '@/components/navigation/breadcrumb';
import { LoadingButton } from '@/components/ui/loading-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AppConfigModal } from '@/components/modal/AppConfigModal';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { devLog, errorLog } from '@/lib/logger';

const breadcrumbItems = [
  { title: 'Challenges', link: '/dashboard/challenge' },
  { title: 'Create', link: '/dashboard/challenge/new' }
];

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
  const { toast } = useToast();
  const [challengeImage, setChallengeImage] = useState<string>('');
  const [challengeType, setChallengeType] = useState<string>('');
  const [challenges, setChallenges] = useState<any[]>([]);
  const [challengeTypes, setChallengeTypes] = useState<any[]>([]);
  const [appsConfig, setAppsConfig] = useState<AppConfig[]>([]);
  const [overriddenConfig, setOverriddenConfig] = useState<AppConfig[]>([]);
  const [selectedChallengeId, setSelectedChallengeId] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [userEmail, setUserEmail] = useState<string>('');
  const router = useRouter();

  useEffect(() => {
    fetchUserData();
    fetchChallenges();
    fetchChallengeTypes();
  }, [userId]);

  const fetchUserData = async () => {
    try {
      const response = await fetch(`/api/users/${userId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch user data');
      }
      const data = await response.json();
      if (data && data.email) {
        setUserEmail(data.email);
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
      setError('Failed to load user information');
    }
  };

  const fetchChallenges = async () => {
    try {
      const response = await fetch('/api/challenges');
      if (!response.ok) {
        throw new Error('Failed to fetch challenges');
      }
      const data = await response.json();
      setChallenges(data);
    } catch (error) {
      console.error('Error fetching challenges:', error);
      setError('Failed to load available challenges');
    }
  };

  const fetchChallengeTypes = async () => {
    try {
      const response = await fetch('/api/challenge-types');
      if (!response.ok) {
        throw new Error('Failed to fetch challenge types');
      }
      const data = await response.json();
      if (data && Array.isArray(data)) {
        setChallengeTypes(data);
      }
    } catch (error) {
      console.error('Error fetching challenge types:', error);
      // Not setting error here as it's not critical
    }
  };

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
    setError(null);
    
    try {
      if (!challengeImage || !challengeType) {
        throw new Error('Please select a challenge and challenge type');
      }
      
      const appsConfigToUse = overriddenConfig.length > 0 ? overriddenConfig : appsConfig;
      
      // Create the instance using the instance manager proxy
      const response = await fetch('/api/instance-manager-proxy?path=start-challenge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          user_id: userId,
          challenge_image: challengeImage,
          apps_config: appsConfigToUse.length > 0 ? JSON.stringify(appsConfigToUse) : null,
          chal_type: challengeType.toLowerCase(),
          competition_id: "standalone"  // Use standalone for non-competition challenges
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || errorData.message || 'Failed to create challenge instance');
      }

      const instanceData = await response.json();
      
      toast({
        title: 'Success',
        description: 'Challenge instance created successfully',
      });

      // Redirect to the instances page
      router.push('/dashboard/challenge');
    } catch (error) {
      console.error('Error creating challenge instance:', error);
      setError(error instanceof Error ? error.message : 'Failed to create challenge instance');
      
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create challenge instance',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleChallengeChange = (selectedChallengeId: string) => {
    setSelectedChallengeId(selectedChallengeId);
    const selectedChallenge = challenges.find(challenge => challenge.id === selectedChallengeId);
    if (selectedChallenge) {
      devLog('Selected challenge:', selectedChallenge); // Debug log
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
    <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
      <BreadCrumb items={breadcrumbItems} />
      
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      
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
        <div>
          <Label htmlFor="challengeImage">Challenge Image</Label>
          <div
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm h-10 px-3 py-2 bg-gray-800 text-white flex items-center font-mono text-xs overflow-auto">
            {challengeImage || 'Select a challenge to see its image'}
          </div>
        </div>
        <Button variant="secondary" size='sm' onClick={() => setIsModalOpen(true)}>
          Configure Apps
        </Button>
        <div className="mb-4">
          <LoadingButton onClick={handleCreateChallenge} loading={loading}>
            Create Challenge Instance
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
