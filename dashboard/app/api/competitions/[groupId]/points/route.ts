import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { z } from 'zod';

const pointsUpdateSchema = z.object({
  userId: z.string(),
  points: z.number().int(),
});

interface GroupPoints {
  id: string;
  points: number;
  userId: string;
  groupId: string;
  createdAt: Date;
  updatedAt: Date;
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
}

interface DbUser {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
}

export async function POST(
  req: Request,
  { params }: { params: { groupId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as DbUser | undefined;

    if (!user?.id) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const json = await req.json();
    const body = pointsUpdateSchema.parse(json);

    // Check if user is an instructor of the group
    const group = await db.$queryRaw<{ id: string }[]>`
      SELECT id FROM "CompetitionGroup"
      WHERE id = ${params.groupId}
      AND EXISTS (
        SELECT 1 FROM "_GroupInstructors"
        WHERE "A" = ${params.groupId}
        AND "B" = ${user.id}
      )
    `;

    if (!group?.length) {
      return new NextResponse('Unauthorized or group not found', { status: 403 });
    }

    // Update or create points record
    const points = await db.$queryRaw<GroupPoints[]>`
      INSERT INTO "GroupPoints" ("userId", "groupId", points)
      VALUES (${body.userId}, ${params.groupId}, ${body.points})
      ON CONFLICT ("userId", "groupId")
      DO UPDATE SET points = ${body.points}
      RETURNING *
    `;

    return NextResponse.json(points[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return new NextResponse(JSON.stringify(error.errors), { status: 400 });
    }

    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

export async function GET(
  req: Request,
  { params }: { params: { groupId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as DbUser | undefined;

    if (!user?.id) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const searchParams = new URL(req.url).searchParams;
    const userId = searchParams.get('userId');

    if (userId) {
      // Get points for a specific user
      const points = await db.$queryRaw<GroupPoints[]>`
        SELECT gp.*, 
               json_build_object(
                 'id', u.id,
                 'name', u.name,
                 'email', u.email,
                 'image', u.image
               ) as user
        FROM "GroupPoints" gp
        JOIN "User" u ON u.id = gp."userId"
        WHERE gp."groupId" = ${params.groupId}
        AND gp."userId" = ${userId}
      `;

      return NextResponse.json(points[0] || { points: 0 });
    }

    // Get points for all users in the group
    const points = await db.$queryRaw<GroupPoints[]>`
      SELECT gp.*, 
             json_build_object(
               'id', u.id,
               'name', u.name,
               'email', u.email,
               'image', u.image
             ) as user
      FROM "GroupPoints" gp
      JOIN "User" u ON u.id = gp."userId"
      WHERE gp."groupId" = ${params.groupId}
      ORDER BY gp.points DESC
    `;

    return NextResponse.json(points);
  } catch (error) {
    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 