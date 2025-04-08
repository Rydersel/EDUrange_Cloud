'use client'

import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SkeletonTable } from "@/components/ui/skeletons/SkeletonTable";
import { SkeletonCard } from "@/components/ui/skeletons/SkeletonCard";

export default function CompetitionDetailLoading() {
  return (
    <div className="flex flex-col space-y-8">
      {/* Header with Competition Name */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-3/4 max-w-md" />
        <Skeleton className="h-5 w-full max-w-2xl" />
      </div>

      {/* Competition Status and Info */}
      <div className="flex flex-wrap gap-4">
        <Card className="w-full md:w-auto md:min-w-[250px]">
          <CardHeader className="pb-2">
            <Skeleton className="h-5 w-24" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-6 w-32" />
          </CardContent>
        </Card>
        
        <Card className="w-full md:w-auto md:min-w-[250px]">
          <CardHeader className="pb-2">
            <Skeleton className="h-5 w-24" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-6 w-32" />
          </CardContent>
        </Card>
        
        <Card className="w-full md:w-auto md:min-w-[250px]">
          <CardHeader className="pb-2">
            <Skeleton className="h-5 w-24" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-6 w-32" />
          </CardContent>
        </Card>
      </div>

      {/* Competition Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="challenges">Challenges</TabsTrigger>
          <TabsTrigger value="participants">Participants</TabsTrigger>
          <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-40" />
            </CardHeader>
            <CardContent className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-4 w-full" />
              ))}
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-40" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-[200px] w-full" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="challenges" className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </TabsContent>

        <TabsContent value="participants">
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
            </CardHeader>
            <CardContent>
              <SkeletonTable rowCount={5} columnCount={3} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="leaderboard">
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
            </CardHeader>
            <CardContent>
              <SkeletonTable rowCount={5} columnCount={4} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
} 