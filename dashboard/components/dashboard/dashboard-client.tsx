'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
  RefreshCw,
  LucideIcon
} from "lucide-react";
import { SystemHealthCard } from "@/components/dashboard/system-health-card";
import { ResourceUsageChart } from "@/components/dashboard/resource-usage-chart";
import { DeployedChallengesChart } from "@/components/dashboard/deployed-challenges-chart";
import { SystemStatusOverview } from "@/components/dashboard/system-status-overview";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CPUUsagePieChart } from "@/components/dashboard/cpu-usage-pie-chart";
import { MemoryUsagePieChart } from "@/components/dashboard/memory-usage-pie-chart";
import { NodeSpecifications } from "@/components/dashboard/node-specifications";

type HealthStatus = "healthy" | "warning" | "error";

interface SystemStatus {
  ingress: {
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
  monitoring: {
    status: string;
    uptime: string;
    lastRestart: string;
    version: string;
    components?: {
      prometheus: string;
      nodeExporter: string;
    };
    metrics?: {
      totalSeries: number;
      scrapeTargets: number;
      activeTargets: number;
    };
  };
  challenges: {
    total: number;
    active: number;
    pending: number;
    failed: number;
  };
  resources?: {
    cpu: {
      system: number;
      challenges: number;
      total: number;
    };
    memory: {
      used: number;
      available: number;
      total: number;
      usedBytes: number;
    };
    network: {
      inbound: number;
      outbound: number;
      total: number;
    };
  };
}

interface DashboardClientProps {
  systemStatus: SystemStatus;
}

// Memoize SystemCard component to prevent unnecessary re-renders
const SystemCard = React.memo(({ 
  title, 
  status, 
  icon, 
  details, 
  onClick 
}: { 
  title: string;
  status: HealthStatus;
  icon: LucideIcon;
  details: { label: string; value: string }[];
  onClick: () => void;
}) => (
  <div
    onClick={onClick}
    className="cursor-pointer transition-transform hover:scale-[1.02]"
  >
    <SystemHealthCard
      title={title}
      status={status}
      icon={icon}
      details={details}
    />
  </div>
));

SystemCard.displayName = 'SystemCard';

export function DashboardClient({ systemStatus: initialSystemStatus }: DashboardClientProps) {
  const router = useRouter();
  const [systemStatus, setSystemStatus] = useState<SystemStatus>(initialSystemStatus);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [formattedTime, setFormattedTime] = useState<string>('');
  
  // Use a ref for the interval to avoid recreating it on each render
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  // Use a ref for the API base URL to avoid recalculations
  const baseUrlRef = useRef<string>('');

  // Initialize lastRefreshed and baseUrl only on client-side
  useEffect(() => {
    setLastRefreshed(new Date());
    baseUrlRef.current = process.env.NEXT_PUBLIC_API_URL || window.location.origin;
  }, []);

  // Update formatted time whenever lastRefreshed changes
  useEffect(() => {
    if (lastRefreshed) {
      setFormattedTime(lastRefreshed.toLocaleTimeString());
    }
  }, [lastRefreshed]);

  // Function to fetch updated system health data
  const fetchSystemHealth = useCallback(async () => {
    if (isRefreshing) return; // Prevent multiple simultaneous requests
    
    try {
      setIsRefreshing(true);
      const response = await fetch(`${baseUrlRef.current}/api/system-health`, {
        cache: 'no-store',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch system health data: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      setSystemStatus(data);
      setLastRefreshed(new Date());
    } catch (error) {
      console.error('Error refreshing system health:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing]);

  // Set up automatic refresh every 30 seconds
  useEffect(() => {
    // Clear any existing interval
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
    }
    
    // Create a new interval
    refreshIntervalRef.current = setInterval(() => {
      fetchSystemHealth();
    }, 30000); // 30 seconds

    // Clean up interval on component unmount
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
    };
  }, [fetchSystemHealth]);

  // Manual refresh handler
  const handleManualRefresh = useCallback(() => {
    fetchSystemHealth();
  }, [fetchSystemHealth]);

  // Convert string status to the required HealthStatus type - memoize since it's a pure function
  const getHealthStatus = useCallback((status: string): HealthStatus => {
    if (status === "healthy" || status === "warning" || status === "error") {
      return status as HealthStatus;
    }
    // Default to error if the status is not one of the expected values
    return "error";
  }, []);

  // Handle click on system health cards
  const handleCardClick = useCallback((component: string) => {
    // Add loading state before navigation
    setIsRefreshing(true); 
    router.push(`/dashboard/system/${component}`);
  }, [router]);

  // Memoize card click handlers to prevent recreating on each render
  const handleInstanceManagerClick = useCallback(() => handleCardClick('instance-manager'), [handleCardClick]);
  const handleDatabaseClick = useCallback(() => handleCardClick('database'), [handleCardClick]);
  const handleMonitoringClick = useCallback(() => handleCardClick('monitoring'), [handleCardClick]);

  // Memoize the card details to avoid recalculation on each render
  const instanceManagerDetails = useMemo(() => [
    { label: "Uptime", value: systemStatus.ingress.uptime },
    { label: "Version", value: systemStatus.ingress.version }
  ], [systemStatus.ingress.uptime, systemStatus.ingress.version]);

  const databaseDetails = useMemo(() => [
    { label: "Uptime", value: systemStatus.database.uptime },
    { label: "Connections", value: systemStatus.database.connections?.toString() || "N/A" }
  ], [systemStatus.database.uptime, systemStatus.database.connections]);

  const monitoringDetails = useMemo(() => [
    { label: "Uptime", value: systemStatus.monitoring?.uptime || "N/A" },
    { label: "Metrics", value: systemStatus.monitoring?.metrics?.totalSeries?.toString() || "N/A" }
  ], [systemStatus.monitoring?.uptime, systemStatus.monitoring?.metrics?.totalSeries]);

  return (
    <div className="flex-1 space-y-4 p-4 pt-6 overflow-auto max-h-[calc(100vh-4rem)]">
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
            <SystemCard
              title="Instance Manager"
              status={getHealthStatus(systemStatus.ingress.status)}
              icon={Server}
              details={instanceManagerDetails}
              onClick={handleInstanceManagerClick}
            />

            <SystemCard
              title="Database"
              status={getHealthStatus(systemStatus.database.status)}
              icon={Database}
              details={databaseDetails}
              onClick={handleDatabaseClick}
            />

            <SystemCard
              title="Monitoring"
              status={getHealthStatus(systemStatus.monitoring?.status || "error")}
              icon={Activity}
              details={monitoringDetails}
              onClick={handleMonitoringClick}
            />

            <div
              onClick={() => {
                // Add loading state before navigation for challenge instances
                setIsRefreshing(true);
                router.push('/dashboard/challenge');
              }}
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
            <Card>
              <CardHeader>
                <CardTitle>CPU Usage Percentage</CardTitle>
                <CardDescription>
                  Current CPU utilization
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CPUUsagePieChart />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Memory Usage Percentage</CardTitle>
                <CardDescription>
                  Current memory utilization
                </CardDescription>
              </CardHeader>
              <CardContent>
                <MemoryUsagePieChart />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Node Specifications</CardTitle>
                <CardDescription>
                  System hardware details
                </CardDescription>
              </CardHeader>
              <CardContent>
                <NodeSpecifications />
              </CardContent>
            </Card>
          </div>

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
