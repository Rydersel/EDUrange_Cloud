import { RecentSales } from '@/components/recent-sales';
import { GlobePoints } from '@/components/ui/globe-points';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {redirect} from "next/navigation";
import {getServerSession} from "next-auth/next";
import authConfig from "@/auth.config";
import React from "react";

export default async function page() {
  const session = await getServerSession(authConfig);
  if (!session) {
    redirect('/'); // Redirect to sign-in page if not authenticated
  }


   return (
    <div className="flex-1 space-y-4 p-4 pt-6">
      <Card className="w-full" style={{ backgroundColor: '#0f2818', borderColor: '#2a623d' }}>
        <CardHeader>
          <CardTitle className="text-2xl font-bold" style={{ color: '#39FF14' }}>
            Welcome to EDURange Cloud
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-lg" style={{ color: '#ffffff' }}>
            This is a placeholder page
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
