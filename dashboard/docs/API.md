# EDURange Cloud Frontend API Documentation

This document provides a comprehensive overview of the EDURange Cloud Frontend API endpoints.

## Authentication

All API routes require authentication unless explicitly stated. Authentication is handled through NextAuth.js sessions.

## Users

### Current User

#### GET `/api/users/current`
Returns detailed information about the currently authenticated user.

**Response**
```json
{
  "id": "string",
  "name": "string",
  "email": "string",
  "accounts": [...],
  "sessions": [...],
  "challengeInstances": [...]
}
```

**Error Responses**
- `401 Unauthorized`: No valid session
- `404 Not Found`: User not found
- `500 Internal Server Error`: Server error

#### GET `/api/users/current/role`
Returns the role of the currently authenticated user.

**Response**
```json
{
  "role": "STUDENT" | "INSTRUCTOR" | "ADMIN"
}
```

**Error Responses**
- `401 Unauthorized`: No valid session
- `404 Not Found`: User not found
- `500 Internal Server Error`: Server error

#### GET `/api/users/current/competitions`
Returns all competitions associated with the current user, categorized by status.

**Response**
```json
{
  "active": [Competition[]],
  "upcoming": [Competition[]],
  "completed": [Competition[]],
  "userRole": "STUDENT" | "INSTRUCTOR" | "ADMIN"
}
```

**Error Responses**
- `401 Unauthorized`: No valid session
- `500 Internal Server Error`: Server error

### User Management

#### GET `/api/users/[id]`
Returns information about a specific user. Requires admin privileges.

**Parameters**
- `id`: User ID (string)

**Response**
```json
{
  "id": "string",
  "name": "string",
  "email": "string",
  "accounts": [...],
  "sessions": [...],
  "challengeInstances": [...]
}
```

**Error Responses**
- `400 Bad Request`: Invalid user ID
- `401 Unauthorized`: No valid session
- `403 Forbidden`: Insufficient permissions
- `404 Not Found`: User not found
- `500 Internal Server Error`: Server error

#### PUT `/api/users/[id]`
Updates a user's information. Requires admin privileges.

**Parameters**
- `id`: User ID (string)

**Request Body**
```json
{
  "name": "string",
  "email": "string",
  "admin": boolean,
  "points": number
}
```

**Response**
```json
{
  "id": "string",
  "name": "string",
  "email": "string",
  ...
}
```

**Error Responses**
- `400 Bad Request`: Invalid request body
- `401 Unauthorized`: No valid session
- `403 Forbidden`: Insufficient permissions
- `404 Not Found`: User not found
- `500 Internal Server Error`: Server error

#### DELETE `/api/users/[id]`
Deletes a user. Requires admin privileges.

**Parameters**
- `id`: User ID (string)

**Response**
```json
{
  "message": "User deleted successfully"
}
```

**Error Responses**
- `401 Unauthorized`: No valid session
- `403 Forbidden`: Insufficient permissions
- `404 Not Found`: User not found
- `500 Internal Server Error`: Server error

## Competitions

### GET `/api/competitions`
Returns a list of all competitions. Requires authentication.

**Response**
```json
[
  {
    "id": "string",
    "name": "string",
    "description": "string",
    "startDate": "date",
    "endDate": "date",
    "challenges": [...],
    "_count": {
      "members": number,
      "challenges": number
    }
  }
]
```

### POST `/api/competitions/join`
Joins a competition using an access code.

**Request Body**
```json
{
  "code": "string"
}
```

**Response**
```json
{
  "message": "Successfully joined competition",
  "competition": {
    "id": "string",
    "name": "string",
    ...
  }
}
```

**Error Responses**
- `400 Bad Request`: Invalid or expired access code
- `401 Unauthorized`: No valid session
- `500 Internal Server Error`: Server error

### Competition Groups

#### GET `/api/competition-groups/[id]`
Returns detailed information about a specific competition group.

**Parameters**
- `id`: Competition group ID (string)

**Response**
```json
{
  "id": "string",
  "name": "string",
  "description": "string",
  "startDate": "date",
  "endDate": "date",
  "challenges": [...],
  "totalPoints": number,
  "userPoints": number
}
```

#### POST `/api/competition-groups`
Creates a new competition group. Requires instructor or admin privileges.

**Request Body**
```json
{
  "name": "string",
  "description": "string",
  "startDate": "date",
  "endDate": "date",
  "challengeIds": "string[]",
  "instructorIds": "string[]",
  "generateAccessCode": boolean
}
```

**Response**
```json
{
  "success": true,
  "groupId": "string"
}
```

#### GET `/api/competition-groups/[id]/challenges`
Get all challenges for a specific competition group.

