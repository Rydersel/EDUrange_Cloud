import { prisma } from "@/lib/prisma";
import { ActivityLogger, ActivityEventType } from '@/lib/activity-logger';

export async function scheduleTerminationCheck() {
  // This should be run by a cron job or scheduled task
  
  // Find stuck instances in TERMINATING state
  const stuckInstances = await prisma.challengeInstance.findMany({
    where: {
      status: "TERMINATING"
    },
    take: 10 // Limit to 10 instances per check
  });
  
  console.log(`Found ${stuckInstances.length} instances in TERMINATING state`);
  
  for (const instance of stuckInstances) {
    console.log(`Re-attempting termination for instance ${instance.id}`);
    
    try {
      // Get dashboard URL for callback
      const dashboardUrl = process.env.DASHBOARD_URL || 
                         (process.env.NODE_ENV === "development" 
                          ? "http://localhost:3000" 
                          : "http://dashboard.default.svc.cluster.local");
      
      // Call instance manager directly
      const response = await fetch(`${process.env.INSTANCE_MANAGER_URL || 'http://instance-manager.default.svc.cluster.local'}/api/end-challenge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          deployment_name: instance.id,
          callback_url: `${dashboardUrl}/api/challenges/termination-callback`
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to re-initiate termination: ${response.statusText}`);
      }
      
      // Log retry attempt
      await ActivityLogger.logChallengeEvent(
        ActivityEventType.CHALLENGE_TERMINATION_INITIATED,
        instance.userId,
        instance.challengeId,
        instance.id,
        {
          status: "RETRYING_TERMINATION",
          attemptNumber: 1,
          reason: "Stuck in TERMINATING state"
        }
      );
    } catch (error) {
      console.error(`Error re-initiating termination for instance ${instance.id}:`, error);
      
      // Mark as ERROR
      await prisma.challengeInstance.update({
        where: { id: instance.id },
        data: {
          status: "ERROR"
        }
      });
      
      await ActivityLogger.logChallengeEvent(
        ActivityEventType.SYSTEM_ERROR,
        instance.userId,
        instance.challengeId,
        instance.id,
        {
          error: error instanceof Error ? error.message : "Unknown error",
          context: "Termination retry failed"
        }
      );
    }
  }
  
  // Also handle instances in ERROR state
  const errorInstances = await prisma.challengeInstance.findMany({
    where: {
      status: "ERROR"
    },
    take: 10 // Limit to 10 instances per check
  });
  
  console.log(`Found ${errorInstances.length} instances in ERROR state for retry`);
  
  for (const instance of errorInstances) {
    console.log(`Retrying termination for instance ${instance.id} in ERROR state`);
    
    try {
      // Update to TERMINATING
      await prisma.challengeInstance.update({
        where: { id: instance.id },
        data: {
          status: "TERMINATING"
        }
      });
      
      // Log retry attempt
      await ActivityLogger.logChallengeEvent(
        ActivityEventType.CHALLENGE_TERMINATION_INITIATED,
        instance.userId,
        instance.challengeId,
        instance.id,
        {
          status: "RETRYING_TERMINATION",
          attemptNumber: 1,
          reason: "Retry from ERROR state"
        }
      );
      
      // Get dashboard URL for callback
      const dashboardUrl = process.env.DASHBOARD_URL || 
                          (process.env.NODE_ENV === "development" 
                           ? "http://localhost:3000" 
                           : "http://dashboard.default.svc.cluster.local");
      
      // Call instance manager directly
      const response = await fetch(`${process.env.INSTANCE_MANAGER_URL || 'http://instance-manager.default.svc.cluster.local'}/api/end-challenge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          deployment_name: instance.id,
          callback_url: `${dashboardUrl}/api/challenges/termination-callback`
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to retry termination from ERROR state: ${response.statusText}`);
      }
    } catch (error) {
      console.error(`Error retrying termination for instance ${instance.id} from ERROR state:`, error);
    }
  }
}

// Export a function to create a scheduled task handler
export function createTerminationMonitor() {
  return {
    run: async () => {
      console.log('Running termination monitor check...');
      try {
        await scheduleTerminationCheck();
        console.log('Termination monitor check completed');
      } catch (error) {
        console.error('Error in termination monitor:', error);
      }
    }
  };
} 