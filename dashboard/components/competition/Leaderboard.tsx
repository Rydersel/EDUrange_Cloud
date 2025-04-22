"use client"

import { useState, useEffect } from 'react'
import { ChevronUp, ChevronDown, Trophy, Target, Clock, Loader2 } from 'lucide-react'
import { Badge } from "@/components/ui/badge"
import { formatDistance } from 'date-fns'
import { useToast } from '@/components/ui/use-toast'

interface LeaderboardUser {
  id: string;
  rank: number;
  username: string;
  score: number;
  solvedChallenges: number;
  lastActive: string;
}

interface LeaderboardProps {
  competitionId: string;
}

type SortKey = 'rank' | 'score' | 'solvedChallenges' | 'lastActive'

export function Leaderboard({ competitionId }: LeaderboardProps) {
  const [sortKey, setSortKey] = useState<SortKey>('rank')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [users, setUsers] = useState<LeaderboardUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        setLoading(true)
        setError(false)
        
        const response = await fetch(`/api/competition-groups/${competitionId}/leaderboard`)
        
        if (!response.ok) {
          throw new Error('Failed to fetch leaderboard data')
        }
        
        const data = await response.json()
        setUsers(data)
      } catch (error) {
        console.error('Error fetching leaderboard:', error)
        setError(true)
        toast({
          title: "Error",
          description: "Failed to load leaderboard data",
          variant: "destructive",
        })
      } finally {
        setLoading(false)
      }
    }

    if (competitionId) {
      fetchLeaderboard()
    }
  }, [competitionId, toast])

  const sortedUsers = [...users].sort((a, b) => {
    if (a[sortKey] < b[sortKey]) return sortOrder === 'asc' ? -1 : 1
    if (a[sortKey] > b[sortKey]) return sortOrder === 'asc' ? 1 : -1
    return 0
  })

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortOrder('asc')
    }
  }

  // Format date to show in a user-friendly way
  const formatLastActive = (dateString: string) => {
    try {
      const date = new Date(dateString)
      return formatDistance(date, new Date(), { addSuffix: true })
    } catch (error) {
      return 'Unknown'
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center p-8 text-red-500">
        Failed to load leaderboard. Please try again later.
      </div>
    )
  }

  if (users.length === 0) {
    return (
      <div className="text-center p-8 text-muted-foreground">
        No participants yet. Be the first to join!
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-[#1E2B1E] overflow-hidden flex flex-col">
      {/* Fixed header */}
      <div className="grid grid-cols-5 gap-4 bg-[#0A120A] p-4 text-sm font-medium text-gray-400 sticky top-0 z-10">
        <div className="cursor-pointer" onClick={() => toggleSort('rank')}>
          Rank
          {sortKey === 'rank' && (sortOrder === 'asc' ? <ChevronUp className="inline ml-2 h-4 w-4" /> : <ChevronDown className="inline ml-2 h-4 w-4" />)}
        </div>
        <div>Username</div>
        <div className="cursor-pointer" onClick={() => toggleSort('score')}>
          Score
          {sortKey === 'score' && (sortOrder === 'asc' ? <ChevronUp className="inline ml-2 h-4 w-4" /> : <ChevronDown className="inline ml-2 h-4 w-4" />)}
        </div>
        <div className="cursor-pointer" onClick={() => toggleSort('solvedChallenges')}>
          Solved
          {sortKey === 'solvedChallenges' && (sortOrder === 'asc' ? <ChevronUp className="inline ml-2 h-4 w-4" /> : <ChevronDown className="inline ml-2 h-4 w-4" />)}
        </div>
        <div className="cursor-pointer" onClick={() => toggleSort('lastActive')}>
          Last Active
          {sortKey === 'lastActive' && (sortOrder === 'asc' ? <ChevronUp className="inline ml-2 h-4 w-4" /> : <ChevronDown className="inline ml-2 h-4 w-4" />)}
        </div>
      </div>

      {/* Scrollable body */}
      <div className="overflow-y-auto max-h-[calc(100vh-300px)]">
        {sortedUsers.map((user) => (
          <div key={user.id} className="grid grid-cols-5 gap-4 p-4 hover:bg-[#1E2B1E]/50 transition-colors items-center border-t border-[#1E2B1E]">
            <div className="font-medium text-gray-200 flex items-center gap-2">
              {user.rank}
              {user.rank <= 3 && <Trophy className="h-4 w-4 text-yellow-500" />}
            </div>
            <div className="text-gray-200">{user.username}</div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="bg-[#22C55E]/10 text-[#22C55E] hover:bg-[#22C55E]/20">
                {user.score} pts
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-gray-400">
              <Target className="h-4 w-4 text-blue-500" />
              <span>{user.solvedChallenges}</span>
            </div>
            <div className="flex items-center gap-2 text-gray-400">
              <Clock className="h-4 w-4 text-green-500" />
              <span>{formatLastActive(user.lastActive)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

