'use client';

import { MainNavigation } from '@/components/MainNavigation';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Trophy, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function CompetitionsPage() {
  const [showDialog, setShowDialog] = useState(false);
  const [code, setCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const handleJoin = async () => {
    if (!code.trim()) return;

    try {
      setIsJoining(true);
      const response = await fetch('/api/competitions/join', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: code.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to join competition');
      }

      toast({
        title: "Success",
        description: "Successfully joined the competition",
      });

      // Close dialog and redirect to the competition page
      setShowDialog(false);
      router.push(`/dashboard/competitions/${data.competition.id}`);
      router.refresh();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to join competition",
        variant: "destructive",
      });
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <MainNavigation />
      <main className="container mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-4xl font-bold">Competitions</h1>
            <p className="text-xl text-muted-foreground mt-2">
              Join CTF competitions and compete with others
            </p>
          </div>
          <Dialog open={showDialog} onOpenChange={setShowDialog}>
            <DialogTrigger asChild>
              <Button>Join Competition</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="text-center text-xl">Join Competition</DialogTitle>
                <DialogDescription className="text-center">
                  Enter the competition access code to join
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="code">Access Code</Label>
                  <Input
                    id="code"
                    placeholder="Enter the competition access code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleJoin();
                      }
                    }}
                  />
                </div>
                <Button 
                  className="w-full" 
                  onClick={handleJoin}
                  disabled={isJoining || !code.trim()}
                >
                  {isJoining ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Joining...
                    </>
                  ) : (
                    'Join Competition'
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs defaultValue="active" className="space-y-4">
          <TabsList>
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Spring CTF 2024</span>
                    <Trophy className="h-5 w-5 text-yellow-500" />
                  </CardTitle>
                  <CardDescription>Ends in 20 days</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Your Progress</span>
                        <span className="font-medium">45%</span>
                      </div>
                      <div className="h-2 bg-secondary rounded-full overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: '45%' }} />
                      </div>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Your Rank</span>
                      <span className="font-medium">3rd of 15</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Points Earned</span>
                      <span className="font-medium">450/1000</span>
                    </div>
                    <Button className="w-full">View Details</Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="upcoming" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle>Summer CTF 2024</CardTitle>
                  <CardDescription>Starts in 45 days</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Participants</span>
                        <span className="font-medium">5 registered</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Duration</span>
                        <span className="font-medium">30 days</span>
                      </div>
                    </div>
                    <Button className="w-full" variant="outline">Register Interest</Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="completed" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Winter CTF 2023</span>
                    <Trophy className="h-5 w-5 text-yellow-500" />
                  </CardTitle>
                  <CardDescription>Completed on Dec 31, 2023</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Final Rank</span>
                        <span className="font-medium">2nd of 20</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Points Earned</span>
                        <span className="font-medium">850/1000</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Challenges Completed</span>
                        <span className="font-medium">8/10</span>
                      </div>
                    </div>
                    <Button className="w-full" variant="outline">View Certificate</Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
} 