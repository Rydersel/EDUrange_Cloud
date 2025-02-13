import axios from 'axios';
import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const DATABASE_API_URL = process.env.DATABASE_API_URL || 'http://localhost:8000';

// Define event types to match backend
export enum ActivityEventType {
  CHALLENGE_STARTED = "CHALLENGE_STARTED",
  CHALLENGE_COMPLETED = "CHALLENGE_COMPLETED",
  GROUP_JOINED = "GROUP_JOINED",
  GROUP_CREATED = "GROUP_CREATED",
  GROUP_LEFT = "GROUP_LEFT",
  GROUP_DELETED = "GROUP_DELETED",
  GROUP_UPDATED = "GROUP_UPDATED",
  GROUP_MEMBER_REMOVED = "GROUP_MEMBER_REMOVED",
  ACCESS_CODE_GENERATED = "ACCESS_CODE_GENERATED",
  ACCESS_CODE_USED = "ACCESS_CODE_USED",
  ACCESS_CODE_EXPIRED = "ACCESS_CODE_EXPIRED",
  ACCESS_CODE_DELETED = "ACCESS_CODE_DELETED",
  USER_REGISTERED = "USER_REGISTERED",
  USER_LOGGED_IN = "USER_LOGGED_IN",
  USER_ROLE_CHANGED = "USER_ROLE_CHANGED",
  USER_UPDATED = "USER_UPDATED",
  USER_DELETED = "USER_DELETED",
  CHALLENGE_INSTANCE_CREATED = "CHALLENGE_INSTANCE_CREATED",
  CHALLENGE_INSTANCE_DELETED = "CHALLENGE_INSTANCE_DELETED",
  QUESTION_ATTEMPTED = "QUESTION_ATTEMPTED",
  QUESTION_COMPLETED = "QUESTION_COMPLETED",
  SYSTEM_ERROR = "SYSTEM_ERROR"
}

export type LogSeverity = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

interface LogActivityParams {
  eventType: ActivityEventType;
  userId: string;
  severity?: LogSeverity;
  challengeId?: string;
  groupId?: string;
  challengeInstanceId?: string;
  accessCodeId?: string;
  metadata: Record<string, any>;
}

export class ActivityLogger {
  static async logActivity(params: LogActivityParams) {
    try {
      // Add timestamp to metadata if not present
      if (!params.metadata.timestamp) {
        params.metadata.timestamp = new Date().toISOString();
      }

      // Convert metadata to JSON string
      const payload = {
        ...params,
        metadata: JSON.stringify(params.metadata)
      };

      const response = await axios.post(`${DATABASE_API_URL}/activity/log`, payload);
      return response.data;
    } catch (error) {
      console.error('Error logging activity:', error);
      return null;
    }
  }

  // Challenge Events
  static async logChallengeEvent(
    eventType: ActivityEventType,
    userId: string,
    challengeId: string,
    challengeInstanceId: string | undefined,
    metadata: Record<string, any>
  ) {
    const severityMap: Partial<Record<ActivityEventType, LogSeverity>> = {
      [ActivityEventType.CHALLENGE_STARTED]: 'INFO',
      [ActivityEventType.CHALLENGE_COMPLETED]: 'INFO',
      [ActivityEventType.CHALLENGE_INSTANCE_CREATED]: 'INFO',
      [ActivityEventType.CHALLENGE_INSTANCE_DELETED]: 'INFO'
    };

    return this.logActivity({
      eventType,
      userId,
      challengeId,
      challengeInstanceId,
      severity: severityMap[eventType] || 'INFO',
      metadata
    });
  }

  // Access Code Events
  static async logAccessCodeEvent(
    eventType: ActivityEventType,
    userId: string,
    accessCodeId: string,
    groupId: string,
    metadata: Record<string, any>
  ) {
    const severityMap: Partial<Record<ActivityEventType, LogSeverity>> = {
      [ActivityEventType.ACCESS_CODE_GENERATED]: 'INFO',
      [ActivityEventType.ACCESS_CODE_EXPIRED]: 'WARNING',
      [ActivityEventType.ACCESS_CODE_DELETED]: 'WARNING',
      [ActivityEventType.ACCESS_CODE_USED]: 'INFO'
    };

    return this.logActivity({
      eventType,
      userId,
      accessCodeId,
      groupId,
      severity: severityMap[eventType] || 'INFO',
      metadata
    });
  }

  // Group Events
  static async logGroupEvent(
    eventType: ActivityEventType,
    userId: string,
    groupId: string,
    metadata: Record<string, any>
  ) {
    const severityMap: Partial<Record<ActivityEventType, LogSeverity>> = {
      [ActivityEventType.GROUP_CREATED]: 'INFO',
      [ActivityEventType.GROUP_JOINED]: 'INFO',
      [ActivityEventType.GROUP_LEFT]: 'INFO',
      [ActivityEventType.GROUP_DELETED]: 'WARNING',
      [ActivityEventType.GROUP_UPDATED]: 'INFO',
      [ActivityEventType.GROUP_MEMBER_REMOVED]: 'WARNING'
    };

    return this.logActivity({
      eventType,
      userId,
      groupId,
      severity: severityMap[eventType] || 'INFO',
      metadata
    });
  }

  // User Events
  static async logUserEvent(
    eventType: ActivityEventType,
    userId: string,
    metadata: Record<string, any>
  ) {
    const severityMap: Partial<Record<ActivityEventType, LogSeverity>> = {
      [ActivityEventType.USER_REGISTERED]: 'INFO',
      [ActivityEventType.USER_LOGGED_IN]: 'INFO',
      [ActivityEventType.USER_ROLE_CHANGED]: 'WARNING',
      [ActivityEventType.USER_UPDATED]: 'INFO',
      [ActivityEventType.USER_DELETED]: 'WARNING'
    };

    return this.logActivity({
      eventType,
      userId,
      severity: severityMap[eventType] || 'INFO',
      metadata
    });
  }

  // System Error
  static async logSystemError(userId: string, metadata: Record<string, any>) {
    return this.logActivity({
      eventType: ActivityEventType.SYSTEM_ERROR,
      userId,
      severity: 'ERROR',
      metadata: {
        errorTime: new Date().toISOString(),
        ...metadata
      }
    });
  }

  // Question Events
  static async logQuestionEvent(
    eventType: ActivityEventType,
    userId: string,
    challengeId: string,
    groupId: string,
    metadata: Record<string, any>
  ) {
    const severityMap: Partial<Record<ActivityEventType, LogSeverity>> = {
      [ActivityEventType.QUESTION_ATTEMPTED]: 'INFO',
      [ActivityEventType.QUESTION_COMPLETED]: 'INFO'
    };

    return this.logActivity({
      eventType,
      userId,
      challengeId,
      groupId,
      severity: severityMap[eventType] || 'INFO',
      metadata
    });
  }

  static async logQuestionAttempt(
    userId: string,
    challengeId: string,
    groupId: string,
    metadata: {
      questionId: string;
      answer: string;
      isCorrect: boolean;
      attemptNumber?: number;
      points?: number;
    }
  ) {
    return this.logQuestionEvent(
      ActivityEventType.QUESTION_ATTEMPTED,
      userId,
      challengeId,
      groupId,
      metadata
    );
  }

  static async logQuestionCompletion(
    userId: string,
    challengeId: string,
    groupId: string,
    metadata: {
      questionId: string;
      pointsEarned: number;
      totalAttempts: number;
      completionTime: string;
    }
  ) {
    return this.logQuestionEvent(
      ActivityEventType.QUESTION_COMPLETED,
      userId,
      challengeId,
      groupId,
      metadata
    );
  }
}
