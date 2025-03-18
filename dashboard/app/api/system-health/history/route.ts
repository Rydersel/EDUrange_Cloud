import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import authConfig from '@/auth.config';
import { getInstanceManagerUrl } from '@/lib/api-config';
import { 
  fetchMetricsHistory, 
  generateFallbackMetricsHistory,
  fetchSystemStatusHistory,
  generateFallbackSystemStatusHistory
} from '@/lib/monitoring-service';

export async function GET(request: Request) {
  try {
    // Get the URL from the request
    const url = new URL(request.url);
    const type = url.searchParams.get('type') || 'cpu';
    const period = url.searchParams.get('period') || '24h';
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
    
    // Handle different types of history data
    if (type === 'challenges') {
      const challengeData = await getChallengeData();
      return NextResponse.json(challengeData);
    } else if (['cpu', 'memory', 'network'].includes(type)) {
      const metricsData = await getMetricsHistory(type, period);
      return NextResponse.json(metricsData);
    } else if (type === 'status') {
      // Handle status type
      const statusData = await getSystemStatusHistory(period);
      return NextResponse.json(statusData);
    }
    
    // Default response if no type is specified
    return NextResponse.json({ error: 'Invalid type parameter' }, { status: 400 });
  } catch (error) {
    console.error('Error in system-health/history API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function getChallengeData() {
  try {
    // Get the instance manager URL from environment or use default
    const instanceManagerUrl = getInstanceManagerUrl();
    
    if (!instanceManagerUrl) {
      console.error('Instance manager URL is undefined');
      return [];
    }
    
    // Fetch challenge pods from the instance manager
    const response = await fetch(`${instanceManagerUrl}/list-challenge-pods`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch challenge pods: ${response.statusText}`);
    }

    const data = await response.json();
    const challengePods = data.challenge_pods || [];
    
    // Count pods by status
    let running = 0;
    let pending = 0;
    let failed = 0;
    let completed = 0;
    
    // Count pods by type
    const typeCount: Record<string, number> = {};
    
    challengePods.forEach((pod: any) => {
      // Count by status
      if (pod.status === 'active') {
        running++;
      } else if (pod.status === 'creating' || pod.status === 'pending') {
        pending++;
      } else if (pod.status === 'error' || pod.status === 'failed') {
        failed++;
      } else if (pod.status === 'completed' || pod.status === 'succeeded') {
        completed++;
      }
      
      // Count by type (based on challenge image)
      const image = pod.challenge_image || '';
      let type = 'Unknown';
      
      if (image.includes('fullos')) {
        type = 'Full OS';
      } else if (image.includes('web')) {
        type = 'Web';
      } else if (image.includes('metasploit')) {
        type = 'Metasploit';
      }
      
      typeCount[type] = (typeCount[type] || 0) + 1;
    });
    
    // Create a single data point with the current counts
    const dataPoint = {
      timestamp: new Date().toISOString(),
      running,
      pending,
      failed,
      completed,
      types: Object.entries(typeCount).map(([name, value]) => ({ name, value }))
    };
    
    // Return an array with a single data point
    return [dataPoint];
  } catch (error) {
    console.error('Error fetching challenge data:', error);
    // Return empty array if there's an error
    return [];
  }
}

/**
 * Get metrics history data
 */
async function getMetricsHistory(type: string, period: string) {
  try {
    // Try to fetch real data from the monitoring service
    const data = await fetchMetricsHistory(type, period);
    
    // If we got data, return it
    if (data) {
      return data;
    }
    
    // Otherwise, fall back to default values
    console.log(`Falling back to default ${type} metrics history data`);
    return generateFallbackMetricsHistory(type, period);
  } catch (error) {
    console.error(`Error getting ${type} metrics history:`, error);
    return generateFallbackMetricsHistory(type, period);
  }
}

/**
 * Get system status history data
 */
async function getSystemStatusHistory(period: string) {
  try {
    // Try to fetch real data from the monitoring service
    const data = await fetchSystemStatusHistory(period);
    
    // If we got data, return it
    if (data) {
      return data;
    }
    
    // Otherwise, fall back to default values
    console.log('Falling back to default system status history data');
    return generateFallbackSystemStatusHistory(period);
  } catch (error) {
    console.error('Error getting system status history:', error);
    return generateFallbackSystemStatusHistory(period);
  }
} 