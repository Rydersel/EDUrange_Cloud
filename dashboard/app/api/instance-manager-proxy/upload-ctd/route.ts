import { NextResponse, NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

/**
 * Special proxy endpoint for CTD file uploads
 * This handles FormData uploads and forwards them to the instance manager
 */
export async function POST(req: NextRequest) {
  try {
    // Log cookies for debugging
    const cookies = req.headers.get('cookie');
    console.log(`[IM Proxy] Cookie header present: ${!!cookies}`);
    if (cookies) {
      // Only log partial cookie info for security (first 20 chars)
      const safeDebugCookie = cookies.length > 20 ? 
        `${cookies.substring(0, 20)}...` : 
        '[Cookie too short to partially display]';
      console.log(`[IM Proxy] Cookie prefix: ${safeDebugCookie}`);
    }
    
    // Check authentication
    const session = await getServerSession(authOptions);
    console.log(`[IM Proxy] Authentication check - Session exists: ${!!session}, User exists: ${!!session?.user}`);
    
    if (session?.user) {
      console.log(`[IM Proxy] User role: ${session.user.role}, User ID: ${session.user.id}`);
    }
    
    if (!session?.user) {
      console.log('[IM Proxy] Authentication failed - No valid session or user');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Ensure the user has admin role
    if (session.user.role !== 'ADMIN') {
      console.log(`[IM Proxy] Authorization failed - User role is ${session.user.role}, not ADMIN`);
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Get the form data from the request
    const formData = await req.formData();
    
    // Log the upload attempt
    console.log('[IM Proxy] CTD Upload request received - Authentication passed');
    
    // Construct the instance manager API URL
    const instanceManagerUrl = 'http://instance-manager.default.svc.cluster.local';
    const apiUrl = `${instanceManagerUrl}/api/upload-ctd`;
    
    console.log('[IM Proxy] Forwarding CTD upload request to instance manager');
    
    try {
      // Forward the request to the instance manager, preserving all authentication headers
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          // Copy essential headers from the original request for auth preservation
          'Cookie': req.headers.get('cookie') || '',
          'Authorization': req.headers.get('authorization') || '',
          // Don't set Content-Type as it will be set automatically with the correct boundary by fetch when using formData
        },
        body: formData,
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[IM Proxy] CTD upload failed: ${response.status} ${errorText}`);
        return NextResponse.json({ 
          error: 'CTD upload failed', 
          status: response.status,
          details: errorText
        }, { status: response.status });
      }
      
      // Check if the response is JSON
      const contentType = response.headers.get('content-type');
      
      if (!contentType || !contentType.includes('application/json')) {
        console.error(`[IM Proxy Error] Non-JSON response from upload-ctd: ${contentType}`);
        const text = await response.text();
        console.error(`[IM Proxy Error] Response body: ${text}`);
        
        // Check if it looks like HTML (common error response from web servers)
        const isHtml = text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html');
        
        if (isHtml) {
          console.error('[IM Proxy Error] Received HTML response instead of JSON - likely a routing or server error');
          return NextResponse.json({
            error: 'Instance manager returned HTML instead of JSON',
            message: 'There was a problem communicating with the instance manager service',
            status: response.status,
            details: 'Response contained HTML content (possibly a server or routing error)'
          }, { status: 502 });
        }
        
        return NextResponse.json({
          error: 'Invalid response from instance manager',
          message: 'Expected JSON but received a different content type',
          status: response.status,
          contentType: contentType || 'none',
          details: text.substring(0, 100) + (text.length > 100 ? '...' : '') // Only include start of text
        }, { status: 502 });
      }
      
      // Get the response data
      const data = await response.json();
      
      // Return the response with the same status
      return NextResponse.json(data, { status: response.status });
      
    } catch (error) {
      console.error('[IM Proxy Error] CTD upload error:', error instanceof Error ? error.message : 'Unknown error');
      return NextResponse.json({
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Error occurred while proxying CTD upload to instance manager'
      }, { status: 500 });
    }
  } catch (error) {
    console.error('[IM Proxy Error] CTD upload error:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Error occurred while proxying CTD upload to instance manager'
    }, { status: 500 });
  }
} 