import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ActivityLogger, ActivityEventType } from '@/lib/activity-logger';
import { z } from 'zod';

const updateGroupSchema = z.object({
  name: z.string().min(1, 'Name is required').optional(),
  description: z.string().optional(),
  startDate: z.string().transform(str => new Date(str)).optional(),
  endDate: z.string().optional().transform(str => str ? new Date(str) : undefined),
});

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const competition = await prisma.competitionGroup.findUnique({
      where: {
        id: params.id,
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
            challenge: {
              include: {
                challengeType: true,
                appConfigs: true,
                questions: true
              }
            },
            completions: {
              where: {
                userId: session.user.id
              }
            },
            questionCompletions: {
              where: {
                userId: session.user.id
              }
            }
          }
        },
        members: {
          where: {
            id: session.user.id
          },
          include: {
            groupPoints: {
              where: {
                groupId: params.id
              }
            }
          }
        }
      },
    });

    if (!competition) {
      return new NextResponse('Competition not found', { status: 404 });
    }

    // Check if user is a member of this competition
    const isMember = competition.members.length > 0;
    if (!isMember) {
      return new NextResponse('Unauthorized', { status: 403 });
    }

    // Format challenges data
    const challenges = competition.challenges.map(challenge => {
      // Calculate total points from questions
      const totalPoints = challenge.challenge.questions.reduce((sum, question) => sum + question.points, 0);
      
      // Get total questions count
      const totalQuestions = challenge.challenge.questions.length;
      
      // Get completed questions count
      const completedQuestions = challenge.challenge.questions.filter(question =>
        challenge.questionCompletions.some(completion => 
          completion.questionId === question.id && completion.groupChallengeId === challenge.id
        )
      ).length;
      
      // Check if challenge is completed by checking if all questions are completed
      const isCompleted = completedQuestions === totalQuestions;
      
      return {
        id: challenge.challenge.id,
        name: challenge.challenge.name,
        difficulty: challenge.challenge.difficulty,
        description: challenge.challenge.description || '',
        AppsConfig: challenge.challenge.appConfigs,
        points: totalPoints,
        completed: isCompleted,
        challengeType: challenge.challenge.challengeType,
        totalQuestions,
        completedQuestions
      };
    });

    // Calculate total points and user points
    const totalPoints = competition.challenges.reduce((sum, challenge) => {
      const challengePoints = challenge.challenge.questions.reduce((qSum, question) => qSum + question.points, 0);
      return sum + challengePoints;
    }, 0);

    const userPoints = competition.members[0]?.groupPoints[0]?.points || 0;

    // Calculate completed challenges and accuracy
    const completedChallenges = challenges.filter(challenge => challenge.completed).length;
    const challengeCount = challenges.length;
    const accuracy = challengeCount > 0 ? Math.round((completedChallenges / challengeCount) * 100) : 0;

    return NextResponse.json({
      id: competition.id,
      name: competition.name,
      description: competition.description,
      startDate: competition.startDate,
      endDate: competition.endDate,
      _count: competition._count,
      challenges,
      userPoints,
      totalPoints,
      completedChallenges,
      challengeCount,
      accuracy
    });
  } catch (error) {
    console.error('Error fetching competition:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Check if user is an instructor for this group
    const group = await prisma.competitionGroup.findFirst({
      where: {
        id: params.id,
        instructors: {
          some: {
            id: session.user.id
          }
        }
      }
    });

    if (!group) {
      return new NextResponse('Unauthorized or group not found', { status: 403 });
    }

    const body = await req.json();
    const validatedData = updateGroupSchema.parse(body);

    // Update the group
    const updatedGroup = await prisma.competitionGroup.update({
      where: { id: params.id },
      data: validatedData
    });

    // Log the update
    await ActivityLogger.logGroupEvent(
      ActivityEventType.GROUP_UPDATED,
      session.user.id,
      params.id,
      {
        updatedFields: Object.keys(validatedData),
        updatedBy: session.user.id,
        timestamp: new Date().toISOString()
      }
    );

    return NextResponse.json(updatedGroup);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return new NextResponse(JSON.stringify(error.errors), { status: 400 });
    }
    console.error('Error updating group:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Check if user is an admin
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true }
    });

    if (user?.role !== 'ADMIN') {
      return new NextResponse('Forbidden', { status: 403 });
    }

    // Get the group data before deletion
    const group = await prisma.competitionGroup.findUnique({
      where: { id: params.id },
      include: {
        challenges: {
          include: {
            challenge: true
          }
        },
        members: true,
        accessCodes: true,
        _count: {
          select: {
            members: true,
            challenges: true,
            accessCodes: true
          }
        }
      }
    });

    if (!group) {
      return new NextResponse('Competition not found', { status: 404 });
    }

    // Log the deletion before actually deleting
    await ActivityLogger.logGroupEvent(
      ActivityEventType.GROUP_DELETED,
      session.user.id,
      params.id,
      {
        groupName: group.name,
        groupDescription: group.description,
        startDate: group.startDate,
        endDate: group.endDate,
        deletedBy: session.user.id,
        timestamp: new Date().toISOString()
      }
    );

    // Delete the competition group and all related data
    await prisma.competitionGroup.delete({
      where: { id: params.id }
    });

    return NextResponse.json({ 
      success: true,
      message: 'Competition deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting competition group:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
