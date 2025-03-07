import dotenv from 'dotenv';
import path from 'path';
import prisma from '../utils/prisma-test-client';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function globalTeardown() {
  console.log('\n🧹 Cleaning up test environment...');

  try {
    await prisma.$disconnect();
    console.log('✓ Database disconnected');
  } catch (error) {
    console.error('❌ Error during test teardown:', error);
    await prisma.$disconnect();
  }
}

export default globalTeardown;
