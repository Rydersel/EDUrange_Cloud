import React from 'react'

interface NavigationProps {
  filter: string
  setFilter: (filter: string) => void
}

export function Navigation({ filter, setFilter }: NavigationProps) {
  return (
    <nav className="mb-8">
      <ul className="flex space-x-6">
        {["All Challenges", "Active", "Retired", "Favorites", "Unreleased"].map((item) => (
          <li key={item}>
            <button
              onClick={() => setFilter(item.toLowerCase())}
              className={`px-3 py-2 rounded-lg transition-colors ${
                filter === item.toLowerCase()
                  ? "bg-[#1E2B1E] text-white"
                  : "text-gray-400 hover:text-white hover:bg-[#1E2B1E]/50"
              }`}
            >
              {item}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}

