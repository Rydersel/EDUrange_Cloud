import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import authConfig from "@/auth.config";
import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Database, CheckCircle, XCircle, AlertCircle, Activity, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { getInstanceManagerUrl } from "@/lib/api-config";

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
      const uptime = detailedHealth.database?.uptime || "unknown";
      const lastRestart = detailedHealth.database?.last_restart || "unknown";
      
      // Get real connection count if available
      const connections = detailedHealth.database?.controller?.connections || 0;
      
      return {
        status: overallStatus,
        uptime: uptime, // Use database-specific uptime
        lastRestart: lastRestart, // Use database-specific last restart
        version: "PostgreSQL 14.0", // Mock data for now
        connections: connections, // Use real connection count from API
        warningMessage: overallStatus === "warning" ? 
          "One or more database components are not healthy" : 
          (overallStatus === "error" ? "Database is not running" : null),
        components: {
          database: dbStatus === "ok" ? "healthy" : "error",
          api: dbApiStatus === "ok" ? "healthy" : "error",
          sync: dbSyncStatus === "ok" ? "healthy" : "error"
        }
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
        sync: "error"
      }
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
                <span className={`font-medium ${databaseHealth.components?.database === "healthy" ? "text-green-500" : "text-red-500"}`}>
                  {databaseHealth.components?.database === "healthy" ? "Healthy" : "Error"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center">
                  <Activity className="mr-2 h-4 w-4 text-blue-500" />
                  Database API
                </span>
                <span className={`font-medium ${databaseHealth.components?.api === "healthy" ? "text-green-500" : "text-red-500"}`}>
                  {databaseHealth.components?.api === "healthy" ? "Healthy" : "Error"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center">
                  <Activity className="mr-2 h-4 w-4 text-blue-500" />
                  Database Sync
                </span>
                <span className={`font-medium ${databaseHealth.components?.sync === "healthy" ? "text-green-500" : "text-red-500"}`}>
                  {databaseHealth.components?.sync === "healthy" ? "Healthy" : "Error"}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
} 