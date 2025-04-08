"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Search, Filter, Award, Clock, Tag, ChevronRight, CheckCircle, Lock } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

// Challenge type definition
interface Challenge {
  id: string
  name: string
  category: string
  difficulty: "EASY" | "MEDIUM" | "HARD"
  points: number
  description: string
  estimatedTime: string
  tags: string[]
  completed: boolean
  locked: boolean
}

// Category colors
const categoryColors: Record<string, string> = {
  Web: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  Crypto: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  Forensics: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  Pwn: "bg-red-500/10 text-red-500 border-red-500/20",
  Reversing: "bg-green-500/10 text-green-500 border-green-500/20",
  OSINT: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  Misc: "bg-gray-500/10 text-gray-500 border-gray-500/20",
}

// Difficulty colors
const difficultyColors: Record<string, string> = {
  EASY: "bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/20",
  MEDIUM: "bg-[#EAB308]/10 text-[#EAB308] border-[#EAB308]/20",
  HARD: "bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/20",
}

// Sample challenge data
const sampleChallenges: Challenge[] = [
  {
    id: "1",
    name: "SQL Injection Basics",
    category: "Web",
    difficulty: "EASY",
    points: 100,
    description: "Learn the fundamentals of SQL injection attacks and how to exploit vulnerable forms.",
    estimatedTime: "30 min",
    tags: ["SQL", "Injection", "Web Security"],
    completed: true,
    locked: false,
  },
  {
    id: "2",
    name: "Caesar's Secret",
    category: "Crypto",
    difficulty: "EASY",
    points: 75,
    description: "Decrypt messages encoded with the classic Caesar cipher.",
    estimatedTime: "20 min",
    tags: ["Cipher", "Classical", "Encryption"],
    completed: false,
    locked: false,
  },
  {
    id: "3",
    name: "Memory Forensics",
    category: "Forensics",
    difficulty: "MEDIUM",
    points: 150,
    description: "Analyze memory dumps to find hidden malware and extract crucial information.",
    estimatedTime: "45 min",
    tags: ["Memory", "Volatility", "Analysis"],
    completed: false,
    locked: false,
  },
  {
    id: "4",
    name: "Buffer Overflow 101",
    category: "Pwn",
    difficulty: "MEDIUM",
    points: 200,
    description: "Exploit buffer overflow vulnerabilities to gain control of program execution.",
    estimatedTime: "60 min",
    tags: ["Buffer", "Exploit", "Memory"],
    completed: false,
    locked: false,
  },
  {
    id: "5",
    name: "Binary Reversing Challenge",
    category: "Reversing",
    difficulty: "HARD",
    points: 300,
    description: "Reverse engineer a complex binary to understand its functionality and find hidden flags.",
    estimatedTime: "90 min",
    tags: ["Binary", "Assembly", "Reverse Engineering"],
    completed: false,
    locked: true,
  },
  {
    id: "6",
    name: "Social Media Investigation",
    category: "OSINT",
    difficulty: "EASY",
    points: 100,
    description: "Use open source intelligence techniques to gather information from social media profiles.",
    estimatedTime: "40 min",
    tags: ["Social Media", "Intelligence", "Reconnaissance"],
    completed: false,
    locked: false,
  },
  {
    id: "7",
    name: "Steganography Basics",
    category: "Forensics",
    difficulty: "EASY",
    points: 100,
    description: "Learn how to find hidden messages in images using steganography techniques.",
    estimatedTime: "30 min",
    tags: ["Steganography", "Images", "Hidden Data"],
    completed: false,
    locked: false,
  },
  {
    id: "8",
    name: "Advanced XSS Attacks",
    category: "Web",
    difficulty: "HARD",
    points: 250,
    description: "Explore advanced cross-site scripting techniques and bypass modern protections.",
    estimatedTime: "75 min",
    tags: ["XSS", "JavaScript", "Web Security"],
    completed: false,
    locked: true,
  },
  {
    id: "9",
    name: "Packet Analysis",
    category: "Forensics",
    difficulty: "MEDIUM",
    points: 175,
    description: "Analyze network packet captures to identify suspicious activities and extract evidence.",
    estimatedTime: "50 min",
    tags: ["Network", "Wireshark", "PCAP"],
    completed: false,
    locked: false,
  },
  {
    id: "10",
    name: "Blockchain Puzzle",
    category: "Crypto",
    difficulty: "HARD",
    points: 275,
    description: "Solve cryptographic puzzles related to blockchain technology and smart contracts.",
    estimatedTime: "80 min",
    tags: ["Blockchain", "Smart Contracts", "Cryptography"],
    completed: false,
    locked: false,
  },
]

