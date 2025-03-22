import { MainNavigation } from '@/components/navigation/MainNavigation'
import { BackgroundGradientAnimation } from '@/components/splash/background-gradient-animation'
import { Button } from '@/components/ui/button'
import { ArrowRight, Shield, Trophy, Users } from 'lucide-react'
import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen relative overflow-hidden">
      <BackgroundGradientAnimation
        gradientBackgroundStart="rgb(1, 3, 1)"
        gradientBackgroundEnd="rgb(15, 40, 24)"
        firstColor="34, 197, 94"
        secondColor="139, 92, 246"
        thirdColor="20, 184, 166"
        fourthColor="56, 189, 248"
        fifthColor="34, 197, 94"
        pointerColor="139, 92, 246"
        interactive={true}
        className="absolute inset-0 z-0"
      />

      <div className="relative z-10">
        <MainNavigation />

        <main className="container mx-auto px-6 py-20">
          <div className="flex flex-col items-center text-center space-y-8 mb-16 animate-fade-in">
            <h1 className="text-6xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-green-400 via-purple-500 to-emerald-500 animate-gradient">
              Welcome to EDURange Cloud
            </h1>
            <p className="text-2xl text-gray-300 max-w-3xl animate-fade-in-up">
              Master cybersecurity through hands-on challenges, compete in CTFs, and join a community of security enthusiasts.
            </p>
            <div className="flex gap-4 mt-8 animate-fade-in-up" style={{ animationDelay: '200ms' }}>
              <Link href="/competitions">
                <Button size="lg" className="bg-green-600 hover:bg-green-700 transform transition-all hover:scale-105">
                  Start Learning
                  <ArrowRight className="ml-2 h-5 w-5 animate-bounce-x" />
                </Button>
              </Link>
              <Link href="/competitions/join">
                <Button size="lg" variant="outline" className="border-purple-500 text-purple-400 hover:bg-green-950/20 transform transition-all hover:scale-105">
                  Join Competition
                  <Trophy className="ml-2 h-5 w-5 animate-pulse" />
                </Button>
              </Link>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-8 mt-20">
            <div className="group bg-black/40 backdrop-blur-sm p-8 rounded-xl border border-green-900/50 hover:border-green-500/50 transition-all hover:transform hover:scale-105 animate-fade-in-up" style={{ animationDelay: '400ms' }}>
              <Shield className="h-12 w-12 text-green-400 mb-4 transform transition-all group-hover:scale-110 group-hover:rotate-12" />
              <h3 className="text-xl font-semibold text-white mb-2 group-hover:text-green-400 transition-colors">Learn Cybersecurity</h3>
              <p className="text-gray-400">
                Practice with real-world scenarios and learn essential security concepts through interactive challenges.
              </p>
            </div>

            <div className="group bg-black/40 backdrop-blur-sm p-8 rounded-xl border border-green-900/50 hover:border-purple-500/50 transition-all hover:transform hover:scale-105 animate-fade-in-up" style={{ animationDelay: '600ms' }}>
              <Trophy className="h-12 w-12 text-purple-400 mb-4 transform transition-all group-hover:scale-110 group-hover:rotate-12" />
              <h3 className="text-xl font-semibold text-white mb-2 group-hover:text-purple-400 transition-colors">Compete in CTFs</h3>
              <p className="text-gray-400">
                Test your skills against others in our Capture The Flag competitions and climb the global leaderboard.
              </p>
            </div>

            <div className="group bg-black/40 backdrop-blur-sm p-8 rounded-xl border border-green-900/50 hover:border-green-500/50 transition-all hover:transform hover:scale-105 animate-fade-in-up" style={{ animationDelay: '800ms' }}>
              <Users className="h-12 w-12 text-green-400 mb-4 transform transition-all group-hover:scale-110 group-hover:rotate-12" />
              <h3 className="text-xl font-semibold text-white mb-2 group-hover:text-green-400 transition-colors">Join Community</h3>
              <p className="text-gray-400">
                Connect with other security enthusiasts, share knowledge, and grow together in our active community.
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

