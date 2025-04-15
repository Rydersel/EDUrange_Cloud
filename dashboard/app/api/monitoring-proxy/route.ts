import { NextResponse, NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

/**
 * Proxy API endpoint for monitoring service requests
 * This allows client-side code to make requests to the monitoring service without CORS issues
 * It also ensures proper routing to internal Kubernetes services
 */
export async function GET(req: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Only allow admin access to monitoring data
    if (session.user.role !== 'ADMIN') {
      return new NextResponse('Forbidden', { status: 403 });
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

    // Construct the monitoring service URL
    const monitoringUrl = 'http://instance-manager.default.svc.cluster.local/metrics';
    let apiUrl = path ? `${monitoringUrl}/${path}` : monitoringUrl;

    // Add query parameters if any exist
    const queryString = queryParams.toString();
    if (queryString) {
      apiUrl += `?${queryString}`;
    }

    console.log(`Monitoring proxy: Forwarding GET request to ${apiUrl}`);

    // Make the request to the monitoring service
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.user.id}`
      },
    });

    // Get the response data
    const data = await response.json();

    // Return the response
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Error in monitoring proxy:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
} 