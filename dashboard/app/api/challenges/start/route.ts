import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import authConfig from '@/auth.config';
import { prisma } from '@/lib/prisma';
import { getUserChallengeInstances } from '@/lib/challenges-service';
import { v4 as uuidv4 } from 'uuid';
import { ActivityLogger, ActivityEventType } from '@/lib/activity-logger';
import { getInstanceManagerUrl } from '@/lib/api-config';
import fetch from 'node-fetch';

// Function to generate a random flag for challenges
const generateFlag = (challengeId: string): string => {
  return `flag{${uuidv4().substring(0, 8)}${challengeId.substring(0, 4)}}`;
};

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authConfig);
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { challengeId, competitionId } = body;

    if (!challengeId || !competitionId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Check if user already has too many active instances
    const userInstances = await getUserChallengeInstances(session.user.id);
    const activeInstances = userInstances.filter(
      (instance: any) => instance.status === "RUNNING" || instance.status === "STARTING"
    );

    // Limit active instances to 3 per user
    const MAX_ACTIVE_INSTANCES = 3;
    if (activeInstances.length >= MAX_ACTIVE_INSTANCES) {
      return NextResponse.json(
        { 
          error: `You have reached the maximum limit of ${MAX_ACTIVE_INSTANCES} active challenges. Please terminate some before starting new ones.`,
          activeInstances 
        },
        { status: 400 }
      );
    }

    // Get challenge details, including CDF content
    const challenge = await prisma.challenge.findUnique({
      where: { id: challengeId },
      include: {
        pack: true
      }
    });

    if (!challenge) {
      return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
    }

    // Ensure CDF content exists
    if (!challenge.cdf_content) {
      console.error(`Challenge ${challengeId} is missing CDF content.`);
      return NextResponse.json({ error: 'Challenge definition (CDF) is missing or invalid.' }, { status: 500 });
    }

    // Debug logs to check CDF content
    console.log(`Challenge ${challengeId} CDF content type: ${typeof challenge.cdf_content}`);
    console.log(`Challenge ${challengeId} CDF content keys: ${Object.keys(challenge.cdf_content)}`);
    
    // Parse CDF content if needed
    let cdfContentObj = typeof challenge.cdf_content === 'string' 
      ? JSON.parse(challenge.cdf_content) 
      : challenge.cdf_content;
    
    // Get or create typeConfig if not present
    if (!cdfContentObj.typeConfig) {
      console.log(`Challenge ${challengeId} does not have typeConfig, attempting to create a default one.`);
      // Default typeConfig based on challenge type
      const challengeType = challenge.challengeTypeId?.toLowerCase() || '';
      
      // Add default typeConfig
      cdfContentObj.typeConfig = {
        challengeImage: `registry.rydersel.cloud/${challengeId}`
      };
      
      // Add type-specific configuration based on challenge type
      if (challengeType === 'metasploit') {
        cdfContentObj.typeConfig.attackImage = `registry.rydersel.cloud/${challengeId}-attack`;
        cdfContentObj.typeConfig.defenseImage = `registry.rydersel.cloud/${challengeId}-defense`;
      }
    }
    
    let challengeInstance;
    try {
      // Create initial challenge instance record
      challengeInstance = await prisma.challengeInstance.create({
        data: {
          challengeId: challengeId,
          userId: session.user.id,
          competitionId: competitionId,
          challengeUrl: 'pending...',
          status: "STARTING",
          flagSecretName: null,
          flag: generateFlag(challengeId),
        },
      });

      // Call Instance Manager
      const instanceManagerUrl = getInstanceManagerUrl();
      // Ensure cdf_content is a string as expected by the Instance Manager
      const cdfContent = typeof cdfContentObj === 'object' 
        ? JSON.stringify(cdfContentObj) 
        : challenge.cdf_content;
        
      const imPayload = {
        deployment_name: challengeInstance.id,
        user_id: session.user.id,
        cdf_content: cdfContent,
        competition_id: competitionId
      };

      console.log(`Sending payload to instance manager: ${JSON.stringify({
        deployment_name: challengeInstance.id,
        user_id: session.user.id,
        cdf_content_length: String(cdfContent).length,
        competition_id: competitionId
      })}`);

      const imResponse = await fetch(`${instanceManagerUrl}/start-challenge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(imPayload),
      });

      if (!imResponse.ok) {
        const errorText = await imResponse.text();
        console.error(`Instance Manager failed for ${challengeInstance.id}: ${imResponse.status} ${errorText}`);
        await prisma.challengeInstance.update({
            where: { id: challengeInstance.id },
            data: { status: 'ERROR' },
        });
        throw new Error(`Instance Manager failed: ${errorText}`);
      }

      const imResult = await imResponse.json();
      console.log(`Instance Manager response for ${challengeInstance.id}:`, imResult);
      
      // Extract flag information from Instance Manager response
      const flagSecretName = imResult.flag_secret_name || null;
      
      // Handle flags from Instance Manager
      let flag = challengeInstance.flag; // Keep existing flag as default
      
      // Check if we have flags in the response
      if (imResult.flags && Object.keys(imResult.flags).length > 0) {
        const flags = imResult.flags;
        // Try to get FLAG_1 first, then fall back to the first flag value
        flag = flags.FLAG_1 || Object.values(flags)[0] || flag;
        console.log(`Using flag from Instance Manager for ${challengeInstance.id}: ${flag}`);
      }

      // Get the primary URL - always use the WebOS URL regardless of challenge type
      // This ensures a consistent experience where users always start in the WebOS environment
      const primaryUrl = imResult.webosUrl || "pending...";
      console.log(`Setting primary URL for ${challengeInstance.id} to ${primaryUrl}`);
      
      // Create an entry in ActivityLog to store additional URL information
      // Since ChallengeInstance doesn't have a metadata field
      await ActivityLogger.logChallengeEvent(
        ActivityEventType.CHALLENGE_INSTANCE_CREATED,
        session.user.id,
        challengeId,
        challengeInstance.id,
        {
          webChallengeUrl: imResult.webChallengeUrl || null,
          challengeUrl: primaryUrl,
          challengeName: challenge.name,
          challengeTypeId: challenge.challengeTypeId
        }
      );
      
      // Update the challenge instance with the actual URL and flag information
      await prisma.challengeInstance.update({
        where: { id: challengeInstance.id },
        data: {
          challengeUrl: primaryUrl,
          flagSecretName: flagSecretName,
          flag: flag
        },
      });
      
      // Log successful initiation
      try {
        await ActivityLogger.logChallengeEvent(
          ActivityEventType.CHALLENGE_INSTANCE_CREATED,
          session.user.id,
          challengeId,
          challengeInstance.id,
          {
            challengeName: challenge.name,
            challengeTypeId: challenge.challengeTypeId,
            packName: challenge.pack?.name,
            startTime: new Date().toISOString()
          }
        );
      } catch (logError) {
        console.error("Error logging challenge start:", logError);
      }

      return NextResponse.json(challengeInstance);

    } catch (error) {
      console.error("Error processing challenge start:", error);
      if (challengeInstance?.id) {
         try {
           // Check if the instance still exists before trying to update it
           const instanceExists = await prisma.challengeInstance.findUnique({
             where: { id: challengeInstance.id }
           });
           
           if (instanceExists && instanceExists.status !== 'ERROR') {
             await prisma.challengeInstance.update({
               where: { id: challengeInstance.id },
               data: { status: 'ERROR' },
             });
           } else {
             console.log(`Instance ${challengeInstance.id} not found or already in ERROR state, skipping update`);
           }
         } catch (updateError) {
            console.error(`Failed to update instance ${challengeInstance.id} status to ERROR:`, updateError);
         }
      }
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Failed to start challenge instance" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Error in start challenge route:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start challenge" },
      { status: 500 }
    );
  }
}
