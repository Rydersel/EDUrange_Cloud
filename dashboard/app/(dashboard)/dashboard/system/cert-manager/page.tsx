import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import authConfig from "@/auth.config";
import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, CheckCircle, XCircle, AlertCircle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { getInstanceManagerUrl } from "@/lib/api-config";
import CertManagerDetail from "./CertManagerDetail";

// Add revalidation tag to ensure dashboard is updated when navigating back
export const revalidate = 0;

// Function to fetch cert manager health data
async function getCertManagerHealth() {
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
    console.log('Cert Manager detailed health response:', JSON.stringify(detailedHealth, null, 2));
    console.log('Cert Manager certificates:', JSON.stringify(detailedHealth?.cert_manager?.certificates, null, 2));
    
    if (detailedHealth && detailedHealth.cert_manager) {
      // Use the cert manager status from the detailed health check
      const certManagerStatus = detailedHealth.cert_manager.status || detailedHealth.cert_manager;
      
      // Get cert-manager-specific uptime and last restart
      const uptime = detailedHealth.cert_manager?.uptime || "unknown";
      const lastRestart = detailedHealth.cert_manager?.last_restart || "unknown";
      
      // Get real certificate counts if available
      const validCerts = detailedHealth.cert_manager?.certificates?.valid || 0;
      const expiringSoonCerts = detailedHealth.cert_manager?.certificates?.expiringSoon || 0;
      const expiredCerts = detailedHealth.cert_manager?.certificates?.expired || 0;
      
      return {
        status: certManagerStatus === "ok" ? "healthy" : "error",
        uptime: uptime,
        lastRestart: lastRestart,
        version: "v1.11.0", // Mock data for now
        validCertificates: validCerts,
        expiringSoonCertificates: expiringSoonCerts,
        expiredCertificates: expiredCerts,
        warningMessage: certManagerStatus !== "ok" ? 
          "Cert Manager is not functioning correctly" : 
          undefined
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
    return data.certManager;
  } catch (error) {
    console.error('Error fetching cert manager health:', error);
    // Return default data if API call fails
    return {
      status: "error",
      uptime: "unknown",
      lastRestart: "unknown",
      version: "unknown",
      validCertificates: 0,
      expiringSoonCertificates: 0,
      expiredCertificates: 0,
      warningMessage: "Failed to fetch cert manager data"
    };
  }
}

export default async function CertManagerPage() {
  const session = await getServerSession(authConfig);
  if (!session) {
    redirect('/'); // Redirect to sign-in page if not authenticated
  }

  // Check if user is admin
  if (session.user.role !== 'ADMIN') {
    redirect('/invalid-permission'); // Redirect to invalid permission page if not admin
  }

  // Fetch cert manager health data
  const certManagerHealth = await getCertManagerHealth();

  return (
    <div className="flex-1 space-y-4 p-4 pt-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" asChild>
            <Link href="/dashboard">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h2 className="text-3xl font-bold tracking-tight">Cert Manager</h2>
        </div>
      </div>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Status
              <span className="flex items-center space-x-2">
                {certManagerHealth.status === "healthy" ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : certManagerHealth.status === "warning" ? (
                  <AlertCircle className="h-5 w-5 text-yellow-500" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-500" />
                )}
                <span className="text-lg font-medium capitalize">{certManagerHealth.status}</span>
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Uptime:</span>
                <span className="text-sm font-medium">{certManagerHealth.uptime}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Version:</span>
                <span className="text-sm font-medium">{certManagerHealth.version}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Last Restart:</span>
                <span className="text-sm font-medium">{certManagerHealth.lastRestart}</span>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Certificates</CardTitle>
          </CardHeader>
          <CardContent>
            <CertManagerDetail 
              status={certManagerHealth.status}
              uptime={certManagerHealth.uptime}
              lastRestart={certManagerHealth.lastRestart}
              version={certManagerHealth.version}
              validCertificates={certManagerHealth.validCertificates || 0}
              expiringSoonCertificates={certManagerHealth.expiringSoonCertificates || 0}
              expiredCertificates={certManagerHealth.expiredCertificates || 0}
              warningMessage={certManagerHealth.warningMessage}
            />
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <button className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                Refresh Certificates
              </button>
              <button className="w-full rounded-md bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/90">
                View Certificate Details
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
} 