import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Fetch current system health data from the monitoring service
    const monitoringServiceUrl = process.env.MONITORING_SERVICE_URL || 'http://monitoring-service:5000';
    const response = await fetch(`${monitoringServiceUrl}/metrics/current`);
    
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