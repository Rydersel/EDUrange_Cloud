import { prisma } from '@/lib/prisma';
import BreadCrumb from '@/components/breadcrumb';
import { columns } from '@/components/tables/log-tables/columns';
import { LogTable } from '@/components/tables/log-tables/log-table';
import { Heading } from '@/components/ui/heading';
import { Separator } from '@/components/ui/separator';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth/next';
import authConfig from '@/auth.config';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Shield } from 'lucide-react';
import { ActivityEventType, Prisma } from '@prisma/client';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Database, Upload } from 'lucide-react';

const breadcrumbItems = [{ title: 'Logs', link: '/dashboard/logs' }];

type ParamsProps = {
  searchParams: {
    [key: string]: string | string[] | undefined;
  };
};

export default async function Page({ searchParams }: ParamsProps) {
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
            You do not have permission to view this page. Only administrators can access system logs.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const page = Number(searchParams.page) || 1;
  const pageLimit = Number(searchParams.limit) || 20;
  const eventType = searchParams.eventType as ActivityEventType | undefined;
  const userId = searchParams.userId as string | undefined;
  const startDate = searchParams.startDate ? new Date(searchParams.startDate as string) : undefined;
  const endDate = searchParams.endDate ? new Date(searchParams.endDate as string) : undefined;
  const offset = (page - 1) * pageLimit;

  // Build the where clause for filtering
  const where: Prisma.ActivityLogWhereInput = {
    ...(eventType && { eventType }),
    ...(userId && { userId }),
    ...(startDate || endDate) && {
      timestamp: {
        ...(startDate && { gte: startDate }),
        ...(endDate && { lte: endDate })
      }
    }
  };

  const logs = await prisma.activityLog.findMany({
    where,
    skip: offset,
    take: pageLimit,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true
        }
      }
    },
    orderBy: {
      timestamp: 'desc'
    }
  });

  const totalLogs = await prisma.activityLog.count({ where });
  const pageCount = Math.ceil(totalLogs / pageLimit);

  return (
    <>
      <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
        <BreadCrumb items={breadcrumbItems} />

        <div className="flex items-start justify-between">
          <Heading
            title={`System Logs (${totalLogs})`}
            description="View and analyze system activity logs"
          />
        </div>
        <Separator />

        <LogTable
          data={logs}
          pageCount={pageCount}
          pageNo={page}
          totalLogs={totalLogs}
        />
      </div>
    </>
  );
} 