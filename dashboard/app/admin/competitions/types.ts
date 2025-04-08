export interface User {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  groupPoints: Array<{ points: number }>;
}

export interface ChallengeType {
  id: string;
  name: string;
}

export interface Challenge {
  id: string;
  name: string;
  challengeImage: string;
  challengeType: ChallengeType;
}

export interface GroupChallenge {
  id: string;
  points: number;
  challenge: Challenge;
  completions: Array<{}>;
}

export interface AccessCode {
  id: string;
  code: string;
  expiresAt: string | null;
  maxUses: number | null;
  usedCount: number;
  createdAt: string;
  createdBy: string;
  groupId: string;
}

export interface Competition {
  id: string;
  name: string;
  description: string | null;
  startDate: string;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
  _count: {
    members: number;
    challenges: number;
  };
  members: User[];
  challenges: GroupChallenge[];
  accessCodes: AccessCode[];
  instructors: Array<{ id: string }>;
}

export interface CompetitionDetailsProps {
  competition: Competition;
  isInstructor: boolean;
}

export interface ExpiryOption {
  id: string;
  label: string;
  getValue?: () => Date;
} 