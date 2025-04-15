import React from 'react'
import { Search } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface SearchAndFiltersProps {
  searchQuery: string
  setSearchQuery: (query: string) => void
  selectedDifficulty: string
  setSelectedDifficulty: (difficulty: string) => void
  selectedCategory: string
  setSelectedCategory: (category: string) => void
  sortByDifficulty: "asc" | "desc" | null
}

export function SearchAndFilters({
  searchQuery,
  setSearchQuery,
  selectedDifficulty,
  setSelectedDifficulty,
  selectedCategory,
  setSelectedCategory,
  sortByDifficulty
}: SearchAndFiltersProps) {
  return (
    <div className="mb-8 flex flex-col sm:flex-row gap-4">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search Challenges..."
          className="w-full rounded-lg bg-[#0A120A] pl-10 pr-4 py-2 text-sm text-gray-200 placeholder-gray-400 border border-[#1E2B1E] focus:outline-none focus:ring-2 focus:ring-[#22C55E] focus:bg-[#1A2A1A]"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>
      <div className="flex gap-4">
        <Select value={selectedDifficulty} onValueChange={setSelectedDifficulty}>
          <SelectTrigger className="w-[180px] bg-[#0A120A] border-[#1E2B1E]">
            <SelectValue placeholder="All Difficulties" />
          </SelectTrigger>
          <SelectContent className="bg-[#1A2A1A] border-[#2A3A2A]">
            <SelectItem value="all" className="text-gray-200">All Difficulties</SelectItem>
            <SelectItem value="easy" className="text-gray-200">Easy {selectedDifficulty === "easy" && sortByDifficulty && (sortByDifficulty === "asc" ? " ↑" : " ↓")}</SelectItem>
            <SelectItem value="medium" className="text-gray-200">Medium {selectedDifficulty === "medium" && sortByDifficulty && (sortByDifficulty === "asc" ? " ↑" : " ↓")}</SelectItem>
            <SelectItem value="hard" className="text-gray-200">Hard {selectedDifficulty === "hard" && sortByDifficulty && (sortByDifficulty === "asc" ? " ↑" : " ↓")}</SelectItem>
            <SelectItem value="expert" className="text-gray-200">Expert {selectedDifficulty === "expert" && sortByDifficulty && (sortByDifficulty === "asc" ? " ↑" : " ↓")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger className="w-[180px] bg-[#0A120A] border-[#1E2B1E]">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent className="bg-[#1A2A1A] border-[#2A3A2A]">
            <SelectItem value="all" className="text-gray-200">All Categories</SelectItem>
            <SelectItem value="web" className="text-gray-200">Web</SelectItem>
            <SelectItem value="crypto" className="text-gray-200">Crypto</SelectItem>
            <SelectItem value="pwn" className="text-gray-200">Pwn</SelectItem>
            <SelectItem value="reversing" className="text-gray-200">Reversing</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

