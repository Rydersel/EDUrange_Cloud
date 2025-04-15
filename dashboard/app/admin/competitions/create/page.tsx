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

interface SelectedChallenge {
  id: string;
  name: string;
  type: string;
  points: number;
  customPoints?: number;
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
  instructorIds: string[];
  generateAccessCode: boolean;
}

interface SortableChallengeProps {
  challenge: SelectedChallenge;
  onRemove: (id: string) => void;
  onPointsChange: (id: string, points: number) => void;
}

const SortableChallenge = ({ challenge, onRemove, onPointsChange }: SortableChallengeProps) => {
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
      className="flex items-center justify-between bg-secondary/50 rounded-lg p-2 space-x-2"
    >
      <div className="flex items-center space-x-2 flex-grow">
        <button
          className="cursor-move opacity-50 hover:opacity-100 flex-shrink-0"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="flex-grow">
          <p className="text-sm font-medium">{challenge.name}</p>
          <p className="text-xs text-muted-foreground">{challenge.type}</p>
        </div>
      </div>
      <div className="flex items-center space-x-1 flex-shrink-0">
         <Label htmlFor={`points-${challenge.id}`} className="sr-only">Points</Label>
         <Input
           id={`points-${challenge.id}`}
           type="number"
           min="0"
           value={challenge.points}
           onChange={(e) => {
              const points = parseInt(e.target.value, 10);
              if (!isNaN(points) && points >= 0) {
                onPointsChange(challenge.id, points);
              }
           }}
           className="w-16 h-8 text-sm"
           />
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => onRemove(challenge.id)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export default function CreateCompetitionPage() {
  const [selectedChallenges, setSelectedChallenges] = useState<SelectedChallenge[]>([]);
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
      setSelectedChallenges(prev => [...prev, { ...challenge, points: 100 }]);
    }
  };

  const handleRemoveChallenge = (challengeId: string) => {
    setSelectedChallenges(prev => prev.filter(c => c.id !== challengeId));
  };

  const handlePointsChange = (challengeId: string, points: number) => {
    setSelectedChallenges(prev =>
      prev.map(c => c.id === challengeId ? { ...c, points: points } : c)
    );
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
          instructorIds: newItems.map(item => item.id),
        }));

        return newItems;
      });
    }
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (form.name.trim() === '') {
      errors.name = 'Competition name is required';
    }
    if (form.description.trim() === '') {
      errors.description = 'Description is required';
    }
    if (form.startDate === null) {
      errors.startDate = 'Start date is required';
    }
    if (selectedChallenges.length === 0) {
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

    // Prepare the data for the API
    const apiPayload = {
      name: form.name,
      description: form.description,
      startDate: form.startDate,
      endDate: form.endDate,
      // Transform selectedChallenges into the required format
      challenges: selectedChallenges.map(c => ({
        id: c.id,
        points: c.points,
        // Include other fields the API might still expect from validation, even if not used for GroupChallenge creation
        name: c.name,
        type: c.type,
        customPoints: c.customPoints,
      })),
      instructorIds: form.instructorIds,
      generateAccessCode: form.generateAccessCode, // Ensure this flag is sent
      // Include other fields the API expects based on the Zod schema (accessCodeFormat, codeExpiration)
      // These might need dedicated form inputs if they aren't already present
      accessCodeFormat: 'random', // Example: Add input for this later
      codeExpiration: 'never',   // Example: Add input for this later
    };

    console.log("Submitting competition data:", JSON.stringify(apiPayload, null, 2));

    try {
      setIsSubmitting(true);
      // Send the transformed payload
      const response = await fetch('/api/competitions', { // Use the correct endpoint /api/competitions
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(apiPayload), // Send the prepared payload
      });

      // Log the response status and headers
      console.log("Response status:", response.status);
      // Convert headers to object safely
      const headersObj: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headersObj[key] = value;
      });
      console.log("Response headers:", headersObj);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Error response body:", errorText);

        let errorData;
        try {
          errorData = errorText ? JSON.parse(errorText) : null;
        } catch (e) {
          console.error("Failed to parse error response as JSON:", e);
          errorData = { message: errorText };
        }

        if (errorData?.errors) {
          console.error("Validation errors:", errorData.errors);
        }

        throw new Error(errorData?.error?.message || errorData?.message || errorData?.errors?.[0]?.message || 'Failed to create competition');
      }

      const data = await response.json();
      setCreatedCompetitionId(data.id); // Use data.id from the response

      // If generateAccessCode was true, show the dialog with the code
      if (form.generateAccessCode) {
        // Set the access code from the API response
        setAccessCode(data.accessCode);
        setShowAccessCodeDialog(true);
        toast({ title: 'Success', description: 'Competition created with access code.' });
        // Don't redirect immediately if showing code dialog
      } else {
        toast({ title: 'Success', description: 'Competition created successfully' });
        // Redirect to the new competition page
        window.location.href = `/admin/competitions/${data.id}`; // Use data.id
      }

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
            <Link href="/admin/competitions" className="text-muted-foreground hover:text-foreground">
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
                        items={selectedChallenges.map(c => c.id)}
                        strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-2">
                        {selectedChallenges.map((challenge) => (
                            <SortableChallenge
                                key={challenge.id}
                                challenge={challenge}
                                onRemove={handleRemoveChallenge}
                                onPointsChange={handlePointsChange}
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
            window.location.href = `/admin/competitions/${createdCompetitionId}`;
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
                  window.location.href = `/admin/competitions/${createdCompetitionId}`;
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
