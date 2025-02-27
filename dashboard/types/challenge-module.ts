import { ChallengeDifficulty } from '@prisma/client';

export interface ChallengeAppConfigInput {
  appId: string;
  title: string;
  icon: string;
  width: number;
  height: number;
  screen: string;
  disabled?: boolean;
  favourite?: boolean;
  desktop_shortcut?: boolean;
  launch_on_startup?: boolean;
  additional_config?: string;
}

export interface ChallengeQuestionInput {
  content: string;
  type: string;
  points: number;
  answer: string;
  order: number;
}

export interface ChallengeInput {
  name: string;
  challengeImage: string;
  difficulty: ChallengeDifficulty;
  description?: string;
  challengeType: string;
  appConfigs: ChallengeAppConfigInput[];
  questions: ChallengeQuestionInput[];
}

export interface ChallengeModuleFile {
  moduleName: string;
  moduleDescription: string;
  author: string;
  version: string;
  createdAt: string;
  challenges: ChallengeInput[];
} 