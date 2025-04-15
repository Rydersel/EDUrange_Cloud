import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

/**
 * Server-side URL checker that eliminates CORS issues when checking challenge URLs
 * @route GET /api/challenges/check-url
 */
export async function GET(req: NextRequest) {
  const requestStartTime = Date.now();
  try {
    // Ensure the user is authenticated
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Get the URL from the query parameters
    const url = req.nextUrl.searchParams.get('url');
    if (!url) {
      return NextResponse.json({ error: 'Missing URL parameter' }, { status: 400 });
    }

    if (process.env.NODE_ENV === 'development') {
      console.log(`[URL Check] Checking availability for ${url} (user: ${session.user.id})`);
    }

    try {
      // Set up a timeout for the fetch request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

      // Make a HEAD request to check if the URL is accessible
      const response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
        headers: {
          'User-Agent': 'EDURange-Dashboard-UrlChecker/1.0',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
      });

      clearTimeout(timeoutId);

      // Prepare the result
      const result = {
        available: response.ok,
        status: response.status,
        message: response.statusText,
        url: url
      };

      const requestDuration = Date.now() - requestStartTime;
      if (process.env.NODE_ENV === 'development' || !result.available) {
        console.log(`[URL Check] ${url}: ${result.status} ${result.message} (available: ${result.available}) - ${requestDuration}ms`);
      }

      // Return the result
      return NextResponse.json(result, {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
          'X-Response-Time': `${requestDuration}ms`
        }
      });
    } catch (error) {
      // Handle timeout, network errors, etc.
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const requestDuration = Date.now() - requestStartTime;
      console.error(`[URL Check Error] ${url} (${requestDuration}ms): ${errorMessage}`);
      
      // Check if it was a timeout
      const isTimeout = error instanceof Error && error.name === 'AbortError';

      return NextResponse.json({
        available: false,
        status: isTimeout ? 408 : 500,
        message: isTimeout ? 'Request timeout' : errorMessage,
        url: url
      }, {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
          'X-Response-Time': `${requestDuration}ms`
        }
      });
    }
  } catch (error) {
    const requestDuration = Date.now() - requestStartTime;
    console.error(`[URL Check Route Error] (${requestDuration}ms):`, error);
    return NextResponse.json({ 
      available: false, 
      status: 500, 
      message: error instanceof Error ? error.message : 'Internal server error' 
    }, { 
      status: 500,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
        'X-Response-Time': `${requestDuration}ms`
      }
    });
  }
} 