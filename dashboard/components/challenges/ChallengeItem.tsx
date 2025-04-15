"use client"

import React from 'react'
import { ChevronDown, ChevronUp, Trophy, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/ui/status-badge'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { motion, AnimatePresence } from "framer-motion"
import { useToast } from "@/components/ui/use-toast"
import { useRouter } from "next/navigation"
import { devLog } from '@/lib/logger'

interface Challenge {
  id: string;
  name: string;
  difficulty: string;
  description: string;
  AppsConfig: string;
  challengeType: {
    id: string;
    name: string;
  };
  points: number;
  completed: boolean;
  totalQuestions: number;
  completedQuestions: number;
}

interface ChallengeItemProps {
  challenge: Challenge;
  competitionId: string;
  expandedChallenge: string | null;
  setExpandedChallenge: (challenge: string | null) => void;
  startedChallenges: Map<string, Set<string>>;
  setStartedChallenges: React.Dispatch<React.SetStateAction<Map<string, Set<string>>>>;
  completedChallenges: Map<string, Set<string>>;
  setCompletedChallenges: React.Dispatch<React.SetStateAction<Map<string, Set<string>>>>;
  difficultyColors: { [key: string]: string };
  onDifficultyClick: (difficulty: string) => void;
  sortByDifficulty: "asc" | "desc" | null;
  onComplete: (challengeName: string) => void;
  activeInstance?: {
    id: string;
    challengeUrl: string;
    status: string;
    creationTime: string;
    challengeId?: string;
    competitionId?: string;
  };
  onTerminateInstance: (instanceId: string) => Promise<void>;
  hasReachedMaxInstances: boolean;
}

const checkUrlAvailability = async (url: string, maxAttempts = 30): Promise<boolean> => {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status !== 503) {
        return true;
      }
    } catch (error) {
      devLog(`Attempt ${attempt + 1}: URL not ready yet`);
    }
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds between attempts
  }
  return false;
};

