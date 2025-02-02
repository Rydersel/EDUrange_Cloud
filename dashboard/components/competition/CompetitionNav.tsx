import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { UserNav } from '@/components/layout/user-nav';
import ThemeToggle from '@/components/layout/ThemeToggle/theme-toggle';

interface CompetitionNavProps {
  competitionId: string;
}

export function CompetitionNav({ competitionId }: CompetitionNavProps) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <nav className="bg-background border-b">
      <div className="max-w-7xl mx-auto flex items-center px-4 relative">
        <div className="absolute left-4 flex items-center gap-2">
          <button
            onClick={() => router.back()}
            className="text-sm font-light tracking-wider text-foreground dark:text-white opacity-70 hover:opacity-100 hover:text-green-400 transition-all"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <Link href="/competitions" className="text-sm font-light tracking-wider text-foreground dark:text-white opacity-70 hover:opacity-100 hover:text-green-400 transition-all">
            Back to Competitions
          </Link>
        </div>
        <ul className="flex -mb-px mx-auto">
          <li>
            <Link
              href={`/competitions/${competitionId}`}
              className={`inline-flex items-center px-6 py-4 text-base font-semibold transition-all relative
                ${pathname === `/competitions/${competitionId}`
                  ? "text-green-400 dark:text-green-400 after:absolute after:bottom-0 after:left-0 after:w-full after:h-[3px] after:bg-green-500 after:shadow-[0_4px_6px_-1px_rgba(34,197,94,0.4)] dark:after:shadow-[0_4px_8px_-1px_rgba(34,197,94,0.6)]"
                  : "border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-green-400 after:absolute after:bottom-0 after:left-0 after:w-full after:h-[3px] after:bg-transparent hover:after:bg-gray-300 dark:hover:after:bg-green-500/50"
                }
              `}
            >
              Overview
            </Link>
          </li>
          <li>
            <Link
              href={`/competitions/${competitionId}/challenges`}
              className={`inline-flex items-center px-6 py-4 text-base font-semibold transition-all relative
                ${pathname === `/competitions/${competitionId}/challenges`
                  ? "text-green-400 dark:text-green-400 after:absolute after:bottom-0 after:left-0 after:w-full after:h-[3px] after:bg-green-500 after:shadow-[0_4px_6px_-1px_rgba(34,197,94,0.4)] dark:after:shadow-[0_4px_8px_-1px_rgba(34,197,94,0.6)]"
                  : "border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-green-400 after:absolute after:bottom-0 after:left-0 after:w-full after:h-[3px] after:bg-transparent hover:after:bg-gray-300 dark:hover:after:bg-green-500/50"
                }
              `}
            >
              Challenges
            </Link>
          </li>
          <li>
            <Link
              href={`/competitions/${competitionId}/leaderboard`}
              className={`inline-flex items-center px-6 py-4 text-base font-semibold transition-all relative
                ${pathname === `/competitions/${competitionId}/leaderboard`
                  ? "text-green-400 dark:text-green-400 after:absolute after:bottom-0 after:left-0 after:w-full after:h-[3px] after:bg-green-500 after:shadow-[0_4px_6px_-1px_rgba(34,197,94,0.4)] dark:after:shadow-[0_4px_8px_-1px_rgba(34,197,94,0.6)]"
                  : "border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-green-400 after:absolute after:bottom-0 after:left-0 after:w-full after:h-[3px] after:bg-transparent hover:after:bg-gray-300 dark:hover:after:bg-green-500/50"
                }
              `}
            >
              Leaderboard
            </Link>
          </li>
        </ul>
        <div className="flex items-center gap-4 py-2">
          <UserNav />
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );
} 