import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { Prisma } from '@prisma/client';

type ChallengeWithDetails = Prisma.ChallengesGetPayload<{
  include: {
    challengeType: true;
    questions: true;
    appConfigs: true;
  };
}>;

function transformToWebOSFormat(challenge: ChallengeWithDetails) {
  // Transform questions into challenge prompt app config
  const questionPages = challenge.questions.reduce((acc: Array<{
    instructions: string;
    questions: Array<{
      type: string;
      content: string;
      id: string;
      points: number;
      answer?: string;
    }>;
  }>, question) => {
    if (!acc.length) {
      acc.push({
        instructions: "Complete the following questions:",
        questions: []
      });
    }
    acc[0].questions.push({
      type: question.type,
      content: question.content,
      id: question.id,
      points: question.points,
      answer: question.answer
    });
    return acc;
  }, []);

  const challengePromptApp = {
    id: 'challenge-prompt',
    icon: './icons/prompt.svg',
    title: 'Challenge Prompt',
    width: 70,
    height: 80,
    screen: 'displayChallengePrompt',
    disabled: false,
    favourite: true,
    desktop_shortcut: true,
    launch_on_startup: true,
    description: challenge.description || 'Complete the challenge questions',
    challenge: {
      type: 'single',
      title: challenge.name,
      description: challenge.description || '',
      pages: questionPages
    }
  };

  // Transform app configs and add challenge prompt
  const appsConfig = [
    challengePromptApp,
    ...challenge.appConfigs.map(app => ({
      id: app.appId,
      icon: app.icon,
      title: app.title,
      width: app.width,
      height: app.height,
      screen: app.screen,
      disabled: app.disabled,
      favourite: app.favourite,
      desktop_shortcut: app.desktop_shortcut,
      launch_on_startup: app.launch_on_startup,
      ...(app.additional_config || {})
    }))
  ];

  return {
    id: challenge.id,
    name: challenge.name,
    description: challenge.description,
    challengeImage: challenge.challengeImage,
    difficulty: challenge.difficulty,
    AppsConfig: appsConfig
  };
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const challenges = await prisma.challenges.findMany({
      include: {
        challengeType: true,
        questions: true,
        appConfigs: true
      }
    });

    return NextResponse.json(challenges);
  } catch (error) {
    console.error('Error fetching challenges:', error);
    return NextResponse.json({ error: 'Failed to fetch challenges' }, { status: 500 });
  }
}
