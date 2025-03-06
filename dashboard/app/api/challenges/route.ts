import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { validateAndSanitize, validationSchemas } from '@/lib/validation';
import rateLimit from '@/lib/rate-limit';

// Create a rate limiter for challenge-related operations
const challengesRateLimiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  limit: 30, // 30 requests per minute
});

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
      ...Object.fromEntries(Object.entries(app.additional_config || {}))
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

export async function GET(req: NextRequest) {
  try {
    // Apply rate limiting
    const rateLimitResult = await challengesRateLimiter.check(req);
    if (rateLimitResult) return rateLimitResult;
    
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

// Define validation schema for creating a challenge
const createChallengeSchema = z.object({
  name: validationSchemas.challengeName,
  description: validationSchemas.challengeDescription,
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD', 'VERY_HARD']),
  challengeTypeId: validationSchemas.id,
  challengeImage: z.string(),
  questions: z.array(z.object({
    content: z.string().min(5, 'Question content must be at least 5 characters'),
    type: z.enum(['text', 'multiple_choice', 'code']),
    points: z.number().min(1, 'Points must be at least 1'),
    answer: z.string(),
    options: z.array(z.string()).optional(),
    order: z.number().optional()
  })).min(1, 'At least one question is required')
});

export async function POST(req: NextRequest) {
  try {
    // Apply rate limiting
    const rateLimitResult = await challengesRateLimiter.check(req);
    if (rateLimitResult) return rateLimitResult;
    
    const session = await getServerSession(authOptions);

    if (!session) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true }
    });

    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Parse and validate request body
    const body = await req.json();
    const validationResult = validateAndSanitize(createChallengeSchema, body);

    if (!validationResult.success) {
      return NextResponse.json({ error: validationResult.error }, { status: 400 });
    }

    const { name, description, difficulty, challengeTypeId, challengeImage, questions } = validationResult.data;

    // Create the challenge
    const challenge = await prisma.challenges.create({
      data: {
        name,
        description,
        difficulty,
        challengeTypeId,
        challengeImage,
        questions: {
          create: questions.map((q, index) => ({
            content: q.content,
            type: q.type,
            points: q.points,
            answer: q.answer,
            options: q.options,
            order: q.order ?? index + 1 // Use provided order or generate based on index
          }))
        }
      },
      include: {
        questions: true
      }
    });

    return NextResponse.json(challenge, { status: 201 });
  } catch (error) {
    console.error('Error creating challenge:', error);
    return NextResponse.json({ error: 'Failed to create challenge' }, { status: 500 });
  }
}
