import { Browser, Page } from 'puppeteer';
import { mockGitHubLogin, mockAdminLogin, isLoggedIn, logout, setExpiredSession, setupBeforeAll, teardownAfterAll } from './setup';

// Add the browser global declaration for jest-puppeteer
declare const browser: Browser;

describe('Authentication Middleware Tests', () => {
  let page: Page;
  const baseUrl = 'http://localhost:3000';

  beforeAll(async () => {
    await setupBeforeAll();
    page = await browser.newPage();
    page.setDefaultNavigationTimeout(30000);
    page.on('console', (msg) => console.log('BROWSER CONSOLE:', msg.text()));
  });

  afterAll(async () => {
    await page.close();
    await teardownAfterAll();
  });

  beforeEach(async () => {
    // Clear cookies before each test
    const cookies = await page.cookies();
    if (cookies.length > 0) {
      await logout(page);
    }
  });

  describe('Student User Access', () => {
    beforeEach(async () => {
      // Log in as a student user before each test in this describe block
      await mockGitHubLogin(page);

      // Verify login was successful
      const loggedIn = await isLoggedIn(page);
      expect(loggedIn).toBe(true);
    });

    test('should redirect from admin dashboard to invalid-permission', async () => {
      await page.goto(`${baseUrl}/dashboard`);
      // Wait for redirect to complete
      await page.waitForNavigation({ waitUntil: 'networkidle0' });

      // Should be redirected to invalid-permission page
      expect(page.url()).toContain(`${baseUrl}/invalid-permission`);
    });
  });

  describe('Unauthenticated User Access', () => {
    // No login is performed for these tests
    
    test('should redirect from profile to home page', async () => {
      await page.goto(`${baseUrl}/profile`, { waitUntil: 'networkidle0' });
      // Based on the actual behavior, it redirects to home page
      expect(page.url()).toBe(`${baseUrl}/`);
    });
    
    test('should redirect from dashboard to home page', async () => {
      await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle0' });
      // Should be redirected to home page
      expect(page.url()).toBe(`${baseUrl}/`);
    });
  });

  describe('Admin User Access', () => {
    beforeEach(async () => {
      // Log in as an admin user before each test in this describe block
      await mockAdminLogin(page);

      // Verify login was successful
      const loggedIn = await isLoggedIn(page);
      expect(loggedIn).toBe(true);
    });

    test('should not redirect from profile page', async () => {
      await page.goto(`${baseUrl}/profile`, { waitUntil: 'networkidle0' });
      expect(page.url()).toBe(`${baseUrl}/profile`);
    });

    test('should allow access to admin dashboard', async () => {
      await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle0' });
      // No redirect should happen
      expect(page.url()).toBe(`${baseUrl}/dashboard`);
    });

    test('should allow access to admin-only pages', async () => {
      await page.goto(`${baseUrl}/dashboard/users`, { waitUntil: 'networkidle0' });
      // No redirect should happen
      expect(page.url()).toBe(`${baseUrl}/dashboard/users`);
    });
  });

  describe('Logout Behavior', () => {
    test('should redirect to home after logout', async () => {
      // First login
      await mockGitHubLogin(page);

      // Verify login was successful
      let loggedIn = await isLoggedIn(page);
      expect(loggedIn).toBe(true);

      // Now simulate logout by clearing the session
      await logout(page);
      
      // Wait a bit to ensure the session is cleared
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Try to access a protected route
      await page.goto(`${baseUrl}/profile`);
      
      // Wait for navigation to complete
      try {
        await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 5000 });
      } catch (error) {
        console.log('Navigation timeout, checking URL anyway');
      }

      // Should be redirected to home page (actual behavior)
      expect(page.url()).toBe(`${baseUrl}/`);
    }, 60000); // Increase timeout for this test
  });

  describe('Session Expiry', () => {
    test('should redirect to home when session expires', async () => {
      // Set an expired session cookie
      await setExpiredSession(page);
      
      // Wait a bit to ensure the session is processed
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Try to access a protected route
      await page.goto(`${baseUrl}/profile`);

      // Wait for navigation to complete
      try {
        await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 5000 });
      } catch (error) {
        console.log('Navigation timeout, checking URL anyway');
      }

      // Should be redirected to home page (actual behavior)
      expect(page.url()).toBe(`${baseUrl}/`);

    }, 60000); // Increase timeout for this test
  });
});

