'use client'

import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, ArrowLeft, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { SkeletonStats, SkeletonChartCard } from "@/components/ui/skeletons/SkeletonStats";

export default function Loading() {
  return (
    <div className="flex-1 space-y-4 p-4 pt-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" asChild>
            <Link href="/dashboard">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h2 className="text-3xl font-bold tracking-tight">Monitoring Service</h2>
        </div>
      </div>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <SkeletonStats 
          count={3}
          hasHeader={true}
          headerText="Status"
          className="col-span-1"
        />
        
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Metrics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                <SkeletonStats 
                  count={1}
                  hasHeader={true}
                  headerText="Total Series"
                  className="col-span-1"
                />
                
                <SkeletonStats 
                  count={1}
                  hasHeader={true}
                  headerText="Scrape Targets"
                  className="col-span-1"
                />
                
                <SkeletonStats 
                  count={1}
                  hasHeader={true}
                  headerText="Active Targets"
                  className="col-span-1"
                />
              </div>

              <SkeletonStats 
                count={3}
                hasHeader={true}
                headerText="Components"
                className="col-span-1"
              />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Add Chart Placeholders */}
      <div className="grid gap-4 md:grid-cols-2">
        <SkeletonChartCard height={250} className="col-span-1" />
        <SkeletonChartCard height={250} className="col-span-1" />
      </div>
    </div>
  );
} 