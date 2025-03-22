'use client';

import { useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Button } from './button';
import { Icons } from '../icons';

interface GitHubAuthButtonProps {
  callbackUrl?: string;
}

export default function GoogleSignInButton({ callbackUrl }: GitHubAuthButtonProps) {
  const searchParams = useSearchParams();
  const defaultCallbackUrl = searchParams.get('callbackUrl');

  // Use the prop if provided, otherwise use the URL param, or fall back to home
  const finalCallbackUrl = callbackUrl || defaultCallbackUrl || '/home';

  return (
    <Button
      className="w-full"
      variant="outline"
      type="button"
      onClick={() =>
        signIn('github', { callbackUrl: finalCallbackUrl })
      }
    >
      <Icons.gitHub className="mr-2 h-4 w-4" />
      Continue with Github
    </Button>
  );
}
