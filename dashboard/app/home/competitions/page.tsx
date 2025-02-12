import { getServerSession } from "next-auth/next";
import authConfig from "@/auth.config";
import { redirect } from "next/navigation";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import Link from "next/link";

export default async function CompetitionsPage() {
  const session = await getServerSession(authConfig);

  if (!session) {
    redirect('/');
  }

  return (
    <ScrollArea className="h-full">
      <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Competitions</h2>
            <p className="text-muted-foreground">
              Manage and participate in CTF competitions
            </p>
          </div>
          <Link href="/dashboard/app/home/competitions/create">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create Competition
            </Button>
          </Link>
        </div>

        <Tabs defaultValue="all" className="space-y-4">
          <TabsList>
            <TabsTrigger value="all">All Competitions</TabsTrigger>
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
            <TabsTrigger value="past">Past</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {/* Competition cards will be populated here */}
              <Card>
                <CardHeader>
                  <CardTitle>Sample Competition</CardTitle>
                  <CardDescription>Starts Jan 1, 2024</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Participants</span>
                      <span className="text-sm font-medium">24</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Challenges</span>
                      <span className="text-sm font-medium">12</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Total Points</span>
                      <span className="text-sm font-medium">1000</span>
                    </div>
                    <Button className="w-full mt-4">View Details</Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="active" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {/* Active competitions will be shown here */}
            </div>
          </TabsContent>

          <TabsContent value="upcoming" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {/* Upcoming competitions will be shown here */}
            </div>
          </TabsContent>

          <TabsContent value="past" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {/* Past competitions will be shown here */}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </ScrollArea>
  );
}
