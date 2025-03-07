// This file is used to set up the environment for Puppeteer tests
import { Browser, Page } from 'puppeteer';
import { UserRole, PrismaClient, ChallengeDifficulty } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';

// Create a test secret for JWT signing in tests
// This should match the NEXTAUTH_SECRET in your .env file for tests to work
const TEST_SECRET = process.env.NEXTAUTH_SECRET || 'test-secret-for-e2e-tests';

// Initialize Prisma client for database operations
const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

// Store test data references for cleanup
const testData = {
  users: [] as string[],
  competitions: [] as string[],
  accessCodes: [] as string[],
  challenges: [] as string[],
  groupChallenges: [] as string[]
};

// Helper function to create a proper JWT token for NextAuth
function createNextAuthToken(role: UserRole = UserRole.STUDENT, userId?: string): string {
  // Use provided userId or create a new one
  const id = userId || uuidv4();
  
  // Create a JWT payload that matches what NextAuth expects
  const payload = {
    name: `Test ${role} User`,
    email: `test-${id}@example.com`,
    picture: null,
    sub: id, // NextAuth uses 'sub' for the user ID in JWT
    id: id,  // We also include id directly
    role: role,  // Include the user role
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 1 day from now
    jti: uuidv4() // JWT ID
  };
  
  // Sign the JWT with the secret
  return jwt.sign(payload, TEST_SECRET);
}

// Helper function to create an expired JWT token
function createExpiredToken(): string {
  const userId = uuidv4();
  
  const payload = {
    name: 'Test Expired User',
    email: `test-expired@example.com`,
    picture: null,
    sub: userId,
    id: userId,
    role: UserRole.STUDENT,
    iat: Math.floor(Date.now() / 1000) - (48 * 60 * 60), // 2 days ago
    exp: Math.floor(Date.now() / 1000) - (24 * 60 * 60), // 1 day ago (expired)
    jti: uuidv4()
  };
  
  return jwt.sign(payload, TEST_SECRET);
}

// Create a real user in the database
export async function createTestUser(role: UserRole = UserRole.STUDENT): Promise<string> {
  const userId = uuidv4();
  const email = `test-${userId}@example.com`;
  
  try {
    console.log(`Creating test user with role ${role}...`);
    const user = await prisma.user.create({
      data: {
        id: userId,
        name: `Test ${role} User`,
        email: email,
        role: role,
      }
    });
    
    // Store user ID for cleanup
    testData.users.push(user.id);
    console.log(`Created test user with ID: ${user.id}`);
    
    return user.id;
  } catch (error) {
    console.error('Error creating test user:', error);
    throw error;
  }
}

// Create a real competition in the database
export async function createTestCompetition(adminId: string, name?: string): Promise<string> {
  const competitionName = name || `Test Competition ${Date.now()}`;
  
  try {
    console.log(`Creating test competition "${competitionName}" with admin ${adminId}...`);
    const competition = await prisma.competitionGroup.create({
      data: {
        name: competitionName,
        description: 'Test competition created for E2E tests',
        startDate: new Date(),
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
        instructors: {
          connect: { id: adminId }
        }
      }
    });
    
    // Store competition ID for cleanup
    testData.competitions.push(competition.id);
    console.log(`Created test competition with ID: ${competition.id}`);
    
    return competition.id;
  } catch (error) {
    console.error('Error creating test competition:', error);
    throw error;
  }
}

