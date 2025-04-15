import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getRedisClient } from '@/lib/redis';
import { logger } from '@/lib/logger';

// Key prefix for Redis
const REDIS_KEY_PREFIX = 'challenge-access:';

/**
 * GET - Check if a challenge has been successfully accessed before
 * 
 * Query parameters:
 * - instanceId: The ID of the challenge instance
 */
export async function GET(req: NextRequest) {
  try {
    // Check user authentication
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the challenge instance ID from the query parameters
    const { searchParams } = new URL(req.url);
    const instanceId = searchParams.get('instanceId');

    if (!instanceId) {
      return NextResponse.json({ error: 'Instance ID is required' }, { status: 400 });
    }

    // Create a user-specific key to prevent access to other users' data
    const redisKey = `${REDIS_KEY_PREFIX}${session.user.id}:${instanceId}`;
    
    // Get the Redis client
    const redis = await getRedisClient();
    if (!redis) {
      logger.error('Redis client is not available');
      // Fallback to returning not accessed if Redis is unavailable
      return NextResponse.json({ accessed: false });
    }

    // Check if the challenge has been accessed before
    const accessed = await redis.get(redisKey);
    
    logger.debug(`Challenge access check for instance ${instanceId}: ${Boolean(accessed)}`);
    
    return NextResponse.json({ accessed: Boolean(accessed) });
  } catch (error) {
    logger.error('Error checking challenge access:', error);
    return NextResponse.json({ error: 'Error checking challenge access', accessed: false }, { status: 500 });
  }
}

/**
 * POST - Mark a challenge as successfully accessed
 * 
 * Body parameters:
 * - instanceId: The ID of the challenge instance
 */
export async function POST(req: NextRequest) {
  try {
    // Check user authentication
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get request body
    const body = await req.json();
    const { instanceId } = body;

    if (!instanceId) {
      return NextResponse.json({ error: 'Instance ID is required' }, { status: 400 });
    }

    // Create a user-specific key
    const redisKey = `${REDIS_KEY_PREFIX}${session.user.id}:${instanceId}`;
    
    // Get the Redis client
    const redis = await getRedisClient();
    if (!redis) {
      logger.error('Redis client is not available');
      return NextResponse.json({ error: 'Redis client is not available', success: false }, { status: 500 });
    }

    // Set the key with a 30-day expiration (2592000 seconds)
    // This prevents Redis from accumulating stale data indefinitely
    await redis.set(redisKey, 'true');
    await redis.expire(redisKey, 2592000); // 30 days expiration
    
    logger.debug(`Challenge marked as accessed: ${instanceId}`);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Error marking challenge as accessed:', error);
    return NextResponse.json({ error: 'Error marking challenge as accessed', success: false }, { status: 500 });
  }
}

/**
 * DELETE - Remove the accessed flag for a challenge
 * 
 * Query parameters:
 * - instanceId: The ID of the challenge instance
 */
export async function DELETE(req: NextRequest) {
  try {
    // Check user authentication
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the challenge instance ID from the query parameters
    const { searchParams } = new URL(req.url);
    const instanceId = searchParams.get('instanceId');

    if (!instanceId) {
      return NextResponse.json({ error: 'Instance ID is required' }, { status: 400 });
    }

    // Create a user-specific key
    const redisKey = `${REDIS_KEY_PREFIX}${session.user.id}:${instanceId}`;
    
    // Get the Redis client
    const redis = await getRedisClient();
    if (!redis) {
      logger.error('Redis client is not available');
      return NextResponse.json({ error: 'Redis client is not available', success: false }, { status: 500 });
    }

    // Delete the key
    await redis.del(redisKey);
    
    logger.debug(`Challenge access tracking removed for instance ${instanceId}`);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Error removing challenge access tracking:', error);
    return NextResponse.json({ error: 'Error removing challenge access tracking', success: false }, { status: 500 });
  }
} 