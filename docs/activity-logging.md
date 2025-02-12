# Activity Logging System Documentation

## Overview
The activity logging system is designed to track and record various events across the EDURange platform. It provides comprehensive logging for user actions, challenge interactions, group management, and system events.

## Database Schema

### ActivityLog Model
```prisma
model ActivityLog {
  id                 String            @id @default(cuid())
  eventType          ActivityEventType
  severity           LogSeverity       @default(INFO)
  userId             String
  challengeId        String?
  groupId            String?
  challengeInstanceId String?
  accessCodeId       String?
  metadata           Json
  timestamp          DateTime          @default(now())

  // Relations
  user               User              @relation(fields: [userId], references: [id], onDelete: Cascade)
  group              CompetitionGroup? @relation(fields: [groupId], references: [id], onDelete: SetNull)
  challenge          Challenges?       @relation(fields: [challengeId], references: [id], onDelete: SetNull)
  challengeInstance  ChallengeInstance? @relation(fields: [challengeInstanceId], references: [id], onDelete: SetNull)
  accessCode         CompetitionAccessCode? @relation(fields: [accessCodeId], references: [id], onDelete: SetNull)
}
```

## Event Types
All possible event types are defined in the `ActivityEventType` enum:

### User Events
- `USER_REGISTERED` - New user registration
- `USER_LOGGED_IN` - User login
- `USER_ROLE_CHANGED` - User role modification
- `USER_UPDATED` - User profile updates
- `USER_DELETED` - User account deletion

### Challenge Events
- `CHALLENGE_STARTED` - User starts a challenge
- `CHALLENGE_COMPLETED` - User completes a challenge
- `CHALLENGE_INSTANCE_CREATED` - New challenge instance creation
- `CHALLENGE_INSTANCE_DELETED` - Challenge instance termination

### Group Events
- `GROUP_CREATED` - New competition group creation
- `GROUP_JOINED` - User joins a group
- `GROUP_LEFT` - User leaves a group
- `GROUP_UPDATED` - Group details modification
- `GROUP_DELETED` - Group deletion
- `GROUP_MEMBER_REMOVED` - Member removal from group

### Access Code Events
- `ACCESS_CODE_GENERATED` - New access code generation
- `ACCESS_CODE_USED` - Access code usage for joining
- `ACCESS_CODE_EXPIRED` - Access code expiration
- `ACCESS_CODE_DELETED` - Access code manual deletion

### Question Events
- `QUESTION_ATTEMPTED` - Question answer attempt
- `QUESTION_COMPLETED` - Question completion

### System Events
- `SYSTEM_ERROR` - System-level errors

## Severity Levels
```prisma
enum LogSeverity {
  INFO      // Normal operations
  WARNING   // Potential issues
  ERROR     // Operation failures
  CRITICAL  // System-critical issues
}
```

## Implementation Details

### ActivityLogger Service
The `ActivityLogger` class provides centralized logging functionality with specialized methods for different event types:

1. Core Logging Method:
```typescript
static async logActivity({
  eventType,
  userId,
  severity = 'INFO',
  challengeId,
  groupId,
  challengeInstanceId,
  accessCodeId,
  metadata
})
```

2. Specialized Logging Methods:
- `logChallengeEvent()` - Challenge-related events
- `logGroupEvent()` - Group management events
- `logAccessCodeEvent()` - Access code lifecycle events
- `logUserEvent()` - User-related events
- `logQuestionEvent()` - Question attempts and completions
- `logSystemError()` - System errors

### Metadata Structure
Each event type includes specific metadata:

1. Challenge Events:
```typescript
{
  challengeName: string,
  challengeType: string,
  startTime: string,
  completionTime?: string,
  pointsEarned?: number
}
```

2. Group Events:
```typescript
{
  groupName: string,
  action: string,
  timestamp: string,
  affectedUsers?: string[]
}
```

3. Question Events:
```typescript
{
  questionId: string,
  answer: string,
  isCorrect: boolean,
  attemptNumber: number,
  pointsEarned?: number
}
```

## Usage Examples

### Logging Challenge Start
```typescript
await ActivityLogger.logChallengeEvent(
  'CHALLENGE_STARTED',
  userId,
  challengeId,
  instanceId,
  {
    startTime: new Date().toISOString(),
    challengeName: challenge.name
  }
);
```

### Logging Group Creation
```typescript
await ActivityLogger.logGroupEvent(
  'GROUP_CREATED',
  userId,
  groupId,
  {
    groupName: group.name,
    createdAt: new Date().toISOString()
  }
);
```

### Logging Question Attempts
```typescript
await ActivityLogger.logQuestionAttempt(
  userId,
  challengeId,
  groupId,
  {
    questionId,
    answer,
    isCorrect,
    attemptNumber
  }
);
```

## Integration Points

1. User Management:
   - Registration
   - Login
   - Profile updates
   - Role changes

2. Challenge System:
   - Instance creation/deletion
   - Challenge starts/completions
   - Question attempts/completions

3. Competition Groups:
   - Group creation/deletion
   - Member management
   - Access code operations

4. WebOS Integration:
   - Question attempts logging
   - Challenge interaction tracking

## Viewing Logs

Logs can be viewed through:
1. Admin Dashboard (/dashboard/logs)
2. Filtered by:
   - Event type
   - User
   - Time frame
   - Severity level

## Best Practices

1. Always include relevant IDs (userId, challengeId, etc.)
2. Use appropriate severity levels
3. Include detailed metadata for context
4. Handle logging errors gracefully
5. Use consistent timestamp formats (ISO 8601) 