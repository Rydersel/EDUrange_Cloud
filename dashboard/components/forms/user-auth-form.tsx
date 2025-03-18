'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import GitHubAuthButton from '../github-auth-button';
import DevAuthForm from './dev-auth-form';

// Server-side environment check
const isDevelopment = process.env.NODE_ENV !== 'production';

export default function UserAuthForm() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/home';
  
  // Redirect to home if already authenticated
  useEffect(() => {
    if (status === 'authenticated' && session) {
      router.push('/home');
    }
  }, [status, session, router]);

  // If loading or already authenticated, show a loading state
  if (status === 'loading') {
    return (
      <div className="p-6 w-full max-w-md flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }
  
  // If already authenticated, don't show the form
  if (status === 'authenticated') {
    return null;
  }

  return (
    <div className="p-6 w-full max-w-md">
      <div className="flex flex-col space-y-2 text-center mb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-white">
          Welcome to EDURange Cloud
        </h1>
        <p className="bg-clip-text text-transparent drop-shadow-2xl bg-gradient-to-b from-white/80 to-white/20">
          Login with one of our supported providers
        </p>
      </div>

      {isDevelopment ? (
        <Tabs defaultValue="github" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="github">GitHub</TabsTrigger>
            <TabsTrigger value="dev">Development</TabsTrigger>
          </TabsList>
          
          <TabsContent value="github">
            <GitHubAuthButton callbackUrl={callbackUrl} />
          </TabsContent>
          
          <TabsContent value="dev">
            <DevAuthForm callbackUrl={callbackUrl} />
          </TabsContent>
        </Tabs>
      ) : (
        <GitHubAuthButton callbackUrl={callbackUrl} />
      )}

      <p className="px-8 text-center text-sm text-gray-400 mt-4">
        By clicking continue, you agree to our{' '}
        <Link
          href="/terms"
          className="underline underline-offset-4 hover:text-primary"
        >
          Terms of Service
        </Link>{' '}
        and{' '}
        <Link
          href="/privacy"
          className="underline underline-offset-4 hover:text-primary"
        >
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  );
}
