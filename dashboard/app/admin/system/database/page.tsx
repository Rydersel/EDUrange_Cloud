import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import authConfig from "@/auth.config";
import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Database, CheckCircle, XCircle, AlertCircle, Activity, ArrowLeft, HardDrive, Clock, Server, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { getInstanceManagerUrl } from "@/lib/api-config";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from '@/components/ui/status-badge';

// Define types for PostgreSQL data
type PostgresTable = {
  schemaname: string;
  table_name: string;
  row_count: number;
  table_size: string;
};

// Add revalidation tag to ensure dashboard is updated when navigating back
export const revalidate = 0;

// Function to fetch database health data
async function getDatabaseHealth() {
  try {
    // First, try to get detailed component health data directly from the instance manager
    const instanceManagerUrl = getInstanceManagerUrl();
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
    
    const detailedHealth = await response.json();
    
    // Debug logging
    console.log('Detailed health response:', JSON.stringify(detailedHealth, null, 2));
    
    if (detailedHealth && detailedHealth.database) {
      // Use the database status from the detailed health check
      const dbStatus = detailedHealth.database.status;
      const dbController = detailedHealth.database.controller;
      
      // Extract API and Sync status from the controller object
      const dbApiStatus = dbController.api;
      const dbSyncStatus = dbController.sync;
      
      // Check for PgBouncer status
      const pgBouncerStatus = detailedHealth.database.pgbouncer?.status || "error";
      
      // If any component is not ok, set the overall status to warning or error
      let overallStatus = "healthy";
      if (dbStatus !== "ok" || dbApiStatus !== "ok" || dbSyncStatus !== "ok" || pgBouncerStatus !== "ok") {
        overallStatus = "warning";
        
        // If the main database is down, it's an error
        if (dbStatus !== "ok") {
          overallStatus = "error";
        }
      }
      
      // Get database-specific uptime and last restart
      const uptime = detailedHealth.database?.uptime || "unknown";
      const lastRestart = detailedHealth.database?.last_restart || "unknown";
      
      // Get real connection count if available
      const connections = detailedHealth.database?.controller?.connections || 0;
      
      // Fall back to the system health API to get detailed PostgreSQL metrics
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 
                     (typeof window === 'undefined' ? process.env.NEXTAUTH_URL : window.location.origin);
      
      const systemHealthResponse = await fetch(`${baseUrl}/api/system-health?sessionToken=server-component`, {
        cache: 'no-store',
      });
      
      if (systemHealthResponse.ok) {
        const systemHealthData = await systemHealthResponse.json();
        const postgresData = systemHealthData.database.postgres;
        
        return {
          status: overallStatus,
          uptime: uptime, // Use database-specific uptime
          lastRestart: lastRestart, // Use database-specific last restart
          version: postgresData?.version || "PostgreSQL 14.0", // Use real version if available
          connections: connections, // Use real connection count from API
          warningMessage: overallStatus === "warning" ? 
            "One or more database components are not healthy" : 
            (overallStatus === "error" ? "Database is not running" : null),
          components: {
            database: dbStatus === "ok" ? "healthy" : "error",
            api: dbApiStatus === "ok" ? "healthy" : "error",
            sync: dbSyncStatus === "ok" ? "healthy" : "error",
            pgbouncer: pgBouncerStatus === "ok" ? "healthy" : "error"
          },
          postgres: postgresData // Include detailed PostgreSQL metrics
        };
      }
      
      // If system health API fails, return data without PostgreSQL metrics
      return {
        status: overallStatus,
        uptime: uptime,
        lastRestart: lastRestart,
        version: "PostgreSQL 14.0", // Mock data for now
        connections: connections,
        warningMessage: overallStatus === "warning" ? 
          "One or more database components are not healthy" : 
          (overallStatus === "error" ? "Database is not running" : null),
        components: {
          database: dbStatus === "ok" ? "healthy" : "error",
          api: dbApiStatus === "ok" ? "healthy" : "error",
          sync: dbSyncStatus === "ok" ? "healthy" : "error",
          pgbouncer: pgBouncerStatus === "ok" ? "healthy" : "error"
        },
        postgres: null
      };
    }
    
    // Fall back to the system health API if detailed health check fails
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 
                   (typeof window === 'undefined' ? process.env.NEXTAUTH_URL : window.location.origin);
    
    const systemHealthResponse = await fetch(`${baseUrl}/api/system-health?sessionToken=server-component`, {
      cache: 'no-store',
    });
    
    if (!systemHealthResponse.ok) {
      throw new Error('Failed to fetch system health data');
    }
    
    const data = await systemHealthResponse.json();
    return data.database;
  } catch (error) {
    console.error('Error fetching database health:', error);
    // Return default data if API call fails
    return {
      status: "error",
      uptime: "unknown",
      lastRestart: "unknown",
      version: "unknown",
      connections: 0,
      warningMessage: null,
      components: {
        database: "error",
        api: "error",
        sync: "error",
        pgbouncer: "error"
      },
      postgres: null
    };
  }
}

