'use client';

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { UserNav } from '@/components/layout/user-nav'
import ThemeToggle from '@/components/layout/ThemeToggle/theme-toggle'
import { useSession } from 'next-auth/react';
import { devLog } from '@/lib/logger';

export function MainNavigation() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  
  devLog('Full Session Data:', session);
  devLog('Session User:', session?.user);

  // Get user role from session
  const userRole = session?.user?.role;
  const isAdminOrInstructor = userRole === 'ADMIN' || userRole === 'INSTRUCTOR';

  devLog('Session Status:', status);
  devLog('User Role:', userRole);
  devLog('Is Admin or Instructor:', isAdminOrInstructor);

  const navigationItems = [
    { name: "Home", path: "/home" },
    { name: "Competitions", path: "/competitions" }
  ];

  // Add admin item if user is admin/instructor
  if (status === 'authenticated' && isAdminOrInstructor) {
    navigationItems.push({ name: "Admin", path: "/admin" });
  }

  return (
    <nav className="bg-background border-b">
      <div className="max-w-7xl mx-auto flex items-center px-4 relative">
        <div className="absolute left-4">
          <Link href="/home" className="text-sm font-light tracking-wider text-foreground dark:text-white opacity-70 hover:opacity-100 hover:text-green-400 transition-all">
            EDURange Cloud
          </Link>
        </div>
        <ul className="flex -mb-px mx-auto">
          {navigationItems.map((item) => (
            <li key={item.name}>
              <Link
                href={item.path}
                className={`inline-flex items-center px-6 py-4 text-base font-semibold transition-all relative
                  ${pathname === item.path
                    ? "text-green-400 dark:text-green-400 after:absolute after:bottom-0 after:left-0 after:w-full after:h-[3px] after:bg-green-500 after:shadow-[0_4px_6px_-1px_rgba(34,197,94,0.4)] dark:after:shadow-[0_4px_8px_-1px_rgba(34,197,94,0.6)]"
                    : "border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-green-400 after:absolute after:bottom-0 after:left-0 after:w-full after:h-[3px] after:bg-transparent hover:after:bg-gray-300 dark:hover:after:bg-green-500/50"
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

