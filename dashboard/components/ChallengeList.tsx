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
}

interface ChallengeListProps {
  competitionId: string;
}

export function ChallengeList({ competitionId }: ChallengeListProps) {
  const [filter, setFilter] = useState("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [hideCompleted, setHideCompleted] = useState(false)
  const [expandedChallenge, setExpandedChallenge] = useState<string | null>(null)
  const [startedChallenges, setStartedChallenges] = useState<Set<string>>(new Set())
  const [completedChallenges, setCompletedChallenges] = useState<Set<string>>(new Set())
  const [selectedDifficulty, setSelectedDifficulty] = useState("all")
  const [selectedCategory, setSelectedCategory] = useState("all")
  const [sortByDifficulty, setSortByDifficulty] = useState<"asc" | "desc" | null>(null)
  const [challenges, setChallenges] = useState<Challenge[]>([])
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()

  useEffect(() => {
    const fetchChallenges = async () => {
      try {
        const response = await fetch(`/api/competition-groups/${competitionId}/challenges`);
        if (!response.ok) {
          throw new Error('Failed to fetch challenges');
        }
        const data = await response.json();
        setChallenges(data);
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
      const matchesCompletion = !hideCompleted || !completedChallenges.has(challenge.name);

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
  }, [challenges, searchQuery, selectedDifficulty, selectedCategory, hideCompleted, completedChallenges, sortByDifficulty]);

  const handleDifficultyClick = (difficulty: string) => {
    if (selectedDifficulty === difficulty) {
      setSortByDifficulty(sortByDifficulty === "asc" ? "desc" : "asc");
    } else {
      setSelectedDifficulty(difficulty.toLowerCase());
      setSortByDifficulty("asc");
    }
  };

  const handleChallengeComplete = (challengeName: string) => {
    setCompletedChallenges(prev => {
      const newSet = new Set(prev);
      newSet.add(challengeName);
      return newSet;
    });
  };

  if (loading) {
    return <div>Loading challenges...</div>;
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
    </div>
  );
}

