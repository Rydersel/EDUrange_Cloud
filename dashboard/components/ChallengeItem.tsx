"use client"

import React from 'react'
import { ChevronDown, ChevronUp, Trophy } from 'lucide-react'
import { Badge } from "../components/ui/badge"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../components/ui/accordion"
import { Button } from "../components/ui/button"
import { motion, AnimatePresence } from "framer-motion"
import { extractChallengeDescription, extractChallengePoints } from "@/lib/utils"

interface Challenge {
  id: string;
  name: string;
  difficulty: string;
  AppsConfig: string;
  challengeType: {
    id: string;
    name: string;
  };
}

interface ChallengeItemProps {
  challenge: Challenge;
  expandedChallenge: string | null;
  setExpandedChallenge: (challenge: string | null) => void;
  startedChallenges: Set<string>;
  setStartedChallenges: ((challenges: Set<string>) => void) & ((prev: (prev: Set<string>) => Set<string>) => void);
  completedChallenges: Set<string>;
  setCompletedChallenges: (challenges: Set<string>) => void;
  difficultyColors: { [key: string]: string };
  onDifficultyClick: (difficulty: string) => void;
  sortByDifficulty: "asc" | "desc" | null;
  onComplete: (challengeName: string) => void;
}

export function ChallengeItem({
  challenge,
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
  const description = extractChallengeDescription(challenge.AppsConfig);
  const points = extractChallengePoints(challenge.AppsConfig);

  const handleStartChallenge = (challengeName: string) => {
    setStartedChallenges(new Set(startedChallenges).add(challengeName));
  };

  const handleCompleteChallenge = (challengeName: string) => {
    if (!completedChallenges.has(challengeName)) {
      setCompletedChallenges(new Set(completedChallenges).add(challengeName));
      setStartedChallenges((prev: Set<string>) => {
        const newSet = new Set(prev);
        newSet.delete(challengeName);
        return newSet;
      });
      setShowCompletionAnimation(true);
      setTimeout(() => setShowCompletionAnimation(false), 1500);
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
              <span>{points} points</span>
            </div>
            <div className="flex items-center justify-end gap-2">
              {completedChallenges.has(challenge.name) && (
                <Badge variant="secondary" className="bg-[#22C55E]/10 text-[#22C55E] hover:bg-[#22C55E]/20">
                  Completed
                </Badge>
              )}
              {startedChallenges.has(challenge.name) && (
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
              <p className="text-gray-200">{description}</p>

              <Button 
                className="w-full mt-4"
                onClick={() => {
                  if (completedChallenges.has(challenge.name)) {
                    // Do nothing if already completed
                  } else if (startedChallenges.has(challenge.name)) {
                    handleCompleteChallenge(challenge.name);
                  } else {
                    handleStartChallenge(challenge.name);
                  }
                }}
                disabled={completedChallenges.has(challenge.name)}
              >
                {completedChallenges.has(challenge.name) 
                  ? 'Challenge Completed' 
                  : startedChallenges.has(challenge.name) 
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

