'use client';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { AlertCircle, CalendarIcon, ChevronLeft, GripVertical, X, Loader2, Check, Copy } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useToast } from '@/components/ui/use-toast';
import { z } from 'zod';
import { Checkbox } from '@/components/ui/checkbox';
import {getServerSession} from "next-auth/next";
import authConfig from "@/auth.config";
import {redirect} from "next/navigation";


interface Challenge {
  id: string;
  name: string;
  image: string;
  type: string;
}

interface ChallengeTypeGroup {
  name: string;
  challenges: Challenge[];
}

interface Instructor {
  id: string;
  name: string | null;
  email: string;
}

interface CompetitionForm {
  name: string;
  description: string;
  startDate: Date | null;
  endDate: Date | null;
  challengeIds: string[];
  instructorIds: string[];
  generateAccessCode: boolean;
}

interface SortableChallengeProps {
  challenge: Challenge;
  onRemove: (id: string) => void;
}

const SortableChallenge = ({ challenge, onRemove }: SortableChallengeProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: challenge.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between bg-secondary/50 rounded-lg p-2"
    >
      <div className="flex items-center space-x-2">
        <button
          className="cursor-move opacity-50 hover:opacity-100"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div>
          <p className="text-sm font-medium">{challenge.name}</p>
          <p className="text-xs text-muted-foreground">{challenge.type}</p>
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onRemove(challenge.id)}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
};

