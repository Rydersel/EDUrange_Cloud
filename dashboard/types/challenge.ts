import { ChallengeDifficulty } from '@prisma/client';

export interface ChallengeQuestion {
  id: string;
  points: number;
}

export interface ChallengeAppConfig {
  id: string;
}

export interface ChallengeType {
  id: string;
  name: string;
}

export interface Challenge {
  id: string;
  name: string;
  description: string;
  difficulty: ChallengeDifficulty;
  challengeTypeId: string;
  pack_id: string | null;
  pack_challenge_id: string | null;
  challengeType: ChallengeType;
  questions: ChallengeQuestion[];
  appConfigs: ChallengeAppConfig[];
}

export interface ChallengeSummary {
  totalChallenges: number;
  totalTypes: number;
  totalQuestions: number;
  totalPoints: number;
}

export type ChallengesByType = {
  [key: string]: Challenge[];
};

