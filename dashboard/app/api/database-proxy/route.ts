import { NextResponse, NextRequest } from 'next/server';
import { getDatabaseApiUrl } from '@/lib/api-config';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { authorizeProxyAction } from '@/lib/auth-utils';
import { isValidUUID } from '@/lib/validation/uuid';

/**
 * Proxy API endpoint for database API requests
 * This allows client-side code to make requests to the database API without CORS or mixed content issues
 */
export async function GET(req: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Get the URL parameters from the request URL
    const url = new URL(req.url);
    const searchParams = url.searchParams;
    const path = searchParams.get('path') || '';
    
    // For instance-specific operations, check authorization
    const instanceId = searchParams.get('instanceId') || searchParams.get('id');
    if (instanceId && 
        (path.includes('challenge-instance') || path.includes('instance'))) {
      
      // Validate the UUID format of the instanceId
      if (!isValidUUID(instanceId)) {
        return NextResponse.json({
          error: 'Invalid parameter format',
          message: 'instanceId must be a valid UUID'
        }, { status: 400 });
      }
      
      // Use shared authorization utility to validate access
      const { authorized, error } = await authorizeProxyAction(instanceId, session);
      
      // If not authorized, return the error response
      if (!authorized) {
        return error;
      }
      
      console.log(`[DB Proxy] Authorized access to instance data ${instanceId} by user ${session.user.id}`);
    }
    
    // Special handling for challenge-instances
    if (path === 'challenge-instances') {
      return handleChallengeInstances(session.user.id);
    }
    
    // Special handling for direct challenge instances (fallback)
    if (path === 'challenge-instances-direct') {
      return handleChallengeInstancesDirect(session.user.id);
    }
    
    // Forward all search params
    const queryParams = new URLSearchParams();
    Array.from(searchParams.entries()).forEach(([key, value]) => {
      if (key !== 'path') {
        queryParams.append(key, value);
      }
    });

    // Construct the database API URL
    const databaseApiUrl = getDatabaseApiUrl();
    let apiUrl = `${databaseApiUrl}/${path}`;

    // Add query parameters if any exist
    const queryString = queryParams.toString();
    if (queryString) {
      apiUrl += `?${queryString}`;
    }

    console.log(`Database proxy: Forwarding GET request to ${apiUrl}`);

    try {
      // Make the request to the database API
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.user.id}` // Pass user ID as auth
        },
      });

      // Check if the response is JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.error(`Received non-JSON response from ${apiUrl}: ${contentType}`);
        return NextResponse.json({ 
          error: 'Invalid response from database API',
          message: 'Expected JSON but received a different content type' 
        }, { status: 502 });
      }

      // Get the response data
      const data = await response.json();

      // Return the response
      return NextResponse.json(data, { status: response.status });
    } catch (fetchError) {
      console.error('Fetch error in database proxy:', fetchError);
      
      // If we were trying to get challenge instances, fall back to direct Prisma
      if (path.includes('challenge') || path.includes('instance')) {
        return handleChallengeInstancesDirect(session.user.id);
      }
      
      return NextResponse.json({ 
        error: fetchError instanceof Error ? fetchError.message : 'Unknown error',
        message: 'Error fetching data from database API'
      }, { status: 500 });
    }
  } catch (error) {
    console.error('Error in database proxy:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Error occurred while proxying request to database API'
    }, { status: 500 });
  }
}

/**
 * Special handler for challenge instances that uses Prisma directly when database API fails
 */
async function handleChallengeInstances(userId: string) {
  try {
    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    let instances;
    
    // If admin, get all instances
    if (user?.role === 'ADMIN') {
      instances = await prisma.challengeInstance.findMany({
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          competition: {
            select: {
              id: true,
              name: true
            }
          }
        }
      });
    } else {
      // Otherwise, get only instances owned by the user
      instances = await prisma.challengeInstance.findMany({
        where: {
          userId: userId
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          competition: {
            select: {
              id: true,
              name: true
            }
          }
        }
      });
    }

    // Transform the data to match the expected format
    const transformedInstances = instances.map(instance => ({
      id: instance.id,
      userId: instance.userId,
      userEmail: instance.user?.email,
      userName: instance.user?.name,
      challengeId: instance.challengeId,
      challengeUrl: instance.challengeUrl,
      creationTime: instance.creationTime.toISOString(),
      status: instance.status || 'Unknown',
      flagSecretName: instance.flagSecretName,
      flag: instance.flag,
      groupId: instance.competitionId,
      groupName: instance.competition?.name,
      challengeType: instance.user?.id ? 'fullos' : 'unknown'
    }));

    // Return the instances wrapped in an instances array
    return NextResponse.json({ instances: transformedInstances });
  } catch (error) {
    console.error('Error fetching challenge instances:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Error occurred while fetching challenge instances' 
    }, { status: 500 });
  }
}

/**
 * Direct handler for challenge instances that only uses Prisma
 * This is a more reliable fallback when both database API and instance manager fail
 */
async function handleChallengeInstancesDirect(userId: string) {
  try {
    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    let instances;
    
    // If admin, get all instances
    if (user?.role === 'ADMIN') {
      instances = await prisma.challengeInstance.findMany({
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          competition: {
            select: {
              id: true,
              name: true
            }
          }
        },
        orderBy: {
          creationTime: 'desc'
        }
      });
    } else {
      // Otherwise, get only instances owned by the user
      instances = await prisma.challengeInstance.findMany({
        where: {
          userId: userId
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          competition: {
            select: {
              id: true,
              name: true
            }
          }
        },
        orderBy: {
          creationTime: 'desc'
        }
      });
    }

    // Transform the data to match the expected format
    const transformedInstances = instances.map(instance => ({
      user: {
        id: instance.userId,
        name: instance.user.name,
        email: instance.user.email,
      },
      competition: {
        id: instance.competitionId,
        name: instance.competition.name,
      },
      status: instance.status,
      id: instance.id,
      userId: instance.userId,
      challengeId: instance.challengeId,
      challengeUrl: instance.challengeUrl,
      creationTime: instance.creationTime,
      flagSecretName: instance.flagSecretName,
      flag: instance.flag,
      competitionId: instance.competitionId,
      k8s_instance_name: instance.k8s_instance_name,
    }));

    const systemData = transformedInstances.map(instanceToSystemData);
    
    return NextResponse.json(systemData);
  } catch (error) {
    console.error('Error in direct challenge instances:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Error occurred while fetching challenge instances directly' 
    }, { status: 500 });
  }
}

/**
 * Helper function to extract challenge type from image name
 */
function extractChallengeTypeFromImage(imageName: string): string {
  if (!imageName) return 'Unknown';
  
  // Try to extract based on known patterns
  if (imageName.includes('bandit')) return 'Bandit';
  if (imageName.includes('juice')) return 'Juice Shop';
  if (imageName.includes('web')) return 'Web Challenge';
  
  // Split by common delimiters and take the first part
  const parts = imageName.split(/[:/-]/);
  if (parts.length > 0 && parts[0]) {
    return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  }
  
  return 'Unknown';
}

/**
 * POST method for database API requests
 * This allows client-side code to make POST requests to the database API without CORS or mixed content issues
 */
export async function POST(req: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Get the URL parameters from the request URL
    const url = new URL(req.url);
    const searchParams = url.searchParams;
    const path = searchParams.get('path') || '';
    
    // Get the request body
    const body = await req.json();
    
    // For instance-specific operations, perform authorization check
    if (path.includes('challenge-instance') || path.includes('instance')) {
      // Extract instance ID from appropriate location in body or query params
      let instanceId = searchParams.get('instanceId') || 
                       body.instanceId || 
                       body.id;
      
      // If we have an instance ID, validate and authorize access
      if (instanceId) {
        // Validate UUID format
        if (!isValidUUID(instanceId)) {
          return NextResponse.json({
            error: 'Invalid parameter format',
            message: 'Instance ID must be a valid UUID'
          }, { status: 400 });
        }
        
        // Authorize access to this specific instance
        const { authorized, error } = await authorizeProxyAction(instanceId, session);
        
        // If not authorized, return the error response
        if (!authorized) {
          return error;
        }
        
        console.log(`[DB Proxy] Authorized modification of instance ${instanceId} by user ${session.user.id}`);
      }
    }

    // Forward all other search params
    const queryParams = new URLSearchParams();
    Array.from(searchParams.entries()).forEach(([key, value]) => {
      if (key !== 'path') {
        queryParams.append(key, value);
      }
    });

    // Construct the database API URL
    const databaseApiUrl = getDatabaseApiUrl();
    const apiUrl = `${databaseApiUrl}/${path}`;

    console.log(`Database proxy: Forwarding POST request to ${apiUrl}`);

    try {
      // Make the request to the database API
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.user.id}` // Pass user ID as auth
        },
        body: JSON.stringify(body),
      });

      // Check if the response is JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.error(`Received non-JSON response from ${apiUrl}: ${contentType}`);
        return NextResponse.json({ 
          error: 'Invalid response from database API',
          message: 'Expected JSON but received a different content type' 
        }, { status: 502 });
      }

      // Get the response data
      const data = await response.json();

      // Return the response
      return NextResponse.json(data, { status: response.status });
    } catch (fetchError) {
      console.error('Fetch error in database proxy POST:', fetchError);
      return NextResponse.json({ 
        error: fetchError instanceof Error ? fetchError.message : 'Unknown error',
        message: 'Error fetching data from database API'
      }, { status: 500 });
    }
  } catch (error) {
    console.error('Error in database proxy POST:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Error occurred while proxying POST request to database API'
    }, { status: 500 });
  }
}

