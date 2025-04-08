"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ExternalLink, Loader2, ChevronDown, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface ChallengeInstance {
  id: string;
  challengeUrl: string;
  status: string;
  creationTime: string;
}

interface ChallengeInstanceManagerProps {
  instances: ChallengeInstance[];
  onTerminate: (instanceId: string) => Promise<void>;
  isLoading?: boolean;
}

export function ChallengeInstanceManager({
  instances: initialInstances,
  onTerminate,
  isLoading = false,
}: ChallengeInstanceManagerProps) {
  const [terminatingIds, setTerminatingIds] = useState<Set<string>>(new Set());
  const [instances, setInstances] = useState<ChallengeInstance[]>(initialInstances);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const router = useRouter();

  // Function to update instance statuses from the API
  const updateInstanceStatuses = async () => {
    if (!instances.length) return;
    
    try {
      setIsRefreshing(true);
      
      // Fetch real-time status from instance manager
      const response = await fetch('/api/instance-manager-proxy?path=list-challenge-pods');
      
      if (!response.ok) {
        console.warn('Failed to refresh instance statuses:', await response.text());
        return;
      }
      
      const data = await response.json();
      
      if (!data.instances || !Array.isArray(data.instances)) {
        console.warn('Invalid response format from instance manager');
        return;
      }
      
      // Create map of instance IDs to statuses from API response
      const statusMap = new Map();
      data.instances.forEach((instance: any) => {
        statusMap.set(instance.id, instance.status);
      });
      
      // Check if any instance statuses have changed
      let hasStatusChanged = false;
      
      const updatedInstances = instances.map(instance => {
        const newStatus = statusMap.get(instance.id);
        if (newStatus && newStatus !== instance.status) {
          hasStatusChanged = true;
          return { ...instance, status: newStatus };
        }
        return instance;
      });
      
      // Only update state if statuses have changed
      if (hasStatusChanged) {
        setInstances(updatedInstances);
        
        // Show notification for completed instances
        updatedInstances.forEach(instance => {
          const oldInstance = initialInstances.find(i => i.id === instance.id);
          if (oldInstance && oldInstance.status !== 'running' && instance.status === 'running') {
            toast.success(`Challenge instance ${instance.id} is now ready!`);
          }
        });
      }
    } catch (error) {
      console.error('Error updating instance statuses:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Poll for status updates
  useEffect(() => {
    // Initial update
    updateInstanceStatuses();
    
    // Set up polling every 5 seconds
    const interval = setInterval(() => {
      updateInstanceStatuses();
    }, 5000);
    
    return () => clearInterval(interval);
  }, [initialInstances]); // Re-initialize when initialInstances changes

  const handleTerminate = async (instanceId: string) => {
    try {
      setTerminatingIds(prev => new Set(Array.from(prev).concat(instanceId)));
      await onTerminate(instanceId);
      toast.success("Challenge instance terminated successfully");
      
      // Update local state to remove terminated instance
      setInstances(prev => prev.filter(instance => instance.id !== instanceId));
      
      // Refresh the page to update the instances list
      router.refresh();
    } catch (error) {
      console.error("Error terminating instance:", error);
      toast.error(error instanceof Error ? error.message : "Failed to terminate challenge instance");
    } finally {
      setTerminatingIds(prev => {
        const newSet = new Set(Array.from(prev));
        newSet.delete(instanceId);
        return newSet;
      });
    }
  };

  // Manual refresh function
  const handleManualRefresh = () => {
    updateInstanceStatuses();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (instances.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Active Instances</CardTitle>
          <CardDescription>
            You don&apos;t have any active challenge instances.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Active Instances</CardTitle>
          <CardDescription>
            Manage your active challenge instances. You can have up to 3 instances
            running simultaneously.
          </CardDescription>
        </div>
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={handleManualRefresh} 
          disabled={isRefreshing}
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span className="sr-only">Refresh Instances</span>
        </Button>
      </CardHeader>
      <CardContent>
        <Accordion type="single" collapsible className="space-y-4">
          {instances.map((instance) => (
            <AccordionItem 
              key={instance.id} 
              value={instance.id}
              className="border rounded-lg px-4"
            >
              <AccordionTrigger className="py-2 hover:no-underline">
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-4">
                    <span className="font-medium">Instance {instance.id}</span>
                    <span className="text-sm text-muted-foreground">
                      {instance.status === "creating" || instance.status === "CREATING" ? (
                        <span className="flex items-center gap-2">
                          Creating <Loader2 className="h-3 w-3 animate-spin" />
                        </span>
                      ) : instance.status === "running" || instance.status === "ACTIVE" ? (
                        <span className="text-green-500">Running</span>
                      ) : instance.status}
                    </span>
                  </div>
                  <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200 accordion-chevron" />
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-2 pb-4">
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Started {new Date(instance.creationTime).toLocaleString()}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(instance.challengeUrl, "_blank")}
                      disabled={instance.status === "creating" || instance.status === "CREATING"}
                    >
                      Open Challenge
                      <ExternalLink className="ml-2 h-4 w-4" />
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleTerminate(instance.id)}
                      disabled={terminatingIds.has(instance.id) || instance.status === "creating" || instance.status === "CREATING"}
                    >
                      {terminatingIds.has(instance.id) ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Terminating...
                        </>
                      ) : (
                        "Terminate"
                      )}
                    </Button>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  );
} 