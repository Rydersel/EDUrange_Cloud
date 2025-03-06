import { prisma } from './prisma';

export async function getChallengeImages() {
  return prisma.challenges.findMany({
    include: {
      challengeType: true,
    },
  });
}

export async function getChallengeTypes() {
  return prisma.challengeType.findMany();
}