export default function CreateCompetitionPage() {
  const [selectedChallenges, setSelectedChallenges] = useState<Challenge[]>([]);
  const [selectedType, setSelectedType] = useState<string>('');
  const [showPreview, setShowPreview] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [challengeTypes, setChallengeTypes] = useState<Record<string, ChallengeTypeGroup>>({});
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [showAccessCodeDialog, setShowAccessCodeDialog] = useState(false);
  const [accessCode, setAccessCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [createdCompetitionId, setCreatedCompetitionId] = useState<string | null>(null);
  const {toast} = useToast();


  const [form, setForm] = useState<CompetitionForm>({
    name: '',
    description: '',
    startDate: null,
    endDate: null,
    challengeIds: [],
    instructorIds: [],
    generateAccessCode: false,
  });

  const handleDateSelect = (field: keyof Pick<CompetitionForm, 'startDate' | 'endDate'>) =>
      (date: Date | undefined) => {
        setForm((prevForm: CompetitionForm) => ({
          ...prevForm,
          [field]: date ?? null
        }));
      };

  const sensors = useSensors(
      useSensor(PointerSensor),
      useSensor(KeyboardSensor, {
        coordinateGetter: sortableKeyboardCoordinates,
      })
  );

  // Fetch challenges and instructors on component mount
  useEffect(() => {
    const fetchData = async () => {

      try {
        setIsLoading(true);

        // Fetch challenges
        const challengesRes = await fetch('/api/challenges');
        if (!challengesRes.ok) throw new Error('Failed to fetch challenges');
        const challengesData = await challengesRes.json();

        // Group challenges by type and store type names
        const groupedChallenges = challengesData.reduce((acc: Record<string, {
          name: string,
          challenges: Challenge[]
        }>, challenge: any) => {
          const typeId = challenge.challengeType.id;
          if (!acc[typeId]) {
            acc[typeId] = {
              name: challenge.challengeType.name,
              challenges: []
            };
          }
          acc[typeId].challenges.push({
            id: challenge.id,
            name: challenge.name,
            image: challenge.challengeImage,
            type: challenge.challengeType.name
          });
          return acc;
        }, {});

        setChallengeTypes(groupedChallenges);

        // Fetch instructors
        const instructorsRes = await fetch('/api/instructors');
        if (!instructorsRes.ok) throw new Error('Failed to fetch instructors');
        const instructorsData = await instructorsRes.json();
        setInstructors(instructorsData);
      } catch (error) {
        console.error('Error fetching data:', error);
        toast({
          title: 'Error',
          description: 'Failed to load challenges and instructors',
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [toast]);

  const handleAddChallenge = (challenge: Challenge) => {
    if (!selectedChallenges.some(c => c.id === challenge.id)) {
      setSelectedChallenges([...selectedChallenges, challenge]);
      setForm(prev => ({
        ...prev,
        challengeIds: [...prev.challengeIds, challenge.id],
      }));
    }
  };

  const handleRemoveChallenge = (challengeId: string) => {
    setSelectedChallenges(selectedChallenges.filter(c => c.id !== challengeId));
    setForm(prev => ({
      ...prev,
      challengeIds: prev.challengeIds.filter(id => id !== challengeId),
    }));
  };

  const handleInstructorChange = (instructorId: string) => {
    setForm(prev => {
      const newInstructorIds = prev.instructorIds.includes(instructorId)
          ? prev.instructorIds.filter(id => id !== instructorId)
          : [...prev.instructorIds, instructorId];

      return {
        ...prev,
        instructorIds: newInstructorIds,
      };
    });
  };

  const isFormValid = () => {
    return (
        form.name.trim() !== '' &&
        form.description.trim() !== '' &&
        form.startDate !== null &&
        form.challengeIds.length > 0 &&
        form.instructorIds.length > 0
    );
  };

  const handleDragEnd = (event: any) => {
    const {active, over} = event;

    if (active.id !== over.id) {
      setSelectedChallenges((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);

        const newItems = arrayMove(items, oldIndex, newIndex);
        setForm(prev => ({
          ...prev,
          challengeIds: newItems.map(item => item.id),
        }));

        return newItems;
      });
    }
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};

    if (!form.name.trim()) {
      errors.name = 'Name is required';
    }
    if (!form.description.trim()) {
      errors.description = 'Description is required';
    }
    if (!form.startDate) {
      errors.startDate = 'Start date is required';
    }
    if (form.challengeIds.length === 0) {
      errors.challenges = 'At least one challenge is required';
    }
    if (form.instructorIds.length === 0) {
      errors.instructors = 'At least one instructor is required';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCopy = async () => {
    if (accessCode) {
      await navigator.clipboard.writeText(accessCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    try {
      setIsSubmitting(true);
      const response = await fetch('/api/competition-groups', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(form),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || 'Failed to create competition');
      }

      const data = await response.json();
      setCreatedCompetitionId(data.groupId);
      
      // If generateAccessCode was true, show the dialog with the code
      if (form.generateAccessCode && data.accessCode) {
        setAccessCode(data.accessCode);
        setShowAccessCodeDialog(true);
      } else {
        // Redirect to the new competition page
        window.location.href = `/dashboard/competitions/${data.groupId}`;
      }

      toast({
        title: 'Success',
        description: 'Competition created successfully',
      });
    } catch (error) {
      console.error('Error creating competition:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create competition',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
        <div className="flex h-[50vh] items-center justify-center">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto"/>
            <p className="mt-2 text-muted-foreground">Loading competition data...</p>
          </div>
        </div>
    );
  }

  return (
      <form onSubmit={handleSubmit} className="container mx-auto py-10 max-h-screen overflow-y-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-2">
            <Link href="/dashboard/competitions" className="text-muted-foreground hover:text-foreground">
              <ChevronLeft className="h-4 w-4"/>
            </Link>
            <h2 className="text-3xl font-bold tracking-tight">Create Competition</h2>
          </div>
          <Button
              type="submit"
              disabled={isSubmitting || !isFormValid()}
              className="ml-auto"
          >
            {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin"/>
                  Creating Competition...
                </>
            ) : (
                'Create Competition'
            )}
          </Button>
        </div>

        <div className="grid gap-6 pb-20">
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>
                Set up the basic details for your competition.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Competition Name</Label>
                <Input
                    id="name"
                    value={form.name}
                    onChange={(e) => setForm(prev => ({...prev, name: e.target.value}))}
                    placeholder="Enter competition name"
                />
                {formErrors.name && (
                    <p className="text-sm text-red-500">{formErrors.name}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                    id="description"
                    value={form.description}
                    onChange={(e) => setForm(prev => ({...prev, description: e.target.value}))}
                    placeholder="Enter competition description"
                />
                {formErrors.description && (
                    <p className="text-sm text-red-500">{formErrors.description}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start Date and Time</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                          variant="outline"
                          className={cn(
                              "w-full justify-start text-left font-normal",
                              !form.startDate && "text-muted-foreground"
                          )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4"/>
                        {form.startDate ? format(form.startDate, "PPP p") : "Pick a date and time"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <div className="p-4 border-b border-border">
                        <Calendar
                            mode="single"
                            selected={form.startDate ?? undefined}
                            onSelect={handleDateSelect('startDate')}
                            initialFocus
                        />
                        <div className="mt-4">
                          <Label>Time</Label>
                          <div className="flex items-center space-x-2">
                            <div>
                              <Input
                                  type="number"
                                  min="0"
                                  max="23"
                                  placeholder="HH"
                                  value={form.startDate ? format(form.startDate, 'HH') : ''}
                                  onChange={(e) => {
                                    const hours = parseInt(e.target.value);
                                    if (hours >= 0 && hours <= 23) {
                                      const date = form.startDate || new Date();
                                      const newDate = new Date(date);
                                      newDate.setHours(hours);
                                      setForm(prev => ({...prev, startDate: newDate}));
                                    }
                                  }}
                                  className="w-20"
                              />
                            </div>
                            <span className="text-lg">:</span>
                            <div>
                              <Input
                                  type="number"
                                  min="0"
                                  max="59"
                                  placeholder="MM"
                                  value={form.startDate ? format(form.startDate, 'mm') : ''}
                                  onChange={(e) => {
                                    const minutes = parseInt(e.target.value);
                                    if (minutes >= 0 && minutes <= 59) {
                                      const date = form.startDate || new Date();
                                      const newDate = new Date(date);
                                      newDate.setMinutes(minutes);
                                      setForm(prev => ({...prev, startDate: newDate}));
                                    }
                                  }}
                                  className="w-20"
                              />
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            Hours (0-23) : Minutes (0-59)
                          </p>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                  {formErrors.startDate && (
                      <p className="text-sm text-red-500">{formErrors.startDate}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>End Date and Time (Optional)</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                          variant="outline"
                          className={cn(
                              "w-full justify-start text-left font-normal",
                              !form.endDate && "text-muted-foreground"
                          )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4"/>
                        {form.endDate ? format(form.endDate, "PPP p") : "Pick a date and time"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <div className="p-4 border-b border-border">
                        <Calendar
                            mode="single"
                            selected={form.endDate ?? undefined}
                            onSelect={handleDateSelect('endDate')}
                            disabled={(date) => date < (form.startDate ?? new Date())}
                            initialFocus
                        />
                        <div className="mt-4">
                          <Label>Time</Label>
                          <div className="flex items-center space-x-2">
                            <div>
                              <Input
                                  type="number"
                                  min="0"
                                  max="23"
                                  placeholder="HH"
                                  value={form.endDate ? format(form.endDate, 'HH') : ''}
                                  onChange={(e) => {
                                    const hours = parseInt(e.target.value);
                                    if (hours >= 0 && hours <= 23) {
                                      const date = form.endDate || new Date();
                                      const newDate = new Date(date);
                                      newDate.setHours(hours);
                                      setForm(prev => ({...prev, endDate: newDate}));
                                    }
                                  }}
                                  className="w-20"
                                  disabled={!form.endDate}
                              />
                            </div>
                            <span className="text-lg">:</span>
                            <div>
                              <Input
                                  type="number"
                                  min="0"
                                  max="59"
                                  placeholder="MM"
                                  value={form.endDate ? format(form.endDate, 'mm') : ''}
                                  onChange={(e) => {
                                    const minutes = parseInt(e.target.value);
                                    if (minutes >= 0 && minutes <= 59) {
                                      const date = form.endDate || new Date();
                                      const newDate = new Date(date);
                                      newDate.setMinutes(minutes);
                                      setForm(prev => ({...prev, endDate: newDate}));
                                    }
                                  }}
                                  className="w-20"
                                  disabled={!form.endDate}
                              />
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            Hours (0-23) : Minutes (0-59)
                          </p>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Challenges</CardTitle>
              <CardDescription>
                Select and organize the challenges for your competition.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex space-x-4">
                  <div className="w-1/3">
                    <Label>Challenge Type</Label>
                    <Select
                        value={selectedType}
                        onValueChange={setSelectedType}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a type"/>
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(challengeTypes).map(([typeId, typeData]) => (
                            <SelectItem key={typeId} value={typeId}>
                              {typeData.name}
                            </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="w-2/3">
                    <Label>Available Challenges</Label>
                    <Select
                        disabled={!selectedType}
                        onValueChange={(value) => {
                          const challenge = challengeTypes[selectedType]?.challenges?.find(c => c.id === value);
                          if (challenge) handleAddChallenge(challenge);
                        }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a challenge"/>
                      </SelectTrigger>
                      <SelectContent>
                        {selectedType && challengeTypes[selectedType]?.challenges?.map((challenge) => (
                            <SelectItem
                                key={challenge.id}
                                value={challenge.id}
                                disabled={selectedChallenges.some(c => c.id === challenge.id)}
                            >
                              {challenge.name}
                            </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Selected Challenges</Label>
                  <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                        items={selectedChallenges}
                        strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-2">
                        {selectedChallenges.map((challenge) => (
                            <SortableChallenge
                                key={challenge.id}
                                challenge={challenge}
                                onRemove={handleRemoveChallenge}
                            />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                  {formErrors.challenges && (
                      <p className="text-sm text-red-500">{formErrors.challenges}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Access Settings</CardTitle>
              <CardDescription>
                Configure how participants will access the competition.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center space-x-2">
                <Switch
                    checked={form.generateAccessCode}
                    onCheckedChange={(checked) => setForm(prev => ({...prev, generateAccessCode: checked}))}
                />
                <Label>Generate access code for this competition</Label>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Instructors</CardTitle>
              <CardDescription>
                Select instructors who will manage this competition.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {instructors.map((instructor) => (
                    <div key={instructor.id} className="flex items-center space-x-2">
                      <Checkbox
                          id={instructor.id}
                          checked={form.instructorIds.includes(instructor.id)}
                          onCheckedChange={() => handleInstructorChange(instructor.id)}
                      />
                      <Label htmlFor={instructor.id}>
                        {instructor.name || instructor.email}
                      </Label>
                    </div>
                ))}
                {formErrors.instructors && (
                    <p className="text-sm text-red-500">{formErrors.instructors}</p>
                )}
              </div>
            </CardContent>
          </Card>

          {Object.keys(formErrors).length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4"/>
                <AlertDescription>
                  Please fix the following errors:
                  <ul className="mt-2 list-disc list-inside">
                    {Object.values(formErrors).map((error, index) => (
                        <li key={index}>{error}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
          )}
        </div>

        <Dialog open={showAccessCodeDialog} onOpenChange={(open) => {
          setShowAccessCodeDialog(open);
          if (!open && createdCompetitionId) {
            // Redirect to the competition page when dialog is closed
            window.location.href = `/dashboard/competitions/${createdCompetitionId}`;
          }
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Access Code Generated</DialogTitle>
              <DialogDescription>
                Share this code with participants to join the competition:
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center justify-center space-x-2 p-4">
              <code className="bg-muted px-4 py-2 rounded-md text-lg font-mono">
                {accessCode}
              </code>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleCopy}
              >
                {copied ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
            <div className="text-center text-sm text-muted-foreground">
              <p>This code will never expire.</p>
            </div>
            <div className="mt-4 flex justify-end">
              <Button onClick={() => {
                setShowAccessCodeDialog(false);
                if (createdCompetitionId) {
                  window.location.href = `/dashboard/competitions/${createdCompetitionId}`;
                }
              }}>
                Continue to Competition
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </form>
  );
}
