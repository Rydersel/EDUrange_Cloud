import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import authConfig from '@/auth.config';
import { prisma } from '@/lib/prisma';
import { ChallengeModuleFile } from '@/types/challenge-module';
import rateLimit from '@/lib/rate-limit';
import { z } from 'zod';
import { validateAndSanitize, validationSchemas } from '@/lib/validation';
import { ChallengeDifficulty } from '@prisma/client';

// Create a rate limiter for operations
const adminRateLimiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  limit: 20, // 20 requests per minute
});

// Define validation schema for challenge module
const challengeQuestionSchema = z.object({
  content: z.string().min(5, 'Question content must be at least 5 characters'),
  type: z.enum(['text', 'multiple_choice', 'code']),
  points: z.number().min(1, 'Points must be at least 1'),
  answer: z.string().optional(),
  options: z.array(z.string()).optional(),
  order: z.number().optional()
});

const appConfigSchema = z.object({
  appId: z.string(),
  title: z.string(),
  icon: z.string(),
  width: z.number(),
  height: z.number(),
  screen: z.string(),
  disabled: z.boolean().optional(),
  favourite: z.boolean().optional(),
  desktop_shortcut: z.boolean().optional(),
  launch_on_startup: z.boolean().optional(),
  additional_config: z.string().optional()
});

// Map the difficulty values to match the enum
const difficultyMap: Record<string, ChallengeDifficulty> = {
  'easy': 'EASY',
  'medium': 'MEDIUM',
  'hard': 'HARD'
};

const challengeSchema = z.object({
  name: validationSchemas.challengeName,
  description: validationSchemas.challengeDescription,
  difficulty: z.enum(['easy', 'medium', 'hard']),
  challengeType: z.string().optional(),
  challengeImage: z.string().optional(),
  questions: z.array(challengeQuestionSchema).min(1, 'At least one question is required'),
  appConfigs: z.array(appConfigSchema).optional()
});

const challengeModuleSchema = z.object({
  moduleName: z.string().min(3, 'Module name must be at least 3 characters'),
  challenges: z.array(challengeSchema).min(1, 'At least one challenge is required')
});

export async function POST(req: NextRequest) {
  try {
    // Apply rate limiting
    const rateLimitResult = await adminRateLimiter.check(req);
    if (rateLimitResult) return rateLimitResult;
    
    // Check authentication and authorization
    const session = await getServerSession(authConfig);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true }
    });

    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Parse the request body
    const data = await req.json();
    
    // Validate and sanitize input
    const validationResult = validateAndSanitize(challengeModuleSchema, data);
    
    if (!validationResult.success) {
      return NextResponse.json({ 
        success: false, 
        error: validationResult.error 
      }, { status: 400 });
    }
    
    const challengeModule = validationResult.data;

    // Create each challenge in the module
    const createdChallenges = [];
    for (const challengeData of challengeModule.challenges) {
      // Find or create the challenge type
      let challengeType = await prisma.challengeType.findFirst({
        where: {
          name: challengeData.challengeType || 'fullos'
        }
      });

      if (!challengeType) {
        challengeType = await prisma.challengeType.create({
          data: {
            name: challengeData.challengeType || 'fullos'
          }
        });
      }

      // Create the challenge
      const challenge = await prisma.challenges.create({
        data: {
          name: challengeData.name,
          challengeImage: challengeData.challengeImage || '',
          difficulty: difficultyMap[challengeData.difficulty],
          description: challengeData.description,
          challengeTypeId: challengeType.id,
        }
      });

      // Create questions for the challenge
      for (const questionData of challengeData.questions) {
        await prisma.challengeQuestion.create({
          data: {
            challengeId: challenge.id,
            content: questionData.content,
            type: questionData.type,
            points: questionData.points,
            answer: questionData.answer || '',
            order: questionData.order || 0
          }
        });
      }

      // Create app configurations for the challenge
      if (challengeData.appConfigs) {
        for (const appConfigData of challengeData.appConfigs) {
          await prisma.challengeAppConfig.create({
            data: {
              challengeId: challenge.id,
              appId: appConfigData.appId,
              title: appConfigData.title,
              icon: appConfigData.icon,
              width: appConfigData.width,
              height: appConfigData.height,
              screen: appConfigData.screen,
              disabled: appConfigData.disabled || false,
              favourite: appConfigData.favourite || false,
              desktop_shortcut: appConfigData.desktop_shortcut || false,
              launch_on_startup: appConfigData.launch_on_startup || false,
              additional_config: appConfigData.additional_config || '{}'
            }
          });
        }
      }

      createdChallenges.push({
        id: challenge.id,
        name: challenge.name
      });
    }

    // Log the activity
    await prisma.activityLog.create({
      data: {
        eventType: 'SYSTEM_ERROR',
        severity: 'INFO',
        userId: session.user.id,
        metadata: {
          action: 'CHALLENGE_MODULE_INSTALLED',
          moduleName: challengeModule.moduleName,
          challengesCount: createdChallenges.length
        }
      }
    });

    return NextResponse.json({
      success: true,
      message: `Successfully installed ${createdChallenges.length} challenges from module "${challengeModule.moduleName}"`,
      challenges: createdChallenges
    });
  } catch (error) {
    console.error('Error installing challenge module:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ 
        success: false, 
        errors: error.errors 
      }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to install challenge module' }, { status: 500 });
  }
} 