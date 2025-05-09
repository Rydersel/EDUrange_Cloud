import { getServerSession } from 'next-auth/next';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import BreadCrumb from '@/components/navigation/breadcrumb';
import InstanceComponent from './InstanceComponent'; // Import the client component
import authConfig from '@/auth.config';
import type { Metadata } from 'next';
import {requireAdminAccess} from "@/lib/auth-utils";

export const metadata: Metadata = {
  title: 'Challenge Instances | EDUrange Cloud',
  description: 'Manage active challenge instances'
};

const breadcrumbItems = [{ title: 'Challenge Instances', link: '/dashboard/challenge' }];

export default async function ChallengesPage() {
  await requireAdminAccess()
  const session = await getServerSession(authConfig);
  if (!session) {
    redirect('/'); // Redirect to sign-in page if not authenticated
  }

  // @ts-ignore
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });

  if (!user  || !user.role.includes('ADMIN')) {
    redirect('/invalid-permission'); // Redirect if not admin
  }

  return (
    <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
      <BreadCrumb items={breadcrumbItems} />
      <InstanceComponent />

    </div>
  );
}
