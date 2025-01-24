import { MainNavigation } from '@/components/MainNavigation'

export default function Home() {
  return (
    <div>
      <MainNavigation />
      <main className="container mx-auto p-6">
        <h1 className="text-4xl font-bold mb-6">Welcome to CTF Challenges</h1>
        <p className="text-xl">
          Test your skills, solve challenges, and climb the leaderboard in our Capture The Flag competition!
        </p>
      </main>
    </div>
  )
}

