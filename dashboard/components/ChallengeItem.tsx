"use client"

import React from 'react'
import { ChevronDown, ChevronUp, Trophy } from 'lucide-react'
import { Badge } from "./ui/badge"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./ui/accordion"
import { Button } from "./ui/button"
import { motion, AnimatePresence } from "framer-motion"
import { extractChallengeDescription } from "@/lib/utils"
import { useToast } from "./ui/use-toast"

interface Challenge {
  id: string;
  name: string;
  difficulty: string;
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
}

const checkUrlAvailability = async (url: string, maxAttempts = 30): Promise<boolean> => {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status !== 503) {
        return true;
      }
    } catch (error) {
      console.log(`Attempt ${attempt + 1}: URL not ready yet`);
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
  onComplete
}: ChallengeItemProps) {
  const [showCompletionAnimation, setShowCompletionAnimation] = React.useState(false);
  const [isStarting, setIsStarting] = React.useState(false);
  const description = extractChallengeDescription(challenge.AppsConfig);
  const { toast } = useToast();

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
      
      if (data.challengeUrl) {
        // Update toast to show waiting status
        toast({
          title: "Challenge Created",
          description: "Waiting for challenge environment to be ready...",
        });

        // Wait for the URL to be available
        const isAvailable = await checkUrlAvailability(data.challengeUrl);
        
        if (isAvailable) {
          toast({
            title: "Challenge Ready",
            description: "Opening challenge in a new tab...",
          });
          window.open(data.challengeUrl, '_blank');
        } else {
          toast({
            title: "Challenge Created",
            description: "Challenge is taking longer than expected to be ready. You can try accessing it manually in a few moments.",
            duration: 5000,
          });
        }
      }
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

  const handleCompleteChallenge = (challengeName: string) => {
    if (!completedChallenges.get(competitionId)?.has(challengeName)) {
      setCompletedChallenges(prev => {
        const newMap = new Map(prev);
        const competitionChallenges = newMap.get(competitionId) || new Set();
        competitionChallenges.add(challengeName);
        newMap.set(competitionId, competitionChallenges);
        return newMap;
      });
      
      // Update startedChallenges Map
      setStartedChallenges(prev => {
        const newMap = new Map(prev);
        const competitionChallenges = newMap.get(competitionId);
        if (competitionChallenges) {
          competitionChallenges.delete(challengeName);
          if (competitionChallenges.size === 0) {
            newMap.delete(competitionId);
          } else {
            newMap.set(competitionId, competitionChallenges);
          }
        }
        return newMap;
      });
      
      setShowCompletionAnimation(true);
      setTimeout(() => setShowCompletionAnimation(false), 1500);
      onComplete(challengeName);
    }
  };

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
                <Badge variant="secondary" className="bg-[#22C55E]/10 text-[#22C55E] hover:bg-[#22C55E]/20">
                  Completed
                </Badge>
              )}
              {startedChallenges.get(competitionId)?.has(challenge.name) && !challenge.completed && (
                <Badge variant="secondary" className="bg-[#22C55E]/10 text-[#22C55E] hover:bg-[#22C55E]/20">
                  In Progress
                </Badge>
              )}
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <div className="px-4 pb-4 bg-[#010301]">
            <div className="rounded-lg bg-[#0A120A] p-4 space-y-4">
              <div className="flex justify-between items-start">
                <p className="text-gray-200">{description}</p>
                <div className="flex items-center gap-2 ml-4">
                  <span className="text-sm text-gray-400">Questions completed:</span>
                  <Badge variant="secondary" className="bg-[#22C55E]/10 text-[#22C55E]">
                    {challenge.completedQuestions}/{challenge.totalQuestions}
                  </Badge>
                </div>
              </div>

              <Button 
                className="w-full mt-4"
                onClick={() => {
                  if (challenge.completed || completedChallenges.get(competitionId)?.has(challenge.name)) {
                    // Do nothing if already completed
                  } else if (startedChallenges.get(competitionId)?.has(challenge.name)) {
                    handleCompleteChallenge(challenge.name);
                  } else {
                    handleStartChallenge();
                  }
                }}
                disabled={challenge.completed || completedChallenges.get(competitionId)?.has(challenge.name) || isStarting}
              >
                {isStarting ? 'Starting Challenge...' :
                  challenge.completed || completedChallenges.get(competitionId)?.has(challenge.name)
                    ? 'Challenge Completed' 
                    : startedChallenges.get(competitionId)?.has(challenge.name)
                      ? 'Complete Challenge' 
                      : 'Start Challenge'}
              </Button>
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

