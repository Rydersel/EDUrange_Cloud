# EDURange Cloud App Configuration System

## Overview

The EDURange Cloud app configuration system is responsible for transforming challenge data from the database into a format that can be consumed by the WebOS interface. This document explains the flow of data from the database to the final WebOS configuration.

## Key Files

- `dashboard/app/api/webos/service.ts` - Main service layer for WebOS operations
- `dashboard/lib/webos/transform.ts` - Data transformation utilities
- `dashboard/lib/webos/types.ts` - TypeScript interfaces for WebOS format
- `dashboard/app/api/competition-groups/[id]/challenges/[challengeId]/route.ts` - Challenge API endpoint
- `dashboard/components/webos/apps/challenge-prompt/ChallengePrompt.tsx` - Challenge prompt app component

## Data Flow

[![](https://mermaid.ink/img/pako:eNptUl2PmzAQ_CuWn1qJQ8dHgPBQKQFVitRTUx1VpEJ0csISaMFGtlGbJvnv58ShuKfzA7JmZndnB5_wnpWAY1zQAyd9jbK0oEiddJl_SIkkOyLg4xY9PHxC5zVvREfOaJEnNWlboAdAV81Wlyy0SnJCRcV4Z0txRst8A7uvz-izAoi8K5daqZnFenVGyV22ohJ4RfZwVyZauR_nvfScdb20f6rWqWHj--peoL9i2Ol1xhXQk1qzFZq9nidnqhZbA3cn_NsAQjaMmrQ30Yu-TxitmoPJ-_lYlSijLRj1QMuCvvGXjWGhL-QIfGqUOfm_IDN2C-e_CG8ad9KMU0XG1reIlDtT6k3St77f86X_xnUFRoFKI7iNERzSo4w5GzfPgHcNJa2JevmSs98CuAn6eXLcAU9qqEwn2MKdakGaUj3L05UosKyhgwLH6loS_qtQz_WidGSQ7PlI9ziWfAALD31JJKQNUUt0OK5IKxTaE4rjE_6DY9cNbdf3Q991o7njqJuFjwr2AjtwHG_u-tGjE8yi6GLhv4ypFo_2zAm9MIqCIAjdmTObW5iz4VCb3X_cpFcLl1fdMwpG?type=png)](https://mermaid.live/edit#pako:eNptUl2PmzAQ_CuWn1qJQ8dHgPBQKQFVitRTUx1VpEJ0csISaMFGtlGbJvnv58ShuKfzA7JmZndnB5_wnpWAY1zQAyd9jbK0oEiddJl_SIkkOyLg4xY9PHxC5zVvREfOaJEnNWlboAdAV81Wlyy0SnJCRcV4Z0txRst8A7uvz-izAoi8K5daqZnFenVGyV22ohJ4RfZwVyZauR_nvfScdb20f6rWqWHj--peoL9i2Ol1xhXQk1qzFZq9nidnqhZbA3cn_NsAQjaMmrQ30Yu-TxitmoPJ-_lYlSijLRj1QMuCvvGXjWGhL-QIfGqUOfm_IDN2C-e_CG8ad9KMU0XG1reIlDtT6k3St77f86X_xnUFRoFKI7iNERzSo4w5GzfPgHcNJa2JevmSs98CuAn6eXLcAU9qqEwn2MKdakGaUj3L05UosKyhgwLH6loS_qtQz_WidGSQ7PlI9ziWfAALD31JJKQNUUt0OK5IKxTaE4rjE_6DY9cNbdf3Q991o7njqJuFjwr2AjtwHG_u-tGjE8yi6GLhv4ypFo_2zAm9MIqCIAjdmTObW5iz4VCb3X_cpFcLl1fdMwpG)

## Database Structure

### Challenge Models
Located in `dashboard/prisma/schema.prisma`:
- `Challenges`: Core challenge information
- `ChallengeQuestion`: Questions associated with challenges
- `ChallengeAppConfig`: App configurations for each challenge
- `QuestionCompletion`: Tracks user progress on questions

## Transformation Process

### 1. Data Retrieval
Located in `dashboard/app/api/webos/service.ts`:
```typescript
// Service layer fetches challenge data with related models
const challenge = await prisma.challenges.findUnique({
  include: {
    questions: true,
    appConfigs: true
  }
});
```

### 2. Data Transformation
Located in `dashboard/lib/webos/transform.ts`:

1. **Question Transformation**
```typescript
// Converts questions into WebOS prompt app format
export const transformQuestionsToPromptApp = (questions: ChallengeQuestion[]) => {
  return questions.map(q => ({
    id: q.id,
    type: q.type,
    content: q.content,
    points: q.points,
    ...(q.type === 'text' && { answer: q.answer }) // Only for text questions
  }));
};
```

2. **App Configuration Transformation**
```typescript
// Converts database app configs into WebOS format
export const transformAppConfig = (appConfigs: ChallengeAppConfig[]) => {
  return appConfigs.map(app => ({
    id: app.appId,
    icon: app.icon,
    title: app.title,
    // ... other properties
  }));
};
```

3. **Final WebOS Format**
Located in `dashboard/lib/webos/types.ts`:
```typescript
export interface WebOSChallengeConfig {
  id: string;
  name: string;
  challengeImage: string;
  difficulty: ChallengeDifficulty;
  AppsConfig: AppConfig[];
}
```

## WebOS Integration

### Challenge Prompt App
Located in `dashboard/components/webos/apps/challenge-prompt/`:
- `ChallengePrompt.tsx` - Main component
- `QuestionList.tsx` - Question rendering
- `AnswerSubmission.tsx` - Answer handling
- `ProgressTracker.tsx` - Completion tracking

### App Types
Located in `dashboard/components/webos/apps/`:
1. **Built-in Apps**
   - `terminal/` - Terminal emulator
   - `browser/` - Web browser
   - `cyberchef/` - CyberChef tool
   - `code-editor/` - Code editor
   - `settings/` - Settings app

2. **Challenge-Specific Apps**
   - Custom web interfaces (challenge-dependent)
   - Specialized tools (challenge-dependent)
   - Challenge prompt (`challenge-prompt/`)

## Question Types and Verification

### Flag Questions
Verification handled in `dashboard/app/api/competition-groups/[id]/challenges/[challengeId]/questions/[questionId]/complete/route.ts`:
- Answers stored in Kubernetes secrets
- Verified server-side
- No answer included in WebOS config

### Text Questions
Verification handled in `dashboard/components/webos/apps/challenge-prompt/AnswerSubmission.tsx`:
- Answer included in WebOS config
- Verified client-side
- Case-sensitive matching

## Configuration Example

Example challenge configuration in WebOS format:
```json
{
  "id": "challenge-123",
  "name": "Example Challenge",
  "AppsConfig": [
    {
      "id": "challenge-prompt",
      "challenge": {
        "pages": [{
          "questions": [
            {
              "type": "flag",
              "content": "Find the hidden flag"
            },
            {
              "type": "text",
              "content": "What command lists files?",
              "answer": "ls -la"
            }
          ]
        }]
      }
    },
    {
      "id": "terminal",
      "screen": "displayTerminal",
      "additional_config": {
        "disableScrolling": true
      }
    }
  ]
}
```


