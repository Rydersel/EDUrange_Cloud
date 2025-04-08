import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import authConfig from "@/auth.config";
import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, CheckCircle, XCircle, AlertCircle, ArrowLeft, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { getMonitoringServiceUrl } from "@/lib/api-config";
import MonitoringDetail from "./MonitoringDetail";

// Add revalidation tag to ensure dashboard is updated when navigating back
export const revalidate = 0;

async function getMonitoringHealth() {
  try {
    // Get detailed health from system health API
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 
                   (typeof window === 'undefined' ? process.env.NEXTAUTH_URL : window.location.origin);
    
    const systemHealthResponse = await fetch(`${baseUrl}/api/system-health?sessionToken=server-component`, {
      cache: 'no-store',
    });
    
    if (!systemHealthResponse.ok) {
      throw new Error('Failed to fetch system health data');
    }
    
    const data = await systemHealthResponse.json();
    return data.monitoring || {
      status: "error",
      uptime: "N/A",
      lastRestart: "N/A",
      version: "N/A",
      components: {
        monitoringService: "error",
        prometheus: "error",
        nodeExporter: "error"
      },
      metrics: {
        totalSeries: 0,
        scrapeTargets: 0,
        activeTargets: 0
      },
      warningMessage: "Failed to fetch monitoring health data"
    };
  } catch (error) {
    console.error('Error fetching monitoring health:', error);
    // Return default data if API call fails
    return {
      status: "error",
      uptime: "N/A",
      lastRestart: "N/A",
      version: "N/A",
      components: {
        monitoringService: "error",
        prometheus: "error",
        nodeExporter: "error"
      },
      metrics: {
        totalSeries: 0,
        scrapeTargets: 0,
        activeTargets: 0
      },
      warningMessage: "Failed to fetch monitoring data"
    };
  }
}

export default async function MonitoringPage() {
  const session = await getServerSession(authConfig);
  if (!session) {
    redirect('/'); // Redirect to sign-in page if not authenticated
  }

  // Check if user is admin
  if (session.user.role !== 'ADMIN') {
    redirect('/invalid-permission'); // Redirect to invalid permission page if not admin
  }

  // Fetch monitoring health data
  const monitoringHealth = await getMonitoringHealth();

  return (
    <div className="flex-1 space-y-4 p-4 pt-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" asChild>
            <Link href="/dashboard">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h2 className="text-3xl font-bold tracking-tight">Monitoring Service</h2>
        </div>
      </div>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Status
              <span className="flex items-center space-x-2">
                {monitoringHealth.status === "healthy" ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : monitoringHealth.status === "warning" ? (
                  <AlertCircle className="h-5 w-5 text-yellow-500" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-500" />
                )}
                <span className="text-lg font-medium capitalize">{monitoringHealth.status}</span>
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Uptime:</span>
                <span className="text-sm font-medium">{monitoringHealth.uptime}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Version:</span>
                <span className="text-sm font-medium">{monitoringHealth.version}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Last Restart:</span>
                <span className="text-sm font-medium">{monitoringHealth.lastRestart}</span>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Metrics</CardTitle>
          </CardHeader>
          <CardContent>
            <MonitoringDetail 
              status={monitoringHealth.status}
              uptime={monitoringHealth.uptime}
              lastRestart={monitoringHealth.lastRestart}
              version={monitoringHealth.version}
              components={monitoringHealth.components || { monitoringService: "error", prometheus: "error", nodeExporter: "error" }}
              metrics={monitoringHealth.metrics || { totalSeries: 0, scrapeTargets: 0, activeTargets: 0 }}
              warningMessage={monitoringHealth.warningMessage}
            />
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Button className="w-full" asChild>
                <Link href={getMonitoringServiceUrl() || "#"} target="_blank" rel="noopener noreferrer">
                  View Metrics
                </Link>
              </Button>
              <Button className="w-full" variant="secondary">
                Refresh Metrics
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
} 