'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, ExternalLink, Loader2, ChevronRight, ChevronLeft, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { extractChallengeDescription } from '@/lib/utils';
import { devLog } from '@/lib/logger';
import { motion } from 'framer-motion';

interface Challenge {
  id: string;
  name: string;
  description: string | null;
  difficulty?: "EASY" | "MEDIUM" | "HARD" | "EXPERT" | null;
  challengeTypeId: string;
  challengeType: {
    name: string;
    id: string;
  };
  cdf_content?: any;
  appConfigs?: Array<{
    id: string;
    challengeId: string;
    appId: string;
    title: string;
    icon: string;
    width: number;
    height: number;
    screen: string;
    disabled: boolean;
    favourite: boolean;
    desktop_shortcut: boolean;
    launch_on_startup: boolean;
    additional_config: any;
  }>;
}

interface ChallengeInstance {
  id: string;
  challengeUrl: string;
  status: string;
  creationTime: Date;
}

interface ChallengeEmbeddedViewProps {
  competitionId: string;
  challenge: Challenge;
  challengeInstance: ChallengeInstance;
}

// Function to check if a URL is accessible through our backend proxy
const checkUrlAvailability = async (url: string, maxAttempts = 40): Promise<boolean> => {
  if (url === 'pending...' || !url || url === '#') {
    return false;
  }
  
  devLog(`Checking URL availability: ${url}`);
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      // Use our own API endpoint that will check the URL on the server side
      // This avoids CORS issues when checking from the browser
      const response = await fetch(`/api/challenges/check-url?url=${encodeURIComponent(url)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store'
        },
        cache: 'no-store',
        next: { revalidate: 0 }
      });
      
      // Log the response status for debugging
      devLog(`Attempt ${attempt + 1}: Status ${response.status}`);
      
      if (response.ok) {
        const result = await response.json();
        
        // The API returns { available: boolean, status: number, message: string }
        if (result.available) {
          devLog(`URL is available with status ${result.status}`);
          return true;
        }
        
        // If specific status codes are returned, handle them
        if (result.status === 404) {
          devLog('Service returned 404, might need longer to initialize');
        } else if (result.status === 503 || result.status === 502 || result.status === 504) {
          devLog(`Service unavailable (${result.status}), waiting to retry...`);
        }
      }
    } catch (error: any) {
      // Could be a network error or API error
      devLog(`Attempt ${attempt + 1} error: ${error.message || 'Unknown error'}`);
    }
    
    // Progressively increase the wait time between retries, but with shorter times
    const waitTime = Math.min(800 + (attempt * 200), 2000); // Start at 800ms, max 2s
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  
  devLog('URL availability check failed after maximum attempts');
  return false;
};

// Function to check if a challenge has been successfully accessed before
const checkChallengeAccessed = async (instanceId: string): Promise<boolean> => {
  try {
    const response = await fetch(`/api/challenges/challenge-access-tracking?instanceId=${instanceId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store'
      },
      cache: 'no-store',
      next: { revalidate: 0 }
    });
    
    if (!response.ok) {
      console.error(`Error checking challenge access: ${response.status}`);
      return false;
    }
    
    const data = await response.json();
    return Boolean(data.accessed);
  } catch (error) {
    console.error('Error checking challenge access:', error);
    return false;
  }
};

// Function to mark a challenge as successfully accessed
const markChallengeAccessed = async (instanceId: string): Promise<boolean> => {
  try {
    const response = await fetch('/api/challenges/challenge-access-tracking', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ instanceId })
    });
    
    if (!response.ok) {
      console.error(`Error marking challenge as accessed: ${response.status}`);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error marking challenge as accessed:', error);
    return false;
  }
};

