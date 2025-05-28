'use client';
import React from 'react';
import { SessionProvider, SessionProviderProps } from 'next-auth/react';

export default function Providers({
  session,
  children
}: {
  session: SessionProviderProps['session'];
  children: React.ReactNode;
}) {
  return (
    <>
      <SessionProvider session={session}>{children}</SessionProvider>
    </>
  );
}
