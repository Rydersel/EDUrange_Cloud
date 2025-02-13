import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

async function globalTeardown() {
  console.log('\n🧹 Cleaning up test environment...');
  
  try {
    await prisma.$connect();
    
    // Clean up all test data in the correct order to respect foreign key constraints
    try {
      await prisma.questionCompletion.deleteMany({
        where: {
          user: {
            email: {
              endsWith: '@test.edurange.org'
            }
          }
        }
      });
      console.log('✓ Cleaned up QuestionCompletion');
    } catch (error) {
      console.warn('Warning: Could not clean up QuestionCompletion:', error);
    }

    try {
      await prisma.groupPoints.deleteMany({
        where: {
          user: {
            email: {
              endsWith: '@test.edurange.org'
            }
          }
        }
      });
      console.log('✓ Cleaned up GroupPoints');
    } catch (error) {
      console.warn('Warning: Could not clean up GroupPoints:', error);
    }

    try {
      await prisma.challengeInstance.deleteMany({
        where: {
          user: {
            email: {
              endsWith: '@test.edurange.org'
            }
          }
        }
      });
      console.log('✓ Cleaned up ChallengeInstance');
    } catch (error) {
      console.warn('Warning: Could not clean up ChallengeInstance:', error);
    }

    try {
      await prisma.groupChallenge.deleteMany({
        where: {
          group: {
            name: {
              startsWith: 'Test'
            }
          }
        }
      });
      console.log('✓ Cleaned up GroupChallenge');
    } catch (error) {
      console.warn('Warning: Could not clean up GroupChallenge:', error);
    }

    try {
      await prisma.challengeQuestion.deleteMany({
        where: {
          challenge: {
            name: {
              startsWith: 'Test'
            }
          }
        }
      });
      console.log('✓ Cleaned up ChallengeQuestion');
    } catch (error) {
      console.warn('Warning: Could not clean up ChallengeQuestion:', error);
    }

    try {
      await prisma.challenges.deleteMany({
        where: {
          name: {
            startsWith: 'Test'
          }
        }
      });
      console.log('✓ Cleaned up Challenges');
    } catch (error) {
      console.warn('Warning: Could not clean up Challenges:', error);
    }

    try {
      await prisma.challengeType.deleteMany({
        where: {
          name: {
            startsWith: 'Test'
          }
        }
      });
      console.log('✓ Cleaned up ChallengeType');
    } catch (error) {
      console.warn('Warning: Could not clean up ChallengeType:', error);
    }

    try {
      await prisma.competitionAccessCode.deleteMany({
        where: {
          group: {
            name: {
              startsWith: 'Test'
            }
          }
        }
      });
      console.log('✓ Cleaned up CompetitionAccessCode');
    } catch (error) {
      console.warn('Warning: Could not clean up CompetitionAccessCode:', error);
    }

    try {
      await prisma.competitionGroup.deleteMany({
        where: {
          name: {
            startsWith: 'Test'
          }
        }
      });
      console.log('✓ Cleaned up CompetitionGroup');
    } catch (error) {
      console.warn('Warning: Could not clean up CompetitionGroup:', error);
    }

    try {
      await prisma.user.deleteMany({
        where: {
          email: {
            endsWith: '@test.edurange.org'
          }
        }
      });
      console.log('✓ Cleaned up User');
    } catch (error) {
      console.warn('Warning: Could not clean up User:', error);
    }

    console.log('✓ All test data cleaned up');
  } catch (error) {
    console.error('❌ Error during test teardown:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

export default globalTeardown; 