/**
 * DELETE method for database API requests
 * Special handling for challenge instance deletion with fallback to direct Prisma
 */
export async function DELETE(req: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Get the URL parameters from the request URL
    const url = new URL(req.url);
    const searchParams = url.searchParams;
    const path = searchParams.get('path') || '';
    const instanceId = searchParams.get('instanceId');

    // Special handling for delete-challenge-instance
    if (path === 'delete-challenge-instance' && instanceId) {
      // Validate the UUID format of the instanceId
      if (!isValidUUID(instanceId)) {
        return NextResponse.json({
          error: 'Invalid parameter format',
          message: 'instanceId must be a valid UUID'
        }, { status: 400 });
      }
      
      // Use shared authorization utility to validate access to this instance
      const { authorized, error } = await authorizeProxyAction(instanceId, session);
      
      // If not authorized, return the error response
      if (!authorized) {
        return error;
      }
      
      // Log authorization for audit purposes
      console.log(`[DB Proxy] Authorized deletion of instance ${instanceId} by user ${session.user.id}`);
      
      // Proceed with deletion
      return handleDeleteChallengeInstance(instanceId, session.user.id);
    }

    // For other DELETE requests, forward to database API
    const queryParams = new URLSearchParams();
    Array.from(searchParams.entries()).forEach(([key, value]) => {
      if (key !== 'path') {
        queryParams.append(key, value);
      }
    });

    // Construct the database API URL
    const databaseApiUrl = getDatabaseApiUrl();
    let apiUrl = `${databaseApiUrl}/${path}`;

    // Add query parameters if any exist
    const queryString = queryParams.toString();
    if (queryString) {
      apiUrl += `?${queryString}`;
    }

    console.log(`Database proxy: Forwarding DELETE request to ${apiUrl}`);

    try {
      // Make the request to the database API
      const response = await fetch(apiUrl, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.user.id}` // Pass user ID as auth
        },
      });

      // For empty responses or successful deletes that might not return JSON
      if (response.status === 204 || response.headers.get('content-length') === '0') {
        return NextResponse.json({ 
          success: true,
          message: 'Successfully deleted' 
        }, { status: 200 });
      }

      // Check if the response is JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.error(`Received non-JSON response from ${apiUrl}: ${contentType}`);
        
        // If we're trying to delete a challenge instance, try the direct approach
        if (path === 'delete-challenge-instance' && instanceId) {
          return handleDeleteChallengeInstance(instanceId, session.user.id);
        }
        
        return NextResponse.json({ 
          error: 'Invalid response from database API',
          message: 'Expected JSON but received a different content type' 
        }, { status: 502 });
      }

      // Get the response data
      const data = await response.json();

      // Return the response
      return NextResponse.json(data, { status: response.status });
    } catch (fetchError) {
      console.error('Fetch error in database proxy DELETE:', fetchError);
      
      // If we're trying to delete a challenge instance, try the direct approach
      if (path === 'delete-challenge-instance' && instanceId) {
        return handleDeleteChallengeInstance(instanceId, session.user.id);
      }
      
      return NextResponse.json({ 
        error: fetchError instanceof Error ? fetchError.message : 'Unknown error',
        message: 'Error fetching data from database API'
      }, { status: 500 });
    }
  } catch (error) {
    console.error('Error in database proxy DELETE:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Error occurred while proxying DELETE request to database API'
    }, { status: 500 });
  }
}

/**
 * Direct handler for challenge instance deletion using Prisma
 */
async function handleDeleteChallengeInstance(instanceId: string, userId: string) {
  try {
    console.log(`Directly deleting challenge instance with ID: ${instanceId}`);
    
    // Authorization is already handled by authorizeProxyAction, no need to check again
    
    // Delete the instance
    await prisma.challengeInstance.delete({
      where: { id: instanceId }
    });
    
    // Notify instance manager to clean up pods (best effort)
    try {
      const instanceManagerUrl = 'http://instance-manager.default.svc.cluster.local/api';
      await fetch(`${instanceManagerUrl}/end-challenge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deployment_name: instanceId
        })
      });
    } catch (imError) {
      console.error('Error notifying instance manager (continuing anyway):', imError);
      // Continue even if this fails - we've already deleted from the database
    }
    
    return NextResponse.json({ 
      success: true,
      message: 'Instance deleted successfully' 
    });
  } catch (error) {
    console.error('Error in direct challenge instance deletion:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Error occurred while deleting challenge instance' 
    }, { status: 500 });
  }
}

const instanceToUserData = (instance: any) => ({
  ...instance.user,
  group: {
    id: instance.competitionId,
    name: instance.competition?.name
  },
  startTime: instance.creationTime,
  id: instance.id,
  challengeId: instance.challengeId,
  challengeUrl: instance.challengeUrl,
  challengeType: 'fullos',
});

const instanceToSystemData = (instance: any) => ({
  user: { id: instance.userId, name: instance.user.name, email: instance.user.email },
  id: instance.id,
  challengeId: instance.challengeId,
  challengeUrl: instance.challengeUrl,
  competitionId: instance.competitionId,
  groupId: instance.competitionId,
  groupName: instance.competition?.name,
  challengeType: 'fullos'
});