import { fetchCurrentMetrics, generateFallbackMetrics } from '@/lib/monitoring-service';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import authConfig from '@/auth.config';
import { getMonitoringServiceUrl } from '@/lib/api-config';

export async function GET(
  req: Request
) {
  try {
    // Fetch current metrics
    const metrics = await fetchCurrentMetrics();
    
    if (metrics) {
      console.log('System health metrics fetched successfully');
      
      // Extract CPU, memory and other metrics from the response
      // Note: the monitoring service returns these values as percentages already
      const cpuUsage = metrics.cpu?.total ?? 0;
      const memoryUsed = metrics.memory?.used ?? 0;
      
      // Format values for display
      // Ensure percentage values are correctly handled (0-100 range)
      return NextResponse.json({
        cpu: {
          used: Math.max(0, Math.min(100, cpuUsage)),
          free: Math.max(0, Math.min(100, 100 - cpuUsage))
        },
        memory: {
          used: Math.max(0, Math.min(100, memoryUsed)),
          free: Math.max(0, Math.min(100, 100 - memoryUsed))
        },
        network: {
          inbound: metrics.network?.inbound ?? 0,
          outbound: metrics.network?.outbound ?? 0
        },
        challenges: {
          total: metrics.challenges?.total ?? 0,
          running: metrics.challenges?.running ?? 0,
          pending: metrics.challenges?.pending ?? 0,
          failed: metrics.challenges?.failed ?? 0
        },
        raw: metrics // Include the raw metrics for debugging
      });
    }
    
    // Fall back to default metrics
    console.log('Failed to fetch system health metrics, using fallback data');
    const fallbackMetrics = generateFallbackMetrics();
    
    return NextResponse.json({
      cpu: {
        used: 0,
        free: 100
      },
      memory: {
        used: 0,
        free: 100
      },
      network: {
        inbound: 0,
        outbound: 0
      },
      challenges: {
        total: 0,
        running: 0,
        pending: 0,
        failed: 0
      },
      raw: fallbackMetrics // Include raw metrics for debugging
    });
    
  } catch (error) {
    console.error('Error in system-health/current route:', error);
    
    return NextResponse.json(
      { error: 'Failed to fetch system health metrics' },
      { status: 500 }
    );
  }
}
