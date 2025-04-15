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
  is_cdf_based?: boolean;
  format_version?: string;
}

export interface CdfChallengeInput extends Omit<ChallengeInput, 'appConfigs' | 'questions'> {
  is_cdf_based: true;
  format_version: string;
  cdf_content: any; // Full CDF content as JSON
  appConfigs?: ChallengeAppConfigInput[]; // Optional in CDF format
  questions?: ChallengeQuestionInput[]; // Optional in CDF format
}

export type ChallengeInputType = ChallengeInput | CdfChallengeInput;

export interface ChallengeModuleFile {
  moduleName: string;
  moduleDescription: string;
  author: string;
  version: string;
  createdAt: string;
  format?: 'standard' | 'cdf'; // Indicates which format the module uses
  type?: 'traditional' | 'cdf'; // Indicates source/type of the module
  challenges: ChallengeInputType[];
} 