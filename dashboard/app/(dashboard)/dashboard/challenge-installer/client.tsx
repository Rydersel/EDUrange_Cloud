'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, Upload, PackagePlus } from 'lucide-react';
import FileUploader from '@/components/challenge-installer/file-uploader';
import FeaturedModules from '@/components/challenge-installer/featured-modules';
import ChallengeModulePreview from '@/components/challenge-installer/challenge-module-preview';
import { ChallengeModuleFile } from '@/types/challenge-module';

export default function ChallengeInstallerClient() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('upload');
  const [challengeModule, setChallengeModule] = useState<ChallengeModuleFile | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);
  const [installSuccess, setInstallSuccess] = useState(false);
  const [duplicates, setDuplicates] = useState<{ name: string }[]>([]);
  const [successMessage, setSuccessMessage] = useState<string>('');

  const handleFileLoaded = (data: ChallengeModuleFile) => {
    setChallengeModule(data);
    setActiveTab('review');
    setInstallError(null);
    setInstallSuccess(false);
    setDuplicates([]);
    setSuccessMessage('');
  };

  const handleModuleSelected = (data: ChallengeModuleFile) => {
    setChallengeModule(data);
    setActiveTab('review');
    setInstallError(null);
    setInstallSuccess(false);
    setDuplicates([]);
    setSuccessMessage('');
  };

  const handleInstall = async () => {
    if (!challengeModule) return;

    setIsInstalling(true);
    setInstallError(null);
    setDuplicates([]);
    setSuccessMessage('');
    
    try {
      const response = await fetch('/api/admin/challenge-installer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(challengeModule),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to install challenge module');
      }

      setInstallSuccess(true);
      
      // Set duplicates if any were returned
      if (data.duplicates && data.duplicates.length > 0) {
        setDuplicates(data.duplicates);
      }
      
      // Set success message
      if (data.message) {
        setSuccessMessage(data.message);
      }
      
      // Refresh the page after a successful installation
      setTimeout(() => {
        router.refresh();
      }, 2000);
    } catch (error) {
      setInstallError(error instanceof Error ? error.message : 'An unknown error occurred');
    } finally {
      setIsInstalling(false);
    }
  };

  const handleReset = () => {
    setChallengeModule(null);
    setActiveTab('upload');
    setInstallError(null);
    setInstallSuccess(false);
    setDuplicates([]);
    setSuccessMessage('');
  };

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="upload" disabled={isInstalling}>
          <Upload className="mr-2 h-4 w-4" />
          Upload Module
        </TabsTrigger>
        <TabsTrigger value="browse" disabled={isInstalling}>
          <PackagePlus className="mr-2 h-4 w-4" />
          Browse Popular Modules
        </TabsTrigger>
        <TabsTrigger value="review" disabled={!challengeModule || isInstalling}>
          <Download className="mr-2 h-4 w-4" />
          Review and Install
        </TabsTrigger>
      </TabsList>

      <TabsContent value="upload" className="space-y-4 max-h-[calc(100vh-220px)] overflow-y-auto pr-2 pb-16">
        <Card>
          <CardHeader>
            <CardTitle>Upload Challenge Module</CardTitle>
            <CardDescription>
              Upload a JSON file containing a module of challenges to install
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FileUploader onFileLoaded={handleFileLoaded} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Challenge Module Format</CardTitle>
            <CardDescription>
              The challenge module file should be in JSON format and include the following structure
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="bg-muted p-4 rounded-md overflow-auto text-xs text-foreground border">
{`{
  "moduleName": "Module Name",
  "moduleDescription": "Description of the challenge module",
  "author": "Author Name",
  "version": "1.0.0",
  "createdAt": "2023-01-01T00:00:00Z",
  "challenges": [
    {
      "name": "Challenge Name",
      "challengeImage": "registry.example.com/image-name",
      "difficulty": "EASY", // EASY, MEDIUM, HARD, VERY_HARD
      "challengeType": "fullos", // fullos, web, etc.
      "description": "Challenge description",
      "appConfigs": [
        {
          "appId": "terminal",
          "title": "Terminal",
          "icon": "./icons/terminal.svg",
          "width": 60,
          "height": 75,
          "screen": "displayTerminal",
          "disabled": false,
          "favourite": true,
          "desktop_shortcut": true,
          "launch_on_startup": false,
          "additional_config": "{}"
        }
      ],
      "questions": [
        {
          "content": "Question text",
          "type": "text", // text, flag
          "points": 10,
          "answer": "answer",
          "order": 1
        }
      ]
    }
  ]
}`}
            </pre>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="browse" className="space-y-4 max-h-[calc(100vh-220px)] overflow-y-auto pr-2 pb-16">
        <Card>
          <CardHeader>
            <CardTitle>Browse Popular Modules</CardTitle>
            <CardDescription>
              Select from our collection of pre-configured challenge modules
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FeaturedModules onModuleSelected={handleModuleSelected} />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="review" className="space-y-4 max-h-[calc(100vh-220px)] overflow-y-auto pr-2 pb-16">
        {challengeModule && (
          <ChallengeModulePreview
            challengeModule={challengeModule}
            onInstall={handleInstall}
            isInstalling={isInstalling}
            installError={installError}
            installSuccess={installSuccess}
            duplicates={duplicates}
            successMessage={successMessage}
          />
        )}
      </TabsContent>
    </Tabs>
  );
} 