export default function ChallengePage() {
  const [challenges, setChallenges] = useState<Challenge[]>([])
  const [filteredChallenges, setFilteredChallenges] = useState<Challenge[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("All")
  const [selectedDifficulty, setSelectedDifficulty] = useState("All")
  const [expandedChallenge, setExpandedChallenge] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [categories, setCategories] = useState<string[]>([])

  // Simulate loading challenges from API
  useEffect(() => {
    const loadChallenges = async () => {
      // Simulate API call delay
      await new Promise((resolve) => setTimeout(resolve, 1000))
      setChallenges(sampleChallenges)

      // Extract unique categories
      const uniqueCategories = Array.from(new Set(sampleChallenges.map((c) => c.category)))
      setCategories(uniqueCategories)

      setLoading(false)
    }

    loadChallenges()
  }, [])

  // Filter challenges based on search query and filters
  useEffect(() => {
    let filtered = challenges

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (challenge) =>
          challenge.name.toLowerCase().includes(query) ||
          challenge.description.toLowerCase().includes(query) ||
          challenge.tags.some((tag) => tag.toLowerCase().includes(query)),
      )
    }

    // Filter by category
    if (selectedCategory !== "All") {
      filtered = filtered.filter((challenge) => challenge.category === selectedCategory)
    }

    // Filter by difficulty
    if (selectedDifficulty !== "All") {
      filtered = filtered.filter((challenge) => challenge.difficulty === selectedDifficulty)
    }

    setFilteredChallenges(filtered)
  }, [challenges, searchQuery, selectedCategory, selectedDifficulty])

  // Toggle challenge expansion
  const toggleExpand = (id: string) => {
    setExpandedChallenge(expandedChallenge === id ? null : id)
  }

  return (
    <div className="container max-w-6xl mx-auto px-4 py-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="space-y-2 mb-8"
      >
        <h1 className="text-3xl font-bold tracking-tight">Challenge Library</h1>
        <p className="text-muted-foreground">
          Browse, search and solve cybersecurity challenges to improve your skills
        </p>
      </motion.div>

      {/* Search and filters */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="mb-8 space-y-4"
      >
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search input */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search challenges..."
              className="w-full rounded-lg bg-background/50 backdrop-blur-sm pl-10 pr-4 py-2 text-sm border border-border focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Category filter */}
          <div className="flex-shrink-0">
            <div className="relative">
              <select
                className="appearance-none rounded-lg bg-background/50 backdrop-blur-sm pl-4 pr-10 py-2 text-sm border border-border focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                <option value="All">All Categories</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
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
                className="appearance-none rounded-lg bg-background/50 backdrop-blur-sm pl-4 pr-10 py-2 text-sm border border-border focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                value={selectedDifficulty}
                onChange={(e) => setSelectedDifficulty(e.target.value)}
              >
                <option value="All">All Difficulties</option>
                <option value="EASY">Easy</option>
                <option value="MEDIUM">Medium</option>
                <option value="HARD">Hard</option>
              </select>
              <Filter className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            </div>
          </div>
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
            <div key={i} className="rounded-xl border border-border bg-background/50 backdrop-blur-sm p-4">
              <div className="flex items-center justify-between">
                <div className="space-y-3">
                  <Skeleton className="h-5 w-40" />
                  <div className="flex gap-2">
                    <Skeleton className="h-5 w-20" />
                    <Skeleton className="h-5 w-20" />
                  </div>
                </div>
                <Skeleton className="h-8 w-8 rounded-full" />
              </div>
            </div>
          ))
        ) : filteredChallenges.length === 0 ? (
          // No results
          <div className="rounded-xl border border-border bg-background/50 backdrop-blur-sm p-8 text-center">
            <p className="text-muted-foreground">No challenges found matching your criteria</p>
          </div>
        ) : (
          // Challenge cards
          <AnimatePresence>
            {filteredChallenges.map((challenge) => (
              <motion.div
                key={challenge.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className={`rounded-xl border border-border ${challenge.locked ? "bg-background/30" : "bg-background/50"} backdrop-blur-sm overflow-hidden`}
              >
                {/* Challenge header */}
                <div
                  className={`p-4 cursor-pointer ${expandedChallenge === challenge.id ? "border-b border-border" : ""}`}
                  onClick={() => !challenge.locked && toggleExpand(challenge.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{challenge.name}</h3>
                        {challenge.completed && <CheckCircle className="h-4 w-4 text-green-500" />}
                        {challenge.locked && <Lock className="h-4 w-4 text-muted-foreground" />}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline" className={`${categoryColors[challenge.category]} text-xs`}>
                          {challenge.category}
                        </Badge>
                        <Badge variant="outline" className={`${difficultyColors[challenge.difficulty]} text-xs`}>
                          {challenge.difficulty.charAt(0) + challenge.difficulty.slice(1).toLowerCase()}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right hidden sm:block">
                        <div className="flex items-center justify-end gap-1 text-muted-foreground text-sm">
                          <Award className="h-4 w-4" />
                          <span>{challenge.points} pts</span>
                        </div>
                      </div>
                      <ChevronRight
                        className={`h-5 w-5 text-muted-foreground transition-transform ${expandedChallenge === challenge.id ? "rotate-90" : ""}`}
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
                      <div className="p-4 space-y-4">
                        <p className="text-sm text-muted-foreground">{challenge.description}</p>

                        <div className="flex flex-wrap gap-4 text-sm">
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Award className="h-4 w-4" />
                            <span>{challenge.points} points</span>
                          </div>
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Clock className="h-4 w-4" />
                            <span>{challenge.estimatedTime}</span>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {challenge.tags.map((tag, index) => (
                            <div
                              key={index}
                              className="flex items-center gap-1 text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded-full"
                            >
                              <Tag className="h-3 w-3" />
                              <span>{tag}</span>
                            </div>
                          ))}
                        </div>

                        <div className="pt-2">
                          <Button size="sm">Start Challenge</Button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </motion.div>
    </div>
  )
}

