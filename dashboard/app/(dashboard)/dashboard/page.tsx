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

export default async function page() {
  const session = await getServerSession(authConfig);
  if (!session) {
    redirect('/'); // Redirect to sign-in page if not authenticated
  }


  return (


      <ScrollArea className="h-full">
        <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
          <div className="flex items-center justify-between space-y-2">
            <h2 className="text-3xl font-bold tracking-tight">
              Dashboard
            </h2>

          </div>
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="analytics" disabled>
                Analytics
              </TabsTrigger>
            </TabsList>
            <TabsContent value="overview" className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                      Points
                    </CardTitle>
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        className="h-4 w-4 text-muted-foreground"
                    >
                      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                    </svg>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">9999</div>

                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                      Players
                    </CardTitle>
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        className="h-4 w-4 text-muted-foreground"
                    >
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                      <circle cx="9" cy="7" r="4"/>
                      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
                    </svg>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">9999</div>

                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Another Piece of Data</CardTitle>
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        className="h-4 w-4 text-muted-foreground"
                    >
                      <rect width="20" height="14" x="2" y="5" rx="2"/>
                      <path d="M2 10h20"/>
                    </svg>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">9999</div>
                    <p className="text-xs text-muted-foreground">
                      This is some data
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                      Active Now
                    </CardTitle>
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        className="h-4 w-4 text-muted-foreground"
                    >
                      <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
                    </svg>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">+573</div>
                    <p className="text-xs text-muted-foreground">
                      +201 since last hour
                    </p>
                  </CardContent>
                </Card>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-7">
                <Card className="col-span-4 width-full">
                   <GlobePoints></GlobePoints>
                </Card>
                <Card className="col-span-4 md:col-span-3">
                  <CardHeader>
                    <CardTitle>Leaderboard</CardTitle>
                    <CardDescription>
                      The leaderboard resets every month
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <RecentSales/>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>
  );
}
