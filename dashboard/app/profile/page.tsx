import { MainNavigation } from '@/components/navigation/MainNavigation'
import { getServerSession } from "next-auth/next";
import authConfig from "@/auth.config";
import { redirect } from "next/navigation";
import { prisma } from '@/lib/prisma';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trophy, Medal, Target, Flag, Calendar, User, Star, Activity } from 'lucide-react';
import { ChallengeHeatmap } from '@/components/profile/ChallengeHeatmap';

export default async function Profile() {
    const session = await getServerSession(authConfig);
    if (!session) {
        redirect('/');
    }

    // Fetch user data with question completions
    const user = await prisma.user.findUnique({
        where: { email: session.user?.email! },
        include: {
            questionCompletions: {
                include: {
                    question: {
                        select: {
                            id: true,
                            content: true,
                            points: true,
                            challengeId: true,
                            challenge: {
                                include: {
                                    challengeType: true
                                }
                            }
                        }
                    },
                    groupChallenge: {
                        include: {
                            group: true
                        }
                    }
                },
                orderBy: {
                    completedAt: 'desc'
                }
            },
            memberOf: true,
            groupPoints: true,
        }
    });

    if (!user) {
        redirect('/');
    }

    // Calculate statistics
    const totalPoints = user.groupPoints.reduce((sum, gp) => sum + gp.points, 0);
    
    // Calculate completed challenges by grouping question completions by challenge
    const completedChallenges = new Map();
    user.questionCompletions.forEach(completion => {
        const challengeId = completion.question.challengeId;
        if (!completedChallenges.has(challengeId)) {
            completedChallenges.set(challengeId, {
                name: completion.question.challenge.name,
                type: completion.question.challenge.challengeType.name,
                completedQuestions: new Set(),
                totalPoints: 0,
                lastCompletedAt: completion.completedAt
            });
        }
        const challenge = completedChallenges.get(challengeId);
        challenge.completedQuestions.add(completion.questionId);
        challenge.totalPoints += completion.question.points;
    });

    const joinedCompetitions = user.memberOf.length;
    const accountAge = Math.floor((new Date().getTime() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24));

    // Get recent activity from question completions
    const recentCompletions = user.questionCompletions
        .slice(0, 5)
        .map(completion => ({
            id: completion.id,
            challengeName: completion.question.challenge.name,
            questionName: completion.question.content,
            points: completion.question.points,
            completedAt: completion.completedAt,
            competitionName: completion.groupChallenge.group.name,
            challengeType: completion.question.challenge.challengeType.name
        }));

    return (
        <div className="min-h-screen bg-background overflow-y-auto">
            <MainNavigation />
            <div className="container mx-auto p-6 space-y-8 pb-16">
                {/* Profile Header */}
                <div className="flex items-start gap-6">
                    <Avatar className="h-24 w-24">
                        <AvatarImage src={user.image ?? ''} />
                        <AvatarFallback className="text-lg">{user.name?.[0]}</AvatarFallback>
                    </Avatar>
                    <div className="space-y-2">
                        <h1 className="text-4xl font-bold">{user.name}</h1>
                        <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-green-400 border-green-400">
                                {user.role}
                            </Badge>
                            <p className="text-muted-foreground">Member for {accountAge} days</p>
                        </div>
                    </div>
                </div>

                {/* Stats Grid */}
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <Card className="bg-black/40 backdrop-blur-sm border-green-900/50">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium">Total Points</CardTitle>
                            <Trophy className="h-4 w-4 text-green-400" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-green-400">{totalPoints}</div>
                        </CardContent>
                    </Card>
                    <Card className="bg-black/40 backdrop-blur-sm border-green-900/50">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium">Challenges Started</CardTitle>
                            <Flag className="h-4 w-4 text-green-400" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-green-400">{completedChallenges.size}</div>
                        </CardContent>
                    </Card>
                    <Card className="bg-black/40 backdrop-blur-sm border-green-900/50">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium">Competitions Joined</CardTitle>
                            <Medal className="h-4 w-4 text-green-400" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-green-400">{joinedCompetitions}</div>
                        </CardContent>
                    </Card>
                    <Card className="bg-black/40 backdrop-blur-sm border-green-900/50">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium">Questions Completed</CardTitle>
                            <Target className="h-4 w-4 text-green-400" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-green-400">{user.questionCompletions.length}</div>
                        </CardContent>
                    </Card>
                </div>

                {/* Tabs Section */}
                <Tabs defaultValue="activity" className="space-y-4">
                    <TabsList className="bg-black/40 border-green-900/50">
                        <TabsTrigger value="activity">Activity</TabsTrigger>
                        <TabsTrigger value="competitions">Competitions</TabsTrigger>
                        <TabsTrigger value="achievements">Achievements</TabsTrigger>
                    </TabsList>

                    <TabsContent value="activity" className="space-y-4">
                        <div className="mb-6">
                            <ChallengeHeatmap userId={user.id} />
                        </div>
                        
                        {recentCompletions.length > 0 && (
                            <Card className="bg-black/40 backdrop-blur-sm border-green-900/50">
                                <CardHeader>
                                    <CardTitle>Recent Activity</CardTitle>
                                    <CardDescription>Your latest challenge progress</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    {recentCompletions.map((completion) => (
                                        <div key={completion.id} className="flex items-center gap-4 p-4 rounded-lg bg-black/20">
                                            <div className="h-8 w-8 rounded-full bg-green-500/10 flex items-center justify-center">
                                                <Target className="h-4 w-4 text-green-400" />
                                            </div>
                                            <div className="flex-1">
                                                <p className="font-medium">
                                                    Completed question in {completion.challengeName}
                                                    <Badge variant="outline" className="ml-2 text-xs">
                                                        {completion.challengeType}
                                                    </Badge>
                                                </p>
                                                <p className="text-sm text-muted-foreground">
                                                    {completion.questionName} (+{completion.points} points)
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    {completion.competitionName}
                                                </p>
                                            </div>
                                            <time className="text-sm text-muted-foreground">
                                                {completion.completedAt.toLocaleDateString()}
                                            </time>
                                        </div>
                                    ))}
                                </CardContent>
                            </Card>
                        )}
                    </TabsContent>

                    <TabsContent value="competitions">
                        <Card className="bg-black/40 backdrop-blur-sm border-green-900/50">
                            <CardHeader>
                                <CardTitle>Your Competitions</CardTitle>
                                <CardDescription>Competitions you've participated in</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {user.memberOf.map((competition) => (
                                    <div key={competition.id} className="flex items-center gap-4 p-4 rounded-lg bg-black/20">
                                        <div className="h-8 w-8 rounded-full bg-green-500/10 flex items-center justify-center">
                                            <Trophy className="h-4 w-4 text-green-400" />
                                        </div>
                                        <div className="flex-1">
                                            <p className="font-medium">{competition.name}</p>
                                            <p className="text-sm text-muted-foreground">
                                                {competition.startDate.toLocaleDateString()} - {competition.endDate?.toLocaleDateString() ?? 'Ongoing'}
                                            </p>
                                        </div>
                                        <Badge variant="outline" className="text-green-400 border-green-400">
                                            {new Date() > new Date(competition.endDate ?? '') ? 'Completed' : 'Active'}
                                        </Badge>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="achievements">
                        <Card className="bg-black/40 backdrop-blur-sm border-green-900/50">
                            <CardHeader>
                                <CardTitle>Achievements</CardTitle>
                                <CardDescription>Your earned badges and achievements</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-center justify-center p-8 text-muted-foreground">
                                    Coming Soon
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}

