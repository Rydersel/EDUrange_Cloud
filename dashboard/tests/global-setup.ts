import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

async function globalSetup() {
  console.log('🚀 Setting up test environment...');
  
  try {
    // Test database connection
    await prisma.$connect();
    console.log('✓ Database connection successful');

    // Clean up any leftover test data
    await cleanup();
    console.log('✓ Initial cleanup completed');

    // Set up any required test data
    await setupTestData();
    console.log('✓ Test data initialized');

  } catch (error) {
    console.error('❌ Error during test setup:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

async function cleanup() {
  try {
    // Delete in order to respect foreign key constraints
    await prisma.questionCompletion.deleteMany({
      where: {
        userId: { startsWith: 'test-' }
      }
    });

    await prisma.groupPoints.deleteMany({
      where: {
        userId: { startsWith: 'test-' }
      }
    });

    await prisma.challengeInstance.deleteMany({
      where: {
        userId: { startsWith: 'test-' }
      }
    });

    await prisma.groupChallenge.deleteMany({
      where: {
        groupId: { startsWith: 'test-' }
      }
    });

    await prisma.challengeQuestion.deleteMany({
      where: {
        challengeId: { startsWith: 'test-' }
      }
    });

    await prisma.challenges.deleteMany({
      where: {
        id: { startsWith: 'test-' }
      }
    });

    await prisma.challengeType.deleteMany({
      where: {
        id: { startsWith: 'test-' }
      }
    });

    await prisma.competitionAccessCode.deleteMany({
      where: {
        groupId: { startsWith: 'test-' }
      }
    });

    await prisma.competitionGroup.deleteMany({
      where: {
        id: { startsWith: 'test-' }
      }
    });

    await prisma.user.deleteMany({
      where: {
        id: { startsWith: 'test-' }
      }
    });
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
}

async function setupTestData() {
  try {
    // Create default challenge type with a UUID
    await prisma.challengeType.upsert({
      where: { id: 'test-type-default' },
      update: {},
      create: {
        id: 'test-type-default',
        name: 'Test Type'
      }
    });
  } catch (error) {
    console.warn('Warning: Could not create default challenge type:', error);
  }
}

export default globalSetup; 