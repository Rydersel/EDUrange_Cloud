import { MainNavigation } from '@/components/MainNavigation';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ChevronLeft, Trophy } from 'lucide-react';
import Link from 'next/link';

export default function CompetitionDetailsPage({ params }: { params: { id: string } }) {
  return (
    <div className="min-h-screen bg-background">
      <MainNavigation />
      <main className="container mx-auto p-6">
        <div className="flex items-center space-x-2 mb-6">
          <Link href="/competitions">
            <Button variant="ghost" size="icon">
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-4xl font-bold">Spring CTF 2024</h1>
            <p className="text-xl text-muted-foreground mt-2">
              20 days remaining • 15 participants
            </p>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-4">
          <Card className="md:col-span-1">
            <CardHeader>
              <CardTitle>Your Progress</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Completion</span>
                  <span className="font-medium">45%</span>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: '45%' }} />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Current Rank</span>
                  <span className="font-medium">3rd</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Points Earned</span>
                  <span className="font-medium">450/1000</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Challenges Completed</span>
                  <span className="font-medium">4/8</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="md:col-span-3">
            <Tabs defaultValue="challenges" className="space-y-4">
              <TabsList>
                <TabsTrigger value="challenges">Challenges</TabsTrigger>
                <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
                <TabsTrigger value="activity">Activity</TabsTrigger>
              </TabsList>

              <TabsContent value="challenges" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Available Challenges</CardTitle>
                    <CardDescription>
                      Complete challenges to earn points and climb the leaderboard
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Challenge</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Points</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TableRow>
                          <TableCell>SQL Injection Basics</TableCell>
                          <TableCell>Web Security</TableCell>
                          <TableCell>100</TableCell>
                          <TableCell>
                            <span className="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium bg-green-100 text-green-700">
                              Completed
                            </span>
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm">View Solution</Button>
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>XSS Challenge</TableCell>
                          <TableCell>Web Security</TableCell>
                          <TableCell>150</TableCell>
                          <TableCell>
                            <span className="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-700">
                              In Progress
                            </span>
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm">Continue</Button>
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="leaderboard" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Competition Leaderboard</CardTitle>
                    <CardDescription>
                      Top performers in this competition
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Rank</TableHead>
                          <TableHead>Player</TableHead>
                          <TableHead>Points</TableHead>
                          <TableHead>Challenges</TableHead>
                          <TableHead>Last Active</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TableRow>
                          <TableCell className="font-medium">
                            <div className="flex items-center">
                              <Trophy className="h-4 w-4 text-yellow-500 mr-2" />
                              1
                            </div>
                          </TableCell>
                          <TableCell>Alice Smith</TableCell>
                          <TableCell>750</TableCell>
                          <TableCell>6/8</TableCell>
                          <TableCell>2 hours ago</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="activity" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Recent Activity</CardTitle>
                    <CardDescription>
                      Latest events in the competition
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center space-x-4">
                        <div className="h-2 w-2 rounded-full bg-green-500" />
                        <div>
                          <p className="text-sm font-medium">
                            Alice Smith completed XSS Challenge
                          </p>
                          <p className="text-sm text-muted-foreground">
                            2 hours ago • +150 points
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-4">
                        <div className="h-2 w-2 rounded-full bg-blue-500" />
                        <div>
                          <p className="text-sm font-medium">
                            Bob Johnson started SQL Injection Challenge
                          </p>
                          <p className="text-sm text-muted-foreground">
                            3 hours ago
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>
    </div>
  );
} 