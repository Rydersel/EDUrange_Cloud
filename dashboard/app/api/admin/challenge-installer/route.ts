import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import authConfig from '@/auth.config';
import { prisma } from '@/lib/prisma';
import { ChallengeModuleFile } from '@/types/challenge-module';

export async function POST(req: NextRequest) {
  try {
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
    const challengeModule = data as ChallengeModuleFile;

    // Validate the challenge module data
    if (!challengeModule.moduleName || !challengeModule.challenges || challengeModule.challenges.length === 0) {
      return NextResponse.json({ error: 'Invalid challenge module data' }, { status: 400 });
    }

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
          challengeImage: challengeData.challengeImage,
          difficulty: challengeData.difficulty,
          description: challengeData.description || null,
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
            answer: questionData.answer,
            order: questionData.order
          }
        });
      }

      // Create app configurations for the challenge
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
    return NextResponse.json({ error: 'Failed to install challenge module' }, { status: 500 });
  }
} 