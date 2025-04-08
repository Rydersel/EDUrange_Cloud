'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, ChevronLeft, ChevronRight, HelpCircle } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Challenge {
  name: string;
  competition: string;
  points: number;
  type: string;
}

interface CompletionData {
  date: string;
  count: number;
  challenges: Challenge[];
}

interface ChallengeHeatmapProps {
  userId: string;
}

interface ApiResponse {
  completions: CompletionData[];
  totalCompletions: number;
  totalPoints: number;
}

export function ChallengeHeatmap({ userId }: ChallengeHeatmapProps) {
  const [data, setData] = useState<CompletionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [totalCompletions, setTotalCompletions] = useState(0);
  const [totalPoints, setTotalPoints] = useState(0);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        console.log(`Fetching challenge completions for user ${userId} in year ${year}`);
        const response = await fetch(`/api/profile/challenge-completions?userId=${userId}&year=${year}`);
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          console.error('Failed to fetch challenge completions:', {
            status: response.status,
            statusText: response.statusText,
            error: errorData
          });
          throw new Error(`Failed to fetch challenge completions: ${response.statusText}`);
        }
        
        const data: ApiResponse = await response.json();
        console.log('Received challenge completion data:', {
          completionsCount: data.completions.length,
          totalCompletions: data.totalCompletions,
          totalPoints: data.totalPoints
        });
        
        setData(data.completions);
        setTotalCompletions(data.totalCompletions);
        setTotalPoints(data.totalPoints);
        setError(null);
      } catch (err) {
        console.error('Error in challenge heatmap:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        setData([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [userId, year]);

  const handlePrevYear = () => setYear(prev => prev - 1);
  const handleNextYear = () => setYear(prev => prev + 1);

  const getColor = (count: number): string => {
    if (count === 0) return 'bg-primary/5';
    if (count === 1) return 'bg-primary/20';
    if (count === 2) return 'bg-primary/40';
    if (count === 3) return 'bg-primary/60';
    return 'bg-primary/80';
  };

  const months = Array.from({ length: 12 }, (_, i) => {
    const date = new Date(year, i, 1);
    return {
      name: date.toLocaleString('default', { month: 'short' }),
      days: Array.from(
        { length: new Date(year, i + 1, 0).getDate() },
        (_, d) => {
          const currentDate = new Date(year, i, d + 1);
          const dateStr = currentDate.toISOString().split('T')[0];
          const completion = data.find(c => c.date === dateStr);
          return {
            date: currentDate,
            count: completion?.count || 0,
            challenges: completion?.challenges || []
          };
        }
      )
    };
  });

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Challenge Activity
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[200px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Error</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Challenge Activity
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <HelpCircle className="h-4 w-4 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs">
                    This heatmap shows your challenge completion activity over time.
                    Darker cells indicate more challenges completed on that day.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="icon" 
              className="h-8 w-8" 
              onClick={handlePrevYear}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Select value={year.toString()} onValueChange={(value) => setYear(parseInt(value))}>
              <SelectTrigger className="w-[100px]">
                <SelectValue>{year}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 5 }, (_, i) => {
                  const yearValue = new Date().getFullYear() - i;
                  return (
                    <SelectItem key={yearValue} value={yearValue.toString()}>
                      {yearValue}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <Button 
              variant="outline" 
              size="icon" 
              className="h-8 w-8" 
              onClick={handleNextYear}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <CardDescription>
          {totalCompletions} challenges completed ({totalPoints} points earned) in {year}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {data.length === 0 && year === new Date().getFullYear() ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">No challenges completed yet</p>
              <p className="text-sm text-muted-foreground">
                Complete challenges to see your activity here
              </p>
            </div>
          ) : data.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">No activity in {year}</p>
              <p className="text-sm text-muted-foreground">
                Try selecting a different year
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-12 gap-2">
              {months.map((month, i) => (
                <div key={i} className="space-y-2">
                  <div className="text-xs text-muted-foreground">{month.name}</div>
                  <div className="grid grid-rows-[repeat(31,1fr)] gap-1 justify-items-center">
                    {month.days.map((day, j) => {
                      const hasCompletions = day.count > 0;
                      return (
                        <TooltipProvider key={j}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div
                                className={`h-2 w-2 rounded-sm ${getColor(day.count)} transition-colors hover:opacity-75`}
                              />
                            </TooltipTrigger>
                            <TooltipContent>
                              <div className="text-xs">
                                {day.date.toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric'
                                })}
                                <br />
                                {hasCompletions ? (
                                  <>
                                    {day.count} challenge{day.count !== 1 ? 's' : ''} completed
                                    {day.challenges.map((challenge, k) => (
                                      <div key={k} className="mt-1 text-[10px]">
                                        • {challenge.name} ({challenge.points} pts)
                                      </div>
                                    ))}
                                  </>
                                ) : (
                                  'No challenges completed'
                                )}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
} 