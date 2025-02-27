'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, ChevronLeft, ChevronRight, HelpCircle } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface CompletionData {
  date: string;
  count: number;
  challenges: {
    name: string;
    competition: string;
    points: number;
  }[];
}

interface ChallengeHeatmapProps {
  userId: string;
}

export function ChallengeHeatmap({ userId }: ChallengeHeatmapProps) {
  const [completions, setCompletions] = useState<CompletionData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [tooltipContent, setTooltipContent] = useState<React.ReactNode | null>(null);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  
  // Generate years for the dropdown (last 3 years)
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 3 }, (_, i) => currentYear - i);

  useEffect(() => {
    const fetchCompletions = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const response = await fetch(`/api/profile/challenge-completions?userId=${userId}&year=${year}`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch challenge completions');
        }
        
        const data = await response.json();
        setCompletions(data.completions);
      } catch (err) {
        console.error('Error fetching challenge completions:', err);
        setError('Failed to load challenge completion data');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchCompletions();
  }, [userId, year]);

  // Generate dates for the current year
  const generateDates = () => {
    const dates = [];
    const startDate = new Date(year, 0, 1); // January 1st of the selected year
    const endDate = new Date(year, 11, 31); // December 31st of the selected year
    
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const existingData = completions.find(c => c.date === dateStr);
      
      dates.push({
        date: dateStr,
        count: existingData?.count || 0,
        challenges: existingData?.challenges || []
      });
    }
    
    return dates;
  };

  // Generate months for the heatmap
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Generate days for the heatmap
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Handle cell hover
  const handleCellHover = (completion: CompletionData, event: React.MouseEvent) => {
    if (completion.count > 0) {
   
      setTooltipContent(
        <div className="space-y-2">
          <p className="font-medium">{new Date(completion.date).toLocaleDateString(undefined, { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          })}</p>
          <p className="text-sm font-medium">{completion.count} challenge{completion.count !== 1 ? 's' : ''} completed</p>
          <ul className="space-y-1 text-xs">
            {completion.challenges.map((challenge, i) => (
              <li key={i} className="flex justify-between">
                <span>{challenge.name}</span>
                <span className="text-green-400">+{challenge.points} pts</span>
              </li>
            ))}
          </ul>
        </div>
      );
      setTooltipVisible(true);
    }
  };

  // Handle cell leave
  const handleCellLeave = () => {
    setTooltipVisible(false);
  };

  // Get color based on count
  const getCellColor = (count: number) => {
    if (count === 0) return 'bg-black/40';
    if (count === 1) return 'bg-green-800/50';
    if (count <= 3) return 'bg-green-700/60';
    if (count <= 5) return 'bg-green-500/70';
    return 'bg-green-400/80';
  };

  // Handle year change
  const handlePrevYear = () => {
    setYear(prev => prev - 1);
  };

  const handleNextYear = () => {
    if (year < new Date().getFullYear()) {
      setYear(prev => prev + 1);
    }
  };

  // Calculate total completions and longest streak
  const calculateStats = () => {
    const totalCompletions = completions.reduce((sum, day) => sum + day.count, 0);
    
    // Calculate longest streak
    let currentStreak = 0;
    let longestStreak = 0;
    let lastDate: Date | null = null;
    
    const sortedCompletions = [...completions]
      .filter(c => c.count > 0)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    for (const completion of sortedCompletions) {
      const currentDate = new Date(completion.date);
      
      if (!lastDate) {
        currentStreak = 1;
      } else {
        const diffDays = Math.floor((currentDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
        
        if (diffDays === 1) {
          currentStreak++;
        } else if (diffDays > 1) {
          currentStreak = 1;
        }
      }
      
      if (currentStreak > longestStreak) {
        longestStreak = currentStreak;
      }
      
      lastDate = currentDate;
    }
    
    return { totalCompletions, longestStreak };
  };

  const { totalCompletions, longestStreak } = calculateStats();
  const allDates = generateDates();
  
  // Group dates by week for the heatmap
  const weeks: CompletionData[][] = [];
  let currentWeek: CompletionData[] = [];
  
  // Fill in missing days at the start
  const firstDay = new Date(allDates[0].date).getDay();
  for (let i = 0; i < firstDay; i++) {
    currentWeek.push({ date: '', count: -1, challenges: [] });
  }
  
  // Add all dates
  allDates.forEach(date => {
    currentWeek.push(date);
    
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  });
  
  // Add remaining days to the last week
  if (currentWeek.length > 0) {
    weeks.push(currentWeek);
  }

  return (
    <Card className="bg-black/40 backdrop-blur-sm border-green-900/50">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            Challenge Activity
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
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
          <CardDescription>Your challenge completion history</CardDescription>
        </div>
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
            <SelectTrigger className="w-[100px] h-8">
              <SelectValue placeholder={year.toString()} />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={y.toString()}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Button 
            variant="outline" 
            size="icon" 
            className="h-8 w-8" 
            onClick={handleNextYear}
            disabled={year >= new Date().getFullYear()}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : error ? (
          <div className="text-center py-4 text-muted-foreground">
            {error}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div>
                <span className="font-medium text-green-400">{totalCompletions}</span> challenges completed in {year}
              </div>
              <div>
                Longest streak: <span className="font-medium text-green-400">{longestStreak}</span> days
              </div>
            </div>
            
            <div className="relative overflow-x-auto">
              <div className="flex">
                <div className="pr-2 pt-6">
                  <div className="grid grid-cols-1 gap-[3px]">
                    {days.map((day, i) => (
                      <div key={i} className="h-[10px] text-xs text-muted-foreground flex items-center">
                        {i % 2 === 0 ? day : ''}
                      </div>
                    ))}
                  </div>
                </div>
                
                <div>
                  <div className="flex gap-1 mb-1">
                    {months.map((month, i) => (
                      <div 
                        key={i} 
                        className="text-xs text-muted-foreground"
                        style={{ 
                          width: `${Math.ceil(weeks.length / 12) * 13}px`,
                          textAlign: 'center'
                        }}
                      >
                        {month}
                      </div>
                    ))}
                  </div>
                  
                  <div className="flex gap-[3px]">
                    {weeks.map((week, weekIndex) => (
                      <div key={weekIndex} className="grid grid-cols-1 gap-[3px]">
                        {week.map((day, dayIndex) => (
                          <div
                            key={`${weekIndex}-${dayIndex}`}
                            className={`w-[10px] h-[10px] rounded-sm ${
                              day.count === -1 ? 'bg-transparent' : getCellColor(day.count)
                            } cursor-pointer transition-colors`}
                            onMouseEnter={(e) => handleCellHover(day, e)}
                            onMouseLeave={handleCellLeave}
                            title={day.count > 0 ? `${day.count} challenges on ${day.date}` : ''}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              
              <div className="flex justify-end mt-2 gap-1 items-center">
                <span className="text-xs text-muted-foreground mr-1">Less</span>
                {[0, 1, 3, 5, 7].map((count) => (
                  <div 
                    key={count} 
                    className={`w-[10px] h-[10px] rounded-sm ${getCellColor(count)}`}
                  />
                ))}
                <span className="text-xs text-muted-foreground ml-1">More</span>
              </div>
            </div>
            
            {tooltipVisible && tooltipContent && (
              <div 
                className="fixed z-50 bg-black/90 border border-green-900/50 rounded-md p-3 shadow-lg max-w-xs"
                style={{
                  top: `${tooltipPosition.y}px`,
                  left: `${tooltipPosition.x}px`,
                }}
              >
                {tooltipContent}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
} 