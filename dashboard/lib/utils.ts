import { Active, DataRef, Over } from '@dnd-kit/core';
import { ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// Define the missing types
interface ColumnDragData {
  type: 'Column';
  id: string;
}

interface TaskDragData {
  type: 'Task';
  id: string;
  columnId: string;
}

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
    let apps;
    if (typeof appsConfig === 'string') {
      apps = JSON.parse(appsConfig);
    } else {
      apps = appsConfig;
    }
    const challengePrompt = apps.find((app: any) => {
      return app.id === 'challenge-prompt';
    });

    if (challengePrompt?.challenge?.description) {
      return challengePrompt.challenge.description;
    }

    if (challengePrompt?.challenge?.pages?.[0]?.instructions) {
      return challengePrompt.challenge.pages[0].instructions;
    }

    if (challengePrompt?.description) {
      return challengePrompt.description;
    }

    return 'No description available';
  } catch (error) {
    return 'No description available';
  }
}

export function extractChallengePoints(appsConfig: string | any): number {
  try {
    let apps;
    if (typeof appsConfig === 'string') {
      apps = JSON.parse(appsConfig);
    } else {
      apps = appsConfig;
    }

    const challengePrompt = apps.find((app: any) => {
      return app.id === 'challenge-prompt';
    });

    if (challengePrompt?.challenge?.pages) {
      let totalPoints = 0;
      challengePrompt.challenge.pages.forEach((page: any, index: number) => {
        if (page.questions) {
          const pagePoints = page.questions.reduce((sum: number, question: any) => {
            return sum + (question.points || 0);
          }, 0);
          totalPoints += pagePoints;
        }
      });
      return totalPoints;
    }

    return 0;
  } catch (error) {
    return 0;
  }
}
