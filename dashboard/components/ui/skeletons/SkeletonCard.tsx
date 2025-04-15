'use client'

import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";

interface SkeletonCardProps {
  className?: string;
  hasFooter?: boolean;
  hasImage?: boolean;
  imageHeight?: number;
  hasDescription?: boolean;
  descriptionLines?: number;
}

export function SkeletonCard({
  className,
  hasFooter = true,
  hasImage = false,
  imageHeight = 150,
  hasDescription = true,
  descriptionLines = 3
}: SkeletonCardProps) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      {hasImage && (
        <div className="w-full" style={{ height: `${imageHeight}px` }}>
          <Skeleton className="h-full w-full rounded-t-lg rounded-b-none" />
        </div>
      )}
      <CardHeader className="pb-2">
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="mt-2 h-4 w-1/2" />
      </CardHeader>
      <CardContent className="pb-4">
        {hasDescription && (
          <div className="space-y-2">
            {Array.from({ length: descriptionLines }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        )}
        
        <div className="mt-4 flex items-center justify-between">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-16" />
        </div>
      </CardContent>
      
      {hasFooter && (
        <CardFooter className="flex justify-between border-t p-4">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-24" />
        </CardFooter>
      )}
    </Card>
  );
} 