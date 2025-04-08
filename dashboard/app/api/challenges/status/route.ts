import { NextResponse, NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const instanceId = req.nextUrl.searchParams.get('instanceId');
    if (!instanceId) {
      return NextResponse.json({ error: "Instance ID is required" }, { status: 400 });
    }

    const instance = await prisma.challengeInstance.findUnique({
      where: { id: instanceId },
      select: { 
        id: true,
        status: true,
        userId: true,
        competition: {
          include: {
            instructors: {
              select: { id: true }
            }
          }
        }
      }
    });

    if (!instance) {
      return NextResponse.json({ error: "Instance not found" }, { status: 404 });
    }

    // Check authorization
    const isOwner = instance.userId === session.user.id;
    const isInstructor = instance.competition?.instructors?.some(instructor => instructor.id === session.user.id);
    if (!isOwner && !isInstructor) {
      return NextResponse.json({ error: "Not authorized to view this instance" }, { status: 403 });
    }

    return NextResponse.json({
      id: instance.id,
      status: instance.status
    });
  } catch (error) {
    console.error("Error fetching challenge status:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get challenge status" },
      { status: 500 }
    );
  }
} 