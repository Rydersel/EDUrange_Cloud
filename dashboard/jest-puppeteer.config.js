// jest-puppeteer.config.js
module.exports = {
  launch: {
    headless: 'new',
    args: [
      '--no-sandbox', 
      '--disable-setuid-sandbox',
      // Allow running JavaScript from file URLs (needed for localStorage)
      '--allow-file-access-from-files',
      // Disable web security to allow localStorage in tests
      '--disable-web-security'
    ],
  },
  server: {
    command: 'npm run dev',
    port: 3000,
    launchTimeout: 60000, // 60 seconds
    debug: true,
  },
} 