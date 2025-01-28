'use client';

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { UserNav } from '@/components/layout/user-nav'
import ThemeToggle from '@/components/layout/ThemeToggle/theme-toggle'

export function MainNavigation() {
  const pathname = usePathname()

  return (
    <nav className="bg-background border-b">
      <div className="max-w-7xl mx-auto flex items-center px-4 relative">
        <div className="absolute left-4">
          <span className="text-sm font-light tracking-wider text-foreground dark:text-white opacity-70">
            EDURange Cloud
          </span>
        </div>
        <ul className="flex -mb-px mx-auto">
          {[
            { name: "Home", path: "/" },
            { name: "Challenges", path: "/challenges" },
            { name: "Competitions", path: "/competitions" },
            { name: "Leaderboard", path: "/leaderboard" },
            { name: "Profile", path: "/profile" },
            { name: "Admin", path: "/dashboard" },
          ].map((item) => (
            <li key={item.name}>
              <Link
                href={item.path}
                className={`inline-flex items-center px-6 py-4 border-b-[3px] text-base font-semibold transition-all relative
                  ${pathname === item.path
                    ? "border-blue-500 text-blue-500 dark:border-blue-400 dark:text-blue-400"
                    : "border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white hover:border-gray-300 dark:hover:border-gray-500"
                  }
                `}
              >
                {item.name}
              </Link>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-4 py-2">
          <UserNav />
          <ThemeToggle />
        </div>
      </div>
    </nav>
  )
}

