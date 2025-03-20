import { NextResponse, NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

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
    
    // Forward all other search params
    const queryParams = new URLSearchParams();
    Array.from(url.searchParams.entries()).forEach(([key, value]) => {
      if (key !== 'path') {
        queryParams.append(key, value);
      }
    });

    // Construct the instance manager API URL
    const instanceManagerUrl = 'http://instance-manager.default.svc.cluster.local/api';
    let apiUrl = `${instanceManagerUrl}/${path}`;

    // Add query parameters if any exist
    const queryString = queryParams.toString();
    if (queryString) {
      apiUrl += `?${queryString}`;
    }

    console.log(`Instance manager proxy: Forwarding GET request to ${apiUrl}`);

    try {
      // Make the request to the instance manager
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.user.id}` // Pass user ID for authorization
        },
      });

      // Check if the response is JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.error(`Received non-JSON response from ${apiUrl}: ${contentType}`);
        return NextResponse.json({ 
          error: 'Invalid response from instance manager',
          message: 'Expected JSON but received a different content type' 
        }, { status: 502 });
      }

      // Get the response data
      const data = await response.json();

      // Return the response
      return NextResponse.json(data, { status: response.status });
    } catch (fetchError) {
      console.error('Fetch error in instance manager proxy:', fetchError);
      return NextResponse.json({ 
        error: fetchError instanceof Error ? fetchError.message : 'Unknown error',
        message: 'Error fetching data from instance manager',
        path: path
      }, { status: 500 });
    }
  } catch (error) {
    console.error('Error in instance manager proxy:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Error occurred while proxying request to instance manager'
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

    // Construct the instance manager API URL
    const instanceManagerUrl = 'http://instance-manager.default.svc.cluster.local/api';
    const apiUrl = `${instanceManagerUrl}/${path}`;

    console.log(`Instance manager proxy: Forwarding POST request to ${apiUrl}`);

    try {
      // Make the request to the instance manager
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.user.id}` // Pass user ID for authorization
        },
        body: JSON.stringify(body),
      });

      // Check if the response is JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.error(`Received non-JSON response from ${apiUrl}: ${contentType}`);
        return NextResponse.json({ 
          error: 'Invalid response from instance manager',
          message: 'Expected JSON but received a different content type' 
        }, { status: 502 });
      }

      // Get the response data
      const data = await response.json();

      // Return the response
      return NextResponse.json(data, { status: response.status });
    } catch (fetchError) {
      console.error('Fetch error in instance manager proxy POST:', fetchError);
      return NextResponse.json({ 
        error: fetchError instanceof Error ? fetchError.message : 'Unknown error',
        message: 'Error fetching data from instance manager',
        path: path
      }, { status: 500 });
    }
  } catch (error) {
    console.error('Error in instance manager proxy POST:', error);
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

    // Construct the instance manager API URL based on the path
    const instanceManagerUrl = 'http://instance-manager.default.svc.cluster.local/api';
    
    // Map the path to the correct instance manager endpoint
    let apiUrl;
    if (path === 'delete-challenge-pod') {
      apiUrl = `${instanceManagerUrl}/end-challenge`;
    } else {
      apiUrl = `${instanceManagerUrl}/${path}`;
    }

    console.log(`Instance manager proxy: Forwarding DELETE request to ${apiUrl}`);

    try {
      // Make the request to the instance manager
      const response = await fetch(apiUrl, {
        method: 'POST', // Note: Instance Manager uses POST with a specific body for deletions
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.user.id}` // Pass user ID for authorization
        },
        body: JSON.stringify({
          deployment_name: challengeId
        }),
      });

      // Handle empty responses (HTTP 204)
      if (response.status === 204 || response.headers.get('content-length') === '0') {
        return new NextResponse(null, { status: 204 });
      }

      // Check if the response is JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.error(`Received non-JSON response from ${apiUrl}: ${contentType}`);
        
        // If response was successful but not JSON, return success anyway
        if (response.ok) {
          return NextResponse.json({ 
            success: true,
            message: 'Challenge pod deletion initiated successfully' 
          });
        }
        
        return NextResponse.json({ 
          error: 'Invalid response from instance manager',
          message: 'Expected JSON but received a different content type' 
        }, { status: 502 });
      }

      // Get the response data
      const data = await response.json();

      // Return the response
      return NextResponse.json(data, { status: response.status });
    } catch (fetchError) {
      console.error('Fetch error in instance manager proxy DELETE:', fetchError);
      return NextResponse.json({ 
        error: fetchError instanceof Error ? fetchError.message : 'Unknown error',
        message: 'Error deleting challenge pod from instance manager',
        path: path
      }, { status: 500 });
    }
  } catch (error) {
    console.error('Error in instance manager proxy DELETE:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Error occurred while proxying DELETE request to instance manager'
    }, { status: 500 });
  }
}
