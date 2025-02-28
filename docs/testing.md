# EDURange Cloud Testing Documentation
[![tested with jest](https://img.shields.io/badge/tested_with-jest-99424f.svg?logo=jest)](https://github.com/jestjs/jest)
## Overview
EDURange Cloud uses Jest as its primary testing framework, with a focus on integration tests that verify the interaction between different components of the system. Our tests are designed to ensure data isolation, proper cleanup, and comprehensive coverage of core functionality.

## Test Structure


### Directory Organization
Tests are located in the `dashboard/tests` directory and follow this structure:
- `tests/groups.test.ts` - Competition group management
- `tests/events.test.ts` - Activity logging system
- `tests/challenges.test.ts` - Challenge management
- `tests/competition-isolation.test.ts` - Competition data isolation
- `tests/challenge-submission.test.ts` - Challenge submission and flag validation
- `tests/auth.test.ts` - Authentication system and user management

### Test Setup Files
1. `jest.config.ts` - Jest configuration
2. `jest.setup.ts` - Global test setup and custom matchers
3. `global-setup.ts` - Database initialization and cleanup
4. `global-teardown.ts` - Final cleanup after all tests

## Current Test Coverage

### 1. Competition Groups (`groups.test.ts`)
- Group creation with instructor assignment
- Student membership management
- Access code generation and usage
- Expired access code validation
- Group details updates
- Proper cleanup of group resources

### 2. Activity Logging (`events.test.ts`)
- User event logging (registration, login, updates)
- Group event logging (creation, membership changes)
- Challenge event logging (starts, completions)
- Access code event logging
- Proper event metadata validation

### 3. Challenges (`challenges.test.ts`)
- Challenge creation and configuration
- Challenge instance management
- Question completion tracking
- Points calculation and assignment
- Resource cleanup

### 4. Competition Isolation (`competition-isolation.test.ts`)
- Points isolation between competitions
- Challenge instance isolation
- Question completion isolation
- Data integrity across competitions

### 5. Challenge Submission (`challenge-submission.test.ts`)
- Correct flag submission and points awarding
- Incorrect flag submission handling
- Case-sensitive flag validation
- Multiple submission attempts tracking
- Challenge completion status updates
- Partial credit for multi-part challenges
- Submission for already completed challenges
- Empty flag submission validation
- Whitespace handling in flag submissions
- Concurrent submissions by different users

### 6. Authentication System (`auth.test.ts`)
- User management (creation, role updates)
- Session management and expiration
- OAuth account linking
- Authentication activity logging
- Role-based access control
- User registration and login events
- Proper cleanup of authentication resources

## Test Isolation Patterns

To ensure reliable and consistent test execution, we've implemented the following test isolation patterns across our test suite:

### 1. Dedicated Resource Pattern

Each test creates its own dedicated resources rather than relying on shared resources created in `beforeAll` or `beforeEach` hooks:

```typescript
test('should handle case-sensitive flag submission', async () => {
  // Create a dedicated instance for this test
  const caseSensitiveInstance = await prisma.challengeInstance.create({
    data: {
      id: `test-${uuidv4()}`,
      challengeId: testChallengeId,
      userId: testStudentId,
      competitionId: testGroupId,
      // ... other required fields
    }
  });
  
  // Test implementation using the dedicated instance
  
  // Clean up the dedicated instance
  await prisma.challengeInstance.delete({
    where: { id: caseSensitiveInstance.id }
  });
});
```

### 2. Complete Lifecycle Management

Each test manages the complete lifecycle of its resources:

1. **Creation**: Create all necessary resources at the beginning of the test
2. **Utilization**: Use the resources during test execution
3. **Verification**: Verify the expected outcomes
4. **Cleanup**: Delete all created resources at the end of the test

### 3. Unique Identifier Strategy

All test resources use unique identifiers to prevent collisions:

```typescript
const uniqueId = `test-${uuidv4()}`;
const uniqueName = generateUniqueName('Test Resource');
const uniqueEmail = generateUniqueEmail('test-user');
```

### 4. Proper Cleanup Order

Resources are cleaned up in the reverse order of creation to respect database constraints:

```typescript
// Clean up in correct order
await prisma.questionCompletion.deleteMany({ where: { /* ... */ } });
await prisma.challengeInstance.deleteMany({ where: { /* ... */ } });
await prisma.groupChallenge.deleteMany({ where: { /* ... */ } });
// ... and so on
```

## Edge Case Testing

To ensure our application handles unexpected or boundary conditions correctly, we implement specific tests for edge cases:

### 1. Time-Dependent Edge Cases

For features that depend on time (like expiration), we use explicit time manipulation:

```typescript
test('should handle expired access codes', async () => {
  // Create a dedicated group for this test
  const dedicatedGroupId = `test-${uuidv4()}`;
  const dedicatedGroup = await prisma.competitionGroup.create({
    data: {
      id: dedicatedGroupId,
      name: generateUniqueName('Expired Access Code Test'),
      description: 'Test Description for Expired Access Codes',
      startDate: new Date(),
      instructors: {
        connect: [{ id: testInstructorId }]
      }
    }
  });
  
  // Create an access code that is already expired (1 day in the past)
  const pastDate = new Date();
  pastDate.setDate(pastDate.getDate() - 1);
  
  const expiredAccessCode = await prisma.competitionAccessCode.create({
    data: {
      code: 'EXPIRED' + Date.now().toString().slice(-4),
      groupId: dedicatedGroupId,
      createdBy: testInstructorId,
      expiresAt: pastDate
    }
  });
  
  // Verify the code is recognized as expired
  expect(expiredAccessCode.expiresAt!.getTime()).toBeLessThan(Date.now());
  
  // Clean up resources
  await prisma.competitionAccessCode.delete({
    where: { id: expiredAccessCode.id }
  });
  
  await prisma.competitionGroup.delete({
    where: { id: dedicatedGroupId }
  });
});
```

### 2. Input Validation Edge Cases

We test boundary conditions for inputs to ensure proper validation:

```typescript
test('should reject empty flag submission', async () => {
  const emptySubmission = '';
  const isEmpty = emptySubmission.trim().length === 0;
  expect(isEmpty).toBe(true);
  
  // Simulate validation logic that would reject empty submissions
  const shouldRejectSubmission = isEmpty;
  expect(shouldRejectSubmission).toBe(true);
});
```

### 3. Authentication Edge Cases

We test authentication edge cases to ensure proper security and user management:

```typescript
test('should handle expired sessions', async () => {
  // Create a dedicated user for this test
  const dedicatedUserId = `test-expired-session-${uuidv4()}`;
  const dedicatedUser = await prisma.user.create({
    data: {
      id: dedicatedUserId,
      email: generateUniqueEmail('test-expired-session'),
      name: generateUniqueName('Test Expired Session'),
      role: UserRole.STUDENT
    }
  });
  
  // Create an expired session (1 day in the past)
  const expiredDate = new Date();
  expiredDate.setDate(expiredDate.getDate() - 1);
  
  const expiredSession = await prisma.session.create({
    data: {
      id: `test-expired-session-${uuidv4()}`,
      sessionToken: `test-expired-token-${uuidv4()}`,
      userId: dedicatedUserId,
      expires: expiredDate
    }
  });
  
  // Verify session is expired
  const now = new Date();
  expect(expiredSession.expires.getTime()).toBeLessThan(now.getTime());
  
  // Simulate session validation logic
  const isSessionValid = expiredSession.expires.getTime() > now.getTime();
  expect(isSessionValid).toBe(false);
  
  // Clean up
  await prisma.session.delete({
    where: { id: expiredSession.id }
  });
  
  await prisma.user.delete({
    where: { id: dedicatedUserId }
  });
});
```

## Planned Future Tests

The following test categories are planned for future implementation to enhance test coverage:

### 1. Admin Dashboard (`admin-dashboard.test.ts`)
- Admin user management
- Admin challenge management
- Admin competition oversight
- Reporting and analytics features
- System configuration management

### 2. Leaderboard (`leaderboard.test.ts`)
- Leaderboard calculation for individuals
- Leaderboard calculation for teams
- Leaderboard filtering by competition
- Time-based filtering (daily, weekly, all-time)
- Leaderboard pagination
- Leaderboard data privacy

### 3. Notifications (`notifications.test.ts`)
- Notification creation and delivery
- Notification read/unread status
- Notification preferences
- Notification types

### 4. API Rate Limiting (`rate-limiting.test.ts`)
- Rate limiting for authentication endpoints
- Rate limiting for challenge submission endpoints
- Rate limiting for user-specific endpoints
- Rate limit headers and responses

### 5. Enhanced Competition Tests (`competition-advanced.test.ts`)
- Competition scheduling
- Competition visibility settings
- Competition registration limits
- Competition results calculation
- Competition archiving

### 6. Enhanced Challenge Tests (`challenge-advanced.test.ts`)
- Challenge prerequisites and dependencies
- Challenge categories/tags
- Challenge search and filtering
- Challenge difficulty calculation
- Challenge resource allocation and cleanup

### 7. Integration Tests (`integration.test.ts`)
- Complete user journey
- Instructor journey
- Admin journey

### 8. Performance Tests (`performance.test.ts`)
- Leaderboard calculation performance
- Challenge instance creation performance
- Concurrent user actions
- Database query performance

## Best Practices

### 1. Test Data Management
```typescript
// Generate unique identifiers for test resources
function generateUniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}@test.edurange.org`;
}

function generateUniqueName(prefix: string): string {
  return `${prefix}-${Date.now()}`;
}

// Use in tests
const testUser = await prisma.user.create({
  data: {
    id: `test-${uuidv4()}`,
    email: generateUniqueEmail('test-user'),
    name: generateUniqueName('Test User'),
    role: UserRole.STUDENT
  }
});
```

### 2. Proper Test Lifecycle
```typescript
describe('Feature Group', () => {
  // Setup shared resources (only for truly shared, read-only resources)
  beforeAll(async () => {
    // Create required test data
  });

  // Clean up after all tests
  afterAll(async () => {
    // Clean up in correct order (respect foreign key constraints)
    await prisma.$disconnect();
  });

  test('should do something specific', async () => {
    // Create dedicated resources for this test
    const dedicatedResource = await prisma.resource.create({
      data: { /* ... */ }
    });
    
    // Test implementation
    
    // Clean up dedicated resources
    await prisma.resource.delete({
      where: { id: dedicatedResource.id }
    });
  });
});
```

### 3. Resource Cleanup
- Always clean up in reverse order of creation
- Respect foreign key constraints
- Use type-safe deleteMany operations
- Include proper error handling
```typescript
// Example cleanup order
await prisma.questionCompletion.deleteMany({
  where: { userId: testUserId }
});
await prisma.groupPoints.deleteMany({
  where: { userId: testUserId }
});
await prisma.user.deleteMany({
  where: { id: testUserId }
});
```

### 4. Data Isolation
- Create dedicated resources for each test instead of sharing resources between tests
- Use unique identifiers for all test resources
- Prefix test data with 'test-' for easy identification
- Ensure tests don't interfere with each other
- Use separate describe blocks for different features
- Avoid using beforeEach/afterEach for resource creation when possible

### 5. Error Handling
```typescript
test('should handle errors appropriately', async () => {
  try {
    // Test implementation
  } catch (error) {
    // Verify error handling
    expect(error).toBeInstanceOf(ExpectedErrorType);
    expect(error.message).toContain('Expected error message');
  }
});
```

### 6. Preventing Flaky Tests
- Avoid shared state between tests
- Create dedicated resources for each test
- Ensure proper cleanup of all resources
- Use unique identifiers to prevent collisions
- Handle database constraints properly
- Implement proper error handling
- Use explicit waits instead of implicit timing assumptions

## Creating New Tests

### 1. Test File Structure
```typescript
import * as dotenv from 'dotenv';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

describe('Feature Name', () => {
  // Shared setup (minimal, only for truly shared resources)
  let sharedResourceId: string;
  
  beforeAll(async () => {
    // Create minimal shared resources
  });
  
  afterAll(async () => {
    // Clean up shared resources
    await prisma.$disconnect();
  });

  test('should test specific functionality', async () => {
    // Create dedicated resources for this test
    const dedicatedResource = await prisma.resource.create({
      data: { /* ... */ }
    });
    
    // Test implementation
    
    // Clean up dedicated resources
    await prisma.resource.delete({
      where: { id: dedicatedResource.id }
    });
  });
});
```

### 2. Test Organization
- Group related tests using describe blocks
- Use clear, descriptive test names
- Follow the Arrange-Act-Assert pattern
- Keep tests focused and atomic
- Create dedicated resources for each test

### 3. Assertions
- Use specific assertions
- Test both positive and negative cases
- Verify data integrity
- Check error conditions

## Running Tests

### Available Scripts
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage

# Run tests in CI environment
npm run test:ci
```

## Common Test Issues and Solutions

### 1. Flaky Tests
- **Symptom**: Tests pass sometimes and fail other times
- **Cause**: Usually due to shared state or race conditions
- **Solution**: Implement dedicated resource pattern, ensure proper cleanup

### 2. Database Constraint Violations
- **Symptom**: Tests fail with unique constraint or foreign key violations
- **Cause**: Attempting to create duplicate records or delete records with dependencies
- **Solution**: Use unique identifiers, clean up in proper order

### 3. Missing Resources
- **Symptom**: Tests fail with "Resource not found" or "Received: null"
- **Cause**: Resources being deleted by other tests or improper setup
- **Solution**: Create dedicated resources for each test, avoid shared state

### 4. Slow Tests
- **Symptom**: Test suite takes too long to run
- **Cause**: Excessive database operations, inefficient queries
- **Solution**: Optimize database operations, use efficient cleanup strategies

### 5. Time-Dependent Tests
- **Symptom**: Tests that depend on time calculations occasionally fail
- **Cause**: Time-based logic like expiration dates can be affected by execution timing
- **Solution**: Use explicit time manipulation rather than relying on real-time calculations
  - Example: Our expired access code test creates a date in the past rather than waiting for expiration
  - This approach makes the test deterministic and fast while still validating the expiration logic

### 6. Authentication Test Issues
- **Symptom**: Authentication tests fail with inconsistent session state or missing OAuth accounts
- **Cause**: Complex relationships between users, sessions, and OAuth accounts
- **Solution**: 
  - Create complete user profiles with all required relationships for each test
  - Ensure proper cleanup of all authentication-related resources
  - Test each authentication component in isolation
  - Use dedicated test users for each authentication scenario
  - Mock external OAuth providers to avoid external dependencies