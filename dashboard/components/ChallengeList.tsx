"use client"

import { useState, useMemo, useEffect } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ChallengeItem } from "./ChallengeItem"
import { Navigation } from "./Navigation"
import { SearchAndFilters } from "./SearchAndFilters"
import { HideCompletedToggle } from "./HideCompletedToggle"
import { DancingFrog } from "./DancingFrog"
import { Confetti } from "./Confetti"
import { useToast } from "@/components/ui/use-toast"
import { extractChallengeDescription } from "@/lib/utils"
import { Loader2 } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

const difficultyColors = {
  "EASY": "bg-[#22C55E]/10 text-[#22C55E] hover:bg-[#22C55E]/20",
  "MEDIUM": "bg-[#EAB308]/10 text-[#EAB308] hover:bg-[#EAB308]/20",
  "HARD": "bg-[#EF4444]/10 text-[#EF4444] hover:bg-[#EF4444]/20",
};

const difficultyOrder = ["EASY", "MEDIUM", "HARD"];

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

interface ChallengeListProps {
  competitionId: string;
}

export function ChallengeList({ competitionId }: ChallengeListProps) {
  const [filter, setFilter] = useState("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [hideCompleted, setHideCompleted] = useState(false)
  const [expandedChallenge, setExpandedChallenge] = useState<string | null>(null)
  const [startedChallenges, setStartedChallenges] = useState<Map<string, Set<string>>>(new Map())
  const [completedChallenges, setCompletedChallenges] = useState<Map<string, Set<string>>>(new Map())
  const [selectedDifficulty, setSelectedDifficulty] = useState("all")
  const [selectedCategory, setSelectedCategory] = useState("all")
  const [sortByDifficulty, setSortByDifficulty] = useState<"asc" | "desc" | null>(null)
  const [challenges, setChallenges] = useState<Challenge[]>([])
  const [loading, setLoading] = useState(true)
  const [clickCount, setClickCount] = useState(0)
  const [showFrog, setShowFrog] = useState(false)
  const [showConfetti, setShowConfetti] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    const fetchChallenges = async () => {
      try {
        const response = await fetch(`/api/competition-groups/${competitionId}`);
        if (!response.ok) {
          throw new Error('Failed to fetch challenges');
        }
        const data = await response.json();
        setChallenges(data.challenges.map((c: any) => ({
          id: c.id,
          name: c.name,
          difficulty: c.difficulty || 'MEDIUM',
          AppsConfig: c.AppsConfig || '[]',
          challengeType: c.challengeType,
          points: c.points,
          completed: c.completed,
          totalQuestions: c.totalQuestions,
          completedQuestions: c.completedQuestions
        })));

        // Update completedChallenges map based on API response
        const newCompletedChallenges = new Map<string, Set<string>>();
        const completedSet = new Set<string>();
        data.challenges.forEach((c: any) => {
          if (c.completed) {
            completedSet.add(c.name);
          }
        });
        if (completedSet.size > 0) {
          newCompletedChallenges.set(competitionId, completedSet);
        }
        setCompletedChallenges(newCompletedChallenges);
      } catch (error) {
        console.error('Error fetching challenges:', error);
        toast({
          title: "Error",
          description: "Failed to load challenges",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchChallenges();
  }, [competitionId, toast]);

  const filteredChallenges = useMemo(() => {
    let filtered = challenges.filter(challenge => {
      const description = extractChallengeDescription(challenge.AppsConfig);
      const matchesSearch = challenge.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesDifficulty = selectedDifficulty === "all" || challenge.difficulty.toLowerCase() === selectedDifficulty;
      const matchesCategory = selectedCategory === "all" || challenge.challengeType.name.toLowerCase() === selectedCategory.toLowerCase();
      const matchesCompletion = !hideCompleted || !completedChallenges.get(competitionId)?.has(challenge.name);

      return matchesSearch && matchesDifficulty && matchesCategory && matchesCompletion;
    });

    if (sortByDifficulty) {
      filtered.sort((a, b) => {
        const indexA = difficultyOrder.indexOf(a.difficulty);
        const indexB = difficultyOrder.indexOf(b.difficulty);
        return sortByDifficulty === "asc" ? indexA - indexB : indexB - indexA;
      });
    }

    return filtered;
  }, [challenges, searchQuery, selectedDifficulty, selectedCategory, hideCompleted, completedChallenges, competitionId, sortByDifficulty]);

  const handleDifficultyClick = (difficulty: string) => {
    setClickCount(prev => {
      const newCount = prev + 1;
      if (newCount === 3) {
        setShowFrog(true);
        setShowConfetti(true);
        setTimeout(() => {
          setShowFrog(false);
          setShowConfetti(false);
          return 0;
        }, 8000);
      }
      return newCount;
    });

    if (selectedDifficulty === difficulty) {
      setSortByDifficulty(sortByDifficulty === "asc" ? "desc" : "asc");
    } else {
      setSelectedDifficulty(difficulty.toLowerCase());
      setSortByDifficulty("asc");
    }
  };

  const handleChallengeComplete = (challengeName: string) => {
    setCompletedChallenges(prev => {
      const newMap = new Map(prev);
      const competitionChallenges = newMap.get(competitionId) || new Set();
      competitionChallenges.add(challengeName);
      newMap.set(competitionId, competitionChallenges);
      return newMap;
    });
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        <p className="text-gray-400">Loading challenges...</p>
      </div>
    );
  }

  if (!challenges.length) {
    return (
      <Alert>
        <AlertTitle>No challenges found</AlertTitle>
        <AlertDescription>
          There are no challenges available in this competition yet.
        </AlertDescription>
      </Alert>
    );
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

      {filteredChallenges.length === 0 ? (
        <Alert>
          <AlertTitle>No matches found</AlertTitle>
          <AlertDescription>
            No challenges match your current filters. Try adjusting your search criteria.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="rounded-lg border border-[#1E2B1E] overflow-hidden">
          <div className="grid grid-cols-5 gap-4 bg-[#0A120A] p-4 text-sm font-medium text-gray-400">
            <div>Challenge</div>
            <div>Category</div>
            <div>Difficulty</div>
            <div>Points</div>
            <div className="text-right">Status</div>
          </div>
          <AnimatePresence>
            {filteredChallenges.map((challenge) => (
              <motion.div
                key={challenge.id}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3 }}
              >
                <ChallengeItem
                  challenge={challenge}
                  competitionId={competitionId}
                  expandedChallenge={expandedChallenge}
                  setExpandedChallenge={setExpandedChallenge}
                  startedChallenges={startedChallenges}
                  setStartedChallenges={setStartedChallenges}
                  completedChallenges={completedChallenges}
                  setCompletedChallenges={setCompletedChallenges}
                  difficultyColors={difficultyColors}
                  onDifficultyClick={handleDifficultyClick}
                  sortByDifficulty={sortByDifficulty}
                  onComplete={handleChallengeComplete}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
      {showFrog && <DancingFrog />}
      {showConfetti && <Confetti />}
    </div>
  );
}

