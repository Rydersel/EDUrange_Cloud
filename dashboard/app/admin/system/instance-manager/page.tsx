import React from "react";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import authConfig from "@/auth.config";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle, XCircle, AlertCircle, Server } from "lucide-react";
import Link from "next/link";
import { getInstanceManagerUrl } from "@/lib/api-config";
import InstanceManagerActions from "./actions";

// Add revalidation tag to ensure dashboard is updated when navigating back
export const revalidate = 0; // Revalidate on every request

// Function to fetch instance manager health data
async function getInstanceManagerHealth() {
  try {
    // Fetch real data from the instance manager
    const instanceManagerUrl = getInstanceManagerUrl();
    const response = await fetch(`${instanceManagerUrl}/health`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      next: { revalidate: 30 } // Revalidate every 30 seconds
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch instance manager health');
    }
    
    const data = await response.json();
    
    return {
      status: data.status === "ok" ? "healthy" : "error",
      uptime: data.uptime || "unknown",
      lastRestart: data.last_restart || "unknown",
      version: data.version || "unknown"
    };
  } catch (error) {
    console.error('Error fetching instance manager health:', error);
    return {
      status: "error",
      uptime: "unknown",
      lastRestart: "unknown",
      version: "unknown",
      error: "Failed to connect to instance manager"
    };
  }
}

export default async function InstanceManagerPage() {
  const session = await getServerSession(authConfig);
  if (!session) {
    redirect('/'); // Redirect to sign-in page if not authenticated
  }

  // Check if user is admin
  if (session.user.role !== 'ADMIN') {
    redirect('/invalid-permission'); // Redirect to invalid permission page if not admin
  }

  // Fetch instance manager health data
  const instanceManagerHealth = await getInstanceManagerHealth();

  return (
    <div className="flex-1 space-y-4 p-4 pt-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" asChild>
            <Link href="/dashboard">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h2 className="text-3xl font-bold tracking-tight">Instance Manager</h2>
        </div>
      </div>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Status
              <span className="flex items-center space-x-2">
                {instanceManagerHealth.status === "healthy" ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : instanceManagerHealth.status === "warning" ? (
                  <AlertCircle className="h-5 w-5 text-yellow-500" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-500" />
                )}
                <span className="text-lg font-medium capitalize">{instanceManagerHealth.status}</span>
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Uptime:</span>
                <span className="text-sm font-medium">{instanceManagerHealth.uptime}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Version:</span>
                <span className="text-sm font-medium">{instanceManagerHealth.version}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Last Restart:</span>
                <span className="text-sm font-medium">{instanceManagerHealth.lastRestart}</span>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Configuration</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">API Endpoint:</span>
                <span className="text-sm font-medium">{getInstanceManagerUrl()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Kubernetes Namespace:</span>
                <span className="text-sm font-medium">edurange</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Max Concurrent Deployments:</span>
                <span className="text-sm font-medium">10</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <InstanceManagerActions status={instanceManagerHealth.status} />
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>Recent Deployments</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            No recent deployments found.
          </p>
        </CardContent>
      </Card>
    </div>
  );
} 