import { getServerSession } from 'next-auth/next';
import { redirect } from 'next/navigation';
import BreadCrumb from '@/components/navigation/breadcrumb';
import { Heading } from '@/components/ui/heading';
import { Separator } from '@/components/ui/separator';
import authConfig from '@/auth.config';
import { requireAdminAccess } from "@/lib/auth-utils";
import TypeInstallerClient from './client';

const breadcrumbItems = [
  { title: 'Dashboard', link: '/admin' },
  { title: 'Type Installer', link: '/admin/type-installer' }
];

export default async function TypeInstallerPage() {
  await requireAdminAccess();
  const session = await getServerSession(authConfig);

  if (!session) {
    redirect('/'); // Redirect to sign-in page if not authenticated
  }

  return (
    <div className="flex-1 space-y-4 p-4 pt-6 pb-24 md:p-8 md:pb-32">
      <BreadCrumb items={breadcrumbItems} />

      <div className="flex items-start justify-between">
        <Heading
          title="Challenge Type Installer"
          description="Upload and install challenge type definitions (CTD) to the platform"
        />
      </div>
      <Separator />

      <TypeInstallerClient />
    </div>
  );
} 