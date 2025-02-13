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

### Architecture Overview
The activity logging system follows a client-server architecture:

1. Frontend (Next.js Dashboard):
   - Uses the ActivityLogger service to send events to the Database-API
   - Handles event type validation and data formatting
   - Manages error handling and retries

2. Database-API (Flask):
   - Exposes `/api/log` endpoint for activity logging
   - Validates incoming event data
   - Handles database operations via Prisma
   - Manages error handling and response codes

### Frontend Implementation

The `ActivityLogger` class in `dashboard/lib/activity-logger.ts` provides centralized logging functionality:

```typescript
class ActivityLogger {
  private static async logActivity({
    eventType,
    userId,
    severity = 'INFO',
    challengeId,
    groupId,
    challengeInstanceId,
    accessCodeId,
    metadata
  }: LogActivityParams): Promise<void> {
    try {
      await axios.post(`${DATABASE_API_URL}/api/log`, {
        eventType,
        userId,
        severity,
        challengeId,
        groupId,
        challengeInstanceId,
        accessCodeId,
        metadata: metadata ? JSON.stringify(metadata) : null,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Failed to log activity:', error);
      // Error handling logic
    }
  }

  // Specialized logging methods remain unchanged
}
```

### Database-API Implementation

The Flask API endpoint in `database-controller/api/app.py` handles activity logging:

```python
@app.route('/api/log', methods=['POST'])
async def log_activity():
    try:
        data = request.json
        
        # Validate event type
        if not isinstance(data['eventType'], str) or data['eventType'] not in ActivityEventType.__members__:
            return jsonify({'error': 'Invalid event type'}), 400
            
        # Create activity log
        await prisma.activitylog.create({
            'data': {
                'eventType': data['eventType'],
                'userId': data['userId'],
                'severity': data.get('severity', 'INFO'),
                'challengeId': data.get('challengeId'),
                'groupId': data.get('groupId'),
                'challengeInstanceId': data.get('challengeInstanceId'),
                'accessCodeId': data.get('accessCodeId'),
                'metadata': data.get('metadata'),
                'timestamp': data.get('timestamp', datetime.now().isoformat())
            }
        })
        
        return jsonify({'status': 'success'}), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
```

### Error Handling

1. Frontend:
   - Handles network errors with retry logic
   - Validates event types before sending
   - Provides detailed error messages for debugging

2. Database-API:
   - Validates input data format and required fields
   - Handles database connection errors
   - Returns appropriate HTTP status codes
   - Logs internal errors for monitoring

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
   - Registration (auth.config.ts)
   - Login (auth.config.ts)
   - Profile updates (users/[id]/route.ts)
   - Role changes (users/[id]/role/route.ts)

2. Challenge System:
   - Instance creation/deletion (challenges/[id]/route.ts)
   - Challenge starts (challenges/start/route.ts)
   - Challenge termination (challenges/terminate/route.ts)

3. Competition Groups:
   - Group creation/deletion (competition-groups/route.ts)
   - Member management (competition-groups/[id]/users/route.ts)
   - Access code operations (competition-groups/[id]/access-code/route.ts)

4. WebOS Integration:
   - Question attempts (WebOS/webos-app/components/apps/challenge_prompt.js)
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