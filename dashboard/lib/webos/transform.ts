import { Prisma, ChallengeAppConfig } from '@prisma/client';

type ChallengeQuestion = {
  id: string;
  type: string;
  content: string;
  points: number;
  answer: string;
  order: number;
  completions?: QuestionCompletion[];
};

type QuestionCompletion = {
  id: string;
  questionId: string;
  pointsEarned: number;
};

export interface WebOSAppConfig {
  id: string;
  icon: string;
  title: string;
  width: number;
  height: number;
  screen: string;
  disabled: boolean;
  favourite: boolean;
  desktop_shortcut: boolean;
  launch_on_startup: boolean;
  challenge?: {
    type: string;
    title: string;
    description: string;
    flagSecretName?: string;
    pages: {
      instructions: string;
      questions: {
        id: string;
        type: string;
        content: string;
        points: number;
        completed?: boolean;
        answer?: string;
      }[];
    }[];
  };
  [key: string]: any;
}

export interface WebOSChallengeConfig {
  id: string;
  name: string;
  description?: string;
  challengeImage: string;
  difficulty: string;
  totalPoints?: number;
  earnedPoints?: number;
  completed?: boolean;
  AppsConfig: WebOSAppConfig[];
}

export function transformQuestionsToPromptApp(
  questions: ChallengeQuestion[],
  challengeName: string,
  description: string = ''
): WebOSAppConfig {
  return {
    id: 'challenge-prompt',
    icon: './icons/prompt.svg',
    title: 'Challenge',
    width: 70,
    height: 80,
    screen: 'displayChallengePrompt',
    disabled: false,
    favourite: true,
    desktop_shortcut: true,
    launch_on_startup: true,
    description: description || 'Complete the challenge questions',
    challenge: {
      type: 'single',
      title: challengeName,
      description: description || '',
      pages: [{
        instructions: "Complete the following questions:",
        questions: questions.map(q => ({
          id: q.id,
          type: q.type,
          content: q.content,
          points: q.points,
          completed: q.completions && q.completions.length > 0,
          ...(q.type === 'text' && { answer: q.answer }) // Only include answer for text questions
        }))
      }]
    }
  };
}

export function transformAppConfig(appConfig: ChallengeAppConfig): WebOSAppConfig {
  // Create base config with only the fields WebOS expects
  const transformed: WebOSAppConfig = {
    id: appConfig.appId, // Use appId as the id
    icon: appConfig.icon,
    title: appConfig.title,
    width: appConfig.width,
    height: appConfig.height,
    screen: appConfig.screen,
    disabled: appConfig.disabled,
    favourite: appConfig.favourite,
    desktop_shortcut: appConfig.desktop_shortcut,
    launch_on_startup: appConfig.launch_on_startup,
  };

  // Add additional config properties to root if they exist
  if (appConfig.additional_config) {
    const additionalConfig = typeof appConfig.additional_config === 'string' 
      ? JSON.parse(appConfig.additional_config)
      : appConfig.additional_config;
      
    Object.assign(transformed, additionalConfig);
  }

  return transformed;
}

export function transformToWebOSFormat(appConfigs: ChallengeAppConfig[]): WebOSAppConfig[] {
  return appConfigs.map(transformAppConfig);
} 
