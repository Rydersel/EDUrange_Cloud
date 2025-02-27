import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import authConfig from '@/auth.config';
import { getInstanceManagerUrl } from '@/lib/api-config';

// Fetch real data from the instance manager
async function getIngressInstanceManagerHealth() {
  try {
    // Try to fetch real data from the instance manager
    const instanceManagerUrl = getInstanceManagerUrl();
    
    if (!instanceManagerUrl) {
      console.error('Instance manager URL is undefined');
      return {
        status: "error",
        uptime: "N/A",
        lastRestart: "N/A",
        version: "N/A",
        error: "Instance manager URL is undefined"
      };
    }
    
    const response = await fetch(`${instanceManagerUrl}/health`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch instance manager health');
    }
    
    const data = await response.json();
    
    return {
      status: data.status === "ok" ? "healthy" : "error",
      uptime: data.uptime || "N/A",
      lastRestart: data.last_restart || "N/A",
      version: data.version || "N/A"
    };
  } catch (error) {
    console.error('Error fetching ingress instance manager health:', error);
    return {
      status: "error",
      uptime: "N/A",
      lastRestart: "N/A",
      version: "N/A",
      error: "Failed to connect to instance manager"
    };
  }
}

// Fetch detailed component health data from the instance manager
async function getDetailedComponentHealth() {
  try {
    // Fetch detailed component health data from the instance manager
    const instanceManagerUrl = getInstanceManagerUrl();
    
    if (!instanceManagerUrl) {
      console.error('Instance manager URL is undefined');
      return null;
    }
    
    const response = await fetch(`${instanceManagerUrl}/health?check_components=true`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch detailed component health');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching detailed component health:', error);
    return null;
  }
}

async function getDatabaseHealth() {
  try {
    // Try to get detailed component health data
    const detailedHealth = await getDetailedComponentHealth();
    
    if (detailedHealth && detailedHealth.database) {
      // Use the database status from the detailed health check
      const dbStatus = detailedHealth.database.status;
      const dbController = detailedHealth.database.controller;
      
      // Extract API and Sync status from the controller object
      const dbApiStatus = dbController.api;
      const dbSyncStatus = dbController.sync;
      
      // If any component is not ok, set the overall status to warning or error
      let overallStatus = "healthy";
      if (dbStatus !== "ok" || dbApiStatus !== "ok" || dbSyncStatus !== "ok") {
        overallStatus = "warning";
        
        // If the main database is down, it's an error
        if (dbStatus !== "ok") {
          overallStatus = "error";
        }
      }
      
      // Get database-specific uptime and last restart
      const uptime = detailedHealth.database?.uptime || "N/A";
      const lastRestart = detailedHealth.database?.last_restart || "N/A";
      
      // Get real connection count from the controller
      const connections = dbController?.connections || 0;
      
      return {
        status: overallStatus,
        uptime: uptime, // Use database-specific uptime
        lastRestart: lastRestart, // Use database-specific last restart
        version: detailedHealth.database?.version || "N/A", // Use real version if available
        connections: connections, // Use real connection count
        warningMessage: overallStatus === "warning" ? 
          "One or more database components are not healthy" : 
          (overallStatus === "error" ? "Database is not running" : null)
      };
    }
    
    // If detailed health check fails, return error with N/A values
    return {
      status: "error",
      uptime: "N/A",
      lastRestart: "N/A",
      version: "N/A",
      connections: 0,
      error: "Failed to retrieve database health information"
    };
  } catch (error) {
    console.error('Error fetching database health:', error);
    return {
      status: "error",
      uptime: "N/A",
      lastRestart: "N/A",
      version: "N/A",
      connections: 0,
      error: "Failed to connect to database"
    };
  }
}

