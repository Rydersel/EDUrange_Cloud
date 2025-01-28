"use client"

import React, { useState } from 'react'
import { Star, User, ChevronDown, Trophy, Clock, Target, Tags, ChevronUp } from 'lucide-react'
import { Badge } from "../components/ui/badge"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../components/ui/accordion"
import { Progress } from "@/components/ui/progress"
import { Button } from "../components/ui/button"
import { Challenge } from "../types/challenge"
import { motion, AnimatePresence } from "framer-motion"

interface ChallengeItemProps {
  challenge: Challenge
  expandedChallenge: string | null
  setExpandedChallenge: (challenge: string | null) => void
  startedChallenges: Set<string>
  setStartedChallenges: ((challenges: Set<string>) => void) & ((prev: (prev: Set<string>) => Set<string>) => void)
  completedChallenges: Set<string>
  setCompletedChallenges: (challenges: Set<string>) => void
  challengeRatings: { [key: string]: number }
  setChallengeRatings: (ratings: { [key: string]: number }) => void
  difficultyColors: { [key: string]: string }
  onDifficultyClick: (difficulty: string) => void
  sortByDifficulty: "asc" | "desc" | null
  onComplete: (challengeName: string) => void
}

export function ChallengeItem({
  challenge,
  expandedChallenge,
  setExpandedChallenge,
  startedChallenges,
  setStartedChallenges,
  completedChallenges,
  setCompletedChallenges,
  challengeRatings,
  setChallengeRatings,
  difficultyColors,
  onDifficultyClick,
  sortByDifficulty,
  onComplete
}: ChallengeItemProps) {
  const [hoveredStars, setHoveredStars] = useState<number>(0)
  const [showCompletionAnimation, setShowCompletionAnimation] = useState(false)

  const handleStartChallenge = (challengeName: string) => {
    setStartedChallenges(new Set(startedChallenges).add(challengeName))
  }

  const handleCompleteChallenge = (challengeName: string) => {
    if (!completedChallenges.has(challengeName)) {
      setCompletedChallenges(new Set(completedChallenges).add(challengeName))
      setStartedChallenges((prev: Set<string>) => {
        const newSet = new Set(prev)
        newSet.delete(challengeName)
        return newSet
      })
      setShowCompletionAnimation(true)
      setTimeout(() => setShowCompletionAnimation(false), 1500)
    }
  }

  const handleRatingChange = (challengeName: string, rating: number) => {
    setChallengeRatings({ ...challengeRatings, [challengeName]: rating })
  }

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
              <div className="flex items-center gap-2 mt-1">
                <Badge 
                  variant="secondary" 
                  className={`${difficultyColors[challenge.difficulty]} cursor-pointer flex items-center gap-1`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onDifficultyClick(challenge.difficulty)
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
            </div>
            <div className="flex items-center text-gray-400">{challenge.category}</div>
            <div className="flex items-center gap-2">
              <span className="text-gray-200">{challenge.rating.toFixed(1)}</span>
              <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
              <span className="text-sm text-gray-400">({challenge.ratingCount})</span>
            </div>
            <div className="flex items-center gap-2 text-gray-400">
              <User className="h-4 w-4" />
              <span>{challenge.solves.toLocaleString()}</span>
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
              <p className="text-gray-200">{challenge.description}</p>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-yellow-500" />
                  <span className="text-sm text-gray-400">Points:</span>
                  <span className="text-sm text-gray-200">{challenge.points}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-blue-500" />
                  <span className="text-sm text-gray-400">Estimated Time:</span>
                  <span className="text-sm text-gray-200">{challenge.timeEstimate}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-green-500" />
                  <span className="text-sm text-gray-400">Success Rate:</span>
                  <span className="text-sm text-gray-200">{challenge.successRate}%</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Tags className="h-4 w-4 text-gray-400" />
                  <span className="text-sm text-gray-400">Tags:</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {challenge.tags.map((tag) => (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className="bg-gray-800 text-gray-300 hover:bg-gray-700"
                    >
                      {tag}
                    </Badge>
                  ))}
                  {completedChallenges.has(challenge.name) && (
                    <div className="flex items-center ml-2 star-rating">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          onClick={() => handleRatingChange(challenge.name, star)}
                          onMouseEnter={() => setHoveredStars(star)}
                          onMouseLeave={() => setHoveredStars(0)}
                          className={`text-sm transition-colors ${
                            (hoveredStars || challengeRatings[challenge.name] || 0) >= star
                              ? 'text-yellow-500'
                              : 'text-gray-400 hover:text-yellow-300'
                          }`}
                        >
                          ★
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Completion Rate</span>
                  <span className="text-gray-200">{challenge.successRate}%</span>
                </div>
                <Progress value={challenge.successRate} className="h-2 [&>div]:bg-green-500" />
              </div>

              <Button 
                className="w-full mt-4"
                onClick={() => {
                  if (completedChallenges.has(challenge.name)) {
                    // Do nothing if already completed
                  } else if (startedChallenges.has(challenge.name)) {
                    handleCompleteChallenge(challenge.name)
                  } else {
                    handleStartChallenge(challenge.name)
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
  )
}

