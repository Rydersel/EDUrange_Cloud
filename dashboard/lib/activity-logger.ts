import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Use the database proxy route with query parameter for activity logging
// This provides better reliability with local database fallback
const ACTIVITY_LOG_URL = '/api/proxy/database?path=activity/log';

// Define event types to match backend
export enum ActivityEventType {
  CHALLENGE_STARTED = "CHALLENGE_STARTED",
  CHALLENGE_COMPLETED = "CHALLENGE_COMPLETED",
  GROUP_JOINED = "GROUP_JOINED",
  GROUP_CREATED = "GROUP_CREATED",
  ACCESS_CODE_GENERATED = "ACCESS_CODE_GENERATED",
  USER_REGISTERED = "USER_REGISTERED",
  USER_LOGGED_IN = "USER_LOGGED_IN",
  USER_ROLE_CHANGED = "USER_ROLE_CHANGED",
  USER_UPDATED = "USER_UPDATED",
  CHALLENGE_INSTANCE_CREATED = "CHALLENGE_INSTANCE_CREATED",
  CHALLENGE_INSTANCE_DELETED = "CHALLENGE_INSTANCE_DELETED",
  CHALLENGE_INSTANCE_QUEUED = "CHALLENGE_INSTANCE_QUEUED",
  QUESTION_ATTEMPTED = "QUESTION_ATTEMPTED",
  QUESTION_COMPLETED = "QUESTION_COMPLETED",
  GROUP_UPDATED = "GROUP_UPDATED",
  GROUP_LEFT = "GROUP_LEFT",
  GROUP_DELETED = "GROUP_DELETED",
  ACCESS_CODE_USED = "ACCESS_CODE_USED",
  ACCESS_CODE_EXPIRED = "ACCESS_CODE_EXPIRED",
  ACCESS_CODE_DELETED = "ACCESS_CODE_DELETED",
  SYSTEM_ERROR = "SYSTEM_ERROR",
  GROUP_MEMBER_REMOVED = "GROUP_MEMBER_REMOVED",
  USER_DELETED = "USER_DELETED",
  CHALLENGE_PACK_INSTALLED = "CHALLENGE_PACK_INSTALLED",
  ACCESS_CODE_INVALID = "ACCESS_CODE_INVALID",
  CHALLENGE_TERMINATION_INITIATED = "CHALLENGE_TERMINATION_INITIATED",
  
}

export enum LogSeverity {
  INFO = "INFO",
  WARNING = "WARNING",
  ERROR = "ERROR",
  CRITICAL = "CRITICAL"
}

interface LogActivityParams {
  eventType: ActivityEventType;
  userId: string;
  severity?: LogSeverity;
  challengeId?: string;
  groupId?: string;
  challengeInstanceId?: string;
  accessCodeId?: string;
  metadata?: Record<string, any>;
}

export class ActivityLogger {
  static async logActivity(params: LogActivityParams) {
    try {
      // Ensure metadata is a plain object
      const metadata = params.metadata || {};

      // Add timestamp to metadata if not already present
      if (!metadata.timestamp) {
        metadata.timestamp = new Date().toISOString();
      }

      // Create a clean payload with proper type annotations
      // Remove any fields not supported in the schema
      const payload: any = {
        eventType: params.eventType,
        userId: params.userId,
        severity: params.severity || LogSeverity.INFO,
        metadata: metadata // Send the object directly, don't stringify it
      };

      // If a challengeId is provided, verify it's a valid UUID-like string
      // This helps prevent database errors due to missing challenge references
      if (params.challengeId) {
        // Only include challengeId if it looks like a valid format (basic validation)
        // UUID format or challenge-like IDs
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.challengeId) || 
            /^[a-zA-Z0-9_-]+$/.test(params.challengeId)) {
          payload.challengeId = params.challengeId;
        } else {
          // If it's not a valid format, log the original ID in metadata
          metadata.originalChallengeId = params.challengeId;
          console.warn(`ActivityLogger: Invalid challenge ID format: ${params.challengeId}, saving to metadata instead`);
        }
      }
      
      // Add other optional fields only if they exist
      if (params.groupId) payload.groupId = params.groupId;
      if (params.challengeInstanceId) payload.challengeInstanceId = params.challengeInstanceId;
      if (params.accessCodeId) payload.accessCodeId = params.accessCodeId;

      // Determine the base URL for server-side requests
      let apiUrl = ACTIVITY_LOG_URL;

      // If we're server-side (no window object), and not running in a browser environment,
      // we need to use an absolute URL
      if (typeof window === 'undefined') {
        // For server-side in kubernetes, directly access the service
        if (process.env.KUBERNETES_SERVICE_HOST) {
          // Try direct access to the database API service first
          try {
            const response = await axios.post(
              'http://database-api-service.default.svc.cluster.local/activity/log', 
              payload
            );
            return response.data;
          } catch (directError) {
            // If direct access fails, try the fallback URL
            console.warn('Direct database API access failed, trying fallback');
            
            // Generate a fallback URL using dashboard base URL
            const dashboardUrl = process.env.DASHBOARD_URL || 'http://dashboard.default.svc.cluster.local';
            apiUrl = `${dashboardUrl}/api/proxy/database?path=activity/log`;
          }
        } else {
          // In other server environments, use the configured base URL
          const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
          apiUrl = `${baseUrl}${ACTIVITY_LOG_URL}`;
        }
      }

