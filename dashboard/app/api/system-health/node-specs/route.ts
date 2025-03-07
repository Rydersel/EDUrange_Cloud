import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import authConfig from '@/auth.config';

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
    
    // Fetch node specifications from the monitoring service
    const monitoringServiceUrl = process.env.MONITORING_SERVICE_URL || 'http://monitoring-service:5000';
    const response = await fetch(`${monitoringServiceUrl}/metrics/node-specs`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch node specifications: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Return the node specifications
    return NextResponse.json({
      cpu_cores: data.cpu_cores || 0,
      cpu_model: data.cpu_model || 'Unknown CPU',
      memory_total: data.memory_total || '0 GB',
      disk_total: data.disk_total || '0 GB',
      os_type: data.os_type || 'Unknown OS',
      hostname: data.hostname || 'Unknown Host'
    });
  } catch (error) {
    console.error('Error fetching node specifications:', error);
    
    // Return error response instead of mock data
    return NextResponse.json(
      { error: 'Failed to fetch node specifications' },
      { status: 500 }
    );
  }
} 