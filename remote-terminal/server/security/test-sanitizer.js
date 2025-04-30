/**
 * Test Script for Security Module
 * 
 * Run with: node test-sanitizer.js
 * 
 * This script tests all the security modules and their functions:
 * - Input sanitization
 * - Security tracking
 * - Input validation
 */

// Import the unified security module
const security = require('./index');

console.log('========== Testing Input Sanitizer Module ==========');

// Define test cases
const testCases = [
  {
    name: "Normal command",
    input: "ls -la",
    expectDangerous: false,
    expectSanitized: false
  },
  {
    name: "Command with ANSI color (should be preserved)",
    input: "\x1b[31mRed Text\x1b[0m",
    expectDangerous: false,
    expectSanitized: false
  },
  {
    name: "Terminal reset attack",
    input: "\x1bc clear && echo HACKED",
    expectDangerous: true,
    expectSanitized: true
  },
  {
    name: "Window title manipulation",
    input: "\x1b]0;Hacked System\x07",
    expectDangerous: true,
    expectSanitized: true
  },
  {
    name: "Keyboard remapping",
    input: "\x1b[1;2p",
    expectDangerous: true,
    expectSanitized: true
  },
  {
    name: "Device control sequence",
    input: "\x1b[?25l",
    expectDangerous: true,
    expectSanitized: true
  },
  {
    name: "Multiple escape sequences mixed with valid content",
    input: "ls \x1bc \x1b]0;Hacked\x07 -la /etc/passwd",
    expectDangerous: true,
    expectSanitized: true
  }
];

// Run tests
let passCount = 0;
let failCount = 0;

testCases.forEach(test => {
  console.log(`\nTest: ${test.name}`);
  console.log(`Input: ${JSON.stringify(test.input)}`);
  
  // Test danger detection
  const isDangerous = security.containsDangerousSequences(test.input);
  console.log(`Detected as dangerous: ${isDangerous}`);
  
  // Test sanitization
  const sanitized = security.sanitizeTerminalInput(test.input);
  const wasSanitized = sanitized !== test.input;
  console.log(`Sanitized: ${JSON.stringify(sanitized)}`);
  console.log(`Was modified: ${wasSanitized}`);
  
  // Check if results match expectations
  const dangerDetectionCorrect = isDangerous === test.expectDangerous;
  const sanitizationCorrect = wasSanitized === test.expectSanitized;
  
  if (dangerDetectionCorrect && sanitizationCorrect) {
    console.log("PASS: Detection and sanitization working as expected");
    passCount++;
  } else {
    console.log("FAIL: Detection or sanitization not matching expectations");
    failCount++;
  }
});

console.log(`\n========== Input Sanitizer Test Results ==========`);
console.log(`Passed: ${passCount}/${testCases.length}, Failed: ${failCount}/${testCases.length}`);

console.log('\n========== Testing Security Tracker Module ==========');

// Test suspicious activity tracking
console.log('\nTesting activity tracking:');
const testIP = '192.168.1.100';
security.logSuspiciousInput('\x1bc clear && echo HACKED', { 
  sessionId: 'test_session',
  clientIP: testIP
});

const securityRecord = security.securityTracker.getClientRecord(testIP);
console.log('Security Record:', securityRecord);

console.log('\n========== Testing Input Validation Module ==========');

// Test pod/container name validation
console.log('\nTesting pod/container validation:');
const validPodResult = security.validateTerminalParams('valid-pod-name', 'valid-container');
console.log('Valid pod/container validation result:', validPodResult);

const invalidPodResult = security.validateTerminalParams('invalid;pod;name', 'valid-container');
console.log('Invalid pod validation result:', invalidPodResult);

// Test resize validation
console.log('\nTesting resize parameter validation:');
const validResizeResult = security.validateResizeParams(80, 24);
console.log('Valid resize validation result:', validResizeResult);

const invalidResizeResult = security.validateResizeParams(null, 'abc');
console.log('Invalid resize validation result:', invalidResizeResult);

// Test input data validation
console.log('\nTesting input data validation:');
const validInputResult = security.validateInputData('ls -la');
console.log('Valid input validation result:', validInputResult);

const invalidInputResult = security.validateInputData(null);
console.log('Invalid input validation result:', invalidInputResult);

console.log('\n========== All Security Module Tests Complete =========='); 