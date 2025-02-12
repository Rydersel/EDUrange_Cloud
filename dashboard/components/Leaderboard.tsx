"use client"

import { useState } from 'react'
import { ChevronUp, ChevronDown, Trophy, Target, Clock } from 'lucide-react'
import { Badge } from "@/components/ui/badge"

interface User {
  rank: number
  username: string
  score: number
  solvedChallenges: number
  lastActive: string
}

const users: User[] = [
  { rank: 1, username: "l33thax0r", score: 9500, solvedChallenges: 42, lastActive: "2025-01-18" },
  { rank: 2, username: "cyber_ninja", score: 9200, solvedChallenges: 40, lastActive: "2025-01-17" },
  { rank: 3, username: "binary_beast", score: 8800, solvedChallenges: 38, lastActive: "2025-01-18" },
  { rank: 4, username: "quantum_coder", score: 8500, solvedChallenges: 37, lastActive: "2025-01-16" },
  { rank: 5, username: "crypto_queen", score: 8200, solvedChallenges: 35, lastActive: "2025-01-18" },
  { rank: 6, username: "exploit_master", score: 7900, solvedChallenges: 34, lastActive: "2025-01-17" },
  { rank: 7, username: "packet_wizard", score: 7600, solvedChallenges: 33, lastActive: "2025-01-18" },
  { rank: 8, username: "malware_hunter", score: 7300, solvedChallenges: 32, lastActive: "2025-01-15" },
  { rank: 9, username: "firewall_breaker", score: 7000, solvedChallenges: 30, lastActive: "2025-01-18" },
  { rank: 10, username: "zero_day_finder", score: 6700, solvedChallenges: 29, lastActive: "2025-01-16" },
]

type SortKey = 'rank' | 'score' | 'solvedChallenges' | 'lastActive'

export function Leaderboard() {
  const [sortKey, setSortKey] = useState<SortKey>('rank')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

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

  return (
    <div className="rounded-lg border border-[#1E2B1E] overflow-hidden">
      <div className="grid grid-cols-5 gap-4 bg-[#0A120A] p-4 text-sm font-medium text-gray-400">
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
      {sortedUsers.map((user) => (
        <div key={user.username} className="grid grid-cols-5 gap-4 p-4 hover:bg-[#1E2B1E]/50 transition-colors items-center border-t border-[#1E2B1E]">
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
            <span>{user.lastActive}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

