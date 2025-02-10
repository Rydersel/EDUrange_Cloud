'use client';

import { useState } from 'react';
import {
  ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
} from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { columns } from './columns';
import { ActivityEventType } from '@prisma/client';
import { useRouter, useSearchParams } from 'next/navigation';
import { subHours, subDays, startOfDay, formatISO } from 'date-fns';

interface LogTableProps {
  data: any[];
  pageCount: number;
  pageNo: number;
  totalLogs: number;
}

const timeFrames = [
  { value: '1h', label: 'Last Hour', getFn: () => subHours(new Date(), 1) },
  { value: '24h', label: 'Last 24 Hours', getFn: () => subHours(new Date(), 24) },
  { value: '7d', label: 'Last 7 Days', getFn: () => subDays(new Date(), 7) },
  { value: '30d', label: 'Last 30 Days', getFn: () => subDays(new Date(), 30) },
  { value: 'all', label: 'All Time', getFn: () => null }
];

export function LogTable({
  data,
  pageCount,
  pageNo,
  totalLogs,
}: LogTableProps) {
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const router = useRouter();
  const searchParams = useSearchParams();

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    state: {
      columnFilters,
    },
  });

  const handleTimeFrameChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    const timeFrame = timeFrames.find(tf => tf.value === value);
    
    if (timeFrame) {
      const startDate = timeFrame.getFn();
      if (startDate) {
        params.set('startDate', formatISO(startDate));
        params.set('endDate', formatISO(new Date()));
      } else {
        params.delete('startDate');
        params.delete('endDate');
      }
      
      // Reset to first page when changing time frame
      params.set('page', '1');
      
      router.push(`/dashboard/logs?${params.toString()}`);
    }
  };

  return (
    <div>
      <div className="flex items-center py-4 gap-2">
        <Input
          placeholder="Filter users..."
          value={(table.getColumn('user')?.getFilterValue() as string) ?? ''}
          onChange={(event) =>
            table.getColumn('user')?.setFilterValue(event.target.value)
          }
          className="max-w-sm"
        />
        <Select
          value={(table.getColumn('eventType')?.getFilterValue() as string) ?? ''}
          onValueChange={(value) =>
            table.getColumn('eventType')?.setFilterValue(value)
          }
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select event type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Events</SelectItem>
            {Object.entries(ActivityEventType).map(([key, value]) => (
              <SelectItem key={key} value={value}>
                {value.replace(/_/g, ' ')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          defaultValue="all"
          onValueChange={handleTimeFrameChange}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select time frame" />
          </SelectTrigger>
          <SelectContent>
            {timeFrames.map((timeFrame) => (
              <SelectItem key={timeFrame.value} value={timeFrame.value}>
                {timeFrame.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  No logs found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-end space-x-2 py-4">
        <div className="text-sm text-muted-foreground">
          Page {pageNo} of {pageCount}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const params = new URLSearchParams(searchParams.toString());
            params.set('page', String(pageNo - 1));
            router.push(`/dashboard/logs?${params.toString()}`);
          }}
          disabled={pageNo <= 1}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const params = new URLSearchParams(searchParams.toString());
            params.set('page', String(pageNo + 1));
            router.push(`/dashboard/logs?${params.toString()}`);
          }}
          disabled={pageNo >= pageCount}
        >
          Next
        </Button>
      </div>
    </div>
  );
} 