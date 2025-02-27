'use client';

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle } from "lucide-react";

interface InstanceManagerActionsProps {
  status: string;
}

export default function InstanceManagerActions({ status }: InstanceManagerActionsProps) {
  const [isRestarting, setIsRestarting] = useState(false);
  const { toast } = useToast();
  const router = useRouter();
  const isUnavailable = status === "error";

  const handleRestart = async () => {
    try {
      setIsRestarting(true);
      
      const response = await fetch('/api/system/restart', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ service: 'instance-manager' }),
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to restart service');
      }
      
      toast({
        title: "Restart initiated",
        description: "The instance manager is restarting. This may take a few moments.",
        duration: 5000,
      });
      
      // Wait a bit and then refresh the page to show updated status
      setTimeout(() => {
        router.refresh();
      }, 5000);
      
    } catch (error) {
      console.error('Error restarting service:', error);
      toast({
        title: "Restart failed",
        description: error instanceof Error ? error.message : "An error occurred while restarting the service",
        variant: "destructive",
        duration: 5000,
      });
    } finally {
      setIsRestarting(false);
    }
  };
  
  const handleViewLogs = () => {
    // This would be implemented to view logs
    toast({
      title: "View logs",
      description: "Log viewing functionality is not yet implemented",
      duration: 3000,
    });
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Button 
        className="w-full" 
        onClick={handleRestart}
        disabled={isRestarting || isUnavailable}
        variant={isUnavailable ? "destructive" : "default"}
      >
        {isRestarting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Restarting...
          </>
        ) : isUnavailable ? (
          <>
            <AlertCircle className="mr-2 h-4 w-4" />
            Service Unavailable
          </>
        ) : (
          "Restart Service"
        )}
      </Button>
      <Button 
        className="w-full" 
        variant="outline"
        onClick={handleViewLogs}
      >
        View Logs
      </Button>
    </div>
  );
} 