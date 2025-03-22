import { ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNow } from "date-fns";
import { NextResponse } from "next/server";

/**
 * Combines class names with Tailwind's class merging
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Extracts the challenge description from an apps config object
 * Used in challenge cards and listings to show challenge descriptions
 */
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

/**
 * Extracts the total point value from a challenge's apps config
 * Used to calculate total points for competitions
 */
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

// ============== Date Formatting Utilities ==============

/**
 * Standard date formatter for consistent date display across the app
 * @param date Date to format
 * @param formatString Optional format string (defaults to 'PPP')
 * @returns Formatted date string
 */
export function formatDate(date: Date | string | number, formatString: string = 'PPP'): string {
  if (!date) return 'N/A';
  
  try {
    const dateObj = typeof date === 'string' || typeof date === 'number' 
      ? new Date(date) 
      : date;
      
    return format(dateObj, formatString);
  } catch (error) {
    console.error('Date formatting error:', error);
    return 'Invalid date';
  }
}

/**
 * Format a date relative to now (e.g., "2 hours ago")
 * @param date Date to format
 * @param options Optional configuration options
 * @returns Relative time string
 */
export function formatRelativeTime(date: Date | string | number, options = { addSuffix: true }): string {
  if (!date) return 'N/A';
  
  try {
    const dateObj = typeof date === 'string' || typeof date === 'number' 
      ? new Date(date) 
      : date;
      
    return formatDistanceToNow(dateObj, options);
  } catch (error) {
    console.error('Relative date formatting error:', error);
    return 'Invalid date';
  }
}

// ============== API Response Utilities ==============

/**
 * Standardized error response creator for API routes
 * @param message Error message
 * @param status HTTP status code
 * @returns NextResponse with error message and status
 */
export function createErrorResponse(message: string, status: number = 403) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Standardized success response creator for API routes
 * @param data Data to return
 * @param status HTTP status code
 * @returns NextResponse with data and status
 */
export function createSuccessResponse(data: any, status: number = 200) {
  return NextResponse.json(data, { status });
}

/**
 * Standardized error handler for API routes
 * @param error Error object
 * @returns NextResponse with appropriate error message and status
 */
export function handleApiError(error: any): NextResponse {
  console.error('API error:', error);
  
  if (error.response) {
    // Response error from external API
    return createErrorResponse(
      error.response.data?.error || 'External API error',
      error.response.status || 500
    );
  }
  
  if (error.message === 'Unauthorized') {
    return createErrorResponse('Unauthorized', 401);
  }
  
  return createErrorResponse(error.message || 'Internal server error', 500);
}

// ============== Status Mapping Utilities ==============

/**
 * Generic status normalizer to convert various status formats to standard types
 * @param status Input status in any format
 * @returns Normalized status string
 */
export function normalizeStatus(status: any): string {
  if (!status) return 'unknown';
  
  const statusString = String(status).toLowerCase();
  
  // Map common statuses to normalized values
  if (['running', 'active', 'online', 'healthy', 'available', 'completed', 'success'].includes(statusString)) {
    return 'success';
  }
  
  if (['warning', 'degraded', 'pending', 'in progress', 'in-progress', 'starting'].includes(statusString)) {
    return 'warning';
  }
  
  if (['error', 'failed', 'down', 'offline', 'stopped', 'unavailable', 'critical'].includes(statusString)) {
    return 'error';
  }
  
  if (['idle', 'standby', 'inactive', 'unknown'].includes(statusString)) {
    return 'default';
  }
  
  return statusString;
}
