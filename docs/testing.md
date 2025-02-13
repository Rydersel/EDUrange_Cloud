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
  // Setup shared resources
  beforeAll(async () => {
    // Create required test data
  });

  // Clean up after all tests
  afterAll(async () => {
    // Clean up in correct order (respect foreign key constraints)
    await prisma.$disconnect();
  });

  // Per-test setup if needed
  beforeEach(async () => {
    // Setup test-specific data
  });

  // Per-test cleanup
  afterEach(async () => {
    // Clean up test-specific data
  });

  test('should do something specific', async () => {
    // Test implementation
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
- Use unique identifiers for all test resources
- Prefix test data with 'test-' for easy identification
- Ensure tests don't interfere with each other
- Use separate describe blocks for different features

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
  // Test implementation
});
```

### 2. Test Organization
- Group related tests using describe blocks
- Use clear, descriptive test names
- Follow the Arrange-Act-Assert pattern
- Keep tests focused and atomic

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

## Best Practices for New Tests

1. **Naming Conventions**
   - Use descriptive test names that explain the behavior
   - Follow the pattern: "should [expected behavior] when [condition]"

2. **Data Management**
   - Create unique test data for each test
   - Clean up all created data after tests
   - Use helper functions for common operations

3. **Isolation**
   - Ensure tests can run independently
   - Avoid dependencies between tests
   - Clean up all side effects

4. **Maintainability**
   - Keep tests simple and focused
   - Use helper functions for common operations
   - Document complex test scenarios

5. **Performance**
   - Minimize database operations
   - Use beforeAll for shared setup
   - Clean up data efficiently 