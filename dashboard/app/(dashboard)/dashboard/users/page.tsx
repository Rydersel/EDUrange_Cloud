import { prisma } from '@/lib/prisma';
import BreadCrumb from '@/components/breadcrumb';
import { columns } from '@/components/tables/user-tables/columns';
import { UserTable } from '@/components/tables/user-tables/user-table';
import { Heading } from '@/components/ui/heading';
import { Separator } from '@/components/ui/separator';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth/next';
import authConfig from '@/auth.config';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Shield } from 'lucide-react';
import { Prisma, User } from '@prisma/client';

const breadcrumbItems = [{ title: 'Users', link: '/dashboard/users' }];

type ParamsProps = {
  searchParams: Promise<{
    [key: string]: string | string[] | undefined;
  }>;
};

type UserWithRelations = User & {
  sessions: any[];
  memberOf: { id: string; name: string }[];
  instructorGroups: { id: string; name: string }[];
  challengeCompletions: { id: string; pointsEarned: number }[];
};

export default async function Page(props: ParamsProps) {
  const searchParams = await props.searchParams;
  const session = await getServerSession(authConfig);

  if (!session) {
    redirect('/');
  }

  // Check if user is admin
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true }
  });

  if (!user || user.role !== 'ADMIN') {
    return (
      <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
        <Alert variant="destructive">
          <Shield className="h-4 w-4" />
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>
            You do not have permission to view this page. Only administrators can access user management.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const page = Number(searchParams.page) || 1;
  const pageLimit = Number(searchParams.limit) || 10;
  const search = searchParams.search as string | undefined;
  const offset = (page - 1) * pageLimit;

  // Build the where clause for search with proper types
  const where: Prisma.UserWhereInput = search ? {
    OR: [
      { 
        name: { 
          contains: search, 
          mode: 'insensitive'
        } 
      },
      { 
        email: { 
          contains: search, 
          mode: 'insensitive'
        } 
      }
    ]
  } : {};

  const users = await prisma.user.findMany({
    where,
    skip: offset,
    take: pageLimit,
    include: {
      sessions: true,
      memberOf: {
        select: {
          id: true,
          name: true
        }
      },
      instructorGroups: {
        select: {
          id: true,
          name: true
        }
      },
      challengeCompletions: {
        select: {
          id: true,
          pointsEarned: true
        }
      }
    },
    orderBy: {
      createdAt: 'desc'
    }
  }) as UserWithRelations[];

  const totalUsers = await prisma.user.count({ where });
  const pageCount = Math.ceil(totalUsers / pageLimit);

  return (
    <>
      <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
        <BreadCrumb items={breadcrumbItems} />

        <div className="flex items-start justify-between">
          <Heading
            title={`Users (${totalUsers})`}
            description="Manage user accounts and permissions"
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
