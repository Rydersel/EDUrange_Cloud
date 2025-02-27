import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import authConfig from '@/auth.config';
import { getInstanceManagerUrl } from '@/lib/api-config';

export async function POST(request: Request) {
  try {
    // Get the session from the request cookies
    const session = await getServerSession(authConfig);
    
    // Check if the user is authenticated and is an admin
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Check if user is admin
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
    }
    
    // Parse the request body to get the service to restart
    const { service } = await request.json();
    
    if (service !== 'instance-manager') {
      return NextResponse.json({ error: 'Invalid service specified' }, { status: 400 });
    }
    
    // Get the instance manager URL using the utility function
    const instanceManagerUrl = getInstanceManagerUrl();
    console.log('Using instance manager URL:', instanceManagerUrl);
    
    // Execute kubectl command to restart the deployment
    // In a production environment, this would be done through a secure API call to a service with appropriate permissions
    // For now, we'll simulate the restart by calling an endpoint on the instance manager itself
    
    const response = await fetch(`${instanceManagerUrl}/restart`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ deployment: 'instance-manager' }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to restart service: ${errorText}`);
    }
    
    return NextResponse.json({ 
      success: true, 
      message: 'Instance Manager restart initiated successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error restarting service:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to restart service' },
      { status: 500 }
    );
  }
} 