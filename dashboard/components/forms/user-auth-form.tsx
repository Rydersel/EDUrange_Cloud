'use client';

import GoogleSignInButton from '../github-auth-button';
import Link from 'next/link';

export default function UserAuthForm() {
  return (
    <div className="p-6 w-full max-w-md">
        <div className="flex flex-col space-y-2 text-center mb-4">
            <h1 className="text-2xl font-semibold tracking-tight text-white">
                Welcome to EDUrange Cloud
            </h1>
            <p className="bg-clip-text text-transparent drop-shadow-2xl bg-gradient-to-b from-white/80 to-white/20">
                Login with one of our supported providers
            </p>
            <p className="text-sm text-gray-400">

            </p>
        </div>

        <GoogleSignInButton/>


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
