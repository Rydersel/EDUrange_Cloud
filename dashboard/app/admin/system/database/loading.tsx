'use client'

import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SkeletonStats } from "@/components/ui/skeletons/SkeletonStats";
import { SkeletonTable } from "@/components/ui/skeletons/SkeletonTable";

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
          <h2 className="text-3xl font-bold tracking-tight">Database</h2>
        </div>
      </div>
      
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="tables">Tables</TabsTrigger>
          <TabsTrigger value="connection-pool">Connection Pool</TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <SkeletonStats 
              count={3}
              hasHeader={true}
              headerText="Status"
              className="col-span-1"
            />
            
            <Card>
              <CardHeader>
                <CardTitle>Connections</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Active Connections:</span>
                  <Skeleton className="h-7 w-10" />
                </div>
              </CardContent>
            </Card>
            
            <SkeletonStats 
              count={4}
              hasHeader={true}
              headerText="Services"
              className="col-span-1"
            />
          </div>
          
          <div className="mt-6">
            <h3 className="text-lg font-medium mb-4">PostgreSQL Detailed Metrics</h3>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <SkeletonStats 
                count={2}
                hasHeader={true}
                headerText="Performance"
                className="col-span-1"
              />
              
              <SkeletonStats 
                count={1}
                hasHeader={true}
                headerText="Storage"
                className="col-span-1"
              />
              
              <SkeletonStats 
                count={3}
                hasHeader={true}
                headerText="PostgreSQL Info"
                className="col-span-1"
              />
            </div>
          </div>
        </TabsContent>
        
        <TabsContent value="tables" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Database Tables</CardTitle>
              <Skeleton className="h-4 w-3/4 mt-2" />
            </CardHeader>
            <CardContent>
              <SkeletonTable rowCount={5} columnCount={4} />
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="connection-pool" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>PgBouncer Connection Pool</CardTitle>
              <Skeleton className="h-4 w-3/4 mt-2" />
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <SkeletonStats 
                    count={1}
                    hasHeader={true}
                    headerText="Status"
                    className="col-span-1"
                  />
                  
                  <SkeletonStats 
                    count={1}
                    hasHeader={true}
                    headerText="Version"
                    className="col-span-1"
                  />
                  
                  <SkeletonStats 
                    count={1}
                    hasHeader={true}
                    headerText="Uptime"
                    className="col-span-1"
                  />
                  
                  <SkeletonStats 
                    count={1}
                    hasHeader={true}
                    headerText="Active Connections"
                    className="col-span-1"
                  />
                </div>
                
                <SkeletonTable rowCount={5} columnCount={5} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
} 