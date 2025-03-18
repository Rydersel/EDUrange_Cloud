import { redirect } from 'next/navigation';

interface LoginPageProps {
  searchParams: Promise<{ callbackUrl?: string }>;
}

export default async function LoginPage({
  searchParams,
}: LoginPageProps) {
  const resolvedParams = await searchParams;
  const callbackUrl = resolvedParams.callbackUrl || '/home';
  const redirectUrl = `/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`;
  
  redirect(redirectUrl);
} 