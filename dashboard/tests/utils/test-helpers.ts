import { v4 as uuidv4 } from 'uuid';
import prisma from './prisma-test-client';
import { Prisma } from '@prisma/client';

// Keep track of test runs to ensure unique IDs across parallel test executions
let testRunCounter = 0;

/**
 * Generates a unique test ID with a prefix to ensure it's identifiable as test data
 * @param prefix The prefix to use for the ID
 * @returns A unique ID with the test prefix
 */
export function generateTestId(prefix: string): string {
  testRunCounter++;
  return `test-${prefix}-${Date.now()}-${testRunCounter}-${uuidv4().substring(0, 8)}`;
}

/**
 * Generates a unique email for test users
 * @param prefix The prefix to use for the email
 * @returns A unique email with the test domain
 */
export function generateTestEmail(prefix: string): string {
  testRunCounter++;
  return `${prefix}-${Date.now()}-${testRunCounter}@test.edurange.org`;
}

/**
 * Generates a unique name for test entities
 * @param prefix The prefix to use for the name
 * @returns A unique name with the Test prefix
 */
export function generateTestName(prefix: string): string {
  testRunCounter++;
  return `Test-${prefix}-${Date.now()}-${testRunCounter}`;
}

/**
 * Checks if an ID is a test ID
 * @param id The ID to check
 * @returns True if the ID is a test ID
 */
export function isTestId(id: string): boolean {
  return id.startsWith('test-');
}

/**
 * Checks if an email is a test email
 * @param email The email to check
 * @returns True if the email is a test email
 */
export function isTestEmail(email: string): boolean {
  return email.endsWith('@test.edurange.org');
}

/**
 * Checks if a name is a test name
 * @param name The name to check
 * @returns True if the name is a test name
 */
export function isTestName(name: string): boolean {
  return name.startsWith('Test-');
}

/**
 * Wraps a test function in a database transaction that gets rolled back after the test completes.
 * This provides isolation between tests and eliminates the need for manual cleanup.
 * 
 * @param testFn The test function to execute within a transaction
 * @returns A promise that resolves when the test is complete
 */
export const withTestTransaction = async (testFn: (tx: any) => Promise<void>): Promise<void> => {
  // Add a small delay between transactions to reduce deadlock probability
  await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
  
  // Create a transaction with a specific isolation level
  // We use a lower isolation level to avoid deadlocks
  const options = { 
    timeout: 30000, // 30 second timeout for the transaction
    maxWait: 5000,  // Maximum time to wait for the transaction to start
    isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted // Use a less strict isolation level to avoid deadlocks
  };

  try {
    // Use a simpler approach - just run the test in a transaction and force a rollback
    await prisma.$transaction(async (txClient) => {
      // Execute the test function
      await testFn(txClient);
      
      // Always throw an error to force rollback
      throw new Error('FORCE_ROLLBACK');
    }, options);
  } catch (error: any) {
    // Ignore our intentional rollback error
    if (error.message === 'FORCE_ROLLBACK') {
      return;
    }
    
    // Handle deadlock errors by retrying once
    if (error.code === 'P2034') { // Transaction deadlock error
      console.warn('Transaction deadlock detected, retrying...');
      // Wait a bit longer before retrying
      await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 500));
      
      // Retry the transaction once
      try {
        await prisma.$transaction(async (txClient) => {
          await testFn(txClient);
          // Always throw an error to force rollback
          throw new Error('FORCE_ROLLBACK');
        }, options);
      } catch (retryError: any) {
        // Ignore our intentional rollback error
        if (retryError.message === 'FORCE_ROLLBACK') {
          return;
        }
        throw retryError;
      }
    } else {
      // Rethrow any other errors
      throw error;
    }
  }
}; 