import { NextResponse } from 'next/server';

export async function GET() {
  try {
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