import { prisma } from '@/lib/prisma';
import { transformToWebOSFormat, WebOSChallengeConfig, WebOSAppConfig } from './transform';
// @ts-ignore
import { Challenges, ChallengeQuestion, QuestionCompletion } from '@prisma/client';

export class WebOSService {
  // Get challenge configuration for WebOS
  async getChallengeConfig(
    challengeId: string,
    userId: string
  ): Promise<WebOSChallengeConfig> {
    // Fetch challenge data with questions and app configs
    const challenge = await prisma.challenge.findUnique({
      where: { id: challengeId },
      include: {
        challengeType: true,
        questions: {
          orderBy: {
            order: 'asc'
          }
        },
        appConfigs: true
      }
    });

    if (!challenge) {
      throw new Error('Challenge not found');
    }

    // Get user's completions for this challenge
    const completions = await prisma.questionCompletion.findMany({
      where: {
        userId,
        question: {
          challengeId
        }
      }
    });

    // Transform to WebOS format
    // Create a WebOSChallengeConfig object
    const webosConfig: WebOSChallengeConfig = {
      id: challenge.id,
      name: challenge.name,
      description: challenge.description || '',
      challengeImage: challenge.challengeType.name, // Use challenge type name as the image identifier
      difficulty: challenge.challengeType.name, // Use challenge type name as the difficulty
      AppsConfig: challenge.appConfigs ? transformToWebOSFormat(challenge.appConfigs) : []
    };

    return webosConfig;
  }

  // Get challenge configurations for a competition
  async getCompetitionChallengeConfigs(
    groupId: string,
    userId: string
  ): Promise<WebOSChallengeConfig[]> {
    const groupChallenges = await prisma.groupChallenge.findMany({
      where: {
        groupId,
      },
      include: {
        challenge: {
          include: {
            challengeType: true,
            questions: {
              orderBy: {
                order: 'asc'
              }
            },
            appConfigs: true
          }
        }
      }
    });

    // Transform each challenge to WebOS format
    const configs = groupChallenges
      .filter(gc => gc.challenge) // Filter out any null challenges
      .map(gc => {
        if (!gc.challenge) {
          throw new Error('Challenge not found in group challenge');
        }

        // Create a WebOSChallengeConfig object
        const challenge = gc.challenge;
        return {
          id: challenge.id,
          name: challenge.name,
          description: challenge.description || '',
          challengeImage: challenge.challengeType.name, // Use challenge type name as image
          difficulty: challenge.challengeType.name, // Use challenge type name as difficulty
          AppsConfig: challenge.appConfigs ? transformToWebOSFormat(challenge.appConfigs) : []
        } as WebOSChallengeConfig;
      });

    return configs;
  }
} 