// Create a real access code for a competition
export async function createTestAccessCode(competitionId: string, adminId: string): Promise<string> {
  // Generate a random 6-character access code
  const code = Math.random().toString(36).substring(2, 8).toUpperCase();
  
  try {
    console.log(`Creating test access code for competition ${competitionId}...`);
    
    // First verify that the competition exists
    let competition = await prisma.competitionGroup.findUnique({
      where: { id: competitionId }
    });
    
    // If competition doesn't exist, create a new one
    if (!competition) {
      console.log(`Competition with ID ${competitionId} not found, creating a new one...`);
      const newCompetitionId = await createTestCompetition(adminId);
      competition = await prisma.competitionGroup.findUnique({
        where: { id: newCompetitionId }
      });
      
      if (!competition) {
        throw new Error(`Failed to create a new competition`);
      }
      
      // Use the new competition ID
      competitionId = newCompetitionId;
    }
    
    console.log(`Verified competition exists: ${competition.name} (${competitionId})`);
    
    const accessCode = await prisma.competitionAccessCode.create({
      data: {
        code: code,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 1 day from now
        maxUses: 10,
        groupId: competitionId,
        createdBy: adminId
      }
    });
    
    // Store access code ID for cleanup
    testData.accessCodes.push(accessCode.id);
    console.log(`Created test access code: ${accessCode.code} with ID: ${accessCode.id}`);
    
    return accessCode.code;
  } catch (error) {
    console.error('Error creating test access code:', error);
    throw error;
  }
}

// Get challenge types from the database
export async function getFirstChallengeType(): Promise<string> {
  try {
    console.log('Fetching challenge types from database...');
    const challengeTypes = await prisma.challengeType.findMany({
      take: 1
    });
    
    if (challengeTypes.length === 0) {
      console.log('No challenge types found, creating a default one...');
      const defaultType = await prisma.challengeType.create({
        data: {
          id: 'ctf',
          name: 'Capture The Flag',
        }
      });
      return defaultType.id;
    }
    
    console.log(`Found challenge type: ${challengeTypes[0].id}`);
    return challengeTypes[0].id;
  } catch (error) {
    console.error('Error getting challenge type:', error);
    throw error;
  }
}

// Create a test challenge and add it to a competition
export async function createTestChallenge(competitionId: string): Promise<string> {
  try {
    // First verify that the competition exists
    const competition = await prisma.competitionGroup.findUnique({
      where: { id: competitionId }
    });
    
    if (!competition) {
      console.log(`Competition with ID ${competitionId} not found, creating a new one...`);
      // Create a new competition if the provided one doesn't exist
      const adminUser = await prisma.user.findFirst({
        where: { role: 'ADMIN' }
      });
      
      if (!adminUser) {
        throw new Error('No admin user found to create a competition');
      }
      
      // Create a new competition
      const newCompetition = await prisma.competitionGroup.create({
        data: {
          name: `Test Competition ${Date.now()}`,
          description: 'Test competition created for E2E tests',
          startDate: new Date(),
          endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
          instructors: {
            connect: { id: adminUser.id }
          }
        }
      });
      
      // Store competition ID for cleanup
      testData.competitions.push(newCompetition.id);
      console.log(`Created new test competition with ID: ${newCompetition.id}`);
      
      // Use the new competition ID
      competitionId = newCompetition.id;
    } else {
      console.log(`Verified competition exists: ${competition.name} (${competitionId})`);
    }
    
    // Get a challenge type
    const challengeTypeId = await getFirstChallengeType();
    
    // Create the challenge
    const challenge = await prisma.challenges.create({
      data: {
        name: `Test Challenge ${Date.now()}`,
        description: 'Test challenge created for E2E tests',
        difficulty: ChallengeDifficulty.EASY,
        challengeTypeId: challengeTypeId,
        challengeImage: 'test-image.png', // Add the required field
      }
    });
    
    console.log(`Created challenge with ID: ${challenge.id}`);
    
    // Then add it to the competition
    const groupChallenge = await prisma.groupChallenge.create({
      data: {
        challengeId: challenge.id,
        groupId: competitionId,
        points: 100
      }
    });
    
    console.log(`Added challenge to competition with groupChallenge ID: ${groupChallenge.id}`);
    
    // Store challenge ID for cleanup
    testData.challenges.push(challenge.id);
    // Store groupChallenge ID for cleanup
    testData.groupChallenges.push(groupChallenge.id);
    
    return challenge.id;
  } catch (error) {
    console.error('Error creating test challenge:', error);
    throw error;
  }
}