**Parameters:**
- `id` (string) - The ID of the competition group

**Response:**
```json
[
  {
    "id": "string",
    "name": "string",
    "difficulty": "string",
    "AppsConfig": "string",
    "challengeType": {
      "id": "string",
      "name": "string"
    }
  }
]
```

**Authentication:**
- Requires a valid session
- User must be authenticated

**Errors:**
- 401: Unauthorized - User is not authenticated
- 500: Internal Server Error - Something went wrong on the server

### Points

#### GET `/api/competitions/[groupId]/points`
Returns points for all users in a competition group.

**Parameters**
- `groupId`: Competition group ID (string)
- `userId` (optional query param): Filter points for specific user

**Response**
```json
[
  {
    "id": "string",
    "points": number,
    "userId": "string",
    "groupId": "string",
    "user": {
      "id": "string",
      "name": "string",
      "email": "string"
    }
  }
]
```

#### POST `/api/competitions/[groupId]/points`
Updates points for a user in a competition group. Requires instructor privileges.

**Request Body**
```json
{
  "userId": "string",
  "points": number
}
```

**Response**
```json
{
  "id": "string",
  "points": number,
  "userId": "string",
  "groupId": "string"
}
```

## WebOS Format

The WebOS format is a specialized configuration structure used by EDURange Cloud's WebOS interface. It transforms challenge data into a format that can be rendered as interactive applications in the browser-based operating system environment.

Key characteristics of the WebOS format:
- Each challenge is represented as a collection of app configurations (`AppsConfig`)
- Every challenge includes a special `challenge-prompt` app that displays questions and tracks progress
- Apps can be built-in (Terminal, Browser, etc.) or challenge-specific
- Configuration includes UI properties like window dimensions, icons, and startup behavior
- For security, flag question answers are never included in the WebOS format, while text question answers are included for client-side verification

For detailed information about the WebOS format and app configuration system, see `/docs/AppConfig.md`.

## Challenges

### GET `/api/challenges`
Returns a list of all challenges (returned in WebOS Format).

**Response**
```json
[
  {
    "id": "string",
    "name": "string",
    "challengeImage": "string",
    "challengeType": {
      "id": "string",
      "name": "string"
    },
    "description": "string",
    "difficulty": "EASY" | "MEDIUM" | "HARD" | "VERY_HARD",
    "AppsConfig": [
      {
        "id": "challenge-prompt",
        "icon": "string",
        "title": "string",
        "width": number,
        "height": number,
        "screen": "string",
        "disabled": boolean,
        "favourite": boolean,
        "desktop_shortcut": boolean,
        "launch_on_startup": boolean,
        "description": "string",
        "challenge": {
          "type": "string",
          "title": "string",
          "description": "string",
          "pages": [
            {
              "instructions": "string",
              "questions": [
                {
                  "type": "flag" | "text",
                  "content": "string",
                  "id": "string",
                  "points": number,
                  "answer": "string" // Only included for text questions
                }
              ]
            }
          ]
        }
      },
      // Additional app configs...
    ]
  }
]
```

**Error Responses**
- `401 Unauthorized`: No valid session
- `500 Internal Server Error`: Server error

### GET `/api/competition-groups/[id]/challenges/[challengeId]`
Get a specific challenge configuration for a competition group.

**Parameters:**
- `id` (string) - The ID of the competition group
- `challengeId` (string) - The ID of the challenge

**Response:**
```json
{
  "id": "string",
  "name": "string",
  "challengeImage": "string",
  "difficulty": "EASY" | "MEDIUM" | "HARD" | "VERY_HARD",
  "totalPoints": number,
  "earnedPoints": number,
  "completed": boolean,
  "AppsConfig": [
    // Same format as /api/challenges response
  ]
}
```

### POST `/api/competition-groups/[id]/challenges/[challengeId]/questions/[questionId]/complete`
Submit an answer for a challenge question.

**Parameters:**
- `id` (string) - The ID of the competition group
- `challengeId` (string) - The ID of the challenge
- `questionId` (string) - The ID of the question

**Request Body:**
```json
{
  "answer": "string"
}
```

**Response:**
```json
{
  "isCorrect": boolean,
  "newPoints": number
}
```

**Error Responses**
- `400 Bad Request`: Invalid answer format
- `401 Unauthorized`: No valid session
- `404 Not Found`: Question not found
- `500 Internal Server Error`: Server error

## Error Handling

All API endpoints follow a consistent error response format:

```json
{
  "error": "Error message description"
}
```

Common HTTP status codes:
- `200`: Success
- `400`: Bad Request
- `401`: Unauthorized
- `403`: Forbidden
- `404`: Not Found
- `500`: Internal Server Error

