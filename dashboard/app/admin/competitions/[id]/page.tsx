import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { CompetitionDetails } from './competition-details';
import { Competition, User, GroupChallenge, AccessCode } from '../types';

export default async function CompetitionDetailsPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect('/');
  }

  try {
    // Find the competition with access control
    const competitionGroup = await prisma.competitionGroup.findFirst({
      where: {
        id: params.id,
        OR: [
          {
            members: {
              some: {
                id: session.user.id
              }
            }
          },
          {
            instructors: {
              some: {
                id: session.user.id
              }
            }
          }
        ]
      },
      include: {
        _count: {
          select: {
            members: true,
            challenges: true
          }
        }
      }
    });

    if (!competitionGroup) {
      redirect('/dashboard/competitions');
    }

    // Find all members through the group first
    const groupWithMembers = await prisma.competitionGroup.findUnique({
      where: {
        id: params.id
      },
      include: {
        members: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true
          }
        }
      }
    });

    const dbMembers = groupWithMembers?.members || [];

    // Separately fetch their points
    const groupPoints = await prisma.groupPoints.findMany({
      where: {
        groupId: params.id,
        userId: {
          in: dbMembers.map(m => m.id)
        }
      },
      select: {
        userId: true,
        points: true
      }
    });

    // Map to the expected User type
    const members: User[] = dbMembers.map(m => ({
      id: m.id,
      name: m.name,
      email: m.email || '',
      image: m.image,
      groupPoints: groupPoints
        .filter(gp => gp.userId === m.id)
        .map(gp => ({ points: gp.points }))
    }));

    // Fetch challenges with their details
    const dbGroupChallenges = await prisma.groupChallenge.findMany({
      where: {
        groupId: params.id
      },
      include: {
        challenge: {
          include: {
            challengeType: true
          }
        },
        completions: {
          select: {
            id: true
          }
        }
      }
    });

    // Map to the expected GroupChallenge type
    const challenges: GroupChallenge[] = dbGroupChallenges.map(gc => ({
      id: gc.id,
      points: gc.points,
      challenge: {
        id: gc.challenge.id,
        name: gc.challenge.name,
        challengeImage: '',  // Default empty string if not available
        challengeType: {
          id: gc.challenge.challengeType.id,
          name: gc.challenge.challengeType.name
        }
      },
      completions: gc.completions.map(() => ({}))
    }));

    // Fetch access codes
    const dbAccessCodes = await prisma.competitionAccessCode.findMany({
      where: {
        groupId: params.id
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Map to the expected AccessCode type
    const accessCodes: AccessCode[] = dbAccessCodes.map(ac => ({
      id: ac.id,
      code: ac.code,
      expiresAt: ac.expiresAt ? ac.expiresAt.toISOString() : null,
      maxUses: ac.maxUses,
      usedCount: ac.usedCount,
      createdAt: ac.createdAt.toISOString(),
      createdBy: ac.createdBy,
      groupId: ac.groupId
    }));

    // Fetch instructors through the group relation
    const groupWithInstructors = await prisma.competitionGroup.findUnique({
      where: {
        id: params.id
      },
      include: {
        instructors: {
          select: {
            id: true
          }
        }
      }
    });

    const instructors = groupWithInstructors?.instructors || [];

    // Transform data to match expected format
    const competition: Competition = {
      id: competitionGroup.id,
      name: competitionGroup.name,
      description: competitionGroup.description,
      startDate: competitionGroup.startDate.toISOString(),
      endDate: competitionGroup.endDate ? competitionGroup.endDate.toISOString() : null,
      createdAt: competitionGroup.createdAt.toISOString(),
      updatedAt: competitionGroup.updatedAt.toISOString(),
      _count: competitionGroup._count,
      members,
      challenges,
      accessCodes,
      instructors
    };

    const isInstructor = instructors.some(i => i.id === session.user.id);

    return <CompetitionDetails competition={competition} isInstructor={isInstructor} />;
  } catch (error) {
    console.error('Error fetching competition details:', error);
    redirect('/dashboard/competitions');
  }
}
