'use client'

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

const InvalidPermissionPage = () => {
  const router = useRouter();

  const handleReturnHome = () => {
    router.push('/dashboard');
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black">
      <h1 className="text-5xl font-bold text-white">Invalid Permission</h1>
      <p className="mt-4 text-xl">You need admin to access this page.</p>
      <Button className="mt-6" onClick={handleReturnHome}>
        Return Home
      </Button>
    </div>
  );
};

export default InvalidPermissionPage;
