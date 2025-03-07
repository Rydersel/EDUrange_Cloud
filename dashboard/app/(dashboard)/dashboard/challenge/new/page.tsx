import { getServerSession } from 'next-auth/next';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import BreadCrumb from '@/components/breadcrumb';
import NewChallengeForm from '@/components/forms/NewChallengeForm'; // Import the client component
import authConfig from '@/auth.config';
import {requireAdminAccess} from "@/lib/auth-utils";
const breadcrumbItems = [
  { title: 'Challenges', link: '/dashboard/challenge' },
  { title: 'Create', link: '/dashboard/challenge/new' }
];

export default async function NewChallengePage() {
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
    <div className="flex flex-col h-screen overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 pt-6 md:p-8 bg-black text-white">
        <BreadCrumb items={breadcrumbItems} />
        <NewChallengeForm userId={user.id} /> {/* Pass user ID as prop */}
      </div>
    </div>
  );
}
