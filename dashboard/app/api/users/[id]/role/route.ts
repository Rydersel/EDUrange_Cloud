import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ActivityLogger } from '@/lib/activity-logger';
import { UserRole } from '@prisma/client';
import { z } from 'zod';

const roleUpdateSchema = z.object({
  role: z.enum(['ADMIN', 'INSTRUCTOR', 'STUDENT'])
});

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'ADMIN') {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const body = await req.json();
    const { role } = roleUpdateSchema.parse(body);

    // Get the user's current role before updating
    const currentUser = await prisma.user.findUnique({
      where: { id: params.id },
      select: { role: true }
    });

    if (!currentUser) {
      return new NextResponse('User not found', { status: 404 });
    }

    // Update the user's role
    const updatedUser = await prisma.user.update({
      where: { id: params.id },
      data: { role },
      select: {
        id: true,
        name: true,
        email: true,
        role: true
      }
    });

    // Log the role change
    await ActivityLogger.logUserRoleChange(params.id, {
      previousRole: currentUser.role,
      newRole: role,
      changedBy: session.user.id
    });

    return NextResponse.json(updatedUser);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return new NextResponse(JSON.stringify(error.errors), { status: 400 });
    }
    console.error('Error updating user role:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 