// Helper function to simulate GitHub login by setting a JWT token cookie
export async function mockGitHubLogin(page: Page, userId?: string): Promise<string> {
  console.log('Mocking GitHub login with student role...');
  
  // Create a real user in the database if userId is not provided
  const realUserId = userId || await createTestUser(UserRole.STUDENT);
  
  // Navigate to the signin page first
  await page.goto('http://localhost:3000/signin');
  
  // Create a JWT token for a student user
  const token = createNextAuthToken(UserRole.STUDENT, realUserId);
  
  // Set the session cookie
  await page.setCookie({
    name: 'next-auth.session-token',
    value: token,
    domain: 'localhost',
    path: '/',
    httpOnly: false, // Make it accessible to JavaScript in tests
    secure: false,   // Allow non-HTTPS in development
    sameSite: 'Lax',
  });
  
  // Also set a CSRF token cookie (required by NextAuth)
  await page.setCookie({
    name: 'next-auth.csrf-token',
    value: `${uuidv4()}|${uuidv4()}`,
    domain: 'localhost',
    path: '/',
    httpOnly: false,
    secure: false,
    sameSite: 'Lax',
  });
  
  // Refresh the page to simulate being logged in
  await page.reload({ waitUntil: 'networkidle0' });
  
  // Wait a bit to ensure the session is processed
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 1000)));
  
  // Debug: Log the cookies to verify they were set
  const cookies = await page.cookies();
  console.log('Cookies after login:', cookies.map(c => c.name));
  
  // Debug: Check session data
  await page.evaluate(() => {
    console.log('Full Session Data:', window.sessionStorage);
    const session = JSON.parse(window.sessionStorage.getItem('session') || '{}');
    console.log('Session User:', session.user);
    console.log('Session Status:', session.status);
    if (session.user) {
      console.log('User Role:', session.user.role);
      console.log('Is Admin or Instructor:', session.user.role === 'ADMIN' || session.user.role === 'INSTRUCTOR');
    }
  });
  
  return realUserId;
}

// Helper function to simulate admin login
export async function mockAdminLogin(page: Page, userId?: string): Promise<string> {
  console.log('Mocking admin login...');
  
  // Create a real admin user in the database if userId is not provided
  const realUserId = userId || await createTestUser(UserRole.ADMIN);
  
  // Navigate to the signin page first
  await page.goto('http://localhost:3000/signin');
  
  // Create a JWT token for an admin user
  const token = createNextAuthToken(UserRole.ADMIN, realUserId);
  
  // Set the session cookie
  await page.setCookie({
    name: 'next-auth.session-token',
    value: token,
    domain: 'localhost',
    path: '/',
    httpOnly: false, // Make it accessible to JavaScript in tests
    secure: false,   // Allow non-HTTPS in development
    sameSite: 'Lax',
  });
  
  // Also set a CSRF token cookie (required by NextAuth)
  await page.setCookie({
    name: 'next-auth.csrf-token',
    value: `${uuidv4()}|${uuidv4()}`,
    domain: 'localhost',
    path: '/',
    httpOnly: false,
    secure: false,
    sameSite: 'Lax',
  });
  
  // Refresh the page to simulate being logged in
  await page.reload({ waitUntil: 'networkidle0' });
  
  // Wait a bit to ensure the session is processed
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 1000)));
  
  // Debug: Log the cookies to verify they were set
  const cookies = await page.cookies();
  console.log('Cookies after admin login:', cookies.map(c => c.name));
  
  // Debug: Check session data
  await page.evaluate(() => {
    console.log('Full Session Data:', window.sessionStorage);
    const session = JSON.parse(window.sessionStorage.getItem('session') || '{}');
    console.log('Session User:', session.user);
    console.log('Session Status:', session.status);
    if (session.user) {
      console.log('User Role:', session.user.role);
      console.log('Is Admin or Instructor:', session.user.role === 'ADMIN' || session.user.role === 'INSTRUCTOR');
    }
  });
  
  return realUserId;
}

// Helper function to check if user is logged in
export async function isLoggedIn(page: Page): Promise<boolean> {
  const cookies = await page.cookies();
  return cookies.some(cookie => cookie.name === 'next-auth.session-token');
}

