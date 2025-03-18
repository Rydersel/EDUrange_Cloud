import dotenv from 'dotenv';
import path from 'path';
import prisma from '../utils/prisma-test-client';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function globalSetup() {
  console.log('🚀 Setting up test environment...');
  try {
    await prisma.$connect();
    console.log('✓ Database connection successful');

  } catch (error) {
    console.error('❌ Error during test setup:', error);
  }
}

export default globalSetup;
