import { NextResponse, NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { authorizeProxyAction } from '@/lib/auth-utils';
import { isValidUUID } from '@/lib/validation/uuid';

// Track request timestamps to prevent log spam
const requestLog = new Map<string, number>();
const LOG_INTERVAL = 60000; // Only log same request type once per minute
const ERROR_LOG_INTERVAL = 300000; // Log errors every 5 minutes

function shouldLog(path: string, isError: boolean = false): boolean {
  const now = Date.now();
  const key = isError ? `error:${path}` : path;
  const lastLog = requestLog.get(key);
  const interval = isError ? ERROR_LOG_INTERVAL : LOG_INTERVAL;

  if (!lastLog || now - lastLog > interval) {
    requestLog.set(key, now);
    return true;
  }
  return false;
}

/**
 * Helper function to handle instance manager requests
 */
async function makeInstanceManagerRequest(url: string, options: RequestInit, path: string) {
  try {
    const response = await fetch(url, options);

    if (!response.ok) {
      if (shouldLog(path, true)) {
        console.error(`Instance manager request failed for ${path}:`, {
          status: response.status,
          statusText: response.statusText
        });
      }
      return NextResponse.json({
        error: `Instance manager request failed: ${response.status} ${response.statusText}`,
        message: 'Error communicating with instance manager'
      }, { status: response.status });
    }

    return response;
  } catch (error) {
    if (shouldLog(path, true)) {
      console.error(`Error making instance manager request for ${path}:`, error);
    }
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Failed to communicate with instance manager'
    }, { status: 503 });
  }
}

/**
 * Proxy API endpoint for instance manager requests
 * This allows client-side code to make requests to the instance manager without CORS issues
 * It also ensures proper routing to internal Kubernetes services
 */
