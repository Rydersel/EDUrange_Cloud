import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import authConfig from "@/auth.config";
import React from "react";
import { DashboardClient } from "@/components/dashboard/dashboard-client";

// Function to fetch system health data
async function getSystemHealth() {
  try {
    // In a production environment, this would be a real API call
    // For now, we'll use the mock data from our API route
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 
                   (typeof window === 'undefined' ? process.env.NEXTAUTH_URL : window.location.origin);
    
    // For server components, we'll pass a session token instead of using credentials
    const response = await fetch(`${baseUrl}/api/system-health?sessionToken=server-component`, {
      cache: 'no-store',
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch system health data');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching system health:', error);
    // Return default data with N/A for uptime values if API call fails
    return {
      ingress: {
        status: "error",
        uptime: "N/A",
        lastRestart: "N/A",
        version: "N/A"
      },
      database: {
        status: "error",
        uptime: "N/A",
        lastRestart: "N/A",
        version: "N/A",
        connections: 0
      },
      certManager: {
        status: "error",
        uptime: "N/A",
        lastRestart: "N/A",
        version: "N/A",
        certificates: {
          valid: 0,
          expiringSoon: 0,
          expired: 0
        }
      },
      challenges: {
        total: 0,
        active: 0,
        pending: 0,
        failed: 0
      }
    };
  }
}

// Add revalidation tag to ensure dashboard is updated when navigating back
export const revalidate = 0;

export default async function DashboardPage() {
  const session = await getServerSession(authConfig);
  if (!session) {
    redirect('/'); // Redirect to sign-in page if not authenticated
  }

  // Fetch system health data
  const systemStatus = await getSystemHealth();

  return <DashboardClient systemStatus={systemStatus} />;
}
