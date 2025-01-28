"use client"

import { useState, useMemo } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Challenge } from "@/types/challenge"
import { ChallengeItem } from "./ChallengeItem"
import { Navigation } from "./Navigation"
import { SearchAndFilters } from "./SearchAndFilters"
import { HideCompletedToggle } from "./HideCompletedToggle"
import { DancingFrog } from "./DancingFrog"
import { Confetti } from "./Confetti"

const difficultyColors = {
  "Very Easy": "bg-[#22C55E]/10 text-[#22C55E] hover:bg-[#22C55E]/20",
  "Easy": "bg-[#22C55E]/10 text-[#22C55E] hover:bg-[#22C55E]/20",
  "Medium": "bg-[#22C55E]/10 text-[#22C55E] hover:bg-[#22C55E]/20",
  "Hard": "bg-[#22C55E]/10 text-[#22C55E] hover:bg-[#22C55E]/20",
  "Very Hard": "bg-[#22C55E]/10 text-[#22C55E] hover:bg-[#22C55E]/20"
};

const challenges: Challenge[] = [
  {
    name: "brevi moduli",
    difficulty: "Very Easy",
    category: "Crypto",
    rating: 5.0,
    ratingCount: 2,
    solves: 293,
    description: "A simple cryptographic challenge involving modular arithmetic. Can you break the code?",
    points: 100,
    timeEstimate: "30-60 min",
    tags: ["cryptography", "math", "beginner"],
    successRate: 78
  },
  {
    name: "SpookyPass",
    difficulty: "Easy",
    category: "Reversing",
    rating: 4.7,
    ratingCount: 15,
    solves: 1461,
    description: "Reverse engineer this spooky password checker and find the flag hidden within.",
    points: 150,
    timeEstimate: "45-90 min",
    tags: ["reverse-engineering", "binary", "passwords"],
    successRate: 65
  },
  {
    name: "Flag Command",
    difficulty: "Medium",
    category: "Web",
    rating: 4.7,
    ratingCount: 42,
    solves: 4124,
    description: "A web challenge that tests your understanding of command injection vulnerabilities.",
    points: 125,
    timeEstimate: "15-30 min",
    tags: ["web", "injection", "commands"],
    successRate: 82
  },
  {
    name: "sekur julius",
    difficulty: "Hard",
    category: "Crypto",
    rating: 5.0,
    ratingCount: 1,
    solves: 139,
    description: "A special challenge featuring a twist on the classic Caesar cipher.",
    points: 200,
    timeEstimate: "60-90 min",
    tags: ["cryptography", "classical"],
    successRate: 45
  },
]

const difficultyOrder = ["Very Easy", "Easy", "Medium", "Hard", "Very Hard"];

