'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ChallengeInstance, Scenario } from '@/types';
import Link from 'next/link';
import { getDatabaseApiUrl } from '@/lib/api-config';
import { useToast } from '@/components/ui/use-toast';
import { Loader, Info, ExternalLink } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { usePathname } from 'next/navigation';

// First add an interface for the challenge pod data from instance manager
interface ChallengePod {
  pod_name: string;
  user_id: string;
  challenge_image: string;
  challenge_url: string;
  creation_time: string;
  status: string;
  flag_secret_name: string;
  competition_id: string;
}

export default function InstanceComponent({ isAdmin = false }: { isAdmin?: boolean }) {
  const { toast } = useToast();
  const pathname = usePathname();
  const [instances, setInstances] = useState<ChallengeInstance[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState<Record<string, boolean>>({});
  const [retryCount, setRetryCount] = useState<number>(0);
  const [selectedInstance, setSelectedInstance] = useState<ChallengeInstance | null>(null);
  const [pollInterval, setPollInterval] = useState<NodeJS.Timeout | null>(null);
  const [initialLoad, setInitialLoad] = useState(true);

  // Function to check if current page is the challenge page
  const isChallengePage = () => {
    // Check if the pathname matches /dashboard/challenge exactly
    return pathname === '/dashboard/challenge';
  };

  // Modified toast function that only shows toast on the challenge page
  const showToastIfOnChallengePage = (title: string, description: string, variant: "default" | "destructive" = "default") => {
    if (isChallengePage()) {
      toast({
        title,
        description,
        variant
      });
    } else {
      // Just log to console if not on challenge page
      console.log(`Toast suppressed on ${pathname}: ${title} - ${description}`);
    }
  };

  // Set up polling for instance status updates
  useEffect(() => {
    // Fetch immediately on mount
    fetchInstances();

    // Set up polling every 5 seconds
    const interval = setInterval(() => {
      fetchInstances();
    }, 5000);

    setPollInterval(interval);

    // Clean up on unmount
    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, []);

  const fetchInstances = async () => {
    // Only show loading indicator during initial load
    if (initialLoad) {
      setLoading(true);
    }
    setError(null);

    try {
      // First try to get instances from database API
      const dbResponse = await fetch('/api/database-proxy?path=challenge-instances');

      if (!dbResponse.ok) {
        // Show a toast when falling back from DB API
        showToastIfOnChallengePage(
          "Database API Fallback",
          "Unable to connect to database API, trying direct instance manager connection"
        );
        throw new Error('Failed to fetch challenge instances from database');
      }

      const dbData = await dbResponse.json();

      if (!dbData.instances || !Array.isArray(dbData.instances)) {
        throw new Error('Unexpected response format from database API');
      }

      // Fix the type error for the map iterator by properly typing the dbInstances Map
      const dbInstances = new Map<string, ChallengeInstance>(
        dbData.instances.map((instance: ChallengeInstance) => [instance.id, instance])
      );

      // Now fetch real-time status from instance manager to get the most up-to-date information
      try {
        const imResponse = await fetch('/api/instance-manager-proxy?path=list-challenge-pods');

        if (imResponse.ok) {
          const imData = await imResponse.json();

          if (imData.challenge_pods && Array.isArray(imData.challenge_pods)) {
            // Merge data from both sources
            const mergedInstances = [];

            // First add all pods from instance manager with most up-to-date status
            for (const pod of imData.challenge_pods as ChallengePod[]) {
              const dbInstance = dbInstances.get(pod.pod_name);

              if (dbInstance) {
                // Update status with real-time data from instance manager
                mergedInstances.push({
                  ...dbInstance,
                  status: pod.status // Use real-time status from instance manager
                });

                // Remove from map to track which ones we've processed
                dbInstances.delete(pod.pod_name);
              } else {
                // This is a new pod not yet in the database, create a basic record
                mergedInstances.push({
                  id: pod.pod_name,
                  userId: pod.user_id,
                  userEmail: 'Loading...',
                  userName: 'Loading...',
                  challengeImage: pod.challenge_image,
                  challengeUrl: pod.challenge_url,
                  creationTime: pod.creation_time,
                  status: pod.status,
                  flagSecretName: pod.flag_secret_name,
                  groupId: pod.competition_id,
                  groupName: pod.competition_id === 'standalone' ? 'Standalone' : pod.competition_id
                });
              }
            }

            // Add any remaining instances from database that weren't in instance manager
            // (these might be instances that failed to create or are being terminated)
            Array.from(dbInstances.entries()).forEach(([id, instance]) => {
              // If not found in instance manager, mark as error or deleted
              const updatedInstance = {
                ...instance,
                status: instance.status === 'terminated' ? 'terminated' : 'error'
              };
              mergedInstances.push(updatedInstance);
            });

            setInstances(mergedInstances);
          } else {
            // Show toast for falling back to database only
            showToastIfOnChallengePage(
              "Instance Manager Format Error",
              "Unable to parse instance manager data, using database information only"
            );
            // If instance manager response doesn't have challenge_pods, fall back to DB data
            setInstances(dbData.instances);
          }
        } else {
          // Show toast for failing to connect to instance manager
          showToastIfOnChallengePage(
            "Instance Manager Unavailable",
            "Using database information only (status data may be outdated)"
          );
          // If instance manager request fails, fall back to DB data
          setInstances(dbData.instances);
        }
      } catch (imError) {
        console.error('Error fetching from instance manager:', imError);
        // Show toast for error with instance manager
        showToastIfOnChallengePage(
          "Instance Manager Error",
          "Error connecting to instance manager, using database information only"
        );
        // Fall back to database instances on error
        setInstances(dbData.instances);
      }
    } catch (error) {
      console.error('Error fetching instances:', error);

      // Show toast for complete database failure
      showToastIfOnChallengePage(
        "Database API Failure",
        "All database connections failed, trying instance manager directly",
        "destructive"
      );

      // Try direct query to instance manager as last resort
      try {
        const imResponse = await fetch('/api/instance-manager-proxy?path=list-challenge-pods');

        if (!imResponse.ok) {
          throw new Error('Failed to fetch challenge pods from instance manager');
        }

        const imData = await imResponse.json();

        if (!imData.challenge_pods || !Array.isArray(imData.challenge_pods)) {
          throw new Error('Unexpected response format from instance manager');
        }

        // Show toast for successful fallback to instance manager
        showToastIfOnChallengePage(
          "Using Instance Manager Data",
          "Successfully retrieved data from instance manager (limited user information available)"
        );

        // Fix the pod parameter type in the map function
        const instancesFromIM = imData.challenge_pods.map((pod: ChallengePod) => ({
          id: pod.pod_name,
          userId: pod.user_id,
          userEmail: 'Unknown',
          userName: 'Unknown',
          challengeImage: pod.challenge_image,
          challengeUrl: pod.challenge_url,
          creationTime: pod.creation_time,
          status: pod.status,
          flagSecretName: pod.flag_secret_name,
          groupId: pod.competition_id,
          groupName: pod.competition_id === 'standalone' ? 'Standalone' : pod.competition_id
        }));

        setInstances(instancesFromIM);
      } catch (fallbackError) {
        console.error('Error with fallback to instance manager:', fallbackError);

        // Show toast for complete failure
        showToastIfOnChallengePage(
          "All Services Unavailable",
          "Unable to connect to any backend services. Please try again later.",
          "destructive"
        );

        setError('Unable to connect to any backend services. Please try again later.');
        setInstances([]);
      }
    } finally {
      setLoading(false);
      setInitialLoad(false);
    }
  };

  const handleDeleteInstance = async (id: string) => {
    // Update the loading state for this specific instance
    setDeleteLoading(prev => ({ ...prev, [id]: true }));

    try {
      // Use the instance-manager-proxy to delete the challenge pod
      const response = await fetch(`/api/instance-manager-proxy?path=delete-challenge-pod&challengeId=${id}`, {
        method: 'DELETE',
      });

      // Handle response properly including possible empty responses
      if (response.status === 204 || response.headers.get('content-length') === '0') {
        showToastIfOnChallengePage(
          'Success',
          'Instance deletion initiated successfully'
        );

        // Refresh the instances list after a short delay to allow the deletion to process
        setTimeout(() => {
          fetchInstances();
        }, 1000);
        return;
      }

      // For JSON responses
      try {
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || 'Failed to delete instance');
        }

        showToastIfOnChallengePage(
          'Success',
          data.message || 'Instance deletion initiated successfully'
        );

        // Refresh the instances list after a short delay
        setTimeout(() => {
          fetchInstances();
        }, 1000);
      } catch (jsonError) {
        // If parsing JSON fails but response was OK, still consider it a success
        if (response.ok) {
          showToastIfOnChallengePage(
            'Success',
            'Instance deletion initiated successfully'
          );

          // Refresh the instances list after a short delay
          setTimeout(() => {
            fetchInstances();
          }, 1000);
        } else {
          throw new Error('Failed to parse response from server');
        }
      }
    } catch (error) {
      console.error('Delete instance error:', error);
      showToastIfOnChallengePage(
        'Error',
        error instanceof Error ? error.message : 'Failed to delete instance',
        'destructive'
      );
    } finally {
      // Clear the loading state for this instance
      setDeleteLoading(prev => ({ ...prev, [id]: false }));
    }
  };

  // Get the scenario name for an instance
  const getScenarioName = (instance: ChallengeInstance) => {
    // Try to find the scenario based on the image name
    const challengeType = instance.challengeType || extractChallengeTypeFromImage(instance.challengeImage);
    return challengeType || 'Unknown Challenge';
  };

  // Extract challenge type from image name
  function extractChallengeTypeFromImage(imageName: string): string {
    if (!imageName) return 'Unknown';

    // Try to extract based on known patterns
    if (imageName.includes('bandit')) return 'Bandit';
    if (imageName.includes('juice')) return 'Juice Shop';
    if (imageName.includes('web')) return 'Web Challenge';

    // Split by common delimiters and take the first part
    const parts = imageName.split(/[:/-]/);
    if (parts.length > 0 && parts[0]) {
      return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
    }

    return 'Unknown';
  }

  // Render instance details in a nicely formatted way
  const renderInstanceDetails = (instance: ChallengeInstance) => {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <h4 className="text-sm font-medium text-muted-foreground">ID</h4>
            <p className="text-sm font-mono break-all">{instance.id}</p>
          </div>
          <div>
            <h4 className="text-sm font-medium text-muted-foreground">Status</h4>
            <StatusBadge status={instance.status || 'Unknown'} />
          </div>
          <div>
            <h4 className="text-sm font-medium text-muted-foreground">Challenge Type</h4>
            <p className="text-sm">{getScenarioName(instance)}</p>
          </div>
          <div>
            <h4 className="text-sm font-medium text-muted-foreground">Creation Time</h4>
            <p className="text-sm">{new Date(instance.creationTime).toLocaleString()}</p>
          </div>
          {instance.userEmail && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground">User Email</h4>
              <p className="text-sm">{instance.userEmail}</p>
            </div>
          )}
          {instance.userName && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground">User Name</h4>
              <p className="text-sm">{instance.userName}</p>
            </div>
          )}
          {isAdmin && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground">User ID</h4>
              <p className="text-sm font-mono break-all">{instance.userId}</p>
            </div>
          )}
          {instance.groupName && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground">Group</h4>
              <p className="text-sm">{instance.groupName}</p>
            </div>
          )}
          <div className="col-span-2">
            <h4 className="text-sm font-medium text-muted-foreground">Challenge Image</h4>
            <p className="text-sm font-mono break-all">{instance.challengeImage}</p>
          </div>
          {instance.challengeUrl && (
            <div className="col-span-2">
              <h4 className="text-sm font-medium text-muted-foreground">Challenge URL</h4>
              <p className="text-sm font-mono break-all">{instance.challengeUrl}</p>
            </div>
          )}
          {instance.flagSecretName && (
            <div className="col-span-2">
              <h4 className="text-sm font-medium text-muted-foreground">Flag Secret Name</h4>
              <p className="text-sm font-mono break-all">{instance.flagSecretName}</p>
            </div>
          )}
          {isAdmin && instance.flag && (
            <div className="col-span-2">
              <h4 className="text-sm font-medium text-muted-foreground">Flag</h4>
              <p className="text-sm font-mono break-all">{instance.flag}</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  if (loading && initialLoad) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-10 w-36" />
        </div>

        <div className="overflow-x-auto border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead><Skeleton className="h-4 w-32" /></TableHead>
                <TableHead><Skeleton className="h-4 w-24" /></TableHead>
                <TableHead><Skeleton className="h-4 w-32" /></TableHead>
                {isAdmin && <TableHead><Skeleton className="h-4 w-32" /></TableHead>}
                <TableHead className="text-right"><Skeleton className="h-4 w-24 ml-auto" /></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[1, 2, 3].map((i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-6 w-full max-w-[120px]" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-32" /></TableCell>
                  {isAdmin && <TableCell><Skeleton className="h-6 w-32" /></TableCell>}
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Skeleton className="h-9 w-24" />
                      <Skeleton className="h-9 w-20" />
                      <Skeleton className="h-9 w-20" />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="mb-4">
        <AlertCircle className="h-4 w-4 mr-2" />
        <div className="flex-1">
          <AlertTitle>Error loading instances</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </div>
        <div className="ml-auto flex items-center">
          <Button
            variant="outline"
            onClick={() => {
              setRetryCount(prev => prev + 1);
            }}
          >
            Retry
          </Button>
        </div>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">Challenge Instances</h2>
        <Link href="/dashboard/challenge/new">
          <Button>Create New Instance</Button>
        </Link>
      </div>

      {instances.length === 0 ? (
        <div className="border rounded-md p-6 text-center">
          <h3 className="text-lg font-medium">No instances found</h3>
          <p className="text-muted-foreground mt-1">Create a new challenge instance to get started.</p>
          <Link href="/dashboard/challenge/new" className="mt-4 inline-block">
            <Button variant="outline" className="mt-2">Create New Instance</Button>
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Challenge Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                {isAdmin && <TableHead>User</TableHead>}
                {instances.some(i => i.groupName) && <TableHead>Group</TableHead>}
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {instances.map((instance) => (
                <TableRow key={instance.id}>
                  <TableCell className="font-medium">{getScenarioName(instance)}</TableCell>
                  <TableCell>
                    <StatusBadge status={instance.status || 'Unknown'} />
                  </TableCell>
                  <TableCell>{new Date(instance.creationTime).toLocaleString()}</TableCell>
                  {isAdmin && (
                    <TableCell>{instance.userName || instance.userEmail || 'Unknown'}</TableCell>
                  )}
                  {instances.some(i => i.groupName) && (
                    <TableCell>{instance.groupName || '-'}</TableCell>
                  )}
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {instance.status?.toLowerCase() === 'running' && instance.challengeUrl && (
                        <a href={instance.challengeUrl} target="_blank" rel="noopener noreferrer">
                          <Button variant="outline" size="sm">
                            <ExternalLink className="h-4 w-4 mr-2" />
                            Access
                          </Button>
                        </a>
                      )}

                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedInstance(instance)}
                          >
                            <Info className="h-4 w-4 mr-2" />
                            Info
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle>Challenge Instance Details</DialogTitle>
                            <DialogDescription>
                              Complete information about this challenge instance.
                            </DialogDescription>
                          </DialogHeader>

                          {renderInstanceDetails(instance)}

                          <DialogFooter className="mt-6 flex justify-between items-center">
                            {instance.status?.toLowerCase() === 'running' && instance.challengeUrl && (
                              <a href={instance.challengeUrl} target="_blank" rel="noopener noreferrer" className="flex items-center">
                                <Button>
                                  <ExternalLink className="h-4 w-4 mr-2" />
                                  Access Challenge
                                </Button>
                              </a>
                            )}
                            <Button
                              variant="outline"
                              onClick={() => {
                                showToastIfOnChallengePage(
                                  'Refreshing instance status',
                                  'Checking the latest status of your instance'
                                );
                                fetchInstances();
                              }}
                            >
                              Refresh Status
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>

                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={deleteLoading[instance.id]}
                        onClick={() => handleDeleteInstance(instance.id)}
                      >
                        {deleteLoading[instance.id] ? (
                          <>
                            <Loader className="animate-spin mr-2 h-4 w-4" />
                            Deleting...
                          </>
                        ) : (
                          'Delete'
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
