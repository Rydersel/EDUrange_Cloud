'use client';

import React, { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Activity, 
  Server, 
  Database, 
  Trophy,
  RefreshCw
} from "lucide-react";
import { SystemHealthCard } from "@/components/dashboard/system-health-card";
import { ResourceUsageChart } from "@/components/dashboard/resource-usage-chart";
import { DeployedChallengesChart } from "@/components/dashboard/deployed-challenges-chart";
import { SystemStatusOverview } from "@/components/dashboard/system-status-overview";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type HealthStatus = "healthy" | "warning" | "error";

interface SystemStatus {
  ingressInstanceManager: {
    status: string;
    uptime: string;
    lastRestart: string;
    version: string;
  };
  database: {
    status: string;
    uptime: string;
    lastRestart: string;
    version: string;
    connections?: number;
    warningMessage?: string;
  };
  certManager: {
    status: string;
    uptime: string;
    lastRestart: string;
    version: string;
    certificates?: {
      valid: number;
      expiringSoon: number;
      expired: number;
    };
  };
  challenges: {
    total: number;
    active: number;
    pending: number;
    failed: number;
  };
}

interface DashboardClientProps {
  systemStatus: SystemStatus;
}

export function DashboardClient({ systemStatus: initialSystemStatus }: DashboardClientProps) {
  const router = useRouter();
  const [systemStatus, setSystemStatus] = useState<SystemStatus>(initialSystemStatus);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [formattedTime, setFormattedTime] = useState<string>('');
  
  // Initialize lastRefreshed only on client-side to avoid hydration mismatch
  useEffect(() => {
    setLastRefreshed(new Date());
  }, []);
  
  // Update formatted time whenever lastRefreshed changes
  useEffect(() => {
    if (lastRefreshed) {
      setFormattedTime(lastRefreshed.toLocaleTimeString());
    }
  }, [lastRefreshed]);
  
  // Function to fetch updated system health data
  const fetchSystemHealth = async () => {
    try {
      setIsRefreshing(true);
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || window.location.origin;
      const response = await fetch(`${baseUrl}/api/system-health`, {
        cache: 'no-store',
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch system health data');
      }
      
      const data = await response.json();
      setSystemStatus(data);
      setLastRefreshed(new Date());
    } catch (error) {
      console.error('Error refreshing system health:', error);
    } finally {
      setIsRefreshing(false);
    }
  };
  
  // Set up automatic refresh every 30 seconds
  useEffect(() => {
    const refreshInterval = setInterval(() => {
      fetchSystemHealth();
    }, 30000); // 30 seconds
    
    // Clean up interval on component unmount
    return () => clearInterval(refreshInterval);
  }, []);
  
  // Manual refresh handler
  const handleManualRefresh = () => {
    fetchSystemHealth();
  };
  
  // Convert string status to the required HealthStatus type
  const getHealthStatus = (status: string): HealthStatus => {
    if (status === "healthy" || status === "warning" || status === "error") {
      return status as HealthStatus;
    }
    // Default to error if the status is not one of the expected values
    return "error";
  };

  // Handle click on system health cards
  const handleCardClick = (component: string) => {
    router.push(`/dashboard/system/${component}`);
  };

  return (
    <div className="flex-1 space-y-4 p-4 pt-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Admin Dashboard</h2>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {formattedTime ? `Last updated: ${formattedTime}` : 'Loading...'}
          </span>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleManualRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>
      
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="resources">Resources</TabsTrigger>
          <TabsTrigger value="challenges">Challenges</TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div 
              onClick={() => handleCardClick('instance-manager')}
              className="cursor-pointer transition-transform hover:scale-[1.02]"
            >
              <SystemHealthCard 
                title="Instance Manager"
                status={getHealthStatus(systemStatus.ingressInstanceManager.status)}
                icon={Server}
                details={[
                  { label: "Uptime", value: systemStatus.ingressInstanceManager.uptime },
                  { label: "Version", value: systemStatus.ingressInstanceManager.version }
                ]}
              />
            </div>
            
            <div 
              onClick={() => handleCardClick('database')}
              className="cursor-pointer transition-transform hover:scale-[1.02]"
            >
              <SystemHealthCard 
                title="Database"
                status={getHealthStatus(systemStatus.database.status)}
                icon={Database}
                details={[
                  { label: "Uptime", value: systemStatus.database.uptime },
                  { label: "Connections", value: systemStatus.database.connections?.toString() || "N/A" }
                ]}
              />
            </div>
            
            <div 
              onClick={() => handleCardClick('cert-manager')}
              className="cursor-pointer transition-transform hover:scale-[1.02]"
            >
              <SystemHealthCard 
                title="Cert Manager"
                status={getHealthStatus(systemStatus.certManager.status)}
                icon={Activity}
                details={[
                  { label: "Uptime", value: systemStatus.certManager.uptime },
                  { label: "Valid Certs", value: systemStatus.certManager.certificates?.valid.toString() || "N/A" }
                ]}
              />
            </div>
            
            <div
              onClick={() => router.push('/dashboard/challenge')}
              className="cursor-pointer transition-transform hover:scale-[1.02]"
            >
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Challenge Instances
                  </CardTitle>
                  <Trophy className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{systemStatus.challenges.active}</div>
                  <p className="text-xs text-muted-foreground">
                    {systemStatus.challenges.total} total / {systemStatus.challenges.pending} pending / {systemStatus.challenges.failed} failed
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
          
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
            <Card className="col-span-4">
              <CardHeader>
                <CardTitle>System Status Overview</CardTitle>
              </CardHeader>
              <CardContent className="pl-2">
                <SystemStatusOverview />
              </CardContent>
            </Card>
            
            <Card className="col-span-3">
              <CardHeader>
                <CardTitle>Deployed Challenges</CardTitle>
              </CardHeader>
              <CardContent>
                <DeployedChallengesChart />
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        <TabsContent value="resources" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card className="col-span-2">
              <CardHeader>
                <CardTitle>CPU Usage</CardTitle>
                <CardDescription>
                  System CPU utilization over time
                </CardDescription>
              </CardHeader>
              <CardContent className="pl-2">
                <ResourceUsageChart 
                  resourceType="cpu"
                />
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Memory Usage</CardTitle>
                <CardDescription>
                  System memory utilization
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResourceUsageChart 
                  resourceType="memory"
                  showLegend={false}
                />
              </CardContent>
            </Card>
          </div>
          
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card className="col-span-3">
              <CardHeader>
                <CardTitle>Network Traffic</CardTitle>
                <CardDescription>
                  Inbound and outbound network traffic
                </CardDescription>
              </CardHeader>
              <CardContent className="pl-2">
                <ResourceUsageChart 
                  resourceType="network"
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        <TabsContent value="challenges" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card className="col-span-2">
              <CardHeader>
                <CardTitle>Challenge Deployment Status</CardTitle>
                <CardDescription>
                  Status of all deployed challenges
                </CardDescription>
              </CardHeader>
              <CardContent>
                <DeployedChallengesChart showDetails={true} />
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Challenge Types</CardTitle>
                <CardDescription>
                  Distribution by challenge type
                </CardDescription>
              </CardHeader>
              <CardContent>
                <DeployedChallengesChart showByType={true} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
} 