export function ChallengeList() {
  const [filter, setFilter] = useState("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [hideCompleted, setHideCompleted] = useState(false)
  const [expandedChallenge, setExpandedChallenge] = useState<string | null>(null)
  const [startedChallenges, setStartedChallenges] = useState<Set<string>>(new Set())
  const [completedChallenges, setCompletedChallenges] = useState<Set<string>>(new Set())
  const [challengeRatings, setChallengeRatings] = useState<{ [key: string]: number }>({})
  const [selectedDifficulty, setSelectedDifficulty] = useState("all")
  const [selectedCategory, setSelectedCategory] = useState("all")
  const [sortByDifficulty, setSortByDifficulty] = useState<"asc" | "desc" | null>(null)
  const [showFrog, setShowFrog] = useState(false)
  const [showConfetti, setShowConfetti] = useState(false)
  const [titleClickCount, setTitleClickCount] = useState(0)
  const [isAnimating, setIsAnimating] = useState(false)
  const [lastClickTime, setLastClickTime] = useState<number>(0)

  const handleTitleClick = (e: React.MouseEvent) => {
    e.stopPropagation() // Prevent click from bubbling up
    if (isAnimating) return // Don't count clicks while animation is playing

    const currentTime = Date.now()
    if (currentTime - lastClickTime > 3000) { // Reset if more than 3 seconds have passed
      setTitleClickCount(1)
    } else {
      setTitleClickCount(prev => prev + 1)
    }
    setLastClickTime(currentTime)

    if (titleClickCount + 1 === 3) { // Check against the value it will be after increment
      setIsAnimating(true)
      setShowFrog(true)
      setShowConfetti(true)

      // Confetti duration is 8 seconds
      setTimeout(() => {
        setShowConfetti(false)
      }, 8000)

      // Calculate frog animation duration
      const totalDistance = window.innerWidth + 200
      const timePerHop = 100 // ms
      const distancePerHop = 75/4 // px
      const totalHops = Math.ceil(totalDistance / distancePerHop)
      const standingFramesTime = 300 // 3 frames * 100ms
      const jumpFramesTime = 500 // 5 frames * 100ms
      const cycleTime = standingFramesTime + jumpFramesTime
      const totalCycles = Math.ceil(totalHops / 4) // 4 position updates per jump cycle
      const frogDuration = totalCycles * cycleTime + 2000 // Add 2 second buffer

      setTimeout(() => {
        setShowFrog(false)
        setIsAnimating(false) // Allow reactivation after both animations complete
      }, frogDuration)

      setTitleClickCount(0)
    }
  }

  const filteredChallenges = useMemo(() => {
    let filtered = challenges.filter(challenge => {
      const matchesSearch = challenge.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            challenge.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            challenge.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
      const matchesDifficulty = selectedDifficulty === "all" || challenge.difficulty.toLowerCase() === selectedDifficulty
      const matchesCategory = selectedCategory === "all" || challenge.category.toLowerCase() === selectedCategory.toLowerCase()
      const matchesCompletion = !hideCompleted || !completedChallenges.has(challenge.name)

      return matchesSearch && matchesDifficulty && matchesCategory && matchesCompletion
    })

    if (sortByDifficulty) {
      filtered.sort((a, b) => {
        const indexA = difficultyOrder.indexOf(a.difficulty)
        const indexB = difficultyOrder.indexOf(b.difficulty)
        return sortByDifficulty === "asc" ? indexA - indexB : indexB - indexA
      })
    }

    return filtered
  }, [searchQuery, selectedDifficulty, selectedCategory, hideCompleted, completedChallenges, sortByDifficulty])

  const handleDifficultyClick = (difficulty: string) => {
    if (selectedDifficulty === difficulty) {
      setSortByDifficulty(sortByDifficulty === "asc" ? "desc" : "asc")
    } else {
      setSelectedDifficulty(difficulty.toLowerCase())
      setSortByDifficulty("asc")
    }
  }

  const handleChallengeComplete = (challengeName: string) => {
    setCompletedChallenges(prev => {
      const newSet = new Set(prev)
      newSet.add(challengeName)
      return newSet
    })

  }

  return (
    <div>
      <Navigation filter={filter} setFilter={setFilter} />
      <SearchAndFilters
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        selectedDifficulty={selectedDifficulty}
        setSelectedDifficulty={setSelectedDifficulty}
        selectedCategory={selectedCategory}
        setSelectedCategory={setSelectedCategory}
        sortByDifficulty={sortByDifficulty}
      />
      <HideCompletedToggle hideCompleted={hideCompleted} setHideCompleted={setHideCompleted} />
      <div className="rounded-lg border border-[#1E2B1E] overflow-hidden">
        <div className="grid grid-cols-5 gap-4 bg-[#0A120A] p-4 text-sm font-medium text-gray-400">
          <div
            className="cursor-pointer select-none hover:text-gray-200 transition-colors"
            onClick={handleTitleClick}
          >
            Challenge
          </div>
          <div>Category</div>
          <div>Rating</div>
          <div>Users Solves</div>
          <div className="text-right">Status</div>
        </div>
        <AnimatePresence>
          {filteredChallenges.map((challenge) => (
            <motion.div
              key={challenge.name}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
            >
              <ChallengeItem
                challenge={challenge}
                expandedChallenge={expandedChallenge}
                setExpandedChallenge={setExpandedChallenge}
                startedChallenges={startedChallenges}
                setStartedChallenges={setStartedChallenges}
                completedChallenges={completedChallenges}
                setCompletedChallenges={setCompletedChallenges}
                challengeRatings={challengeRatings}
                setChallengeRatings={setChallengeRatings}
                difficultyColors={difficultyColors}
                onDifficultyClick={handleDifficultyClick}
                sortByDifficulty={sortByDifficulty}
                onComplete={handleChallengeComplete}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      {showFrog && <DancingFrog />}
      {showConfetti && <Confetti />}
    </div>
  )
}