// Helper function to simulate logout
export async function logout(page: Page): Promise<void> {
  console.log('Logging out...');
  
  // Clear all cookies
  const client = await page.target().createCDPSession();
  await client.send('Network.clearBrowserCookies');
  
  // Navigate to the home page to ensure the session is reset
  await page.goto('http://localhost:3000/');
  
  // Verify cookies are cleared
  const remainingCookies = await page.cookies();
  console.log('Cookies after logout:', remainingCookies.map(c => c.name));
}

// Helper function to create an expired session
export async function setExpiredSession(page: Page): Promise<void> {
  console.log('Setting expired session...');
  
  // Navigate to the signin page first
  await page.goto('http://localhost:3000/signin');
  
  // Create an expired JWT token
  const token = createExpiredToken();
  
  // Set the expired session cookie
  await page.setCookie({
    name: 'next-auth.session-token',
    value: token,
    domain: 'localhost',
    path: '/',
    httpOnly: false,
    secure: false,
    sameSite: 'Lax',
  });
  
  // Also set a CSRF token cookie
  await page.setCookie({
    name: 'next-auth.csrf-token',
    value: `${uuidv4()}|${uuidv4()}`,
    domain: 'localhost',
    path: '/',
    httpOnly: false,
    secure: false,
    sameSite: 'Lax',
  });
  
  // Refresh the page
  await page.reload({ waitUntil: 'networkidle0' });
  
  // Wait a bit to ensure the session is processed
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 500)));
}

// Helper function to join a competition using an access code
export async function joinCompetition(page: Page, accessCode: string): Promise<void> {
  console.log(`Attempting to join competition with access code: ${accessCode}`);
  
  // Navigate to the competitions page
  await page.goto('http://localhost:3000/competitions', { waitUntil: 'networkidle0' });
  
  // Take a screenshot to help debug
  await page.screenshot({ path: 'join-competition-before.png' });
  
  // First try to find and click a join button to make the form appear
  const joinButtonClicked = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    console.log('All buttons:', buttons.map(b => ({ text: b.textContent, className: b.className })));
    
    const joinButton = buttons.find(button => 
      button.textContent?.toLowerCase().includes('join') ||
      button.textContent?.toLowerCase().includes('enter') ||
      button.textContent?.toLowerCase().includes('access')
    );
    
    if (joinButton) {
      console.log('Found join button:', joinButton.textContent);
      joinButton.click();
      return true;
    }
    
    console.log('No join button found');
    return false;
  });
  
  if (joinButtonClicked) {
    console.log('Clicked join button, waiting for form to appear');
    // Wait a bit for the form to appear
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 2000)));
  }
  
  // Take a screenshot after clicking join button
  await page.screenshot({ path: 'join-competition-after-button.png' });
  
  // Try to find the form or input field
  const formFound = await page.evaluate(() => {
    // Check for form element
    const form = document.querySelector('form');
    if (form) {
      console.log('Form found');
      return true;
    }
    
    // Check for input fields
    const inputs = Array.from(document.querySelectorAll('input'));
    console.log('All inputs:', inputs.map(i => ({ name: i.name, id: i.id, placeholder: i.placeholder })));
    
    const accessCodeInput = inputs.find(input => 
      input.placeholder?.toLowerCase().includes('code') || 
      input.name?.toLowerCase().includes('code') ||
      input.id?.toLowerCase().includes('code')
    );
    
    if (accessCodeInput) {
      console.log('Access code input found');
      return true;
    }
    
    // Check for form-like elements
    const formLikeElements = document.querySelectorAll('div[role="dialog"], div.modal, div.form');
    console.log('Form-like elements:', formLikeElements.length);
    
    return formLikeElements.length > 0;
  });
  
  if (!formFound) {
    throw new Error('Join competition form not found');
  }
  
  // Find the access code input field and enter the code
  const inputFound = await page.evaluate((code) => {
    console.log('Looking for access code input field...');
    const inputs = Array.from(document.querySelectorAll('input'));
    console.log('Found inputs:', inputs.length);
    inputs.forEach((input, i) => {
      console.log(`Input ${i}:`, input.name, input.id, input.placeholder);
    });
    
    const accessCodeInput = inputs.find(input => 
      input.placeholder?.toLowerCase().includes('code') || 
      input.name?.toLowerCase().includes('code') ||
      input.id?.toLowerCase().includes('code')
    );
    
    if (accessCodeInput) {
      console.log('Found access code input:', accessCodeInput);
      accessCodeInput.value = code;
      const inputEvent = new Event('input', { bubbles: true });
      accessCodeInput.dispatchEvent(inputEvent);
      console.log('Set access code value:', code);
      return true;
    } else {
      console.log('Access code input not found');
      return false;
    }
  }, accessCode);
  
  // Fail if input not found
  if (!inputFound) {
    throw new Error('Access code input field not found');
  }
  
  // Take a screenshot before submitting
  await page.screenshot({ path: 'join-competition-before-submit.png' });
  
  // Submit the form
  const buttonFound = await page.evaluate(() => {
    console.log('Looking for submit button...');
    const submitButton = Array.from(document.querySelectorAll('button')).find(
      button => button.type === 'submit' || 
               button.textContent?.toLowerCase().includes('join') ||
               button.textContent?.toLowerCase().includes('submit')
    );
    
    if (submitButton) {
      console.log('Found submit button:', submitButton.textContent);
      submitButton.click();
      console.log('Clicked submit button');
      return true;
    } else {
      console.log('Submit button not found');
      return false;
    }
  });
  
  // Fail if button not found
  if (!buttonFound) {
    throw new Error('Submit button not found');
  }
  
  // Wait for navigation or response
  try {
    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 });
    console.log('Navigation after join completed');
  } catch (error) {
    console.warn('Navigation after join failed, but continuing');
    // Take a screenshot to help debug
    await page.screenshot({ path: 'join-competition-navigation-failed.png' });
  }
  
  // Take a screenshot after joining
  await page.screenshot({ path: 'join-competition-after.png' });
  
  // Debug: Log the current URL
  console.log('Current URL after join attempt:', page.url());
}

