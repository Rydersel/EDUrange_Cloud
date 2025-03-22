'use client';

import { useParams } from "next/navigation";
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
import { StatusBadge } from "@/components/ui/status-badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Trophy, Medal, Award } from "lucide-react";

export default function CompetitionDetailsPage() {
  const params = useParams();
  const id = params.id as string;

  // TODO: Fetch competition data
  const competition = {
    name: "Spring 2024 CTF",
    description: "A challenging competition for all skill levels",
    status: "active",
    startDate: new Date("2024-01-01"),
    endDate: new Date("2024-12-31"),
    participantCount: 24,
    challengeCount: 12,
    totalPoints: 1000,
    userProgress: 45,
  };

  // TODO: Fetch leaderboard data
  const leaderboard = [
    { rank: 1, name: "John Doe", points: 850, completions: 10, avatar: "" },
    { rank: 2, name: "Jane Smith", points: 720, completions: 8, avatar: "" },
    { rank: 3, name: "Bob Johnson", points: 650, completions: 7, avatar: "" },
  ];

  // TODO: Fetch challenges data
  const challenges = [
    { id: 1, name: "Web Exploitation", points: 100, completed: true },
    { id: 2, name: "Cryptography", points: 150, completed: false },
    { id: 3, name: "Binary Analysis", points: 200, completed: false },
  ];

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Trophy className="h-5 w-5 text-yellow-500" />;
      case 2:
        return <Medal className="h-5 w-5 text-gray-400" />;
      case 3:
        return <Award className="h-5 w-5 text-amber-600" />;
      default:
        return rank;
    }
  };

  return (
    <ScrollArea className="h-full">
      <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">{competition.name}</h2>
            <p className="text-muted-foreground">{competition.description}</p>
          </div>
          <StatusBadge status={competition.status} />
        </div>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="challenges">Challenges</TabsTrigger>
            <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <Card>
              <CardHeader>
                <CardTitle>Competition Overview</CardTitle>
                <CardDescription>
                  Your progress in this competition
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Progress</span>
                    <span className="font-medium">{competition.userProgress}%</span>
                  </div>
                  <Progress value={competition.userProgress} />
                </div>

                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <div className="bg-muted rounded-lg p-3">
                    <div className="text-muted-foreground text-sm">Start Date</div>
                    <div className="font-medium">
                      {competition.startDate.toLocaleDateString()}
                    </div>
                  </div>
                  <div className="bg-muted rounded-lg p-3">
                    <div className="text-muted-foreground text-sm">End Date</div>
                    <div className="font-medium">
                      {competition.endDate.toLocaleDateString()}
                    </div>
                  </div>
                  <div className="bg-muted rounded-lg p-3">
                    <div className="text-muted-foreground text-sm">
                      Participants
                    </div>
                    <div className="font-medium">{competition.participantCount}</div>
                  </div>
                  <div className="bg-muted rounded-lg p-3">
                    <div className="text-muted-foreground text-sm">
                      Total Points
                    </div>
                    <div className="font-medium">{competition.totalPoints}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="challenges">
            <Card>
              <CardHeader>
                <CardTitle>Challenges</CardTitle>
                <CardDescription>
                  All available challenges for this competition
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Points</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {challenges.map((challenge) => (
                      <TableRow key={challenge.id}>
                        <TableCell className="font-medium">
                          {challenge.name}
                        </TableCell>
                        <TableCell>{challenge.points}</TableCell>
                        <TableCell>
                          <StatusBadge status={challenge.completed ? "completed" : "pending"} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={challenge.completed}
                          >
                            {challenge.completed ? "Completed" : "Start Challenge"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="leaderboard">
            <Card>
              <CardHeader>
                <CardTitle>Leaderboard</CardTitle>
                <CardDescription>
                  Top performers in this competition
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rank</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Points</TableHead>
                      <TableHead className="text-right">Completions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leaderboard.map((user) => (
                      <TableRow key={user.rank}>
                        <TableCell>
                          <div className="flex items-center justify-center w-8 h-8 rounded-full">
                            {getRankIcon(user.rank)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar>
                              <AvatarImage src={user.avatar} />
                              <AvatarFallback>
                                {user.name
                                  .split(" ")
                                  .map((n) => n[0])
                                  .join("")}
                              </AvatarFallback>
                            </Avatar>
                            <div className="font-medium">{user.name}</div>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{user.points}</TableCell>
                        <TableCell className="text-right">
                          {user.completions}/{competition.challengeCount}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </ScrollArea>
  );
}
