import { Prisma } from '@prisma/client';

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

type ChallengeAppConfig = {
  appId: string;
  icon: string;
  title: string;
  width: number;
  height: number;
  screen: string;
  disabled: boolean;
  favourite: boolean;
  desktop_shortcut: boolean;
  launch_on_startup: boolean;
  additional_config?: any;
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
  description?: string;
  challenge?: {
    type: string;
    title: string;
    description: string;
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
  [key: string]: any; // For additional app-specific config
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
  return {
    id: appConfig.appId,
    icon: appConfig.icon,
    title: appConfig.title,
    width: appConfig.width,
    height: appConfig.height,
    screen: appConfig.screen,
    disabled: appConfig.disabled,
    favourite: appConfig.favourite,
    desktop_shortcut: appConfig.desktop_shortcut,
    launch_on_startup: appConfig.launch_on_startup,
    ...(appConfig.additional_config || {})
  };
}

export function transformToWebOSFormat(
  challenge: {
    id: string;
    name: string;
    description?: string;
    challengeImage: string;
    difficulty: string;
    questions: ChallengeQuestion[];
    appConfigs?: ChallengeAppConfig[];
  },
  userCompletions?: QuestionCompletion[]
): WebOSChallengeConfig {
  const questions = challenge.questions || [];
  if (userCompletions) {
    questions.forEach(q => {
      q.completions = userCompletions.filter(c => c.questionId === q.id);
    });
  }

  const totalPoints = questions.reduce((sum: number, q: ChallengeQuestion) => sum + q.points, 0);
  const earnedPoints = userCompletions 
    ? userCompletions.reduce((sum: number, c: QuestionCompletion) => sum + c.pointsEarned, 0)
    : 0;
  const completed = questions.length > 0 && questions.every(q => 
    userCompletions?.some(c => c.questionId === q.id)
  );

  const promptApp = transformQuestionsToPromptApp(
    questions,
    challenge.name,
    challenge.description
  );

  const appConfigs = challenge.appConfigs?.map(transformAppConfig) || [];

  return {
    id: challenge.id,
    name: challenge.name,
    description: challenge.description,
    challengeImage: challenge.challengeImage,
    difficulty: challenge.difficulty,
    totalPoints,
    earnedPoints,
    completed,
    AppsConfig: [promptApp, ...appConfigs]
  };
} 