export default async function DatabasePage() {
  const session = await getServerSession(authConfig);
  if (!session) {
    redirect('/'); // Redirect to sign-in page if not authenticated
  }

  // Check if user is admin
  if (session.user.role !== 'ADMIN') {
    redirect('/invalid-permission'); // Redirect to invalid permission page if not admin
  }

  // Fetch database health data
  const databaseHealth = await getDatabaseHealth();

  return (
    <div className="flex-1 space-y-4 p-4 pt-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" asChild>
            <Link href="/dashboard">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h2 className="text-3xl font-bold tracking-tight">Database</h2>
        </div>
      </div>
      
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="tables">Tables</TabsTrigger>
          <TabsTrigger value="connection-pool">Connection Pool</TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  Status
                  <span className="flex items-center space-x-2">
                    {databaseHealth.status === "healthy" ? (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    ) : databaseHealth.status === "warning" ? (
                      <AlertCircle className="h-5 w-5 text-yellow-500" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-500" />
                    )}
                    <span className="text-lg font-medium capitalize">{databaseHealth.status}</span>
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Uptime:</span>
                    <span className="text-sm font-medium">{databaseHealth.uptime}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Version:</span>
                    <span className="text-sm font-medium">{databaseHealth.version}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Last Restart:</span>
                    <span className="text-sm font-medium">{databaseHealth.lastRestart}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Connections</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Active Connections:</span>
                  <span className="text-lg font-medium">{databaseHealth.connections || 0}</span>
                </div>
                {databaseHealth.warningMessage && (
                  <div className="mt-4 rounded-md bg-yellow-50 p-3 text-sm text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200">
                    <div className="flex items-center">
                      <AlertCircle className="mr-2 h-4 w-4" />
                      <span>{databaseHealth.warningMessage}</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Services</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center">
                      <Activity className="mr-2 h-4 w-4 text-blue-500" />
                      Database Pod
                    </span>
                    <StatusBadge status={databaseHealth.components?.database || "error"} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center">
                      <Activity className="mr-2 h-4 w-4 text-blue-500" />
                      Database API
                    </span>
                    <StatusBadge status={databaseHealth.components?.api || "error"} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center">
                      <Activity className="mr-2 h-4 w-4 text-blue-500" />
                      Database Sync
                    </span>
                    <StatusBadge status={databaseHealth.components?.sync || "error"} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center">
                      <Activity className="mr-2 h-4 w-4 text-blue-500" />
                      PgBouncer
                    </span>
                    <StatusBadge status={databaseHealth.components?.pgbouncer || "error"} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          
          {/* PostgreSQL Detailed Metrics Section */}
          {databaseHealth.postgres ? (
            <div className="mt-6">
              <h3 className="text-lg font-medium mb-4">PostgreSQL Detailed Metrics</h3>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <Clock className="mr-2 h-5 w-5" />
                      Performance
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>Query Latency</span>
                          <span>{databaseHealth.postgres.performance.query_latency_ms} ms</span>
                        </div>
                        <Progress 
                          value={Math.min(100, (databaseHealth.postgres.performance.query_latency_ms || 0) / 10 * 100)} 
                          className="h-2" 
                        />
                      </div>
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>Transaction Latency</span>
                          <span>{databaseHealth.postgres.performance.transaction_latency_ms} ms</span>
                        </div>
                        <Progress 
                          value={Math.min(100, (databaseHealth.postgres.performance.transaction_latency_ms || 0) / 20 * 100)} 
                          className="h-2" 
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <HardDrive className="mr-2 h-5 w-5" />
                      Storage
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Database Size:</span>
                        <span className="text-sm font-medium">{databaseHealth.postgres.storage.database_size_mb} MB</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <Server className="mr-2 h-5 w-5" />
                      PostgreSQL Info
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Version:</span>
                        <span className="text-sm font-medium">{databaseHealth.postgres.version}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Uptime:</span>
                        <span className="text-sm font-medium">{databaseHealth.postgres.uptime}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Status:</span>
                        <StatusBadge 
                          status={databaseHealth.postgres.status === "ok" ? "healthy" : "error"} 
                          customText={databaseHealth.postgres.status === "ok" ? "Healthy" : "Error"}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Detailed PostgreSQL Metrics</CardTitle>
                <CardDescription>
                  Detailed PostgreSQL metrics are not available. This could be because the database controller is not accessible or the detailed health check endpoint is not responding.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-center p-6">
                  <AlertCircle className="h-12 w-12 text-yellow-500" />
                  <div className="ml-4">
                    <h3 className="text-lg font-medium">Metrics Unavailable</h3>
                    <p className="text-sm text-muted-foreground">
                      Try refreshing the page or check if the database controller is running properly.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
        
        <TabsContent value="tables" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Database Tables</CardTitle>
              <CardDescription>
                {databaseHealth.postgres?.tables_error || databaseHealth.postgres?.tables_info || 
                 (databaseHealth.postgres?.tables && databaseHealth.postgres.tables.length > 0 
                  ? "Top tables by row count in the PostgreSQL database" 
                  : "No tables found in the database")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {databaseHealth.postgres?.tables && databaseHealth.postgres.tables.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Schema</TableHead>
                      <TableHead>Table Name</TableHead>
                      <TableHead className="text-right">Row Count</TableHead>
                      <TableHead className="text-right">Size</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {databaseHealth.postgres.tables.map((table: PostgresTable, index: number) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{table.schemaname}</TableCell>
                        <TableCell>{table.table_name}</TableCell>
                        <TableCell className="text-right">{table.row_count.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{table.table_size}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="flex flex-col items-center justify-center p-6 text-center">
                  <AlertCircle className="h-12 w-12 text-yellow-500 mb-4" />
                  <h3 className="text-lg font-medium mb-2">No Tables Available</h3>
                  <p className="text-sm text-muted-foreground max-w-md">
                    {databaseHealth.postgres?.tables_error ? (
                      <>
                        Error: {databaseHealth.postgres.tables_error}
                      </>
                    ) : databaseHealth.postgres?.tables_info ? (
                      <>
                        {databaseHealth.postgres.tables_info}
                      </>
                    ) : !databaseHealth.postgres ? (
                      <>
                        Database metrics are not available. Please check if the database controller is running properly.
                      </>
                    ) : (
                      <>
                        No tables have been created in the database yet. Tables will appear here once they are created.
                      </>
                    )}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="connection-pool" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>PgBouncer Connection Pool</CardTitle>
              <CardDescription>
                Connection pooling statistics for the PostgreSQL database via PgBouncer
              </CardDescription>
            </CardHeader>
            <CardContent>
              {databaseHealth.postgres?.pgbouncer ? (
                <div className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <Card>
                      <CardHeader className="py-2">
                        <CardTitle className="text-sm">Status</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center">
                          {databaseHealth.postgres.pgbouncer.status === "ok" ? (
                            <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
                          ) : (
                            <XCircle className="h-5 w-5 text-red-500 mr-2" />
                          )}
                          <span className="text-2xl font-bold capitalize">
                            {databaseHealth.postgres.pgbouncer.status === "ok" ? "Healthy" : "Error"}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                    
                    <Card>
                      <CardHeader className="py-2">
                        <CardTitle className="text-sm">Version</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-xl font-medium">{databaseHealth.postgres.pgbouncer.version}</div>
                      </CardContent>
                    </Card>
                    
                    <Card>
                      <CardHeader className="py-2">
                        <CardTitle className="text-sm">Uptime</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-xl font-medium">{databaseHealth.postgres.pgbouncer.uptime}</div>
                      </CardContent>
                    </Card>
                    
                    <Card>
                      <CardHeader className="py-2">
                        <CardTitle className="text-sm">Active Connections</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-xl font-medium">{databaseHealth.postgres.pgbouncer.connections.active}</div>
                        <div className="text-xs text-muted-foreground">
                          of {databaseHealth.postgres.pgbouncer.connections.max_clients} max connections
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                  
                  <div>
                    <h3 className="text-lg font-medium mb-4">Connection Details</h3>
                    <div className="grid gap-4 md:grid-cols-3">
                      <Card>
                        <CardHeader className="py-2">
                          <CardTitle className="text-sm">Active</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold">{databaseHealth.postgres.pgbouncer.connections.active}</div>
                          <p className="text-xs text-muted-foreground">Client connections in use</p>
                        </CardContent>
                      </Card>
                      
                      <Card>
                        <CardHeader className="py-2">
                          <CardTitle className="text-sm">Waiting</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold">{databaseHealth.postgres.pgbouncer.connections.waiting}</div>
                          <p className="text-xs text-muted-foreground">Client connections waiting for server</p>
                        </CardContent>
                      </Card>
                      
                      <Card>
                        <CardHeader className="py-2">
                          <CardTitle className="text-sm">Idle</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold">{databaseHealth.postgres.pgbouncer.connections.idle}</div>
                          <p className="text-xs text-muted-foreground">Client connections idle</p>
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                  
                  {databaseHealth.postgres.pgbouncer.pools && databaseHealth.postgres.pgbouncer.pools.length > 0 && (
                    <div>
                      <h3 className="text-lg font-medium mb-4">Database Pools</h3>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Database</TableHead>
                            <TableHead className="text-right">Active</TableHead>
                            <TableHead className="text-right">Waiting</TableHead>
                            <TableHead className="text-right">Server Active</TableHead>
                            <TableHead className="text-right">Server Idle</TableHead>
                            <TableHead className="text-right">Max Wait</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {databaseHealth.postgres.pgbouncer.pools.map((pool: {
                            name: string;
                            active: number;
                            waiting: number;
                            server_active: number;
                            server_idle: number;
                            server_used: number;
                            server_tested: number;
                            server_login: number;
                            max_wait_ms: number;
                          }, index: number) => (
                            <TableRow key={index}>
                              <TableCell className="font-medium">{pool.name}</TableCell>
                              <TableCell className="text-right">{pool.active}</TableCell>
                              <TableCell className="text-right">{pool.waiting}</TableCell>
                              <TableCell className="text-right">{pool.server_active}</TableCell>
                              <TableCell className="text-right">{pool.server_idle}</TableCell>
                              <TableCell className="text-right">{pool.max_wait_ms} ms</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-6 text-center">
                  <AlertCircle className="h-12 w-12 text-yellow-500 mb-4" />
                  <h3 className="text-lg font-medium mb-2">Connection Pool Data Unavailable</h3>
                  <p className="text-sm text-muted-foreground max-w-md">
                    PgBouncer connection pool data is not available. This could be because the PgBouncer pod is not accessible
                    or is not running properly.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
} 