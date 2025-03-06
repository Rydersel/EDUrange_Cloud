import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { CompetitionDetails } from './competition-details';
import { Prisma } from '@prisma/client';
import { Competition } from '../types';

export default async function CompetitionDetailsPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect('/auth/signin');
  }

  const competition = await prisma.$transaction(async (tx) => {
    const result = await tx.$queryRaw<Array<Record<string, any>>>`
      SELECT cg.*,
        (SELECT COUNT(*) FROM "_GroupMembers" WHERE "A" = cg.id) as member_count,
        (SELECT COUNT(*) FROM "GroupChallenge" WHERE "groupId" = cg.id) as challenge_count
      FROM "CompetitionGroup" cg
      WHERE cg.id = ${params.id}
      AND (
        EXISTS (
          SELECT 1 FROM "_GroupMembers"
          WHERE "A" = cg.id AND "B" = ${session.user.id}
        )
        OR EXISTS (
          SELECT 1 FROM "_GroupInstructors"
          WHERE "A" = cg.id AND "B" = ${session.user.id}
        )
      )
      LIMIT 1
    `;

    if (!result || !result[0]) {
      return null;
    }

    const competition = result[0];

    // Fetch members with their points
    const members = await tx.$queryRaw<Array<Record<string, any>>>`
      SELECT u.id, u.name, u.email, u.image,
        (SELECT points FROM "GroupPoints" WHERE "userId" = u.id AND "groupId" = ${params.id}) as points
      FROM "User" u
      INNER JOIN "_GroupMembers" gm ON gm."B" = u.id
      WHERE gm."A" = ${params.id}
    `;

    // Fetch challenges with their details and completion counts
    const challenges = await tx.$queryRaw<Array<Record<string, any>>>`
      SELECT gc.id, gc.points,
        c.id as "challengeId", c.name, c."challengeImage",
        ct.id as "challengeTypeId", ct.name as "challengeTypeName",
        (SELECT COUNT(*) FROM "ChallengeCompletion" cc WHERE cc."groupChallengeId" = gc.id) as completion_count
      FROM "GroupChallenge" gc
      INNER JOIN "Challenges" c ON c.id = gc."challengeId"
      INNER JOIN "ChallengeType" ct ON ct.id = c."challengeTypeId"
      WHERE gc."groupId" = ${params.id}
    `;

    // Fetch access codes
    const accessCodes = await tx.$queryRaw<Array<Record<string, any>>>`
      SELECT *
      FROM "CompetitionAccessCode"
      WHERE "groupId" = ${params.id}
      ORDER BY "createdAt" DESC
    `;

    // Fetch instructors
    const instructors = await tx.$queryRaw<Array<Record<string, any>>>`
      SELECT u.id
      FROM "User" u
      INNER JOIN "_GroupInstructors" gi ON gi."B" = u.id
      WHERE gi."A" = ${params.id}
    `;

    return {
      ...competition,
      _count: {
        members: Number(competition.member_count),
        challenges: Number(competition.challenge_count)
      },
      members: members.map((m) => ({
        ...m,
        groupPoints: m.points ? [{ points: Number(m.points) }] : []
      })),
      challenges: challenges.map((c) => ({
        id: c.id,
        points: Number(c.points),
        challenge: {
          id: c.challengeId,
          name: c.name,
          challengeImage: c.challengeImage,
          challengeType: {
            id: c.challengeTypeId,
            name: c.challengeTypeName
          }
        },
        completions: Array(Number(c.completion_count)).fill({})
      })),
      accessCodes,
      instructors
    } as Competition;
  });

  if (!competition) {
    redirect('/dashboard/competitions');
  }

  const isInstructor = competition.instructors.some((i) => i.id === session.user.id);

  return <CompetitionDetails competition={competition} isInstructor={isInstructor} />;
} 