import BreadCrumb from '@/components/breadcrumb';
import { columns } from '@/components/tables/user-tables/columns';
import { UserTable } from '@/components/tables/user-tables/user-table';
import { Heading } from '@/components/ui/heading';
import { Separator } from '@/components/ui/separator';
import { PrismaClient } from '@prisma/client';
import { redirect } from 'next/navigation';
import { session } from 'next-auth/core/routes';

const prisma = new PrismaClient();

const breadcrumbItems = [{ title: 'Users', link: '/dashboard/users' }];

type paramsProps = {
  searchParams: {
    [key: string]: string | string[] | undefined;
  };
};

export default async function Page({ searchParams }: paramsProps) {
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

  const user = await prisma.user.findUnique({ where: { email: session.user.email } });

  if (!session || !user.admin) {
    redirect('/invalid-permission'); // Redirect if not admin
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
            description="Manage Users (Via PRISMA DB) "
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
