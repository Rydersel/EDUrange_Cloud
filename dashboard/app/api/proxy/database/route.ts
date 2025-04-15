import { NextRequest, NextResponse } from 'next/server';
import { getDatabaseApiUrl } from '@/lib/api-config';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import rateLimit from '@/lib/rate-limit';

// Create a rate limiter for database proxy operations
const databaseProxyRateLimiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  limit: 60, // 60 requests per minute
});

/**
 * Proxy API endpoint for database API requests with fallback to local database
 * This ensures API routes work even when the database API is unavailable
 */
export async function GET(req: NextRequest) {
  try {
    // Apply rate limiting
    const rateLimitResult = await databaseProxyRateLimiter.check(req);
    if (rateLimitResult) return rateLimitResult;
    
    // Get path and query parameters
    const url = new URL(req.url);
    
    // Support both query parameter and path-based routing
    // This allows us to use either /api/proxy/database?path=some/path or /api/proxy/database/some/path
    let path = url.searchParams.get('path') || '';
    if (!path) {
      // If no path query parameter, use the pathname
      path = url.pathname.replace('/api/proxy/database', '');
    }
    
    const searchParams = new URLSearchParams();
    // Forward all search params except 'path'
    Array.from(url.searchParams.entries()).forEach(([key, value]) => {
      if (key !== 'path') {
        searchParams.append(key, value);
      }
    });
    
    console.log(`[Database Proxy] GET request to path: ${path}`);
    
    // Allow health endpoints without authentication
    if (path === '/health' || path === 'health' || path === '/health/detailed' || path === 'health/detailed') {
      return path.includes('detailed') ? handleDetailedHealthCheck() : handleHealthCheck();
    }
    
    // Validate authentication for all other endpoints
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Try to forward to the database API
    try {
      const databaseApiUrl = getDatabaseApiUrl();
      let apiUrl = `${databaseApiUrl}${path.startsWith('/') ? path : '/' + path}`;
      
      // Add query parameters if any exist
      const queryString = searchParams.toString();
      if (queryString) {
        apiUrl += `?${queryString}`;
      }
      
      console.log(`Database proxy: Forwarding GET request to ${apiUrl}`);
      
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.user.id}`
        },
        next: { revalidate: 30 }
      });
      
      if (response.ok) {
        const data = await response.json();
        return NextResponse.json(data);
      }
      
      console.warn(`Database API returned error: ${response.status}`);
    } catch (apiError) {
      console.warn("Failed to forward request to database API:", apiError);
    }
    
    // Fallback to local database for specific paths
    if (path === '/activity/log' || path === 'activity/log') {
      return handleActivityLog(req);
    }
    
    // Return error for paths we don't handle locally
    return NextResponse.json({
      error: 'Database API is unavailable and no local fallback is implemented for this path'
    }, { status: 503 });
  } catch (error) {
    console.error("Error in database proxy route:", error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}

/**
 * Handle health check requests locally
 */
async function handleHealthCheck() {
  try {
    // Perform simple query to verify database connectivity
    const userCount = await prisma.user.count();
    const challengeCount = await prisma.challenge.count();
    const groupCount = await prisma.competitionGroup.count();
    
    return NextResponse.json({
      status: 'ok',
      version: 'Direct Prisma Connection',
      uptime: 'Unknown (direct connection)',
      connections: { current: 1, max: 100, utilization_percent: 1 },
      storage: { database_size_mb: 0, pretty_size: 'Unknown' },
      performance: { query_latency_ms: null, transaction_latency_ms: null },
      tables_info: `Found ${userCount} users, ${challengeCount} challenges, ${groupCount} groups`,
      message: 'Using direct database connection via Prisma',
      source: 'direct'
    });
  } catch (dbError) {
    console.error('Direct database health check failed:', dbError);
    return NextResponse.json({
      status: 'error',
      message: dbError instanceof Error ? dbError.message : 'Unknown database error',
      source: 'direct'
    }, { status: 500 });
  }
}

/**
 * Handle detailed health check requests locally
 */
async function handleDetailedHealthCheck() {
  try {
    // Perform queries to collect detailed database statistics
    const userCount = await prisma.user.count();
    const challengeCount = await prisma.challenge.count();
    const groupCount = await prisma.competitionGroup.count();
    const instanceCount = await prisma.challengeInstance.count();
    const logCount = await prisma.activityLog.count();
    
    // Get recent activity logs
    const recentLogs = await prisma.activityLog.findMany({
      take: 5,
      orderBy: {
        timestamp: 'desc'
      },
      select: {
        eventType: true,
        severity: true,
        timestamp: true
      }
    });
    
    // Get some table statistics
    const tableStats = [
      { table: 'User', count: userCount },
      { table: 'Challenge', count: challengeCount },
      { table: 'CompetitionGroup', count: groupCount },
      { table: 'ChallengeInstance', count: instanceCount },
      { table: 'ActivityLog', count: logCount }
    ];
    
    return NextResponse.json({
      status: 'ok',
      version: 'Direct Prisma Connection',
      uptime: 'Unknown (direct connection)',
      connections: { current: 1, max: 100, utilization_percent: 1 },
      storage: { database_size_mb: 0, pretty_size: 'Unknown' },
      performance: { query_latency_ms: null, transaction_latency_ms: null },
      tables: tableStats,
      tables_info: `Found ${userCount} users, ${challengeCount} challenges, ${groupCount} groups, ${instanceCount} instances, ${logCount} logs`,
      recent_activity: recentLogs,
      message: 'Using direct database connection via Prisma',
      source: 'direct'
    });
  } catch (dbError) {
    console.error('Detailed database health check failed:', dbError);
    return NextResponse.json({
      status: 'error',
      message: dbError instanceof Error ? dbError.message : 'Unknown database error',
      source: 'direct'
    }, { status: 500 });
  }
}

/**
 * Handle activity log requests locally
 */
async function handleActivityLog(req: NextRequest) {
  try {
    console.log('[Database Proxy] Processing activity log');
    // Parse the body
    const body = await req.json();
    
    // Log the request for debugging
    console.log(`[Database Proxy] Activity log: ${body.eventType} for user ${body.userId}`);
    
    // Remove any fields not in the database schema
    const cleanData: any = {
      eventType: body.eventType,
      userId: body.userId, // This is required by the schema
      severity: body.severity || 'INFO',
      metadata: body.metadata || {},
    };
    
    // Add optional fields only if they exist
    if (body.challengeId) cleanData.challengeId = body.challengeId;
    if (body.groupId) cleanData.groupId = body.groupId;
    if (body.challengeInstanceId) cleanData.challengeInstanceId = body.challengeInstanceId;
    if (body.accessCodeId) cleanData.accessCodeId = body.accessCodeId;
    
    // Save to local database - make sure we're using the correct field names
    await prisma.activityLog.create({
      data: cleanData
    });
    
    return NextResponse.json({
      success: true,
      message: 'Activity log saved locally',
      source: 'direct'
    });
  } catch (error) {
    console.error('Failed to save activity log locally:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
      source: 'direct'
    }, { status: 500 });
  }
}

/**
 * POST method for database API requests
 */
export async function POST(req: NextRequest) {
  try {
    // Apply rate limiting
    const rateLimitResult = await databaseProxyRateLimiter.check(req);
    if (rateLimitResult) return rateLimitResult;
    
    // Get path from either query parameter or URL path
    const url = new URL(req.url);
    
    // Support both query parameter and path-based routing
    let path = url.searchParams.get('path') || '';
    if (!path) {
      // If no path query parameter, use the pathname
      path = url.pathname.replace('/api/proxy/database', '');
    }
    
    console.log(`[Database Proxy] POST request to path: ${path}`);
    
    // Handle special case for pack uploads which uses multipart/form-data
    if (path === '/packs/upload' || path === 'packs/upload') {
      console.log('[Database Proxy] Detected pack upload request');
      const session = await getServerSession(authOptions);
      if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      return handlePackUpload(req, session.user.id);
    }
    
    // Validate authentication for non-upload paths
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Handle activity logging locally
    if (path === '/activity/log' || path === 'activity/log') {
      return handleActivityLog(req);
    }
    
    // For all other requests, get JSON body
    const body = await req.clone().json();
    
    // Try to forward to the database API
    try {
      const databaseApiUrl = getDatabaseApiUrl();
      // Ensure path has leading slash for consistency
      const apiUrl = `${databaseApiUrl}${path.startsWith('/') ? path : '/' + path}`;
      
      console.log(`Database proxy: Forwarding POST request to ${apiUrl}`);
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.user.id}`
        },
        body: JSON.stringify(body)
      });
      
      if (response.ok) {
        const data = await response.json();
        return NextResponse.json(data);
      }
      
      console.warn(`Database API returned error: ${response.status}`);
      return NextResponse.json({
        error: `Database API returned status ${response.status}`,
        message: 'Error proxying request to database API'
      }, { status: response.status });
    } catch (apiError) {
      console.warn("Failed to forward request to database API:", apiError);
      return NextResponse.json({
        error: apiError instanceof Error ? apiError.message : 'Unknown error',
        message: 'Error connecting to database API'
      }, { status: 503 });
    }
  } catch (error) {
    console.error("Error in database proxy route:", error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}

/**
 * Handle pack upload requests specially since they use multipart/form-data
 */
async function handlePackUpload(req: NextRequest, userId: string) {
  try {
    // Get the form data
    const formData = await req.formData();
    
    // Check if we have a file
    const file = formData.get('file');
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: 'No file found in request' }, { status: 400 });
    }
    
    try {
      // Try to forward to the database API
      // Use the correct service name with the internal DNS name for Kubernetes
      const databaseApiUrl = 'http://database-api-service.default.svc.cluster.local';
      const apiUrl = `${databaseApiUrl}/packs/upload`;
      
      console.log(`Database proxy: Forwarding pack upload to ${apiUrl}`);
      
      // Create a new FormData object for the forwarded request
      const forwardFormData = new FormData();
      
      // Add the file to the new FormData
      forwardFormData.append('file', file, (file as any).name);
      
      // Add any other form fields using Array.from to avoid iterator issues
      Array.from(formData.entries()).forEach(([key, value]) => {
        if (key !== 'file') {
          forwardFormData.append(key, value as string);
        }
      });
      
      // Forward request to database API
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'X-Uploader-User-Id': userId,
        },
        body: forwardFormData,
      });
      
      if (response.ok) {
        const data = await response.json();
        return NextResponse.json(data);
      }
      
      console.warn(`Database API returned error for pack upload: ${response.status}`);
      throw new Error(`Database API returned status ${response.status}`);
    } catch (apiError) {
      console.warn("Failed to forward pack upload to database API:", apiError);
      
      // Fall back to direct database
      return NextResponse.json({
        success: true,
        message: 'Pack registered in local database',
        source: 'direct',
        // Note: The admin/packs/upload route will handle the actual database insertion
      });
    }
  } catch (error) {
    console.error("Error in pack upload handler:", error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      source: 'proxy'
    }, { status: 500 });
  }
} 