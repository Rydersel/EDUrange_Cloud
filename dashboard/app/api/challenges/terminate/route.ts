import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ActivityEventType } from '@/lib/activity-logger';
import { requireUser, authorizeProxyAction } from '@/lib/auth-utils';

export async function POST(req: NextRequest) {
  try {
    // Use existing auth utility for consistent authentication
    const { session, authorized, error } = await requireUser();

    // If not authorized, return the error response
    if (!authorized || !session) {
      return error;
    }

    // Parse the request body
    const body = await req.json();
    const { instanceId } = body;

    // Validate required fields
    if (!instanceId) {
      return NextResponse.json(
        { error: "Instance ID is required" },
        { status: 400 }
      );
    }

    // Check if the instance exists and is already terminating or terminated
    const existingInstance = await prisma.challengeInstance.findUnique({
      where: { id: instanceId }
    });
    
    if (!existingInstance) {
      return NextResponse.json(
        { error: "Instance not found" },
        { status: 404 }
      );
    }
    
    // If already terminating or terminated, just return success without additional processing
    if (existingInstance.status === "TERMINATING" || existingInstance.status === "TERMINATED") {
      return NextResponse.json({
        message: "Challenge termination already in progress or completed",
        status: existingInstance.status.toLowerCase()
      });
    }

    // Use shared authorization utility for instance actions
    const { authorized: isAuthorized, error: authError, instance } = 
      await authorizeProxyAction(instanceId, session);

    // If not authorized, return the error response
    if (!isAuthorized || !instance) {
      return authError;
    }

    // Get the authenticated user's ID from the session
    const authenticatedUserId = session.user.id;

    // Update status to TERMINATING
    await prisma.challengeInstance.update({
      where: { id: instanceId },
      data: { status: "TERMINATING" }
    });

    // Log the termination initiation
    try {
      await prisma.activityLog.create({
        data: {
          eventType: "CHALLENGE_INSTANCE_DELETED" as any,
          userId: authenticatedUserId,
          challengeInstanceId: instance.id,
          severity: "INFO",
          metadata: {
            userId: instance.userId,
            challengeId: instance.challengeId,
            status: "TERMINATING"
          }
        }
      });
    } catch (logError) {
      console.warn("Error logging termination initiation:", logError);
      // Continue even if logging fails
    }

    // Get instance manager URL, ensuring no duplicate /api prefix
    const instanceManagerBaseUrl = process.env.INSTANCE_MANAGER_URL || 
                              "http://instance-manager.default.svc.cluster.local";
    
    // Ensure we have only one /api in the path by removing any trailing /api
    const instanceManagerUrl = instanceManagerBaseUrl.endsWith('/api') 
                            ? instanceManagerBaseUrl.slice(0, -4) // Remove trailing /api
                            : instanceManagerBaseUrl;
                            
    // Construct the final URL with the correct endpoint path                            
    const apiUrl = `${instanceManagerUrl}/api/end-challenge`;

    console.log(`Terminating challenge: ${instanceId} via ${apiUrl}`);
    
    // Make the API call to terminate the challenge
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        deployment_name: instanceId
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Failed to terminate challenge:', {
        status: response.status,
        error: errorData
      });

      // Update status to ERROR
      await prisma.challengeInstance.update({
        where: { id: instanceId },
        data: { status: "ERROR" },
      });

      return NextResponse.json(
        { error: `Failed to terminate challenge: ${errorData}` },
        { status: 500 }
      );
    }

    // Update status to TERMINATED
    await prisma.challengeInstance.update({
      where: { id: instanceId },
      data: { status: "TERMINATED" },
    });

    // Return success response
    return NextResponse.json({
      message: "Challenge termination completed",
      status: "terminated"
    });
    
  } catch (error) {
    console.error("Error terminating challenge:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to terminate challenge" },
      { status: 500 }
    );
  }
}
