import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getInstanceManagerUrl } from '@/lib/api-config';
import { logger } from '@/lib/logger';
import { getChallengeInstanceMetadata, updateChallengeInstanceWithMetadata } from '@/lib/prisma-utils';
import fetch from 'node-fetch';

// Endpoint to check the status of queued challenge tasks
export async function GET(req: NextRequest) {
  try {
    // Authorize the request
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get query parameters
    const taskId = req.nextUrl.searchParams.get('taskId');
    const instanceId = req.nextUrl.searchParams.get('instanceId');

    if (!taskId) {
      return NextResponse.json({ error: "Task ID is required" }, { status: 400 });
    }

    if (!instanceId) {
      return NextResponse.json({ error: "Instance ID is required" }, { status: 400 });
    }

    // Verify the instance exists and belongs to the user
    const instance = await prisma.challengeInstance.findUnique({
      where: { id: instanceId }
    });

    if (!instance) {
      return NextResponse.json({ error: "Instance not found" }, { status: 404 });
    }

    // Check if the user owns this instance
    if (instance.userId !== session.user.id) {
      // Check if the user is an admin
      const isAdmin = session.user.role === 'ADMIN';
      if (!isAdmin) {
        return NextResponse.json({ error: "Not authorized to access this instance" }, { status: 403 });
      }
    }

    // Get typed metadata
    const metadata = getChallengeInstanceMetadata<Record<string, any>>(instance);

    // Connect to the instance manager to check task status
    try {
      const instanceManagerUrl = getInstanceManagerUrl();
      const response = await fetch(`${instanceManagerUrl}/task-status/${taskId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        // Check if it's a 404 (task not found)
        if (response.status === 404) {
          logger.warn(`Task ${taskId} not found in instance manager queue`);
          
          // Check if the instance is already in ACTIVE or ERROR state
          // This handles the case where the task was completed but removed from the queue
          if (instance.status === 'ACTIVE') {
            return NextResponse.json({
              status: 'ACTIVE',
              message: 'Challenge is already deployed',
              url: instance.challengeUrl
            });
          } else if (instance.status === 'ERROR') {
            const errorMessage = metadata?.error || 'Unknown error';
              
            return NextResponse.json({
              status: 'ERROR',
              message: 'Challenge deployment failed',
              error: errorMessage
            });
          }
          
          return NextResponse.json({
            status: 'UNKNOWN',
            message: 'Task not found and instance is not in a terminal state'
          });
        }
        
        const errorText = await response.text();
        logger.error(`Error from instance manager: ${response.status} ${errorText}`);
        return NextResponse.json({
          status: 'ERROR',
          message: `Error checking task status: ${errorText}`
        }, { status: response.status });
      }

      const result = await response.json();

      // If task is completed
      if (result.completed) {
        const taskResult = result.result;
        
        if (taskResult.success) {
          // Task succeeded - update instance status if needed
          if (instance.status !== 'ACTIVE') {
            await updateChallengeInstanceWithMetadata(instance.id, {
              status: 'ACTIVE',
              challengeUrl: taskResult.webosUrl || taskResult.url || instance.challengeUrl,
              metadata: null // Clear metadata since we're done
            });
          }
          
          return NextResponse.json({
            status: 'ACTIVE',
            message: 'Challenge deployed successfully',
            url: taskResult.webosUrl || taskResult.url || instance.challengeUrl
          });
        } else {
          // Task failed - update instance status if needed
          if (instance.status !== 'ERROR') {
            await updateChallengeInstanceWithMetadata(instance.id, {
              status: 'ERROR',
              metadata: {
                ...(metadata || {}),
                error: taskResult.error || 'Unknown error'
              }
            });
          }
          
          return NextResponse.json({
            status: 'ERROR',
            message: 'Challenge deployment failed',
            error: taskResult.error || 'Unknown error'
          });
        }
      }
      
      // Task is still in progress
      return NextResponse.json({
        status: 'QUEUED',
        message: 'Challenge is queued for deployment',
        position: metadata?.queuePosition || 0,
        priority: metadata?.priority || 2,
        metadata: result.metadata || {}
      });
    } catch (error) {
      logger.error(`Error polling task status: ${error}`);
      return NextResponse.json({
        status: 'ERROR',
        message: `Error checking task status: ${error instanceof Error ? error.message : String(error)}`
      }, { status: 500 });
    }
  } catch (error) {
    logger.error(`Error in task status route: ${error}`);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Failed to check task status"
    }, { status: 500 });
  }
} 