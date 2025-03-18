import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Use a global variable to prevent multiple instances in development
const globalForPrisma = global as unknown as { prisma: PrismaClient };

// Configure Prisma client with connection pool settings
export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: ['query'],
    // Use the DATABASE_URL directly without modifying it
    // This will use the default 'public' schema
    datasourceUrl: process.env.DATABASE_URL,
  });

// Save prisma client to global in non-production environments
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
