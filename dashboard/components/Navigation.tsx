import React from 'react'
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import { useSession } from 'next-auth/react';
import { navItems } from '@/constants/data';

export function Navigation() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'ADMIN';

  return (
    <nav className="flex items-center space-x-4 lg:space-x-6">
      {navItems
        .filter((route) => !route.adminOnly || isAdmin)
        .map((route) => (
          <Link
            key={route.href}
            href={route.href}
            className={cn(
              buttonVariants({ variant: 'ghost' }),
              pathname === route.href || pathname.startsWith(route.href + '/')
                ? 'bg-muted hover:bg-muted'
                : 'hover:bg-transparent hover:text-primary',
              'justify-start'
            )}
          >
            {route.title}
          </Link>
        ))}
    </nav>
  );
}

