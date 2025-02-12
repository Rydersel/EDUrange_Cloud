import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { CompetitionGroup } from '@prisma/client';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const now = new Date();

    // Fetch all competitions where the user is a member
    const competitions = await prisma.competitionGroup.findMany({
      where: {
        members: {
          some: {
            id: session.user.id
          }
        }
      },
      include: {
        _count: {
          select: {
            members: true,
            challenges: true,
          }
        },
        challenges: {
          include: {
            challenge: true,
          }
        },
        members: {
          where: {
            id: session.user.id
          },
          include: {
            groupPoints: {
              where: {
                groupId: { equals: undefined }
              }
            }
          }
        }
      },
    });
    
    // Sort competitions into categories
    const active = competitions.filter((c: CompetitionGroup) => 
      c.startDate <= now && (!c.endDate || c.endDate >= now)
    );
    const upcoming = competitions.filter((c: CompetitionGroup) => c.startDate > now);
    const completed = competitions.filter((c: CompetitionGroup) => 
      c.endDate && c.endDate < now
    );

    return NextResponse.json({ 
      active, 
      upcoming, 
      completed,
      userRole: session.user.role 
    });
  } catch (error) {
    console.error('Error fetching user competitions:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 