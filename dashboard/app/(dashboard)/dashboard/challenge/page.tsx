import { getServerSession } from 'next-auth/next';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import BreadCrumb from '@/components/breadcrumb';
import ChallengesComponent from './ChallengesComponent'; // Import the client component
import authConfig from '@/auth.config';

const breadcrumbItems = [{ title: 'Challenges', link: '/dashboard/challenge' }];

export default async function ChallengesPage() {
  const session = await getServerSession(authConfig);

  if (!session) {
    redirect('/'); // Redirect to sign-in page if not authenticated
  }

  const user = await prisma.user.findUnique({ where: { email: session.user.email } });

  if (!user  || !user.admin) {
    redirect('/invalid-permission'); // Redirect if not admin
  }

  return (
    <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
      <BreadCrumb items={breadcrumbItems} />
      <ChallengesComponent />
    </div>
  );
}
