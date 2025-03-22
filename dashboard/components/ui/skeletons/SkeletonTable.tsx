'use client'

import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface SkeletonTableProps {
  className?: string;
  rowCount?: number;
  columnCount?: number;
  showHeader?: boolean;
  hasActions?: boolean;
}

export function SkeletonTable({
  className,
  rowCount = 5,
  columnCount = 4,
  showHeader = true,
  hasActions = true
}: SkeletonTableProps) {
  return (
    <div className={cn("border rounded-md", className)}>
      <Table>
        {showHeader && (
          <TableHeader>
            <TableRow>
              {Array.from({ length: columnCount }).map((_, i) => (
                <TableHead key={i} className={cn(i === 0 ? "w-[200px]" : "")}>
                  <Skeleton className="h-6 w-3/4 my-2" />
                </TableHead>
              ))}
              {hasActions && (
                <TableHead className="text-right">
                  <Skeleton className="h-6 w-1/2 my-2 ml-auto" />
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
        )}
        <TableBody>
          {Array.from({ length: rowCount }).map((_, rowIndex) => (
            <TableRow key={rowIndex}>
              {Array.from({ length: columnCount }).map((_, colIndex) => (
                <TableCell key={colIndex}>
                  <Skeleton className="h-5 w-full" />
                </TableCell>
              ))}
              {hasActions && (
                <TableCell className="text-right">
                  <div className="flex justify-end space-x-2">
                    <Skeleton className="h-8 w-8 rounded-md" />
                    <Skeleton className="h-8 w-8 rounded-md" />
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
} 