// Setup and teardown hooks for Jest
export async function setupBeforeAll(): Promise<void> {
  // Ensure we have a clean test environment
  console.log('Setting up E2E test environment...');
  await cleanupTestData();
}

export async function teardownAfterAll(): Promise<void> {
  // Clean up all test data
  console.log('Tearing down E2E test environment...');
  await cleanupTestData();
  
  // Disconnect Prisma client
  await prisma.$disconnect();
}

// Helper function to clean up all test data
async function cleanupTestData(): Promise<void> {
  try {
    console.log('Starting test data cleanup...');
    
    // Delete access codes first (they reference competitions)
    if (testData.accessCodes.length > 0) {
      console.log(`Cleaning up ${testData.accessCodes.length} tracked access codes...`);
      await prisma.competitionAccessCode.deleteMany({
        where: {
          id: { in: testData.accessCodes }
        }
      });
      testData.accessCodes = [];
    }
    
    // Delete GroupChallenge records (they reference both challenges and competitions)
    if (testData.groupChallenges.length > 0) {
      console.log(`Cleaning up ${testData.groupChallenges.length} tracked group challenges...`);
      await prisma.groupChallenge.deleteMany({
        where: {
          id: { in: testData.groupChallenges }
        }
      });
      testData.groupChallenges = [];
    }
    
    // Also clean up any GroupChallenge records that reference our challenges
    if (testData.challenges.length > 0) {
      console.log('Cleaning up any group challenges referencing our challenges...');
      await prisma.groupChallenge.deleteMany({
        where: {
          challengeId: { in: testData.challenges }
        }
      });
    }
    
    // Delete challenges
    if (testData.challenges.length > 0) {
      console.log(`Cleaning up ${testData.challenges.length} tracked challenges...`);
      await prisma.challenges.deleteMany({
        where: {
          id: { in: testData.challenges }
        }
      });
      testData.challenges = [];
    }
    
    // Delete competitions (after all references have been removed)
    if (testData.competitions.length > 0) {
      console.log(`Cleaning up ${testData.competitions.length} tracked competitions...`);
      await prisma.competitionGroup.deleteMany({
        where: {
          id: { in: testData.competitions }
        }
      });
      testData.competitions = [];
    }
    
    // Delete users (after all references have been removed)
    if (testData.users.length > 0) {
      console.log(`Cleaning up ${testData.users.length} tracked users...`);
      await prisma.user.deleteMany({
        where: {
          id: { in: testData.users }
        }
      });
      testData.users = [];
    }
    
    // Also clean up any test data that might have been left over from previous runs
    console.log('Cleaning up any leftover test data...');
    
    // Find and delete any leftover test access codes
    const leftoverAccessCodes = await prisma.competitionAccessCode.findMany({
      where: {
        OR: [
          { code: { startsWith: 'TEST' } },
          { code: { in: ['ABCDEF', 'TESTCD', 'TESTIN'] } }, // Common test codes
          { createdBy: { startsWith: 'test-' } }
        ]
      },
      select: { id: true }
    });
    
    if (leftoverAccessCodes.length > 0) {
      console.log(`Found ${leftoverAccessCodes.length} leftover access codes to clean up`);
      await prisma.competitionAccessCode.deleteMany({
        where: {
          id: { in: leftoverAccessCodes.map(code => code.id) }
        }
      });
    }
    
    // Find and delete any leftover group challenges
    const leftoverGroupChallenges = await prisma.groupChallenge.findMany({
      where: {
        OR: [
          { points: 100 }, // Our test group challenges have 100 points
          { 
            challenge: {
              name: { startsWith: 'Test Challenge' }
            }
          },
          {
            group: {
              name: { startsWith: 'Test Competition' }
            }
          }
        ]
      },
      select: { id: true }
    });
    
    if (leftoverGroupChallenges.length > 0) {
      console.log(`Found ${leftoverGroupChallenges.length} leftover group challenges to clean up`);
      await prisma.groupChallenge.deleteMany({
        where: {
          id: { in: leftoverGroupChallenges.map(gc => gc.id) }
        }
      });
    }
    
    // Find and delete any leftover challenges
    const leftoverChallenges = await prisma.challenges.findMany({
      where: {
        name: { startsWith: 'Test Challenge' }
      },
      select: { id: true }
    });
    
    if (leftoverChallenges.length > 0) {
      console.log(`Found ${leftoverChallenges.length} leftover challenges to clean up`);
      await prisma.challenges.deleteMany({
        where: {
          id: { in: leftoverChallenges.map(challenge => challenge.id) }
        }
      });
    }
    
    // Find and delete any leftover competitions
    const leftoverCompetitions = await prisma.competitionGroup.findMany({
      where: {
        name: { startsWith: 'Test Competition' }
      },
      select: { id: true }
    });
    
    if (leftoverCompetitions.length > 0) {
      console.log(`Found ${leftoverCompetitions.length} leftover competitions to clean up`);
      await prisma.competitionGroup.deleteMany({
        where: {
          id: { in: leftoverCompetitions.map(comp => comp.id) }
        }
      });
    }
    
    // Find and delete any leftover test users
    const leftoverUsers = await prisma.user.findMany({
      where: {
        OR: [
          { email: { startsWith: 'test-' } },
          { email: { endsWith: '@test.com' } },
          { name: { startsWith: 'Test User' } }
        ]
      },
      select: { id: true }
    });
    
    if (leftoverUsers.length > 0) {
      console.log(`Found ${leftoverUsers.length} leftover test users to clean up`);
      await prisma.user.deleteMany({
        where: {
          id: { in: leftoverUsers.map(user => user.id) }
        }
      });
    }
    
    console.log('Test data cleanup completed successfully');
  } catch (error) {
    console.error('Error cleaning up test data:', error);
  }
} 