// page.tsx
import React from 'react';
import { CTFHomePageClient } from '@/components/ui/home';
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

interface User {
  name?: string | null
}

interface Session {
  user?: User
}

export default async function Home() {
  const session: Session | null = await getServerSession();
  if (!session) {
    redirect('/');
  }

  return (
    <CTFHomePageClient username={session?.user?.name || undefined} />
  );
}
