import { Active, DataRef, Over } from '@dnd-kit/core';
import { ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

type DraggableData = ColumnDragData | TaskDragData;

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function hasDraggableData<T extends Active | Over>(
  entry: T | null | undefined
): entry is T & {
  data: DataRef<DraggableData>;
} {
  if (!entry) {
    return false;
  }

  const data = entry.data.current;

  if (data?.type === 'Column' || data?.type === 'Task') {
    return true;
  }

  return false;
}

export function extractChallengeDescription(appsConfig: string | any): string {
  try {
    console.log('Raw AppsConfig:', appsConfig);
    console.log('Type of AppsConfig:', typeof appsConfig);

    let apps;
    if (typeof appsConfig === 'string') {
      console.log('Parsing string AppsConfig');
      apps = JSON.parse(appsConfig);
    } else {
      console.log('Using AppsConfig as is');
      apps = appsConfig;
    }

    console.log('Parsed apps:', apps);
    
    const challengePrompt = apps.find((app: any) => {
      console.log('Checking app:', app.id);
      return app.id === 'challenge-prompt';
    });
    
    console.log('Found challenge prompt:', challengePrompt);
    
    if (challengePrompt?.challenge?.description) {
      console.log('Using challenge description:', challengePrompt.challenge.description);
      return challengePrompt.challenge.description;
    }
    
    if (challengePrompt?.challenge?.pages?.[0]?.instructions) {
      console.log('Using page instructions:', challengePrompt.challenge.pages[0].instructions);
      return challengePrompt.challenge.pages[0].instructions;
    }
    
    if (challengePrompt?.description) {
      console.log('Using app description:', challengePrompt.description);
      return challengePrompt.description;
    }
    
    console.log('No description found');
    return 'No description available';
  } catch (error) {
    console.error('Error in extractChallengeDescription:', error);
    console.error('Failed AppsConfig:', appsConfig);
    return 'No description available';
  }
}

export function extractChallengePoints(appsConfig: string | any): number {
  try {
    console.log('Raw AppsConfig for points:', appsConfig);
    console.log('Type of AppsConfig:', typeof appsConfig);

    let apps;
    if (typeof appsConfig === 'string') {
      console.log('Parsing string AppsConfig');
      apps = JSON.parse(appsConfig);
    } else {
      console.log('Using AppsConfig as is');
      apps = appsConfig;
    }

    console.log('Parsed apps for points:', apps);
    
    const challengePrompt = apps.find((app: any) => {
      console.log('Checking app for points:', app.id);
      return app.id === 'challenge-prompt';
    });
    
    console.log('Found challenge prompt for points:', challengePrompt);
    console.log('Challenge pages:', challengePrompt?.challenge?.pages);
    
    if (challengePrompt?.challenge?.pages) {
      let totalPoints = 0;
      challengePrompt.challenge.pages.forEach((page: any, index: number) => {
        console.log(`Processing page ${index}:`, page);
        if (page.questions) {
          const pagePoints = page.questions.reduce((sum: number, question: any) => {
            console.log('Question:', question);
            console.log('Question points:', question.points);
            return sum + (question.points || 0);
          }, 0);
          console.log(`Page ${index} points:`, pagePoints);
          totalPoints += pagePoints;
        }
      });
      
      console.log('Final total points:', totalPoints);
      return totalPoints;
    }
    
    console.log('No points found');
    return 0;
  } catch (error) {
    console.error('Error in extractChallengePoints:', error);
    console.error('Failed AppsConfig:', appsConfig);
    return 0;
  }
}
