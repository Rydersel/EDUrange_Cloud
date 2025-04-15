import { NextResponse, NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getInstanceManagerUrl } from '@/lib/api-config';

/**
 * API endpoint to fetch the Challenge Type Definition (CTD) schema
 * This fetches the schema from the instance manager
 */
export async function GET(req: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Construct the instance manager API URL
    const instanceManagerUrl = getInstanceManagerUrl();
    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'schema';

    let endpoint = '';
    if (action === 'schema') {
      endpoint = 'schema/ctd';
    } else if (action === 'types') {
      endpoint = 'challenge-types';
    } else {
      return NextResponse.json({ 
        error: 'Invalid action parameter',
        message: 'Action must be either "schema" or "types"' 
      }, { status: 400 });
    }

    const apiUrl = `${instanceManagerUrl}/${endpoint}`;
    console.log(`Fetching CTD information from: ${apiUrl}`);

    try {
      // Make the request to the instance manager
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${session.user.id}`
        }
      });
      
      if (!response.ok) {
        console.error(`CTD fetch failed with status: ${response.status}`);
        return NextResponse.json({
          error: `Failed to fetch CTD ${action}: ${response.status} ${response.statusText}`,
          message: `Error retrieving CTD ${action} from instance manager`
        }, { status: response.status });
      }
      
      const data = await response.json();
      return NextResponse.json(data);
    } catch (fetchError) {
      console.error(`Error fetching CTD ${action}:`, fetchError);
      return NextResponse.json({
        error: fetchError instanceof Error ? fetchError.message : 'Unknown error',
        message: `Failed to retrieve CTD ${action} from instance manager`
      }, { status: 500 });
    }
  } catch (error) {
    console.error('Error in CTD schema endpoint:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Error occurred while accessing CTD schema information'
    }, { status: 500 });
  }
} 