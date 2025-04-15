"use client"

import { useState, useEffect, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Search, Filter, Award, Clock, Tag, ChevronRight, CheckCircle, Lock, Loader2, Play, X, Server, Globe, AlertCircle, AlertTriangle, SearchX } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { StatusBadge } from "@/components/ui/status-badge"
import { useToast } from "@/components/ui/use-toast"
import { useRouter } from "next/navigation"
import { devLog } from "@/lib/logger"

// Challenge type definition
interface Challenge {
  id: string
  name: string
  difficulty: string
  description: string
  AppsConfig: string
  challengeType: {
    id: string
    name: string
  }
  points: number
  completed: boolean
  totalQuestions: number
  completedQuestions: number
}

// Difficulty colors
const difficultyColors: Record<string, string> = {
  "EASY": "bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/20",
  "MEDIUM": "bg-[#EAB308]/10 text-[#EAB308] border-[#EAB308]/20",
  "HARD": "bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/20",
  "EXPERT": "bg-[#9333EA]/10 text-[#9333EA] border-[#9333EA]/20",
}

interface ChallengeListProps {
  competitionId: string
  activeInstances: {
    id: string
    challengeUrl: string
    status: string
    creationTime: string
    challengeId?: string
    competitionId?: string
  }[]
  onTerminateInstance: (instanceId: string) => Promise<void>
}

