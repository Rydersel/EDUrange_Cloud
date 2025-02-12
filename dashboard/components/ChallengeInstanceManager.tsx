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
import { ExternalLink, Loader2, ChevronDown } from "lucide-react";
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
  instances,
  onTerminate,
  isLoading = false,
}: ChallengeInstanceManagerProps) {
  const [terminatingIds, setTerminatingIds] = useState<Set<string>>(new Set());
  const router = useRouter();

  // Auto-refresh while instances are in creating state
  useEffect(() => {
    const hasCreatingInstances = instances.some(instance => instance.status === "creating");
    if (hasCreatingInstances) {
      const interval = setInterval(() => {
        router.refresh();
      }, 5000); // Refresh every 5 seconds
      return () => clearInterval(interval);
    }
  }, [instances, router]);

  const handleTerminate = async (instanceId: string) => {
    try {
      setTerminatingIds(prev => new Set(Array.from(prev).concat(instanceId)));
      await onTerminate(instanceId);
      toast.success("Challenge instance terminated successfully");
      router.refresh(); // Refresh the page to update the instances list
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
      <CardHeader>
        <CardTitle>Active Instances</CardTitle>
        <CardDescription>
          Manage your active challenge instances. You can have up to 3 instances
          running simultaneously.
        </CardDescription>
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
                      {instance.status === "creating" ? (
                        <span className="flex items-center gap-2">
                          Creating <Loader2 className="h-3 w-3 animate-spin" />
                        </span>
                      ) : instance.status === "running" ? (
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
                      disabled={instance.status === "creating"}
                    >
                      Open Challenge
                      <ExternalLink className="ml-2 h-4 w-4" />
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleTerminate(instance.id)}
                      disabled={terminatingIds.has(instance.id) || instance.status === "creating"}
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