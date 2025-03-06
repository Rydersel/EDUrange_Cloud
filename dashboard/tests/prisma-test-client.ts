import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Create a single PrismaClient instance for all tests
const prismaTestClient = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL,
});

export default prismaTestClient; 