import { prisma } from '@/lib/prisma';
import BreadCrumb from '@/components/breadcrumb';
import { columns } from '@/components/tables/user-tables/columns';
import { UserTable } from '@/components/tables/user-tables/user-table';
import { Heading } from '@/components/ui/heading';
import { Separator } from '@/components/ui/separator';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth/next';
import authConfig from '@/auth.config';

const breadcrumbItems = [{ title: 'Users', link: '/dashboard/users' }];
type ParamsProps = {
  searchParams: {
    [key: string]: string | string[] | undefined;
  };
};

export default async function Page({ searchParams }: ParamsProps) {
  const page = Number(searchParams.page) || 1;
  const pageLimit = Number(searchParams.limit) || 10;
  const offset = (page - 1) * pageLimit;

  const users = await prisma.user.findMany({
    skip: offset,
    take: pageLimit,
    include: {
      sessions: true,
    },
  });
  const session = await getServerSession(authConfig);

   if (!session) {
    redirect('/'); // Redirect to sign-in page if not authenticated
  }

  const totalUsers = await prisma.user.count();
  const pageCount = Math.ceil(totalUsers / pageLimit);

  return (
    <>
      <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
        <BreadCrumb items={breadcrumbItems} />

        <div className="flex items-start justify-between">
          <Heading
            title={`Users (${totalUsers})`}
            description="Manage users (Via Prisma DB)"
          />
        </div>
        <Separator />

        <UserTable
          searchKey="email"
          pageNo={page}
          columns={columns}
          totalUsers={totalUsers}
          data={users}
          pageCount={pageCount}
        />
      </div>
    </>
  );
}
