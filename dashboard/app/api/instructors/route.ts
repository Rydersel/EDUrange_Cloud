import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { Session } from 'next-auth';
import { Role } from '@prisma/client';

interface CustomSession extends Session {
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    role: 'STUDENT' | 'INSTRUCTOR' | 'ADMIN';
  }
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions) as CustomSession | null;
    
    if (!session?.user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Only allow instructors and admins to fetch instructor list
    if (session.user.role !== 'INSTRUCTOR' && session.user.role !== 'ADMIN') {
      return new NextResponse('Forbidden', { status: 403 });
    }

    const instructors = await prisma.user.findMany({
      where: {
        OR: [
          { role: 'INSTRUCTOR' as const },
          { role: 'ADMIN' as const }
        ]
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });

    return NextResponse.json(instructors);
  } catch (error) {
    console.error('Error fetching instructors:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 