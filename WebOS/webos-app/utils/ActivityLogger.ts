export type ActivityEventType = 
  | 'QUESTION_ATTEMPTED'
  | 'QUESTION_COMPLETED';

interface LogMetadata {
  questionId?: string;
  answer?: string;
  isCorrect?: boolean;
  attemptNumber?: number;
  pointsEarned?: number;
  totalAttempts?: number;
  completionTime?: number;
}

class ActivityLogger {
  static async logQuestionAttempt(
    userId: string,
    challengeId: string,
    groupId: string | null,
    questionId: string,
    answer: string,
    isCorrect: boolean,
    attemptNumber: number
  ) {
    try {
      const metadata: LogMetadata = {
        questionId,
        answer,
        isCorrect,
        attemptNumber
      };

      await fetch('/api/activity-logs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          challengeId,
          groupId,
          eventType: 'QUESTION_ATTEMPTED',
          metadata
        }),
      });
    } catch (error) {
      console.error('Failed to log question attempt:', error);
    }
  }

  static async logQuestionCompletion(
    userId: string,
    challengeId: string,
    groupId: string | null,
    questionId: string,
    pointsEarned: number,
    totalAttempts: number,
    completionTime: number
  ) {
    try {
      const metadata: LogMetadata = {
        questionId,
        pointsEarned,
        totalAttempts,
        completionTime
      };

      await fetch('/api/activity-logs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          challengeId,
          groupId,
          eventType: 'QUESTION_COMPLETED',
          metadata
        }),
      });
    } catch (error) {
      console.error('Failed to log question completion:', error);
    }
  }
}

export default ActivityLogger; 