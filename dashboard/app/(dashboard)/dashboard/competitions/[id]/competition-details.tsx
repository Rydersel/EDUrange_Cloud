'use client';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChevronLeft, Loader2, Copy, Check } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatRelativeTime } from "@/lib/utils";
import { useState } from 'react';
import { useToast } from '@/components/ui/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CompetitionDetailsProps, ExpiryOption } from '../types';
import { addHours, addDays } from 'date-fns';

const EXPIRY_OPTIONS: ExpiryOption[] = [
  { id: 'never', label: 'Never expires' },
  { id: '1h', label: '1 hour', getValue: () => addHours(new Date(), 1) },
  { id: '24h', label: '24 hours', getValue: () => addHours(new Date(), 24) },
  { id: '7d', label: '7 days', getValue: () => addDays(new Date(), 7) },
  { id: '30d', label: '30 days', getValue: () => addDays(new Date(), 30) }
];

const getExpiryDate = (option: ExpiryOption) => {
  if (option.id === 'never') return null;
  return option.getValue?.();
};

export function CompetitionDetails({ competition, isInstructor }: CompetitionDetailsProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [accessCode, setAccessCode] = useState<string | null>(null);
  const [expiryOption, setExpiryOption] = useState<ExpiryOption>(EXPIRY_OPTIONS[0]);
  const [copied, setCopied] = useState(false);
  const [revokingCode, setRevokingCode] = useState<string | null>(null);
  const { toast } = useToast();
  const router = useRouter();

  const handleGenerateCode = async () => {
    try {
      setIsGenerating(true);
      const expiryDate = getExpiryDate(expiryOption);
      const response = await fetch(`/api/competition-groups/${competition.id}/access-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          expiresAt: expiryDate?.toISOString(),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate access code');
      }

      const data = await response.json();
      setAccessCode(data.code);
      router.refresh();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to generate access code",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (accessCode) {
      await navigator.clipboard.writeText(accessCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const resetDialog = () => {
    setAccessCode(null);
    setExpiryOption(EXPIRY_OPTIONS[0]);
  };

  const handleRevoke = async (code: string) => {
    try {
      setRevokingCode(code);
      const response = await fetch(`/api/competition-groups/${competition.id}/access-code/${code}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to revoke access code');
      }

      toast({
        title: "Success",
        description: "Access code revoked successfully",
      });
      router.refresh();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to revoke access code",
        variant: "destructive",
      });
    } finally {
      setRevokingCode(null);
    }
  };

  const totalPoints = competition.challenges.reduce((sum: number, c: any) => sum + (c.points || 0), 0);
  const averageProgress = competition.members.length > 0
    ? Math.round((competition.members.reduce((sum: number, m: any) => {
        const points = m.groupPoints[0]?.points || 0;
        return sum + points;
      }, 0) / competition.members.length / totalPoints) * 100)
    : 0;

  const getCompletionRate = (challenge: any) => {
    const completions = challenge.completions.length;
    const total = competition.members.length;
    return `${completions}/${total}`;
  };

  const sortedMembers = [...competition.members].sort((a, b) => {
    const pointsA = a.groupPoints[0]?.points || 0;
    const pointsB = b.groupPoints[0]?.points || 0;
    return pointsB - pointsA;
  });

  return (
    <ScrollArea className="h-full">
      <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Link href="/dashboard/competitions">
              <Button variant="ghost" size="icon">
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h2 className="text-3xl font-bold tracking-tight">{competition.name}</h2>
              <p className="text-muted-foreground">
                Started {formatRelativeTime(competition.startDate)} ago • {competition._count.members} participants
              </p>
            </div>
          </div>
          {isInstructor && (
            <div className="flex space-x-2">
              <Button variant="outline" onClick={() => setShowDialog(true)}>Generate Access Code</Button>
              <Button variant="outline">Edit</Button>
            </div>
          )}
        </div>

        <div className="grid gap-4 grid-cols-1 md:grid-cols-4">
          <Card className="col-span-1">
            <CardHeader>
              <CardTitle>Overview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Status</p>
                <p className="text-sm font-medium">
                  {new Date() < new Date(competition.startDate)
                    ? 'Upcoming'
                    : !competition.endDate || new Date() < new Date(competition.endDate)
                    ? 'Active'
                    : 'Ended'}
                </p>
              </div>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Start Date</p>
                <p className="text-sm font-medium">{formatDate(competition.startDate, 'PPP')}</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">End Date</p>
                <p className="text-sm font-medium">
                  {competition.endDate ? formatDate(competition.endDate, 'PPP') : 'No end date'}
                </p>
              </div>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Total Points</p>
                <p className="text-sm font-medium">{totalPoints}</p>
              </div>
            </CardContent>
          </Card>

          <div className="col-span-1 md:col-span-3">
            <Tabs defaultValue="participants" className="space-y-4">
              <TabsList>
                <TabsTrigger value="participants">Participants</TabsTrigger>
                <TabsTrigger value="challenges">Challenges</TabsTrigger>
                <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
                {isInstructor && <TabsTrigger value="access-codes">Access Codes</TabsTrigger>}
              </TabsList>

              <TabsContent value="participants" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Participants</CardTitle>
                    <CardDescription>
                      Manage competition participants
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Progress</TableHead>
                          <TableHead>Points</TableHead>
                          {isInstructor && <TableHead></TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {competition.members.map((member: any) => (
                          <TableRow key={member.id}>
                            <TableCell>{member.name}</TableCell>
                            <TableCell>{member.email}</TableCell>
                            <TableCell>{Math.round(((member.groupPoints[0]?.points || 0) / totalPoints) * 100)}%</TableCell>
                            <TableCell>{member.groupPoints[0]?.points || 0}</TableCell>
                            {isInstructor && (
                              <TableCell>
                                <div className="flex gap-2">
                                  <Button variant="ghost" size="sm">View Details</Button>
                                  <Button 
                                    variant="destructive" 
                                    size="sm"
                                    onClick={async () => {
                                      if (!confirm('Are you sure you want to reset this user\'s progress? This action cannot be undone.')) {
                                        return;
                                      }
                                      
                                      try {
                                        const response = await fetch(`/api/competition-groups/${competition.id}/users/${member.id}/reset`, {
                                          method: 'POST'
                                        });
                                        
                                        if (!response.ok) {
                                          throw new Error('Failed to reset user progress');
                                        }
                                        
                                        toast({
                                          title: "Success",
                                          description: "User progress has been reset",
                                        });
                                        
                                        // Refresh the page to show updated data
                                        router.refresh();
                                      } catch (error) {
                                        toast({
                                          title: "Error",
                                          description: "Failed to reset user progress",
                                          variant: "destructive",
                                        });
                                      }
                                    }}
                                  >
                                    Reset Progress
                                  </Button>
                                </div>
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="challenges" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Challenges</CardTitle>
                    <CardDescription>
                      Manage competition challenges
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Points</TableHead>
                          <TableHead>Completions</TableHead>
                          {isInstructor && <TableHead></TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {competition.challenges.map((challenge: any) => (
                          <TableRow key={challenge.id}>
                            <TableCell>{challenge.challenge.name}</TableCell>
                            <TableCell>{challenge.challenge.challengeType.name}</TableCell>
                            <TableCell>{challenge.points}</TableCell>
                            <TableCell>{getCompletionRate(challenge)}</TableCell>
                            {isInstructor && (
                              <TableCell>
                                <Button variant="ghost" size="sm">Edit</Button>
                              </TableCell>
                            )}
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
                    <CardTitle>Leaderboard</CardTitle>
                    <CardDescription>
                      Current competition standings
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Rank</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Points</TableHead>
                          <TableHead>Progress</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortedMembers.map((member: any, index: number) => (
                          <TableRow key={member.id}>
                            <TableCell>{index + 1}</TableCell>
                            <TableCell>{member.name}</TableCell>
                            <TableCell>{member.groupPoints[0]?.points || 0}</TableCell>
                            <TableCell>{Math.round(((member.groupPoints[0]?.points || 0) / totalPoints) * 100)}%</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>

              {isInstructor && (
                <TabsContent value="access-codes" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Access Codes</CardTitle>
                      <CardDescription>
                        Manage competition access codes
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Code</TableHead>
                            <TableHead>Created</TableHead>
                            <TableHead>Expires</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {competition.accessCodes.map((code: any) => (
                            <TableRow key={code.id}>
                              <TableCell>{code.code}</TableCell>
                              <TableCell>{formatRelativeTime(code.createdAt)} ago</TableCell>
                              <TableCell>
                                {code.expiresAt 
                                  ? formatDate(code.expiresAt, 'PPP')
                                  : 'Never'}
                              </TableCell>
                              <TableCell>
                                {code.expiresAt && new Date(code.expiresAt) < new Date()
                                  ? 'Expired'
                                  : 'Active'}
                              </TableCell>
                              <TableCell>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={() => handleRevoke(code.code)}
                                  disabled={revokingCode === code.code}
                                  className={code.expiresAt && new Date(code.expiresAt) < new Date() ? "text-red-500 hover:text-red-600" : ""}
                                >
                                  {revokingCode === code.code ? (
                                    <>
                                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                      Revoking...
                                    </>
                                  ) : (
                                    code.expiresAt && new Date(code.expiresAt) < new Date() ? 'Revoked' : 'Revoke'
                                  )}
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </TabsContent>
              )}
            </Tabs>
          </div>
        </div>
      </div>

      <Dialog open={showDialog} onOpenChange={(open) => {
        setShowDialog(open);
        if (!open) resetDialog();
      }}>
        <DialogContent>
          <DialogHeader className="text-center">
            <DialogTitle className="text-xl">
              {accessCode ? 'Access Code Generated' : 'Generate Access Code'}
            </DialogTitle>
            <DialogDescription>
              {accessCode ? 'Share this code with participants to join the competition:' : 'Choose when this access code should expire:'}
            </DialogDescription>
          </DialogHeader>
          {!accessCode ? (
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium">Expiry Option</label>
                <Select
                  value={expiryOption.id}
                  onValueChange={(value) => setExpiryOption(EXPIRY_OPTIONS.find(opt => opt.id === value) || EXPIRY_OPTIONS[0])}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select when the code expires" />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPIRY_OPTIONS.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button 
                onClick={handleGenerateCode} 
                disabled={isGenerating}
                className="w-full"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  'Generate Code'
                )}
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-center space-x-3 p-6">
                <code className="bg-muted px-6 py-3 rounded-md text-2xl font-mono font-semibold">
                  {accessCode}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleCopy}
                  className="h-10 w-10"
                >
                  {copied ? (
                    <Check className="h-5 w-5" />
                  ) : (
                    <Copy className="h-5 w-5" />
                  )}
                </Button>
              </div>
              <div className="text-center text-sm text-muted-foreground">
                {getExpiryDate(expiryOption) ? (
                  <p>This code will expire on {formatDate(getExpiryDate(expiryOption)!, "PPP")}.</p>
                ) : (
                  <p>This code will never expire.</p>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </ScrollArea>
  );
} 