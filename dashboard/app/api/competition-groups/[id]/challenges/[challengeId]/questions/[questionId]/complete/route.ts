import { NextResponse, NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import rateLimit from '@/lib/rate-limit';
import { validateAndSanitize } from '@/lib/validation';

// Create a rate limiter for challenge submissions
const challengeSubmissionLimiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  limit: 15, // 15 submissions per minute
});

// Validation schema for the request body
const completionSchema = z.object({
  answer: z.string(),
});

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string; challengeId: string; questionId: string }> }
) {
  const params = await props.params;
  try {
    // Apply rate limiting
    const rateLimitResult = await challengeSubmissionLimiter.check(request);
    if (rateLimitResult) return rateLimitResult;
    
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const body = await request.json();
    
    // Validate and sanitize input
    const validationResult = validateAndSanitize(completionSchema, body);
    
    if (!validationResult.success) {
      return NextResponse.json({ 
        success: false, 
        error: validationResult.error 
      }, { status: 400 });
    }
    
    const { answer } = validationResult.data;

    // Get the group challenge
    const groupChallenge = await prisma.groupChallenge.findUnique({
      where: {
        challengeId_groupId: {
          challengeId: params.challengeId,
          groupId: params.id,
        },
      },
      include: {
        challenge: {
          include: {
            questions: true,
          },
        },
      },
    });

    if (!groupChallenge) {
      return new NextResponse('Challenge not found', { status: 404 });
    }

    // Find the question
    const question = groupChallenge.challenge.questions.find(
      (q) => q.id === params.questionId
    );

    if (!question) {
      return new NextResponse('Question not found', { status: 404 });
    }

    // Check if already completed
    const existingCompletion = await prisma.questionCompletion.findUnique({
      where: {
        userId_questionId_groupChallengeId: {
          userId: session.user.id,
          questionId: params.questionId,
          groupChallengeId: groupChallenge.id,
        },
      },
    });

    if (existingCompletion) {
      return new NextResponse('Question already completed', { status: 400 });
    }

    // Record the attempt
    const isCorrect = answer === question.answer;
    await prisma.questionAttempt.create({
      data: {
        questionId: params.questionId,
        userId: session.user.id,
        groupChallengeId: groupChallenge.id,
        answer: answer,
        isCorrect: isCorrect,
      },
    });

    // Log the attempt
    await prisma.activityLog.create({
      data: {
        eventType: 'QUESTION_ATTEMPTED',
        userId: session.user.id,
        challengeId: params.challengeId,
        groupId: params.id,
        metadata: {
          questionId: params.questionId,
          isCorrect: isCorrect,
          attemptedAnswer: answer
        }
      }
    });

    // If correct answer, create completion
    if (isCorrect) {
      const completion = await prisma.questionCompletion.create({
        data: {
          questionId: params.questionId,
          userId: session.user.id,
          groupChallengeId: groupChallenge.id,
          pointsEarned: question.points,
        },
      });

      // Log the completion
      await prisma.activityLog.create({
        data: {
          eventType: 'QUESTION_COMPLETED',
          userId: session.user.id,
          challengeId: params.challengeId,
          groupId: params.id,
          metadata: {
            questionId: params.questionId,
            pointsEarned: question.points
          }
        }
      });

      // Check if all questions are completed
      const completedQuestions = await prisma.questionCompletion.findMany({
        where: {
          userId: session.user.id,
          groupChallengeId: groupChallenge.id
        }
      });

      // Check if challenge is completed by comparing completed questions count to total questions count
      const allQuestionsCompleted = completedQuestions.length === (groupChallenge.challenge.questions?.length || 0);

      // If all questions are completed, create a challenge completion
      if (allQuestionsCompleted) {
        // Get total points earned
        const totalPoints = await prisma.$queryRaw<[{ total: number }]>`
          SELECT SUM("pointsEarned") as total
          FROM "QuestionCompletion"
          WHERE "userId" = ${session.user.id}
          AND "groupChallengeId" = ${groupChallenge.id}
        `;

        // Create challenge completion
        await prisma.$executeRaw`
          INSERT INTO "ChallengeCompletion" ("id", "userId", "groupChallengeId", "pointsEarned", "completedAt")
          VALUES (
            gen_random_uuid(),
            ${session.user.id},
            ${groupChallenge.id},
            ${totalPoints[0].total},
            NOW()
          )
        `;

        // Update group points
        await prisma.groupPoints.upsert({
          where: {
            userId_groupId: {
              userId: session.user.id,
              groupId: params.id
            }
          },
          create: {
            userId: session.user.id,
            groupId: params.id,
            points: totalPoints[0].total
          },
          update: {
            points: {
              increment: totalPoints[0].total
            }
          }
        });

        // Log the activity
        await prisma.activityLog.create({
          data: {
            eventType: 'CHALLENGE_COMPLETED',
            userId: session.user.id,
            challengeId: params.challengeId,
            groupId: params.id,
            metadata: {
              totalPoints: totalPoints[0].total,
              totalAttempts: await prisma.questionAttempt.count({
                where: {
                  userId: session.user.id,
                  groupChallengeId: groupChallenge.id
                }
              })
            }
          }
        });
      }

      return NextResponse.json({
        success: true,
        completion,
        challengeCompleted: allQuestionsCompleted
      });
    } else {
      return NextResponse.json({
        success: false,
        message: 'Incorrect answer'
      });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ 
        success: false, 
        errors: error.errors 
      }, { status: 400 });
    }
    console.error('[QUESTION_COMPLETION]', error);
    return new NextResponse('Internal Error', { status: 500 });
  }
} 