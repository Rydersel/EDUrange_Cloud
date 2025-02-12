import { prisma } from '@/lib/prisma';
import { transformToWebOSFormat, WebOSChallengeConfig } from './transform';
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
    // @ts-ignore
    return transformToWebOSFormat({
      ...challenge,
      questions: challenge.questions,
      appConfigs: challenge.appConfigs
    }, completions);
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
        group: {
          members: {
            some: {
              id: userId
            }
          }
        }
      },
      include: {
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

    const configs = await Promise.all(
      groupChallenges.map(async gc => {
        // Get user's completions for this challenge
        // @ts-ignore
        const completions = await prisma.questionCompletion.findMany({
          where: {
            userId,
            groupChallengeId: gc.id
          }
        });

        // @ts-ignore
        if (!gc.challenge) {
          throw new Error('Challenge not found in group challenge');
        }

        // Transform to WebOS format
        // @ts-ignore
        return transformToWebOSFormat({
          ...gc.challenge,
          questions: gc.challenge.questions,
          appConfigs: gc.challenge.appConfigs
        }, completions);
      })
    );

    return configs;
  }
} 