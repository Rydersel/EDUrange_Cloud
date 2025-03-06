import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { ActivityLogger, ActivityEventType } from '@/lib/activity-logger';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';

const userUpdateSchema = z.object({
  name: z.string().optional(),
  image: z.string().optional(),
});

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;

  if (!id) {
    return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
  }

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Users can only view their own profile unless they're an admin
    if (session.user.id !== id && session.user.role !== 'ADMIN') {
      return new NextResponse('Forbidden', { status: 403 });
    }

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        accounts: true,
        sessions: true,
        challengeInstances: true,
      },
    });

    if (!user) {
      return new NextResponse('User not found', { status: 404 });
    }

    return NextResponse.json(user);
  } catch (error) {
    console.error('Error fetching user:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  const { name, email } = await req.json();

  try {
    const user = await prisma.user.update({
      where: { id },
      data: { name, email },
    });
    return NextResponse.json(user);
  } catch (error) {
    console.error('Failed to update user:', error);
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'ADMIN') {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Get user data before deletion for logging
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        email: true,
        name: true,
        role: true
      }
    });

    if (!user) {
      return new NextResponse('User not found', { status: 404 });
    }

    // Delete the user
    await prisma.user.delete({
      where: { id }
    });

    // Log the deletion
    await ActivityLogger.logUserEvent(
      ActivityEventType.USER_DELETED,
      id,
      {
        deletedBy: session.user.id,
        timestamp: new Date().toISOString()
      }
    );

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('Error deleting user:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Users can only update their own profile unless they're an admin
    if (session.user.id !== params.id && session.user.role !== 'ADMIN') {
      return new NextResponse('Forbidden', { status: 403 });
    }

    const body = await req.json();
    const { name, image } = userUpdateSchema.parse(body);

    // Get current user data for logging changes
    const currentUser = await prisma.user.findUnique({
      where: { id: params.id },
      select: { name: true, image: true }
    });

    if (!currentUser) {
      return new NextResponse('User not found', { status: 404 });
    }

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id: params.id },
      data: {
        name: name || undefined,
        image: image || undefined,
      },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        role: true
      }
    });

    // Log the update
    await ActivityLogger.logUserEvent(
      ActivityEventType.USER_UPDATED,
      params.id,
      {
        updatedBy: session.user.id,
        updatedFields: Object.keys(body),
        timestamp: new Date().toISOString()
      }
    );

    return NextResponse.json(updatedUser);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return new NextResponse(JSON.stringify(error.errors), { status: 400 });
    }
    console.error('Error updating user:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
