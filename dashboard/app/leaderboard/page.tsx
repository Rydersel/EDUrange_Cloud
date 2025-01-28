import { MainNavigation } from '@/components/MainNavigation'
import { Leaderboard } from '@/components/Leaderboard'

export default function LeaderboardPage() {
  return (
    <div className="min-h-screen bg-[#010301] text-gray-200">
      <MainNavigation />
      <main className="container mx-auto p-6">
        <h1 className="text-4xl font-bold mb-6 text-[#22C55E]">Leaderboard</h1>
        <p className="text-xl mb-6 text-gray-300">
          Top performers in our Capture The Flag challenges. Can you make it to the top?
        </p>
        <Leaderboard />
      </main>
    </div>
  )
}