      // Send the request
      const response = await axios.post(apiUrl, payload);
      return response.data;
    } catch (error: any) {
      console.error('=== ACTIVITY LOGGER: Error logging activity ===');
      console.error('Error:', error);
      if (error.response) {
        console.error('==== ERROR RESPONSE DETAILS ====');
        console.error('Status:', error.response.status);
        console.error('Headers:', JSON.stringify(error.response.headers, null, 2));
        console.error('Data:', JSON.stringify(error.response.data, null, 2));
        console.error('===============================');
      } else if (error.request) {
        console.error('==== ERROR REQUEST DETAILS ====');
        console.error('No response received, request details:', error.request);
        console.error('===============================');
      }

      console.error('Original params:', JSON.stringify(params, null, 2));
      
      // Don't throw the error, just return a failure object
      // This will prevent the error from stopping the main application flow
      return { 
        success: false, 
        error: error?.message || 'Unknown error in activity logging',
        params: params
      };
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
      [ActivityEventType.CHALLENGE_STARTED]: LogSeverity.INFO,
      [ActivityEventType.CHALLENGE_COMPLETED]: LogSeverity.INFO,
      [ActivityEventType.CHALLENGE_INSTANCE_CREATED]: LogSeverity.INFO,
      [ActivityEventType.CHALLENGE_INSTANCE_DELETED]: LogSeverity.INFO,
      [ActivityEventType.CHALLENGE_PACK_INSTALLED]: LogSeverity.INFO
    };

    return this.logActivity({
      eventType,
      userId,
      challengeId,
      challengeInstanceId,
      severity: severityMap[eventType] || LogSeverity.INFO,
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
      [ActivityEventType.ACCESS_CODE_GENERATED]: LogSeverity.INFO,
      [ActivityEventType.ACCESS_CODE_EXPIRED]: LogSeverity.WARNING,
      [ActivityEventType.ACCESS_CODE_DELETED]: LogSeverity.WARNING,
      [ActivityEventType.ACCESS_CODE_USED]: LogSeverity.INFO,
      [ActivityEventType.ACCESS_CODE_INVALID]: LogSeverity.ERROR,
    };

    return this.logActivity({
      eventType,
      userId,
      accessCodeId,
      groupId,
      severity: severityMap[eventType] || LogSeverity.INFO,
      metadata
    });
  }

  // Log invalid access code attempt (no access code ID available)
  static async logInvalidAccessCode(
    userId: string,
    metadata: Record<string, any>
  ) {
    return this.logActivity({
      eventType: ActivityEventType.ACCESS_CODE_INVALID,
      userId,
      severity: LogSeverity.ERROR,
      metadata: {
        attemptTime: new Date().toISOString(),
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
    const severityMap: Partial<Record<ActivityEventType, LogSeverity>> = {
      [ActivityEventType.GROUP_CREATED]: LogSeverity.INFO,
      [ActivityEventType.GROUP_JOINED]: LogSeverity.INFO,
      [ActivityEventType.GROUP_LEFT]: LogSeverity.INFO,
      [ActivityEventType.GROUP_DELETED]: LogSeverity.WARNING,
      [ActivityEventType.GROUP_UPDATED]: LogSeverity.INFO,
      [ActivityEventType.GROUP_MEMBER_REMOVED]: LogSeverity.WARNING
    };

    return this.logActivity({
      eventType,
      userId,
      groupId,
      severity: severityMap[eventType] || LogSeverity.INFO,
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
      [ActivityEventType.USER_REGISTERED]: LogSeverity.INFO,
      [ActivityEventType.USER_LOGGED_IN]: LogSeverity.INFO,
      [ActivityEventType.USER_ROLE_CHANGED]: LogSeverity.WARNING,
      [ActivityEventType.USER_UPDATED]: LogSeverity.INFO,
      [ActivityEventType.USER_DELETED]: LogSeverity.WARNING
    };

    return this.logActivity({
      eventType,
      userId,
      severity: severityMap[eventType] || LogSeverity.INFO,
      metadata
    });
  }

  // System Error
  static async logSystemError(userId: string, metadata: Record<string, any>) {
    return this.logActivity({
      eventType: ActivityEventType.SYSTEM_ERROR,
      userId,
      severity: LogSeverity.ERROR,
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
      [ActivityEventType.QUESTION_ATTEMPTED]: LogSeverity.INFO,
      [ActivityEventType.QUESTION_COMPLETED]: LogSeverity.INFO
    };

    return this.logActivity({
      eventType,
      userId,
      challengeId,
      groupId,
      severity: severityMap[eventType] || LogSeverity.INFO,
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

  // Log challenge pack installation
  static async logChallengePackInstalled(
    userId: string,
    metadata: Record<string, any>
  ) {
    return this.logActivity({
      eventType: ActivityEventType.CHALLENGE_PACK_INSTALLED,
      userId,
      severity: LogSeverity.INFO,
      metadata: {
        installTime: new Date().toISOString(),
        ...metadata
      }
    });
  }
}
