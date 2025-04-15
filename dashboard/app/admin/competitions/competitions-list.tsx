'use client';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatDate } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { addDays, addHours } from "date-fns";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useRouter } from "next/navigation";

interface Competition {
  id: string;
  name: string;
  description: string | null;
  startDate: Date;
  endDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  _count: {
    members: number;
    challenges: number;
  };
  challenges: Array<{
    points: number;
  }>;
  members: Array<{
    points: number;
  }>;
}

interface CompetitionsListProps {
  competitions: {
    active: Competition[];
    upcoming: Competition[];
    past: Competition[];
  };
  isAdmin: boolean;
}

type ExpiryOption = {
  id: string;
  label: string;
  getValue?: () => Date;
};

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

const CompetitionCard = ({ competition, isAdmin }: { competition: Competition; isAdmin: boolean }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [accessCode, setAccessCode] = useState<string | null>(null);
  const [expiryOption, setExpiryOption] = useState<ExpiryOption>(EXPIRY_OPTIONS[0]);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const totalPoints = competition.challenges.reduce((sum, c) => sum + (c.points || 0), 0);
  const averageProgress = competition.members.length > 0
    ? Math.round((competition.members.reduce((sum, m) => sum + (m.points || 0), 0) / competition.members.length) * 100)
    : 0;

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

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      const response = await fetch(`/api/competition-groups/${competition.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete competition');
      }

      toast({
        title: "Success",
        description: "Competition deleted successfully",
      });
      router.refresh();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete competition",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle>{competition.name}</CardTitle>
              <CardDescription>
                {competition.startDate ? `Started ${formatDate(competition.startDate, 'PPP')}` : 'Not started'} •
                {competition._count.members} participants
              </CardDescription>
            </div>
            {isAdmin && (
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive hover:text-destructive"
                onClick={() => setShowDeleteDialog(true)}
                disabled={isDeleting}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">Progress</p>
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary"
                  style={{ width: `${averageProgress}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {averageProgress}% average completion rate
              </p>
            </div>
            <div className="flex justify-between">
              <Button
                variant="outline"
                size="sm"
                asChild
              >
                <Link href={`/dashboard/app/admin/competitions/${competition.id}`}>
                  View Details
                </Link>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDialog(true)}
                disabled={isGenerating}
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
          </div>
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={(open) => {
        setShowDialog(open);
        if (!open) resetDialog();
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{accessCode ? 'Access Code Generated' : 'Generate Access Code'}</DialogTitle>
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
              <div className="flex items-center justify-center space-x-2 p-4">
                <code className="bg-muted px-4 py-2 rounded-md text-lg font-mono">
                  {accessCode}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleCopy}
                  className="h-8 w-8"
                >
                  {copied ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
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

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to delete &ldquo;{competition.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>This action is permanent and cannot be undone. The following data will be deleted:</p>
              <ul className="list-disc list-inside text-sm">
                <li>All competition challenges and their configurations</li>
                <li>All participant memberships and their scores</li>
                <li>All competition access codes</li>
              </ul>
              <p className="text-sm mt-2">Note: Activity logs will be preserved for audit purposes.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>No, keep competition</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Yes, delete competition'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export function CompetitionsList({ competitions, isAdmin }: CompetitionsListProps) {
  return (
    <ScrollArea className="h-full">
      <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Competitions</h2>
            <p className="text-muted-foreground">
              Manage your CTF competitions and track student progress
            </p>
          </div>
          <Link href="/admin/competitions/create">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create Competition
            </Button>
          </Link>
        </div>

        <Tabs defaultValue="active" className="space-y-4">
          <TabsList>
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
            <TabsTrigger value="past">Past</TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {competitions.active.map((competition) => (
                <CompetitionCard key={competition.id} competition={competition} isAdmin={isAdmin} />
              ))}
              {competitions.active.length === 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>No Active Competitions</CardTitle>
                    <CardDescription>
                      Create a new competition to get started
                    </CardDescription>
                  </CardHeader>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="upcoming" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {competitions.upcoming.map((competition) => (
                <CompetitionCard key={competition.id} competition={competition} isAdmin={isAdmin} />
              ))}
              {competitions.upcoming.length === 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>No Upcoming Competitions</CardTitle>
                    <CardDescription>
                      Create a new competition to get started
                    </CardDescription>
                  </CardHeader>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="past" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {competitions.past.map((competition) => (
                <CompetitionCard key={competition.id} competition={competition} isAdmin={isAdmin} />
              ))}
              {competitions.past.length === 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>No Past Competitions</CardTitle>
                    <CardDescription>
                      Completed competitions will appear here
                    </CardDescription>
                  </CardHeader>
                </Card>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </ScrollArea>
  );
}
