import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ActivityLogger } from '@/lib/activity-logger';
import { ActivityEventType } from '@prisma/client';
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
      'GROUP_UPDATED' as ActivityEventType,
      session.user.id,
      params.id,
      {
        changes: validatedData,
        updatedBy: session.user.id
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

    // Check if user is an instructor for this group
    const group = await prisma.competitionGroup.findFirst({
      where: {
        id: params.id,
        instructors: {
          some: {
            id: session.user.id
          }
        }
      },
      include: {
        members: {
          select: {
            id: true
          }
        }
      }
    });

    if (!group) {
      return new NextResponse('Unauthorized or group not found', { status: 403 });
    }

    // Delete the group
    await prisma.competitionGroup.delete({
      where: { id: params.id }
    });

    // Log the deletion for each member
    await Promise.all([
      // Log for the instructor who deleted it
      ActivityLogger.logGroupEvent(
        'GROUP_DELETED' as ActivityEventType,
        session.user.id,
        params.id,
        {
          deletedBy: session.user.id,
          groupName: group.name
        }
      ),
      // Log for each member
      ...group.members.map(member =>
        ActivityLogger.logGroupEvent(
          'GROUP_DELETED' as ActivityEventType,
          member.id,
          params.id,
          {
            deletedBy: session.user.id,
            groupName: group.name
          }
        )
      )
    ]);

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('Error deleting group:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
