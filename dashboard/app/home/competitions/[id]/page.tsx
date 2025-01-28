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
import { Badge } from "@/components/ui/badge";
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
          <Badge
            className={
              competition.status === "active"
                ? "bg-green-500"
                : competition.status === "upcoming"
                ? "bg-yellow-500"
                : "bg-gray-500"
            }
          >
            {competition.status.charAt(0).toUpperCase() + competition.status.slice(1)}
          </Badge>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Participants</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{competition.participantCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Challenges</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{competition.challengeCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Points</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{competition.totalPoints}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Your Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{competition.userProgress}%</div>
              <Progress value={competition.userProgress} className="mt-2" />
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="challenges">Challenges</TabsTrigger>
            <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Competition Details</CardTitle>
                <CardDescription>
                  Important information about the competition
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between">
                  <span className="font-medium">Start Date</span>
                  <span>{competition.startDate.toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">End Date</span>
                  <span>{competition.endDate.toLocaleDateString()}</span>
                </div>
                {/* Add more competition details as needed */}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="challenges" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Available Challenges</CardTitle>
                <CardDescription>
                  Complete challenges to earn points
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Challenge</TableHead>
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
                          <Badge
                            className={
                              challenge.completed
                                ? "bg-green-500"
                                : "bg-yellow-500"
                            }
                          >
                            {challenge.completed ? "Completed" : "Available"}
                          </Badge>
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
                      <TableHead className="w-[100px]">Rank</TableHead>
                      <TableHead>Player</TableHead>
                      <TableHead>Points</TableHead>
                      <TableHead>Challenges Completed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leaderboard.map((player) => (
                      <TableRow key={player.rank}>
                        <TableCell className="font-medium">
                          {getRankIcon(player.rank)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={player.avatar} />
                              <AvatarFallback>
                                {player.name
                                  .split(" ")
                                  .map((n) => n[0])
                                  .join("")}
                              </AvatarFallback>
                            </Avatar>
                            <span>{player.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>{player.points}</TableCell>
                        <TableCell>{player.completions}</TableCell>
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