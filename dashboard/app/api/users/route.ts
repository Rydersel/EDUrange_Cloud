import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import authConfig from '@/auth.config';
import { prisma } from '@/lib/prisma';
import rateLimit from '@/lib/rate-limit';
import { Prisma } from '@prisma/client';

// Create a rate limiter for user-related operations
const usersRateLimiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  limit: 30, // 30 requests per minute
});

export async function GET(req: NextRequest) {
  try {
    // Apply rate limiting
    const rateLimitResult = await usersRateLimiter.check(req);
    if (rateLimitResult) return rateLimitResult;
    
    // Check authentication
    const session = await getServerSession(authConfig);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true }
    });

    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get query parameters
    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const search = url.searchParams.get('search') || '';
    const offset = (page - 1) * limit;

    // Build the where clause for search with proper types
    const where: Prisma.UserWhereInput = search ? {
      OR: [
        { 
          name: { 
            contains: search, 
            mode: 'insensitive' as Prisma.QueryMode
          } 
        },
        { 
          email: { 
            contains: search, 
            mode: 'insensitive' as Prisma.QueryMode
          } 
        }
      ]
    } : {};

    // Get users with pagination
    const users = await prisma.user.findMany({
      where,
      skip: offset,
      take: limit,
      include: {
        sessions: true,
        memberOf: {
          select: {
            id: true,
            name: true
          }
        },
        instructorGroups: {
          select: {
            id: true,
            name: true
          }
        },
        challengeCompletions: {
          select: {
            id: true,
            pointsEarned: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Get total count for pagination
    const totalUsers = await prisma.user.count({ where });
    const pageCount = Math.ceil(totalUsers / limit);

    return NextResponse.json({
      users,
      pagination: {
        page,
        limit,
        totalUsers,
        pageCount
      }
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
} 