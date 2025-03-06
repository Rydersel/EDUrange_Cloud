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
    // @ts-ignore
    const challenge = await prisma.challenges.findUnique({
      where: { id: challengeId },
      include: {
        // @ts-ignore
        questions: {
          orderBy: {
            order: 'asc'
          }
        },
        // @ts-ignore
        appConfigs: true
      }
    });

    if (!challenge) {
      throw new Error('Challenge not found');
    }

    // Get user's completions for this challenge
    // @ts-ignore
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
      challengeImage: challenge.challengeImage,
      difficulty: challenge.difficulty,
      AppsConfig: challenge.appConfigs ? transformToWebOSFormat(challenge.appConfigs) : []
    };

    return webosConfig;
  }

  // Get challenge configurations for a competition
  async getCompetitionChallengeConfigs(
    groupId: string,
    userId: string
  ): Promise<WebOSChallengeConfig[]> {
    // @ts-ignore
    const groupChallenges = await prisma.groupChallenge.findMany({
      where: {
        groupId,
      },
      include: {
        // @ts-ignore
        challenge: {
          include: {
            // @ts-ignore
            questions: {
              orderBy: {
                order: 'asc'
              }
            },
            // @ts-ignore
            appConfigs: true
          }
        }
      }
    });

    // Transform each challenge to WebOS format
    const configs: WebOSChallengeConfig[] = groupChallenges
      .filter(gc => gc.challenge) // Filter out any null challenges
      .map(gc => {
        // @ts-ignore
        if (!gc.challenge) {
          throw new Error('Challenge not found in group challenge');
        }

        // Create a WebOSChallengeConfig object
        const challenge = gc.challenge;
        return {
          id: challenge.id,
          name: challenge.name,
          description: challenge.description || '',
          challengeImage: challenge.challengeImage,
          difficulty: challenge.difficulty,
          AppsConfig: challenge.appConfigs ? transformToWebOSFormat(challenge.appConfigs) : []
        };
      });

    return configs;
  }
} 