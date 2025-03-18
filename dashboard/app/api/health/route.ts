import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;

    // Check environment variables
    const requiredEnvVars = [
      'DATABASE_URL',
      'NEXTAUTH_URL',
      'NEXTAUTH_SECRET',
      'AUTH_GITHUB_ID',
      'AUTH_GITHUB_SECRET',
      'INSTANCE_MANAGER_URL',
      'DATABASE_API_URL',
      'NODE_ENV',

    ];

    const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

    if (missingEnvVars.length > 0) {
      console.warn(`Missing environment variables: ${missingEnvVars.join(', ')}`);
    }

    return NextResponse.json(
      {
        status: 'ok',
        message: 'Service is healthy',
        checks: {
          database: 'connected',
          environment: missingEnvVars.length === 0 ? 'complete' : 'incomplete'
        },
        timestamp: new Date().toISOString()
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Health check failed:', error);

    return NextResponse.json(
      {
        status: 'error',
        message: 'Service is unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}
