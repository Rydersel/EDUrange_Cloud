'use client'

import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SkeletonTable } from "@/components/ui/skeletons/SkeletonTable";

export default function ChallengeDetailLoading() {
  return (
    <div className="flex flex-col space-y-8">
      {/* Header with Challenge Name and Description */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-3/4 max-w-md" />
        <Skeleton className="h-5 w-full max-w-2xl" />
      </div>

      {/* Challenge Tabs */}
      <Tabs defaultValue="details" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="instances">Instances</TabsTrigger>
          <TabsTrigger value="submissions">Submissions</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="space-y-6">
          {/* Challenge Details Card */}
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-6 w-64" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-6 w-40" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-6 w-28" />
              </div>
            </CardContent>
          </Card>

          {/* Challenge Description Card */}
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-40" />
            </CardHeader>
            <CardContent className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-4 w-full" />
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="instances">
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
            </CardHeader>
            <CardContent>
              <SkeletonTable rowCount={3} />
            </CardContent>
            <CardFooter className="flex justify-between">
              <Skeleton className="h-9 w-32" />
              <Skeleton className="h-9 w-32" />
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="submissions">
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
            </CardHeader>
            <CardContent>
              <SkeletonTable rowCount={3} columnCount={3} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
} 