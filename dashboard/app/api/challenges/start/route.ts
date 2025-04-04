import { NextResponse, NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { User } from "@prisma/client";
import { transformToWebOSFormat, transformQuestionsToPromptApp } from "@/lib/webos/transform";
import { ActivityLogger, ActivityEventType } from '@/lib/activity-logger';
import { getInstanceManagerUrl } from '@/lib/api-config';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { challengeId, competitionId } = body;

    // Validate required fields
    if (!challengeId || !competitionId) {
      return NextResponse.json(
        { error: "Challenge ID and Competition ID are required" },
        { status: 400 }
      );
    }

    // Validate competition membership
    const competition = await prisma.competitionGroup.findFirst({
      where: {
        id: competitionId,
        OR: [
          { members: { some: { id: session.user.id } } },
          { instructors: { some: { id: session.user.id } } },
        ],
      },
      include: {
        instructors: true,
      },
    });

    if (!competition) {
      return NextResponse.json(
        { error: "Not a member of this competition" },
        { status: 403 }
      );
    }

    // Get challenge details
    const challenge = await prisma.challenges.findUnique({
      where: { id: challengeId },
      include: {
        appConfigs: true,
        questions: {
          orderBy: { order: 'asc' }
        },
        challengeType: true
      }
    });

    if (!challenge) {
      return NextResponse.json(
        { error: "Challenge not found" },
        { status: 404 }
      );
    }

    // Check instance limit (skip for instructors)
    const isInstructor = competition.instructors?.some(
      (instructor: User) => instructor.id === session.user.id
    ) || false;

    if (!isInstructor) {
      const activeInstances = await prisma.challengeInstance.count({
        where: {
          userId: session.user.id,
          status: {
            in: ["running", "creating"]
          },
          competitionId: competitionId
        },
      });

      if (activeInstances >= 3) {
        return NextResponse.json(
          { error: "Maximum number of active instances reached" },
          { status: 400 }
        );
      }
    }

    // Transform app configs to WebOS format
    const transformedAppConfigs = transformToWebOSFormat(challenge.appConfigs);

    // Create and add challenge prompt app
    const promptApp = transformQuestionsToPromptApp(
      challenge.questions,
      challenge.name,
      challenge.description || undefined
    );
    transformedAppConfigs.push(promptApp);

    // Get the instance manager URL using the centralized function
    const instanceManagerUrl = getInstanceManagerUrl();
    
    if (!instanceManagerUrl) {
      console.error('Instance manager URL is undefined');
      return NextResponse.json(
        { error: 'Instance manager URL is undefined' },
        { status: 500 }
      );
    }
    
    console.log("Instance manager URL:", instanceManagerUrl);
    
    // Call instance manager to create challenge
    const instanceManagerPayload = {
      user_id: session.user.id,
      challenge_id: challengeId, // Add challenge ID for database-sync
      challenge_image: challenge.challengeImage,
      apps_config: JSON.stringify(transformedAppConfigs),
      chal_type: challenge.challengeType?.name?.toLowerCase() || "fullos", // Make this dynamic based on challenge type
      competition_id: competitionId,
    };

    console.log("Calling instance manager with payload:", instanceManagerPayload);

    try {
      const fullUrl = `${instanceManagerUrl}/start-challenge`;
      console.log("Full URL for API call:", fullUrl);
      
      const response = await fetch(
        fullUrl,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(instanceManagerPayload),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Instance manager error:", {
          status: response.status,
          statusText: response.statusText,
          error: errorText
        });
        throw new Error(`Failed to create challenge instance: ${errorText}`);
      }

      const instanceData = await response.json();
      console.log("Instance manager response:", instanceData);

      // Add flag secret name to challenge prompt app
      if (promptApp.challenge) {
        promptApp.challenge.flagSecretName = instanceData.flag_secret_name;
      }

      // Update instance manager with transformed configs including flag secret
      const updatePayload = {
        pod_name: instanceData.deployment_name,
        apps_config: JSON.stringify(transformedAppConfigs),
      };

      await fetch(
        `${instanceManagerUrl}/update-challenge`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(updatePayload),
        }
      );

      // Create initial challenge instance record
      const challengeInstance = await prisma.challengeInstance.create({
        data: {
          id: instanceData.deployment_name,
          challengeId: challengeId,
          userId: session.user.id,
          competitionId: competitionId,
          challengeImage: challenge.challengeImage,
          challengeUrl: instanceData.challenge_url,
          status: "creating",
          flagSecretName: instanceData.flag_secret_name || "null",
          flag: "null", // Let sync service update this
        },
      });

      // Log challenge start
      try {
        await ActivityLogger.logChallengeEvent(
          ActivityEventType.CHALLENGE_INSTANCE_CREATED,
          session.user.id,
          challengeId,
          challengeInstance.id,
          {
            challengeName: challenge.name,
            challengeType: challenge.challengeType.name,
            startTime: new Date().toISOString()
          }
        );
      } catch (logError) {
        console.error("Error logging challenge start:", logError);
        // Continue even if logging fails
      }

      return NextResponse.json(challengeInstance);
    } catch (instanceError) {
      console.error("Error with instance manager:", instanceError);
      return NextResponse.json(
        { error: instanceError instanceof Error ? instanceError.message : "Failed to start challenge" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Error starting challenge:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start challenge" },
      { status: 500 }
    );
  }
}
