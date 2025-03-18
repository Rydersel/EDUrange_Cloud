import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import authConfig from '@/auth.config';
import { getInstanceManagerUrl, getMonitoringServiceUrl, getDatabaseApiUrl } from '@/lib/api-config';
import { fetchCurrentMetrics, generateFallbackMetrics } from '@/lib/monitoring-service';

// Define types for PostgreSQL health data
type PostgresConnections = {
  current: number;
  max: number;
  utilization_percent: number;
};

type PostgresPerformance = {
  query_latency_ms: number | null;
  transaction_latency_ms: number | null;
};

type PostgresStorage = {
  database_size_mb: number;
  pretty_size: string;
  free_space_mb?: number;
};

type PostgresTable = {
  schemaname: string;
  table_name: string;
  row_count: number;
  table_size: string;
};

type PostgresHealth = {
  version: string;
  uptime: string;
  connections: PostgresConnections;
  performance: PostgresPerformance;
  storage: PostgresStorage;
  tables: PostgresTable[];
  status: string;
  tables_error?: string;
  tables_info?: string;
};

type DatabaseHealth = {
  status: string;
  uptime: string;
  lastRestart: string;
  version: string;
  connections: number;
  error: string | null;
  warningMessage: string | null;
  postgres: PostgresHealth | null;
};

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
    
    console.log('System health check using Instance Manager URL:', instanceManagerUrl);
    
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

