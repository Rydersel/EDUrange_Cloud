import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ActivityLogger, ActivityEventType } from '@/lib/activity-logger';
import { z } from 'zod';
import { Prisma, CompetitionGroup, Challenge, ChallengeType, ChallengeAppConfig, ChallengeQuestion } from '@prisma/client';

type CompetitionWithRelations = CompetitionGroup & {
  _count: {
    members: number;
    challenges: number;
  };
  challenges: Array<{
    challenge: Challenge & {
      challengeType: ChallengeType;
      appConfigs: ChallengeAppConfig[];
      questions: ChallengeQuestion[];
      difficulty: string | null;
    };
    completions: any[];
    questionCompletions: any[];
  }>;
  members: Array<{
    id: string;
    groupPoints: Array<{
      points: number;
    }>;
  }>;
  instructors: Array<{
    id: string;
  }>;
};

// Types for the challenge data structure
interface FormattedChallenge {
  id: string;
  name: string;
  description: string | null;
  difficulty: string;
  AppsConfig: string;
  points: number;
  completed: boolean;
  challengeType: {
    id: string;
    name: string;
  };
  totalQuestions: number;
  completedQuestions: number;
}

// Type for the competition response
interface CompetitionResponse {
  id: string;
  name: string;
  description: string | null;
  startDate: Date;
  endDate: Date | null;
  _count: {
    members: number;
    challenges: number;
  };
  challenges: FormattedChallenge[];
  userPoints: number;
  totalPoints: number;
  completedChallenges: number;
  challengeCount: number;
  accuracy: number;
}

const updateGroupSchema = z.object({
  name: z.string().min(1, 'Name is required').optional(),
  description: z.string().optional(),
  startDate: z.string().transform(str => new Date(str)).optional(),
  endDate: z.string().optional().transform(str => str ? new Date(str) : undefined),
});

export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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
                challengeType: {
                  select: {
                    id: true,
                    name: true
                  }
                },
                appConfigs: true,
                questions: {
                  select: {
                    id: true,
                    points: true
                  }
                }
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
          select: {
            id: true,
            groupPoints: {
              where: {
                groupId: params.id
              }
            }
          }
        },
        instructors: {
          select: {
            id: true
          }
        }
      },
    }) as CompetitionWithRelations | null;

    if (!competition) {
      return new NextResponse('Competition not found', { status: 404 });
    }

    // Check if user is a member or instructor of this competition
    const isMember = competition.members.some(member => member.id === session.user.id);
    const isInstructor = competition.instructors.some(instructor => instructor.id === session.user.id);

    if (!isMember && !isInstructor) {
      return new NextResponse('Unauthorized', { status: 403 });
    }

    // Format challenges data
    const challenges: FormattedChallenge[] = competition.challenges.map(challenge => {
      // Calculate total points from questions
      const totalPoints = challenge.challenge.questions.reduce((sum: number, question) => sum + question.points, 0);
      
      // Get total questions count
      const totalQuestions = challenge.challenge.questions?.length || 0;
      
      // Get completed questions count
      const completedQuestions = challenge.questionCompletions.length;
      
      // Check if challenge is completed by checking if all questions are completed
      const isCompleted = completedQuestions === totalQuestions;
      
      // Convert appConfigs to string for proper description extraction
      const appConfigsString = JSON.stringify(challenge.challenge.appConfigs);
      
      return {
        id: challenge.challenge.id,
        name: challenge.challenge.name,
        description: challenge.challenge.description,
        difficulty: challenge.challenge.difficulty || 'MEDIUM',
        AppsConfig: appConfigsString,
        points: totalPoints,
        completed: isCompleted,
        challengeType: challenge.challenge.challengeType,
        totalQuestions,
        completedQuestions
      };
    });

    // Calculate total points and user points
    const totalPoints = competition.challenges.reduce((sum: number, challenge) => {
      const challengePoints = challenge.challenge.questions.reduce((qSum: number, question) => qSum + question.points, 0);
      return sum + challengePoints;
    }, 0);

    const userMember = competition.members.find(member => member.id === session.user.id);
    const userPoints = userMember?.groupPoints[0]?.points || 0;

    // Calculate completed challenges and accuracy
    const completedChallenges = challenges.filter(challenge => challenge.completed).length;
    const challengeCount = challenges.length;
    const accuracy = challengeCount > 0 ? Math.round((completedChallenges / challengeCount) * 100) : 0;

    const response: CompetitionResponse = {
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
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching competition:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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

export async function DELETE(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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
