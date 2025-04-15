import { NextResponse, NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { fetchLatestSchema } from '@/lib/cdf/schema-sync';

/**
 * Schema endpoint to serve the CDF schema for validation
 * This acts as a centralized access point, handling the retrieval from instance manager
 * and providing fallback mechanisms
 */
export async function GET(req: NextRequest) {
  try {
    // Check authentication for non-public routes
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const options = {
      // Force server-side direct access when running in this API route
      baseUrl: 'http://instance-manager.default.svc.cluster.local',
      timeout: 5000,
      cache: true,
      useFallback: true,
    };

    try {
      // Get schema from instance manager with fallback
      const schema = await fetchLatestSchema(options);
      
      // Return the schema
      return NextResponse.json(schema, { 
        headers: {
          'Cache-Control': 'public, max-age=3600' // Cache for 1 hour
        }
      });
    } catch (fetchError) {
      console.error('Error fetching schema from instance manager:', fetchError);
      return NextResponse.json({ 
        error: 'Failed to retrieve schema',
        message: fetchError instanceof Error ? fetchError.message : 'Unknown error'
      }, { status: 502 });
    }
  } catch (error) {
    console.error('Error in schema endpoint:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 