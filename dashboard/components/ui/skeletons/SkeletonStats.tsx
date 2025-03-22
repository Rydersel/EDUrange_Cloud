'use client'

import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

interface SkeletonStatsProps {
  className?: string;
  count?: number;
  hasHeader?: boolean;
  headerText?: string;
}

export function SkeletonStats({
  className,
  count = 3,
  hasHeader = true,
  headerText
}: SkeletonStatsProps) {
  return (
    <Card className={cn("", className)}>
      {hasHeader && (
        <CardHeader className="pb-2">
          {headerText ? (
            <h3 className="text-lg font-medium">{headerText}</h3>
          ) : (
            <Skeleton className="h-6 w-1/3" />
          )}
        </CardHeader>
      )}
      <CardContent>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: count }).map((_, i) => (
            <div key={i} className="flex flex-col space-y-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-8 w-5/6" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function SkeletonChartCard({
  className,
  height = 250,
  hasHeader = true,
}: {
  className?: string;
  height?: number;
  hasHeader?: boolean;
}) {
  return (
    <Card className={cn("", className)}>
      {hasHeader && (
        <CardHeader className="pb-2">
          <Skeleton className="h-6 w-1/3" />
        </CardHeader>
      )}
      <CardContent>
        <Skeleton className="h-[250px] w-full" style={{ height: `${height}px` }} />
      </CardContent>
    </Card>
  );
} 