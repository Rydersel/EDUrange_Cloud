import { NextRequest, NextResponse } from 'next/server';

/**
 * Legacy health check proxy endpoint that redirects to the database proxy
 */
export async function GET(req: NextRequest) {
  try {
    // Determine base URL for server-side fetch
    const baseUrl = typeof window === 'undefined' ? process.env.NEXTAUTH_URL || 'http://localhost:3000' : '';
    console.log('Health check proxy: Forwarding to database proxy');
    
    // Forward to the database proxy's health endpoint
    const response = await fetch(`${baseUrl}/api/proxy/database/health/detailed`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store'
    });
    
    if (!response.ok) {
      console.error(`Health check proxy: Database proxy returned ${response.status}`);
      return NextResponse.json({
        status: 'error',
        message: `Database proxy returned ${response.status}`,
        source: 'health-proxy'
      }, { status: response.status });
    }
    
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in health proxy:', error);
    return NextResponse.json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
      source: 'health-proxy'
    }, { status: 500 });
  }
} 