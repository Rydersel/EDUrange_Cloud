import { getServerSession } from 'next-auth/next';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import BreadCrumb from '@/components/navigation/breadcrumb';
import { Heading } from '@/components/ui/heading';
import { Separator } from '@/components/ui/separator';
import authConfig from '@/auth.config';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Shield } from 'lucide-react';
import ChallengeInstallerClient from './client';
import {requireAdminAccess} from "@/lib/auth-utils";

const breadcrumbItems = [
  { title: 'Dashboard', link: '/dashboard' },
  { title: 'Challenge Installer', link: '/dashboard/challenge-installer' }
];

export default async function ChallengeInstallerPage() {

  await requireAdminAccess()
  const session = await getServerSession(authConfig);

  if (!session) {
    redirect('/'); // Redirect to sign-in page if not authenticated
  }


  return (
    <div className="flex-1 space-y-4 p-4 pt-6 pb-24 md:p-8 md:pb-32">
      <BreadCrumb items={breadcrumbItems} />

      <div className="flex items-start justify-between">
        <Heading
          title="Challenge Installer"
          description="Upload and install challenge modules to the platform"
        />
      </div>
      <Separator />

      <ChallengeInstallerClient />
    </div>
  );
}