async function getDatabaseHealth(): Promise<DatabaseHealth> {
  try {
    // Try to get detailed component health data
    const detailedHealth = await getDetailedComponentHealth();
    
    // Initialize the database health object
    let dbHealth: DatabaseHealth = {
      status: "error",
      uptime: "N/A",
      lastRestart: "N/A",
      version: "N/A",
      connections: 0,
      error: null,
      warningMessage: null,
      postgres: null // Will hold detailed PostgreSQL metrics
    };
    
    // Try to fetch detailed PostgreSQL metrics directly from the database controller
    try {
      const databaseApiUrl = getDatabaseApiUrl();
      if (databaseApiUrl) {
        console.log('Fetching detailed PostgreSQL health from:', `${databaseApiUrl}/health/detailed`);
        
        const pgResponse = await fetch(`${databaseApiUrl}/health/detailed`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          cache: 'no-store',
          // Set a timeout to prevent hanging if the database controller is not responding
          signal: AbortSignal.timeout(5000)
        });
        
        if (pgResponse.ok) {
          const pgData = await pgResponse.json();
          
          // Store the detailed PostgreSQL metrics
          dbHealth.postgres = {
            version: pgData.version || "Unknown",
            uptime: pgData.uptime || "Unknown",
            connections: pgData.connections || { current: 0, max: 0, utilization_percent: 0 },
            performance: pgData.performance || { query_latency_ms: null, transaction_latency_ms: null },
            storage: pgData.storage || { database_size_mb: 0, pretty_size: "0 bytes" },
            status: pgData.status || "error",
            tables: [] // Initialize with empty array
          };
          
          // Check if there's a metrics error and handle tables data
          if (pgData.metrics_error) {
            console.log('PostgreSQL metrics error:', pgData.metrics_error);
            
            // Add a helpful error message based on the error
            if (pgData.metrics_error.includes("relation") && pgData.metrics_error.includes("does not exist")) {
              // This is likely because the database is new and tables haven't been created yet
              dbHealth.postgres.tables_error = "Database tables are not yet created or migrated";
            } else {
              dbHealth.postgres.tables_error = pgData.metrics_error;
            }
          } else if (pgData.tables) {
            // Use tables data if available
            dbHealth.postgres.tables = pgData.tables;
          }
          
          // If we have tables_info from the API, use that
          if (pgData.tables_info) {
            dbHealth.postgres.tables_info = pgData.tables_info;
          }
          
          // Update the main database health with PostgreSQL version and connection info
          if (pgData.version) dbHealth.version = pgData.version;
          if (pgData.connections && pgData.connections.current) dbHealth.connections = pgData.connections.current;
          if (pgData.uptime) dbHealth.uptime = pgData.uptime;
        }
      }
    } catch (pgError) {
      console.error('Error fetching detailed PostgreSQL health:', pgError);
      // Don't fail the entire health check if detailed PostgreSQL metrics can't be fetched
    }
    
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
      
      // Update the database health object with values from the detailed health check
      dbHealth.status = overallStatus;
      if (detailedHealth.database?.uptime) dbHealth.uptime = detailedHealth.database.uptime;
      if (detailedHealth.database?.last_restart) dbHealth.lastRestart = detailedHealth.database.last_restart;
      if (detailedHealth.database?.version) dbHealth.version = detailedHealth.database.version;
      if (dbController?.connections) dbHealth.connections = dbController.connections;
      
      // Set warning message if needed
      if (overallStatus === "warning") {
        dbHealth.warningMessage = "One or more database components are not healthy";
      } else if (overallStatus === "error") {
        dbHealth.warningMessage = "Database is not running";
      }
    }
    
    return dbHealth;
  } catch (error) {
    console.error('Error fetching database health:', error);
    return {
      status: "error",
      uptime: "N/A",
      lastRestart: "N/A",
      version: "N/A",
      connections: 0,
      error: "Failed to connect to database",
      postgres: null,
      warningMessage: null
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

// Fetch resource metrics from the monitoring service
async function getResourceMetrics() {
  try {
    // Try to fetch real metrics from the monitoring service
    const metrics = await fetchCurrentMetrics();
    
    if (metrics) {
      // Return real metrics from the monitoring service
      return {
        cpu: {
          system: metrics.cpu.system,
          challenges: metrics.cpu.challenges,
          total: metrics.cpu.total
        },
        memory: {
          used: metrics.memory.used,
          available: metrics.memory.available,
          total: metrics.memory.total_bytes,
          usedBytes: metrics.memory.used_bytes
        },
        network: {
          inbound: metrics.network.inbound,
          outbound: metrics.network.outbound,
          total: metrics.network.total
        }
      };
    }
    
    // If monitoring service is unavailable, fall back to default values
    console.log('Falling back to default resource metrics');
    const fallbackMetrics = generateFallbackMetrics();
    
    return {
      cpu: {
        system: fallbackMetrics.cpu.system,
        challenges: fallbackMetrics.cpu.challenges,
        total: fallbackMetrics.cpu.total
      },
      memory: {
        used: fallbackMetrics.memory.used,
        available: fallbackMetrics.memory.available,
        total: fallbackMetrics.memory.total_bytes,
        usedBytes: fallbackMetrics.memory.used_bytes
      },
      network: {
        inbound: fallbackMetrics.network.inbound,
        outbound: fallbackMetrics.network.outbound,
        total: fallbackMetrics.network.total
      }
    };
  } catch (error) {
    console.error('Error fetching resource metrics:', error);
    
    // Return default values if there's an error
    const fallbackMetrics = generateFallbackMetrics();
    
    return {
      cpu: {
        system: fallbackMetrics.cpu.system,
        challenges: fallbackMetrics.cpu.challenges,
        total: fallbackMetrics.cpu.total
      },
      memory: {
        used: fallbackMetrics.memory.used,
        available: fallbackMetrics.memory.available,
        total: fallbackMetrics.memory.total_bytes,
        usedBytes: fallbackMetrics.memory.used_bytes
      },
      network: {
        inbound: fallbackMetrics.network.inbound,
        outbound: fallbackMetrics.network.outbound,
        total: fallbackMetrics.network.total
      }
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
    
    // Fetch all health data in parallel
    const [
      ingressHealth,
      databaseHealth,
      certManagerHealth,
      challengeStats,
      resourceMetrics
    ] = await Promise.all([
      getIngressInstanceManagerHealth(),
      getDatabaseHealth(),
      getCertManagerHealth(),
      getChallengeStats(),
      getResourceMetrics()
    ]);
    
    // Return the combined health data
    return NextResponse.json({
      ingress: ingressHealth,
      database: databaseHealth,
      certManager: certManagerHealth,
      challenges: challengeStats,
      resources: resourceMetrics
    });
  } catch (error) {
    console.error('Error in system-health API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 