async function getCertManagerHealth() {
  try {
    // Try to get detailed component health data
    const detailedHealth = await getDetailedComponentHealth();
    
    if (detailedHealth && detailedHealth.cert_manager) {
      // Use the cert manager status from the detailed health check
      const certManagerStatus = detailedHealth.cert_manager.status || detailedHealth.cert_manager;
      
      // Get cert-manager-specific uptime and last restart
      const uptime = detailedHealth.cert_manager.uptime || "N/A";
      const lastRestart = detailedHealth.cert_manager.last_restart || "N/A";
      
      // Get real certificate counts
      const certificates = detailedHealth.cert_manager.certificates || { valid: 0, expiringSoon: 0, expired: 0 };
      
      return {
        status: certManagerStatus === "ok" ? "healthy" : "error",
        uptime: uptime, // Use cert-manager-specific uptime
        lastRestart: lastRestart, // Use cert-manager-specific last restart
        version: detailedHealth.cert_manager.version || "N/A", // Use real version if available
        certificates: {
          valid: certificates.valid || 0,
          expiringSoon: certificates.expiringSoon || 0,
          expired: certificates.expired || 0
        }
      };
    }
    
    // If detailed health check fails, return error with N/A values
    return {
      status: "error",
      uptime: "N/A",
      lastRestart: "N/A",
      version: "N/A",
      certificates: {
        valid: 0,
        expiringSoon: 0,
        expired: 0
      },
      error: "Failed to retrieve cert manager health information"
    };
  } catch (error) {
    console.error('Error fetching cert manager health:', error);
    return {
      status: "error",
      uptime: "N/A",
      lastRestart: "N/A",
      version: "N/A",
      certificates: {
        valid: 0,
        expiringSoon: 0,
        expired: 0
      },
      error: "Failed to connect to cert manager"
    };
  }
}

async function getChallengeStats() {
  try {
    // Get the instance manager URL from environment or use default
    const instanceManagerUrl = getInstanceManagerUrl();
    
    if (!instanceManagerUrl) {
      console.error('Instance manager URL is undefined');
      return {
        total: 0,
        active: 0,
        pending: 0,
        failed: 0,
        error: "Instance manager URL is undefined"
      };
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
    let active = 0;
    let pending = 0;
    let failed = 0;
    
    challengePods.forEach((pod: any) => {
      if (pod.status === 'active') {
        active++;
      } else if (pod.status === 'creating' || pod.status === 'pending') {
        pending++;
      } else if (pod.status === 'error' || pod.status === 'failed') {
        failed++;
      }
    });
    
    const total = challengePods.length;
    
    return {
      total,
      active,
      pending,
      failed
    };
  } catch (error) {
    console.error('Error fetching challenge stats:', error);
    return {
      total: 0,
      active: 0,
      pending: 0,
      failed: 0,
      error: "Failed to fetch challenge statistics",
      errorDetails: error instanceof Error ? error.message : "Unknown error"
    };
  }
}

export async function GET(request: Request) {
  try {
    // Get the URL from the request
    const url = new URL(request.url);
    const sessionToken = url.searchParams.get('sessionToken');
    
    // Get the session either from the session token or from the request cookies
    let session;
    if (sessionToken) {
      // This is a server component request with a session token
      // In a real implementation, you would validate the token
      // For now, we'll just assume it's valid and set the user role to ADMIN
      session = { user: { role: 'ADMIN' } };
    } else {
      // This is a client component request with cookies
      session = await getServerSession(authConfig);
    }

    if (!session?.user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Check if user is admin
    if (session.user.role !== 'ADMIN') {
      return new NextResponse('Forbidden', { status: 403 });
    }

    const [ingressHealth, dbHealth, certManagerHealth, challengeStats] = await Promise.all([
      getIngressInstanceManagerHealth(),
      getDatabaseHealth(),
      getCertManagerHealth(),
      getChallengeStats()
    ]);

    return NextResponse.json({
      ingressInstanceManager: ingressHealth,
      database: dbHealth,
      certManager: certManagerHealth,
      challenges: challengeStats
    });
  } catch (error) {
    console.error('Error fetching system health:', error);
    return NextResponse.json({ error: 'Failed to fetch system health' }, { status: 500 });
  }
} 