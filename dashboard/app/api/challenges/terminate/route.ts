import { NextResponse, NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { User } from "@prisma/client";
import { ActivityLogger, ActivityEventType } from '@/lib/activity-logger';
import { getInstanceManagerUrl } from "@/lib/api-config";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { instanceId } = body;

    // Validate required fields
    if (!instanceId) {
      return NextResponse.json(
        { error: "Instance ID is required" },
        { status: 400 }
      );
    }

    // Get instance details and check authorization
    const instance = await prisma.challengeInstance.findFirst({
      where: { id: instanceId },
      include: {
        user: true,
        competition: {
          include: {
            instructors: true
          }
        }
      }
    });

    if (!instance) {
      return NextResponse.json(
        { error: "Challenge instance not found" },
        { status: 404 }
      );
    }

    // Verify user owns instance or is competition instructor
    const isInstructor = instance.competition?.instructors?.some(
      (instructor: User) => instructor.id === session.user.id
    ) || false;

    if (instance.userId !== session.user.id && !isInstructor) {
      return NextResponse.json(
        { error: "Not authorized to terminate this instance" },
        { status: 403 }
      );
    }

    // Get the instance manager URL
    const instanceManagerUrl = getInstanceManagerUrl();

    try {
      // Call instance manager to terminate challenge
      const response = await fetch(
        `${instanceManagerUrl}/end-challenge`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            deployment_name: instanceId,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to terminate challenge instance: ${error}`);
      }

      // Update instance status to terminated
      await prisma.challengeInstance.update({
        where: { id: instanceId },
        data: { status: "terminated" },
      });

      // Log the instance deletion
      try {
        await ActivityLogger.logChallengeEvent(
          ActivityEventType.CHALLENGE_INSTANCE_DELETED,
          session.user.id,
          instance.challengeId,
          instance.id,
          {
            challengeImage: instance.challengeImage,
            challengeUrl: instance.challengeUrl,
            deletionTime: new Date().toISOString()
          }
        );
      } catch (logError) {
        console.error("Error logging instance deletion:", logError);
        // Continue even if logging fails
      }

      return NextResponse.json({ message: "Challenge instance terminated successfully" });
    } catch (instanceError) {
      console.error("Error with instance manager:", instanceError);
      return NextResponse.json(
        { error: instanceError instanceof Error ? instanceError.message : "Failed to terminate challenge instance" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Error terminating challenge instance:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to terminate challenge instance" },
      { status: 500 }
    );
  }
}