export async function GET(req: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Get the path from the URL
    const url = new URL(req.url);
    const path = url.searchParams.get('path') || '';

    // For operations accessing challenge instance data, verify authorization
    if (path === 'list-challenge-pods') {
      // Admin users can view all instances, but regular users should only see their own
      // Admin check is performed by the instance-manager
      console.log('Instance manager proxy: List Challenge Pods endpoint requested');
    }
    
    // For operations retrieving specific challenge data, verify authorization
    // For instance-specific operations, perform authorization check
    const instanceId = url.searchParams.get('instanceId') || url.searchParams.get('podName');
    if (instanceId && (path.includes('challenge') || path.includes('instance') || path.includes('pod'))) {
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
      
      console.log(`[IM Proxy] Authorized access to instance data for ${instanceId} by user ${session.user.id}`);
    }

    // Forward all other search params
    const queryParams = new URLSearchParams();
    Array.from(url.searchParams.entries()).forEach(([key, value]) => {
      if (key !== 'path') {
        queryParams.append(key, value);
      }
    });

    // Construct the instance manager API URL
    const instanceManagerUrl = 'http://instance-manager.default.svc.cluster.local';
    
    // Create the API endpoint path correctly, handling trailing /api in the URL
    let apiUrl = instanceManagerUrl.endsWith('/api') 
                ? `${instanceManagerUrl}/${path}` 
                : `${instanceManagerUrl}/api/${path}`;
    
    // Add query parameters if they exist
    if (queryParams.toString()) {
      apiUrl += `?${queryParams.toString()}`;
    }

    if (shouldLog(path)) {
      console.log(`Making instance manager request to: ${apiUrl}`);
    }

    const requestOptions = {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${session.user.id}`
      }
    };

    // Special handling for list-challenge-pods endpoint
    if (path === 'list-challenge-pods') {
      if (shouldLog(path)) {
        console.log('Instance manager proxy: List Challenge Pods endpoint requested');
      }

      const response = await makeInstanceManagerRequest(apiUrl, requestOptions, path);

      if (response instanceof NextResponse) {
        if (shouldLog(path, true)) {
          console.log(`List challenge pods fetch failed with status: ${response.status}`);
        }
        return response;
      }

      const data = await response.json();

      // Transform the data to match what InstanceComponent expects
      if (data.challenge_pods && Array.isArray(data.challenge_pods)) {
        const transformedInstances = data.challenge_pods.map((pod: any) => ({
          id: pod.pod_name,
          userId: pod.user_id,
          userEmail: pod.user_email || 'Loading...',
          userName: pod.user_name || 'Loading...',
          challengeId: pod.challenge_id,
          challengeUrl: pod.challenge_url,
          creationTime: pod.creation_time,
          status: pod.status,
          flagSecretName: pod.flag_secret_name,
          groupId: pod.competition_id,
          groupName: pod.competition_id === 'standalone' ? 'Standalone' : pod.competition_id
        }));

        return NextResponse.json({ instances: transformedInstances });
      }

      return NextResponse.json({ instances: [] });
    }

    // Make the request to the instance manager
    const response = await makeInstanceManagerRequest(apiUrl, requestOptions, path);

    if (response instanceof NextResponse) {
      return response;
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error('Error in instance manager proxy:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Error processing instance manager request'
    }, { status: 500 });
  }
}

/**
 * POST method for instance manager requests
 */
export async function POST(req: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Get the path from the URL
    const url = new URL(req.url);
    const path = url.searchParams.get('path') || '';

    // Get the request body
    const body = await req.json();
    
    // For operations modifying specific challenge instances, perform authorization check
    if (path.includes('challenge') || path.includes('instance') || path.includes('pod')) {
      // Extract instance ID from appropriate location in body or query params
      let instanceId = url.searchParams.get('instanceId') || 
                       url.searchParams.get('podName') || 
                       body.instanceId || 
                       body.podName || 
                       body.deployment_name;
      
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
        
        console.log(`[IM Proxy] Authorized modification of instance ${instanceId} by user ${session.user.id}`);
      }
    }

    // Construct the instance manager API URL
    const instanceManagerUrl = 'http://instance-manager.default.svc.cluster.local';
    
    // Create the API endpoint path correctly, handling trailing /api in the URL
    const apiUrl = instanceManagerUrl.endsWith('/api') 
                 ? `${instanceManagerUrl}/${path}` 
                 : `${instanceManagerUrl}/api/${path}`;

    // Only log if we haven't logged this path recently
    if (shouldLog(path)) {
      console.log(`[IM Proxy] POST ${path}`);
    }

    try {
      // Make the request to the instance manager without Authorization header
      // The instance manager doesn't validate Authorization headers
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          // Removed Authorization header as it's not needed by instance-manager
        },
        body: JSON.stringify(body),
      });

      // Check if the response is JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.error(`[IM Proxy Error] Non-JSON response from POST ${path}: ${contentType}`);
        // Try to get the error message from the response
        const text = await response.text();
        console.error(`[IM Proxy Error] Response body: ${text}`);
        return NextResponse.json({
          error: 'Invalid response from instance manager',
          message: 'Expected JSON but received a different content type',
          details: text
        }, { status: 502 });
      }

      // Get the response data
      const data = await response.json();

      // Return the response
      return NextResponse.json(data, { status: response.status });
    } catch (fetchError: unknown) {
      console.error('[IM Proxy Error] POST fetch failed:', path, fetchError instanceof Error ? fetchError.message : 'Unknown error');
      return NextResponse.json({
        error: fetchError instanceof Error ? fetchError.message : 'Unknown error',
        message: 'Error fetching data from instance manager',
        path: path
      }, { status: 500 });
    }
  } catch (error: unknown) {
    console.error('[IM Proxy Error] General POST error:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Error occurred while proxying POST request to instance manager'
    }, { status: 500 });
  }
}

/**
 * DELETE method for instance manager requests, primarily used for terminating challenge pods
 */
export async function DELETE(req: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Get the path from the URL
    const url = new URL(req.url);
    const path = url.searchParams.get('path') || '';

    // Get challengeId or other parameters from the URL
    const challengeId = url.searchParams.get('challengeId');

    if (!challengeId) {
      return NextResponse.json({
        error: 'Missing required parameter',
        message: 'challengeId is required for deletion operations'
      }, { status: 400 });
    }
    
    // Validate the UUID format of the challengeId
    if (!isValidUUID(challengeId)) {
      return NextResponse.json({
        error: 'Invalid parameter format',
        message: 'challengeId must be a valid UUID'
      }, { status: 400 });
    }

    // For challenge deletion operations, perform authorization check using shared utility
    if (path === 'delete-challenge-pod') {
      const { authorized, error } = await authorizeProxyAction(challengeId, session);
      
      // If not authorized, return the error response
      if (!authorized) {
        return error;
      }
      
      // Log successful authorization
      console.log(`[IM Proxy] Authorized termination of ${challengeId} by user ${session.user.id}`);
    }

    // Construct the instance manager API URL
    const instanceManagerUrl = 'http://instance-manager.default.svc.cluster.local';
    
    // Map the path to the correct instance manager endpoint
    let apiUrl;
    if (path === 'delete-challenge-pod') {
      // Create the API endpoint path correctly, handling trailing /api in the URL
      apiUrl = instanceManagerUrl.endsWith('/api') 
             ? `${instanceManagerUrl}/end-challenge` 
             : `${instanceManagerUrl}/api/end-challenge`;
    } else {
      // Create the API endpoint path correctly, handling trailing /api in the URL
      apiUrl = instanceManagerUrl.endsWith('/api') 
             ? `${instanceManagerUrl}/${path}` 
             : `${instanceManagerUrl}/api/${path}`;
    }

    // Only log if we haven't logged this path recently
    if (shouldLog(path)) {
      console.log(`[IM Proxy] DELETE ${path} (${challengeId}) calling endpoint: ${apiUrl}`);
    }

    try {
      // Make the request to the instance manager without Authorization header
      // The instance manager doesn't validate Authorization headers
      const response = await fetch(apiUrl, {
        method: 'POST', // Note: Instance Manager uses POST with a specific body for deletions
        headers: {
          'Content-Type': 'application/json',
          // Removed Authorization header as it's not needed by instance-manager
        },
        body: JSON.stringify({
          deployment_name: challengeId
        }),
      });

      // Log the response status for troubleshooting
      console.log(`[IM Proxy] Response from ${apiUrl}: ${response.status}`);

      // Handle empty responses (HTTP 204)
      if (response.status === 204 || response.headers.get('content-length') === '0') {
        return new NextResponse(null, { status: 204 });
      }

      // Check if the response is JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        if (response.ok) {
          return NextResponse.json({
            success: true,
            message: 'Challenge pod deletion initiated successfully'
          });
        }

        console.error(`[IM Proxy Error] Non-JSON response from DELETE ${path}: ${contentType}`);
        return NextResponse.json({
          error: 'Invalid response from instance manager',
          message: 'Expected JSON but received a different content type'
        }, { status: 502 });
      }

      // Get the response data
      const data = await response.json();

      // Return the response
      return NextResponse.json(data, { status: response.status });
    } catch (fetchError: unknown) {
      console.error('[IM Proxy Error] DELETE fetch failed:', path, fetchError instanceof Error ? fetchError.message : 'Unknown error');
      return NextResponse.json({
        error: fetchError instanceof Error ? fetchError.message : 'Unknown error',
        message: 'Error deleting challenge pod from instance manager',
        path: path
      }, { status: 500 });
    }
  } catch (error: unknown) {
    console.error('[IM Proxy Error] General DELETE error:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Error occurred while proxying DELETE request to instance manager'
    }, { status: 500 });
  }
}