export function ChallengeItem({
  challenge,
  competitionId,
  expandedChallenge,
  setExpandedChallenge,
  startedChallenges,
  setStartedChallenges,
  completedChallenges,
  setCompletedChallenges,
  difficultyColors,
  onDifficultyClick,
  sortByDifficulty,
  onComplete,
  activeInstance,
  onTerminateInstance,
  hasReachedMaxInstances
}: ChallengeItemProps) {
  const [showCompletionAnimation, setShowCompletionAnimation] = React.useState(false);
  const [isStarting, setIsStarting] = React.useState(false);
  const [isTerminating, setIsTerminating] = React.useState(false);
  const { toast } = useToast();
  const router = useRouter();

  // Use the challenge description directly, without fallback to AppConfig
  const description = challenge.description || 'No description available';
  
  // Check for an active instance of this challenge
  const isActive = !!activeInstance;
  
  // Debug logs to help troubleshoot status issues
  console.log(`Challenge ${challenge.name} (ID: ${challenge.id}):`);
  console.log(`  Has active instance: ${isActive}`);
  if (isActive) {
    console.log(`  Instance ID: ${activeInstance.id}`);
    console.log(`  Instance status: ${activeInstance.status}`);
  }
  
  // Helper flags for different instance statuses
  const isCreating = isActive && activeInstance.status?.toLowerCase().includes('creating');
  const isQueued = isActive && activeInstance.status?.toLowerCase().includes('queued');
  const isTerminatingStatus = isActive && activeInstance.status?.toLowerCase().includes('terminating');
  const isPending = isCreating || isQueued;
  
  // This will ensure instance is correctly matched with the challenge and status is shown
  console.log(`  Is Creating: ${isCreating}, Is Queued: ${isQueued}, Is Terminating: ${isTerminatingStatus}`);

  // Debug logging - log once on initial render
  React.useEffect(() => {
    console.log(`ChallengeItem ${challenge.id} (${challenge.name}):`, {
      activeInstance,
      hasInstance: !!activeInstance,
      challengeId: challenge.id
    });
  }, [challenge.id, challenge.name, activeInstance]);

  const handleStartChallenge = async () => {
    try {
      setIsStarting(true);
      const toastId = toast({
        title: "Creating Challenge",
        description: "Please wait while your challenge instance is being created...",
      });

      const response = await fetch("/api/challenges/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          challengeId: challenge.id,
          competitionId: competitionId,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to start challenge");
      }

      const data = await response.json();

      // Update startedChallenges Map
      setStartedChallenges(prev => {
        const newMap = new Map(prev);
        const competitionChallenges = newMap.get(competitionId) || new Set();
        competitionChallenges.add(challenge.name);
        newMap.set(competitionId, competitionChallenges);
        return newMap;
      });

      // Show success toast
      toast({
        title: "Challenge Created",
        description: "Your challenge is being prepared. Redirecting to challenge view...",
      });

      // Navigate to the embedded challenge view
      router.push(`/competitions/${competitionId}/challenges/${challenge.id}`);

    } catch (error) {
      console.error("Error starting challenge:", error);
      toast({
        title: "Error",
        description: "Failed to start challenge. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsStarting(false);
    }
  };

  const handleTerminateChallenge = async () => {
    if (!activeInstance) return;
    
    // Prevent double-clicks
    if (isTerminating) return;
    
    try {
      setIsTerminating(true);
      toast({
        title: "Terminating Challenge",
        description: "Please wait while your challenge instance is being terminated...",
      });

      await onTerminateInstance(activeInstance.id);
      
      toast({
        title: "Challenge Terminated",
        description: "Your challenge has been successfully terminated.",
      });
      
      // Remove from started challenges map
      setStartedChallenges(prev => {
        const newMap = new Map(prev);
        const competitionChallenges = newMap.get(competitionId) || new Set();
        competitionChallenges.delete(challenge.name);
        newMap.set(competitionId, competitionChallenges);
        return newMap;
      });
      
    } catch (error) {
      console.error("Error terminating challenge:", error);
      toast({
        title: "Error",
        description: "Failed to terminate challenge. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsTerminating(false);
    }
  };

  // When rendering the challenge status, check for active instances
  return (
    <Accordion
      type="single"
      collapsible
      value={expandedChallenge === challenge.name ? challenge.name : ""}
      onValueChange={(value) => setExpandedChallenge(value === "" ? null : value)}
    >
      <AccordionItem value={challenge.name}>
        <AccordionTrigger className="no-underline hover:no-underline">
          <div className="grid grid-cols-5 gap-4 p-4 hover:bg-[#1E2B1E]/50 transition-colors items-center w-full">
            <div>
              <div className="font-medium text-gray-200 flex items-center gap-2">
                {challenge.name}
                <ChevronDown
                  className={`h-4 w-4 challenge-chevron transition-transform duration-200`}
                  data-state={expandedChallenge === challenge.name ? "open" : "closed"}
                  style={{
                    transform: expandedChallenge === challenge.name ? 'rotate(180deg)' : 'rotate(0deg)'
                  }}
                />
              </div>
            </div>
            <div className="flex items-center text-gray-400">{challenge.challengeType.name}</div>
            <div>
              <Badge
                variant="secondary"
                className={`${difficultyColors[challenge.difficulty]} cursor-pointer flex items-center gap-1 w-fit`}
                onClick={(e) => {
                  e.stopPropagation();
                  onDifficultyClick(challenge.difficulty);
                }}
              >
                {challenge.difficulty}
                {sortByDifficulty && (
                  sortByDifficulty === "asc" ? (
                    <ChevronUp className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )
                )}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-gray-400">
              <Trophy className="h-4 w-4 text-yellow-500" />
              <span>{challenge.points} points</span>
            </div>
            <div className="flex items-center justify-end gap-2">
              {(challenge.completed || completedChallenges.get(competitionId)?.has(challenge.name)) && (
                <StatusBadge status="completed" />
              )}
              {isActive && (
                <div className="flex items-center gap-2">
                  <StatusBadge 
                    status={
                      isCreating ? "pending" : 
                      isQueued ? "info" : 
                      isTerminatingStatus ? "warning" : 
                      "success"
                    } 
                    customText={
                      isCreating ? "Creating" : 
                      isQueued ? "Queued" : 
                      isTerminatingStatus ? "Terminating" : 
                      "Active"
                    } 
                  />
                  {!isTerminatingStatus && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTerminateChallenge();
                      }}
                      disabled={isTerminating}
                      className="h-6 px-2 py-0 text-xs"
                    >
                      {isTerminating ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        'Terminate'
                      )}
                    </Button>
                  )}
                </div>
              )}
              {!isActive && startedChallenges.get(competitionId)?.has(challenge.name) && !challenge.completed && (
                <StatusBadge status="pending" customText="In Progress" />
              )}
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <div className="px-4 pb-4 bg-[#010301]">
            <div className="rounded-lg bg-[#0A120A] p-4 space-y-4">
              <div className="flex justify-between items-start">
                <p className="text-gray-200">
                  {description}
                </p>
                <div className="flex items-center gap-2 ml-4">
                  <span className="text-sm text-gray-400">Questions completed:</span>
                  <StatusBadge
                    status={challenge.completedQuestions === challenge.totalQuestions ? "completed" : "info"}
                    customText={`${challenge.completedQuestions}/${challenge.totalQuestions}`}
                  />
                </div>
              </div>

              <div className="flex gap-2 mt-4">
                {isActive ? (
                  <>
                    <Button
                      className="flex-1"
                      onClick={() => router.push(`/competitions/${competitionId}/challenges/${challenge.id}`)}
                      disabled={isPending || isTerminatingStatus}
                    >
                      {isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Preparing Challenge...
                        </>
                      ) : (
                        'Continue Challenge'
                      )}
                    </Button>
                    <Button
                      className="w-auto"
                      variant="destructive"
                      onClick={handleTerminateChallenge}
                      disabled={isTerminating || isTerminatingStatus}
                    >
                      {isTerminating || isTerminatingStatus ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Terminating...
                        </>
                      ) : (
                        'Terminate'
                      )}
                    </Button>
                  </>
                ) : (
                  <Button
                    className="w-full"
                    onClick={() => {
                      if (challenge.completed || completedChallenges.get(competitionId)?.has(challenge.name)) {
                        // Do nothing if already completed
                      } else {
                        handleStartChallenge();
                      }
                    }}
                    disabled={
                      challenge.completed || 
                      completedChallenges.get(competitionId)?.has(challenge.name) || 
                      isStarting || 
                      hasReachedMaxInstances
                    }
                  >
                    {isStarting ? 'Starting Challenge...' :
                      challenge.completed || completedChallenges.get(competitionId)?.has(challenge.name)
                        ? 'Challenge Completed'
                        : hasReachedMaxInstances
                          ? 'Maximum Active Challenges Reached'
                          : startedChallenges.get(competitionId)?.has(challenge.name)
                            ? 'Complete Challenge'
                            : 'Start Challenge'}
                  </Button>
                )}
              </div>
              
              {hasReachedMaxInstances && !isActive && (
                <p className="text-sm text-amber-500 mt-2">
                  You have reached the maximum of 3 active challenges. Terminate an existing challenge to start a new one.
                </p>
              )}
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
      <AnimatePresence>
        {showCompletionAnimation && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none"
          >
            <div className="bg-[#22C55E] text-white px-6 py-3 rounded-lg text-xl font-bold shadow-lg">
              Challenge Completed!
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Accordion>
  );
}