export function ChallengeList({ competitionId, activeInstances, onTerminateInstance }: ChallengeListProps) {
  const [challenges, setChallenges] = useState<Challenge[]>([])
  const [expandedChallenge, setExpandedChallenge] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("all")
  const [selectedDifficulty, setSelectedDifficulty] = useState("all")
  const [hideCompleted, setHideCompleted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [categories, setCategories] = useState<string[]>([])
  const [startedChallenges, setStartedChallenges] = useState<Map<string, Set<string>>>(new Map())
  const [completedChallenges, setCompletedChallenges] = useState<Map<string, Set<string>>>(new Map())
  const [isStarting, setIsStarting] = useState<string | null>(null)
  const [isTerminating, setIsTerminating] = useState<string | null>(null)
  const { toast } = useToast()
  const router = useRouter()

  // Fetch challenges from API
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
          description: c.description || '',
          AppsConfig: c.AppsConfig || '[]',
          challengeType: c.challengeType,
          points: c.points,
          completed: c.completed,
          totalQuestions: c.totalQuestions,
          completedQuestions: c.completedQuestions
        })));

        // Extract unique categories
        const uniqueCategories = Array.from(
          new Set(data.challenges.map((c: any) => c.challengeType.name))
        ) as string[];
        setCategories(uniqueCategories);

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
        devLog('Error fetching challenges:', error);
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

  // Create mapping between challenges and active instances
  const activeChallengeMap = useMemo(() => {
    const map = new Map();
    
    devLog("All active instances:", activeInstances);
    devLog("All challenges:", challenges);
    
    // First pass: only do direct matches by challengeId
    activeInstances.forEach(instance => {
      if (instance.challengeId) {
        // Direct match by ID - highest priority
        devLog(`Direct match: Instance ${instance.id} mapped to challenge ${instance.challengeId}`);
        map.set(instance.challengeId, instance);
      }
    });
    
    // Second pass: try pattern matching only for instances not yet matched
    const unmatchedInstances = activeInstances.filter(instance => 
      !instance.challengeId || !map.has(instance.challengeId)
    );
    
    if (unmatchedInstances.length > 0) {
      devLog(`${unmatchedInstances.length} instances still need matching:`, unmatchedInstances);
      
      unmatchedInstances.forEach(instance => {
        // Try to match by name pattern in instance ID
        for (const challenge of challenges) {
          // Skip if this challenge is already matched
          if (map.has(challenge.id)) continue;
          
          // Try to see if the challenge name or ID is contained in the instance ID
          const instanceIdLower = instance.id.toLowerCase();
          const challengeNameLower = challenge.name.toLowerCase().replace(/\s+/g, '');
          const challengeIdLower = challenge.id.toLowerCase();
          
          if (instanceIdLower.includes(challengeNameLower) || 
              instanceIdLower.includes(challengeIdLower) || 
              // Bandit Level 1 -> bandit-1 pattern match
              (challenge.name.toLowerCase().includes('level') && 
               instanceIdLower.includes(challenge.name.toLowerCase().replace('level', '')
                                                             .replace(/\s+/g, '-')))) {
            devLog(`Pattern match: Instance ${instance.id} mapped to challenge ${challenge.id} (${challenge.name})`);
            map.set(challenge.id, instance);
            // Mark this instance as matched
            instance.challengeId = challenge.id;
            break;
          }
        }
      });
    }
    
    // Fallback: If we still have unmapped active instances and challenges
    const remainingInstances = activeInstances.filter(instance => 
      !instance.challengeId || !challenges.some(c => c.id === instance.challengeId)
    );
    
    const unmappedChallenges = challenges.filter(challenge => 
      !map.has(challenge.id)
    );
    
    if (remainingInstances.length > 0 && unmappedChallenges.length > 0) {
      devLog("Using fallback mapping - assigning by order");
      // Sort challenges by some stable order (like name or ID)
      const sortedChallenges = [...unmappedChallenges].sort((a, b) => a.name.localeCompare(b.name));
      
      // Map challenges to the remaining instances
      for (let i = 0; i < Math.min(remainingInstances.length, sortedChallenges.length); i++) {
        map.set(sortedChallenges[i].id, remainingInstances[i]);
        devLog(`Fallback match: Instance ${remainingInstances[i].id} mapped to challenge ${sortedChallenges[i].id} (${sortedChallenges[i].name})`);
      }
    }
    
    devLog("Final active challenge map:", Array.from(map.entries()));
    return map;
  }, [activeInstances, challenges]);

  // Filter challenges based on search query and filters
  const filteredChallenges = useMemo(() => {
    let filtered = challenges;

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (challenge) => {
          // Search only in name and direct description
          return challenge.name.toLowerCase().includes(query) ||
                 (challenge.description && challenge.description.toLowerCase().includes(query));
        }
      );
    }

    // Filter by category
    if (selectedCategory !== "all") {
      filtered = filtered.filter((challenge) => 
        challenge.challengeType.name.toLowerCase() === selectedCategory.toLowerCase()
      );
    }

    // Filter by difficulty
    if (selectedDifficulty !== "all") {
      filtered = filtered.filter((challenge) => 
        challenge.difficulty.toLowerCase() === selectedDifficulty.toLowerCase()
      );
    }

    // Filter by completion
    if (hideCompleted) {
      filtered = filtered.filter(
        (challenge) => !challenge.completed && !completedChallenges.get(competitionId)?.has(challenge.name)
      );
    }

    return filtered;
  }, [challenges, searchQuery, selectedCategory, selectedDifficulty, hideCompleted, completedChallenges, competitionId]);

  // Toggle challenge expansion
  const toggleExpand = (id: string) => {
    setExpandedChallenge(expandedChallenge === id ? null : id);
  }

  // Start a challenge
  const handleStartChallenge = async (challenge: Challenge) => {
    try {
      setIsStarting(challenge.id);
      toast({
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
      devLog("Error starting challenge:", error);
      toast({
        title: "Error",
        description: "Failed to start challenge. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsStarting(null);
    }
  };

  // Terminate a challenge
  const handleTerminateChallenge = async (challengeId: string) => {
    const instance = activeChallengeMap.get(challengeId);
    if (!instance) return;
    
    // Prevent double-clicks by checking if already terminating
    if (isTerminating === challengeId) return;
    
    try {
      // Immediately set terminating state and update UI
      setIsTerminating(challengeId);
      
      // Find the challenge for easier reference
      const challenge = challenges.find(c => c.id === challengeId);
      
      // Optimistically update the local state to show terminating
      const challengeInstance = activeChallengeMap.get(challengeId);
      if (challengeInstance) {
        // Create a shallow copy of the Map
        const updatedMap = new Map(activeChallengeMap);
        // Update the status in the copied instance
        updatedMap.set(challengeId, {
          ...challengeInstance,
          status: 'TERMINATING'
        });
      }
      
      toast({
        title: "Terminating Challenge",
        description: "Please wait while your challenge instance is being terminated...",
      });

      await onTerminateInstance(instance.id);
      
      toast({
        title: "Challenge Terminated",
        description: "Your challenge has been successfully terminated.",
      });
      
      // Remove from started challenges map
      if (challenge) {
        setStartedChallenges(prev => {
      const newMap = new Map(prev);
      const competitionChallenges = newMap.get(competitionId) || new Set();
          competitionChallenges.delete(challenge.name);
      newMap.set(competitionId, competitionChallenges);
      return newMap;
    });
      }
      
    } catch (error) {
      devLog("Error terminating challenge:", error);
      toast({
        title: "Error",
        description: "Failed to terminate challenge. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsTerminating(null);
    }
  };

  return (
    <div className="container max-w-6xl mx-auto px-4 py-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="space-y-2 mb-6"
      >
        <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">Challenges</h1>
        <p className="text-muted-foreground">
          Complete these cybersecurity challenges to earn points and master new skills
        </p>
      </motion.div>

      {/* Search and filters */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="mb-6 space-y-4"
      >
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search input */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search challenges..."
              className="w-full rounded-lg bg-background/60 backdrop-blur-sm pl-10 pr-4 py-2.5 text-sm border border-border focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Category filter */}
          <div className="flex-shrink-0">
            <div className="relative">
              <select
                className="appearance-none rounded-lg bg-background/60 backdrop-blur-sm pl-4 pr-10 py-2.5 text-sm border border-border focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                <option value="all">All Categories</option>
                {categories.map((category) => (
                  <option key={category} value={category.toLowerCase()}>
                    {category}
                  </option>
                ))}
              </select>
              <Filter className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            </div>
          </div>

          {/* Difficulty filter */}
          <div className="flex-shrink-0">
            <div className="relative">
              <select
                className="appearance-none rounded-lg bg-background/60 backdrop-blur-sm pl-4 pr-10 py-2.5 text-sm border border-border focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                value={selectedDifficulty}
                onChange={(e) => setSelectedDifficulty(e.target.value)}
              >
                <option value="all">All Difficulties</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
                <option value="expert">Expert</option>
              </select>
              <Filter className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Hide completed toggle */}
        <div className="flex items-center gap-2">
          <label htmlFor="hideCompleted" className="flex items-center gap-2 text-sm cursor-pointer select-none text-muted-foreground hover:text-foreground transition-colors">
            <input
              type="checkbox"
              id="hideCompleted"
              checked={hideCompleted}
              onChange={() => setHideCompleted(!hideCompleted)}
              className="rounded border-border bg-background/60 h-4 w-4 text-primary focus:ring-primary/40 focus:ring-offset-0"
            />
            Hide completed challenges
          </label>
        </div>
      </motion.div>

      {/* Challenge list */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="space-y-4"
      >
        {loading ? (
          // Loading skeletons
          Array.from({ length: 5 }).map((_, i) => (
            <motion.div 
              key={i} 
              className="rounded-xl border border-border bg-background/40 backdrop-blur-sm p-4 overflow-hidden"
              initial={{ opacity: 0, y: 20 }}
              animate={{ 
                opacity: 1, 
                y: 0,
                transition: {
                  delay: i * 0.05
                }
              }}
            >
              <div className="flex items-center justify-between">
                <div className="space-y-3">
                  <Skeleton className="h-5 w-40 bg-background/60" />
                  <div className="flex gap-2">
                    <Skeleton className="h-5 w-20 bg-background/60" />
                    <Skeleton className="h-5 w-20 bg-background/60" />
                  </div>
                </div>
                <div className="flex gap-2 items-center">
                  <Skeleton className="h-7 w-24 bg-background/60" />
                  <Skeleton className="h-6 w-6 rounded-full bg-background/60" />
                </div>
              </div>
            </motion.div>
          ))
        ) : filteredChallenges.length === 0 ? (
          // No results
          <motion.div 
            className="rounded-xl border border-border bg-background/50 backdrop-blur-sm p-8 text-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="flex flex-col items-center justify-center gap-3">
              <SearchX className="h-12 w-12 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-medium">No challenges found</h3>
              <p className="text-muted-foreground max-w-md">
                No challenges match your current filters. Try adjusting your search criteria or clear filters to see all available challenges.
              </p>
              {searchQuery && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setSearchQuery("")}
                  className="mt-2"
                >
                  <X className="mr-2 h-4 w-4" />
                  Clear search
                </Button>
              )}
            </div>
          </motion.div>
        ) : (
          // Challenge cards
          <AnimatePresence>
            {filteredChallenges.map((challenge) => {
              const isActive = !!activeChallengeMap.get(challenge.id);
              const instance = activeChallengeMap.get(challenge.id);
              
              // More reliable status detection with case insensitive includes
              const statusLower = instance?.status?.toLowerCase() || '';
              const isCreating = isActive && (
                statusLower.includes('creat') || 
                statusLower.includes('pend') || 
                statusLower === 'creating'
              );
              const isQueued = isActive && (
                statusLower.includes('queue') || 
                statusLower === 'queued'
              );
              const isTerminatingStatus = isActive && (
                statusLower.includes('terminat') || 
                statusLower === 'terminating'
              );
              
              // Log status for debugging
              if (isActive) {
                devLog(`Challenge ${challenge.name} - ID: ${challenge.id}, Status: ${instance.status}, Detected as: ${isCreating ? 'Creating' : isQueued ? 'Queued' : isTerminatingStatus ? 'Terminating' : 'Active'}`);
              }
              
              return (
              <motion.div
                key={challenge.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3 }}
                  className={`rounded-xl border border-border ${expandedChallenge === challenge.id ? 'bg-background/70' : 'bg-background/40'} backdrop-blur-sm overflow-hidden hover:border-primary/40 transition-colors`}
                >
                  {/* Challenge header */}
                  <div
                    className={`p-4 cursor-pointer ${expandedChallenge === challenge.id ? "border-b border-border" : ""} hover:bg-background/60 transition-colors`}
                    onClick={() => toggleExpand(challenge.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-base">{challenge.name}</h3>
                          {challenge.completed && <CheckCircle className="h-4 w-4 text-green-500" />}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline" className="text-xs flex items-center gap-1.5 py-0.5">
                            {challenge.challengeType.name === 'fullOS' && <Server className="h-3 w-3" />}
                            {challenge.challengeType.name === 'web' && <Globe className="h-3 w-3" />}
                            {challenge.challengeType.name}
                          </Badge>
                          <Badge variant="outline" className={`${difficultyColors[challenge.difficulty]} text-xs py-0.5`}>
                            {challenge.difficulty.charAt(0) + challenge.difficulty.slice(1).toLowerCase()}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right hidden sm:block">
                          <div className="flex items-center justify-end gap-1 text-muted-foreground text-sm">
                            <Award className="h-4 w-4 text-yellow-500" />
                            <span>{challenge.points} pts</span>
                          </div>
                        </div>
                        
                        {/* Status badges */}
                        <div className="flex items-center gap-2 min-w-[110px] justify-end">
                          {/* Always show a status badge */}
                          {(challenge.completed || completedChallenges.get(competitionId)?.has(challenge.name)) ? (
                            <StatusBadge 
                              status="completed" 
                              customText="Completed" 
                              className="flex items-center gap-1.5 px-3"
                            >
                              <div className="w-2 h-2 rounded-full bg-emerald-500" />
                            </StatusBadge>
                          ) : isActive ? (
                            <StatusBadge 
                              status={
                                isCreating ? "creating" : 
                                isQueued ? "info" : 
                                isTerminatingStatus ? "terminating" : 
                                "active"
                              } 
                              customText={
                                isCreating ? "Creating" : 
                                isQueued ? "Queued" : 
                                isTerminatingStatus ? "Terminating" : 
                                "Active"
                              }
                              className="flex items-center gap-1.5 px-3"
                            >
                              {isCreating || isQueued ? (
                                <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
                              ) : isTerminatingStatus ? (
                                <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                              ) : (
                                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                              )}
                            </StatusBadge>
                          ) : (
                            <StatusBadge 
                              status="unknown" 
                              customText="Not Started" 
                              className="flex items-center gap-1.5 px-3"
                            >
                              <div className="w-2 h-2 rounded-full bg-gray-400" />
                            </StatusBadge>
                          )}
                        </div>
                        
                        <ChevronRight
                          className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${expandedChallenge === challenge.id ? "rotate-90" : ""}`}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Expanded challenge details */}
                  <AnimatePresence>
                    {expandedChallenge === challenge.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3 }}
                        className="overflow-hidden"
                      >
                        <div className="p-5 space-y-5 bg-background/60">
                          <p className="text-sm text-muted-foreground leading-relaxed">
                            {challenge.description || 'No description available'}
                          </p>

                          <div className="flex flex-wrap gap-4 text-sm">
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <Award className="h-4 w-4 text-yellow-500" />
                              <span>{challenge.points} points</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-muted-foreground">Questions completed:</span>
                              <StatusBadge
                                status={challenge.completedQuestions === challenge.totalQuestions ? "completed" : "info"}
                                customText={`${challenge.completedQuestions}/${challenge.totalQuestions}`}
                              />
                            </div>
                          </div>

                          <div className="pt-2 flex flex-col gap-2">
                            {isActive ? (
                              <>
                                <Button 
                                  size="default"
                                  onClick={() => router.push(`/competitions/${competitionId}/challenges/${challenge.id}`)}
                                  disabled={isCreating || isQueued || isTerminatingStatus}
                                  className="w-full"
                                >
                                  {isCreating || isQueued ? (
                                    <>
                                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                      Preparing Challenge...
                                    </>
                                  ) : (
                                    <>
                                      <Play className="mr-2 h-4 w-4" />
                                      Continue Challenge
                                    </>
                                  )}
                                </Button>
                                
                                <Button
                                  size="default"
                                  variant="destructive"
                                  onClick={() => handleTerminateChallenge(challenge.id)}
                                  disabled={isTerminating === challenge.id || isTerminatingStatus}
                                  className="w-full"
                                >
                                  {isTerminatingStatus || isTerminating === challenge.id ? (
                                    <>
                                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                      Terminating Challenge...
                                    </>
                                  ) : (
                                    <>
                                      <X className="mr-2 h-4 w-4" />
                                      Terminate Challenge
                                    </>
                                  )}
                                </Button>
                              </>
                            ) : (
                              <Button
                                size="default"
                                className="w-full"
                                onClick={() => {
                                  if (!challenge.completed && !completedChallenges.get(competitionId)?.has(challenge.name)) {
                                    handleStartChallenge(challenge);
                                  }
                                }}
                                disabled={
                                  challenge.completed || 
                                  completedChallenges.get(competitionId)?.has(challenge.name) || 
                                  isStarting === challenge.id ||
                                  activeInstances.length >= 3
                                }
                              >
                                {isStarting === challenge.id ? (
                                  <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Starting Challenge...
                                  </>
                                ) : challenge.completed || completedChallenges.get(competitionId)?.has(challenge.name) ? (
                                  <>
                                    <CheckCircle className="mr-2 h-4 w-4" />
                                    Challenge Completed
                                  </>
                                ) : activeInstances.length >= 3 ? (
                                  <>
                                    <AlertCircle className="mr-2 h-4 w-4" />
                                    Maximum Active Challenges Reached
                                  </>
                                ) : (
                                  <>
                                    <Play className="mr-2 h-4 w-4" />
                                    Start Challenge
                                  </>
                                )}
                              </Button>
                            )}
                            
                            {activeInstances.length >= 3 && !isActive && (
                              <p className="text-sm text-amber-500 mt-1 flex items-center gap-1.5">
                                <AlertTriangle className="h-4 w-4" />
                                You have reached the maximum of 3 active challenges. Terminate an existing challenge to start a new one.
                              </p>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
              </motion.div>
              );
            })}
          </AnimatePresence>
      )}
      </motion.div>
    </div>
  )
}

