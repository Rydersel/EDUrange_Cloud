import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import authConfig from '@/auth.config';
import { getInstanceManagerUrl } from '@/lib/api-config';

export async function GET(request: Request) {
  try {
    // Get the URL from the request
    const url = new URL(request.url);
    const type = url.searchParams.get('type');
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
    
    // Handle different types of history data
    if (type === 'challenges') {
      const challengeData = await getChallengeData();
      return NextResponse.json(challengeData);
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

function generateStatusHistory(period: string) {
  const now = new Date();
  const data = [];
  const hours = period === '24h' ? 24 : period === '7d' ? 168 : 24;
  const interval = period === '24h' ? 1 : period === '7d' ? 6 : 1;
  
  for (let i = hours; i >= 0; i -= interval) {
    const time = new Date(now.getTime() - i * 3600000);
    const timeStr = `${time.getHours()}:00`;
    
    // Generate random status values (0-100)
    const ingressHealth = Math.min(100, Math.max(0, 90 + Math.floor(Math.random() * 20) - 10));
    const dbApiHealth = Math.min(100, Math.max(0, 95 + Math.floor(Math.random() * 15) - 7));
    const dbSyncHealth = Math.min(100, Math.max(0, 85 + Math.floor(Math.random() * 30) - 15));
    
    // Simulate a sync issue around the middle of the timeline
    const syncIssue = i >= hours * 0.4 && i <= hours * 0.6;
    
    data.push({
      time: timeStr,
      ingressHealth: ingressHealth,
      dbApiHealth: dbApiHealth,
      dbSyncHealth: syncIssue ? dbSyncHealth * 0.6 : dbSyncHealth,
    });
  }
  
  return data;
}

function generateResourceHistory(resourceType: string, period: string) {
  const now = new Date();
  const data = [];
  const hours = period === '24h' ? 24 : period === '7d' ? 168 : 24;
  const interval = period === '24h' ? 1 : period === '7d' ? 6 : 1;
  
  for (let i = hours; i >= 0; i -= interval) {
    const time = new Date(now.getTime() - i * 3600000);
    const timeStr = `${time.getHours()}:00`;
    
    if (resourceType === 'cpu') {
      data.push({
        time: timeStr,
        system: Math.floor(Math.random() * 30) + 10,
        challenges: Math.floor(Math.random() * 40) + 20,
      });
    } else if (resourceType === 'memory') {
      data.push({
        time: timeStr,
        used: Math.floor(Math.random() * 40) + 30,
        available: 100 - (Math.floor(Math.random() * 40) + 30),
      });
    } else if (resourceType === 'network') {
      data.push({
        time: timeStr,
        inbound: Math.floor(Math.random() * 100) + 50,
        outbound: Math.floor(Math.random() * 80) + 20,
      });
    }
  }
  
  return data;
}

function generateChallengeHistory(period: string) {
  const now = new Date();
  const data = [];
  const hours = period === '24h' ? 24 : period === '7d' ? 168 : 24;
  const interval = period === '24h' ? 1 : period === '7d' ? 6 : 1;
  
  let running = 8;
  let pending = 2;
  let failed = 0;
  
  for (let i = hours; i >= 0; i -= interval) {
    const time = new Date(now.getTime() - i * 3600000);
    const timeStr = `${time.getHours()}:00`;
    
    // Randomly adjust values to simulate changes over time
    running += Math.floor(Math.random() * 3) - 1;
    pending += Math.floor(Math.random() * 3) - 1;
    failed += Math.random() > 0.8 ? 1 : 0;
    
    // Ensure values stay within reasonable ranges
    running = Math.max(0, Math.min(20, running));
    pending = Math.max(0, Math.min(5, pending));
    failed = Math.max(0, Math.min(3, failed));
    
    data.push({
      time: timeStr,
      running,
      pending,
      failed,
      total: running + pending + failed
    });
  }
  
  return data;
} 