// Function to clear challenge access tracking
const clearChallengeAccessed = async (instanceId: string): Promise<boolean> => {
  try {
    const response = await fetch(`/api/challenges/challenge-access-tracking?instanceId=${instanceId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      console.error(`Error clearing challenge access: ${response.status}`);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error clearing challenge access:', error);
    return false;
  }
};

export function ChallengeEmbeddedView({
  competitionId,
  challenge,
  challengeInstance,
}: ChallengeEmbeddedViewProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isCheckingUrl, setIsCheckingUrl] = useState(false);
  const [challengeUrl, setChallengeUrl] = useState(challengeInstance.challengeUrl);
  const [pollCount, setPollCount] = useState(0);
  const [lastPolled, setLastPolled] = useState(Date.now());
  const [urlCheckAttempts, setUrlCheckAttempts] = useState(0);
  const [urlAvailable, setUrlAvailable] = useState(false);
  const [loadingStartTime] = useState(Date.now());
  const [iframeError, setIframeError] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  
  // Check if this challenge was previously loaded to avoid loading screen on refresh
  useEffect(() => {
    // Check if we've previously loaded this challenge successfully using Redis
    const checkPreviousAccess = async () => {
      const wasAccessed = await checkChallengeAccessed(challengeInstance.id);
      
      // If we've loaded this challenge before and have a valid URL, skip loading screen
      if (wasAccessed && challengeInstance.challengeUrl && challengeInstance.challengeUrl !== 'pending...') {
        devLog(`Challenge was previously accessed: ${challengeInstance.id}`);
        setIsLoading(false);
        setUrlAvailable(true);
        setPollCount(1); // Set to non-zero to avoid failsafe retry
        
        // Even if accessed previously, check the URL availability once to verify it's still working
        // but don't show loading indicator during this check
        setTimeout(() => {
          checkUrlAvailability(challengeInstance.challengeUrl, 3).then(available => {
            if (!available) {
              // If URL is no longer available, show error and reset state
              devLog('Previously available URL is no longer accessible. Clearing access record...');
              clearChallengeAccessed(challengeInstance.id);
              setIframeError(true);
              setTimeout(handleRetry, 2000);
            }
          });
        }, 1000);
      }
    };
    
    checkPreviousAccess();
  }, [challengeInstance.id, challengeInstance.challengeUrl]);
  
  // Simply use the description directly from the challenge
  const description = challenge.description || 'No description available';
  
  // Get the challenge type and difficulty
  const challengeType = challenge.challengeType?.name || 'Unknown';
  const difficulty = challenge.difficulty || 'MEDIUM'; // Use the actual difficulty with fallback
  
  // Log challenge values only once during initial load, not on every render
  useEffect(() => {
    // Only log in development mode
    if (process.env.NODE_ENV === 'development') {
      console.log("Challenge values used in UI:", {
        id: challenge.id,
        name: challenge.name,
        description,
        difficulty,
        challengeType
      });
    }
  }, [challenge.id]); // Only run once when the component mounts or challenge ID changes
  
  // Function to manually retry loading the challenge
  const handleRetry = async () => {
    // Clear the challenge access tracking
    await clearChallengeAccessed(challengeInstance.id);
    
    setIsLoading(true);
    setPollCount(0);
    setUrlCheckAttempts(0);
    setUrlAvailable(false);
    setIframeError(false);
    await checkStatus();
  };

  // Function to handle iframe load error (like 404 or 503)
  const handleIframeError = (errorType = 'unknown') => {
    console.log(`Iframe error detected: ${errorType}`);
    setIframeError(true);
    
    // Show appropriate toast based on error type
    if (errorType.includes('503')) {
      toast.info('Challenge environment is still initializing. Reconnecting...', {
        duration: 3000,
      });
    } else if (errorType.includes('404')) {
      toast.warning('Challenge URL not found. Attempting to reconnect...', {
        duration: 3000,
      });
    }
    
    // Wait a moment and then retry
    setTimeout(() => {
      handleRetry();
    }, 3000);
  };

  // Handle iframe onError event
  const handleIframeOnError = (event: React.SyntheticEvent<HTMLIFrameElement, Event>) => {
    console.log("Iframe onError event triggered");
    handleIframeError('unknown');
  };

  const checkStatus = async () => {
    try {
      // Use devLog instead of console.log to reduce spam
      devLog(`Checking status for instance ${challengeInstance.id}...`);
      const response = await fetch(`/api/challenges/status?instanceId=${challengeInstance.id}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store'
        },
        cache: 'no-store',
        next: { revalidate: 0 }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch challenge status: ${response.status}`);
      }
      
      const data = await response.json();
      setLastPolled(Date.now());
      
      // Log the full response only in development
      if (process.env.NODE_ENV === 'development') {
        devLog(`Status check response for ${challengeInstance.id}:`, data);
      }
      
      // Always increment the poll count to show activity
      setPollCount(prev => prev + 1);
      
      // If we have a real URL (not pending)
      if (data.challengeUrl && data.challengeUrl !== 'pending...' && data.challengeUrl !== challengeUrl) {
        setChallengeUrl(data.challengeUrl);
        devLog(`Found challenge URL: ${data.challengeUrl}`);
        
        // Check URL availability regardless of status
        if (!urlAvailable && !isCheckingUrl) {
          setIsCheckingUrl(true);
          setUrlCheckAttempts(prev => prev + 1);
          
          devLog(`Starting URL availability check attempt ${urlCheckAttempts + 1} for ${data.challengeUrl}`);
          // Try more attempts for proper URL checking (40 attempts)
          const isAvailable = await checkUrlAvailability(data.challengeUrl, 40);
          
          if (isAvailable) {
            devLog(`URL is available: ${data.challengeUrl}`);
            setUrlAvailable(true);
            setIsLoading(false);
            toast.success('Challenge is ready!');
          } else {
            // URL exists but is not yet available
            devLog(`URL is not yet available: ${data.challengeUrl}`);
            setIsCheckingUrl(false);
            setIsLoading(true);
            if (urlCheckAttempts >= 5) {
              toast.error('Challenge environment is taking longer than expected to initialize');
            }
          }
        }
      } else if (data.status === 'ERROR') {
        devLog(`Challenge in ERROR state: ${challengeInstance.id}`);
        setIsLoading(false);
        toast.error('Failed to start challenge');
      } else if (data.challengeUrl === 'pending...' || data.status === 'CREATING' || data.status === 'QUEUED') {
        // Still waiting, continue polling
        devLog(`Challenge still initializing: ${challengeInstance.id}, status: ${data.status}`);
        setIsLoading(true);
      } else if (urlAvailable) {
        // We already validated the URL is available
        devLog(`Challenge is ready: ${challengeInstance.id}`);
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Error checking challenge status:', error);
      
      // Always increment poll count even on error to show activity
      setPollCount(prev => prev + 1);
      
      // Don't give up on errors - keep polling but with a friendlier message
      if (pollCount > 10) {
        toast.error('Having trouble communicating with the challenge service. Still trying...');
      }
    }
  };

  useEffect(() => {
    // Initial check only if not previously accessed
    if ((challengeUrl === 'pending...' || isLoading || !urlAvailable)) {
      const checkInitialStatus = async () => {
        // Only check status if not previously accessed
        const wasAccessed = await checkChallengeAccessed(challengeInstance.id);
        if (!wasAccessed) {
          checkStatus();
        }
      };
      
      checkInitialStatus();
    }

    // Set up polling interval only if needed
    const interval = setInterval(async () => {
      // Check if this challenge was previously accessed
      const wasAccessed = await checkChallengeAccessed(challengeInstance.id);
                        
      // Only poll if the challenge is not previously accessed or there's an iframe error
      if ((challengeUrl === 'pending...' || isLoading || !urlAvailable || iframeError) && 
          (!wasAccessed || iframeError)) {
        const pollingInterval = 1000; // Poll every second
        const timeSinceLastPoll = Date.now() - lastPolled;
        
        // Ensure polling happens regularly even if checks are taking time
        if (timeSinceLastPoll >= pollingInterval && !isCheckingUrl) {
          checkStatus();
        }
      }
    }, 1000); // Check every second

    // Failsafe - force a retry after 20 seconds if nothing is happening
    const failsafeTimer = setTimeout(() => {
      if (pollCount === 0) {
        devLog("Failsafe timer triggered - forcing a retry");
        setPollCount(1); // Update to trigger state change
        checkStatus();
      }
    }, 20000);

    return () => {
      clearInterval(interval);
      clearTimeout(failsafeTimer);
    };
  }, [challengeInstance.id, challengeUrl, isLoading, pollCount, lastPolled, urlAvailable, isCheckingUrl, urlCheckAttempts, iframeError]);

  // Monitor iframe for 404 errors - refresh page if iframe shows 404
  useEffect(() => {
    if (!isLoading && urlAvailable && iframeRef.current) {
      // Mark this challenge as successfully accessed in Redis
      markChallengeAccessed(challengeInstance.id);
      
      // Setup a mutation observer to detect changes in the iframe content
      const handleIframeLoad = () => {
        try {
          // Try to access iframe content - will throw error if cross-origin
          const iframe = iframeRef.current;
          
          // Check if we can access iframe document (same-origin)
          if (iframe?.contentDocument) {
            // Check if the title or content suggests a 404 or 503
            const title = iframe.contentDocument.title.toLowerCase();
            const bodyText = iframe.contentDocument.body.innerText.toLowerCase();
            
            if (title.includes('404') || 
                title.includes('not found') || 
                bodyText.includes('404 not found') ||
                bodyText.includes('page not found') ||
                title.includes('503') ||
                title.includes('service unavailable') ||
                bodyText.includes('503 service unavailable') ||
                bodyText.includes('temporarily unavailable') ||
                bodyText.includes('service is unavailable')) {
              
              const errorType = title.includes('503') || bodyText.includes('503') || 
                               bodyText.includes('service unavailable') || 
                               bodyText.includes('temporarily unavailable') 
                               ? '503' : '404';
              
              console.log(`Error detected in iframe: ${errorType === '503' ? '503 Service Unavailable' : '404 Not Found'}`);
              handleIframeError(errorType);
            }
          }
        } catch (error) {
          // Cross-origin access will cause an error - we can't detect 404 in this case
          console.log("Cannot access iframe content due to cross-origin policy");
        }
      };
      
      if (iframeRef.current) {
        iframeRef.current.addEventListener('load', handleIframeLoad);
      }
      
      return () => {
        if (iframeRef.current) {
          iframeRef.current.removeEventListener('load', handleIframeLoad);
        }
      };
    }
  }, [isLoading, urlAvailable, challengeInstance.id]);

  const toggleSidebar = () => {
    setIsSidebarCollapsed(!isSidebarCollapsed);
  };
  
  return (
    <div className="container-fluid px-2 py-2 h-[calc(100vh-32px)] overflow-hidden flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <Link href={`/competitions/${competitionId}/challenges`} className="inline-flex items-center">
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Challenges
          </Button>
        </Link>
        <h1 className="text-xl font-bold">{challenge.name}</h1>
        <Button variant="outline" size="sm" onClick={toggleSidebar}>
          {isSidebarCollapsed ? 
            <><ChevronRight className="mr-2 h-4 w-4" />Show Info</> : 
            <><ChevronLeft className="mr-2 h-4 w-4" />Hide Info</>
          }
        </Button>
      </div>

      <div className="grid gap-2 flex-grow grid-cols-6">
        <motion.div 
          className={`h-full overflow-auto transition-all duration-300 ease-in-out ${isSidebarCollapsed ? 'col-span-0 w-0 opacity-0 hidden' : 'col-span-1'}`}
          initial={{ width: 'auto', opacity: 1 }}
          animate={{ 
            width: isSidebarCollapsed ? 0 : 'auto',
            opacity: isSidebarCollapsed ? 0 : 1,
            marginRight: isSidebarCollapsed ? 0 : undefined
          }}
          transition={{ duration: 0.3 }}
        >
          <Card className="h-full">
            <CardHeader className="py-3">
              <CardTitle>Challenge Info</CardTitle>
              <CardDescription>
                {challengeType} • {difficulty}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <h3 className="font-medium mb-1">Description</h3>
                  <p className="text-sm text-muted-foreground">{description}</p>
                </div>

                <div>
                  <h3 className="font-medium mb-1">Instructions</h3>
                  <p className="text-sm text-muted-foreground">
                    Complete the tasks in this challenge to earn points. 
                    You can view your progress in the dashboard.
                  </p>
                </div>

                <Button
                  className="w-full mt-4"
                  variant="outline"
                  onClick={() => window.open(challengeUrl, '_blank')}
                  disabled={isLoading || challengeUrl === 'pending...' || !urlAvailable}
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open in New Tab
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <div className={`${isSidebarCollapsed ? 'col-span-6' : 'col-span-5'} h-full bg-black rounded-lg overflow-hidden border border-border relative transition-all duration-300`}>
          {isLoading || challengeUrl === 'pending...' || !urlAvailable || iframeError ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
              <h3 className="text-lg font-medium">
                {iframeError ? "Reconnecting to Challenge" : 
                 isCheckingUrl ? "Testing Challenge Environment" : 
                 "Preparing Your Challenge"}
              </h3>
              <p className="text-sm text-muted-foreground mt-2">
                {iframeError ? "We detected an issue with your challenge. Reconnecting..."
                  : challengeUrl === 'pending...' 
                  ? "Your challenge is being deployed. This may take a minute..."
                  : isCheckingUrl 
                    ? "We're checking if your challenge environment is ready..."
                    : "We're finalizing your challenge environment..."}
              </p>
              
              {Date.now() - loadingStartTime > 15000 && (
                <div className="mt-6 flex flex-col items-center">
                  <p className="text-sm text-amber-500 mb-2">
                    This is taking longer than expected. You can try again later.
                  </p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleRetry}
                    className="mt-2"
                    disabled={isCheckingUrl}
                  >
                    <RefreshCw className={`mr-2 h-4 w-4 ${isCheckingUrl ? 'animate-spin' : ''}`} />
                    Retry
                  </Button>
                </div>
              )}
              
              <p className="text-xs text-muted-foreground mt-4">
                {iframeError ? "Reconnection in progress..."
                  : isCheckingUrl 
                  ? `URL check attempt: ${urlCheckAttempts}` 
                  : `Deployment poll count: ${pollCount}`}
              </p>
            </div>
          ) : (
            <div className="w-full h-full aspect-preserve">
              <iframe
                ref={iframeRef}
                src={challengeUrl}
                className="w-full h-full border-0"
                title={`Challenge: ${challenge.name}`}
                sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-popups-to-escape-sandbox"
                allow="fullscreen"
                style={{ aspectRatio: 'auto' }}
                onError={handleIframeOnError}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 