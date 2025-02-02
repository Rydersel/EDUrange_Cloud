import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { Prisma } from '@prisma/client';

// Validation schema for the request body
const completionSchema = z.object({
  answer: z.string(),
});

export async function POST(
  request: Request,
  { params }: { params: { groupId: string; challengeId: string; questionId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Parse and validate request body
    const body = await request.json();
    const { answer } = completionSchema.parse(body);

    // Get the group challenge to verify it exists and user has access
    const groupChallenge = await prisma.groupChallenge.findFirst({
      where: {
        groupId: params.groupId,
        challengeId: params.challengeId,
        group: {
          members: {
            some: {
              id: session.user.id
            }
          }
        }
      }
    });

    if (!groupChallenge) {
      return new NextResponse('Challenge not found or access denied', { status: 404 });
    }

    // Get the question to verify answer
    const question = await prisma.$queryRaw<{ id: string; answer: string; points: number }[]>`
      SELECT id, answer, points
      FROM "ChallengeQuestion"
      WHERE id = ${params.questionId}
      AND "challengeId" = ${params.challengeId}
      LIMIT 1
    `;

    if (!question || question.length === 0) {
      return new NextResponse('Question not found', { status: 404 });
    }

    // Check if question is already completed
    const existingCompletion = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id
      FROM "QuestionCompletion"
      WHERE "userId" = ${session.user.id}
      AND "questionId" = ${params.questionId}
      AND "groupChallengeId" = ${groupChallenge.id}
      LIMIT 1
    `;

    if (existingCompletion && existingCompletion.length > 0) {
      return new NextResponse('Question already completed', { status: 400 });
    }

    // Verify answer
    if (answer.toLowerCase() !== question[0].answer.toLowerCase()) {
      return new NextResponse('Incorrect answer', { status: 400 });
    }

    // Create completion record
    const completion = await prisma.$executeRaw`
      INSERT INTO "QuestionCompletion" ("id", "userId", "questionId", "groupChallengeId", "pointsEarned", "completedAt")
      VALUES (
        gen_random_uuid(),
        ${session.user.id},
        ${params.questionId},
        ${groupChallenge.id},
        ${question[0].points},
        NOW()
      )
      RETURNING *
    `;

    // Check if all questions are completed
    const [allQuestionsCount, completedQuestionsCount] = await Promise.all([
      prisma.$queryRaw<[{ count: number }]>`
        SELECT COUNT(*) as count
        FROM "ChallengeQuestion"
        WHERE "challengeId" = ${params.challengeId}
      `,
      prisma.$queryRaw<[{ count: number }]>`
        SELECT COUNT(*) as count
        FROM "QuestionCompletion" qc
        JOIN "ChallengeQuestion" cq ON qc."questionId" = cq.id
        WHERE qc."userId" = ${session.user.id}
        AND qc."groupChallengeId" = ${groupChallenge.id}
        AND cq."challengeId" = ${params.challengeId}
      `
    ]);

    const allCompleted = allQuestionsCount[0].count === completedQuestionsCount[0].count;

    // If all questions are completed, create a challenge completion
    if (allCompleted) {
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

      // Log the activity
      await prisma.activityLog.create({
        data: {
          eventType: 'CHALLENGE_COMPLETED',
          userId: session.user.id,
          challengeId: params.challengeId,
          groupId: params.groupId,
          metadata: {
            totalPoints: totalPoints[0].total
          }
        }
      });
    }

    return NextResponse.json({
      success: true,
      completion,
      challengeCompleted: allCompleted
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return new NextResponse(JSON.stringify(error.errors), { status: 400 });
    }
    console.error('[QUESTION_COMPLETION]', error);
    return new NextResponse('Internal Error', { status: 500 });
  }
} 