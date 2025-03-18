import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import authConfig from '@/auth.config';
import { getMonitoringServiceUrl } from '@/lib/api-config';

export async function GET(request: Request) {
  try {
    // Get the URL from the request
    const url = new URL(request.url);
    const sessionToken = url.searchParams.get('sessionToken');

    // Get the session either from the session token or from the request cookies
    let session;
    if (sessionToken === 'server-component') {
      // This is a server component request, allow it
      session = true;
    } else {
      session = await getServerSession(authConfig);
    }

    // Check if the user is authenticated
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if the user is an admin
    if (session !== true && session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
    }

    // Fetch current system health data from the monitoring service
    const monitoringServiceUrl = getMonitoringServiceUrl();

    if (!monitoringServiceUrl) {
      console.error('Monitoring service URL is undefined');
      return NextResponse.json(
        { error: 'Monitoring service URL is undefined' },
        { status: 500 }
      );
    }

    console.log('Fetching current metrics from:', monitoringServiceUrl);

    const response = await fetch(`${monitoringServiceUrl}/current`);

    if (!response.ok) {
      throw new Error(`Failed to fetch current metrics: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Return the current CPU and memory usage percentages
    return NextResponse.json({
      cpu: data.cpu_percent || 0,
      memory: data.memory_percent || 0,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching current system health data:', error);

    // Return error response instead of mock data
    return NextResponse.json(
      { error: 'Failed to fetch system health data' },
      { status: 500 }
    );
  }
}
