import { ActivityEventType } from '@prisma/client';
import { prisma } from './prisma';
import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const DATABASE_API_URL = process.env.DATABASE_API_URL || 'http://localhost:8000';

type LogSeverity = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

// Define all possible event types to ensure type safety
const EVENT_TYPES = {
  CHALLENGE_STARTED: 'CHALLENGE_STARTED',
  CHALLENGE_COMPLETED: 'CHALLENGE_COMPLETED',
  CHALLENGE_INSTANCE_CREATED: 'CHALLENGE_INSTANCE_CREATED',
  CHALLENGE_INSTANCE_DELETED: 'CHALLENGE_INSTANCE_DELETED',
  GROUP_JOINED: 'GROUP_JOINED',
  GROUP_CREATED: 'GROUP_CREATED',
  GROUP_LEFT: 'GROUP_LEFT',
  GROUP_DELETED: 'GROUP_DELETED',
  GROUP_UPDATED: 'GROUP_UPDATED',
  GROUP_MEMBER_REMOVED: 'GROUP_MEMBER_REMOVED',
  ACCESS_CODE_GENERATED: 'ACCESS_CODE_GENERATED',
  ACCESS_CODE_EXPIRED: 'ACCESS_CODE_EXPIRED',
  ACCESS_CODE_DELETED: 'ACCESS_CODE_DELETED',
  ACCESS_CODE_USED: 'ACCESS_CODE_USED',
  QUESTION_ATTEMPTED: 'QUESTION_ATTEMPTED',
  QUESTION_COMPLETED: 'QUESTION_COMPLETED',
  USER_REGISTERED: 'USER_REGISTERED',
  USER_LOGGED_IN: 'USER_LOGGED_IN',
  USER_ROLE_CHANGED: 'USER_ROLE_CHANGED',
  USER_UPDATED: 'USER_UPDATED',
  USER_DELETED: 'USER_DELETED',
  SYSTEM_ERROR: 'SYSTEM_ERROR'
} as const;

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
  static async logActivity({
    eventType,
    userId,
    severity = 'INFO',
    challengeId,
    groupId,
    challengeInstanceId,
    accessCodeId,
    metadata
  }: LogActivityParams) {
    try {
      const data = {
        eventType,
        userId,
        challengeId,
        groupId,
        challengeInstanceId,
        accessCodeId,
        metadata,
        timestamp: new Date()
      };

      if (severity) {
        Object.assign(data, { severity });
      }
      
      return await prisma.activityLog.create({
        data
      });
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
    const severityMap: Record<string, LogSeverity> = {
      'CHALLENGE_STARTED': 'INFO',
      'CHALLENGE_COMPLETED': 'INFO',
      'CHALLENGE_INSTANCE_CREATED': 'INFO',
      'CHALLENGE_INSTANCE_DELETED': 'INFO'
    };

    return this.logActivity({
      eventType,
      userId,
      challengeId,
      challengeInstanceId,
      severity: severityMap[eventType] || 'INFO',
      metadata: {
        timestamp: new Date().toISOString(),
        ...metadata
      }
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
    const severityMap: Record<string, LogSeverity> = {
      'ACCESS_CODE_GENERATED': 'INFO',
      'ACCESS_CODE_EXPIRED': 'WARNING',
      'ACCESS_CODE_DELETED': 'WARNING',
      'ACCESS_CODE_USED': 'INFO'
    };

    return this.logActivity({
      eventType,
      userId,
      accessCodeId,
      groupId,
      severity: severityMap[eventType] || 'INFO',
      metadata: {
        timestamp: new Date().toISOString(),
        ...metadata
      }
    });
  }

  // Group Events
  static async logGroupEvent(
    eventType: ActivityEventType,
    userId: string,
    groupId: string,
    metadata: Record<string, any>
  ) {
    const severityMap: Record<string, LogSeverity> = {
      'GROUP_CREATED': 'INFO',
      'GROUP_JOINED': 'INFO',
      'GROUP_LEFT': 'INFO',
      'GROUP_DELETED': 'WARNING',
      'GROUP_UPDATED': 'INFO',
      'GROUP_MEMBER_REMOVED': 'WARNING'
    };

    return this.logActivity({
      eventType,
      userId,
      groupId,
      severity: severityMap[eventType] || 'INFO',
      metadata: {
        timestamp: new Date().toISOString(),
        ...metadata
      }
    });
  }

  // User Events
  static async logUserEvent(
    eventType: ActivityEventType,
    userId: string,
    metadata: Record<string, any>
  ) {
    const severityMap: Record<string, LogSeverity> = {
      'USER_REGISTERED': 'INFO',
      'USER_LOGGED_IN': 'INFO',
      'USER_ROLE_CHANGED': 'WARNING',
      'USER_UPDATED': 'INFO',
      'USER_DELETED': 'WARNING'
    };

    return this.logActivity({
      eventType,
      userId,
      severity: severityMap[eventType] || 'INFO',
      metadata: {
        timestamp: new Date().toISOString(),
        ...metadata
      }
    });
  }

  // System Error
  static async logSystemError(userId: string, metadata: Record<string, any>) {
    return this.logActivity({
      eventType: EVENT_TYPES.SYSTEM_ERROR as ActivityEventType,
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
    const severityMap: Record<string, LogSeverity> = {
      'QUESTION_ATTEMPTED': 'INFO',
      'QUESTION_COMPLETED': 'INFO'
    };

    return this.logActivity({
      eventType,
      userId,
      challengeId,
      groupId,
      severity: severityMap[eventType] || 'INFO',
      metadata: {
        timestamp: new Date().toISOString(),
        ...metadata
      }
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
      'QUESTION_ATTEMPTED' as ActivityEventType,
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
      'QUESTION_COMPLETED' as ActivityEventType,
      userId,
      challengeId,
      groupId,
      metadata
    );
  }
} 